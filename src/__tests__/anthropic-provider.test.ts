import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { LLMProviderError } from '../errors/index.js';
import Anthropic from '@anthropic-ai/sdk';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: mockCreate,
      };
    },
  };
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('test-api-key');
    mockCreate.mockClear();
  });

  describe('constructor', () => {
    it('should create provider with API key', () => {
      const p = new AnthropicProvider('test-key');
      expect(p).toBeDefined();
    });

    it('should use default model if not specified', () => {
      const p = new AnthropicProvider('test-key');
      expect(p.supportsModel('claude-3-5-sonnet-20241022')).toBe(true);
    });

    it('should use custom default model if specified', () => {
      const p = new AnthropicProvider('test-key', 'claude-3-opus-20240229');
      expect(p.supportsModel('claude-3-opus-20240229')).toBe(true);
    });
  });

  describe('supportsModel', () => {
    it('should return true for Claude models', () => {
      expect(provider.supportsModel('claude-3-opus-20240229')).toBe(true);
      expect(provider.supportsModel('claude-3-sonnet-20240229')).toBe(true);
      expect(provider.supportsModel('claude-3-haiku-20240307')).toBe(true);
      expect(provider.supportsModel('claude-3-5-sonnet-20241022')).toBe(true);
    });

    it('should return false for non-Claude models', () => {
      expect(provider.supportsModel('gpt-4')).toBe(false);
      expect(provider.supportsModel('o1-preview')).toBe(false);
      expect(provider.supportsModel('unknown')).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return "anthropic"', () => {
      expect(provider.getProviderName()).toBe('anthropic');
    });
  });

  describe('generateCompletion', () => {
    it('should convert messages correctly', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Hello!',
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider('test-key');
      const result = await provider.generateCompletion({
        model: 'claude-3-opus-20240229',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
          system: 'You are helpful',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
      expect(result.content).toBe('Hello!');
      expect(result.model).toBe('claude-3-opus-20240229');
    });

    it('should convert tool calls correctly', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'tool_use' as const,
            id: 'tool-1',
            name: 'calculator',
            input: { operation: 'add', a: 1, b: 2 },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 10,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider('test-key');
      const result = await provider.generateCompletion({
        model: 'claude-3-opus-20240229',
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

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.length).toBe(1);
      expect(result.toolCalls?.[0].function.name).toBe('calculator');
      expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({
        operation: 'add',
        a: 1,
        b: 2,
      });
    });

    it('should handle mixed content (text + tool calls)', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'I will calculate that.',
          },
          {
            type: 'tool_use' as const,
            id: 'tool-1',
            name: 'calculator',
            input: { operation: 'add', a: 1, b: 2 },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider('test-key');
      const result = await provider.generateCompletion({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Calculate 1+2' }],
      });

      expect(result.content).toBe('I will calculate that.');
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls?.length).toBe(1);
    });

    it('should convert tools correctly', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: 'OK' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider('test-key');
      await provider.generateCompletion({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
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

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'calculator',
              description: 'Performs calculations',
              input_schema: {
                type: 'object',
                properties: {
                  operation: { type: 'string' },
                  a: { type: 'number' },
                  b: { type: 'number' },
                },
              },
            },
          ],
        })
      );
    });

    it('should handle errors correctly', async () => {
      const mockError = new Error('API Error');
      mockCreate.mockRejectedValue(mockError);

      const provider = new AnthropicProvider('test-key');
      await expect(
        provider.generateCompletion({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      ).rejects.toThrow(LLMProviderError);
    });

    it('should handle abort signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const provider = new AnthropicProvider('test-key');
      await expect(
        provider.generateCompletion({
          model: 'claude-3-opus-20240229',
          messages: [{ role: 'user', content: 'Hello' }],
          abortSignal: abortController.signal,
        })
      ).rejects.toThrow('Request aborted');
    });

    it('should use default model if not specified', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider('test-key', 'claude-3-opus-20240229');
      await provider.generateCompletion({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
        })
      );
    });

    it('should convert usage tokens correctly', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [{ type: 'text' as const, text: 'Hello' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const provider = new AnthropicProvider('test-key');
      const result = await provider.generateCompletion({
        model: 'claude-3-opus-20240229',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });
  });
});

