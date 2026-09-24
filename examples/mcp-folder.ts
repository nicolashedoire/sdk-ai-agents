/**
 * Recipe "a folder of documents": list, read and search the text files of one folder, as
 * tools and as MCP resources. Nothing outside the folder can be reached, symbolic links
 * included; hidden files (`.env`, `.git`) are never offered.
 *
 * Run: npm run example:mcp-folder -- /absolute/path/to/folder   (default: this repository's docs)
 */
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**', '.vitepress/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'The SDK AI Agents documentation. Search it before answering questions about the SDK.',
});
