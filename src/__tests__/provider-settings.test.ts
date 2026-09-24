import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { AgentConfig } from '../types/agent.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { anthropicMessage, openAIChat } from './support/vendor-api.js';

type ProviderSettingsConfig = AgentConfig['providerSettings'];

// The real SDK, its adapters and the vendor clients talk to local servers answering in each
// vendor's wire format: the settings are read on the requests the vendors actually receive.
describe('Provider Settings Configuration', () => {
  let directory: string;
  let eventStore: FileEventStore;
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let openaiAddress: string;
  let anthropicAddress: string;

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'provider-settings-'));
    eventStore = new FileEventStore(join(directory, 'events'));
    openai = new LocalHttpServer().reply(openAIChat({ content: 'Hello' }));
    anthropic = new LocalHttpServer().reply(anthropicMessage({ text: ['Hello'] }));
    [openaiAddress, anthropicAddress] = await Promise.all([openai.start(), anthropic.start()]);
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop(), eventStore.destroy()]);
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  /** An OpenAI agent on `gpt-4` that answers in one step. */
  function createOpenAIAgent(providerSettings: ProviderSettingsConfig) {
    const sdk = createSDK({
      apiKey: 'test-key',
      provider: 'openai',
      providerConfig: { openai: { baseURL: `${openaiAddress}/v1` } },
      eventStore,
    });
    return sdk.createAgent({
      name: 'test-agent',
      model: 'gpt-4',
      maxSteps: 1,
      ...(providerSettings ? { providerSettings } : {}),
    });
  }

  /** The single chat completion request the OpenAI server received. */
  function sentToOpenAI(): unknown {
    expect(openai.requests).toHaveLength(1);
    expect(openai.requests[0]?.url).toBe('/v1/chat/completions');
    return openai.jsonBody(0);
  }

  describe('Agent-level provider settings', () => {
    it('should apply default provider settings from agent config', async () => {
      const agent = createOpenAIAgent({ default: { temperature: 0.9, maxTokens: 2000 } });

      const result = await agent.run({ message: 'Hello' });

      expect(result).toMatchObject({ status: 'completed', output: 'Hello' });
      expect(sentToOpenAI()).toMatchObject({ model: 'gpt-4', temperature: 0.9, max_tokens: 2000 });
    });

    it('should apply provider-specific settings from agent config', async () => {
      const agent = createOpenAIAgent({
        openai: { temperature: 0.5, maxTokens: 1000 },
        anthropic: { temperature: 0.8, maxTokens: 2000 },
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.5, max_tokens: 1000 });
    });

    it('should prioritize provider-specific over default settings', async () => {
      const agent = createOpenAIAgent({
        default: { temperature: 0.9, maxTokens: 2000 },
        openai: { temperature: 0.5, maxTokens: 1000 },
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      // OpenAI-specific settings, not the defaults.
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.5, max_tokens: 1000 });
    });
  });

  describe('Run-level provider settings', () => {
    it('should override agent settings with run-level settings', async () => {
      const agent = createOpenAIAgent({ openai: { temperature: 0.5, maxTokens: 1000 } });

      const result = await agent.run({
        message: 'Hello',
        providerSettings: { openai: { temperature: 0.8, maxTokens: 2000 } },
      });

      expect(result.status).toBe('completed');
      // Run-level settings, not the agent's.
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.8, max_tokens: 2000 });
    });

    it('should apply run-level default settings', async () => {
      const agent = createOpenAIAgent({ openai: { temperature: 0.5 } });

      const result = await agent.run({
        message: 'Hello',
        providerSettings: { default: { maxTokens: 3000 } },
      });

      expect(result.status).toBe('completed');
      // Run-level default maxTokens, agent-level temperature.
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.5, max_tokens: 3000 });
    });
  });

  describe('Settings priority', () => {
    it('should prioritize run provider-specific > run default > agent provider-specific > agent default', async () => {
      const agent = createOpenAIAgent({
        default: { temperature: 0.3, maxTokens: 500 },
        openai: { temperature: 0.5, maxTokens: 1000 },
      });

      const result = await agent.run({
        message: 'Hello',
        providerSettings: {
          default: { temperature: 0.7, maxTokens: 1500 },
          openai: { temperature: 0.9, maxTokens: 2000 },
        },
      });

      expect(result.status).toBe('completed');
      // Run-level OpenAI-specific settings (highest priority).
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.9, max_tokens: 2000 });
    });

    it('should let a run default win over an agent provider-specific setting', async () => {
      const agent = createOpenAIAgent({
        default: { temperature: 0.3, maxTokens: 500 },
        openai: { temperature: 0.5 },
      });

      const result = await agent.run({
        message: 'Hello',
        providerSettings: { default: { temperature: 0.7, maxTokens: 1500 } },
      });

      expect(result.status).toBe('completed');
      // Run default (0.7, 1500) > agent OpenAI (0.5) > agent default (0.3, 500).
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.7, max_tokens: 1500 });
    });

    it('should resolve each field on its own', async () => {
      const agent = createOpenAIAgent({
        default: { temperature: 0.3, maxTokens: 500 },
        openai: { maxTokens: 1000 },
      });

      const result = await agent.run({
        message: 'Hello',
        providerSettings: { default: { temperature: 0.7 } },
      });

      expect(result.status).toBe('completed');
      // Temperature from the run default; max tokens from the agent's OpenAI settings, which
      // no higher level sets.
      expect(sentToOpenAI()).toMatchObject({ temperature: 0.7, max_tokens: 1000 });
    });
  });

  describe('Anthropic provider settings', () => {
    it('should apply settings to Anthropic provider', async () => {
      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: { anthropic: { apiKey: 'anthropic-key', baseURL: anthropicAddress } },
        eventStore,
      });
      const agent = sdk.createAgent({
        name: 'test-agent',
        // A current model: the Anthropic client warns on stderr about deprecated ones.
        model: 'claude-3-5-sonnet-20241022',
        maxSteps: 1,
        providerSettings: { anthropic: { temperature: 0.6, maxTokens: 1500 } },
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result).toMatchObject({ status: 'completed', output: 'Hello' });
      expect(anthropic.requests).toHaveLength(1);
      expect(anthropic.requests[0]?.url).toBe('/v1/messages');
      expect(anthropic.requests[0]?.headers['x-api-key']).toBe('anthropic-key');
      expect(anthropic.jsonBody(0)).toMatchObject({
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.6,
        max_tokens: 1500,
      });
    });
  });
});
