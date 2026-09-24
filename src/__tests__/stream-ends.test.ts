import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMProviderError } from '../errors/index.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import type { DiscardedAnswer } from '../providers/llm-provider.js';
import { OpenAIProvider, retriesStreamWithoutUsage } from '../providers/openai-provider.js';
import { isTransientError } from '../resilience/retry.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';
import {
  anthropicMessageEvents,
  openAIChatEvents,
  openAIChatStream,
  openAIError,
} from './support/vendor-api.js';

// How a streamed answer ends: a connection that breaks off (or stalls) after the whole answer
// still gave it, one that gave only the usage reports it before failing, and OpenAI's own API
// is not asked twice for a request it refused. The real vendor clients read local servers
// answering in each vendor's wire format.

const hello = [{ role: 'user' as const, content: 'Hello' }];

/** Settles with the error a call fails with, and fails the test otherwise. */
async function failure(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (error: unknown) => error
  );
}

describe('an OpenAI stream that breaks off', () => {
  let server: LocalHttpServer;
  let baseURL: string;

  beforeEach(async () => {
    server = new LocalHttpServer();
    baseURL = `${await server.start()}/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  function provider(options: { includeStreamUsage?: boolean; timeout?: number } = {}) {
    return new OpenAIProvider('k', 'gpt-4o', { baseURL, maxRetries: 0, ...options });
  }

  /** The events of an answer, without the `[DONE]` that ends them. */
  function beforeDone(reply: Parameters<typeof openAIChatEvents>[0]) {
    return openAIChatEvents(reply).slice(0, -1);
  }

  it('gives the answer when the connection breaks after its usage, before [DONE]', async () => {
    const events = beforeDone({ content: 'Whole answer', usage: { prompt: 12, completion: 3 } });
    server.reply({ status: 200, stream: { events, then: 'cut' } });
    const heard: string[] = [];

    const response = await provider({ includeStreamUsage: true }).generateCompletion({
      model: 'gpt-4o',
      messages: hello,
      onTextDelta: (delta) => heard.push(delta),
    });

    expect(response).toMatchObject({
      content: 'Whole answer',
      usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
    });
    expect(heard.join('')).toBe('Whole answer');
    expect(server.requests).toHaveLength(1);
  });

  it('gives the answer when the stream stalls after its usage, before [DONE]', async () => {
    const events = beforeDone({ content: 'Whole answer', usage: { prompt: 12, completion: 3 } });
    server.reply({ status: 200, stream: { events, then: 'hang' } });

    const response = await provider({ includeStreamUsage: true, timeout: 300 }).generateCompletion({
      model: 'gpt-4o',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response).toMatchObject({ content: 'Whole answer', usage: { totalTokens: 15 } });
  });

  it('gives the answer when the connection breaks after its finish reason, no usage asked', async () => {
    const events = beforeDone({ content: 'Whole answer' });
    server.reply({ status: 200, stream: { events, then: 'cut' } });

    const response = await provider().generateCompletion({
      model: 'gpt-4o',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response.content).toBe('Whole answer');
    expect(response.usage).toBeUndefined();
  });

  it('still fails when the connection breaks before the usage it asked for', async () => {
    // Up to the finish reason: the chunk with the usage never comes.
    const events = beforeDone({ content: 'Whole answer', usage: { prompt: 12, completion: 3 } });
    server.reply({ status: 200, stream: { events: events.slice(0, -1), then: 'cut' } });

    const error = await failure(
      provider({ includeStreamUsage: true }).generateCompletion({
        model: 'gpt-4o',
        messages: hello,
        onTextDelta: () => {},
      })
    );

    // As any connection that drops mid-answer: worth a retry, or a fallback.
    expect(error).toBeInstanceOf(LLMProviderError);
    expect(isTransientError(error)).toBe(true);
  });

  it('reports the usage of a stream that gave nothing else, then fails', async () => {
    const events = beforeDone({
      choices: [],
      model: 'gpt-4o-2024-08-06',
      usage: { prompt: 30, completion: 0 },
    });
    server.reply({ status: 200, stream: { events, then: 'cut' } });
    const discarded: DiscardedAnswer[] = [];

    const error = await failure(
      provider({ includeStreamUsage: true }).generateCompletion({
        model: 'gpt-4o',
        messages: hello,
        onTextDelta: () => {},
        onDiscardedAnswer: (answer) => discarded.push(answer),
      })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect(discarded).toEqual([
      {
        provider: 'openai',
        model: 'gpt-4o-2024-08-06',
        requestedModel: 'gpt-4o',
        usage: { promptTokens: 30, completionTokens: 0, totalTokens: 30 },
        reason: 'The answer stream broke off before any answer',
      },
    ]);
  });

  it('reports the usage of a stream that gave nothing else, then stalled', async () => {
    const events = beforeDone({ choices: [], usage: { prompt: 30, completion: 0 } });
    server.reply({ status: 200, stream: { events, then: 'hang' } });
    const discarded: DiscardedAnswer[] = [];

    const error = await failure(
      provider({ includeStreamUsage: true, timeout: 300 }).generateCompletion({
        model: 'gpt-4o',
        messages: hello,
        onTextDelta: () => {},
        onDiscardedAnswer: (answer) => discarded.push(answer),
      })
    );

    expect((error as Error).message).toContain('sent nothing for 300 ms');
    expect(discarded).toHaveLength(1);
  });
});

describe('an Anthropic stream that breaks off after message_stop', () => {
  let server: LocalHttpServer;
  let provider: AnthropicProvider;

  beforeEach(async () => {
    server = new LocalHttpServer();
    provider = new AnthropicProvider('k', 'claude-opus-5', {
      baseURL: await server.start(),
      maxRetries: 0,
      timeout: 300,
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  for (const then of ['cut', 'hang'] as const) {
    it(`gives the whole message when the stream is then ${then === 'cut' ? 'cut' : 'held open'}`, async () => {
      const events = anthropicMessageEvents({
        text: ['Whole answer'],
        model: 'claude-opus-5',
        usage: { input: 20, output: 4 },
      });
      server.reply({ status: 200, stream: { events, then } });
      const heard: string[] = [];

      const response = await provider.generateCompletion({
        model: 'claude-opus-5',
        messages: hello,
        onTextDelta: (delta) => heard.push(delta),
      });

      expect(response).toMatchObject({
        content: 'Whole answer',
        usage: { promptTokens: 20, completionTokens: 4, totalTokens: 24 },
      });
      expect(heard.join('')).toBe('Whole answer');
      expect(server.requests).toHaveLength(1);
    });
  }
});

describe('a streamed request OpenAI refuses', () => {
  let server: LocalHttpServer;

  beforeEach(async () => {
    server = new LocalHttpServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  /**
   * A provider set up for OpenAI's own API, whose vendor client is then pointed at the local
   * server: no test reaches api.openai.com, and the provider decided on the address it got.
   */
  async function onOpenAIsAPI(options: { includeStreamUsage?: boolean } = {}) {
    const provider = new OpenAIProvider('k', 'gpt-4o', {
      baseURL: 'https://api.openai.com/v1',
      maxRetries: 0,
      ...options,
    });
    const client = Reflect.get(provider, 'client') as { baseURL: string };
    client.baseURL = `${await server.start()}/v1`;
    return provider;
  }

  const tooLong = openAIError(
    400,
    "This model's maximum context length is 128000 tokens.",
    undefined,
    {
      type: 'invalid_request_error',
      param: 'messages',
      code: 'context_length_exceeded',
    }
  );

  it('is not sent again without stream_options: the API takes the field', async () => {
    server.reply(tooLong, openAIChatStream({ content: 'never asked' }));
    const provider = await onOpenAIsAPI();

    const error = await failure(
      provider.generateCompletion({ model: 'gpt-4o', messages: hello, onTextDelta: () => {} })
    );

    expect((error as Error).message).toContain('maximum context length');
    expect(server.requests).toHaveLength(1);
    expect(server.jsonBody(0)).toMatchObject({ stream_options: { include_usage: true } });
  });

  it('is sent again without it when includeStreamUsage was set explicitly', async () => {
    server.reply(tooLong, openAIChatStream({ content: 'Answer' }));
    const provider = await onOpenAIsAPI({ includeStreamUsage: true });

    const response = await provider.generateCompletion({
      model: 'gpt-4o',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response.content).toBe('Answer');
    expect(server.requests).toHaveLength(2);
    expect(server.jsonBody(1)).not.toHaveProperty('stream_options');
  });

  it('knows which addresses are sent a request again', () => {
    expect(retriesStreamWithoutUsage('https://api.openai.com/v1')).toBe(false);
    expect(retriesStreamWithoutUsage('https://eu.api.openai.com/v1/')).toBe(false);
    expect(retriesStreamWithoutUsage('https://api.openai.com/v1', true)).toBe(true);
    expect(retriesStreamWithoutUsage('https://api.openai.com/v1', false)).toBe(true);
    expect(retriesStreamWithoutUsage('https://proxy.example.net/v1')).toBe(true);
    expect(retriesStreamWithoutUsage('http://127.0.0.1:8080/v1')).toBe(true);
  });
});

describe('the usage of a stream that broke off, in a run', () => {
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

  it('counts it in the run cost and the budgets when the call is tried again', async () => {
    const usageOnly = openAIChatEvents({ choices: [], usage: { prompt: 30, completion: 0 } });
    server.reply(
      { status: 200, stream: { events: usageOnly.slice(0, -1), then: 'cut' } },
      openAIChatStream({ content: 'Hello', model: 'gpt-4o', usage: { prompt: 10, completion: 2 } })
    );
    env = createTestSDK({
      apiKey: 'k',
      provider: 'openai',
      providerConfig: {
        openai: { baseURL: `${await server.start()}/v1`, includeStreamUsage: true },
      },
      retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1, jitter: false },
      pricing: { 'gpt-4o': { inputPerMillion: 1_000_000, outputPerMillion: 1_000_000 } },
      // Built from the configuration, with its retries, not the scripted provider.
      llmProvider: undefined,
    });
    const agent = env.sdk.createAgent({ name: 'greeter', model: 'gpt-4o' });

    const result = await agent.run({ message: 'Hi', onText: () => {} });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello' });
    expect(server.requests).toHaveLength(2);
    const cost = await env.sdk.getRunCost(result.runId);
    expect(cost).toMatchObject({ totalUsd: 42, complete: true });
    const usage = await env.sdk.getBudgetUsage({ agentId: agent.id, period: 'all' });
    expect(usage).toMatchObject({ costUsd: 42, tokensUsed: 42 });
  });
});
