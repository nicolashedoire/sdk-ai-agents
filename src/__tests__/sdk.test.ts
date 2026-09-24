import { existsSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyViolationError } from '../errors/index.js';
import { createSDK, defineTool, type SDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { SDKConfig } from '../types/sdk.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';

/** Undone after each test, most recent first: a store is closed before its folder is removed. */
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) {
    await cleanup();
  }
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'sdk-test-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true, maxRetries: 5 }));
  return directory;
}

function temporaryStore(directory: string, name = 'events'): FileEventStore {
  const store = new FileEventStore(join(directory, name));
  cleanups.push(() => store.destroy());
  return store;
}

/** SDK recording its events in a file store of a throwaway directory. */
function openSDK(config: SDKConfig): { sdk: SDK; store: FileEventStore } {
  const store = temporaryStore(temporaryDirectory());
  return { sdk: createSDK({ ...config, eventStore: store }), store };
}

/** The only run recorded by the store (tool calls made outside a run open their own). */
async function onlyRunId(store: FileEventStore): Promise<string> {
  const runIds = await store.getRunIds();
  expect(runIds).toHaveLength(1);
  const [runId] = runIds;
  if (runId === undefined) throw new Error('no run recorded');
  return runId;
}

const echoDefinition = {
  name: 'echo',
  description: 'Repeats a text',
  schema: z.object({ text: z.string() }),
  handler: async ({ text }: { text: string }) => ({ echoed: text }),
};

describe('SDK', () => {
  describe('createSDK', () => {
    it('should create SDK instance', async () => {
      const { sdk } = openSDK({ apiKey: 'test-key' });

      expect(typeof sdk.createAgent).toBe('function');
      expect(typeof sdk.defineTool).toBe('function');
      expect(typeof sdk.replay).toBe('function');
      expect(typeof sdk.getTrace).toBe('function');
      // Working instance: it answers from its store, which holds no run yet.
      await expect(sdk.getTrace('missing-run')).rejects.toThrow(
        'No trace found for runId: missing-run'
      );
      await expect(sdk.replay('missing-run')).rejects.toThrow(
        'No events found for runId: missing-run'
      );
    });

    it('should use custom event store if provided', async () => {
      const directory = temporaryDirectory();
      const customStore = temporaryStore(directory, 'custom-events');
      const sdk = createSDK({ apiKey: 'test-key', eventStore: customStore });
      sdk.defineTool(echoDefinition);

      await expect(sdk.executeTool('echo', { text: 'hi' }, { agentId: 'caller' })).resolves.toEqual(
        { echoed: 'hi' }
      );

      const runId = await onlyRunId(customStore);
      expect(existsSync(join(directory, 'custom-events', `${runId}.json`))).toBe(true);
      const events = await customStore.getEvents(runId);
      expect(events.map((event) => event.type)).toEqual([
        'run.started',
        'action.executing',
        'policy.checked',
        'tool.called',
        'action.executed',
        'run.completed',
      ]);
      expect(events.every((event) => event.metadata?.agentId === 'caller')).toBe(true);
      expect(events.at(-1)?.data.output).toEqual({ echoed: 'hi' });
      // The SDK reads its traces back from that same store.
      const trace = await sdk.getTrace(runId);
      expect(trace.events).toEqual(events);
      expect(trace.status).toBe('completed');
    });

    it('should apply default policies if provided', async () => {
      const { sdk, store } = openSDK({
        apiKey: 'test-key',
        defaultPolicies: [
          {
            id: 'default-1',
            type: 'budget',
            rules: [],
            scope: 'global',
            enabled: true,
          },
          {
            id: 'default-allowlist',
            type: 'allowlist',
            rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['echo'] } }],
            scope: 'global',
            enabled: true,
          },
        ],
      });
      sdk.defineTool(echoDefinition);
      const refusedRuns: string[] = [];
      sdk.defineTool({
        name: 'unlisted',
        description: 'Not in the default allowlist',
        schema: z.object({}),
        handler: async (_params, context) => {
          refusedRuns.push(context?.runId ?? 'unknown');
          return 'ran';
        },
      });

      await sdk.executeTool('echo', { text: 'hi' });
      const runId = await onlyRunId(store);
      const audit = sdk.getPolicyAuditTrail(runId);
      expect(audit.map((entry) => entry.policyId)).toEqual(['default-1', 'default-allowlist']);
      expect(audit.every((entry) => entry.validationResult.allowed && !entry.applied)).toBe(true);
      const recorded = await store.getEvents(runId, { type: 'policy.checked' });
      expect(recorded.map((event) => event.data.policyId)).toEqual(
        expect.arrayContaining(['default-1', 'default-allowlist'])
      );

      const refusal = await sdk.executeTool('unlisted', {}).catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(PolicyViolationError);
      expect(refusal).toMatchObject({
        policyId: 'default-allowlist',
        reason: 'Tool "unlisted" not in allowlist',
      });
      expect(refusedRuns).toEqual([]);
    });
  });

  describe('createAgent', () => {
    it('should create agent successfully', async () => {
      const provider = new ScriptedLLMProvider().always('default', { content: 'Hello!' });
      const { sdk, store } = openSDK({ llmProvider: provider });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
      });

      expect(agent.name).toBe('test-agent');
      expect(agent.id).toMatch(/^[0-9a-f-]{36}$/);
      const result = await agent.run({ message: 'Hi' });
      expect(result).toMatchObject({ status: 'completed', output: 'Hello!' });
      expect(provider.requests.map((request) => request.model)).toEqual(['gpt-4']);
      const events = await store.getEvents(result.runId);
      expect(events.map((event) => event.type)).toEqual([
        'run.started',
        'intention.generated',
        'run.completed',
      ]);
      expect(events.every((event) => event.metadata?.agentId === agent.id)).toBe(true);
    });

    it('should register tools when creating agent', async () => {
      const provider = new ScriptedLLMProvider().enqueue(
        'tool-selection',
        { toolCall: { name: 'test-tool', arguments: {} } },
        { content: 'Done' }
      );
      const { sdk, store } = openSDK({ llmProvider: provider });
      const calls: string[] = [];
      const tool = defineTool({
        name: 'test-tool',
        description: 'Test',
        schema: z.object({}),
        handler: async (_params, context) => {
          calls.push(context?.agentId ?? 'unknown');
          return { ok: true };
        },
      });
      expect(sdk.listTools()).toEqual([]);

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [tool],
      });

      expect(sdk.listTools().map((registered) => registered.name)).toEqual(['test-tool']);
      const result = await agent.run({ message: 'Use the tool' });
      expect(result).toMatchObject({ status: 'completed', output: 'Done' });
      expect(calls).toEqual([agent.id]);
      expect(provider.requests[0]?.tools?.map((offered) => offered.function.name)).toEqual([
        'test-tool',
      ]);
      const toolEvents = await store.getEvents(result.runId, { type: 'action.executed' });
      expect(toolEvents.map((event) => [event.data.toolName, event.data.result])).toEqual([
        ['test-tool', { ok: true }],
      ]);
    });
  });

  describe('defineTool', () => {
    it('should define tool successfully', async () => {
      const { sdk } = openSDK({ apiKey: 'test-key' });

      const tool = sdk.defineTool({
        name: 'calculator',
        description: 'Calculator',
        schema: z.object({
          a: z.number(),
          b: z.number(),
        }),
        handler: async ({ a, b }) => a + b,
      });

      expect(tool.name).toBe('calculator');
      expect(tool.version).toBe('1.0.0');
      expect(sdk.listTools()).toEqual([tool]);
      await expect(sdk.executeTool('calculator', { a: 2, b: 3 })).resolves.toBe(5);
      await expect(sdk.executeTool('calculator', { a: 2, b: 'three' })).rejects.toThrow(
        'Tool execution failed: calculator'
      );
    });
  });

  describe('defineGlobalPolicy', () => {
    it('should define global policy', async () => {
      const { sdk, store } = openSDK({ apiKey: 'test-key' });
      sdk.defineTool(echoDefinition);
      await sdk.executeTool('echo', { text: 'before' });
      const before = await onlyRunId(store);

      sdk.defineGlobalPolicy({
        id: 'policy-1',
        type: 'budget',
        rules: [],
        scope: 'global',
        enabled: true,
      });
      await sdk.executeTool('echo', { text: 'after' });

      const after = (await store.getRunIds()).filter((runId) => runId !== before);
      expect(after).toHaveLength(1);
      expect(sdk.getPolicyAuditTrail(before)).toEqual([]);
      const audit = sdk.getPolicyAuditTrail(after[0] ?? '');
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        policyId: 'policy-1',
        policyType: 'budget',
        applied: false,
        validationResult: { allowed: true },
      });
    });
  });
});

describe('defineTool', () => {
  it('should create tool definition', async () => {
    const schema = z.object({});
    const tool = defineTool({
      name: 'test',
      description: 'Test tool',
      schema,
      handler: async () => ({ done: true }),
    });

    expect(tool).toMatchObject({ name: 'test', description: 'Test tool', version: '1.0.0' });
    expect(tool.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(tool.schema).toBe(schema);
    await expect(tool.handler({})).resolves.toEqual({ done: true });
  });
});
