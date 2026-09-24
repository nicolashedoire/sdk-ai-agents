import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { folderResources, folderTools, type FolderToolsOptions } from '../tools/folder-tools.js';
import type { ToolDefinition } from '../types/tool.js';

let sandbox: string;
let root: string;

function write(path: string, content: string | Buffer): void {
  const target = join(sandbox, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

beforeEach(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'folder-tools-'));
  root = join(sandbox, 'handbook');
  write('handbook/README.md', '# Handbook\nWelcome to ACME.\n');
  write('handbook/guide/onboarding.md', 'Day one: get your badge.\nAsk IT for a LAPTOP.\n');
  write('handbook/guide/holidays.md', 'Laptops stay at the office during holidays.\n');
  write('handbook/data.csv', 'team,size\nsales,4\n');
  write('handbook/binary.txt', Buffer.from([0x68, 0x69, 0x00, 0x01, 0x02]));
  write('handbook/archive.zip', 'not offered: the extension is not a text format');
  write('handbook/.env', 'SECRET=laptop-password');
  write('handbook/.git/config', '[core] laptop');
  write('handbook/drafts/wip.md', 'laptop budget draft');
  write('outside/secret.md', 'TOP SECRET laptop codes');
  symlinkSync(join(sandbox, 'outside/secret.md'), join(root, 'link-out.md'));
  symlinkSync(join(sandbox, 'outside'), join(root, 'link-dir'));
  symlinkSync(join(root, 'guide/onboarding.md'), join(root, 'link-in.md'));
  symlinkSync(join(root, '.env'), join(root, 'env-link.md'));
  symlinkSync(root, join(root, 'loop'));
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

function tools(options: Partial<FolderToolsOptions> = {}): Record<string, ToolDefinition> {
  const list = folderTools({ root, exclude: ['drafts/**'], ...options });
  return Object.fromEntries(list.map((tool) => [tool.name, tool]));
}

function call(options: Partial<FolderToolsOptions>, name: string, args: unknown): Promise<unknown> {
  const tool = tools(options)[name];
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(tool.schema.parse(args));
}

describe('folderTools', () => {
  it('offers three read-only tools named after the folder', () => {
    const list = folderTools({ root, prefix: 'handbook_' });
    expect(list.map((tool) => [tool.name, tool.metadata?.readOnly])).toEqual([
      ['handbook_list_files', true],
      ['handbook_read_file', true],
      ['handbook_search_files', true],
    ]);
    expect(list[0]?.description).toContain('the "handbook" folder');
  });

  it('lists only text files inside the folder: no hidden, excluded, binary-format or outside entries', async () => {
    const top = await call({}, 'list_files', {});
    expect(top).toEqual({
      folder: 'handbook',
      path: '',
      truncated: false,
      entries: [
        { path: 'README.md', type: 'file', size: 28 },
        { path: 'binary.txt', type: 'file', size: 5 },
        { path: 'data.csv', type: 'file', size: 18 },
        { path: 'guide', type: 'directory' },
        { path: 'link-in.md', type: 'file', size: 46 },
      ],
    });

    // The link to the folder itself is a cycle: it is skipped, and the walk ends.
    const all = await call({}, 'list_files', { recursive: true });
    expect(all).toMatchObject({
      entries: [
        { path: 'README.md' },
        { path: 'binary.txt' },
        { path: 'data.csv' },
        { path: 'guide' },
        { path: 'link-in.md' },
        { path: 'guide/holidays.md' },
        { path: 'guide/onboarding.md' },
      ],
    });
    const limited = await call({ maxEntries: 2 }, 'list_files', { recursive: true });
    expect(limited).toMatchObject({ truncated: true, entries: [{ path: 'README.md' }, { path: 'binary.txt' }] });
  });

  it('reads text files and refuses every way out of the folder', async () => {
    await expect(call({}, 'read_file', { path: 'guide/onboarding.md' })).resolves.toEqual({
      path: 'guide/onboarding.md',
      size: 46,
      content: 'Day one: get your badge.\nAsk IT for a LAPTOP.\n',
      truncated: false,
    });
    await expect(call({}, 'read_file', { path: './link-in.md' })).resolves.toMatchObject({ path: 'link-in.md', size: 46 });

    const refusals: Array<[string, string]> = [
      ['../outside/secret.md', 'is outside the shared folder'],
      ['guide/../../outside/secret.md', 'is outside the shared folder'],
      ['link-out.md', 'is outside the shared folder'],
      ['link-dir/secret.md', 'is outside the shared folder'],
      [join(sandbox, 'outside/secret.md'), 'use a path relative to the shared folder'],
      ['.env', 'was not found'],
      ['env-link.md', 'was not found'],
      ['.git/config', 'was not found'],
      ['drafts/wip.md', 'was not found'],
      ['archive.zip', 'was not found'],
      ['guide', 'was not found'],
      ['missing.md', 'was not found'],
      ['binary.txt', 'binary files are not offered'],
    ];
    for (const [path, reason] of refusals) {
      await expect(call({}, 'read_file', { path }), path).rejects.toThrow(reason);
    }
  });

  it('cuts long files at maxFileBytes', async () => {
    write('handbook/long.md', 'ab'.repeat(1_000));
    const result = await call({ maxFileBytes: 100 }, 'read_file', { path: 'long.md' });
    expect(result).toEqual({ path: 'long.md', size: 2_000, content: 'ab'.repeat(50), truncated: true });
  });

  it('searches case-insensitively, only in what it may read, within its limits', async () => {
    const result = await call({}, 'search_files', { query: 'laptop' });
    expect(result).toEqual({
      query: 'laptop',
      filesScanned: 6,
      truncated: false,
      matches: [
        { path: 'link-in.md', line: 2, text: 'Ask IT for a LAPTOP.' },
        { path: 'guide/holidays.md', line: 1, text: 'Laptops stay at the office during holidays.' },
        { path: 'guide/onboarding.md', line: 2, text: 'Ask IT for a LAPTOP.' },
      ],
    });
    await expect(call({ maxMatches: 1 }, 'search_files', { query: 'laptop' })).resolves.toMatchObject({
      truncated: true,
      matches: [{ path: 'link-in.md' }],
    });
    await expect(call({ maxSearchBytes: 30 }, 'search_files', { query: 'laptop' })).resolves.toMatchObject({
      truncated: true,
      filesScanned: 2,
    });
    await expect(call({}, 'search_files', { query: 'laptop', path: '../outside' })).rejects.toThrow('outside the shared folder');
  });

  it('applies include globs and extension lists', async () => {
    await expect(call({ include: ['guide/**'] }, 'list_files', { recursive: true })).resolves.toMatchObject({
      entries: [{ path: 'guide' }, { path: 'guide/holidays.md' }, { path: 'guide/onboarding.md' }],
    });
    await expect(call({ extensions: ['csv'] }, 'list_files', {})).resolves.toMatchObject({
      entries: [{ path: 'data.csv' }, { path: 'guide' }],
    });
  });

  it('fails clearly when the folder does not exist', async () => {
    const missing = folderTools({ root: join(sandbox, 'nope') });
    await expect(missing[0]?.handler({})).rejects.toThrow('does not exist');
  });
});

describe('folderResources', () => {
  it('lists the same files as resources and reads them by URI, never outside the folder', async () => {
    const provider = folderResources({ root, name: 'Team handbook', exclude: ['drafts/**'] });

    const listed = await provider.list();
    expect(listed.map((resource) => resource.uri)).toEqual([
      'folder://Team%20handbook/README.md',
      'folder://Team%20handbook/binary.txt',
      'folder://Team%20handbook/data.csv',
      'folder://Team%20handbook/link-in.md',
      'folder://Team%20handbook/guide/holidays.md',
      'folder://Team%20handbook/guide/onboarding.md',
    ]);
    expect(listed[0]).toEqual({ uri: 'folder://Team%20handbook/README.md', name: 'README.md', mimeType: 'text/markdown', size: 28 });

    expect(provider.handles('folder://Team%20handbook/README.md')).toBe(true);
    expect(provider.handles('folder://other/README.md')).toBe(false);
    await expect(provider.read('folder://Team%20handbook/data.csv')).resolves.toEqual({
      uri: 'folder://Team%20handbook/data.csv',
      mimeType: 'text/csv',
      text: 'team,size\nsales,4\n',
    });
    await expect(provider.read('folder://Team%20handbook/..%2Foutside%2Fsecret.md')).rejects.toThrow('outside the shared folder');
    await expect(provider.read('folder://Team%20handbook/%2e%2e/outside/secret.md')).rejects.toThrow('outside the shared folder');
    await expect(provider.read('folder://Team%20handbook/%E0%A4%A')).rejects.toThrow('not a valid resource URI');
  });
});
