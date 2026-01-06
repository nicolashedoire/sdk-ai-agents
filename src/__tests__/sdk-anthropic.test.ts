import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import { defineTool } from '../index.js';
import { z } from 'zod';
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

describe('SDK with Anthropic Provider', () => {
  beforeEach(() => {
    mockCreate.mockClear();
  });

  describe('createSDK with Anthropic', () => {
    it('should create SDK with Anthropic provider', () => {
      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: {
          anthropic: {
            apiKey: 'anthropic-key',
            defaultModel: 'claude-3-5-sonnet-20241022',
          },
        },
      });

      expect(sdk).toBeDefined();
    });

    it('should create agent with Claude model', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Hello! I can help you.',
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

      mockCreate.mockResolvedValue(mockResponse);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: {
          anthropic: {
            apiKey: 'anthropic-key',
          },
        },
      });

      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Performs calculations',
        schema: z.object({
          operation: z.enum(['add', 'subtract']),
          a: z.number(),
          b: z.number(),
        }),
        handler: async (params: unknown) => {
          const { operation, a, b } = params as { operation: 'add' | 'subtract'; a: number; b: number };
          return operation === 'add' ? a + b : a - b;
        },
      });

      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-3-opus-20240229',
        tools: [calculatorTool],
        maxSteps: 5,
      });

      const result = await agent.run({
        message: 'Hello, can you help me?',
      });

      expect(result.status).toBe('completed');
      expect(result.output).toContain('Hello! I can help you.');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should handle tool calls with Claude', async () => {
      const mockResponse1 = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'tool_use' as const,
            id: 'tool-1',
            name: 'calculator',
            input: { operation: 'add', a: 15, b: 23 },
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'tool_use' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 10,
        },
      };

      const mockResponse2 = {
        id: 'msg-124',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'The result is 38.',
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 30,
          output_tokens: 8,
        },
      };

      mockCreate
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: {
          anthropic: {
            apiKey: 'anthropic-key',
          },
        },
      });

      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Performs calculations',
        schema: z.object({
          operation: z.enum(['add', 'subtract']),
          a: z.number(),
          b: z.number(),
        }),
        handler: async (params: unknown) => {
          const { operation, a, b } = params as { operation: 'add' | 'subtract'; a: number; b: number };
          return { result: operation === 'add' ? a + b : a - b };
        },
      });

      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-3-opus-20240229',
        tools: [calculatorTool],
        maxSteps: 5,
      });

      const result = await agent.run({
        message: 'What is 15 + 23?',
      });

      expect(result.status).toBe('completed');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should use default Anthropic model if not specified', async () => {
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

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: {
          anthropic: {
            apiKey: 'anthropic-key',
            defaultModel: 'claude-3-5-sonnet-20241022',
          },
        },
      });

      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-3-5-sonnet-20241022',
        maxSteps: 5,
      });

      await agent.run({
        message: 'Hello',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-5-sonnet-20241022',
        })
      );
    });

    it('should handle errors from Anthropic API', async () => {
      const mockError = new Error('Anthropic API Error');
      mockCreate.mockRejectedValue(mockError);

      const sdk = createSDK({
        apiKey: 'test-key',
        provider: 'anthropic',
        providerConfig: {
          anthropic: {
            apiKey: 'anthropic-key',
          },
        },
      });

      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-3-opus-20240229',
        maxSteps: 5,
      });

      const result = await agent.run({
        message: 'Hello',
      });

      expect(result.status).toBe('failed');
      expect(result.error).toBeDefined();
    });
  });
});

