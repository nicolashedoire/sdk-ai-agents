import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { computeRunCost, type RunCostReport } from '../costs/run-cost.js';
import { PolicyEngine } from '../engines/policy-engine.js';
import { BudgetTracker } from '../managers/budget-tracker.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { FallbackProvider } from '../providers/fallback-provider.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import type { Event } from '../types/events.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  createTestSDK,
  lookupMetricDefinition,
  scriptBuildOrBuy,
  type TestSDK,
} from './support/test-sdk.js';
import {
  anthropicMessage,
  openAIChat,
  openAIChatStream,
  openAIError,
} from './support/vendor-api.js';

// Each model call is priced on its own names — the model that answered and the one it asked
// for — and its tokens counted by one rule, so budgets per period count exactly what
// getRunCost reports. Vendors are local servers speaking their API.

/** $1 per token, for the name the agent asks for only (the vendor answers with a dated id). */
const PRICING = { 'vendor-1': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 } };
const PROBLEM = 'Should we build or buy the analytics module?';

/** What budgets and the cost report say about the same calls, side by side. */
function counted(report: RunCostReport) {
  return {
    costUsd: report.totalUsd,
    unpricedCalls: report.unpricedCalls,
    unmeteredCalls: report.unmeteredCalls,
    tokens: report.lines.reduce(
      (sum, line) => sum + line.inputTokens + line.outputTokens + (line.unmeteredTokens ?? 0),
      0
    ),
  };
}

async function budgetsAndCost(env: TestSDK, agentId: string, runId: string) {
  const usage = await env.sdk.getBudgetUsage({ agentId, period: 'all' });
  const report = await env.sdk.getRunCost(runId);
  return {
    report,
    budgets: {
      costUsd: Math.round(usage.costUsd * 1e8) / 1e8,
      unpricedCalls: usage.unpricedCalls,
      unmeteredCalls: usage.unmeteredCalls,
      tokens: usage.tokensUsed,
    },
    cost: counted(report),
  };
}

function ofType(events: Event[], type: Event['type']): Event[] {
  return events.filter((event) => event.type === type);
}

/** Answers with the scripted replies, reporting the usage `usageFor` gives each call. */
class ReportedUsage implements LLMProvider {
  private calls = 0;

  constructor(
    private readonly inner: LLMProvider,
    private readonly usageFor: (call: number) => LLMResponse['usage']
  ) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const { usage: _usage, ...response } = await this.inner.generateCompletion(request);
    const usage = this.usageFor(this.calls++);
    return { ...response, ...(usage ? { usage } : {}) };
  }

  supportsModel(model: string): boolean {
    return this.inner.supportsModel(model);
  }

  getProviderName(): string {
    return 'reported-usage';
  }
}

describe('each model call priced on its own names', () => {
  let env: TestSDK | undefined;
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;

  beforeEach(() => {
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop()]);
    await env?.dispose();
    env = undefined;
  });

  /**
   * OpenAI first, which answers every call with an empty answer billed under a dated id, then
   * the scripted vendor, which answers under the same dated id.
   */
  async function chain(scripted: ScriptedLLMProvider, options: { stream?: boolean } = {}) {
    openai.reply(
      options.stream
        ? openAIChatStream({
            model: 'vendor-1-2025',
            choices: [],
            usage: { prompt: 40, completion: 0 },
          })
        : openAIChat({ model: 'vendor-1-2025', choices: [], usage: { prompt: 40, completion: 0 } })
    );
    const primary = new OpenAIProvider('k', 'vendor-1', {
      baseURL: `${await openai.start()}/v1`,
      maxRetries: 0,
      ...(options.stream ? { includeStreamUsage: true } : {}),
    });
    return new FallbackProvider(primary, [scripted]);
  }

  function governedAgent(sdk: TestSDK['sdk']) {
    const lookup = sdk.defineTool({
      name: 'lookup',
      description: 'Looks a key up',
      schema: z.object({ key: z.string() }),
      handler: async () => ({ value: 'found' }),
    });
    return sdk.createAgent({ name: 'governed', model: 'vendor-1', tools: [lookup] });
  }

  it('prices a discarded answer on the model it asked for, in budgets as in the cost report', async () => {
    const scripted = new ScriptedLLMProvider({ model: 'vendor-1-2025' });
    scripted.enqueue(
      'tool-selection',
      { toolCall: { name: 'lookup', arguments: { key: 'a' } } },
      { content: 'Found' }
    );
    env = createTestSDK({ llmProvider: await chain(scripted), pricing: PRICING });
    const agent = governedAgent(env.sdk);

    const result = await agent.run({ message: 'Look a up' });

    expect(result.status).toBe('completed');
    const [discarded] = ofType(await env.sdk.getEvents(result.runId), 'provider.answer_discarded');
    expect(discarded?.data).toMatchObject({ model: 'vendor-1-2025', requestedModel: 'vendor-1' });
    const { report, budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(report).toMatchObject({ complete: true, unpricedCalls: 0 });
    // 2 discarded answers of 40 tokens, a tool call of 60 and an answer of 120.
    expect(cost).toEqual({ costUsd: 260, unpricedCalls: 0, unmeteredCalls: 0, tokens: 260 });
    expect(budgets).toEqual(cost);
  });

  it('prices the discarded answers of streamed calls on the model they asked for', async () => {
    const scripted = new ScriptedLLMProvider({ model: 'vendor-1-2025' });
    scripted.enqueue('tool-selection', { content: 'Hello' });
    env = createTestSDK({
      llmProvider: await chain(scripted, { stream: true }),
      pricing: PRICING,
    });
    const agent = governedAgent(env.sdk);
    const heard: string[] = [];

    const result = await agent.run({ message: 'Hi', onText: (delta) => heard.push(delta) });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello' });
    expect(heard.join('')).toBe('Hello');
    expect(openai.jsonBody(0)).toMatchObject({ stream: true });
    const { budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(cost).toEqual({ costUsd: 160, unpricedCalls: 0, unmeteredCalls: 0, tokens: 160 });
    expect(budgets).toEqual(cost);
  });

  it("prices a cognitive run's thoughts, tool selections and discarded answers alike", async () => {
    const scripted = scriptBuildOrBuy(new ScriptedLLMProvider({ model: 'vendor-1-2025' }));
    env = createTestSDK({ llmProvider: await chain(scripted), pricing: PRICING });
    const lookup = env.sdk.defineTool(lookupMetricDefinition);
    const agent = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'vendor-1',
      tools: [lookup],
    });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const events = await env.sdk.getEvents(result.runId);
    // The information seeker selected its tool through the chain too.
    expect(scripted.channels()).toContain('tool-selection');
    expect(ofType(events, 'provider.answer_discarded')).toHaveLength(openai.requests.length);
    const { report, budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(report).toMatchObject({ complete: true, unpricedCalls: 0 });
    expect(cost.costUsd).toBeGreaterThan(40 * openai.requests.length);
    expect(budgets).toEqual(cost);
  });

  it('never lends one call the requested model of another', () => {
    const at = (type: Event['type'], data: Record<string, unknown>, id: string): Event => ({
      id,
      runId: 'run_1',
      type,
      timestamp: 1,
      data,
    });
    const report = computeRunCost(
      'run_1',
      [
        at(
          'intention.generated',
          {
            model: 'vendor-1-2025',
            requestedModel: 'vendor-1',
            usage: { promptTokens: 5, completionTokens: 1 },
          },
          'e1'
        ),
        // Recorded before discarded answers carried the model they asked for.
        at(
          'provider.answer_discarded',
          { model: 'vendor-1-2025', usage: { promptTokens: 40, completionTokens: 0 } },
          'e2'
        ),
      ],
      PRICING
    );

    expect(report.lines).toEqual([
      {
        model: 'vendor-1-2025',
        requestedModel: 'vendor-1',
        source: 'llm',
        calls: 1,
        inputTokens: 5,
        outputTokens: 1,
        costUsd: 6,
      },
      { model: 'vendor-1-2025', source: 'llm', calls: 1, inputTokens: 40, outputTokens: 0 },
    ]);
    expect(report).toMatchObject({
      totalUsd: 6,
      complete: false,
      unpricedCalls: 1,
      unpricedModels: ['vendor-1-2025'],
    });
  });

  it('prices a thought a fallback answered on what was asked of it, not on the primary model', async () => {
    openai.reply(openAIError(500, 'The server had an error'));
    anthropic.reply(
      anthropicMessage({
        text: ['not json'],
        model: 'claude-opus-5',
        usage: { input: 20, output: 5 },
      })
    );
    const primary = new OpenAIProvider('k', 'gpt-4o', {
      baseURL: `${await openai.start()}/v1`,
      maxRetries: 0,
    });
    const fallback = new AnthropicProvider('k', undefined, {
      baseURL: await anthropic.start(),
      maxRetries: 0,
    });
    // Only the primary model has a price: Claude's calls are not priced at it.
    env = createTestSDK({
      llmProvider: new FallbackProvider(primary, [fallback]),
      pricing: { 'gpt-4o': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 } },
    });
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o' });

    const result = await agent.think({ problem: PROBLEM });

    const [thought] = ofType(await env.sdk.getEvents(result.runId), 'cognition.thought');
    expect(thought?.data).toMatchObject({ model: 'claude-opus-5' });
    expect(thought?.data).not.toHaveProperty('requestedModel');
    const { report, budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(report).toMatchObject({
      totalUsd: 0,
      complete: false,
      unpricedModels: ['claude-opus-5'],
      unpricedCalls: anthropic.requests.length,
    });
    expect(budgets).toEqual(cost);
  });

  it('prices a repair another model answered apart from the thought, on its own names', async () => {
    // The primary answers the first attempt with a reply that is not a thought; the repair
    // fails on it, and the fallback answers the repair (and every call after it).
    openai.reply(
      openAIChat({
        model: 'gpt-4o-2024-08-06',
        content: 'not json',
        usage: { prompt: 1_000, completion: 200 },
      }),
      openAIError(500, 'The server had an error')
    );
    anthropic.reply(
      anthropicMessage({
        text: ['not json'],
        model: 'claude-opus-5',
        usage: { input: 10, output: 5 },
      })
    );
    const primary = new OpenAIProvider('k', 'gpt-4o', {
      baseURL: `${await openai.start()}/v1`,
      maxRetries: 0,
    });
    const fallback = new AnthropicProvider('k', undefined, {
      baseURL: await anthropic.start(),
      maxRetries: 0,
    });
    // $1 per token for gpt-4o only.
    env = createTestSDK({
      llmProvider: new FallbackProvider(primary, [fallback]),
      pricing: { 'gpt-4o': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 } },
    });
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o' });

    const result = await agent.think({ problem: PROBLEM });

    const events = await env.sdk.getEvents(result.runId);
    // Before: the first thought recorded 1 010 + 205 tokens under claude-opus-5 alone, and the
    // gpt-4o attempt was priced at Claude's price (none here).
    expect(ofType(events, 'provider.answer_discarded').map((event) => event.data)).toContainEqual(
      expect.objectContaining({
        provider: 'openai',
        model: 'gpt-4o-2024-08-06',
        requestedModel: 'gpt-4o',
        usage: expect.objectContaining({ promptTokens: 1_000, completionTokens: 200 }),
      })
    );
    const { report, budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(report.lines).toContainEqual(
      expect.objectContaining({
        model: 'gpt-4o-2024-08-06',
        requestedModel: 'gpt-4o',
        calls: 1,
        inputTokens: 1_000,
        outputTokens: 200,
        costUsd: 1_200,
      })
    );
    expect(report).toMatchObject({ totalUsd: 1_200, unpricedModels: ['claude-opus-5'] });
    expect(budgets).toEqual(cost);
  });
});

describe('the tokens of a call, counted by one rule', () => {
  let env: TestSDK | undefined;

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
  });

  it('counts a total reported alone as tokens without a cost, and the split over the total', async () => {
    const scripted = new ScriptedLLMProvider({ model: 'vendor-1' });
    scripted.enqueue(
      'tool-selection',
      { toolCall: { name: 'lookup', arguments: { key: 'a' } } },
      { content: 'Found' }
    );
    // A total alone for the tool call; for the answer, a split and a total that disagree.
    const provider = new ReportedUsage(scripted, (call) =>
      call === 0 ? { totalTokens: 9 } : { promptTokens: 10, completionTokens: 5, totalTokens: 100 }
    );
    env = createTestSDK({ llmProvider: provider, pricing: PRICING });
    const lookup = env.sdk.defineTool({
      name: 'lookup',
      description: 'Looks a key up',
      schema: z.object({ key: z.string() }),
      handler: async () => ({ value: 'found' }),
    });
    const agent = env.sdk.createAgent({ name: 'governed', model: 'vendor-1', tools: [lookup] });

    const result = await agent.run({ message: 'Look a up' });

    expect(result.status).toBe('completed');
    const { report, budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(report.lines).toEqual([
      {
        model: 'vendor-1',
        source: 'llm',
        calls: 2,
        unmeteredCalls: 1,
        inputTokens: 10,
        outputTokens: 5,
        unmeteredTokens: 9,
        costUsd: 15,
      },
    ]);
    expect(cost).toEqual({ costUsd: 15, unpricedCalls: 0, unmeteredCalls: 1, tokens: 24 });
    expect(budgets).toEqual(cost);
  });

  /** A governed run of one tool call and its answer, with the usage `usageFor` gives each. */
  async function governedRun(usageFor: (call: number) => LLMResponse['usage']) {
    const scripted = new ScriptedLLMProvider({ model: 'vendor-1' });
    scripted.enqueue(
      'tool-selection',
      { toolCall: { name: 'lookup', arguments: { key: 'a' } } },
      { content: 'Found' }
    );
    env = createTestSDK({ llmProvider: new ReportedUsage(scripted, usageFor), pricing: PRICING });
    const lookup = env.sdk.defineTool({
      name: 'lookup',
      description: 'Looks a key up',
      schema: z.object({ key: z.string() }),
      handler: async () => ({ value: 'found' }),
    });
    const agent = env.sdk.createAgent({ name: 'governed', model: 'vendor-1', tools: [lookup] });
    const result = await agent.run({ message: 'Look a up' });
    expect(result.status).toBe('completed');
    return budgetsAndCost(env, agent.id, result.runId);
  }

  it('reads each token count on its own: a null total does not hide the split', async () => {
    // A compatible server may send "total_tokens": null, which the provider passes on.
    const { report, budgets, cost } = await governedRun((call) =>
      call === 0
        ? ({
            promptTokens: 100,
            completionTokens: 20,
            totalTokens: null,
          } as unknown as LLMResponse['usage'])
        : { promptTokens: 10, completionTokens: 5, totalTokens: -1 }
    );

    // Before: getRunCost dropped both usages (0 tokens, 2 calls of unknown cost) while budgets
    // priced them at $135.
    expect(report.lines).toEqual([
      {
        model: 'vendor-1',
        source: 'llm',
        calls: 2,
        inputTokens: 110,
        outputTokens: 25,
        costUsd: 135,
      },
    ]);
    expect(cost).toEqual({ costUsd: 135, unpricedCalls: 0, unmeteredCalls: 0, tokens: 135 });
    expect(budgets).toEqual(cost);
  });

  it('gives no cost to a call that reported one side only, and never fewer tokens than it said', async () => {
    const { report, budgets, cost } = await governedRun((call) =>
      call === 0
        ? { promptTokens: 100, totalTokens: 600 }
        : ({ promptTokens: Number.NaN, completionTokens: 30 } as LLMResponse['usage'])
    );

    // Before: 100 + 30 tokens priced as if complete ($130, complete: true), and NaN made the
    // budget's tokens and cost NaN.
    expect(report.lines).toEqual([
      {
        model: 'vendor-1',
        source: 'llm',
        calls: 2,
        unmeteredCalls: 2,
        inputTokens: 0,
        outputTokens: 0,
        unmeteredTokens: 630,
      },
    ]);
    expect(report.complete).toBe(false);
    expect(cost).toEqual({ costUsd: 0, unpricedCalls: 0, unmeteredCalls: 2, tokens: 630 });
    expect(budgets).toEqual(cost);
  });

  it("counts the totals of a cognitive run's thoughts reported alone", async () => {
    const scripted = scriptBuildOrBuy(new ScriptedLLMProvider({ model: 'vendor-1' }));
    const provider = new ReportedUsage(scripted, () => ({ totalTokens: 7 }));
    env = createTestSDK({ llmProvider: provider, pricing: PRICING });
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'vendor-1' });

    const result = await agent.think({ problem: PROBLEM });

    expect(result.status).toBe('completed');
    const [thought] = (await env.sdk.getEvents(result.runId)).filter(
      (event) => event.type === 'cognition.thought'
    );
    expect(thought?.data.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      calls: 1,
      unmeteredCalls: 1,
      unmeteredTokens: 7,
    });
    const { budgets, cost } = await budgetsAndCost(env, agent.id, result.runId);
    expect(cost).toEqual({
      costUsd: 0,
      unpricedCalls: 0,
      unmeteredCalls: scripted.requests.length,
      tokens: 7 * scripted.requests.length,
    });
    expect(budgets).toEqual(cost);
  });

  it('counts one call for a count of calls that is not a whole number above 0', async () => {
    const tracker = new BudgetTracker();
    const engine = new PolicyEngine();
    engine.setBudgetTracker(tracker);

    for (const calls of [Number.NaN, 0, -2, 1.5, Number.POSITIVE_INFINITY]) {
      await engine.recordModelUsage('agent-1', { model: 'vendor-1', calls });
    }
    await engine.recordModelUsage('agent-1', { model: 'vendor-1', calls: 3 });

    const usage = await tracker.getUsage({ agentId: 'agent-1', period: 'all' });
    expect(usage.unmeteredCalls).toBe(5 + 3);
  });
});
