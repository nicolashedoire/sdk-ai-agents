import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeRunCost } from '../costs/run-cost.js';
import { DEFAULT_PRICING, findModelPrice } from '../costs/pricing.js';
import { JevClient } from '../decisions/jev-client.js';
import { InMemoryDecisionClient, level, pick, yes } from './support/in-memory-decision-client.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

const TICKET = { customer: 'ACME', message: 'I was charged twice and the export is broken. Fix this today!' };

describe('decision service', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('is unavailable until a decision backend is configured', () => {
    env = createTestSDK();
    expect(() => env.sdk.decisions).toThrow('configure `jev` or `decisionClient` to use typed decisions');
  });

  it('chooses one option with its confidence and traces the call', async () => {
    let probability = 0.8;
    const client = new InMemoryDecisionClient((_, question) => pick(question, 'billing', probability));
    env = createTestSDK({ decisionClient: client });

    const result = await env.sdk.decisions.choose({
      context: TICKET,
      question: 'Which team should handle this ticket?',
      options: { billing: 'Payments and refunds', technical: 'Bugs and outages', sales: 'Pricing' },
      minConfidence: 0.5,
    });

    expect(result).toMatchObject({ choice: 'billing', confident: true });
    expect(result.confidence).toBeCloseTo(0.7);
    expect(client.requests[0]?.state).toEqual(TICKET);
    const [event] = await env.sdk.getEvents(result.runId);
    expect(event).toMatchObject({ type: 'decision.evaluated', data: { purpose: 'direct', client: 'memory', usage: { inputTokens: 1000 } } });

    // Same answer, flatter distribution: route it elsewhere.
    probability = 0.6;
    const hesitant = await env.sdk.decisions.choose({
      context: TICKET,
      question: 'Which team should handle this ticket?',
      options: ['billing', 'technical', 'sales'],
      minConfidence: 0.5,
    });
    expect(hesitant).toMatchObject({ choice: 'billing', confident: false });
  });

  it('selects every option that applies, most likely first', async () => {
    const probabilities: Record<string, number> = { option_0: 0.9, option_1: 0.2, option_2: 0.7 };
    const client = new InMemoryDecisionClient((id) => yes(probabilities[id] ?? 0));
    env = createTestSDK({ decisionClient: client });

    const result = await env.sdk.decisions.selectMany({
      context: TICKET,
      question: 'Which problems does the customer report?',
      options: ['double charge', 'login issue', 'broken export'],
      threshold: 0.5,
      runId: 'run_support_42',
    });

    expect(result.selected).toEqual(['double charge', 'broken export']);
    expect(result.probabilities['login issue']).toBe(0.2);
    expect(Object.keys(client.requests[0]?.questions ?? {})).toHaveLength(3);
    expect(result.runId).toBe('run_support_42');
  });

  it('checks and rates with code-side thresholds', async () => {
    const client = new InMemoryDecisionClient((_, question) => (question.type === 'noul' ? yes(0.97) : level(question, 2)));
    env = createTestSDK({ decisionClient: client });

    const check = await env.sdk.decisions.check({ context: TICKET, question: 'Is the customer asking for a refund?', threshold: 0.8 });
    const rating = await env.sdk.decisions.rate({
      context: TICKET,
      question: 'How urgent is this ticket?',
      levels: ['Can wait', 'This week', 'Today'],
    });

    expect(check).toMatchObject({ probability: 0.97, yes: true });
    expect(rating).toMatchObject({ score: 2, normalized: 1, level: 'Today', confidence: 1 });
  });
});

describe('run costs', () => {
  let server: LocalHttpServer;
  beforeEach(async () => {
    server = new LocalHttpServer();
  });
  afterEach(() => server.stop());

  it('prices Jev calls from the documented input-token rate', async () => {
    const baseUrl = await server.start();
    server.reply({
      status: 200,
      body: {
        model: 'jev-1.13.0',
        answers: { check: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 2_000_000, output_tokens: 50 },
      },
    });
    const env = createTestSDK({ jev: { apiKey: 'k', baseUrl } });
    try {
      const result = await env.sdk.decisions.check({ context: 'text', question: 'Refund requested?' });
      const cost = await env.sdk.getRunCost(result.runId);
      expect(cost).toMatchObject({ totalUsd: 0.084, complete: true, unpricedModels: [] });
      expect(cost.lines).toEqual([
        { model: 'jev-1.13.0', source: 'decision', calls: 1, inputTokens: 2_000_000, outputTokens: 50, costUsd: 0.084 },
      ]);
    } finally {
      await env.dispose();
    }
  });

  it('uses the most specific price and reports unpriced models', () => {
    const pricing = { ...DEFAULT_PRICING, 'gpt-*': { inputPerMillion: 1, outputPerMillion: 1 }, 'gpt-5*': { inputPerMillion: 2, outputPerMillion: 8 } };
    expect(findModelPrice(pricing, 'gpt-5-mini')).toEqual({ inputPerMillion: 2, outputPerMillion: 8 });
    expect(findModelPrice(pricing, 'claude-x')).toBeUndefined();
    // Jev reached through Vercel AI Gateway is priced like Jev.
    expect(findModelPrice(DEFAULT_PRICING, 'typesafe-ai/jev')).toEqual({ inputPerMillion: 0.042, outputPerMillion: 0 });

    const report = computeRunCost(
      'run_1',
      [
        { id: 'e1', runId: 'run_1', type: 'intention.generated', timestamp: 1, data: { model: 'gpt-5-mini', usage: { promptTokens: 1_000_000, completionTokens: 500_000 } } },
        { id: 'e2', runId: 'run_1', type: 'cognition.thought', timestamp: 2, data: { model: 'claude-x', usage: { promptTokens: 10, completionTokens: 5 } } },
      ],
      pricing
    );
    expect(report.totalUsd).toBe(6);
    expect(report.unpricedModels).toEqual(['claude-x']);
    expect(report.complete).toBe(false);
  });

  it('keeps JevClient usable without the SDK', async () => {
    const baseUrl = await server.start();
    server.reply({ status: 200, body: { model: 'jev-1.13.0', answers: { a: { type: 'noul', noul: 0.1 } }, usage: {} } });
    const response = await new JevClient({ apiKey: 'k', baseUrl }).evaluate({ state: 's', questions: { a: { type: 'noul', instructions: 'q' } } });
    expect(response.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });
});
