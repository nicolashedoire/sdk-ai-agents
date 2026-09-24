import { afterEach, describe, expect, it } from 'vitest';
import {
  HeuristicController,
  type CognitiveController,
  type DecisionEvaluationRecord,
} from '../cognition/cognitive-controller.js';
import { LLMThoughtGenerator, type ThoughtGenerator } from '../cognition/llm-thought-generator.js';
import { PolicyViolationError } from '../errors/index.js';
import type { SDKConfig } from '../types/sdk.js';
import type { Event } from '../types/events.js';
import type { Policy, PolicyRule } from '../types/policy.js';
import { InMemoryDecisionClient, level, yes } from './support/in-memory-decision-client.js';
import { json, ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  createTestSDK,
  lookupMetricDefinition,
  scriptBuildOrBuy,
  type TestSDK,
} from './support/test-sdk.js';

// The scripted build-or-buy run takes 7 steps: represent, hypothesize, simulate, critique,
// seek_information (the lookup_metric tool), compare, decide. The scripted provider reports
// 120 tokens (100 in, 20 out) for a thought and 60 (50 in, 10 out) for a tool selection:
// 480 tokens after step 4, 540 when the tool is called, 660 after step 5, 900 in all.
const PROBLEM = 'Should we build or buy the analytics module?';
const FULL_RUN_TOKENS = 900;

function policy(type: Policy['type'], rule: PolicyRule, id = `limit-${String(rule.condition)}`) {
  return { id, type, rules: [rule], scope: 'agent', enabled: true } satisfies Policy;
}

function budget(limit: Record<string, unknown>, id = 'period-budget'): Policy {
  return policy(
    'budget',
    { condition: 'budgetLimit', action: 'deny', metadata: { budgetLimit: limit } },
    id
  );
}

function ofType(events: Event[], type: Event['type']): Event[] {
  return events.filter((event) => event.type === type);
}

function operations(events: Event[]): string[] {
  return ofType(events, 'cognition.operation_selected').map((event) =>
    String(event.data.operation)
  );
}

describe('policies of cognitive agents', () => {
  let env: TestSDK;
  let lookups: number;

  afterEach(async () => {
    await env.dispose();
  });

  function analyst(
    config: {
      policies?: Policy[];
      limits?: Record<string, number>;
      controller?: CognitiveController;
      generator?: (provider: ScriptedLLMProvider) => ThoughtGenerator;
    } = {},
    overrides: Partial<SDKConfig> = {},
    provider = new ScriptedLLMProvider()
  ) {
    env = createTestSDK(overrides, scriptBuildOrBuy(provider));
    lookups = 0;
    const tool = env.sdk.defineTool({
      ...lookupMetricDefinition,
      handler: async (params: unknown) => {
        lookups++;
        return lookupMetricDefinition.handler(params);
      },
    });
    return env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [tool],
      ...(config.policies ? { policies: config.policies } : {}),
      ...(config.limits ? { limits: config.limits } : {}),
      ...(config.controller ? { controller: config.controller } : {}),
      ...(config.generator ? { generator: config.generator(provider) } : {}),
    });
  }

  describe('what already applied to their tool calls', () => {
    it('applies a global allowlist to their tool calls', async () => {
      const agent = analyst();
      env.sdk.defineGlobalPolicy({
        ...policy('allowlist', {
          condition: 'allowedTools',
          action: 'deny',
          metadata: { tools: ['other'] },
        }),
        scope: 'global',
      });

      const result = await agent.think({ problem: PROBLEM });

      // A refused tool call is a failed operation: the reasoning goes on to a decision.
      expect(result.status).toBe('completed');
      expect(lookups).toBe(0);
      expect(result.state.failures[0]?.description).toContain('not in allowlist');
    });

    it('waits for a human approval required by a policy', async () => {
      const agent = analyst({
        policies: [
          policy('custom', {
            condition: {
              type: 'condition',
              conditions: [{ field: 'intention.toolName', operator: 'eq', value: 'lookup_metric' }],
            },
            action: 'require_approval',
          }),
        ],
      });

      const thinking = agent.think({ problem: PROBLEM });
      let pending = env.sdk.getPendingApprovals();
      for (const started = Date.now(); pending.length === 0 && Date.now() - started < 5_000; ) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        pending = env.sdk.getPendingApprovals();
      }
      expect(lookups).toBe(0);
      env.sdk.approveAction(pending[0]?.id ?? '', 'alice');
      const result = await thinking;

      expect(result.status).toBe('completed');
      expect(lookups).toBe(1);
    });

    it('counts their tool calls in call budgets', async () => {
      const agent = analyst();
      env.sdk.defineGlobalPolicy({
        ...budget({ period: 'all', agentId: agent.id, maxToolCalls: 0 }),
        scope: 'global',
      });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('completed');
      expect(lookups).toBe(0);
      expect(result.state.failures[0]?.description).toContain('Tool call budget exceeded: 1 > 0');
    });
  });

  describe('run limits (maxSteps, maxTokens, maxDuration)', () => {
    it('stops the run before a step beyond maxSteps', async () => {
      const agent = analyst({
        policies: [
          policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 2 } }),
        ],
      });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('failed');
      expect(result.error).toBeInstanceOf(PolicyViolationError);
      expect(result.error?.message).toBe(
        'Policy violation: limit-maxSteps - Max steps (2) exceeded'
      );
      const events = await env.sdk.getEvents(result.runId);
      // Two steps ran; the third was refused before its first model call.
      expect(operations(events)).toEqual(['represent', 'hypothesize']);
      expect(env.provider.channels()).toEqual(['represent', 'hypothesize']);
      expect(ofType(events, 'policy.violated').map((event) => event.data)).toEqual([
        {
          intention: { type: 'continue' },
          step: 3,
          reason: 'Max steps (2) exceeded',
          violatedPolicies: ['limit-maxSteps'],
        },
      ]);
      expect(ofType(events, 'run.failed')[0]?.data).toEqual({
        error: 'Policy violation: limit-maxSteps - Max steps (2) exceeded',
        steps: 2,
      });
      expect((await env.sdk.getTrace(result.runId)).status).toBe('failed');
      // Each step's check is in the audit trail, like a tool call's.
      const audit = env.sdk.getPolicyAuditTrail(result.runId);
      expect(audit.map((entry) => [entry.intention, entry.applied])).toEqual([
        [{ type: 'continue' }, false],
        [{ type: 'continue' }, false],
        [{ type: 'continue' }, true],
      ]);
    });

    it('checks only tool calls against a limit whose conditions need a tool call', async () => {
      const agent = analyst({
        policies: [
          {
            id: 'tool-call-tokens',
            type: 'budget',
            scope: 'agent',
            enabled: true,
            rules: [
              {
                condition: {
                  type: 'condition',
                  conditions: [{ field: 'intention.type', operator: 'eq', value: 'tool_call' }],
                },
                action: 'deny',
              },
              { condition: 'maxTokens', action: 'deny', metadata: { value: 500 } },
            ],
          },
        ],
      });

      const result = await agent.think({ problem: PROBLEM });

      // The tool call (540 tokens) is refused; the steps are not checked against the limit.
      expect(lookups).toBe(0);
      expect(result.status).toBe('completed');
      expect(result.state.failures[0]?.description).toContain('Max tokens (500) exceeded');
    });

    it('applies a global run limit to cognitive agents too', async () => {
      const agent = analyst();
      env.sdk.defineGlobalPolicy({
        ...policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 4 } }),
        scope: 'global',
      });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.error?.message).toContain('Max steps (4) exceeded');
      expect(operations(await env.sdk.getEvents(result.runId))).toHaveLength(4);
      expect(lookups).toBe(0);
    });

    it('refuses a tool call, then the next step, once the run has used maxTokens tokens', async () => {
      const agent = analyst({
        policies: [
          policy('budget', { condition: 'maxTokens', action: 'deny', metadata: { value: 500 } }),
        ],
      });

      const result = await agent.think({ problem: PROBLEM });

      // 480 tokens before step 5 (allowed), 540 once its tool selection answered: the tool
      // call is refused, a failed operation; step 6 is refused and the run fails.
      expect(lookups).toBe(0);
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Max tokens (500) exceeded');
      expect(result.state.failures[0]?.description).toContain('blocked by policy limit-maxTokens');
      const events = await env.sdk.getEvents(result.runId);
      expect(operations(events)).toEqual([
        'represent',
        'hypothesize',
        'simulate',
        'critique',
        'seek_information',
      ]);
      const violations = ofType(events, 'policy.violated');
      expect(violations.map((event) => event.data.intention)).toEqual([
        expect.objectContaining({ type: 'tool_call', toolName: 'lookup_metric' }),
        { type: 'continue' },
      ]);
      expect(violations[1]?.data.step).toBe(6);
    });

    it('stops the run once it has lasted maxDuration', async () => {
      // Each model call takes 50 ms; the policy allows 60 ms.
      const agent = analyst(
        {
          policies: [
            policy('timeout', {
              condition: 'maxDuration',
              action: 'deny',
              metadata: { value: 60 },
            }),
          ],
        },
        {},
        new ScriptedLLMProvider({ delayMs: 50 })
      );

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Timeout (60ms) exceeded');
      const events = await env.sdk.getEvents(result.runId);
      expect(ofType(events, 'policy.violated')).toHaveLength(1);
      expect(operations(events).length).toBeLessThan(4);
      expect(lookups).toBe(0);
    });

    it('lets the run decide while it stays within its limits', async () => {
      const agent = analyst({
        policies: [
          policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 7 } }),
          policy('budget', { condition: 'maxTokens', action: 'deny', metadata: { value: 1_000 } }),
          policy('timeout', {
            condition: 'maxDuration',
            action: 'deny',
            metadata: { value: 60_000 },
          }),
        ],
      });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('completed');
      expect(lookups).toBe(1);
      expect(ofType(await env.sdk.getEvents(result.runId), 'policy.violated')).toEqual([]);
    });

    it("ends with a decision when the agent's own maxSteps comes first", async () => {
      const agent = analyst({
        policies: [
          policy('budget', { condition: 'maxSteps', action: 'deny', metadata: { value: 4 } }),
        ],
        limits: { maxSteps: 4 },
      });

      const result = await agent.think({ problem: PROBLEM });

      // The fourth step is the agent's last: it decides, and no fifth step is asked for.
      expect(result.status).toBe('completed');
      expect(result.decision).toBeDefined();
      expect(ofType(await env.sdk.getEvents(result.runId), 'policy.violated')).toEqual([]);
    });
  });

  describe('budgets per period', () => {
    it("counts the run's model calls: thoughts and tool selections", async () => {
      const agent = analyst(
        {},
        { pricing: { 'test-model': { inputPerMillion: 1_000, outputPerMillion: 2_000 } } }
      );

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('completed');
      const usage = await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' });
      expect(usage.tokensUsed).toBe(FULL_RUN_TOKENS);
      // What the budget counts is what the run's cost report prices.
      const cost = await env.sdk.getRunCost(result.runId);
      expect(usage.costUsd).toBeCloseTo(cost.totalUsd, 10);
      expect(usage.costUsd).toBeCloseTo((750 * 1_000 + 150 * 2_000) / 1_000_000, 10);
      expect((await env.sdk.getBudgetUsage({ period: 'all' })).tokensUsed).toBe(FULL_RUN_TOKENS);
    });

    it('counts every model call once, repairs included', async () => {
      const provider = new ScriptedLLMProvider()
        .enqueue('represent', { content: 'not json' })
        .enqueue(
          'represent:repair',
          json({
            summary: 'Framed the build-or-buy question',
            addFacts: [{ statement: 'Budget is 10k EUR', source: 'input', confidence: 0.9 }],
            addUnknowns: [{ question: 'What is the current monthly churn?' }],
          })
        );
      const agent = analyst({}, {}, provider);

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('completed');
      const usage = await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' });
      // test-model has no price: each call, the failed first reply and its repair included, is
      // counted as a call whose cost is unknown.
      expect(usage.unpricedCalls).toBe(provider.requests.length);
      expect(usage.tokensUsed).toBe(FULL_RUN_TOKENS + 120);
    });

    it('counts a thought whose usage reports no valid number of calls as one call', async () => {
      const agent = analyst({
        generator: (provider) => {
          const llm = new LLMThoughtGenerator(provider, { model: 'test-model' });
          return {
            generate: async (request) => {
              const thought = await llm.generate(request);
              return thought.usage
                ? { ...thought, usage: { ...thought.usage, calls: 0 } }
                : thought;
            },
          };
        },
      });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('completed');
      const usage = await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' });
      expect(usage.unpricedCalls).toBe(env.provider.requests.length);
      expect(usage.tokensUsed).toBe(FULL_RUN_TOKENS);
    });

    it('counts a typed decision that reports no usage as a call without token counts', async () => {
      const heuristic = new HeuristicController();
      const unmetered = {
        client: 'custom',
        purpose: 'operation_selection',
        model: 'custom-1',
        state: {},
        questions: {},
        answers: {},
      } as unknown as DecisionEvaluationRecord;
      const controller: CognitiveController = {
        name: 'custom',
        selectNext: async (input) => ({
          ...(await heuristic.selectNext(input)),
          controller: 'custom',
          evaluations: [unmetered],
        }),
      };
      const agent = analyst({ controller });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('completed');
      const usage = await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' });
      expect(usage.unmeteredCalls).toBe(
        ofType(await env.sdk.getEvents(result.runId), 'decision.evaluated').length
      );
      expect(usage.unmeteredCalls).toBeGreaterThan(0);
      expect(usage.tokensUsed).toBe(FULL_RUN_TOKENS);
    });

    it('counts the typed decisions made inside the run', async () => {
      const client = new InMemoryDecisionClient((id, question) =>
        id === 'ready_to_decide' ? yes(0.1) : level(question, id.includes('H2') ? 4 : 1)
      );
      const agent = analyst(
        {},
        {
          decisionClient: client,
          pricing: { 'memory-*': { inputPerMillion: 1, outputPerMillion: 0 } },
        }
      );

      const result = await agent.think({ problem: PROBLEM });

      const cost = await env.sdk.getRunCost(result.runId);
      const decisions = cost.lines.find((line) => line.source === 'decision');
      expect(decisions?.calls).toBeGreaterThan(0);
      const usage = await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' });
      const recorded = cost.lines.reduce(
        (sum, line) => sum + line.inputTokens + line.outputTokens,
        0
      );
      expect(usage.tokensUsed).toBe(recorded);
      expect(usage.costUsd).toBeCloseTo(decisions?.costUsd ?? Number.NaN, 10);
      // test-model has no price: those calls make the cost unknown.
      expect(usage.unpricedCalls).toBeGreaterThan(0);
    });

    it('stops the run before a step once the token budget is spent', async () => {
      const agent = analyst();
      env.sdk.defineGlobalPolicy({ ...budget({ period: 'all', maxTokens: 300 }), scope: 'global' });

      const result = await agent.think({ problem: PROBLEM });

      // 240 tokens after step 2, 360 after step 3: step 4 is refused.
      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('Token budget exceeded: 360 > 300');
      expect(operations(await env.sdk.getEvents(result.runId))).toEqual([
        'represent',
        'hypothesize',
        'simulate',
      ]);
    });

    it('stops the run before a step once the cost budget is spent, or when the cost is unknown', async () => {
      const agent = analyst(
        {},
        { pricing: { 'test-model': { inputPerMillion: 1_000, outputPerMillion: 1_000 } } }
      );
      // $0.12 per thought: $0.36 after step 3.
      env.sdk.defineGlobalPolicy({
        ...budget({ period: 'all', agentId: agent.id, maxCost: 0.3 }),
        scope: 'global',
      });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.error?.message).toContain('Cost budget exceeded: $0.36 > $0.3');
      expect(operations(await env.sdk.getEvents(result.runId))).toHaveLength(3);
      await env.dispose();

      const unpriced = analyst();
      env.sdk.defineGlobalPolicy({ ...budget({ period: 'all', maxCost: 100 }), scope: 'global' });
      const refused = await unpriced.think({ problem: PROBLEM });
      expect(refused.error?.message).toContain(
        'Cost budget cannot be checked: 1 model call(s) of a model without a price'
      );
    });

    it('does not stop a step for a budget that names a tool or counts tool calls', async () => {
      const agent = analyst();
      // Two calls made before the call budget existed: it is already over when the run starts.
      await env.sdk.executeTool('lookup_metric', { metric: 'churn' }, { agentId: 'someone' });
      await env.sdk.executeTool('lookup_metric', { metric: 'churn' }, { agentId: 'someone' });
      env.sdk.defineGlobalPolicy({
        ...budget({ period: 'all', toolName: 'other', maxTokens: 1 }, 'tool-tokens'),
        scope: 'global',
      });
      env.sdk.defineGlobalPolicy({
        ...budget({ period: 'all', maxToolCalls: 1 }, 'calls'),
        scope: 'global',
      });

      const result = await agent.think({ problem: PROBLEM });

      // Every step runs; only the tool call is refused.
      expect(result.status).toBe('completed');
      expect(lookups).toBe(2);
      expect(result.state.failures[0]?.description).toContain('Tool call budget exceeded: 3 > 1');
    });
  });

  it('refuses again, in a replay, a tool call a run limit refused', async () => {
    const agent = analyst({
      policies: [
        policy('budget', { condition: 'maxTokens', action: 'deny', metadata: { value: 500 } }),
      ],
    });
    const original = await agent.think({ problem: PROBLEM });
    expect(lookups).toBe(0);

    const replay = await env.sdk.replay(original.runId);

    // The replay makes no model call: the tokens are those the original run had used.
    expect(lookups).toBe(0);
    const violations = ofType(await env.sdk.getEvents(replay.runId), 'policy.violated');
    expect(violations.map((event) => event.data.reason)).toEqual(['Max tokens (500) exceeded']);
  });
});

describe('typed decisions made with sdk.decisions', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('count in budgets per period, for the agent they name and for everyone', async () => {
    const client = new InMemoryDecisionClient(() => yes(0.9));
    env = createTestSDK({
      decisionClient: client,
      pricing: { 'memory-*': { inputPerMillion: 1, outputPerMillion: 0 } },
    });

    await env.sdk.decisions.check({
      context: 'A refund request',
      question: 'Is it a refund?',
      agentId: 'support',
    });
    await env.sdk.decisions.check({ context: 'A refund request', question: 'Is it a refund?' });

    const support = await env.sdk.getBudgetUsage({ agentId: 'support', period: 'all' });
    expect(support.tokensUsed).toBe(1_010);
    expect(support.costUsd).toBeCloseTo(0.001, 10);
    const everyone = await env.sdk.getBudgetUsage({ period: 'all' });
    expect(everyone.tokensUsed).toBe(2_020);
    expect(everyone.costUsd).toBeCloseTo(0.002, 10);
  });
});
