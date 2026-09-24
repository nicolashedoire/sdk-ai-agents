import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openApiTools } from '../tools/openapi-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { LocalHttpServer } from './support/local-http-server.js';

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
    await tool(tools, 'show_pet').handler({ petId: 'a b/c', query_petId: 'x' });

    expect(listed).toEqual({ status: 200, data: { ok: true } });
    expect(server.requests[0]?.url).toBe('/v1/pets?limit=2&tag=cat&tag=dog');
    expect(server.requests[0]?.headers['x-api-key']).toBe('server-secret');
    expect(server.requests[1]?.url).toBe('/v1/pets/a%20b%2Fc?petId=x');
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
    await expect(tool(tools, 'show_pet').handler({ petId: '..' })).rejects.toThrow('".." is not a valid path parameter');
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
});
