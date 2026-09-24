import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeRunCost } from '../costs/run-cost.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import type { Event } from '../types/events.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';
import { openAIChat } from './support/vendor-api.js';

// A call whose cost is unknown (no token counts, or a model without a price) is reported as
// such: never priced at $0, and the report is then not complete.

const PRICING = {
  'gpt-4o': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
  'jev-*': { inputPerMillion: 1_000_000, outputPerMillion: 0 },
};

let sequence = 0;
function event(type: Event['type'], data: Record<string, unknown>): Event {
  sequence += 1;
  return { id: `e${sequence}`, runId: 'run_1', type, timestamp: sequence, data };
}

/** Serves the scripted replies of a cognitive run without any token counts. */
class WithoutUsage implements LLMProvider {
  constructor(private readonly inner: LLMProvider) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const { usage: _usage, ...response } = await this.inner.generateCompletion(request);
    return response;
  }

  supportsModel(model: string): boolean {
    return this.inner.supportsModel(model);
  }

  getProviderName(): string {
    return 'no-usage';
  }
}

describe('run cost report', () => {
  it('counts a call without token counts as unmetered, not as $0', () => {
    const report = computeRunCost(
      'run_1',
      [
        event('intention.generated', {
          model: 'gpt-4o',
          usage: { promptTokens: 3, completionTokens: 2 },
        }),
        event('intention.generated', { message: 'done', model: 'gpt-4o' }),
        // A total alone does not say what the tokens cost: they count, not their cost.
        event('intention.generated', { model: 'gpt-4o', usage: { totalTokens: 9 } }),
        event('decision.evaluated', { model: 'jev-1.13.0', answers: {} }),
      ],
      PRICING
    );

    expect(report).toMatchObject({
      totalUsd: 5,
      complete: false,
      unmeteredCalls: 3,
      unmeteredModels: ['gpt-4o', 'jev-1.13.0'],
      unpricedCalls: 0,
      unpricedModels: [],
    });
    expect(report.lines).toEqual([
      {
        model: 'gpt-4o',
        source: 'llm',
        calls: 3,
        unmeteredCalls: 2,
        inputTokens: 3,
        outputTokens: 2,
        totalOnlyTokens: 9,
        costUsd: 5,
      },
      {
        model: 'jev-1.13.0',
        source: 'decision',
        calls: 1,
        unmeteredCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
      },
    ]);
  });

  it('counts the unmetered calls of a thought among its calls', () => {
    const report = computeRunCost(
      'run_1',
      [
        event('cognition.thought', {
          model: 'gpt-4o',
          usage: { promptTokens: 10, completionTokens: 0, calls: 3, unmeteredCalls: 2 },
        }),
        // Recorded by a version that knew no token counts at all.
        event('cognition.thought', { model: 'gpt-4o', usage: { calls: 2 } }),
      ],
      PRICING
    );

    expect(report.lines[0]).toMatchObject({ calls: 5, unmeteredCalls: 4, inputTokens: 10 });
    expect(report).toMatchObject({ totalUsd: 10, complete: false, unmeteredCalls: 4 });
  });

  it('counts the calls of a model without a price, apart from unmetered ones', () => {
    const report = computeRunCost(
      'run_1',
      [
        event('intention.generated', {
          model: 'claude-x',
          usage: { promptTokens: 10, completionTokens: 5 },
        }),
        event('intention.generated', {
          model: 'claude-x',
          usage: { promptTokens: 1, completionTokens: 1 },
        }),
        event('intention.generated', { model: 'claude-x' }),
      ],
      PRICING
    );

    expect(report).toMatchObject({
      totalUsd: 0,
      complete: false,
      unpricedModels: ['claude-x'],
      unpricedCalls: 2,
      unmeteredCalls: 1,
      unmeteredModels: ['claude-x'],
    });
    expect(report.lines[0]).not.toHaveProperty('costUsd');
  });

  it('counts a call that names no model, and never prices it', () => {
    const report = computeRunCost(
      'run_1',
      [
        event('intention.generated', { usage: { promptTokens: 4, completionTokens: 1 } }),
        // A real model named "unknown" is not mixed up with it.
        event('intention.generated', {
          model: 'unknown',
          usage: { promptTokens: 1, completionTokens: 0 },
        }),
      ],
      { ...PRICING, '*': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 } }
    );

    expect(report.lines).toEqual([
      { model: '(unknown)', source: 'llm', calls: 1, inputTokens: 4, outputTokens: 1 },
      { model: 'unknown', source: 'llm', calls: 1, inputTokens: 1, outputTokens: 0, costUsd: 1 },
    ]);
    expect(report).toMatchObject({
      totalUsd: 1,
      complete: false,
      unpricedModels: ['(unknown)'],
      unpricedCalls: 1,
    });
  });

  it('counts a call whose name or usage cannot be read, with an unknown cost', () => {
    const report = computeRunCost(
      'run_1',
      [
        event('intention.generated', { model: 'gpt-4o', usage: { promptTokens: 'ten' } }),
        event('decision.evaluated', { model: 42, usage: { inputTokens: 5, outputTokens: 0 } }),
      ],
      PRICING
    );

    expect(report.lines).toEqual([
      {
        model: 'gpt-4o',
        source: 'llm',
        calls: 1,
        unmeteredCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
      },
      { model: '(unknown)', source: 'decision', calls: 1, inputTokens: 5, outputTokens: 0 },
    ]);
    expect(report).toMatchObject({ complete: false, unmeteredCalls: 1, unpricedCalls: 1 });
  });

  it('prices a call that named only the model it asked for', () => {
    const report = computeRunCost(
      'run_1',
      [
        event('intention.generated', {
          requestedModel: 'gpt-4o',
          usage: { promptTokens: 1, completionTokens: 1 },
        }),
      ],
      PRICING
    );

    expect(report.lines[0]).toMatchObject({ model: 'gpt-4o', costUsd: 2 });
    expect(report.complete).toBe(true);
  });

  it('does not count what is not a model call', () => {
    const report = computeRunCost(
      'run_1',
      [
        // The final answer of a cognitive run, recorded as an intention.
        event('intention.generated', {
          intention: { type: 'final_answer', reasoning: 'Buy' },
          message: 'Buy',
          source: 'cognition',
        }),
        // A thought the engine wrote alone (a tool result), and a failure without model call.
        event('cognition.thought', { step: 2, operation: 'seek_information', failed: false }),
        event('cognition.operation_failed', { step: 3, operation: 'decide', error: 'deferred' }),
      ],
      PRICING
    );

    expect(report).toMatchObject({ totalUsd: 0, complete: true, lines: [], unmeteredCalls: 0 });
  });
});

describe('run cost of real runs whose calls report no token counts', () => {
  let env: TestSDK | undefined;
  let server: LocalHttpServer;

  beforeEach(() => {
    server = new LocalHttpServer();
  });

  afterEach(async () => {
    await server.stop();
    await env?.dispose();
    env = undefined;
  });

  it('reports the unknown cost of a governed run, instead of an empty complete report', async () => {
    server.reply(openAIChat({ content: 'Done', model: 'gpt-4o' }));
    const provider = new OpenAIProvider('k', 'gpt-4o', {
      baseURL: `${await server.start()}/v1`,
      maxRetries: 0,
    });
    env = createTestSDK({ llmProvider: provider, pricing: PRICING });

    const result = await env.sdk.createAgent({ name: 'a', model: 'gpt-4o' }).run({ message: 'Hi' });

    expect(result.status).toBe('completed');
    const cost = await env.sdk.getRunCost(result.runId);
    expect(cost).toMatchObject({
      totalUsd: 0,
      complete: false,
      unmeteredCalls: 1,
      unmeteredModels: ['gpt-4o'],
    });
    expect(cost.lines).toEqual([
      {
        model: 'gpt-4o',
        source: 'llm',
        calls: 1,
        unmeteredCalls: 1,
        inputTokens: 0,
        outputTokens: 0,
      },
    ]);
  });

  it('reports the unknown cost of cognitive thoughts', async () => {
    const scripted = scriptBuildOrBuy(new ScriptedLLMProvider());
    env = createTestSDK({
      llmProvider: new WithoutUsage(scripted),
      pricing: { 'test-model': { inputPerMillion: 1, outputPerMillion: 1 } },
    });
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });

    const result = await agent.think({ problem: 'Build or buy the analytics module?' });

    const thoughts = (await env.sdk.getEvents(result.runId)).filter(
      (item) => item.type === 'cognition.thought' && item.data.usage !== undefined
    );
    expect(thoughts[0]?.data.usage).toEqual({
      promptTokens: 0,
      completionTokens: 0,
      calls: 1,
      unmeteredCalls: 1,
    });
    const cost = await env.sdk.getRunCost(result.runId);
    expect(cost).toMatchObject({
      totalUsd: 0,
      complete: false,
      unmeteredCalls: scripted.requests.length,
      unmeteredModels: ['test-model'],
    });
  });

  it('reports the unknown cost of a typed decision', async () => {
    server.reply({
      status: 200,
      body: { model: 'jev-1.13.0', answers: { check: { type: 'noul', noul: 0.9 } } },
    });
    env = createTestSDK({ jev: { apiKey: 'k', baseUrl: await server.start() } });

    const result = await env.sdk.decisions.check({ context: 'text', question: 'Refund?' });

    const [evaluated] = await env.sdk.getEvents(result.runId);
    expect(evaluated?.data).not.toHaveProperty('usage');
    expect(await env.sdk.getRunCost(result.runId)).toMatchObject({
      totalUsd: 0,
      complete: false,
      unmeteredCalls: 1,
      unmeteredModels: ['jev-1.13.0'],
    });
  });
});
