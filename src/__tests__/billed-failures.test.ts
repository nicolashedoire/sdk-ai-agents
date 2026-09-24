import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DecisionClientError } from '../errors/index.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { FallbackProvider } from '../providers/fallback-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import type { Event } from '../types/events.js';
import type { Policy } from '../types/policy.js';
import { LocalHttpServer, type Reply } from './support/local-http-server.js';
import { createTestSDK, scriptBuildOrBuy, type TestSDK } from './support/test-sdk.js';
import { anthropicMessage, openAIChat } from './support/vendor-api.js';

// A model call the vendor answered, and billed, is counted even when the SDK then fails the
// step on its answer: in the run's events, in getRunCost and, for governed agents, in the
// budgets per period. Every vendor is a local server speaking its API.

// $1 per token: costs read as token counts.
const PRICING = {
  'gpt-4o': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
  'claude-*': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
  'jev-*': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
  'test-model': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 },
};

const PROBLEM = 'Should we build or buy the analytics module?';

/** An OpenAI answer without any choice, which the vendor still bills. */
const EMPTY_ANSWER = openAIChat({
  model: 'gpt-4o',
  choices: [],
  usage: { prompt: 30, completion: 0 },
});

async function until(condition: () => boolean): Promise<void> {
  while (!condition()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function jevAnswer(
  answers: Record<string, unknown>,
  usage?: { input: number; output: number }
): Reply {
  return {
    status: 200,
    body: {
      model: 'jev-1.13.0',
      answers,
      ...(usage ? { usage: { input_tokens: usage.input, output_tokens: usage.output } } : {}),
    },
  };
}

/** A score answer on the assessor's five levels. */
function scoreAnswer(index: number) {
  const levels = [0, 1, 2, 3, 4];
  return {
    type: 'score',
    score: index,
    legend: Object.fromEntries(levels.map((level) => [String(level), `level ${level}`])),
    probabilities: Object.fromEntries(
      levels.map((level) => [String(level), level === index ? 1 : 0])
    ),
    confidence: 1,
  };
}

function ofType(events: Event[], type: Event['type']): Event[] {
  return events.filter((event) => event.type === type);
}

describe('billed calls that fail', () => {
  let env: TestSDK | undefined;
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let jev: LocalHttpServer;
  let lookups: number;

  beforeEach(() => {
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
    jev = new LocalHttpServer();
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop(), jev.stop()]);
    await env?.dispose();
    env = undefined;
  });

  async function openAIProvider(): Promise<OpenAIProvider> {
    return new OpenAIProvider('k', 'gpt-4o', {
      baseURL: `${await openai.start()}/v1`,
      maxRetries: 0,
    });
  }

  function governedAgent(policies: Policy[] = []) {
    lookups = 0;
    const lookup = env?.sdk.defineTool({
      name: 'lookup',
      description: 'Looks a key up',
      schema: z.object({ key: z.string() }),
      handler: async () => {
        lookups++;
        return { value: 'found' };
      },
    });
    if (!env || !lookup) throw new Error('no SDK');
    return env.sdk.createAgent({ name: 'governed', model: 'gpt-4o', tools: [lookup], policies });
  }

  describe('governed agents', () => {
    it('counts a call whose tool arguments are not valid JSON in the budgets', async () => {
      openai.reply(
        openAIChat({
          model: 'gpt-4o',
          toolCalls: [{ name: 'lookup', arguments: '{"key": ' }],
          usage: { prompt: 40, completion: 10 },
        })
      );
      env = createTestSDK({ llmProvider: await openAIProvider(), pricing: PRICING });
      const agent = governedAgent();

      const result = await agent.run({ message: 'Look a up' });

      expect(result.status).toBe('failed');
      expect(await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' })).toMatchObject({
        tokensUsed: 50,
        costUsd: 50,
      });
      expect(await env.sdk.getRunCost(result.runId)).toMatchObject({
        totalUsd: 50,
        complete: true,
      });
    });

    it('lets a cost cap see the spend of a step that failed', async () => {
      openai.reply(
        openAIChat({
          model: 'gpt-4o',
          toolCalls: [{ name: 'lookup', arguments: 'not json' }],
          usage: { prompt: 40, completion: 10 },
        }),
        openAIChat({
          model: 'gpt-4o',
          toolCalls: [{ name: 'lookup', arguments: '{"key":"a"}' }],
          usage: { prompt: 15, completion: 5 },
        }),
        openAIChat({ model: 'gpt-4o', content: 'Found', usage: { prompt: 1, completion: 1 } })
      );
      env = createTestSDK({ llmProvider: await openAIProvider(), pricing: PRICING });
      env.sdk.defineGlobalPolicy({
        id: 'cost-cap',
        type: 'budget',
        scope: 'global',
        enabled: true,
        rules: [
          {
            condition: 'budgetLimit',
            action: 'deny',
            metadata: { budgetLimit: { period: 'all', maxCost: 60 } },
          },
        ],
      });
      const agent = governedAgent();

      expect((await agent.run({ message: 'First' })).status).toBe('failed');
      // $50 spent by the failed step, then $20: over the $60 cap before the tool runs.
      const second = await agent.run({ message: 'Second' });

      expect(second.status).toBe('failed');
      expect(second.error?.message).toContain('Cost budget exceeded: $70 > $60');
    });

    it('counts an empty answer the primary provider failed over from', async () => {
      openai.reply(EMPTY_ANSWER);
      anthropic.reply(
        anthropicMessage({
          text: ['Done'],
          model: 'claude-opus-5',
          usage: { input: 20, output: 5 },
        })
      );
      const fallback = new AnthropicProvider('k', undefined, {
        baseURL: await anthropic.start(),
        maxRetries: 0,
      });
      env = createTestSDK({
        llmProvider: new FallbackProvider(await openAIProvider(), [fallback]),
        pricing: PRICING,
      });
      const agent = governedAgent();

      const result = await agent.run({ message: 'Hi' });

      expect(result).toMatchObject({ status: 'completed', output: 'Done' });
      const events = await env.sdk.getEvents(result.runId);
      expect(
        events
          .map((event) => event.type)
          .filter((type) => type.startsWith('provider.') || type === 'intention.generated')
      ).toEqual(['provider.answer_discarded', 'provider.fallback', 'intention.generated']);
      expect(ofType(events, 'provider.answer_discarded')[0]?.data).toEqual({
        provider: 'openai',
        model: 'gpt-4o',
        usage: { promptTokens: 30, completionTokens: 0, totalTokens: 30 },
        reason: 'No response from LLM',
      });
      const cost = await env.sdk.getRunCost(result.runId);
      expect(cost).toMatchObject({ totalUsd: 55, complete: true });
      expect(cost.lines.map(({ model, calls, costUsd }) => ({ model, calls, costUsd }))).toEqual([
        { model: 'gpt-4o', calls: 1, costUsd: 30 },
        { model: 'claude-opus-5', calls: 1, costUsd: 25 },
      ]);
      expect(await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' })).toMatchObject({
        tokensUsed: 55,
        costUsd: 55,
      });
    });

    it("counts an empty answer in the run's token limit, and so does its replay", async () => {
      openai.reply(EMPTY_ANSWER);
      anthropic.reply(
        anthropicMessage({
          toolUses: [{ name: 'lookup', input: { key: 'a' } }],
          model: 'claude-opus-5',
          usage: { input: 5, output: 5 },
        })
      );
      const fallback = new AnthropicProvider('k', undefined, {
        baseURL: await anthropic.start(),
        maxRetries: 0,
      });
      env = createTestSDK({
        llmProvider: new FallbackProvider(await openAIProvider(), [fallback]),
        pricing: PRICING,
      });
      const agent = governedAgent([
        {
          id: 'run-tokens',
          type: 'budget',
          scope: 'agent',
          enabled: true,
          rules: [{ condition: 'maxTokens', action: 'deny', metadata: { value: 35 } }],
        },
      ]);

      const original = await agent.run({ message: 'Look a up' });

      // 30 tokens of the empty answer, then 10 for the tool call: over the run's 35.
      expect(original.status).toBe('failed');
      expect(original.error?.message).toContain('Max tokens (35) exceeded');
      const replay = await env.sdk.replay(original.runId);
      expect(replay.status).toBe('failed');
      expect(replay.output).toContain('Max tokens (35) exceeded');
      expect(lookups).toBe(0);
    });

    it('counts an empty answer a run fails on', async () => {
      openai.reply(EMPTY_ANSWER);
      env = createTestSDK({ llmProvider: await openAIProvider(), pricing: PRICING });
      const agent = governedAgent();

      const result = await agent.run({ message: 'Hi' });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('No response from LLM');
      expect(await env.sdk.getRunCost(result.runId)).toMatchObject({
        totalUsd: 30,
        complete: true,
        lines: [{ model: 'gpt-4o', source: 'llm', calls: 1, inputTokens: 30 }],
      });
      expect(await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' })).toMatchObject({
        tokensUsed: 30,
        costUsd: 30,
      });
    });

    it('counts an empty answer that was retried', async () => {
      openai.reply(
        EMPTY_ANSWER,
        openAIChat({ model: 'gpt-4o', content: 'Done', usage: { prompt: 10, completion: 2 } })
      );
      env = createTestSDK({
        llmProvider: await openAIProvider(),
        pricing: PRICING,
        // Retries everything, empty answers included.
        retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1, retryOn: () => true },
      });
      const agent = governedAgent();

      const result = await agent.run({ message: 'Hi' });

      expect(result).toMatchObject({ status: 'completed', output: 'Done' });
      expect(ofType(await env.sdk.getEvents(result.runId), 'provider.retry')).toHaveLength(1);
      expect(await env.sdk.getRunCost(result.runId)).toMatchObject({
        totalUsd: 42,
        lines: [{ model: 'gpt-4o', calls: 2, inputTokens: 40, outputTokens: 2 }],
      });
      expect(await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' })).toMatchObject({
        tokensUsed: 42,
      });
    });
  });

  describe('cognitive agents', () => {
    it('counts the empty answers its thoughts failed on', async () => {
      openai.reply(EMPTY_ANSWER);
      env = createTestSDK({ llmProvider: await openAIProvider(), pricing: PRICING });
      const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o' });

      const result = await agent.think({ problem: PROBLEM });

      expect(result.status).toBe('failed');
      const failed = ofType(await env.sdk.getEvents(result.runId), 'cognition.thought');
      expect(failed[0]?.data).toMatchObject({
        failed: true,
        model: 'gpt-4o',
        usage: { calls: 1, promptTokens: 30 },
      });
      expect(await env.sdk.getRunCost(result.runId)).toMatchObject({
        totalUsd: 30 * openai.requests.length,
        complete: true,
        lines: [{ model: 'gpt-4o', calls: openai.requests.length }],
      });
    });

    it('counts the billed attempt of a thought whose repair a stop cut short', async () => {
      openai.reply(
        openAIChat({ model: 'gpt-4o', content: 'not json', usage: { prompt: 30, completion: 3 } }),
        { ...openAIChat({ model: 'gpt-4o', content: 'too late' }), delayMs: 10_000 }
      );
      env = createTestSDK({ llmProvider: await openAIProvider(), pricing: PRICING });
      const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o' });

      const running = agent.think({ problem: PROBLEM });
      await until(() => openai.requests.length === 2);
      await agent.stop();
      const result = await running;

      expect(result.status).toBe('cancelled');
      const [interrupted] = ofType(
        await env.sdk.getEvents(result.runId),
        'cognition.operation_failed'
      );
      expect(interrupted?.data).toMatchObject({
        step: 1,
        model: 'gpt-4o',
        requestedModel: 'gpt-4o',
        usage: { calls: 1, promptTokens: 30, completionTokens: 3 },
      });
      expect(await env.sdk.getRunCost(result.runId)).toMatchObject({
        totalUsd: 33,
        complete: true,
        lines: [{ model: 'gpt-4o', calls: 1 }],
      });
    });

    it('keeps the evidence scores of a comparison a stop cut short', async () => {
      jev.reply(
        jevAnswer(
          { evidence_H1: scoreAnswer(1), evidence_H2: scoreAnswer(3) },
          { input: 100, output: 2 }
        ),
        { ...jevAnswer({}), delayMs: 10_000 }
      );
      env = createTestSDK({ jev: { apiKey: 'k', baseUrl: await jev.start() }, pricing: PRICING });
      scriptBuildOrBuy(env.provider);
      const agent = env.sdk.createCognitiveAgent({
        name: 'analyst',
        model: 'test-model',
        controller: 'heuristic',
        assessment: 'typed',
      });

      const running = agent.think({ problem: PROBLEM });
      // The evidence request was answered; the fit request is waiting.
      await until(() => jev.requests.length === 2);
      await agent.stop();
      const result = await running;

      expect(result.status).toBe('cancelled');
      const [evaluated, ...others] = ofType(
        await env.sdk.getEvents(result.runId),
        'decision.evaluated'
      );
      expect(others).toEqual([]);
      expect(evaluated?.data).toMatchObject({
        purpose: 'hypothesis_assessment',
        model: 'jev-1.13.0',
        usage: { inputTokens: 100, outputTokens: 2 },
      });
      const cost = await env.sdk.getRunCost(result.runId);
      expect(cost.lines.find((line) => line.source === 'decision')).toMatchObject({
        calls: 1,
        costUsd: 102,
      });
    });

    it('counts an assessment whose answer does not match its questions', async () => {
      // A yes/no answer where a score was asked: rejected, yet billed.
      jev.reply(jevAnswer({ evidence_H1: { type: 'noul', noul: 0.5 } }, { input: 100, output: 1 }));
      env = createTestSDK({ jev: { apiKey: 'k', baseUrl: await jev.start() }, pricing: PRICING });
      scriptBuildOrBuy(env.provider);
      const agent = env.sdk.createCognitiveAgent({
        name: 'analyst',
        model: 'test-model',
        controller: 'heuristic',
        assessment: 'typed',
      });

      const result = await agent.think({ problem: PROBLEM });

      // The LLM compared instead, and the run went on.
      expect(result.status).toBe('completed');
      const evaluated = ofType(await env.sdk.getEvents(result.runId), 'decision.evaluated');
      expect(evaluated.length).toBe(jev.requests.length);
      expect(evaluated[0]?.data).toMatchObject({
        purpose: 'hypothesis_assessment',
        model: 'jev-1.13.0',
        answers: {},
        usage: { inputTokens: 100, outputTokens: 1 },
        error: expect.stringContaining('Response answers do not match the questions'),
      });
      const cost = await env.sdk.getRunCost(result.runId);
      expect(cost.lines.find((line) => line.source === 'decision')).toMatchObject({
        calls: jev.requests.length,
        costUsd: 101 * jev.requests.length,
      });
    });

    it('counts an operation choice that is not one of the options', async () => {
      const choice = {
        type: 'choice',
        choice: 'dance',
        probabilities: { dance: 0.9 },
        confidence: 0.9,
      };
      jev.reply(
        jevAnswer(
          { next_operation: choice, ready_to_decide: { type: 'noul', noul: 0.1 } },
          { input: 50, output: 1 }
        )
      );
      env = createTestSDK({ jev: { apiKey: 'k', baseUrl: await jev.start() }, pricing: PRICING });
      scriptBuildOrBuy(env.provider);
      const agent = env.sdk.createCognitiveAgent({
        name: 'analyst',
        model: 'test-model',
        controller: 'typed',
        assessment: 'llm',
      });

      const result = await agent.think({ problem: PROBLEM });

      // The heuristic controller chose instead.
      expect(result.status).toBe('completed');
      expect(jev.requests.length).toBeGreaterThan(0);
      const evaluated = ofType(await env.sdk.getEvents(result.runId), 'decision.evaluated');
      expect(evaluated.length).toBe(jev.requests.length);
      expect(evaluated[0]?.data).toMatchObject({
        purpose: 'operation_selection',
        answers: {},
        usage: { inputTokens: 50, outputTokens: 1 },
        error: expect.stringContaining('"dance" is not one of the options'),
      });
      const cost = await env.sdk.getRunCost(result.runId);
      expect(cost.lines.find((line) => line.source === 'decision')).toMatchObject({
        calls: jev.requests.length,
        costUsd: 51 * jev.requests.length,
      });
    });
  });

  describe('typed decisions', () => {
    it('records a decision whose answer is not one of the options, then throws', async () => {
      const refund = {
        type: 'choice',
        choice: 'refund',
        probabilities: { refund: 0.9 },
        confidence: 0.9,
      };
      jev.reply(jevAnswer({ choice: refund }, { input: 1_000, output: 5 }));
      env = createTestSDK({ jev: { apiKey: 'k', baseUrl: await jev.start() }, pricing: PRICING });

      const failure = await env.sdk.decisions
        .choose({
          context: 'I was charged twice',
          question: 'Which team?',
          options: ['billing', 'technical'],
          runId: 'run_support_1',
        })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(DecisionClientError);
      const [evaluated] = await env.sdk.getEvents('run_support_1');
      expect(evaluated).toMatchObject({
        type: 'decision.evaluated',
        data: {
          purpose: 'direct',
          model: 'jev-1.13.0',
          answers: {},
          usage: { inputTokens: 1_000, outputTokens: 5 },
          error: expect.stringContaining('"refund" is not one of the options'),
        },
      });
      expect(await env.sdk.getRunCost('run_support_1')).toMatchObject({
        totalUsd: 1_005,
        complete: true,
      });
    });

    it('records a malformed answer only when it reports its usage', async () => {
      jev.reply(
        { status: 200, body: { model: 'jev-1.13.0', usage: { input_tokens: 7 } } },
        { status: 200, body: { model: 'jev-1.13.0' } }
      );
      env = createTestSDK({ jev: { apiKey: 'k', baseUrl: await jev.start() }, pricing: PRICING });
      const check = (runId: string) =>
        env?.sdk.decisions
          .check({ context: 'text', question: 'Refund?', runId })
          .catch((error: unknown) => error);

      expect(await check('run_billed')).toBeInstanceOf(DecisionClientError);
      expect(await check('run_unknown')).toBeInstanceOf(DecisionClientError);

      expect(await env.sdk.getRunCost('run_billed')).toMatchObject({
        totalUsd: 7,
        complete: true,
        lines: [
          { model: 'jev-1.13.0', source: 'decision', calls: 1, inputTokens: 7, outputTokens: 0 },
        ],
      });
      expect(await env.sdk.getEvents('run_unknown')).toEqual([]);
    });
  });
});
