import OpenAI from 'openai';
import { LLMProviderError } from '../errors/index.js';
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  VendorClientOptions,
} from './llm-provider.js';

export class OpenAIProvider implements LLMProvider {
  readonly nativeToolMessages = true;
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'gpt-4', options: VendorClientOptions = {}) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({
      apiKey,
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.defaultModel = defaultModel;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    if (request.abortSignal?.aborted) {
      // Never send (nor pay for) a request that is already cancelled.
      throw new Error('Request aborted');
    }
    try {
      const model = request.model || this.defaultModel;
      const messages = request.messages.map(toOpenAIMessage);

      const tools = request.tools?.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
        },
      }));

      // The signal cancels the HTTP request itself: the answer is not waited for.
      const response = await this.client.chat.completions.create(
        {
          model,
          messages,
          tools: tools && tools.length > 0 ? tools : undefined,
          tool_choice: tools && tools.length > 0 ? 'auto' : undefined,
          temperature: request.temperature,
          max_tokens: request.maxTokens,
        },
        { signal: request.abortSignal }
      );

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
        id: tc.id,
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
    return /^(ft:)?(gpt-|chatgpt-|o\d)/.test(model);
  }

  getProviderName(): string {
    return 'openai';
  }

  private wrapError(error: unknown): LLMProviderError {
    if (error instanceof Error) {
      // Checked with instanceof so it survives minified bundles; timeouts are included.
      const connectionFailure = error instanceof OpenAI.APIConnectionError;
      return new LLMProviderError('openai', error, true, { connectionFailure });
    }
    return new LLMProviderError('openai', new Error(String(error)), true);
  }
}

/** A message in the OpenAI format: tool calls on the assistant turn, results as `tool` messages. */
function toOpenAIMessage(message: LLMMessage): OpenAI.ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return message.toolCalls && message.toolCalls.length > 0
        ? {
            role: 'assistant',
            content: message.content || null,
            tool_calls: message.toolCalls.map((call, index) => ({
              id: call.id ?? `call_${index}`,
              type: 'function' as const,
              function: { name: call.function.name, arguments: call.function.arguments },
            })),
          }
        : { role: 'assistant', content: message.content };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}
