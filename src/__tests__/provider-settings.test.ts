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

describe('Provider Settings Configuration', () => {
  let eventStore: FileEventStore;

  beforeEach(() => {
    eventStore = new FileEventStore();
    mockOpenAICreate.mockClear();
    mockAnthropicCreate.mockClear();
  });

  describe('Agent-level provider settings', () => {
    it('should apply default provider settings from agent config', async () => {
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
              content: 'Hello',
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
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
        providerSettings: {
          default: {
            temperature: 0.9,
            maxTokens: 2000,
          },
        },
      });

      await agent.run({ message: 'Hello' });

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9,
          max_tokens: 2000,
        })
      );
    });

    it('should apply provider-specific settings from agent config', async () => {
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
              content: 'Hello',
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
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
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

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 1000,
        })
      );
    });

    it('should prioritize provider-specific over default settings', async () => {
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
              content: 'Hello',
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
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
        providerSettings: {
          default: {
            temperature: 0.9,
            maxTokens: 2000,
          },
          openai: {
            temperature: 0.5,
            maxTokens: 1000,
          },
        },
      });

      await agent.run({ message: 'Hello' });

      // Should use OpenAI-specific settings, not default
      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 1000,
        })
      );
    });
  });

  describe('Run-level provider settings', () => {
    it('should override agent settings with run-level settings', async () => {
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
              content: 'Hello',
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
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
        providerSettings: {
          openai: {
            temperature: 0.5,
            maxTokens: 1000,
          },
        },
      });

      await agent.run({
        message: 'Hello',
        providerSettings: {
          openai: {
            temperature: 0.8,
            maxTokens: 2000,
          },
        },
      });

      // Should use run-level settings, not agent settings
      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          max_tokens: 2000,
        })
      );
    });

    it('should apply run-level default settings', async () => {
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
              content: 'Hello',
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
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
        providerSettings: {
          openai: {
            temperature: 0.5,
          },
        },
      });

      await agent.run({
        message: 'Hello',
        providerSettings: {
          default: {
            maxTokens: 3000,
          },
        },
      });

      // Should use run-level default maxTokens, agent-level temperature
      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          max_tokens: 3000,
        })
      );
    });
  });

  describe('Settings priority', () => {
    it('should prioritize run provider-specific > run default > agent provider-specific > agent default', async () => {
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
              content: 'Hello',
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
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'gpt-4',
        maxSteps: 1,
        providerSettings: {
          default: {
            temperature: 0.3,
            maxTokens: 500,
          },
          openai: {
            temperature: 0.5,
            maxTokens: 1000,
          },
        },
      });

      await agent.run({
        message: 'Hello',
        providerSettings: {
          default: {
            temperature: 0.7,
            maxTokens: 1500,
          },
          openai: {
            temperature: 0.9,
            maxTokens: 2000,
          },
        },
      });

      // Should use run-level OpenAI-specific settings (highest priority)
      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9,
          max_tokens: 2000,
        })
      );
    });
  });

  describe('Anthropic provider settings', () => {
    it('should apply settings to Anthropic provider', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Hello',
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

      mockAnthropicCreate.mockResolvedValue(mockResponse);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: {
          anthropic: {
            apiKey: 'anthropic-key',
          },
        },
        eventStore,
      });

      const agent = sdk.createAgent({
        name: 'test-agent',
        model: 'claude-3-opus-20240229',
        maxSteps: 1,
        providerSettings: {
          anthropic: {
            temperature: 0.6,
            maxTokens: 1500,
          },
        },
      });

      await agent.run({ message: 'Hello' });

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.6,
          max_tokens: 1500,
        })
      );
    });
  });
});

