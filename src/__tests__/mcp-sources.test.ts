import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMcpServer, type McpServerOptions } from '../mcp.js';
import { createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { cognitiveAgentTool } from '../tools/agent-tools.js';
import { folderResources, folderTools } from '../tools/folder-tools.js';
import { openApiTools } from '../tools/openapi-tools.js';
import type { Event } from '../types/events.js';
import type { ToolDefinition } from '../types/tool.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, lookupMetricDefinition, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mcp-sources-'));
  mkdirSync(join(root, 'guide'));
  writeFileSync(join(root, 'guide', 'onboarding.md'), 'Day one: get your badge.\n');
  writeFileSync(join(root, '.env'), 'SECRET=1');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function text(result: unknown): string {
  const content: unknown = typeof result === 'object' && result !== null ? Reflect.get(result, 'content') : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  const value: unknown = typeof first === 'object' && first !== null ? Reflect.get(first, 'text') : undefined;
  return typeof value === 'string' ? value : '';
}

describe('MCP servers from tool sources', () => {
  const environments: TestSDK[] = [];
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
    for (const env of environments.splice(0)) await env.dispose();
  });

  function environment(): TestSDK {
    const env = createTestSDK();
    environments.push(env);
    return env;
  }

  async function connect(env: TestSDK, options: McpServerOptions): Promise<Client> {
    const server = createMcpServer(env.sdk, options);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    closers.push(() => client.close(), () => server.close());
    return client;
  }

  async function allEvents(env: TestSDK): Promise<Event[]> {
    const runIds = await env.store.getRunIds();
    return (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat();
  }

  it('serves tool definitions in one line: defined on the SDK, exposed, and nothing else', async () => {
    const env = environment();
    env.sdk.defineTool({ name: 'internal_only', description: 'Not for MCP', schema: z.object({}), handler: async () => 'secret' });
    const definitions = folderTools({ root, name: 'handbook' });

    const client = await connect(env, { name: 'handbook', tools: definitions });

    const listed = await client.listTools();
    expect(listed.tools.map((tool) => [tool.name, tool.annotations?.readOnlyHint])).toEqual([
      ['list_files', true],
      ['read_file', true],
      ['search_files', true],
    ]);
    const read = await client.callTool({ name: 'read_file', arguments: { path: 'guide/onboarding.md' } });
    expect(JSON.parse(text(read))).toMatchObject({ content: 'Day one: get your badge.\n' });
    // Refusals of the input say why, so the model can correct its call.
    const escape = await client.callTool({ name: 'read_file', arguments: { path: '../../etc/passwd' } });
    expect(escape.isError).toBe(true);
    expect(text(escape)).toBe(
      'Tool execution failed: read_file: Validation failed: path - "../../etc/passwd" is outside the shared folder'
    );
    const hidden = await client.callTool({ name: 'internal_only', arguments: {} });
    expect(text(hidden)).toBe('Tool "internal_only" is not exposed by this server');

    // A second server (one per HTTP session) reuses the same definitions…
    await expect(connect(env, { name: 'handbook', tools: definitions })).resolves.toBeDefined();
    // …but another tool with a name already taken is refused.
    expect(() => createMcpServer(env.sdk, { name: 'x', tools: folderTools({ root }) })).toThrow('Another tool named "list_files"');
  });

  it('lists and reads folder resources, and records every read in the event log', async () => {
    const env = environment();
    const client = await connect(env, {
      name: 'handbook',
      tools: [],
      resources: folderResources({ root, name: 'handbook' }),
    });

    const { resources } = await client.listResources();
    expect(resources).toEqual([
      { uri: 'folder://handbook/guide/onboarding.md', name: 'guide/onboarding.md', mimeType: 'text/markdown', size: 25 },
    ]);
    const read = await client.readResource({ uri: 'folder://handbook/guide/onboarding.md' });
    expect(read.contents).toEqual([
      { uri: 'folder://handbook/guide/onboarding.md', mimeType: 'text/markdown', text: 'Day one: get your badge.\n' },
    ]);
    await expect(client.readResource({ uri: 'folder://handbook/.env' })).rejects.toThrow('was not found');
    await expect(client.readResource({ uri: 'folder://handbook/..%2F..%2Fetc%2Fpasswd' })).rejects.toThrow('outside the shared folder');
    await expect(client.readResource({ uri: 'file:///etc/passwd' })).rejects.toThrow('Unknown resource file:///etc/passwd');

    const events = await allEvents(env);
    const reads = events.filter((event) => event.type === 'resource.read');
    expect(reads).toHaveLength(1);
    expect(reads[0]?.data).toMatchObject({ uri: 'folder://handbook/guide/onboarding.md', bytes: 25, sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(reads[0]?.metadata?.agentId).toBe('mcp:handbook');
    const failures = events.filter((event) => event.type === 'run.failed').map((event) => event.data.uri);
    expect(failures).toEqual(expect.arrayContaining(['folder://handbook/.env', 'file:///etc/passwd']));
  });

  it('keeps the cause of a failed resource listing on the server', async () => {
    const env = environment();
    const client = await connect(env, {
      name: 'broken',
      tools: [],
      resources: {
        handles: () => true,
        list: async () => {
          throw new Error('EACCES: permission denied, scandir /srv/private/hr');
        },
        read: async (uri) => ({ uri, text: '' }),
      },
    });

    const failure = await client.listResources().catch((error: unknown) => error);
    expect(String(failure)).toContain('Resources could not be listed');
    expect(String(failure)).not.toContain('/srv/private');
  });

  it('turns a web API into an MCP server whose write operations wait for approval', async () => {
    const api = new LocalHttpServer().reply({ status: 200, body: [{ id: 1, name: 'Rex' }] });
    closers.push(() => api.stop());
    const baseUrl = await api.start();
    const spec = {
      openapi: '3.1.0',
      info: { title: 'Pets' },
      paths: {
        '/pets': {
          get: { operationId: 'listPets', summary: 'List pets' },
          post: { operationId: 'createPet', requestBody: { content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
    };
    const env = environment();
    const client = await connect(env, {
      name: 'pets',
      tools: await openApiTools({ spec, baseUrl, include: ['listPets', 'createPet'] }),
    });

    const listed = await client.callTool({ name: 'listPets', arguments: {} });
    expect(JSON.parse(text(listed))).toEqual({ status: 200, data: [{ id: 1, name: 'Rex' }] });

    // The client gives up after 100 ms: the pending approval is cancelled, nothing is sent.
    await expect(client.callTool({ name: 'createPet', arguments: { body: { name: 'Tom' } } }, undefined, { timeout: 100 })).rejects.toThrow('Request timed out');
    for (let attempt = 0; attempt < 100 && env.sdk.getPendingApprovals().length > 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(env.sdk.getPendingApprovals()).toEqual([]);
    expect(api.requests.map((request) => request.method)).toEqual(['GET']);
    expect((await allEvents(env)).map((event) => event.type)).toEqual(expect.arrayContaining(['approval.requested', 'approval.rejected']));
  });

  it('applies policies to the MCP identity, such as a daily budget of calls', async () => {
    const env = environment();
    env.sdk.defineGlobalPolicy({
      id: 'handbook-daily-budget',
      type: 'budget',
      scope: 'global',
      enabled: true,
      rules: [
        {
          condition: 'budgetLimit',
          action: 'deny',
          metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 2 } },
        },
      ],
    });
    const client = await connect(env, { name: 'handbook', tools: folderTools({ root }) });

    const calls = [];
    for (let index = 0; index < 3; index++) {
      calls.push(await client.callTool({ name: 'list_files', arguments: {} }));
    }

    expect(calls.map((call) => call.isError ?? false)).toEqual([false, false, true]);
    expect(text(calls[2])).toContain('handbook-daily-budget');
  });

  it('exposes a cognitive agent that MCP clients can consult', async () => {
    const env = environment();
    scriptBuildOrBuy(env.provider);
    const analyst = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', tools: [env.sdk.defineTool(lookupMetricDefinition)] });
    const tool: ToolDefinition = cognitiveAgentTool(analyst, { description: 'How our analyst would decide' });
    const client = await connect(env, { name: 'analyst', tools: [tool] });

    const listed = await client.listTools();
    expect(listed.tools[0]).toMatchObject({
      name: 'ask_analyst',
      description: 'How our analyst would decide',
      inputSchema: { type: 'object', required: ['problem'], properties: { problem: { type: 'string' }, context: { type: 'object' } } },
    });
    const answer = await client.callTool({ name: 'ask_analyst', arguments: { problem: 'Build or buy?' } });
    expect(JSON.parse(text(answer))).toMatchObject({ status: 'completed', decisionStatus: 'committed', answer: expect.stringContaining('Buy') });
  });
});

describe('MCP cancellation', () => {
  it('stops the reasoning of an agent tool when the client gives up', async () => {
    const env = createTestSDK({}, scriptBuildOrBuy(new ScriptedLLMProvider({ delayMs: 30 })));
    const analyst = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });
    const server = createMcpServer(env.sdk, { name: 'analyst', tools: [cognitiveAgentTool(analyst)] });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
    try {
      await expect(client.callTool({ name: 'ask_analyst', arguments: { problem: 'Build or buy?' } }, undefined, { timeout: 60 })).rejects.toThrow(
        'Request timed out'
      );

      let types: string[] = [];
      for (let attempt = 0; attempt < 200 && !types.includes('run.cancelled'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        const runIds = await env.store.getRunIds();
        types = (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat().map((event) => event.type);
      }
      // The cognitive run was cancelled, not left to spend model calls for nobody.
      expect(types).toContain('run.cancelled');
      expect(types).not.toContain('cognition.concluded');
    } finally {
      await client.close();
      await server.close();
      await env.dispose();
    }
  }, 15_000);
});

describe('an SDK used as an MCP server', () => {
  it('creates no testing folders (golden traces, suites, assertions, analyses) until they are used', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'lazy-folders-'));
    const store = new FileEventStore(join(directory, 'events'));
    const folders = ['golden', 'suites', 'assertions', 'impact'].map((name) => join(directory, name));
    try {
      const sdk = createSDK({
        eventStore: store,
        goldenTracesDir: folders[0],
        regressionTestSuitesDir: folders[1],
        assertionsDir: folders[2],
        impactAnalysesDir: folders[3],
      });
      sdk.defineTool({ name: 'ping', description: 'Ping', schema: z.object({}), handler: async () => 'pong' });
      const server = createMcpServer(sdk, { name: 'ping', tools: ['ping'] });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);
      const client = new Client({ name: 'test-client', version: '1.0.0' });
      await client.connect(clientTransport);
      await client.callTool({ name: 'ping', arguments: {} });
      await client.close();
      await server.close();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(folders.filter((folder) => existsSync(folder))).toEqual([]);
      // They appear when used.
      await sdk.getGoldenTraces();
      expect(existsSync(folders[0] ?? '')).toBe(true);
    } finally {
      await store.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('an SDK without a language model', () => {
  it('runs tools and MCP servers, and explains what is missing when a model is needed', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'no-model-'));
    const store = new FileEventStore(join(directory, 'events'));
    try {
      const sdk = createSDK({ eventStore: store });
      sdk.defineTool({ name: 'ping', description: 'Ping', schema: z.object({}), handler: async () => 'pong' });

      await expect(sdk.executeTool('ping', {})).resolves.toBe('pong');
      const result = await sdk.createCognitiveAgent({ name: 'a', model: 'gpt-4o' }).think({ problem: 'Anything?' });
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('no language model is configured');
    } finally {
      await store.destroy();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
