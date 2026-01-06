import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FallbackProvider } from '../providers/fallback-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { LLMProviderError } from '../errors/index.js';

describe('FallbackProvider', () => {
  let primaryProvider: OpenAIProvider;
  let fallbackProvider: AnthropicProvider;

  beforeEach(() => {
    primaryProvider = new OpenAIProvider('test-openai-key');
    fallbackProvider = new AnthropicProvider('test-anthropic-key');
  });

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
      const name = provider.getProviderName();
      expect(name).toContain('openai');
      expect(name).toContain('anthropic');
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
      const mockPrimary = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Success',
          model: 'gpt-4',
        }),
        getProviderName: () => 'openai',
        supportsModel: () => true,
      };

      const provider = new FallbackProvider(mockPrimary as any);
      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Success');
      expect(mockPrimary.generateCompletion).toHaveBeenCalledTimes(1);
    });

    it('should fallback to secondary provider when primary fails', async () => {
      const mockPrimary = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('Primary failed')),
        getProviderName: () => 'openai',
        supportsModel: () => true,
      };

      const mockFallback = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Fallback success',
          model: 'claude-3-opus',
        }),
        getProviderName: () => 'anthropic',
        supportsModel: () => true,
      };

      const provider = new FallbackProvider(mockPrimary as any, [mockFallback as any]);
      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Fallback success');
      expect(mockPrimary.generateCompletion).toHaveBeenCalledTimes(1);
      expect(mockFallback.generateCompletion).toHaveBeenCalledTimes(1);
    });

    it('should try all providers in order', async () => {
      const mockPrimary = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('Primary failed')),
        getProviderName: () => 'openai',
        supportsModel: () => true,
      };

      const mockFallback1 = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('Fallback1 failed')),
        getProviderName: () => 'anthropic',
        supportsModel: () => true,
      };

      const mockFallback2 = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Fallback2 success',
          model: 'claude-3-opus',
        }),
        getProviderName: () => 'anthropic',
        supportsModel: () => true,
      };

      const provider = new FallbackProvider(mockPrimary as any, [
        mockFallback1 as any,
        mockFallback2 as any,
      ]);

      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Fallback2 success');
      expect(mockPrimary.generateCompletion).toHaveBeenCalledTimes(1);
      expect(mockFallback1.generateCompletion).toHaveBeenCalledTimes(1);
      expect(mockFallback2.generateCompletion).toHaveBeenCalledTimes(1);
    });

    it('should throw error when all providers fail', async () => {
      const mockPrimary = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('Primary failed')),
        getProviderName: () => 'openai',
        supportsModel: () => true,
      };

      const mockFallback = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('Fallback failed')),
        getProviderName: () => 'anthropic',
        supportsModel: () => true,
      };

      const provider = new FallbackProvider(mockPrimary as any, [mockFallback as any]);

      await expect(
        provider.generateCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(LLMProviderError);

      expect(mockPrimary.generateCompletion).toHaveBeenCalledTimes(1);
      expect(mockFallback.generateCompletion).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateCompletionWithFallback', () => {
    it('should return metadata when primary succeeds', async () => {
      const mockPrimary = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Success',
          model: 'gpt-4',
        }),
        getProviderName: () => 'openai',
        supportsModel: () => true,
      };

      const provider = new FallbackProvider(mockPrimary as any);
      const result = await provider.generateCompletionWithFallback({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.response.content).toBe('Success');
      expect(result.usedProvider).toBe('openai');
      expect(result.wasFallback).toBe(false);
      expect(result.attemptedProviders).toEqual(['openai']);
    });

    it('should return metadata when fallback is used', async () => {
      const mockPrimary = {
        generateCompletion: vi.fn().mockRejectedValue(new Error('Primary failed')),
        getProviderName: () => 'openai',
        supportsModel: () => true,
      };

      const mockFallback = {
        generateCompletion: vi.fn().mockResolvedValue({
          content: 'Fallback success',
          model: 'claude-3-opus',
        }),
        getProviderName: () => 'anthropic',
        supportsModel: () => true,
      };

      const provider = new FallbackProvider(mockPrimary as any, [mockFallback as any]);
      const result = await provider.generateCompletionWithFallback({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.response.content).toBe('Fallback success');
      expect(result.usedProvider).toBe('anthropic');
      expect(result.wasFallback).toBe(true);
      expect(result.attemptedProviders).toEqual(['openai', 'anthropic']);
    });
  });
});

