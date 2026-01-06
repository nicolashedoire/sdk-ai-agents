import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';

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

describe('Provider Settings with FallbackProvider', () => {
  let eventStore: FileEventStore;

  beforeEach(() => {
    eventStore = new FileEventStore();
    mockOpenAICreate.mockClear();
    mockAnthropicCreate.mockClear();
  });

  it('should apply correct settings when fallback occurs', async () => {
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
      model: 'gpt-4', // Model suggests OpenAI, but fallback will use Anthropic
      maxSteps: 1,
      providerSettings: {
        openai: {
          temperature: 0.5,
          maxTokens: 1000,
        },
        anthropic: {
          temperature: 0.8,
          maxTokens: 2000,
        },
      },
    });

    await agent.run({ message: 'Hello' });

    // Should use Anthropic settings (0.8, 2000) not OpenAI settings (0.5, 1000)
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.8,
        max_tokens: 2000,
      })
    );
  });

  it('should apply default settings when provider-specific not available', async () => {
    mockOpenAICreate.mockRejectedValue(new Error('OpenAI API error'));

    const mockAnthropicResponse = {
      id: 'msg-123',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'OK' }],
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
      providerSettings: {
        default: {
          temperature: 0.7,
          maxTokens: 1500,
        },
      },
    });

    await agent.run({ message: 'Hello' });

    // Should use default settings for Anthropic
    expect(mockAnthropicCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.7,
        max_tokens: 1500,
      })
    );
  });
});

