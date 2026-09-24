import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AnthropicProvider,
  DEFAULT_ANTHROPIC_MODEL,
  FallbackProvider,
  type FallbackResult,
  type LLMProvider,
  OpenAIProvider,
  RetryingLLMProvider,
  type VendorClientOptions,
} from '../index.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';
import { anthropicMessage, openAIChat, openAIError } from './support/vendor-api.js';

// The built-in providers are imported from the package, to compose a chain given as
// `llmProvider`. Each vendor is a local server speaking its API.
describe('built-in providers exported by the package', () => {
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

  /** OpenAI first, then Claude with its default model; the SDK's retry policy applies. */
  async function vendors(): Promise<{ primary: OpenAIProvider; fallback: AnthropicProvider }> {
    const client = (baseURL: string): VendorClientOptions => ({ baseURL, maxRetries: 0 });
    return {
      primary: new OpenAIProvider('k', 'gpt-4o', client(`${await openai.start()}/v1`)),
      fallback: new AnthropicProvider('k', undefined, client(await anthropic.start())),
    };
  }

  function sdkWith(llmProvider: LLMProvider) {
    env = createTestSDK({ llmProvider });
    return env.sdk;
  }

  it('answers with the primary provider when it is up', async () => {
    openai.reply(openAIChat({ content: 'Hello' }));
    const { primary, fallback } = await vendors();
    const sdk = sdkWith(new FallbackProvider(primary, [fallback]));

    const result = await sdk.createAgent({ name: 'a', model: 'gpt-4o' }).run({ message: 'Hi' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello' });
    expect(openai.requests).toHaveLength(1);
    expect(anthropic.requests).toHaveLength(0);
    expect(await sdk.getEvents(result.runId, { type: 'provider.fallback' })).toEqual([]);
  });

  it('fails over to the next provider, with its own model, and records it', async () => {
    openai.reply(openAIError(503, 'overloaded'));
    anthropic.reply(anthropicMessage({ text: ['Hello from Claude'] }));
    const { primary, fallback } = await vendors();
    const sdk = sdkWith(new FallbackProvider(primary, [fallback]));

    const result = await sdk.createAgent({ name: 'a', model: 'gpt-4o' }).run({ message: 'Hi' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello from Claude' });
    expect(openai.requests).toHaveLength(1);
    // Claude does not serve gpt-4o: the fallback asks for its default model.
    expect(anthropic.jsonBody(0)).toMatchObject({ model: DEFAULT_ANTHROPIC_MODEL });
    const failovers = await sdk.getEvents(result.runId, { type: 'provider.fallback' });
    expect(failovers).toHaveLength(1);
    expect(failovers[0]?.data).toMatchObject({
      primaryProvider: 'openai',
      usedProvider: 'anthropic',
      attemptedProviders: ['openai', 'anthropic'],
    });
  });

  it('says which provider answered a request made directly to the chain', async () => {
    openai.reply(openAIError(503, 'overloaded'));
    anthropic.reply(anthropicMessage({ text: ['Hello from Claude'] }));
    const { primary, fallback } = await vendors();

    const result: FallbackResult = await new FallbackProvider(primary, [
      fallback,
    ]).generateCompletionWithFallback({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result).toMatchObject({
      usedProvider: 'anthropic',
      wasFallback: true,
      attemptedProviders: ['openai', 'anthropic'],
    });
    expect(result.response.content).toBe('Hello from Claude');
    // The fallback was sent no model: it used its own default.
    expect(result.requestedModel).toBeUndefined();
  });

  it('retries a provider of the chain before failing over when it is wrapped', async () => {
    openai.reply(openAIError(503, 'overloaded'), openAIChat({ content: 'Hello after a retry' }));
    const { primary, fallback } = await vendors();
    const retried = new RetryingLLMProvider(primary, {
      maxRetries: 1,
      initialDelayMs: 1,
      maxDelayMs: 1,
      jitter: false,
    });
    const sdk = sdkWith(new FallbackProvider(retried, [fallback]));

    const result = await sdk.createAgent({ name: 'a', model: 'gpt-4o' }).run({ message: 'Hi' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello after a retry' });
    expect(openai.requests).toHaveLength(2);
    expect(anthropic.requests).toHaveLength(0);
  });
});
