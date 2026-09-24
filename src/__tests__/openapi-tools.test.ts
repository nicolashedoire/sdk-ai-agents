import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { OpenApiFetch } from '../tools/openapi-spec.js';
import { openApiTools } from '../tools/openapi-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { createTestSDK } from './support/test-sdk.js';

const petStore = {
  openapi: '3.0.3',
  info: { title: 'Pet Store' },
  servers: [{ url: '/v1' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'listPets',
        summary: 'List pets',
        tags: ['pets'],
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer' }, description: 'Max pets' },
          { name: 'tag', in: 'query', schema: { type: 'array', items: { type: 'string' } } },
          { name: 'X-Api-Key', in: 'header', schema: { type: 'string' } },
        ],
      },
      post: {
        operationId: 'createPet',
        tags: ['pets'],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/NewPet' } } },
        },
      },
    },
    '/pets/{petId}': {
      parameters: [{ $ref: '#/components/parameters/PetId' }],
      get: {
        operationId: 'show pet!',
        summary: 'Info for a pet',
        tags: ['pets'],
        parameters: [{ name: 'petId', in: 'query', schema: { type: 'string' } }],
      },
      delete: { operationId: 'deletePet', tags: ['pets'] },
    },
    '/tree': {
      get: {
        operationId: 'getTree',
        parameters: [
          {
            name: 'filter',
            in: 'query',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Node' } } },
          },
        ],
      },
    },
    '/upload': {
      post: {
        operationId: 'upload',
        requestBody: { required: true, content: { 'multipart/form-data': { schema: {} } } },
      },
    },
    '/stores': { get: { summary: 'Stores, without an operationId', tags: ['stores'] } },
  },
  components: {
    parameters: {
      PetId: { name: 'petId', in: 'path', required: true, schema: { type: 'string' } },
    },
    schemas: {
      NewPet: {
        type: 'object',
        required: ['name'],
        properties: { name: { type: 'string' }, owner: { $ref: '#/components/schemas/Owner' } },
      },
      Owner: { type: 'object', properties: { name: { type: 'string' } } },
      Node: {
        type: 'object',
        properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
      },
    },
  },
};

function tool(tools: ToolDefinition[], name: string): ToolDefinition {
  const found = tools.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no tool ${name} in ${tools.map((t) => t.name).join(', ')}`);
  return found;
}

describe('openApiTools', () => {
  const servers: LocalHttpServer[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.stop();
    for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
  });

  async function api(...replies: Parameters<LocalHttpServer['reply']>): Promise<{ server: LocalHttpServer; url: string }> {
    const server = new LocalHttpServer().reply(...replies);
    servers.push(server);
    return { server, url: await server.start() };
  }

  it('turns only the GET operations of a spec into tools by default, each with its JSON Schema', async () => {
    const { server, url } = await api({ status: 200, body: petStore }, { status: 200, body: [{ id: 1 }] });

    const tools = await openApiTools({ spec: `${url}/openapi.json` });

    expect(tools.map((t) => t.name)).toEqual(['listPets', 'show_pet', 'getTree', 'get_stores']);
    expect(tool(tools, 'listPets').metadata).toMatchObject({ riskLevel: 'low', requiresApproval: false, readOnly: true });
    expect(tool(tools, 'listPets').description).toBe('List pets\n\n(GET /pets)');
    // Path parameter and query parameter share a name: the query one is renamed.
    expect(tool(tools, 'show_pet').inputJsonSchema).toEqual({
      type: 'object',
      properties: { petId: { type: 'string' }, query_petId: { type: 'string' } },
      required: ['petId'],
      additionalProperties: false,
    });
    // A recursive schema is cut at the cycle instead of looping forever.
    expect(JSON.stringify(tool(tools, 'getTree').inputJsonSchema)).toContain('Recursive reference to #/components/schemas/Node');

    // The relative server URL is resolved against the address of the spec.
    await tool(tools, 'listPets').handler({});
    expect(server.requests.map((request) => request.url)).toEqual(['/openapi.json', '/v1/pets']);
  });

  it('sends path, query and header arguments, and the configured headers always win', async () => {
    const { server, url } = await api({ status: 200, body: { ok: true } });
    const tools = await openApiTools({
      spec: petStore,
      baseUrl: `${url}/v1`,
      headers: { 'X-Api-Key': 'server-secret' },
    });

    const listed = await tool(tools, 'listPets').handler({ limit: 2, tag: ['cat', 'dog'], 'X-Api-Key': 'forged-by-model' });
    await tool(tools, 'show_pet').handler({ petId: 'a b', query_petId: 'x' });

    expect(listed).toEqual({ status: 200, data: { ok: true } });
    expect(server.requests[0]?.url).toBe('/v1/pets?limit=2&tag=cat&tag=dog');
    expect(server.requests[0]?.headers['x-api-key']).toBe('server-secret');
    expect(server.requests[1]?.url).toBe('/v1/pets/a%20b?petId=x');
  });

  it('exposes other methods only when listed, as high-risk tools that require approval', async () => {
    const { server, url } = await api({ status: 201, body: { id: 7 } });
    const options = { spec: petStore, baseUrl: `${url}/v1` };

    const tools = await openApiTools({ ...options, include: ['createPet', 'deletePet', 'listPets'] });

    expect(tools.map((t) => t.name)).toEqual(['listPets', 'createPet', 'deletePet']);
    expect(tool(tools, 'createPet').metadata).toMatchObject({ riskLevel: 'high', requiresApproval: true, readOnly: false });
    expect(tool(tools, 'createPet').inputJsonSchema).toMatchObject({
      required: ['body'],
      properties: { body: { required: ['name'], properties: { owner: { properties: { name: { type: 'string' } } } } } },
    });
    await tool(tools, 'createPet').handler({ body: { name: 'Rex' } });
    expect(server.requests[0]).toMatchObject({ method: 'POST', url: '/v1/pets' });
    expect(server.jsonBody(0)).toEqual({ name: 'Rex' });

    const trusted = await openApiTools({ ...options, include: ['deletePet'], metadata: () => ({ requiresApproval: false }) });
    expect(tool(trusted, 'deletePet').metadata).toMatchObject({ riskLevel: 'high', requiresApproval: false });

    await expect(openApiTools({ ...options, include: ['removeEverything'] })).rejects.toThrow('no operation with operationId "removeEverything"');
    await expect(openApiTools({ ...options, include: ['upload'] })).rejects.toThrow('request body is not JSON (multipart/form-data)');
  });

  it('refuses invalid arguments before sending anything', async () => {
    const { server, url } = await api({ status: 200, body: {} });
    const tools = await openApiTools({ spec: petStore, baseUrl: `${url}/v1`, include: ['createPet', 'show pet!', 'listPets'] });

    await expect(tool(tools, 'show_pet').handler({})).rejects.toThrow('petId - missing required argument');
    // No value can walk up the path, even percent-encoded for a server that decodes it.
    for (const petId of ['..', '.', 'a/b', 'a\\b', '%2e%2e', '..%2Fadmin', 'a%252Fb', '%252e%252e', '..%2fadmin%zz', '..%2f..%2fadmin%', '%2e%2e%2fadmin%zz']) {
      await expect(tool(tools, 'show_pet').handler({ petId }), petId).rejects.toThrow('is not a valid path parameter');
    }
    await expect(tool(tools, 'listPets').handler({ limit: 1, offset: 3 })).rejects.toThrow('offset - unknown argument (expected: limit, tag, X-Api-Key)');
    await expect(tool(tools, 'listPets').handler({ tag: { name: 'cat' } })).rejects.toThrow('expected a string, a number or a boolean');
    await expect(tool(tools, 'listPets').handler({ 'X-Api-Key': 'a\r\nHost: evil' })).rejects.toThrow('line breaks');
    await expect(tool(tools, 'createPet').handler({})).rejects.toThrow('body - missing required argument');
    // A path template without its parameter in the spec is never sent half-filled.
    const orphan = await openApiTools({ spec: { ...petStore, paths: { '/orphans/{orphanId}': { get: { operationId: 'getOrphan' } } } }, baseUrl: url });
    await expect(tool(orphan, 'getOrphan').handler({})).rejects.toThrow('{orphanId} is not a declared path parameter');
    expect(server.requests).toHaveLength(0);
  });

  it('turns HTTP errors, redirects and timeouts into tool errors', async () => {
    const { url } = await api(
      { status: 404, body: { message: 'pet 9 not found' } },
      { status: 302, headers: { location: 'http://127.0.0.1:1/elsewhere' } },
      { status: 200, body: {}, delayMs: 500 }
    );
    const tools = await openApiTools({ spec: petStore, baseUrl: `${url}/v1`, timeoutMs: 100 });
    const show = tool(tools, 'show_pet');

    await expect(show.handler({ petId: '9' })).rejects.toThrow('GET /pets/{petId} returned HTTP 404: {"message":"pet 9 not found"}');
    await expect(show.handler({ petId: '9' })).rejects.toThrow('returned HTTP 302: redirects are not followed');
    await expect(show.handler({ petId: '9' })).rejects.toThrow('GET /pets/{petId} timed out after 100 ms');
  });

  it('cuts long responses at maxResponseBytes', async () => {
    const { url } = await api({ status: 200, body: 'é'.repeat(50_000), headers: { 'Content-Type': 'text/plain' } });
    const tools = await openApiTools({ spec: petStore, baseUrl: `${url}/v1`, maxResponseBytes: 1_001 });

    const result = await tool(tools, 'listPets').handler({});

    // 1 001 bytes hold 500 two-byte characters: the half character at the end is dropped.
    expect(result).toEqual({ status: 200, data: 'é'.repeat(500), truncated: true });
  });

  it('filters by tag and exclusion, and keeps tool names valid and unique', async () => {
    const spec = {
      ...petStore,
      paths: {
        ...petStore.paths,
        '/a': { get: { operationId: 'show_pet' } },
        '/b': { get: { operationId: `x${'y'.repeat(80)}` } },
      },
    };
    const tools = await openApiTools({ spec, baseUrl: 'https://api.example.com', exclude: ['getTree'], prefix: 'shop_' });

    expect(tools.map((t) => t.name)).toEqual([
      'shop_listPets',
      'shop_show_pet',
      'shop_get_stores',
      'shop_show_pet_2',
      `shop_x${'y'.repeat(58)}`,
    ]);
    expect(tools.every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.name))).toBe(true);
    const stores = await openApiTools({ spec, baseUrl: 'https://api.example.com', tags: ['stores'] });
    expect(stores.map((t) => t.name)).toEqual(['get_stores']);
  });

  it('reads a spec from a file, and explains what it cannot use', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'openapi-'));
    directories.push(directory);
    const file = join(directory, 'spec.json');
    writeFileSync(file, JSON.stringify({ ...petStore, servers: [{ url: 'https://{region}.example.com/v1', variables: { region: { default: 'eu' } } }] }));
    const yaml = join(directory, 'spec.yaml');
    writeFileSync(yaml, 'openapi: 3.0.3\npaths: {}\n');

    const tools = await openApiTools({ spec: file });
    expect(tools).toHaveLength(4);

    await expect(openApiTools({ spec: yaml })).rejects.toThrow('parse it yourself');
    await expect(openApiTools({ spec: { swagger: '2.0', paths: {} } })).rejects.toThrow('Swagger 2.0 is not supported');
    await expect(openApiTools({ spec: { openapi: '3.1.0', info: {}, paths: {} } })).rejects.toThrow('declares no servers');
    await expect(openApiTools({ spec: petStore })).rejects.toThrow('cannot resolve the server URL "/v1"');
  });

  it('sends credentials only where you decided, and never in clear text over the network', async () => {
    const headers = { Authorization: 'Bearer secret' };
    const directory = mkdtempSync(join(tmpdir(), 'openapi-'));
    directories.push(directory);
    const file = join(directory, 'spec.json');
    writeFileSync(file, JSON.stringify({ ...petStore, servers: [{ url: 'https://attacker.example' }] }));

    // A spec file names a server: with credentials, the base URL must be yours.
    await expect(openApiTools({ spec: file, headers })).rejects.toThrow('pass `baseUrl` with `headers`');
    await expect(openApiTools({ spec: petStore, baseUrl: 'http://api.example.com', headers })).rejects.toThrow('credentials would travel unencrypted');
    await expect(openApiTools({ spec: file, baseUrl: 'https://api.example.com', headers })).resolves.toHaveLength(4);
    await expect(openApiTools({ spec: file, baseUrl: 'http://127.0.0.1:9', headers })).resolves.toHaveLength(4);
    // A spec downloaded from the API itself may name its own origin.
    const { url } = await api({ status: 200, body: petStore });
    await expect(openApiTools({ spec: `${url}/openapi.json`, headers })).resolves.toHaveLength(4);
    // A spec fetched in clear text over the network could have been altered on the way.
    const spec = 'http://specs.example.invalid/openapi.json';
    const fetchSpec: OpenApiFetch = async () => ({ status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify(petStore) });
    await expect(openApiTools({ spec, baseUrl: 'https://api.example.com', headers, fetch: fetchSpec })).rejects.toThrow('download the spec over https');
    await expect(openApiTools({ spec, baseUrl: 'https://api.example.com', fetch: fetchSpec })).resolves.toHaveLength(4);
  });

  it('keeps the approval of write operations unless you set it explicitly', async () => {
    const options = { spec: petStore, baseUrl: 'https://api.example.com', include: ['deletePet'] };
    const unset = await openApiTools({ ...options, metadata: () => ({ requiresApproval: undefined, riskLevel: 'medium' }) });
    expect(tool(unset, 'deletePet').metadata).toMatchObject({ requiresApproval: true, riskLevel: 'medium' });
  });

  it('refuses an operation whose parameters would share one argument name', async () => {
    const spec = {
      ...petStore,
      paths: {
        '/items/{id}': {
          get: {
            operationId: 'getItem',
            parameters: [
              { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
              { name: 'query_id', in: 'query', schema: { type: 'string' } },
              { name: 'id', in: 'query', schema: { type: 'string' } },
            ],
          },
        },
      },
    };
    await expect(openApiTools({ spec, baseUrl: 'https://api.example.com' })).rejects.toThrow(
      'getItem: two parameters would share the argument name "query_id"'
    );
  });

  it('stays small when references multiply, and never reads the object prototype', async () => {
    // Each level refers to the next twice: fully expanded, one schema would hold 2^30 nodes.
    const schemas: Record<string, unknown> = { L30: { type: 'string' } };
    for (let level = 0; level < 30; level++) {
      schemas[`L${level}`] = { type: 'object', properties: { a: { $ref: `#/components/schemas/L${level + 1}` }, b: { $ref: `#/components/schemas/L${level + 1}` } } };
    }
    const paths: Record<string, unknown> = {};
    for (let index = 0; index < 200; index++) {
      paths[`/op${index}`] = {
        get: {
          operationId: `op${index}`,
          parameters: [
            { name: 'filter', in: 'query', content: { 'application/json': { schema: { $ref: '#/components/schemas/L0' } } } },
          ],
        },
      };
    }

    const tools = await openApiTools({ spec: { openapi: '3.0.3', info: {}, paths, components: { schemas } }, baseUrl: 'https://api.example.com' });

    expect(tools).toHaveLength(200);
    const sizes = tools.map((definition) => JSON.stringify(definition.inputJsonSchema).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(70_000);
    expect(sizes.reduce((total, size) => total + size, 0)).toBeLessThan(5_000_000);
    // Once the budget of the whole spec is spent, later operations stop expanding at once.
    expect(JSON.stringify(tools[199]?.inputJsonSchema)).toContain('not expanded (schema too large)');

    const proto = await openApiTools({
      spec: { openapi: '3.0.3', info: {}, paths: { '/p': { get: { operationId: 'p', parameters: [{ name: 'x', in: 'query', schema: { $ref: '#/constructor' } }] } } } },
      baseUrl: 'https://api.example.com',
    });
    expect(JSON.stringify(proto[0]?.inputJsonSchema)).toContain('Unresolved reference #/constructor');
  });

  it('refuses a redirect followed by a custom fetch', async () => {
    const tools = await openApiTools({
      spec: petStore,
      baseUrl: 'https://api.example.com',
      fetch: async () => ({ status: 200, redirected: true, headers: { get: () => 'application/json' }, text: async () => '{}' }),
    });
    await expect(tool(tools, 'listPets').handler({})).rejects.toThrow('redirects are not followed');
  });

  it('checks arguments in the governed pipeline before any approval', async () => {
    const env = createTestSDK();
    try {
      for (const definition of await openApiTools({ spec: petStore, baseUrl: 'https://api.example.com', include: ['createPet', 'show pet!'] })) {
        env.sdk.defineTool(definition);
      }

      await expect(env.sdk.executeTool('createPet', {})).rejects.toMatchObject({ originalError: { name: 'ValidationError' } });
      await expect(env.sdk.executeTool('show_pet', { petId: '..%2Fadmin' })).rejects.toMatchObject({
        originalError: { reason: expect.stringContaining('is not a valid path parameter') },
      });
      expect(env.sdk.getPendingApprovals()).toEqual([]);
    } finally {
      await env.dispose();
    }
  });

  it('retries read-only calls on server errors only', async () => {
    const env = createTestSDK();
    try {
      const flaky = await api({ status: 503, body: {} }, { status: 200, body: ['Rex'] });
      const options = { spec: petStore, baseUrl: `${flaky.url}/v1`, include: ['listPets', 'createPet'], retry: { maxRetries: 2, initialDelayMs: 1 } };
      const tools = await openApiTools(options);
      expect(tool(tools, 'createPet').retry).toBeUndefined();
      for (const definition of tools) env.sdk.defineTool(definition);

      await expect(env.sdk.executeTool('listPets', {})).resolves.toEqual({ status: 200, data: ['Rex'] });
      expect(flaky.server.requests).toHaveLength(2);

      const missing = await api({ status: 404, body: { message: 'no' } });
      const env404 = createTestSDK();
      try {
        for (const definition of await openApiTools({ ...options, baseUrl: `${missing.url}/v1` })) env404.sdk.defineTool(definition);
        await expect(env404.sdk.executeTool('listPets', {})).rejects.toThrow('Tool execution failed');
        expect(missing.server.requests).toHaveLength(1);
      } finally {
        await env404.dispose();
      }
    } finally {
      await env.dispose();
    }
  });
});
