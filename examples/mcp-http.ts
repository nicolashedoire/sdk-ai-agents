/**
 * Deploy an MCP server over Streamable HTTP, protected by a bearer token, with Node's own
 * `http` module. Stateless: every request gets a fresh MCP server, so it scales like any
 * HTTP API. Here it serves a folder, but any `tools` list works.
 *
 * Run: MCP_TOKEN=change-me npm run example:mcp-http -- /absolute/path/to/folder
 * Then: claude mcp add --transport http docs http://127.0.0.1:3000/mcp --header "Authorization: Bearer change-me"
 */
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '../src/index.js';
import { createMcpServer } from '../src/mcp.js';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const root = resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'docs'));
const folder = { root, name: 'docs', exclude: ['.vitepress/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

const httpServer = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') {
    return reply(response, 404, 'Not found');
  }
  if (!allowedHosts.has(request.headers.host ?? '')) {
    return reply(response, 403, 'Forbidden host');
  }
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) {
    return reply(response, 401, 'Unauthorized');
  }
  if (request.method !== 'POST') {
    return reply(response, 405, 'Method not allowed');
  }
  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends when the client
  // closes the connection, or after `approvalTimeoutMs` (50 s by default) at the latest.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

httpServer.listen(port, '127.0.0.1', () => {
  console.error(`MCP server on http://127.0.0.1:${port}/mcp (folder ${root})`);
});
