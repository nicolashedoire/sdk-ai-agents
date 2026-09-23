import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { JevClient } from '../decisions/jev-client.js';
import { parseRetryAfter } from '../utils/http.js';
import { choice, noul, score } from '../decisions/typed-decisions.js';
import { DecisionClientError, ValidationError } from '../errors/index.js';
import { LocalHttpServer } from './support/local-http-server.js';

const QUESTIONS = {
  is_urgent: noul('Does this convey urgency?', { true: 'Explicitly time-sensitive', false: 'No urgency expressed' }),
  department: choice('Which team should handle this?', {
    billing: 'Payments, invoicing, refunds',
    technical: 'Bugs, outages, integrations',
  }),
  frustration: score('How frustrated is the customer?', ['Calm', 'Frustrated', 'Very angry']),
};

const ANSWERS = {
  model: 'jev-1.13.0',
  answers: {
    is_urgent: { type: 'noul', noul: 0.95 },
    department: { type: 'choice', choice: 'billing', probabilities: { billing: 0.88, technical: 0.12 }, confidence: 0.76 },
    frustration: {
      type: 'score',
      score: 1.05,
      legend: { '0': 'Calm', '1': 'Frustrated', '2': 'Very angry' },
      probabilities: { '0': 0, '1': 0.95, '2': 0.05 },
      confidence: 0.92,
    },
  },
  usage: { input_tokens: 318, output_tokens: 34 },
};

describe('JevClient', () => {
  let server: LocalHttpServer;
  let baseUrl: string;
  const waits: number[] = [];
  const sleep = async (ms: number) => {
    waits.push(ms);
  };

  beforeEach(async () => {
    waits.length = 0;
    server = new LocalHttpServer();
    baseUrl = await server.start();
  });
  afterEach(() => server.stop());

  it('sends the documented request and returns typed answers', async () => {
    server.reply({ status: 200, body: ANSWERS });
    const client = new JevClient({ apiKey: 'ts-key', baseUrl, sleep });

    const response = await client.evaluate({ state: { ticket: 'Payouts failing for 3 days' }, questions: QUESTIONS });

    expect(server.requests[0]).toMatchObject({ method: 'POST', url: '/v1/systemone' });
    expect(server.requests[0]?.headers.authorization).toBe('Bearer ts-key');
    expect(server.jsonBody(0)).toEqual({ state: { ticket: 'Payouts failing for 3 days' }, model: 'jev-latest', questions: QUESTIONS });
    expect(response.model).toBe('jev-1.13.0');
    expect(response.answers.is_urgent.noul).toBe(0.95);
    expect(response.answers.department.choice).toBe('billing');
    expect(response.answers.frustration.score).toBe(1.05);
    expect(response.usage).toEqual({ inputTokens: 318, outputTokens: 34 });
  });

  it('retries overloads and rate limits, honoring retry-after', async () => {
    server.reply(
      { status: 529, body: { error: 'overloaded' } },
      { status: 429, headers: { 'retry-after': '2' } },
      { status: 200, body: ANSWERS }
    );
    const client = new JevClient({ apiKey: 'k', baseUrl, sleep, retryBaseDelayMs: 100 });

    await client.evaluate({ state: 'x', questions: QUESTIONS });

    expect(server.requests).toHaveLength(3);
    expect(waits).toEqual([100, 2000]);
  });

  it('does not retry validation errors and never leaks the key', async () => {
    server.reply({ status: 422, body: { detail: 'questions.department.criteria: field required' } });
    const client = new JevClient({ apiKey: 'secret-key', baseUrl, sleep });

    const error = await client.evaluate({ state: 'x', questions: QUESTIONS }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DecisionClientError);
    expect(error).toMatchObject({ status: 422, retryable: false, message: expect.stringContaining('field required') });
    expect(String(error)).not.toContain('secret-key');
    expect(server.requests).toHaveLength(1);
  });

  it('gives up after the retry budget', async () => {
    server.reply({ status: 503 });
    const client = new JevClient({ apiKey: 'k', baseUrl, sleep, maxRetries: 1 });

    await expect(client.evaluate({ state: 'x', questions: QUESTIONS })).rejects.toMatchObject({ status: 503, retryable: true });
    expect(server.requests).toHaveLength(2);
  });

  it('rejects answers that do not match the questions', async () => {
    server.reply({
      status: 200,
      body: { ...ANSWERS, answers: { ...ANSWERS.answers, department: { ...ANSWERS.answers.department, choice: 'sales' } } },
    });
    const client = new JevClient({ apiKey: 'k', baseUrl, sleep });

    await expect(client.evaluate({ state: 'x', questions: QUESTIONS })).rejects.toThrow('Response answers do not match the questions');
  });

  it('times out slow requests and stops on abort', async () => {
    server.reply({ status: 200, body: ANSWERS, delayMs: 200 });
    const client = new JevClient({ apiKey: 'k', baseUrl, sleep, timeoutMs: 20, maxRetries: 0 });
    await expect(client.evaluate({ state: 'x', questions: QUESTIONS })).rejects.toThrow('Request timed out after 20 ms');

    const controller = new AbortController();
    const pending = new JevClient({ apiKey: 'k', baseUrl, sleep }).evaluate({
      state: 'x',
      questions: QUESTIONS,
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow('Request aborted');
  });

  it('validates questions before calling the API', async () => {
    const client = new JevClient({ apiKey: 'k', baseUrl, sleep });
    await expect(client.evaluate({ state: 'x', questions: {} })).rejects.toBeInstanceOf(ValidationError);
    await expect(
      client.evaluate({ state: 'x', questions: { rating: score('How good?', ['Only one level']) } })
    ).rejects.toThrow('a score needs between 2 and 10 levels');
    expect(server.requests).toHaveLength(0);
  });

  it('requires a key for TypeSafe but not for a self-hosted clone', () => {
    expect(() => new JevClient({})).toThrow(ValidationError);
    expect(() => new JevClient({ baseUrl })).not.toThrow();
  });

  it('lists models', async () => {
    server.reply({ status: 200, body: { models: [{ name: 'jev-latest', description: 'Flagship', release_date: '2026-09-20' }] } });
    const models = await new JevClient({ apiKey: 'k', baseUrl, sleep }).listModels();
    expect(server.requests[0]).toMatchObject({ method: 'GET', url: '/v1/models' });
    expect(models).toEqual([{ name: 'jev-latest', description: 'Flagship', releaseDate: '2026-09-20' }]);
  });

  it('parses retry-after in seconds or as a date', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(10_000).toUTCString(), 4_000)).toBe(6000);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});
