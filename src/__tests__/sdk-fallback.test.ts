import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { z } from 'zod';

// Mock OpenAI
const mockOpenAICreate = vi.fn();
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockOpenAICreate,
        },
      };
    },
  };
});

// Mock Anthropic
const mockAnthropicCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockAnthropicCreate,
      };
    },
  };
});

describe('SDK with Fallback Providers', () => {
  let eventStore: FileEventStore;

  beforeEach(() => {
    eventStore = new FileEventStore();
    mockOpenAICreate.mockClear();
    mockAnthropicCreate.mockClear();
  });

  describe('createSDK with fallback', () => {
    it('should create SDK with fallback providers configured', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'openai',
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'anthropic-key',
            },
          },
        ],
        eventStore,
      });

      expect(sdk).toBeDefined();
    });

    it('should use primary provider when it succeeds', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Hello from OpenAI',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      mockOpenAICreate.mockResolvedValue(mockResponse);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'openai',
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'anthropic-key',
            },
          },
        ],
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });

    it('should fallback to secondary provider when primary fails', async () => {
      // Primary provider fails
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'));

      // Fallback provider succeeds
      const mockAnthropicResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Hello from Anthropic',
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      mockAnthropicCreate.mockResolvedValue(mockAnthropicResponse);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'openai',
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'anthropic-key',
            },
          },
        ],
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      expect(result.output).toContain('Hello from Anthropic');
      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    });

    it('should log fallback event when fallback is used', async () => {
      // Primary provider fails
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'));

      // Fallback provider succeeds
      const mockAnthropicResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Hello from Anthropic',
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      mockAnthropicCreate.mockResolvedValue(mockAnthropicResponse);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'openai',
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'anthropic-key',
            },
          },
        ],
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
      });

      const result = await agent.run({ message: 'Hello' });
      expect(result.status).toBe('completed');

      // Check that fallback event was logged
      const events = await sdk.getEvents(result.runId);
      const fallbackEvents = events.filter((e) => e.type === 'provider.fallback');

      expect(fallbackEvents.length).toBeGreaterThan(0);
      expect(fallbackEvents[0].data).toMatchObject({
        primaryProvider: 'openai',
        usedProvider: 'anthropic',
      });
      expect(fallbackEvents[0].data.attemptedProviders).toContain('openai');
      expect(fallbackEvents[0].data.attemptedProviders).toContain('anthropic');
    });

    it('should try all fallback providers in order', async () => {
      // Primary fails
      mockOpenAICreate.mockRejectedValueOnce(new Error('OpenAI API error'));

      // First fallback fails
      mockAnthropicCreate.mockRejectedValueOnce(new Error('Anthropic API error'));

      // Second fallback succeeds (OpenAI as fallback)
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant' as const,
              content: 'Hello from OpenAI fallback',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      // Mock will be called again for the second fallback (OpenAI)
      mockOpenAICreate.mockResolvedValueOnce(mockResponse);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'openai',
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'anthropic-key',
            },
          },
          {
            provider: 'openai',
            config: {
              apiKey: 'openai-fallback-key',
            },
          },
        ],
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      // Primary called once (failed), second fallback (OpenAI) called once (succeeded)
      // Note: Since both use the same mock, we can't distinguish, but we know it was called at least twice
      expect(mockOpenAICreate).toHaveBeenCalledTimes(2); // Primary + second fallback
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1); // First fallback
    });

    it('should fail when all providers fail', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'));
      mockAnthropicCreate.mockRejectedValue(new Error('Anthropic API error'));

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'openai',
        fallbackProviders: [
          {
            provider: 'anthropic',
            config: {
              apiKey: 'anthropic-key',
            },
          },
        ],
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('failed');
      expect(mockOpenAICreate).toHaveBeenCalledTimes(1);
      expect(mockAnthropicCreate).toHaveBeenCalledTimes(1);
    });
  });
});

