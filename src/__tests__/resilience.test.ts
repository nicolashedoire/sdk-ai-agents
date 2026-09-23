import Anthropic from '@anthropic-ai/sdk';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from 'openai';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LLMProviderError } from '../errors/index.js';
import { isTransientError, retryAfterFromError, withRetry } from '../resilience/retry.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

const noWait = async () => {};

describe('retry policy', () => {
  it('retries transient errors with exponential backoff', async () => {
    const delays: number[] = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new HttpError(503);
        return 'ok';
      },
      { maxRetries: 3, initialDelayMs: 100, maxDelayMs: 1_000, jitter: false },
      { sleep: async (ms) => void delays.push(ms) }
    );
    expect(result).toBe('ok');
    expect(delays).toEqual([100, 200]);
  });

  it('never retries authentication or validation errors', async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new HttpError(401);
        },
        { maxRetries: 3, initialDelayMs: 1, maxDelayMs: 1 },
        { sleep: noWait }
      )
    ).rejects.toThrow('HTTP 401');
    expect(calls).toBe(1);
  });

  it('recognizes transient errors wrapped by providers', () => {
    expect(isTransientError(new LLMProviderError('openai', new HttpError(429)))).toBe(true);
    expect(isTransientError(new LLMProviderError('openai', new HttpError(400)))).toBe(false);
    expect(isTransientError(Object.assign(new Error('socket'), { code: 'ECONNRESET' }))).toBe(true);
    expect(isTransientError(new Error('plain'))).toBe(false);
  });

  it('recognizes the real OpenAI and Anthropic errors', () => {
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(isTransientError(new APIConnectionError({ cause: reset }))).toBe(true);
    expect(isTransientError(new LLMProviderError('openai', new APIConnectionTimeoutError()))).toBe(true);
    expect(isTransientError(new LLMProviderError('anthropic', new Anthropic.APIConnectionError({ message: 'down' })))).toBe(true);
    expect(isTransientError(new LLMProviderError('openai', new RateLimitError(429, {}, 'slow down', {})))).toBe(true);
    expect(isTransientError(new LLMProviderError('openai', new AuthenticationError(401, {}, 'bad key', {})))).toBe(false);
  });

  it('does not retry an account out of credit, and says so', () => {
    // What OpenAI returns when the balance is exhausted: a 429 that waiting cannot fix.
    const message = 'You have no credits remaining. Add credits to continue using the API.';
    const noCredit = new RateLimitError(429, { code: 'credit_balance_exhausted', type: 'insufficient_quota', message }, message, {});
    const quota = new RateLimitError(429, { code: 'insufficient_quota', type: 'insufficient_quota', message: 'quota' }, 'quota', {});
    expect(isTransientError(new LLMProviderError('openai', noCredit))).toBe(false);
    expect(isTransientError(new LLMProviderError('openai', quota))).toBe(false);
    expect(new LLMProviderError('openai', noCredit).message).toContain('You have no credits remaining');
    // A real rate limit is still worth waiting for.
    const busy = new RateLimitError(429, { code: 'rate_limit_exceeded', type: 'requests', message: 'slow down' }, 'slow down', {});
    expect(isTransientError(new LLMProviderError('openai', busy))).toBe(true);
  });

  it('masks API keys the vendor echoes in its error message', () => {
    const message = 'Incorrect API key provided: sk-proj-abcd****************wxyz. You can find your API key at …';
    const invalid = new AuthenticationError(401, { message }, message, {});
    const error = new LLMProviderError('openai', invalid);
    expect(error.message).toContain('Incorrect API key provided: sk-*** You can find');
    expect(error.message).not.toContain('wxyz');
  });

  it('waits as long as the provider asks, and gives up when that exceeds the policy', async () => {
    const openaiLimit = new LLMProviderError('openai', new RateLimitError(429, {}, 'slow down', { 'retry-after-ms': '1500' }));
    const anthropicLimit = new Anthropic.RateLimitError(429, {}, 'slow down', new Headers({ 'retry-after': '4' }));
    const tooLong = new RateLimitError(429, {}, 'slow down', { 'retry-after': '600' });
    expect(retryAfterFromError(openaiLimit)).toBe(1500);
    expect(retryAfterFromError(anthropicLimit)).toBe(4000);

    const delays: number[] = [];
    const failures = [openaiLimit, anthropicLimit, tooLong];
    const attempt = withRetry(
      async (index) => {
        const failure = failures[index];
        if (failure) throw failure;
        return 'ok';
      },
      { maxRetries: 5, initialDelayMs: 1, maxDelayMs: 10_000 },
      { sleep: async (ms) => void delays.push(ms) }
    );
    // A 600 s pause is beyond maxDelayMs: the error surfaces so a fallback can take over.
    await expect(attempt).rejects.toBe(tooLong);
    expect(delays).toEqual([1500, 4000]);
  });

  it('waits past maxDelayMs when the server asks, up to maxRetryAfterMs', async () => {
    const limited = new RateLimitError(429, {}, 'slow down', { 'retry-after': '20' });
    const delays: number[] = [];
    const once = (policy: { maxRetryAfterMs?: number }) =>
      withRetry(
        async (attempt) => {
          if (attempt === 0) throw limited;
          return 'ok';
        },
        { maxRetries: 1, initialDelayMs: 500, maxDelayMs: 8_000, ...policy },
        { sleep: async (ms) => void delays.push(ms) }
      );

    await expect(once({})).resolves.toBe('ok');
    expect(delays).toEqual([20_000]);
    // With a fallback available the SDK lowers the bound so it fails over instead.
    await expect(once({ maxRetryAfterMs: 8_000 })).rejects.toBe(limited);
  });

  it('trusts providers that flag a connection failure', () => {
    const flagged = new LLMProviderError('custom', new Error('opaque'), true, { connectionFailure: true });
    expect(isTransientError(flagged)).toBe(true);
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    expect(isTransientError(aborted)).toBe(false);
  });

  it('keeps jittered delays within bounds', async () => {
    const delays: number[] = [];
    await withRetry(
      async (attempt) => {
        if (attempt === 0) throw new HttpError(500);
        return true;
      },
      { maxRetries: 1, initialDelayMs: 1_000, maxDelayMs: 5_000 },
      { sleep: async (ms) => void delays.push(ms), random: () => 0 }
    );
    expect(delays).toEqual([500]);
  });
});

describe('retries in the SDK', () => {
  let env: TestSDK;
  afterEach(async () => {
    await env.dispose();
  });

  it('records provider retries in the run', async () => {
    const provider = new ScriptedLLMProvider()
      .enqueue('default', { error: new HttpError(503) })
      .always('default', { content: 'All good' });
    env = createTestSDK({ retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1, jitter: false } }, provider);
    const agent = env.sdk.createAgent({ name: 'native', model: 'test-model' });

    const result = await agent.run({ message: 'hello' });

    expect(result).toMatchObject({ status: 'completed', output: 'All good' });
    const retries = (await env.sdk.getEvents(result.runId)).filter((event) => event.type === 'provider.retry');
    expect(retries).toHaveLength(1);
    expect(retries[0]?.data).toMatchObject({ provider: 'scripted', model: 'test-model', retry: 1, error: 'HTTP 503' });
  });

  it('retries idempotent tools and traces each retry', async () => {
    env = createTestSDK();
    let attempts = 0;
    env.sdk.defineTool({
      name: 'flaky_lookup',
      description: 'Fails twice then answers',
      schema: z.object({}),
      retry: { maxRetries: 2, initialDelayMs: 1 },
      handler: async () => {
        attempts++;
        if (attempts < 3) throw new Error('upstream timeout');
        return { ok: true };
      },
    });

    const result = await env.sdk.executeTool('flaky_lookup', {}, { runId: 'run_tools' });

    expect(result).toEqual({ ok: true });
    const events = await env.sdk.getEvents('run_tools');
    expect(events.filter((event) => event.type === 'tool.retry').map((event) => event.data.retry)).toEqual([1, 2]);
  });
});
