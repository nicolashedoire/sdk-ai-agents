import { beforeEach, describe, expect, it } from 'vitest';
import { LLMProviderError } from '../errors/index.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { FallbackProvider } from '../providers/fallback-provider.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';

type Outcome = { content: string; model: string } | { failWith: unknown };

/**
 * Provider double: answers with a fixed outcome, keeps every request it received and writes
 * its label to a journal shared by all the providers of a test, so the call order is visible.
 */
class RecordingProvider implements LLMProvider {
  readonly requests: LLMRequest[] = [];

  constructor(
    private readonly name: string,
    private readonly outcome: Outcome,
    private readonly journal: string[],
    private readonly label = name,
    private readonly serves: (model: string) => boolean = () => true
  ) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);
    this.journal.push(this.label);
    if ('failWith' in this.outcome) {
      throw this.outcome.failWith;
    }
    return { content: this.outcome.content, model: this.outcome.model };
  }

  supportsModel(model: string): boolean {
    return this.serves(model);
  }

  getProviderName(): string {
    return this.name;
  }
}

const request: LLMRequest = {
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('FallbackProvider', () => {
  let primaryProvider: OpenAIProvider;
  let fallbackProvider: AnthropicProvider;
  let journal: string[];

  beforeEach(() => {
    // Real adapters: building them does not reach the network.
    primaryProvider = new OpenAIProvider('test-openai-key');
    fallbackProvider = new AnthropicProvider('test-anthropic-key');
    journal = [];
  });

  const succeeding = (name: string, content: string, model: string, label?: string) =>
    new RecordingProvider(name, { content, model }, journal, label);
  const failing = (name: string, error: unknown, label?: string) =>
    new RecordingProvider(name, { failWith: error }, journal, label);

  describe('constructor', () => {
    it('should create provider with primary only', () => {
      const provider = new FallbackProvider(primaryProvider);
      expect(provider).toBeDefined();
      expect(provider.hasFallbackProviders()).toBe(false);
    });

    it('should create provider with primary and fallback', () => {
      const provider = new FallbackProvider(primaryProvider, [fallbackProvider]);
      expect(provider).toBeDefined();
      expect(provider.hasFallbackProviders()).toBe(true);
    });

    it('should throw error if primary provider is missing', () => {
      expect(() => {
        // @ts-expect-error - Testing invalid input
        new FallbackProvider(null);
      }).toThrow('Primary provider is required');
    });
  });

  describe('getProviderName', () => {
    it('should return primary provider name when no fallback', () => {
      const provider = new FallbackProvider(primaryProvider);
      expect(provider.getProviderName()).toBe('openai');
    });

    it('should return primary with fallback info when fallback exists', () => {
      const provider = new FallbackProvider(primaryProvider, [fallbackProvider]);
      expect(provider.getProviderName()).toBe('openai (fallback: anthropic)');
    });
  });

  describe('getPrimaryProviderName', () => {
    it('should return primary provider name', () => {
      const provider = new FallbackProvider(primaryProvider, [fallbackProvider]);
      expect(provider.getPrimaryProviderName()).toBe('openai');
    });
  });

  describe('getFallbackProviderNames', () => {
    it('should return empty array when no fallback', () => {
      const provider = new FallbackProvider(primaryProvider);
      expect(provider.getFallbackProviderNames()).toEqual([]);
    });

    it('should return fallback provider names', () => {
      const provider = new FallbackProvider(primaryProvider, [fallbackProvider]);
      expect(provider.getFallbackProviderNames()).toEqual(['anthropic']);
    });
  });

  describe('supportsModel', () => {
    it('should return true if primary supports model', () => {
      const provider = new FallbackProvider(primaryProvider);
      expect(provider.supportsModel('gpt-4')).toBe(true);
      expect(provider.supportsModel('claude-3-opus')).toBe(false);
    });

    it('should return true if any provider supports model', () => {
      const provider = new FallbackProvider(primaryProvider, [fallbackProvider]);
      expect(provider.supportsModel('gpt-4')).toBe(true);
      expect(provider.supportsModel('claude-3-opus')).toBe(true);
    });
  });

  describe('generateCompletion', () => {
    it('should use primary provider when it succeeds', async () => {
      const primary = succeeding('openai', 'Success', 'gpt-4');
      const fallback = succeeding('anthropic', 'Fallback success', 'claude-3-opus');
      const provider = new FallbackProvider(primary, [fallback]);

      const result = await provider.generateCompletion(request);

      expect(result).toEqual({ content: 'Success', model: 'gpt-4' });
      expect(journal).toEqual(['openai']);
      expect(primary.requests).toEqual([request]);
      expect(fallback.requests).toEqual([]);
    });

    it('should fallback to secondary provider when primary fails', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback = succeeding('anthropic', 'Fallback success', 'claude-3-opus');
      const provider = new FallbackProvider(primary, [fallback]);

      const result = await provider.generateCompletion(request);

      expect(result).toEqual({ content: 'Fallback success', model: 'claude-3-opus' });
      expect(journal).toEqual(['openai', 'anthropic']);
      expect(primary.requests).toEqual([request]);
      // The fallback gets the same conversation. Its `model` is deliberately not asserted:
      // the request's model is forwarded unchanged to every provider, which is under review.
      expect(fallback.requests).toHaveLength(1);
      expect(fallback.requests[0]?.messages).toEqual(request.messages);
    });

    it('should try all providers in order', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback1 = failing('anthropic', new Error('Fallback1 failed'), 'anthropic#1');
      const fallback2 = succeeding(
        'anthropic',
        'Fallback2 success',
        'claude-3-opus',
        'anthropic#2'
      );
      const provider = new FallbackProvider(primary, [fallback1, fallback2]);

      const result = await provider.generateCompletion(request);

      expect(result.content).toBe('Fallback2 success');
      expect(journal).toEqual(['openai', 'anthropic#1', 'anthropic#2']);
      expect(primary.requests).toHaveLength(1);
      expect(fallback1.requests).toHaveLength(1);
      expect(fallback2.requests).toHaveLength(1);
    });

    it('should throw error when all providers fail', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback = failing('anthropic', new Error('Fallback failed'));
      const provider = new FallbackProvider(primary, [fallback]);

      const failure = await provider.generateCompletion(request).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LLMProviderError);
      expect(failure).toMatchObject({
        provider: 'openai -> anthropic',
        retryable: true,
        code: 'LLM_ERROR',
      });
      expect(journal).toEqual(['openai', 'anthropic']);
    });

    it('should report the attempted chain and the error of the last attempt', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback = failing('anthropic', new Error('Fallback failed'));
      const provider = new FallbackProvider(primary, [fallback]);

      const failure = await provider.generateCompletion(request).catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LLMProviderError);
      const error = failure as LLMProviderError;
      expect(error.provider).toBe('openai -> anthropic');
      // Every attempt keeps its own error; the last vendor error stays reachable as the cause.
      expect(error.message).toBe(
        'LLM provider error: openai -> anthropic: All providers failed: openai: Primary failed; anthropic: Fallback failed'
      );
      expect((error.originalError.cause as Error).message).toBe('Fallback failed');
    });

    it('should name each attempt with the vendor message, not the wrapper prefix', async () => {
      const primary = failing('openai', new LLMProviderError('openai', new Error('500 boom')));
      const fallback = failing(
        'anthropic',
        new LLMProviderError('anthropic', new Error('529 busy'))
      );
      const provider = new FallbackProvider(primary, [fallback]);

      const failure = (await provider
        .generateCompletion(request)
        .catch((error: unknown) => error)) as LLMProviderError;

      expect(failure.originalError.message).toBe(
        'All providers failed: openai: 500 boom; anthropic: 529 busy'
      );
      expect((failure.originalError.cause as Error).message).toBe('529 busy');
    });

    it('should report a failure of a primary without fallback', async () => {
      const provider = new FallbackProvider(failing('openai', new Error('Primary failed')));

      await expect(provider.generateCompletion(request)).rejects.toThrow(
        'All providers failed: openai: Primary failed'
      );
      expect(journal).toEqual(['openai']);
    });

    it('should report a rejection that is not an Error', async () => {
      const provider = new FallbackProvider(failing('openai', 'socket hang up'));

      await expect(provider.generateCompletion(request)).rejects.toThrow(
        'All providers failed: openai: socket hang up'
      );
    });

    it('should pass the request unchanged when it has no provider settings', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback = succeeding('anthropic', 'Fallback success', 'claude-3-opus');
      const provider = new FallbackProvider(primary, [fallback]);
      const tuned: LLMRequest = { ...request, temperature: 0.4, maxTokens: 300 };

      await provider.generateCompletion(tuned);

      expect(primary.requests).toEqual([tuned]);
      expect(fallback.requests[0]).toMatchObject({ temperature: 0.4, maxTokens: 300 });
    });

    it('should resolve the settings of each provider it tries', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback = succeeding('anthropic', 'Fallback success', 'claude-3-opus');
      const provider = new FallbackProvider(primary, [fallback]);

      await provider.generateCompletion({
        ...request,
        temperature: 1,
        maxTokens: 100,
        providerSettings: {
          default: { maxTokens: 500 },
          openai: { temperature: 0.2 },
          anthropic: { temperature: 0.9, maxTokens: 800 },
        },
      });

      expect(primary.requests[0]).toMatchObject({ temperature: 0.2, maxTokens: 500 });
      expect(primary.requests[0]?.providerSettings).toBeUndefined();
      expect(fallback.requests[0]).toMatchObject({ temperature: 0.9, maxTokens: 800 });
      expect(fallback.requests[0]?.providerSettings).toBeUndefined();
    });
  });

  describe('generateCompletionWithFallback', () => {
    it('should stop the chain, without trying a fallback, when the call is cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      const provider = new FallbackProvider(succeeding('openai', 'never', 'gpt-4'), [
        succeeding('anthropic', 'never', 'claude-x'),
      ]);

      await expect(
        provider.generateCompletion({ ...request, abortSignal: controller.signal })
      ).rejects.toThrow('Request aborted');
      expect(journal).toEqual([]);
    });

    it('should send a fallback its own default model when it does not serve the requested one', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const claudeOnly = (model: string) => model.startsWith('claude-');
      const fallback = new RecordingProvider(
        'anthropic',
        { content: 'Fallback success', model: 'claude-sonnet-x' },
        journal,
        'anthropic',
        claudeOnly
      );
      const provider = new FallbackProvider(primary, [fallback]);

      const result = await provider.generateCompletionWithFallback(request);

      expect(primary.requests[0]?.model).toBe('gpt-4');
      // An empty model lets the provider use its own default.
      expect(fallback.requests[0]?.model).toBe('');
      expect(result).toMatchObject({ usedProvider: 'anthropic', wasFallback: true });
      expect(result).not.toHaveProperty('requestedModel');
      expect(result.response.model).toBe('claude-sonnet-x');
    });

    it('should keep the requested model for a fallback that serves it', async () => {
      const primary = failing('openai', new Error('Primary failed'));
      const fallback = new RecordingProvider(
        'openai-backup',
        { content: 'Fallback success', model: 'gpt-4' },
        journal,
        'openai-backup',
        (model) => model.startsWith('gpt-')
      );

      const result = await new FallbackProvider(primary, [fallback]).generateCompletionWithFallback(
        request
      );

      expect(fallback.requests[0]?.model).toBe('gpt-4');
      expect(result.requestedModel).toBe('gpt-4');
    });

    it('should always send the primary the requested model', async () => {
      const primary = new RecordingProvider(
        'openai',
        { content: 'ok', model: 'o3-mini' },
        journal,
        'openai',
        () => false
      );

      await new FallbackProvider(primary).generateCompletion({ ...request, model: 'o3-mini' });

      expect(primary.requests[0]?.model).toBe('o3-mini');
    });

    it('should return metadata when primary succeeds', async () => {
      const provider = new FallbackProvider(succeeding('openai', 'Success', 'gpt-4'));

      const result = await provider.generateCompletionWithFallback(request);

      expect(result).toEqual({
        response: { content: 'Success', model: 'gpt-4' },
        usedProvider: 'openai',
        wasFallback: false,
        attemptedProviders: ['openai'],
        requestedModel: 'gpt-4',
      });
    });

    it('should return metadata when fallback is used', async () => {
      const provider = new FallbackProvider(failing('openai', new Error('Primary failed')), [
        succeeding('anthropic', 'Fallback success', 'claude-3-opus'),
      ]);

      const result = await provider.generateCompletionWithFallback(request);

      expect(result).toEqual({
        response: { content: 'Fallback success', model: 'claude-3-opus' },
        usedProvider: 'anthropic',
        wasFallback: true,
        attemptedProviders: ['openai', 'anthropic'],
        requestedModel: 'gpt-4',
      });
    });

    it('should list every attempted provider when a later fallback succeeds', async () => {
      const provider = new FallbackProvider(failing('openai', new Error('Primary failed')), [
        failing('anthropic', new Error('Fallback1 failed')),
        succeeding('openai', 'Second fallback success', 'gpt-4o-mini'),
      ]);

      const result = await provider.generateCompletionWithFallback(request);

      expect(result).toMatchObject({
        usedProvider: 'openai',
        wasFallback: true,
        attemptedProviders: ['openai', 'anthropic', 'openai'],
      });
    });
  });
});
