import Anthropic from '@anthropic-ai/sdk';
import { LLMProviderError } from '../errors/index.js';
import type { LLMProvider, LLMRequest, LLMResponse, VendorClientOptions } from './llm-provider.js';

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | Anthropic.MessageParam['content'];
}

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(
    apiKey: string,
    defaultModel = 'claude-3-5-sonnet-20241022',
    options: VendorClientOptions = {}
  ) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Anthropic API key is required');
    }
    this.client = new Anthropic({
      apiKey,
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.defaultModel = defaultModel;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    try {
      const model = request.model || this.defaultModel;
      const { system, messages } = this.convertMessages(request.messages);
      const tools = this.convertTools(request.tools);

      const params: Anthropic.MessageCreateParams = {
        model,
        max_tokens: request.maxTokens || 4096,
        system,
        messages,
        temperature: request.temperature,
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        params.tool_choice = { type: 'auto' };
      }

      const callPromise = this.client.messages.create(params);

      if (request.abortSignal) {
        request.abortSignal.addEventListener('abort', () => {
          callPromise.catch(() => {});
        });
      }

      const response = await callPromise;

      if (request.abortSignal?.aborted) {
        throw new Error('Request aborted');
      }

      return this.convertResponse(response, model);
    } catch (error) {
      if (request.abortSignal?.aborted) {
        throw new Error('Request aborted');
      }
      throw this.wrapError(error);
    }
  }

  supportsModel(model: string): boolean {
    return model.startsWith('claude-');
  }

  getProviderName(): string {
    return 'anthropic';
  }

  private convertMessages(messages: LLMRequest['messages']): {
    system?: string;
    messages: AnthropicMessage[];
  } {
    const systemParts: string[] = [];
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemParts.push(msg.content);
      } else {
        anthropicMessages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content,
        });
      }
    }

    const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
    return { system, messages: anthropicMessages };
  }

  private convertTools(tools?: LLMRequest['tools']): Anthropic.Tool[] | undefined {
    if (!tools || tools.length === 0) {
      return undefined;
    }

    return tools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      input_schema: {
        type: 'object',
        ...(tool.function.parameters as Record<string, unknown>),
      },
    }));
  }

  private convertResponse(response: Anthropic.Message, model: string): LLMResponse {
    const contentParts: string[] = [];
    const toolCalls: Array<{
      function: { name: string; arguments: string };
    }> = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        contentParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    const content = contentParts.length > 0 ? contentParts.join('\n\n') : null;

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model,
      usage: response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          }
        : undefined,
    };
  }

  private wrapError(error: unknown): LLMProviderError {
    if (error instanceof Error) {
      // Checked with instanceof so it survives minified bundles; guarded for test doubles.
      const connectionError: unknown = Reflect.get(Anthropic, 'APIConnectionError');
      const connectionFailure =
        typeof connectionError === 'function' && error instanceof connectionError;
      return new LLMProviderError('anthropic', error, true, { connectionFailure });
    }
    return new LLMProviderError('anthropic', new Error(String(error)), true);
  }
}
