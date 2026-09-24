import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type SDK, createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { anthropicMessage, openAIError } from './support/vendor-api.js';

// The real SDK fails over from a local OpenAI server that answers with a server error to a
// local Anthropic server; the settings are read on the requests each vendor actually receives.
describe('Provider Settings with FallbackProvider', () => {
  let directory: string;
  let eventStore: FileEventStore;
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let sdk: SDK;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'provider-settings-fallback-'));
    eventStore = new FileEventStore(join(directory, 'events'));
    openai = new LocalHttpServer().reply(openAIError(500, 'OpenAI API error'));
    anthropic = new LocalHttpServer().reply(anthropicMessage({ text: ['Hello from Anthropic'] }));
    const [openaiAddress, anthropicAddress] = await Promise.all([
      openai.start(),
      anthropic.start(),
    ]);
    sdk = createSDK({
      apiKey: 'test-key',
      provider: 'openai',
      providerConfig: { openai: { baseURL: `${openaiAddress}/v1` } },
      fallbackProviders: [
        { provider: 'anthropic', config: { apiKey: 'anthropic-key', baseURL: anthropicAddress } },
      ],
      // One attempt per provider: the primary fails over at once, without backoff delays.
      retry: { maxRetries: 0 },
      eventStore,
    });
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop(), eventStore.destroy()]);
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  /** The primary was tried once, then the run completed on the Anthropic fallback. */
  async function expectFailoverToAnthropic(runId: string): Promise<void> {
    expect(openai.requests).toHaveLength(1);
    expect(anthropic.requests).toHaveLength(1);
    expect(anthropic.requests[0]?.url).toBe('/v1/messages');
    expect(anthropic.requests[0]?.headers['x-api-key']).toBe('anthropic-key');
    const fallbacks = await sdk.getEvents(runId, { type: 'provider.fallback' });
    expect(fallbacks.map((event) => event.data)).toEqual([
      {
        primaryProvider: 'openai',
        usedProvider: 'anthropic',
        attemptedProviders: ['openai', 'anthropic'],
      },
    ]);
  }

  it('should apply correct settings when fallback occurs', async () => {
    const agent = sdk.createAgent({
      name: 'test-agent',
      model: 'gpt-4', // Model suggests OpenAI, but fallback will use Anthropic
      maxSteps: 1,
      providerSettings: {
        openai: { temperature: 0.5, maxTokens: 1000 },
        anthropic: { temperature: 0.8, maxTokens: 2000 },
      },
    });

    const result = await agent.run({ message: 'Hello' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
    await expectFailoverToAnthropic(result.runId);
    // Each vendor receives its own settings: OpenAI (0.5, 1000), then Anthropic (0.8, 2000).
    // The model is not asserted: Anthropic is sent 'gpt-4', a known bug the real API would
    // refuse (see the `.fails` test in sdk-fallback.test.ts).
    expect(openai.jsonBody(0)).toMatchObject({ temperature: 0.5, max_tokens: 1000 });
    expect(anthropic.jsonBody(0)).toMatchObject({ temperature: 0.8, max_tokens: 2000 });
  });

  it('should apply default settings when provider-specific not available', async () => {
    const agent = sdk.createAgent({
      name: 'test-agent',
      model: 'gpt-4',
      maxSteps: 1,
      providerSettings: { default: { temperature: 0.7, maxTokens: 1500 } },
    });

    const result = await agent.run({ message: 'Hello' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
    await expectFailoverToAnthropic(result.runId);
    // Default settings for Anthropic (and for the primary before it).
    expect(anthropic.jsonBody(0)).toMatchObject({ temperature: 0.7, max_tokens: 1500 });
    expect(openai.jsonBody(0)).toMatchObject({ temperature: 0.7, max_tokens: 1500 });
  });
});
