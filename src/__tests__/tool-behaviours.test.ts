import { getEventListeners } from 'node:events';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import { connectMcpServer, createMcpServer } from '../mcp.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { defineTool } from '../sdk.js';
import { jsonSchemaProblems } from '../utils/json-schema-check.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

const lookupDefinition = {
  name: 'lookup',
  description: 'Looks a customer up',
  schema: z.object({ id: z.string() }),
  handler: async ({ id }: { id: string }) => `customer ${id}`,
};

describe('tools given to agents and capabilities', () => {
  const environments: TestSDK[] = [];
  afterEach(async () => {
    for (const env of environments.splice(0)) await env.dispose();
  });
  const testSDK = () => {
    const env = createTestSDK();
    environments.push(env);
    return env.sdk;
  };

  it('says how to register a second tool of a name, not to change its version', () => {
    const registry = new ToolRegistry();
    registry.registerTool({ ...lookupDefinition, version: '1.0.0' });

    expect(() => registry.registerTool({ ...lookupDefinition, version: '2.0.0' })).toThrow(
      /already registered: a name is registered once, whatever its version\. Give this tool another name/
    );
    expect(() => registry.registerTool({ ...lookupDefinition, version: '2.0.0' })).not.toThrow(
      /different version/
    );
  });

  it('refuses an agent whose tool has a name another tool holds, and registers none of its tools', () => {
    const sdk = testSDK();
    sdk.defineTool(lookupDefinition);
    const other = defineTool({ ...lookupDefinition, handler: async () => 'another lookup' });
    const fresh = defineTool({ ...lookupDefinition, name: 'fresh' });

    const create = () => sdk.createAgent({ name: 'support', model: 'test-model', tools: [fresh, other] });

    expect(create).toThrow(ValidationError);
    expect(create).toThrow(/another tool named "lookup" is already registered/);
    expect(sdk.listTools().map((tool) => tool.name)).toEqual(['lookup']);
  });

  it('refuses a copy with other metadata: the registered tool, without them, would run', () => {
    const sdk = testSDK();
    const registered = sdk.defineTool(lookupDefinition);
    const guarded = { ...registered, metadata: { requiresApproval: true } };

    expect(() => sdk.createAgent({ name: 'support', model: 'test-model', tools: [guarded] })).toThrow(
      ValidationError
    );
    expect(() => sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [guarded] })).toThrow(
      /another tool named "lookup"/
    );
  });

  it('accepts the registered tool itself, and one tool built by defineTool for several agents', () => {
    const sdk = testSDK();
    const registered = sdk.defineTool(lookupDefinition);
    const shared = defineTool({ ...lookupDefinition, name: 'shared' });

    sdk.createAgent({ name: 'first', model: 'test-model', tools: [registered, shared] });
    sdk.createAgent({ name: 'second', model: 'test-model', tools: [shared, shared] });
    sdk.createCognitiveAgent({ name: 'third', model: 'test-model', tools: [registered, shared] });

    expect(sdk.listTools().map((tool) => tool.name)).toEqual(['lookup', 'shared']);
  });

  it('lets a capability take the tool sdk.defineTool returned, and refuses another tool of its name', () => {
    const sdk = testSDK();
    const registered = sdk.defineTool(lookupDefinition);

    const capability = sdk.defineCapability({ name: 'crm', description: 'CRM', tools: [registered] });
    expect(capability.tools).toEqual(['lookup']);

    const other = defineTool({ ...lookupDefinition, handler: async () => 'another lookup' });
    expect(() => sdk.defineCapability({ name: 'crm2', description: 'CRM', tools: [other] })).toThrow(
      ValidationError
    );
  });

  it('registers the tools addTools is given, so the agent can run them, and refuses a taken name', async () => {
    const sdk = testSDK();
    sdk.defineTool(lookupDefinition);
    const agent = sdk.createAgent({ name: 'support', model: 'test-model' });

    agent.addTools([defineTool({ ...lookupDefinition, name: 'late' })]);
    await expect(sdk.executeTool('late', { id: 'c-1' })).resolves.toBe('customer c-1');

    expect(() => agent.addTools([defineTool({ ...lookupDefinition, handler: async () => 'x' })])).toThrow(
      ValidationError
    );
  });

  it('refuses an unknown capability, before registering anything', () => {
    const sdk = testSDK();
    const create = () =>
      sdk.createAgent({
        name: 'support',
        model: 'test-model',
        tools: [defineTool(lookupDefinition)],
        capabilities: ['crm'],
      });

    expect(create).toThrow(ValidationError);
    expect(create).toThrow(/capabilities - unknown capability "crm": define it with sdk\.defineCapability/);
    expect(sdk.listTools()).toEqual([]);
  });

  it('accepts a tool rebuilt with equal metadata and retry, and refuses one whose metadata differ', () => {
    const sdk = testSDK();
    const retryOn = (error: Error) => error.message !== 'fatal';
    const build = (readOnly: boolean) =>
      defineTool({ ...lookupDefinition, metadata: { readOnly, riskLevel: 'low' }, retry: { maxRetries: 1, retryOn } });

    sdk.createAgent({ name: 'first', model: 'test-model', tools: [build(true)] });
    sdk.createAgent({ name: 'second', model: 'test-model', tools: [build(true)] });

    expect(() => sdk.createAgent({ name: 'third', model: 'test-model', tools: [build(false)] })).toThrow(
      /another tool named "lookup".*sdk\.listTools\(\)/
    );
  });

  it('refuses a cognitive agent for its limits before registering its tools', () => {
    const sdk = testSDK();
    const tool = defineTool({ ...lookupDefinition, name: 'probe' });

    expect(() =>
      sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [tool], limits: { maxSteps: 0 } })
    ).toThrow(/limits\.maxSteps/);
    expect(sdk.listTools()).toEqual([]);

    const fixed = defineTool({ ...lookupDefinition, name: 'probe', handler: async () => 'fixed' });
    sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [fixed] });
    expect(sdk.listTools().map((registered) => registered.handler)).toEqual([fixed.handler]);
  });

  it('offers a tool to the model once, however many times the agent is given it', async () => {
    const env = createTestSDK();
    environments.push(env);
    env.provider.always('tool-selection', { content: 'done' });
    const shared = defineTool({ ...lookupDefinition, name: 'shared' });

    const agent = env.sdk.createAgent({ name: 'support', model: 'test-model', tools: [shared, shared] });
    agent.addTools([shared]);
    await agent.run({ message: 'look customer c-1 up' });

    expect(env.provider.requests[0]?.tools?.map((tool) => tool.function.name)).toEqual(['shared']);
  });

  it('refuses to serve over MCP a copy of a registered tool with other metadata', () => {
    const sdk = testSDK();
    const registered = sdk.defineTool(lookupDefinition);

    expect(() =>
      createMcpServer(sdk, { name: 'crm', tools: [{ ...registered, metadata: { requiresApproval: true } }] })
    ).toThrow(/Another tool named "lookup" is already defined/);
    expect(() => createMcpServer(sdk, { name: 'crm', tools: [registered] })).not.toThrow();
  });
});

describe('tools imported from an MCP server', () => {
  const closers: Array<() => Promise<void>> = [];
  const environments: TestSDK[] = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
    for (const env of environments.splice(0)) await env.dispose();
  });

  /** An MCP server of our own, with the SDK's own `Server` and an in-memory transport. */
  async function serve(
    tools: Array<Record<string, unknown>>,
    call: (name: string, args: unknown, signal: AbortSignal) => Promise<string>
  ) {
    const server = new Server({ name: 'crm', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: tools as never }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => ({
      content: [{ type: 'text', text: await call(request.params.name, request.params.arguments, extra.signal) }],
    }));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    closers.push(() => server.close());
    return clientTransport;
  }

  const objectSchema = { type: 'object', properties: {} };

  it('cancels the call on the server when the caller gives up', async () => {
    let cancelled = false;
    let started: () => void = () => undefined;
    const running = new Promise<void>((resolve) => {
      started = resolve;
    });
    const transport = await serve([{ name: 'export', inputSchema: objectSchema }], (_name, _args, signal) => {
      started();
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve('finished'), 2_000);
        signal.addEventListener('abort', () => {
          cancelled = true;
          clearTimeout(timer);
          resolve('stopped');
        });
      });
    });
    const connection = await connectMcpServer({ name: 'crm', transport: { type: 'custom', transport } });
    closers.push(() => connection.close());
    const env = createTestSDK();
    environments.push(env);
    for (const tool of connection.tools) env.sdk.defineTool(tool);

    const caller = new AbortController();
    const call = env.sdk.executeTool('export', {}, { signal: caller.signal });
    await running;
    caller.abort();

    await expect(call).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(cancelled).toBe(true);
  });

  it("imports the server's read-only and destructive hints, under the metadata you give", async () => {
    const transport = await serve(
      [
        { name: 'read', inputSchema: objectSchema, annotations: { readOnlyHint: true } },
        { name: 'wipe', inputSchema: objectSchema, annotations: { readOnlyHint: false, destructiveHint: true } },
        { name: 'plain', inputSchema: objectSchema },
      ],
      async () => 'ok'
    );
    const connection = await connectMcpServer({ name: 'crm', transport: { type: 'custom', transport } });
    closers.push(() => connection.close());

    expect(connection.tools.map((tool) => [tool.name, tool.metadata])).toEqual([
      ['read', { readOnly: true }],
      ['wipe', { readOnly: false, riskLevel: 'high' }],
      ['plain', undefined],
    ]);

    const overridden = await connectMcpServer({
      name: 'crm',
      transport: { type: 'custom', transport: await serve([{ name: 'wipe', inputSchema: objectSchema, annotations: { destructiveHint: true } }], async () => 'ok') },
      metadata: { riskLevel: 'medium', requiresApproval: true, readOnly: undefined },
    });
    closers.push(() => overridden.close());
    expect(overridden.tools[0]?.metadata).toEqual({ riskLevel: 'medium', requiresApproval: true });

    // Your metadata says it is not read-only: the server's destructive hint then applies.
    const writable = await connectMcpServer({
      name: 'crm',
      transport: {
        type: 'custom',
        transport: await serve(
          [{ name: 'wipe', inputSchema: objectSchema, annotations: { readOnlyHint: true, destructiveHint: true } }],
          async () => 'ok'
        ),
      },
      metadata: { readOnly: false },
    });
    closers.push(() => writable.close());
    expect(writable.tools[0]?.metadata).toEqual({ readOnly: false, riskLevel: 'high' });
  });

  it('leaves no listener on the caller\'s signal once a call is over', async () => {
    const transport = await serve([{ name: 'lookup', inputSchema: objectSchema }], async () => 'ok');
    const connection = await connectMcpServer({ name: 'crm', transport: { type: 'custom', transport } });
    closers.push(() => connection.close());
    const env = createTestSDK();
    environments.push(env);
    for (const tool of connection.tools) env.sdk.defineTool(tool);

    // One signal for a whole run: its calls must not pile listeners up on it.
    const run = new AbortController();
    for (let call = 0; call < 3; call++) {
      await expect(env.sdk.executeTool('lookup', {}, { signal: run.signal })).resolves.toBe('ok');
    }
    expect(getEventListeners(run.signal, 'abort')).toHaveLength(0);
  });

  it('refuses invalid arguments before asking for an approval', async () => {
    const transport = await serve(
      [{ name: 'wipe', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } }],
      async () => 'wiped'
    );
    const connection = await connectMcpServer({
      name: 'crm',
      transport: { type: 'custom', transport },
      metadata: { requiresApproval: true },
    });
    closers.push(() => connection.close());
    const env = createTestSDK();
    environments.push(env);
    for (const tool of connection.tools) env.sdk.defineTool(tool);

    const call = env.sdk.executeTool('wipe', { id: 7 });
    const waited = new Promise((resolve) => setTimeout(() => resolve('still waiting'), 1_000));
    await expect(Promise.race([call, waited])).rejects.toMatchObject({
      originalError: expect.objectContaining({ message: expect.stringMatching(/id: expected string, got number/) }),
    });
    expect(env.sdk.getPendingApprovals()).toEqual([]);
  });

  it("checks the arguments against the server's inputSchema before any policy, unless told not to", async () => {
    const received: unknown[] = [];
    const inputSchema = {
      type: 'object',
      properties: { id: { type: 'string' }, count: { type: 'integer', minimum: 1 } },
      required: ['id'],
      additionalProperties: false,
    };
    const answer = async (_name: string, args: unknown) => {
      received.push(args);
      return 'ok';
    };
    const checked = await connectMcpServer({
      name: 'crm',
      transport: { type: 'custom', transport: await serve([{ name: 'lookup', inputSchema }], answer) },
    });
    const unchecked = await connectMcpServer({
      name: 'raw',
      toolPrefix: 'raw_',
      validateArguments: false,
      transport: { type: 'custom', transport: await serve([{ name: 'lookup', inputSchema }], answer) },
    });
    closers.push(() => checked.close(), () => unchecked.close());
    const env = createTestSDK();
    environments.push(env);
    for (const tool of [...checked.tools, ...unchecked.tools]) env.sdk.defineTool(tool);

    // Refused as invalid arguments (a ValidationError inside the ToolExecutionError).
    const refusal = (pattern: RegExp) => ({
      originalError: expect.objectContaining({ name: 'ValidationError', message: expect.stringMatching(pattern) }),
    });
    await expect(env.sdk.executeTool('lookup', { id: 42, count: 0, extra: true })).rejects.toMatchObject(
      refusal(/id: expected string, got number, count: at least 1, extra: unknown argument/)
    );
    await expect(env.sdk.executeTool('lookup', {})).rejects.toMatchObject(refusal(/id: required/));
    expect(received).toEqual([]);

    await expect(env.sdk.executeTool('lookup', { id: 'c-1', count: 2 })).resolves.toBe('ok');
    await expect(env.sdk.executeTool('raw_lookup', { id: 42 })).resolves.toBe('ok');
    expect(received).toEqual([{ id: 'c-1', count: 2 }, { id: 42 }]);
  });
});

describe('jsonSchemaProblems', () => {
  it('checks the keywords it knows and leaves the others to the owner of the schema', () => {
    const schema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string', maxLength: 3 }, maxItems: 2 },
        mode: { enum: ['fast', 'safe'] },
        limit: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
        ref: { $ref: '#/definitions/anything' },
        code: { type: 'string', pattern: '^[0-9]+$' },
      },
    };

    expect(jsonSchemaProblems(schema, { tags: ['a', 'abcd', 'b'], mode: 'slow', limit: 1.5 })).toEqual([
      { path: ['tags'], message: 'at most 2 items' },
      { path: ['tags', 1], message: 'at most 3 characters' },
      { path: ['mode'], message: 'expected one of "fast", "safe"' },
      { path: ['limit'], message: 'matches none of the anyOf schemas' },
    ]);
    expect(jsonSchemaProblems(schema, { tags: ['a'], mode: 'fast', limit: null, ref: 5, code: 'x' })).toEqual([]);
    expect(jsonSchemaProblems({ type: 'object' }, [])).toEqual([{ path: [], message: 'expected object, got array' }]);
  });

  it("accepts null where OpenAPI's nullable allows it", () => {
    const schema = {
      type: 'object',
      properties: {
        owner: { type: 'string', nullable: true },
        status: { type: 'string', enum: ['open', 'done'], nullable: true },
        filter: { type: 'object', properties: { since: { type: 'string', nullable: true } } },
        name: { type: 'string' },
      },
    };

    expect(jsonSchemaProblems(schema, { owner: null, status: null, filter: { since: null } })).toEqual([]);
    expect(jsonSchemaProblems(schema, { name: null })).toEqual([{ path: ['name'], message: 'expected string, got null' }]);
  });

  it('reads prefixItems as JSON Schema 2020-12 does: items only covers the items after them', () => {
    const withRest = { type: 'array', prefixItems: [{ type: 'string' }], items: { type: 'number' } };
    const closed = { type: 'array', prefixItems: [{ type: 'string' }, { type: 'integer' }], items: false };

    expect(jsonSchemaProblems(withRest, ['x', 1, 2])).toEqual([]);
    expect(jsonSchemaProblems(withRest, [1, 'y'])).toEqual([
      { path: [0], message: 'expected string, got number' },
      { path: [1], message: 'expected number, got string' },
    ]);
    expect(jsonSchemaProblems(closed, ['a', 1])).toEqual([]);
    expect(jsonSchemaProblems(closed, ['a', 1, true])).toEqual([{ path: [2], message: 'no value is allowed here' }]);
  });

  it('reads a key set to undefined as absent, as JSON does', () => {
    const schema = {
      type: 'object',
      properties: { id: { type: 'string' }, limit: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    };

    expect(jsonSchemaProblems(schema, { id: 'c-1', limit: undefined, note: undefined })).toEqual([]);
    expect(jsonSchemaProblems(schema, { id: undefined })).toEqual([{ path: ['id'], message: 'required' }]);
  });
});
