import { describe, it, expect } from 'vitest';
import type { LLMProvider, LLMRequest, LLMResponse } from '../../providers/llm-provider.js';

describe('LLMProvider Interface', () => {
  it('should define LLMRequest interface correctly', () => {
    const request: LLMRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      temperature: 0.7,
    };
    
    expect(request.model).toBe('gpt-4');
    expect(request.messages).toHaveLength(1);
    expect(request.temperature).toBe(0.7);
  });

  it('should define LLMRequest with tools', () => {
    const request: LLMRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { type: 'object', properties: {} }
          }
        }
      ],
    };
    
    expect(request.tools).toBeDefined();
    expect(request.tools?.[0]?.function.name).toBe('test_tool');
  });

  it('should define LLMResponse interface correctly', () => {
    const response: LLMResponse = {
      content: 'Hello, how can I help?',
      model: 'gpt-4',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      },
    };
    
    expect(response.content).toBe('Hello, how can I help?');
    expect(response.model).toBe('gpt-4');
    expect(response.usage?.totalTokens).toBe(15);
  });

  it('should define LLMResponse with tool calls', () => {
    const response: LLMResponse = {
      content: null,
      toolCalls: [
        {
          function: {
            name: 'test_tool',
            arguments: '{"param": "value"}',
          },
        },
      ],
      model: 'gpt-4',
    };
    
    expect(response.content).toBeNull();
    expect(response.toolCalls).toBeDefined();
    expect(response.toolCalls?.[0]?.function.name).toBe('test_tool');
  });

  it('should define LLMProvider interface contract', () => {
    // Test que l'interface peut être implémentée
    const mockProvider: LLMProvider = {
      async generateCompletion(_request: LLMRequest): Promise<LLMResponse> {
        return {
          content: 'test',
          model: 'test-model',
        };
      },
      supportsModel(_model: string): boolean {
        return true;
      },
      getProviderName(): string {
        return 'test-provider';
      },
    };
    
    expect(mockProvider.getProviderName()).toBe('test-provider');
    expect(mockProvider.supportsModel('test')).toBe(true);
  });
});

