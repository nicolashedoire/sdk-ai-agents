import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentImpl } from '../agent.js';
import { ActionEngine } from '../engines/action-engine.js';
import { PolicyEngine } from '../engines/policy-engine.js';
import { ReasoningEngine } from '../engines/reasoning-engine.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Agent } from '../types/agent.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';

// The agent runs its real reasoning and action engines; the model is a scripted provider.
// The agent offers its tool, so every model request is on the `tool-selection` channel.
const CHANNEL = 'tool-selection';

describe('AgentImpl', () => {
  let directory: string;
  let eventStore: FileEventStore;
  let policyEngine: PolicyEngine;
  let toolRegistry: ToolRegistry;
  let agentData: Agent;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-agent-'));
    eventStore = new FileEventStore(directory);
    policyEngine = new PolicyEngine();
    toolRegistry = new ToolRegistry();

    // The agent is given this tool: a governed agent may only run its own tools.
    const testTool = toolRegistry.registerTool({
      name: 'test-tool',
      description: 'Test tool',
      schema: z.object({ value: z.string() }),
      handler: async (params) => ({ result: `Processed: ${(params as { value: string }).value}` }),
    });

    agentData = {
      id: 'agent-1',
      name: 'test-agent',
      model: 'gpt-4',
      tools: [testTool],
      policies: [],
      config: { name: 'test-agent', model: 'gpt-4', maxSteps: 5, timeout: 30000 },
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      configHash: 'test-hash',
    };
  });

  afterEach(async () => {
    await eventStore.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function agentWith(provider: ScriptedLLMProvider): AgentImpl {
    const actionEngine = new ActionEngine(policyEngine, toolRegistry, eventStore);
    const reasoningEngine = new ReasoningEngine(provider, 'gpt-4');
    return new AgentImpl(agentData, reasoningEngine, actionEngine, policyEngine, eventStore);
  }

  describe('run', () => {
    it('should create run with events', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, { content: 'Test answer' });

      const result = await agentWith(provider).run({ message: 'test input' });

      expect(result.runId).toBeDefined();
      expect(result.status).toBe('completed');
      expect(result.output).toBe('Test answer');
      expect(provider.requests).toHaveLength(1);
      expect(provider.requests[0]?.model).toBe('gpt-4');
      expect(provider.requests[0]?.messages.at(-1)).toEqual({
        role: 'user',
        content: 'test input',
      });

      const types = (await eventStore.getEvents(result.runId)).map((event) => event.type);
      expect(types[0]).toBe('run.started');
      expect(types).toContain('intention.generated');
      expect(types.at(-1)).toBe('run.completed');
    });

    it('should send an empty first message as it is', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, { content: 'Hello' });

      const result = await agentWith(provider).run({ message: '' });

      expect(result.status).toBe('completed');
      // A request without any message would be refused by the vendor.
      expect(provider.requests[0]?.messages).toEqual([{ role: 'user', content: '' }]);
    });

    it('should respect maxSteps', async () => {
      agentData.config.maxSteps = 2;
      // An empty answer is a `continue` intention: the agent asks the model again.
      const provider = new ScriptedLLMProvider().always(CHANNEL, { content: '' });

      const result = await agentWith(provider).run({ message: 'test' });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Max steps');
      expect(provider.requests).toHaveLength(2);
    });

    it('should respect timeout', async () => {
      agentData.config.timeout = 100;
      const provider = new ScriptedLLMProvider({ delayMs: 200 }).always(CHANNEL, {
        content: '',
      });

      const started = Date.now();
      const result = await agentWith(provider).run({ message: 'test' });

      expect(result.status).toBe('failed');
      // The run gives up at its timeout instead of waiting for the slow model.
      expect(Date.now() - started).toBeLessThan(1000);
      const types = (await eventStore.getEvents(result.runId)).map((event) => event.type);
      expect(types.at(-1)).toBe('run.failed');
    });

    it('should handle tool calls in loop', async () => {
      const provider = new ScriptedLLMProvider().enqueue(
        CHANNEL,
        { toolCall: { name: 'test-tool', arguments: { value: 'test' } } },
        { content: 'Done' }
      );

      const result = await agentWith(provider).run({ message: 'test' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Done');
      expect(provider.requests).toHaveLength(2);
      // The tool's result goes back to the model with the second request.
      expect(JSON.stringify(provider.requests[1]?.messages)).toContain('Processed: test');

      const types = (await eventStore.getEvents(result.runId)).map((event) => event.type);
      expect(types).toContain('tool.called');
      expect(types.at(-1)).toBe('run.completed');
    });
  });

  describe('addTools', () => {
    it('should add tools to agent', () => {
      const tool = {
        id: 'tool-1',
        name: 'new-tool',
        description: 'New tool',
        schema: z.object({}),
        handler: async () => ({}),
        version: '1.0.0',
      };

      agentWith(new ScriptedLLMProvider()).addTools([tool]);

      expect(agentData.tools).toContain(tool);
    });
  });

  describe('setPolicy', () => {
    it('should add policy to agent', () => {
      const policy = {
        id: 'policy-1',
        type: 'budget' as const,
        rules: [],
        scope: 'agent' as const,
        enabled: true,
      };

      agentWith(new ScriptedLLMProvider()).setPolicy(policy);

      expect(agentData.policies).toContain(policy);
    });
  });
});
