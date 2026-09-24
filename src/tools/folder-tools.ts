import { extname } from 'node:path';
import { z } from 'zod';
import type { ResourceProvider } from '../types/resource.js';
import type { ToolDefinition, ToolMetadata } from '../types/tool.js';
import { FolderAccess } from './folder-access.js';
import type { FolderOptions } from './folder-options.js';
import { prefixed } from './tool-names.js';

export interface FolderToolsOptions extends FolderOptions {
  /** Prefix of the tool names (`list_files`, `read_file`, `search_files`), e.g. `docs_`. */
  prefix?: string;
}

const READ_ONLY: ToolMetadata = { category: 'folder', riskLevel: 'low', readOnly: true };

const listSchema = z.object({
  path: z
    .string()
    .max(1_000)
    .optional()
    .describe('Folder inside the shared folder; default: its root'),
  recursive: z.boolean().optional().describe('Include sub-folders (bounded); default false'),
});
const readSchema = z.object({
  path: z.string().min(1).max(1_000).describe('File path relative to the shared folder'),
});
const searchSchema = z.object({
  query: z.string().min(1).max(200).describe('Text to look for (case-insensitive)'),
  path: z.string().max(1_000).optional().describe('Folder to search in; default: everywhere'),
});

/**
 * Three read-only tools over one folder: list, read and search its text files. Paths are
 * relative to the folder; nothing outside it can be reached, symbolic links included.
 *
 * ```ts
 * const tools = folderTools({ root: './handbook', prefix: 'handbook_' });
 * ```
 */
export function folderTools(options: FolderToolsOptions): ToolDefinition[] {
  const folder = new FolderAccess(options);
  const where = `the "${folder.name}" folder`;
  return [
    {
      name: prefixed(options.prefix, 'list_files'),
      description: `Lists the files and sub-folders of ${where}. Paths are relative to it.`,
      schema: listSchema,
      capability: `folder:${folder.name}`,
      metadata: READ_ONLY,
      handler: async ({ path, recursive }: z.infer<typeof listSchema>) => {
        const listing = await folder.list(path ?? '', recursive ?? false);
        return { folder: folder.name, path: path ?? '', ...listing };
      },
    },
    {
      name: prefixed(options.prefix, 'read_file'),
      description: `Reads a text file of ${where}. Long files are cut (see "truncated").`,
      schema: readSchema,
      capability: `folder:${folder.name}`,
      metadata: READ_ONLY,
      handler: async ({ path }: z.infer<typeof readSchema>) => folder.read(path),
    },
    {
      name: prefixed(options.prefix, 'search_files'),
      description: `Finds the lines of ${where} that contain a text (case-insensitive), with file and line number.`,
      schema: searchSchema,
      capability: `folder:${folder.name}`,
      metadata: READ_ONLY,
      handler: async ({ query, path }: z.infer<typeof searchSchema>) => ({
        query,
        ...(await folder.search(query, path ?? '')),
      }),
    },
  ];
}

/**
 * The same folder as MCP resources: each text file gets a `folder://<name>/<path>` URI that
 * clients can list and attach to a conversation.
 */
export function folderResources(options: FolderOptions): ResourceProvider {
  const folder = new FolderAccess(options);
  const prefix = `folder://${encodeURIComponent(folder.name)}/`;
  return {
    handles: (uri) => uri.startsWith(prefix),
    list: async () => {
      const { files } = await folder.files();
      return files.map((file) => ({
        uri: `${prefix}${file.path.split('/').map(encodeURIComponent).join('/')}`,
        name: file.path,
        mimeType: mimeTypeOf(file.path),
        size: file.size,
      }));
    },
    read: async (uri) => {
      if (!uri.startsWith(prefix)) {
        throw new Error(`${uri} is not served by the "${folder.name}" folder`);
      }
      let path: string;
      try {
        path = uri.slice(prefix.length).split('/').map(decodeURIComponent).join('/');
      } catch {
        throw new Error(`${uri} is not a valid resource URI`);
      }
      const file = await folder.read(path);
      return { uri, mimeType: mimeTypeOf(file.path), text: file.content };
    },
  };
}

const MIME_TYPES: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  mdx: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  jsonl: 'application/jsonl',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  xml: 'application/xml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/typescript',
};

function mimeTypeOf(path: string): string {
  return MIME_TYPES[extname(path).replace(/^\./, '').toLowerCase()] ?? 'text/plain';
}
