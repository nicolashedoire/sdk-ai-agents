import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSDK, defineTool } from '../index.js';
import type { Policy, PolicyRule } from '../types/policy.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

// A governed agent's budget policies see the real progress of its run: the steps taken, the
// tokens its model calls used (the scripted provider reports 60 for a tool call, 120 for an
// answer) and the time elapsed. They are checked before each tool call.
const CHANNEL = 'tool-selection';
const toolCall = { toolCall: { name: 'lookup', arguments: { key: 'a' } } };

/** A provider that calls the lookup tool but reports no input/output token counts. */
class UnmeteredProvider implements LLMProvider {
  constructor(private readonly usage: LLMResponse['usage']) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    return {
      content: null,
      toolCalls: [{ function: { name: 'lookup', arguments: '{"key":"a"}' } }],
      model: request.model,
      ...(this.usage ? { usage: this.usage } : {}),
    };
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'unmetered';
  }
}

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

  it('refuses an agent whose run limit is not a count', () => {
    expect(() =>
      agentWith(
        [policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: '10' } })],
        new ScriptedLLMProvider()
      )
    ).toThrow(
      `Validation failed: policy 'limit-maxSteps' rules[0].metadata.value - maxSteps must be a finite number > 0, got "10"`
    );
  });

  it('registers nothing for an agent refused for a policy', () => {
    env = createTestSDK({}, new ScriptedLLMProvider());
    // The package's defineTool registers nothing; createAgent registers an agent's tools.
    const tool = defineTool({
      name: 'unregistered',
      description: 'Never registered',
      schema: z.object({}),
      handler: async () => ({}),
    });
    const valid = policy('budget', {
      condition: 'maxSteps',
      action: 'deny',
      metadata: { value: 5 },
    });
    const broken = policy('budget', {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { period: 'day', maxToolCalls: Number.NaN } },
    });
    const config = { name: 'refused', model: 'gpt-4', tools: [tool], policies: [valid, broken] };

    expect(() => env.sdk.createAgent(config)).toThrow('budgetLimit.maxToolCalls');
    expect(() => env.sdk.createCognitiveAgent(config)).toThrow('budgetLimit.maxToolCalls');
    expect(env.sdk.listTools().map((t) => t.name)).not.toContain('unregistered');
  });

  it('checks default policies before creating anything', () => {
    env = createTestSDK();
    const broken = policy('budget', {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { period: 'fortnight', maxTokens: 10 } },
    });
    // Reading eventStore is the constructor's first step: a FileEventStore would follow.
    let storeRead = false;
    const config = {
      defaultPolicies: [broken],
      get eventStore() {
        storeRead = true;
        return env.store;
      },
    };

    expect(() => createSDK(config)).toThrow(
      `Validation failed: policy 'limit-budgetLimit' rules[0].metadata.budgetLimit.period - must be one of hour, day, week, month, all, got "fortnight"`
    );
    expect(storeRead).toBe(false);
  });

  it('keeps an agent running as before when setPolicy refuses a policy', async () => {
    const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall, { content: 'done' });
    // The agent's policy list is the array given to createAgent.
    const policies: Policy[] = [];
    const agent = agentWith(policies, provider);
    const broken = policy('budget', {
      condition: 'maxSteps',
      action: 'deny',
      metadata: { value: 0 },
    });

    expect(() => agent.setPolicy(broken)).toThrow('maxSteps must be a finite number > 0, got 0');
    expect(policies).toEqual([]);

    expect((await agent.run({ message: 'Go' })).status).toBe('completed');
    expect(lookups).toBe(1);
  });

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
    // $10 000 per million tokens: a tool call (50 in, 10 out) costs $0.60, an answer (100 in,
    // 20 out) $1.20.
    const PRICING = { 'gpt-4': { inputPerMillion: 10_000, outputPerMillion: 10_000 } };

    function costBudget(limit: { maxCost: number; agentId?: string; toolName?: string }): void {
      env.sdk.defineGlobalPolicy({
        id: 'cost-cap',
        type: 'budget',
        scope: 'global',
        enabled: true,
        rules: [
          {
            condition: 'budgetLimit',
            action: 'deny',
            // 'all': a period that cannot roll over during the test.
            metadata: { budgetLimit: { period: 'all', ...limit } },
          },
        ],
      });
    }

    function pricedAgents(provider: LLMProvider, names: string[]) {
      env = createTestSDK({ pricing: PRICING, llmProvider: provider });
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
      return names.map((name) => env.sdk.createAgent({ name, model: 'gpt-4', tools: [lookup] }));
    }

    it('refuses tool calls once the model calls have cost more than maxCost', async () => {
      const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
      provider.enqueue(CHANNEL, toolCall, { content: 'done' });
      const [agent] = pricedAgents(provider, ['priced']);
      costBudget({ maxCost: 2 });

      // First run: $0.60 before its tool call, $1.80 in all.
      expect((await agent?.run({ message: 'First' }))?.status).toBe('completed');
      // Second run: $2.40 before its tool call, over the $2 budget.
      const second = await agent?.run({ message: 'Second' });

      expect(second?.status).toBe('failed');
      expect(second?.error?.message).toContain('Cost budget exceeded: $2.4 > $2');
      expect(lookups).toBe(1);
      const usage = await env.sdk.getBudgetUsage({ period: 'all' });
      expect(usage.costUsd).toBeCloseTo(2.4);
    });

    it('allows a spend exactly at the cap', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall, { content: 'done' });
      const [agent] = pricedAgents(provider, ['priced']);
      costBudget({ maxCost: 0.6 });

      // $0.60 spent before the tool call: at the cap, not over it.
      expect((await agent?.run({ message: 'Once' }))?.status).toBe('completed');
      expect(lookups).toBe(1);
    });

    it('accepts a $0 cap as a cap', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall);
      const [agent] = pricedAgents(provider, ['priced']);
      costBudget({ maxCost: 0 });

      const result = await agent?.run({ message: 'Go' });

      // Checked as an amount, not refused as an invalid cap.
      expect(result?.error?.message).toContain('Cost budget exceeded: $0.6 > $0');
      expect(lookups).toBe(0);
    });

    it("caps one agent's spend without refusing another agent", async () => {
      const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
      const [capped, other] = pricedAgents(provider, ['capped', 'other']);
      costBudget({ maxCost: 0.5, agentId: capped?.id });

      const cappedRun = await capped?.run({ message: 'Go' });
      const otherRun = await other?.run({ message: 'Go' });

      expect(cappedRun?.error?.message).toContain('Cost budget exceeded');
      // The other agent spends past $0.50 too, but the cap names only the first one.
      expect(otherRun?.error?.message ?? '').not.toContain('Cost budget');
      expect(lookups).toBeGreaterThan(0);
    });

    it("gates a tool named by the cap on its agent's spend", async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall);
      const [agent] = pricedAgents(provider, ['priced']);
      costBudget({ maxCost: 0.5, toolName: 'lookup' });

      const result = await agent?.run({ message: 'Go' });

      // $0.60 spent by the agent's model calls: the lookup tool is refused.
      expect(result?.error?.message).toContain('Cost budget exceeded: $0.6 > $0.5');
      expect(lookups).toBe(0);
    });

    it('refuses rather than guess when a model has no price', async () => {
      const provider = new ScriptedLLMProvider().enqueue(CHANNEL, toolCall);
      const agent = agentWith([], provider);
      costBudget({ maxCost: 100 });

      const result = await agent.run({ message: 'Look it up' });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain(
        'Cost budget cannot be checked: 1 model call(s) of a model without a price'
      );
      expect(lookups).toBe(0);
      expect((await env.sdk.getBudgetUsage({ period: 'all' })).unpricedCalls).toBe(1);
    });

    it('refuses rather than guess when a call reports no token counts', async () => {
      for (const usage of [undefined, { totalTokens: 60 }]) {
        const [agent] = pricedAgents(new UnmeteredProvider(usage), ['priced']);
        costBudget({ maxCost: 100 });

        const result = await agent?.run({ message: 'Look it up' });

        // gpt-4 has a price, but without input and output counts the cost is unknown.
        expect(result?.error?.message).toContain('reported no token counts');
        expect(lookups).toBe(0);
        await env.dispose();
      }
      env = createTestSDK();
    });

    it('refuses a maxCost that is not an amount when the policy is defined', () => {
      // Policy metadata is plain data: a cap read from a config file may be a string.
      const invalid: [unknown, string][] = [
        ['0.5', '"0.5"'],
        [Number.NaN, 'NaN'],
        [-1, '-1'],
        [Number.POSITIVE_INFINITY, 'Infinity'],
        [null, 'null'],
      ];
      pricedAgents(new ScriptedLLMProvider(), ['priced']);
      for (const [maxCost, shown] of invalid) {
        expect(() => costBudget({ maxCost } as unknown as { maxCost: number })).toThrow(
          `Validation failed: policy 'cost-cap' rules[0].metadata.budgetLimit.maxCost - must be a finite number >= 0, got ${shown}`
        );
      }
    });

    it('refuses rather than guess when a cap was changed after the policy was defined', async () => {
      const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
      const [agent] = pricedAgents(provider, ['priced']);
      const limit: { period: 'all'; maxCost: unknown } = { period: 'all', maxCost: 100 };
      env.sdk.defineGlobalPolicy(
        policy('budget', {
          condition: 'budgetLimit',
          action: 'deny',
          metadata: { budgetLimit: limit },
        })
      );
      limit.maxCost = '0.5';

      const result = await agent?.run({ message: 'Look it up' });

      expect(result?.status).toBe('failed');
      expect(result?.error?.message).toContain(
        'Budget cannot be checked: budgetLimit.maxCost must be a finite number >= 0, got "0.5"'
      );
      expect(lookups).toBe(0);
    });

    it('refuses every call when a limit no longer says whom it covers', async () => {
      for (const change of ['removed', 'agentId'] as const) {
        const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
        const agent = agentWith([], provider);
        const metadata: {
          budgetLimit?: { period: 'all'; maxToolCalls: number; agentId?: unknown };
        } = {
          budgetLimit: { period: 'all', maxToolCalls: 5, agentId: 'someone-else' },
        };
        env.sdk.defineGlobalPolicy(
          policy('budget', { condition: 'budgetLimit', action: 'deny', metadata })
        );
        if (change === 'removed') delete metadata.budgetLimit;
        else if (metadata.budgetLimit) metadata.budgetLimit.agentId = 7;

        const result = await agent.run({ message: 'Look it up' });

        expect(result.error?.message).toContain(
          change === 'removed'
            ? 'Budget cannot be checked: budgetLimit must be an object, got undefined'
            : 'Budget cannot be checked: budgetLimit.agentId must be a string, got 7'
        );
        expect(lookups).toBe(0);
        await env.dispose();
      }
      env = createTestSDK();
    });

    it('refuses rather than count when a call cap was changed after the policy was defined', async () => {
      const provider = new ScriptedLLMProvider().always(CHANNEL, toolCall);
      const agent = agentWith([], provider);
      const limit: { period: 'all'; maxToolCalls: unknown } = { period: 'all', maxToolCalls: 5 };
      env.sdk.defineGlobalPolicy(
        policy('budget', {
          condition: 'budgetLimit',
          action: 'deny',
          metadata: { budgetLimit: limit },
        })
      );
      limit.maxToolCalls = '2';

      const result = await agent.run({ message: 'Look it up' });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain(
        'Budget cannot be checked: budgetLimit.maxToolCalls must be a finite number >= 0, got "2"'
      );
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
