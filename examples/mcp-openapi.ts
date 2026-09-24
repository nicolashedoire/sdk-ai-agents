/**
 * Recipe "a web API": every GET operation of an OpenAPI description becomes an MCP tool.
 * Write operations (POST, PUT, PATCH, DELETE) are left out unless you list them in `include`.
 *
 * Run: npm run example:mcp-openapi
 *   OPENAPI_SPEC   URL or file of the spec (default: the public Swagger Petstore demo)
 *   API_BASE_URL   where requests go, if not the spec's first server (required with a token)
 *   API_TOKEN      sent as `Authorization: Bearer …` (never shown to the model)
 */
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const baseUrl = process.env.API_BASE_URL;
const token = process.env.API_TOKEN;
// With a token, say where it may go: a spec file must not decide it.
if (token && !baseUrl) throw new Error('Set API_BASE_URL (https) together with API_TOKEN');
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(baseUrl ? { baseUrl } : {}),
  ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
