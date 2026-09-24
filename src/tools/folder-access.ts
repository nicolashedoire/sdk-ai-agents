import { open, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { ValidationError } from '../errors/index.js';
import { clip, decodeUtf8Prefix } from './bounded-text.js';
import { globToRegExp, matchesAny } from './glob-pattern.js';

/** Extensions read by default: text formats only. */
// biome-ignore format: a compact table is easier to review than one extension per line
export const DEFAULT_TEXT_EXTENSIONS: readonly string[] = [
  'md', 'markdown', 'mdx', 'txt', 'text', 'rst', 'adoc', 'org', 'csv', 'tsv', 'json', 'jsonl',
  'yaml', 'yml', 'toml', 'ini', 'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'ts',
  'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php',
  'sh', 'sql', 'graphql', 'proto', 'tex', 'log',
];

export interface FolderOptions {
  /** The folder to share. Nothing outside it can be listed or read, symbolic links included. */
  root: string;
  /** Name used in tool descriptions and resource URIs. Defaults to the folder's name. */
  name?: string;
  /** Extensions of the files offered (without the dot). `''` allows files without one. */
  extensions?: readonly string[];
  /** Globs of files to offer (`**∕*.md`); by default every file with an allowed extension. */
  include?: readonly string[];
  /** Globs of files and folders to hide (`drafts/**`). */
  exclude?: readonly string[];
  /** Offer files and folders whose name starts with a dot (`.env`, `.git`). Default false. */
  includeHidden?: boolean;
  /** Bytes read from one file; longer files are cut. Default 200 000. */
  maxFileBytes?: number;
  /** Entries returned by one listing. Default 500. */
  maxEntries?: number;
  /** Folder depth explored. Default 8. */
  maxDepth?: number;
  /** Matches returned by one search. Default 50. */
  maxMatches?: number;
  /** Bytes scanned by one search, all files together. Default 20 000 000. */
  maxSearchBytes?: number;
}

export interface FolderEntry {
  path: string;
  type: 'file' | 'directory';
  size?: number;
}

export interface FileContent {
  path: string;
  size: number;
  content: string;
  truncated: boolean;
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
}

/** Names looked at by one walk, offered or not. */
const MAX_EXAMINED_ENTRIES = 50_000;

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
  readonly limits: Required<
    Pick<
      FolderOptions,
      'maxFileBytes' | 'maxEntries' | 'maxDepth' | 'maxMatches' | 'maxSearchBytes'
    >
  >;

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
    this.limits = {
      maxFileBytes: options.maxFileBytes ?? 200_000,
      maxEntries: options.maxEntries ?? 500,
      maxDepth: options.maxDepth ?? 8,
      maxMatches: options.maxMatches ?? 50,
      maxSearchBytes: options.maxSearchBytes ?? 20_000_000,
    };
  }

  /** Lists a folder (the root by default), bounded by `maxEntries`. */
  async list(
    path = '',
    recursive = false
  ): Promise<{ entries: FolderEntry[]; truncated: boolean }> {
    const start = await this.locate(path, 'directory');
    const entries: FolderEntry[] = [];
    let truncated = false;
    for await (const entry of this.walk(start.path, recursive ? this.limits.maxDepth : 0, true)) {
      if (entries.length >= this.limits.maxEntries) {
        truncated = true;
        break;
      }
      entries.push(
        entry.type === 'file'
          ? { path: entry.path, type: 'file', size: entry.size }
          : { path: entry.path, type: 'directory' }
      );
    }
    return { entries, truncated };
  }

  /** Every offered file, bounded by `maxEntries` (used to list resources). */
  async files(): Promise<{ files: WalkedFile[]; truncated: boolean }> {
    const files: WalkedFile[] = [];
    for await (const entry of this.walk('', this.limits.maxDepth, false)) {
      if (entry.type !== 'file') continue;
      if (files.length >= this.limits.maxEntries) return { files, truncated: true };
      files.push(entry);
    }
    return { files, truncated: false };
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
    for await (const entry of this.walk(start.path, this.limits.maxDepth, false)) {
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
    return { matches, filesScanned, truncated: false };
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
    withDirectories: boolean
  ): AsyncGenerator<({ type: 'file' } & WalkedFile) | { type: 'directory'; path: string }> {
    const rootReal = await this.realRoot();
    const visited = new Set<string>();
    const queue: Array<{ path: string; depth: number }> = [{ path: start, depth }];
    let examined = 0;
    for (let next = queue.shift(); next; next = queue.shift()) {
      const folderReal = await realpath(resolve(this.root, next.path)).catch(() => undefined);
      if (!folderReal || visited.has(folderReal) || !inside(rootReal, folderReal)) continue;
      visited.add(folderReal);
      const names = (await readdir(folderReal)).sort();
      for (const name of names) {
        // A hard stop for huge trees, whatever the other limits.
        if (++examined > MAX_EXAMINED_ENTRIES) return;
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
    if (matchesAny(path, this.exclude)) return false;
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
    this.rootReal ??= realpath(this.root).catch(() => {
      throw new ValidationError('root', `the shared folder ${this.root} does not exist`);
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
