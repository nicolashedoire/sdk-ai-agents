import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AnthropicProvider,
  createSDK,
  DEFAULT_ANTHROPIC_MODEL,
  FallbackProvider,
  OpenAIProvider,
} from '../index.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';
import { anthropicMessage, openAIChat, openAIError } from './support/vendor-api.js';

// The built-in providers are imported from the package, to compose a chain given as
// `llmProvider`. Each vendor is a local server speaking its API.
describe('built-in providers exported by the package', () => {
  let env: TestSDK;
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;

  beforeEach(() => {
    env = createTestSDK();
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
  });

  afterEach(async () => {
    await env.dispose();
    await openai.stop();
    await anthropic.stop();
  });

  async function chain(): Promise<FallbackProvider> {
    const primary = new OpenAIProvider('k', 'gpt-4o', {
      baseURL: `${await openai.start()}/v1`,
      maxRetries: 0,
    });
    const fallback = new AnthropicProvider('k', DEFAULT_ANTHROPIC_MODEL, {
      baseURL: await anthropic.start(),
      maxRetries: 0,
    });
    return new FallbackProvider(primary, [fallback]);
  }

  it('answers with the primary provider when it is up', async () => {
    openai.reply(openAIChat({ content: 'Hello' }));
    const sdk = createSDK({ llmProvider: await chain(), eventStore: env.store });

    const result = await sdk.createAgent({ name: 'a', model: 'gpt-4o' }).run({ message: 'Hi' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello' });
    expect(openai.requests).toHaveLength(1);
    expect(anthropic.requests).toHaveLength(0);
  });

  it('fails over to the next provider, with its own model, and records it', async () => {
    openai.reply(openAIError(503, 'overloaded'));
    anthropic.reply(anthropicMessage({ text: ['Hello from Claude'] }));
    const sdk = createSDK({ llmProvider: await chain(), eventStore: env.store });

    const result = await sdk.createAgent({ name: 'a', model: 'gpt-4o' }).run({ message: 'Hi' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello from Claude' });
    expect(openai.requests).toHaveLength(1);
    // Claude does not serve gpt-4o: the fallback asks for its own default model.
    expect(anthropic.requests).toHaveLength(1);
    expect(JSON.parse(anthropic.requests[0]?.body ?? '{}')).toMatchObject({
      model: DEFAULT_ANTHROPIC_MODEL,
    });
    const failover = (await env.store.getEvents(result.runId)).find(
      (event) => event.type === 'provider.fallback'
    );
    expect(failover?.data).toMatchObject({
      primaryProvider: 'openai',
      usedProvider: 'anthropic',
      attemptedProviders: ['openai', 'anthropic'],
    });
  });
});
