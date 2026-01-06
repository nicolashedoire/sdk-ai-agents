import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { ReasoningEngine } from '../engines/reasoning-engine.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { LLMProviderError } from '../errors/index.js';

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

describe('AnthropicProvider Integration', () => {
  let provider: AnthropicProvider;
  let reasoningEngine: ReasoningEngine;
  let eventStore: FileEventStore;

  beforeEach(() => {
    provider = new AnthropicProvider('test-api-key');
    reasoningEngine = new ReasoningEngine(provider, 'claude-3-opus-20240229');
    eventStore = new FileEventStore();
    mockCreate.mockClear();
  });

  describe('ReasoningEngine with AnthropicProvider', () => {
    it('should generate intention with text response', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'I will help you with that.',
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

      const intention = await reasoningEngine.generateIntention(
        {
          runId: 'test-run-id',
          agentId: 'test-agent-id',
          input: 'Hello, can you help me?',
          conversationHistory: [],
          availableTools: [],
          systemPrompt: 'You are a helpful assistant.',
          model: 'claude-3-opus-20240229',
        },
        eventStore
      );

      expect(intention.type).toBe('final_answer');
      expect(intention.reasoning).toBe('I will help you with that.');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should generate intention with tool call', async () => {
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
        model: 'claude-3-opus-20240229',
        stop_reason: 'tool_use' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 10,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const intention = await reasoningEngine.generateIntention(
        {
          runId: 'test-run-id',
          agentId: 'test-agent-id',
          input: 'Calculate 1 + 2',
          conversationHistory: [],
          availableTools: [
            {
              id: 'calc-1',
              name: 'calculator',
              description: 'Performs calculations',
              schema: z.object({}),
              handler: async () => ({}),
              version: '1.0.0',
            },
          ],
          model: 'claude-3-opus-20240229',
        },
        eventStore
      );

      expect(intention.type).toBe('tool_call');
      if (intention.type === 'tool_call') {
        expect(intention.toolName).toBe('calculator');
        expect(intention.parameters).toEqual({ operation: 'add', a: 1, b: 2 });
      }
    });

    it('should handle conversation history correctly', async () => {
      const mockResponse = {
        id: 'msg-123',
        type: 'message' as const,
        role: 'assistant' as const,
        content: [
          {
            type: 'text' as const,
            text: 'Yes, I remember. The answer is 3.',
          },
        ],
        model: 'claude-3-opus-20240229',
        stop_reason: 'end_turn' as const,
        stop_sequence: null,
        usage: {
          input_tokens: 15,
          output_tokens: 8,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      await reasoningEngine.generateIntention(
        {
          runId: 'test-run-id',
          agentId: 'test-agent-id',
          input: 'What was the result?',
          conversationHistory: [
            { role: 'user', content: 'Calculate 1 + 2' },
            { role: 'assistant', content: 'I calculated 1 + 2 = 3' },
          ],
          availableTools: [],
          model: 'claude-3-opus-20240229',
        },
        eventStore
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'user', content: 'Calculate 1 + 2' },
            { role: 'assistant', content: 'I calculated 1 + 2 = 3' },
            { role: 'user', content: 'What was the result?' },
          ]),
        })
      );
    });

    it('should handle system prompt correctly', async () => {
      const mockResponse = {
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

      mockCreate.mockResolvedValue(mockResponse);

      await reasoningEngine.generateIntention(
        {
          runId: 'test-run-id',
          agentId: 'test-agent-id',
          input: 'Hello',
          conversationHistory: [],
          availableTools: [],
          systemPrompt: 'You are a math expert.',
          model: 'claude-3-opus-20240229',
        },
        eventStore
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a math expert.',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('should handle errors and wrap them correctly', async () => {
      const mockError = new Error('API Error');
      mockCreate.mockRejectedValue(mockError);

      await expect(
        reasoningEngine.generateIntention(
          {
            runId: 'test-run-id',
            agentId: 'test-agent-id',
            input: 'Hello',
            conversationHistory: [],
            availableTools: [],
            model: 'claude-3-opus-20240229',
          },
          eventStore
        )
      ).rejects.toThrow(LLMProviderError);
    });

    it('should handle abort signal', async () => {
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        reasoningEngine.generateIntention(
          {
            runId: 'test-run-id',
            agentId: 'test-agent-id',
            input: 'Hello',
            conversationHistory: [],
            availableTools: [],
            abortSignal: abortController.signal,
            model: 'claude-3-opus-20240229',
          },
          eventStore
        )
      ).rejects.toThrow();
    });
  });
});

