import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Policy, PolicyRule } from '../types/policy.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

// A governed agent's budget policies see the real progress of its run: the steps taken, the
// tokens its model calls used (the scripted provider reports 60 for a tool call, 120 for an
// answer) and the time elapsed. They are checked before each tool call.
const CHANNEL = 'tool-selection';
const toolCall = { toolCall: { name: 'lookup', arguments: { key: 'a' } } };

describe('run budget policies', () => {
  let env: TestSDK;
  let lookups: number;

  afterEach(async () => {
    await env.dispose();
  });

  function policy(type: Policy['type'], rule: PolicyRule): Policy {
    return { id: `limit-${rule.condition}`, type, rules: [rule], scope: 'agent', enabled: true };
  }

  function agentWith(policies: Policy[], provider: ScriptedLLMProvider) {
    env = createTestSDK({}, provider);
    lookups = 0;
    const lookup = env.sdk.defineTool({
      name: 'lookup',
      description: 'Looks a key up',
      schema: z.object({ key: z.string() }),
      handler: async () => {
        lookups++;
        return { value: 'found' };
      },
    });
    return env.sdk.createAgent({ name: 'governed', model: 'gpt-4', tools: [lookup], policies });
  }

  async function violations(runId: string) {
    return (await env.sdk.getEvents(runId)).filter((event) => event.type === 'policy.violated');
  }

  it('denies a tool call once the run has taken maxSteps steps', async () => {
    const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall, toolCall, {
      content: 'done',
    });
    const agent = agentWith(
      [policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 1 } })],
      provider
    );

    const result = await agent.run({ message: 'Look it up twice' });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Max steps (1) exceeded');
    // The first call (step 0) ran; the second (step 1) was refused before running.
    expect(lookups).toBe(1);
    expect(await violations(result.runId)).toHaveLength(1);
  });

  it('denies a tool call once the run has used maxTokens tokens', async () => {
    const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall, toolCall, {
      content: 'done',
    });
    const agent = agentWith(
      [policy('budget', { condition: 'maxTokens', action: 'deny', metadata: { value: 100 } })],
      provider
    );

    const result = await agent.run({ message: 'Look it up twice' });

    // 60 tokens before the first call (allowed), 120 before the second (refused).
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Max tokens (100) exceeded');
    expect(lookups).toBe(1);
  });

  it('denies a tool call once the run has lasted maxDuration', async () => {
    // The model takes 80 ms to answer; the policy allows 50 ms.
    const provider = new ScriptedLLMProvider({ delayMs: 80 }).enqueue(CHANNEL, toolCall);
    const agent = agentWith(
      [policy('timeout', { condition: 'maxDuration', action: 'deny', metadata: { value: 50 } })],
      provider
    );

    const result = await agent.run({ message: 'Look it up' });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Timeout (50ms) exceeded');
    expect(lookups).toBe(0);
  });

  it('lets the run go on while it stays within its limits', async () => {
    const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall, { content: 'done' });
    const agent = agentWith(
      [
        policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 5 } }),
        policy('budget', { condition: 'maxTokens', action: 'deny', metadata: { value: 1000 } }),
        policy('timeout', {
          condition: 'maxDuration',
          action: 'deny',
          metadata: { value: 60_000 },
        }),
      ],
      provider
    );

    const result = await agent.run({ message: 'Look it up' });

    expect(result).toMatchObject({ status: 'completed', output: 'done' });
    expect(lookups).toBe(1);
  });

  it("counts the model's tokens in token budgets per period, across runs", async () => {
    const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
    provider.enqueue(CHANNEL, toolCall, { content: 'done' });
    const agent = agentWith([], provider);
    env.sdk.defineGlobalPolicy({
      id: 'hourly-tokens',
      type: 'budget',
      scope: 'global',
      enabled: true,
      rules: [
        {
          condition: 'budgetLimit',
          action: 'deny',
          metadata: { budgetLimit: { period: 'hour', maxTokens: 200 } },
        },
      ],
    });

    // First run: 60 + 120 = 180 tokens, under the hourly budget.
    const first = await agent.run({ message: 'First' });
    expect(first.status).toBe('completed');

    // Second run: 60 more tokens (240 this hour) before its tool call, which is refused.
    const second = await agent.run({ message: 'Second' });
    expect(second.status).toBe('failed');
    expect(second.error?.message).toContain('Token budget exceeded: 240 > 200');
    expect(lookups).toBe(1);
  });

  describe('cost budgets (maxCost)', () => {
    function costBudget(maxCost: number): void {
      env.sdk.defineGlobalPolicy({
        id: 'hourly-cost',
        type: 'budget',
        scope: 'global',
        enabled: true,
        rules: [
          {
            condition: 'budgetLimit',
            action: 'deny',
            metadata: { budgetLimit: { period: 'hour', maxCost } },
          },
        ],
      });
    }

    it('refuses tool calls once the model calls have cost more than maxCost', async () => {
      // $10 000 per million tokens: a tool call (50 in, 10 out) costs $0.60, an answer
      // (100 in, 20 out) $1.20.
      const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
      provider.enqueue(CHANNEL, toolCall, { content: 'done' });
      env = createTestSDK(
        { pricing: { 'gpt-4': { inputPerMillion: 10_000, outputPerMillion: 10_000 } } },
        provider
      );
      lookups = 0;
      const lookup = env.sdk.defineTool({
        name: 'lookup',
        description: 'Looks a key up',
        schema: z.object({ key: z.string() }),
        handler: async () => {
          lookups++;
          return { value: 'found' };
        },
      });
      const agent = env.sdk.createAgent({ name: 'priced', model: 'gpt-4', tools: [lookup] });
      costBudget(2);

      // First run: $0.60 before its tool call, $1.80 in all.
      expect((await agent.run({ message: 'First' })).status).toBe('completed');
      // Second run: $2.40 before its tool call, over the $2 budget.
      const second = await agent.run({ message: 'Second' });

      expect(second.status).toBe('failed');
      expect(second.error?.message).toContain('Cost budget exceeded: $2.4000 > $2');
      expect(lookups).toBe(1);
    });

    it('refuses rather than guess when a model has no price', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall);
      const agent = agentWith([], provider);
      costBudget(100);

      const result = await agent.run({ message: 'Look it up' });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Cost budget cannot be checked');
      expect(lookups).toBe(0);
    });
  });

  describe('replay', () => {
    it('refuses again a call that maxSteps refused in the original run', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall, toolCall, {
        content: 'done',
      });
      const agent = agentWith(
        [policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 1 } })],
        provider
      );
      const original = await agent.run({ message: 'Look it up twice' });
      expect(lookups).toBe(1);

      const replay = await env.sdk.replay(original.runId);

      // The first call runs again; the second, refused at step 1, is refused again.
      expect(replay.status).toBe('failed');
      // A failed replay reports its reason as its output.
      expect(replay.output).toContain('Max steps (1) exceeded');
      expect(lookups).toBe(2);
    });

    it('refuses again a call that maxDuration refused in the original run', async () => {
      const provider = new ScriptedLLMProvider({ delayMs: 80 }).enqueue(CHANNEL, toolCall);
      const agent = agentWith(
        [policy('timeout', { condition: 'maxDuration', action: 'deny', metadata: { value: 50 } })],
        provider
      );
      const original = await agent.run({ message: 'Look it up' });
      expect(original.status).toBe('failed');

      // The replay makes no model call and runs at once; the elapsed time is the original one.
      const replay = await env.sdk.replay(original.runId);

      expect(replay.status).toBe('failed');
      // A failed replay reports its reason as its output.
      expect(replay.output).toContain('Timeout (50ms) exceeded');
      expect(lookups).toBe(0);
    });
  });
});
