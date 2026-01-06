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

describe('ReasoningEngine Isolation', () => {
  let eventStore: FileEventStore;

  beforeEach(() => {
    eventStore = new FileEventStore();
    mockOpenAICreate.mockClear();
  });

  it('should create separate ReasoningEngine for each agent', () => {
    const sdk = createSDK({
      apiKey: 'test-key',
      provider: 'openai',
      eventStore,
    });

    const agent1 = sdk.createAgent({
      name: 'agent-1',
      model: 'gpt-4',
      maxSteps: 1,
    });

    const agent2 = sdk.createAgent({
      name: 'agent-2',
      model: 'gpt-3.5-turbo',
      maxSteps: 1,
    });

    // Each agent should have its own ReasoningEngine instance
    // We can't directly access it, but we can verify behavior
    expect(agent1).toBeDefined();
    expect(agent2).toBeDefined();
    expect(agent1).not.toBe(agent2);
  });

  it('should use agent-specific model in ReasoningEngine', async () => {
    const mockResponse1 = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Response from gpt-4',
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

    const mockResponse2 = {
      id: 'chatcmpl-456',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-3.5-turbo',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant' as const,
            content: 'Response from gpt-3.5-turbo',
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

    mockOpenAICreate
      .mockResolvedValueOnce(mockResponse1)
      .mockResolvedValueOnce(mockResponse2);

    const sdk = createSDK({
      apiKey: 'test-key',
      provider: 'openai',
      eventStore,
    });

    const agent1 = sdk.createAgent({
      name: 'agent-1',
      model: 'gpt-4',
      maxSteps: 1,
    });

    const agent2 = sdk.createAgent({
      name: 'agent-2',
      model: 'gpt-3.5-turbo',
      maxSteps: 1,
    });

    await agent1.run({ message: 'Hello from agent 1' });
    await agent2.run({ message: 'Hello from agent 2' });

    // Verify that each agent used its own model
    expect(mockOpenAICreate).toHaveBeenCalledTimes(2);
    expect(mockOpenAICreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'gpt-4',
      })
    );
    expect(mockOpenAICreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'gpt-3.5-turbo',
      })
    );
  });
});

