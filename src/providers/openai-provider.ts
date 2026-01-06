import OpenAI from 'openai';
import { LLMProviderError } from '../errors/index.js';
import type { LLMProvider, LLMRequest, LLMResponse } from './llm-provider.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gpt-4') {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    try {
      const model = request.model || this.defaultModel;
      const messages = request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const tools = request.tools?.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));

      const callPromise = this.client.chat.completions.create({
        model,
        messages,
        tools: tools && tools.length > 0 ? tools : undefined,
        tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      });

      if (request.abortSignal) {
        request.abortSignal.addEventListener('abort', () => {
          callPromise.catch(() => {});
        });
      }

      const response = await callPromise;

      if (request.abortSignal?.aborted) {
        throw new Error('Request aborted');
      }

      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No response from LLM');
      }

      const message = choice.message;

      const content = message.content || null;
      const toolCalls = message.tool_calls?.map((tc) => ({
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments || '{}',
        },
      }));

      return {
        content,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        model: response.model,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (request.abortSignal?.aborted) {
        throw new Error('Request aborted');
      }
      throw this.wrapError(error);
    }
  }

  supportsModel(model: string): boolean {
    return model.startsWith('gpt-') || model.startsWith('o1-');
  }

  getProviderName(): string {
    return 'openai';
  }

  private wrapError(error: unknown): LLMProviderError {
    if (error instanceof Error) {
      return new LLMProviderError('openai', error, true);
    }
    return new LLMProviderError('openai', new Error(String(error)), true);
  }
}

