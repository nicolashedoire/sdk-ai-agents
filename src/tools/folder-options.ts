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
  /**
   * Globs of files to offer (`**∕*.md`); by default every file with an allowed extension.
   * Folders are still listed, even when they hold no matching file.
   */
  include?: readonly string[];
  /** Globs of files and folders to hide (`drafts`, `**∕node_modules`); a hidden folder hides all it holds. */
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
  /** Names looked at by one listing or search, offered or not. Default 50 000. */
  maxExaminedEntries?: number;
}

export type FolderLimits = Required<
  Pick<
    FolderOptions,
    | 'maxFileBytes'
    | 'maxEntries'
    | 'maxDepth'
    | 'maxMatches'
    | 'maxSearchBytes'
    | 'maxExaminedEntries'
  >
>;

export function folderLimits(options: FolderOptions): FolderLimits {
  return {
    maxFileBytes: options.maxFileBytes ?? 200_000,
    maxEntries: options.maxEntries ?? 500,
    maxDepth: options.maxDepth ?? 8,
    maxMatches: options.maxMatches ?? 50,
    maxSearchBytes: options.maxSearchBytes ?? 20_000_000,
    maxExaminedEntries: options.maxExaminedEntries ?? 50_000,
  };
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
