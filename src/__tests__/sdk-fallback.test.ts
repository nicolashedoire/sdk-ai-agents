import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMProviderError, ValidationError } from '../errors/index.js';
import { createSDK, type SDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { SDKConfig } from '../types/sdk.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { anthropicError, anthropicMessage, openAIChat, openAIError } from './support/vendor-api.js';

type FallbackConfig = NonNullable<SDKConfig['fallbackProviders']>[number];

// The real SDK, adapters and vendor clients talk to local servers answering in each vendor's
// wire format. The SDK's own retry policy is disabled unless a test is about retries.
describe('SDK with Fallback Providers', () => {
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let openaiURL: string;
  let anthropicURL: string;
  let directory: string;
  let eventStore: FileEventStore;

  beforeEach(async () => {
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
    // The OpenAI client posts to `${baseURL}/chat/completions`, Anthropic to `${baseURL}/v1/messages`.
    [openaiURL, anthropicURL] = await Promise.all([
      openai.start().then((address) => `${address}/v1`),
      anthropic.start(),
    ]);
    directory = mkdtempSync(join(tmpdir(), 'sdk-fallback-'));
    eventStore = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop()]);
    await eventStore.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  const anthropicFallback = (): FallbackConfig => ({
    provider: 'anthropic',
    config: { apiKey: 'test-anthropic-key', baseURL: anthropicURL },
  });

  function buildSDK(config: Partial<SDKConfig> = {}): SDK {
    return createSDK({
      apiKey: 'test-openai-key',
      provider: 'openai',
      providerConfig: { openai: { baseURL: openaiURL } },
      fallbackProviders: [anthropicFallback()],
      retry: { maxRetries: 0 },
      eventStore,
      ...config,
    });
  }

  function runAgent(sdk: SDK) {
    const agent = sdk.createAgent({ name: 'test-agent', model: 'gpt-4', maxSteps: 1 });
    return agent.run({ message: 'Hello' });
  }

  async function eventsOf(sdk: SDK, runId: string, type: string) {
    return (await sdk.getEvents(runId)).filter((event) => event.type === type);
  }

  describe('createSDK with fallback', () => {
    it('should create SDK with fallback providers configured, without calling any vendor', () => {
      const sdk = buildSDK();

      expect(sdk).toBeDefined();
      expect(openai.requests).toHaveLength(0);
      expect(anthropic.requests).toHaveLength(0);
    });

    it('should use primary provider when it succeeds', async () => {
      openai.reply(openAIChat({ content: 'Hello from OpenAI' }));
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK();

      const result = await runAgent(sdk);

      expect(result).toMatchObject({ status: 'completed', output: 'Hello from OpenAI' });
      expect(openai.requests).toHaveLength(1);
      expect(openai.requests[0]?.url).toBe('/v1/chat/completions');
      expect(openai.requests[0]?.headers.authorization).toBe('Bearer test-openai-key');
      expect(openai.jsonBody(0)).toMatchObject({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(anthropic.requests).toHaveLength(0);
      expect(await eventsOf(sdk, result.runId, 'provider.fallback')).toEqual([]);
    });

    it('should fallback to secondary provider when primary fails', async () => {
      openai.reply(openAIError(500, 'The server had an error'));
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK();

      const result = await runAgent(sdk);

      expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
      expect(openai.requests).toHaveLength(1);
      expect(anthropic.requests).toHaveLength(1);
      expect(anthropic.requests[0]?.url).toBe('/v1/messages');
      expect(anthropic.requests[0]?.headers['x-api-key']).toBe('test-anthropic-key');
      // The conversation is translated to the Anthropic format, for the default Claude model.
      expect(anthropic.jsonBody(0)).toMatchObject({
        model: 'claude-opus-5',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 16000,
      });
    });

    // The agent's model is an OpenAI one, which Anthropic would refuse: the fallback uses its
    // own default model instead, and the events say who answered with which model.
    it('should send the fallback vendor one of its own models', async () => {
      openai.reply(openAIError(500, 'The server had an error'));
      anthropic.reply(
        anthropicMessage({ text: ['Hello from Anthropic'], model: 'claude-backup-model' })
      );
      const sdk = buildSDK({
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'test-anthropic-key',
              baseURL: anthropicURL,
              defaultModel: 'claude-backup-model',
            },
          },
        ],
      });

      const result = await runAgent(sdk);

      expect(result.status).toBe('completed');
      expect(openai.jsonBody(0)).toMatchObject({ model: 'gpt-4' });
      expect(anthropic.jsonBody(0)).toMatchObject({ model: 'claude-backup-model' });
      const [intention] = await eventsOf(sdk, result.runId, 'intention.generated');
      expect(intention?.data).toMatchObject({ model: 'claude-backup-model' });
      expect(intention?.data).not.toHaveProperty('requestedModel');
      expect(intention?.metadata).toMatchObject({ provider: 'anthropic' });
    });

    it('should fallback when the primary vendor cannot be reached', async () => {
      await openai.stop();
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK();

      const result = await runAgent(sdk);

      expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
      expect(openai.requests).toHaveLength(0);
      expect(anthropic.requests).toHaveLength(1);
    });

    it('should log fallback event when fallback is used', async () => {
      openai.reply(openAIError(500, 'The server had an error'));
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK();

      const result = await runAgent(sdk);
      expect(result.status).toBe('completed');

      const fallbackEvents = await eventsOf(sdk, result.runId, 'provider.fallback');
      expect(fallbackEvents).toHaveLength(1);
      expect(fallbackEvents[0]?.data).toEqual({
        primaryProvider: 'openai',
        usedProvider: 'anthropic',
        attemptedProviders: ['openai', 'anthropic'],
      });
    });

    it('should try all fallback providers in order', async () => {
      // One local gateway serves the three endpoints, so its journal records the global order
      // of the calls. Replies are consumed in that order, each in its vendor's format.
      const gateway = new LocalHttpServer();
      const address = await gateway.start();
      try {
        gateway.reply(
          openAIError(500, 'Primary OpenAI is down'),
          anthropicError(529, 'Overloaded'),
          openAIChat({ content: 'Hello from OpenAI fallback' })
        );
        const sdk = buildSDK({
          providerConfig: { openai: { baseURL: `${address}/primary/v1` } },
          fallbackProviders: [
            {
              provider: 'anthropic',
              config: { apiKey: 'test-anthropic-key', baseURL: `${address}/anthropic` },
            },
            {
              provider: 'openai',
              config: { apiKey: 'openai-fallback-key', baseURL: `${address}/secondary/v1` },
            },
          ],
        });

        const result = await runAgent(sdk);

        expect(result).toMatchObject({ status: 'completed', output: 'Hello from OpenAI fallback' });
        expect(
          gateway.requests.map((request) => ({
            url: request.url,
            key: request.headers.authorization ?? request.headers['x-api-key'],
          }))
        ).toEqual([
          { url: '/primary/v1/chat/completions', key: 'Bearer test-openai-key' },
          { url: '/anthropic/v1/messages', key: 'test-anthropic-key' },
          { url: '/secondary/v1/chat/completions', key: 'Bearer openai-fallback-key' },
        ]);
        const [fallbackEvent] = await eventsOf(sdk, result.runId, 'provider.fallback');
        expect(fallbackEvent?.data).toEqual({
          primaryProvider: 'openai',
          usedProvider: 'openai',
          attemptedProviders: ['openai', 'anthropic', 'openai'],
        });
      } finally {
        await gateway.stop();
      }
    });

    it('should fail when all providers fail, reporting the chain and the last vendor error', async () => {
      openai.reply(openAIError(500, 'The server had an error'));
      anthropic.reply(anthropicError(529, 'Overloaded'));
      const sdk = buildSDK();

      const result = await runAgent(sdk);

      expect(result.status).toBe('failed');
      expect(openai.requests).toHaveLength(1);
      expect(anthropic.requests).toHaveLength(1);
      expect(result.error).toBeInstanceOf(LLMProviderError);
      expect(result.error).toMatchObject({ provider: 'openai -> anthropic', retryable: true });
      // Both vendor errors are kept, each under its provider's name.
      expect(result.error?.message).toMatch(
        /All providers failed: openai: .*The server had an error.*; anthropic: .*Overloaded/
      );
      const [failed] = await eventsOf(sdk, result.runId, 'run.failed');
      expect(failed?.data.error).toBe(result.error?.message);
      expect(await eventsOf(sdk, result.runId, 'provider.fallback')).toEqual([]);
    });
  });

  describe('retries before failover', () => {
    it('should retry the primary on a transient error before falling back', async () => {
      openai.reply(openAIError(503, 'Service unavailable'));
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK({
        retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1, jitter: false },
      });

      const result = await runAgent(sdk);

      expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
      expect(openai.requests).toHaveLength(2);
      expect(anthropic.requests).toHaveLength(1);
      const retries = await eventsOf(sdk, result.runId, 'provider.retry');
      expect(retries).toHaveLength(1);
      expect(retries[0]?.data).toMatchObject({ provider: 'openai', model: 'gpt-4', retry: 1 });
      expect(await eventsOf(sdk, result.runId, 'provider.fallback')).toHaveLength(1);
    });

    it('should fail over at once when the primary rejects the credentials', async () => {
      openai.reply(openAIError(401, 'Incorrect API key provided'));
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK({
        retry: { maxRetries: 2, initialDelayMs: 1, maxDelayMs: 1, jitter: false },
      });

      const result = await runAgent(sdk);

      expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
      expect(openai.requests).toHaveLength(1);
      expect(anthropic.requests).toHaveLength(1);
      expect(await eventsOf(sdk, result.runId, 'provider.retry')).toEqual([]);
    });
  });

  describe('keys and settings of a fallback', () => {
    it('should refuse a fallback of another vendor that has no key of its own', () => {
      // The primary's OpenAI key must never be sent to Anthropic.
      expect(() =>
        buildSDK({
          fallbackProviders: [{ provider: 'anthropic', config: { baseURL: anthropicURL } }],
        })
      ).toThrow(ValidationError);
      expect(() =>
        buildSDK({
          fallbackProviders: [{ provider: 'anthropic', config: { baseURL: anthropicURL } }],
        })
      ).toThrow('fallbackProviders[0]');
      expect(anthropic.requests).toHaveLength(0);
    });

    it("should take a fallback's key and address from its vendor's providerConfig", async () => {
      openai.reply(openAIError(500, 'The server had an error'));
      anthropic.reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
      const sdk = buildSDK({
        providerConfig: {
          openai: { baseURL: openaiURL },
          anthropic: { apiKey: 'anthropic-vendor-key', baseURL: anthropicURL },
        },
        fallbackProviders: [{ provider: 'anthropic' }],
      });

      const result = await runAgent(sdk);

      expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
      expect(anthropic.requests[0]?.headers['x-api-key']).toBe('anthropic-vendor-key');
      expect(openai.requests[0]?.headers.authorization).toBe('Bearer test-openai-key');
    });

    it('should give the primary key to a fallback of the same vendor', async () => {
      const backup = new LocalHttpServer();
      const backupURL = `${await backup.start()}/v1`;
      try {
        openai.reply(openAIError(500, 'The server had an error'));
        backup.reply(openAIChat({ content: 'Hello from the backup' }));
        const sdk = buildSDK({
          fallbackProviders: [{ provider: 'openai', config: { baseURL: backupURL } }],
        });

        const result = await runAgent(sdk);

        expect(result).toMatchObject({ status: 'completed', output: 'Hello from the backup' });
        expect(backup.requests[0]?.headers.authorization).toBe('Bearer test-openai-key');
      } finally {
        await backup.stop();
      }
    });
  });
});
