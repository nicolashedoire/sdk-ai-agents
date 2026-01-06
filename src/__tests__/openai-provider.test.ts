import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { LLMProviderError } from '../errors/index.js';
import OpenAI from 'openai';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: mockCreate,
        },
      };
    },
  };
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider('test-api-key');
    mockCreate.mockClear();
  });

  describe('constructor', () => {
    it('should create provider with API key', () => {
      const p = new OpenAIProvider('test-key');
      expect(p).toBeDefined();
    });

    it('should throw error if API key is empty', () => {
      expect(() => new OpenAIProvider('')).toThrow('OpenAI API key is required');
      expect(() => new OpenAIProvider('   ')).toThrow('OpenAI API key is required');
    });

    it('should use default model if not specified', () => {
      const p = new OpenAIProvider('test-key');
      expect(p.supportsModel('gpt-4')).toBe(true);
    });

    it('should use custom default model if specified', () => {
      const p = new OpenAIProvider('test-key', 'gpt-3.5-turbo');
      expect(p.supportsModel('gpt-3.5-turbo')).toBe(true);
    });
  });

  describe('supportsModel', () => {
    it('should return true for GPT models', () => {
      expect(provider.supportsModel('gpt-4')).toBe(true);
      expect(provider.supportsModel('gpt-3.5-turbo')).toBe(true);
      expect(provider.supportsModel('gpt-4-turbo')).toBe(true);
      expect(provider.supportsModel('o1-preview')).toBe(true);
      expect(provider.supportsModel('o1-mini')).toBe(true);
    });

    it('should return false for non-GPT models', () => {
      expect(provider.supportsModel('claude-3-opus')).toBe(false);
      expect(provider.supportsModel('unknown')).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return "openai"', () => {
      expect(provider.getProviderName()).toBe('openai');
    });
  });

  describe('generateCompletion', () => {
    it('should generate completion with text response', async () => {
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
              content: 'Hello! How can I help you?',
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

      mockCreate.mockResolvedValue(mockResponse);

      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello! How can I help you?');
      expect(result.model).toBe('gpt-4');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      });
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should generate completion with tool calls', async () => {
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
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function' as const,
                  function: {
                    name: 'calculator',
                    arguments: JSON.stringify({ operation: 'add', a: 1, b: 2 }),
                  },
                },
              ],
            },
            finish_reason: 'tool_calls' as const,
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Calculate 1+2' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Performs calculations',
              parameters: {
                type: 'object',
                properties: {
                  operation: { type: 'string' },
                  a: { type: 'number' },
                  b: { type: 'number' },
                },
              },
            },
          },
        ],
      });

      expect(result.content).toBeNull();
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.length).toBe(1);
      expect(result.toolCalls?.[0].function.name).toBe('calculator');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        operation: 'add',
        a: 1,
        b: 2,
      });
    });

    it('should handle system messages', async () => {
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
              content: 'OK',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await provider.generateCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello' },
          ],
        })
      );
    });

    it('should handle maxTokens parameter', async () => {
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
              content: 'OK',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 100,
        })
      );
    });

    it('should handle temperature parameter', async () => {
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
              content: 'OK',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        })
      );
    });

    it('should handle errors correctly', async () => {
      const mockError = new Error('API Error');
      mockCreate.mockRejectedValue(mockError);

      await expect(
        provider.generateCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(LLMProviderError);
    });

    it('should handle abort signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        provider.generateCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          abortSignal: abortController.signal,
        })
      ).rejects.toThrow('Request aborted');
    });

    it('should use default model if not specified', async () => {
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
              content: 'OK',
            },
            finish_reason: 'stop' as const,
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new OpenAIProvider('test-key', 'gpt-3.5-turbo');
      await provider.generateCompletion({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-3.5-turbo',
        })
      );
    });

    it('should handle empty response', async () => {
      const mockResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: 1234567890,
        model: 'gpt-4',
        choices: [],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await expect(
        provider.generateCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(LLMProviderError);
    });

    it('should handle tool calls with empty arguments', async () => {
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
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function' as const,
                  function: {
                    name: 'test_tool',
                    arguments: '',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls' as const,
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.[0].function.arguments).toBe('{}');
    });
  });
});

