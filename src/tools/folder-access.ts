import { open, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { ValidationError } from '../errors/index.js';
import { clip, decodeUtf8Prefix } from './bounded-text.js';
import {
  DEFAULT_TEXT_EXTENSIONS,
  type FileContent,
  type FolderEntry,
  type FolderLimits,
  type FolderOptions,
  type SearchMatch,
  folderLimits,
} from './folder-options.js';
import { globToRegExp, matchesAny } from './glob-pattern.js';

/** Set when a walk stopped at `maxExaminedEntries` before the end of the tree. */
interface WalkState {
  exhausted: boolean;
}

interface WalkedFile {
  path: string;
  real: string;
  size: number;
}

/**
 * Read-only access to one folder. Every path is resolved to its real location (symbolic
 * links followed) and refused if it leaves the folder; hidden and excluded paths, and files
 * with other extensions, behave as if they did not exist.
 */
export class FolderAccess {
  readonly name: string;
  private readonly root: string;
  private rootReal?: Promise<string>;
  private readonly extensions: Set<string>;
  private readonly include: RegExp[];
  private readonly exclude: RegExp[];
  readonly limits: FolderLimits;

  constructor(private readonly options: FolderOptions) {
    this.root = resolve(options.root);
    this.name = options.name ?? (basename(this.root) || 'folder');
    this.extensions = new Set(
      (options.extensions ?? DEFAULT_TEXT_EXTENSIONS).map((ext) =>
        ext.replace(/^\./, '').toLowerCase()
      )
    );
    this.include = (options.include ?? []).map(globToRegExp);
    this.exclude = (options.exclude ?? []).map(globToRegExp);
    this.limits = folderLimits(options);
  }

  /** Lists a folder (the root by default), bounded by `maxEntries`. */
  async list(
    path = '',
    recursive = false
  ): Promise<{ entries: FolderEntry[]; truncated: boolean }> {
    const start = await this.locate(path, 'directory');
    const entries: FolderEntry[] = [];
    const walk: WalkState = { exhausted: false };
    const depth = recursive ? this.limits.maxDepth : 0;
    for await (const entry of this.walk(start.path, depth, true, walk)) {
      if (entries.length >= this.limits.maxEntries) {
        return { entries, truncated: true };
      }
      entries.push(
        entry.type === 'file'
          ? { path: entry.path, type: 'file', size: entry.size }
          : { path: entry.path, type: 'directory' }
      );
    }
    return { entries, truncated: walk.exhausted };
  }

  /** Every offered file, bounded by `maxEntries` (used to list resources). */
  async files(): Promise<{ files: WalkedFile[]; truncated: boolean }> {
    const files: WalkedFile[] = [];
    const walk: WalkState = { exhausted: false };
    for await (const entry of this.walk('', this.limits.maxDepth, false, walk)) {
      if (entry.type !== 'file') continue;
      if (files.length >= this.limits.maxEntries) return { files, truncated: true };
      files.push(entry);
    }
    return { files, truncated: walk.exhausted };
  }

  /** Reads a text file, cut at `maxFileBytes`. Binary files are refused. */
  async read(path: string): Promise<FileContent> {
    const file = await this.locate(path, 'file');
    const { text, truncated } = await this.readText(file.real, file.size);
    return { path: file.path, size: file.size, content: text, truncated };
  }

  /** Case-insensitive substring search, bounded by `maxMatches` and `maxSearchBytes`. */
  async search(
    query: string,
    path = ''
  ): Promise<{ matches: SearchMatch[]; filesScanned: number; truncated: boolean }> {
    const needle = query.toLowerCase();
    const start = await this.locate(path, 'directory');
    const matches: SearchMatch[] = [];
    let budget = this.limits.maxSearchBytes;
    let filesScanned = 0;
    const walk: WalkState = { exhausted: false };
    for await (const entry of this.walk(start.path, this.limits.maxDepth, false, walk)) {
      if (entry.type !== 'file') continue;
      if (budget <= 0) return { matches, filesScanned, truncated: true };
      const { text } = await this.readText(entry.real, entry.size).catch(() => ({ text: '' }));
      budget -= Math.min(entry.size, this.limits.maxFileBytes);
      filesScanned++;
      const lines = text.split(/\r?\n/);
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? '';
        if (!line.toLowerCase().includes(needle)) continue;
        if (matches.length >= this.limits.maxMatches) {
          return { matches, filesScanned, truncated: true };
        }
        matches.push({ path: entry.path, line: index + 1, text: clip(line.trim(), 200) });
      }
    }
    return { matches, filesScanned, truncated: walk.exhausted };
  }

  /** Resolves a relative path to an offered file or folder, or throws as if it did not exist. */
  async locate(
    path: string,
    expected: 'file' | 'directory'
  ): Promise<{ path: string; real: string; size: number }> {
    const cleaned = path
      .replace(/\\/g, '/')
      .replace(/^\.\/+/, '')
      .replace(/\/+$/, '');
    if (cleaned.includes('\0') || isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned)) {
      throw new ValidationError('path', 'use a path relative to the shared folder');
    }
    const rootReal = await this.realRoot();
    const lexical = resolve(this.root, cleaned);
    if (!inside(this.root, lexical)) {
      throw new ValidationError('path', `"${path}" is outside the shared folder`);
    }
    const real = await realpath(lexical).catch(() => undefined);
    if (real === undefined) {
      throw new ValidationError('path', `"${path}" was not found`);
    }
    if (!inside(rootReal, real)) {
      throw new ValidationError('path', `"${path}" is outside the shared folder`);
    }
    const shown = toPosix(relative(this.root, lexical));
    const info = await stat(real);
    const type = info.isDirectory() ? 'directory' : info.isFile() ? 'file' : undefined;
    const visible =
      type === expected &&
      this.offered(shown, type) &&
      this.offered(toPosix(relative(rootReal, real)), type);
    if (!visible) {
      throw new ValidationError('path', `"${path}" was not found`);
    }
    return { path: shown, real, size: info.size };
  }

  private async *walk(
    start: string,
    depth: number,
    withDirectories: boolean,
    state: WalkState
  ): AsyncGenerator<({ type: 'file' } & WalkedFile) | { type: 'directory'; path: string }> {
    const rootReal = await this.realRoot();
    const visited = new Set<string>();
    const queue: Array<{ path: string; depth: number }> = [{ path: start, depth }];
    let examined = 0;
    for (let next = queue.shift(); next; next = queue.shift()) {
      const folderReal = await realpath(resolve(this.root, next.path)).catch(() => undefined);
      if (!folderReal || visited.has(folderReal) || !inside(rootReal, folderReal)) continue;
      visited.add(folderReal);
      const names = await readdir(folderReal).catch(() => undefined);
      if (!names) {
        // An unreadable sub-folder is skipped; the folder asked for must be readable.
        if (next.path === start) throw new ValidationError('path', `"${start}" cannot be read`);
        continue;
      }
      for (const name of names.sort()) {
        // A hard stop for huge trees, whatever the other limits.
        if (++examined > this.limits.maxExaminedEntries) {
          state.exhausted = true;
          return;
        }
        const path = next.path ? `${next.path}/${name}` : name;
        const real = await realpath(resolve(folderReal, name)).catch(() => undefined);
        if (!real || !inside(rootReal, real)) continue;
        const target = toPosix(relative(rootReal, real));
        const info = await stat(real).catch(() => undefined);
        const type = info?.isDirectory() ? 'directory' : info?.isFile() ? 'file' : undefined;
        // Both the path shown and the real location (behind a link) must be offered.
        if (!info || !type || !this.offered(path, type) || !this.offered(target, type)) continue;
        if (type === 'directory') {
          // A link back to a folder already explored (a cycle) leads nowhere new.
          if (visited.has(real)) continue;
          if (withDirectories) yield { type: 'directory', path };
          if (next.depth > 0) queue.push({ path, depth: next.depth - 1 });
        } else {
          yield { type: 'file', path, real, size: info.size };
        }
      }
    }
  }

  private offered(path: string, type: 'file' | 'directory'): boolean {
    if (path === '') return type === 'directory';
    const segments = path.split('/');
    if (!this.options.includeHidden && segments.some((segment) => segment.startsWith('.'))) {
      return false;
    }
    // Excluding a folder hides everything inside it, whatever way it is reached.
    for (let length = 1; length <= segments.length; length++) {
      if (matchesAny(segments.slice(0, length).join('/'), this.exclude)) return false;
    }
    if (type === 'directory') return true;
    const extension = extname(path).replace(/^\./, '').toLowerCase();
    if (!this.extensions.has(extension)) return false;
    return this.include.length === 0 || matchesAny(path, this.include);
  }

  private async readText(
    real: string,
    size: number
  ): Promise<{ text: string; truncated: boolean }> {
    const length = Math.min(size, this.limits.maxFileBytes);
    const handle = await open(real, 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      const bytes = buffer.subarray(0, bytesRead);
      if (bytes.subarray(0, 8_000).includes(0)) {
        throw new ValidationError('path', 'binary files are not offered');
      }
      return { text: decodeUtf8Prefix(bytes), truncated: size > length };
    } finally {
      await handle.close();
    }
  }

  private realRoot(): Promise<string> {
    // A failure is not kept (the folder may be created later), and the message does not
    // show the absolute path, which clients would otherwise learn.
    this.rootReal ??= realpath(this.root).catch(() => {
      this.rootReal = undefined;
      throw new ValidationError('root', `the shared folder "${this.name}" does not exist`);
    });
    return this.rootReal;
  }
}

function inside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function toPosix(path: string): string {
  return path.split(sep).join('/');
}
