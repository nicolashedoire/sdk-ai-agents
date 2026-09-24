import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PolicyViolationError, SDKError, ToolExecutionError } from '../errors/index.js';
import { defineTool } from '../sdk.js';
import type { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

describe('Integration Tests - End-to-End', () => {
  let env: TestSDK | undefined;

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
  });

  /** SDK with a scripted model and a file event store in a throwaway directory. */
  function open(provider = new ScriptedLLMProvider()): TestSDK {
    env = createTestSDK({}, provider);
    return env;
  }

  async function seed(store: FileEventStore, events: Event[]): Promise<void> {
    for (const event of events) {
      await store.append(event.runId, { ...event });
    }
  }

  async function types(store: FileEventStore, runId: string): Promise<string[]> {
    return (await store.getEvents(runId)).map((event) => event.type);
  }

  /** Messages of an error and of the errors it wraps, outermost first. */
  function causes(error: Error | undefined): string[] {
    const messages: string[] = [];
    for (let current = error; current; ) {
      messages.push(current.message);
      current = current instanceof SDKError ? current.originalError : undefined;
    }
    return messages;
  }

  describe('Complete Agent Execution Flow', () => {
    it('should create agent successfully', async () => {
      const provider = new ScriptedLLMProvider().enqueue(
        'tool-selection',
        { toolCall: { name: 'calculator', arguments: { a: 2, b: 3, operation: 'add' } } },
        { content: 'The result is 5' }
      );
      const { sdk, store } = open(provider);

      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Calculator',
        schema: z.object({
          a: z.number(),
          b: z.number(),
          operation: z.enum(['add', 'subtract']),
        }),
        handler: async ({ a, b, operation }) => (operation === 'add' ? a + b : a - b),
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [calculatorTool],
      });

      expect(typeof agent.run).toBe('function');
      expect(typeof agent.addTools).toBe('function');
      expect(typeof agent.setPolicy).toBe('function');

      const result = await agent.run({ message: 'What is 2 + 3?' });

      expect(result).toMatchObject({ status: 'completed', output: 'The result is 5' });
      expect(await types(store, result.runId)).toEqual([
        'run.started',
        'intention.generated',
        'action.executing',
        'policy.checked',
        'tool.called',
        'action.executed',
        'intention.generated',
        'run.completed',
      ]);
      const [executed] = await store.getEvents(result.runId, { type: 'action.executed' });
      expect(executed?.data).toMatchObject({
        toolName: 'calculator',
        parameters: { a: 2, b: 3, operation: 'add' },
        result: 5,
      });
      // The model is given the tool result before it answers.
      expect(provider.requests).toHaveLength(2);
      expect(provider.requests[1]?.messages.at(-1)?.content).toBe(
        'Previous tool result: 5. Continue.'
      );
    });
  });

  describe('Policy Enforcement Flow', () => {
    it('should enforce allowlist policy', async () => {
      const provider = new ScriptedLLMProvider().enqueue(
        'tool-selection',
        { toolCall: { name: 'allowed-tool', arguments: {} } },
        { content: 'Allowed tool used' },
        { toolCall: { name: 'blocked-tool', arguments: {} } }
      );
      const { sdk, store } = open(provider);
      const executed: string[] = [];

      const tool1 = defineTool({
        name: 'allowed-tool',
        description: 'Allowed',
        schema: z.object({}),
        handler: async () => {
          executed.push('allowed-tool');
          return 'allowed';
        },
      });

      const tool2 = defineTool({
        name: 'blocked-tool',
        description: 'Blocked',
        schema: z.object({}),
        handler: async () => {
          executed.push('blocked-tool');
          return 'blocked';
        },
      });

      sdk.defineGlobalPolicy({
        id: 'allowlist-policy',
        type: 'allowlist',
        rules: [
          {
            condition: 'allowedTools',
            action: 'deny',
            metadata: { tools: ['allowed-tool'] },
          },
        ],
        scope: 'global',
        enabled: true,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [tool1, tool2],
      });

      const allowed = await agent.run({ message: 'Use the allowed tool' });
      const blocked = await agent.run({ message: 'Use the blocked tool' });

      expect(allowed).toMatchObject({ status: 'completed', output: 'Allowed tool used' });
      expect(blocked.status).toBe('failed');
      expect(blocked.error).toBeInstanceOf(PolicyViolationError);
      expect(blocked.error?.message).toBe(
        'Policy violation: allowlist-policy - Tool "blocked-tool" not in allowlist'
      );
      expect(executed).toEqual(['allowed-tool']);

      const violations = await store.getEvents(blocked.runId, { type: 'policy.violated' });
      expect(violations.map((event) => event.data)).toEqual([
        expect.objectContaining({
          reason: 'Tool "blocked-tool" not in allowlist',
          violatedPolicies: ['allowlist-policy'],
        }),
      ]);
      expect(await store.getEvents(blocked.runId, { type: 'tool.called' })).toEqual([]);
      expect(await store.getEvents(allowed.runId, { type: 'policy.violated' })).toEqual([]);
      const [failed] = await store.getEvents(blocked.runId, { type: 'run.failed' });
      expect(failed?.data.error).toBe(blocked.error?.message);
    });
  });

  describe('Replay Flow', () => {
    it('should replay execution from events', async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'original-run',
          type: 'run.started',
          timestamp: 1000,
          data: { input: { message: 'test' } },
          metadata: { agentId: 'agent-1' },
        },
        {
          id: 'evt-2',
          runId: 'original-run',
          type: 'intention.generated',
          timestamp: 2000,
          data: {
            intention: {
              type: 'tool_call',
              toolName: 'test-tool',
              parameters: { value: 'test' },
            },
          },
          metadata: { agentId: 'agent-1' },
        },
        {
          id: 'evt-3',
          runId: 'original-run',
          type: 'run.completed',
          timestamp: 3000,
          data: { output: 'result' },
          metadata: { agentId: 'agent-1' },
        },
      ];
      const { sdk, store, provider } = open();
      await seed(store, events);
      const processed: string[] = [];

      const tool = defineTool({
        name: 'test-tool',
        description: 'Test',
        schema: z.object({
          value: z.string(),
        }),
        handler: async ({ value }) => {
          processed.push(value);
          return { result: `Processed: ${value}` };
        },
      });

      sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [tool],
      });

      const replay = await sdk.replay('original-run');

      expect(replay.runId).not.toBe('original-run');
      expect(replay).toMatchObject({
        status: 'completed',
        output: JSON.stringify({ result: 'Processed: test' }),
      });
      // The recorded intention is executed again, without asking the model.
      expect(processed).toEqual(['test']);
      expect(provider.requests).toEqual([]);

      const replayed = await store.getEvents(replay.runId);
      expect(replayed.map((event) => event.type)).toEqual([
        'run.started',
        'action.executing',
        'policy.checked',
        'tool.called',
        'action.executed',
        'run.completed',
      ]);
      expect(replayed[0]?.data).toEqual({ input: { message: 'test' }, replayOf: 'original-run' });
      expect(replayed.find((event) => event.type === 'tool.called')?.data).toEqual({
        toolName: 'test-tool',
        parameters: { value: 'test' },
      });
      expect(replayed.at(-1)?.data).toEqual({
        output: { result: 'Processed: test' },
        replayOf: 'original-run',
      });
      // Start and actions are attributed to the recorded agent (the closing event carries no
      // metadata in the current engine, so it is not checked here).
      expect(replayed.slice(0, -1).every((event) => event.metadata?.agentId === 'agent-1')).toBe(
        true
      );
      // The original run is left as it was.
      expect(await store.getEvents('original-run')).toEqual(events);
    });
  });

  describe('Trace Export Flow', () => {
    it('should export trace in JSON format', async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
        {
          id: 'evt-2',
          runId: 'run-1',
          type: 'run.completed',
          timestamp: 2000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
      ];
      const { sdk, store } = open();
      await seed(store, events);

      const trace = await sdk.getTrace('run-1');
      const exported = await sdk.exportTrace('run-1', 'json');

      expect(trace).toEqual({
        runId: 'run-1',
        agentId: 'agent-1',
        status: 'completed',
        events,
        timeline: [
          { timestamp: 1000, type: 'run.started', description: 'Run started' },
          { timestamp: 2000, type: 'run.completed', description: 'Run completed' },
        ],
        summary: {
          totalEvents: 2,
          duration: 1000,
          intentionsGenerated: 0,
          actionsExecuted: 0,
          policiesChecked: 0,
          toolsCalled: 0,
        },
      });
      expect(JSON.parse(exported)).toEqual(trace);
    });

    it('should export trace in text format', async () => {
      const events: Event[] = [
        {
          id: 'evt-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
      ];
      const { sdk, store } = open();
      await seed(store, events);

      const exported = await sdk.exportTrace('run-1', 'text');

      expect(exported).toBe(
        [
          'Trace for runId: run-1',
          'Agent: agent-1',
          'Status: running',
          'Duration: 0ms',
          'Total Events: 1',
          '',
          'Timeline:',
          '  [1970-01-01T00:00:01.000Z] run.started: Run started',
        ].join('\n')
      );
    });
  });

  describe('Error Handling Flow', () => {
    it('should handle tool execution errors gracefully', async () => {
      const provider = new ScriptedLLMProvider().enqueue('tool-selection', {
        toolCall: { name: 'error-tool', arguments: {} },
      });
      const { sdk, store } = open(provider);

      const errorTool = defineTool({
        name: 'error-tool',
        description: 'Error tool',
        schema: z.object({}),
        handler: async () => {
          throw new Error('disk is full');
        },
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [errorTool],
      });

      // The failure ends the run with a result instead of throwing out of `run`.
      const result = await agent.run({ message: 'Call the failing tool' });

      expect(result.status).toBe('failed');
      expect(result.error).toBeInstanceOf(ToolExecutionError);
      expect(result.error?.message).toBe('Tool execution failed: error-tool');
      // The handler's own error stays reachable from the error the run returns.
      expect(causes(result.error)).toContain('disk is full');
      expect(await types(store, result.runId)).toEqual([
        'run.started',
        'intention.generated',
        'action.executing',
        'policy.checked',
        'tool.called',
        'action.failed',
        'run.failed',
      ]);
      const [actionFailed] = await store.getEvents(result.runId, { type: 'action.failed' });
      expect(actionFailed?.data).toMatchObject({ toolName: 'error-tool', parameters: {} });
      const [runFailed] = await store.getEvents(result.runId, { type: 'run.failed' });
      expect(runFailed?.data.error).toBe('Tool execution failed: error-tool');
      expect((await sdk.getTrace(result.runId)).status).toBe('failed');
    });

    it('should handle policy violations', async () => {
      const provider = new ScriptedLLMProvider().enqueue('tool-selection', {
        toolCall: { name: 'costly-tool', arguments: {} },
      });
      const { sdk, store } = open(provider);
      const executed: string[] = [];
      const costlyTool = defineTool({
        name: 'costly-tool',
        description: 'Spends budget',
        schema: z.object({}),
        handler: async () => {
          executed.push('costly-tool');
          return 'spent';
        },
      });

      // No tool call is within budget.
      sdk.defineGlobalPolicy({
        id: 'strict-policy',
        type: 'budget',
        rules: [
          {
            condition: 'budgetLimit',
            action: 'deny',
            metadata: { budgetLimit: { period: 'all', maxToolCalls: 0 } },
          },
        ],
        scope: 'global',
        enabled: true,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        tools: [costlyTool],
      });

      const result = await agent.run({ message: 'Spend' });

      expect(result.status).toBe('failed');
      expect(result.error).toBeInstanceOf(PolicyViolationError);
      expect(result.error).toMatchObject({ policyId: 'strict-policy' });
      expect(executed).toEqual([]);
      const violations = await store.getEvents(result.runId, { type: 'policy.violated' });
      expect(violations.map((event) => event.data.violatedPolicies)).toEqual([['strict-policy']]);
      expect(await store.getEvents(result.runId, { type: 'tool.called' })).toEqual([]);
      expect((await store.getEvents(result.runId)).at(-1)?.type).toBe('run.failed');
    });
  });

  describe('Multiple Agents Flow', () => {
    it('should handle multiple agents independently', async () => {
      const provider = new ScriptedLLMProvider().always('default', { content: 'Answered' });
      const { sdk, store } = open(provider);

      const agent1 = sdk.createAgent({
        name: 'agent-1',
        model: 'gpt-4',
      });

      const agent2 = sdk.createAgent({
        name: 'agent-2',
        model: 'gpt-4',
      });

      expect(agent1).not.toBe(agent2);
      expect(agent1.id).not.toBe(agent2.id);
      expect([agent1.name, agent2.name]).toEqual(['agent-1', 'agent-2']);

      const [first, second] = await Promise.all([
        agent1.run({ message: 'first question' }),
        agent2.run({ message: 'second question' }),
      ]);

      expect(first.runId).not.toBe(second.runId);
      for (const [agent, result, message] of [
        [agent1, first, 'first question'],
        [agent2, second, 'second question'],
      ] as const) {
        expect(result.status).toBe('completed');
        const events = await store.getEvents(result.runId);
        expect(events.map((event) => event.type)).toEqual([
          'run.started',
          'intention.generated',
          'run.completed',
        ]);
        expect(events.every((event) => event.metadata?.agentId === agent.id)).toBe(true);
        expect(events[0]?.data.input).toEqual({ message });
        expect((await sdk.getTrace(result.runId)).agentId).toBe(agent.id);
      }
    });

    it('should apply agent-specific policies', async () => {
      const provider = new ScriptedLLMProvider().enqueue(
        'tool-selection',
        { toolCall: { name: 'shared-tool', arguments: {} } },
        { toolCall: { name: 'shared-tool', arguments: {} } },
        { content: 'Done' }
      );
      const { sdk, store } = open(provider);
      const callers: string[] = [];
      const sharedTool = defineTool({
        name: 'shared-tool',
        description: 'Used by both agents',
        schema: z.object({}),
        handler: async (_params, context) => {
          callers.push(context?.agentId ?? 'unknown');
          return 'ok';
        },
      });

      // Agent 1 may not call any tool; agent 2 has no policy of its own.
      const agent1 = sdk.createAgent({
        name: 'agent-1',
        model: 'gpt-4',
        tools: [sharedTool],
        policies: [
          {
            id: 'agent-1-policy',
            type: 'budget',
            rules: [
              {
                condition: 'budgetLimit',
                action: 'deny',
                metadata: { budgetLimit: { period: 'all', maxToolCalls: 0 } },
              },
            ],
            scope: 'agent',
            enabled: true,
          },
        ],
      });

      const agent2 = sdk.createAgent({
        name: 'agent-2',
        model: 'gpt-4',
        tools: [sharedTool],
      });

      const refused = await agent1.run({ message: 'Use the tool' });
      const allowed = await agent2.run({ message: 'Use the tool' });

      expect(refused.status).toBe('failed');
      expect(refused.error).toMatchObject({ policyId: 'agent-1-policy' });
      expect(allowed).toMatchObject({ status: 'completed', output: 'Done' });
      expect(callers).toEqual([agent2.id]);
      expect(sdk.getPolicyAuditTrail(refused.runId).map((entry) => entry.policyId)).toEqual([
        'agent-1-policy',
      ]);
      expect(sdk.getPolicyAuditTrail(allowed.runId)).toEqual([]);
      const violations = await store.getEvents(refused.runId, { type: 'policy.violated' });
      expect(violations.map((event) => event.data.violatedPolicies)).toEqual([['agent-1-policy']]);
      expect(await store.getEvents(allowed.runId, { type: 'policy.violated' })).toEqual([]);
    });
  });
});
