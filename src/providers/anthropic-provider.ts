import Anthropic from '@anthropic-ai/sdk';
import { LLMProviderError } from '../errors/index.js';
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMToolCall,
  VendorClientOptions,
} from './llm-provider.js';

/** Model used when neither the request nor the configuration names one. */
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5';

export class AnthropicProvider implements LLMProvider {
  readonly nativeToolMessages = true;
  private client: Anthropic;
  private defaultModel: string;

  constructor(
    apiKey: string,
    defaultModel = DEFAULT_ANTHROPIC_MODEL,
    options: VendorClientOptions = {}
  ) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('Anthropic API key is required');
    }
    this.client = new Anthropic({
      apiKey,
      // Only the given key authenticates: the client would otherwise also send the
      // ANTHROPIC_AUTH_TOKEN environment variable as a bearer token, to any baseURL.
      authToken: null,
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
      const { system, messages } = this.convertMessages(request.messages);
      const tools = this.convertTools(request.tools);

      const params: Anthropic.MessageCreateParams = {
        model,
        max_tokens: request.maxTokens || defaultMaxTokens(model),
        system,
        messages,
        // Recent models refuse sampling parameters with a 400: temperature is not sent to them.
        ...(request.temperature !== undefined && acceptsSampling(model)
          ? { temperature: request.temperature }
          : {}),
      };

      if (tools && tools.length > 0) {
        params.tools = tools;
        // The SDK runs one tool per step, and every tool_use of a turn needs its tool_result:
        // the model is asked for at most one call per turn.
        params.tool_choice = { type: 'auto', disable_parallel_tool_use: true };
      }

      // The signal cancels the HTTP request itself: the answer is not waited for.
      const response = await this.client.messages.create(params, {
        signal: request.abortSignal,
      });

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

  /**
   * Messages in the Anthropic format: the system prompt apart, tool calls as `tool_use` blocks
   * and their results as `tool_result` blocks of the next user turn. A turn this vendor
   * returned is sent back exactly as received, with its thinking blocks, as the API requires.
   */
  private convertMessages(messages: LLMMessage[]): {
    system?: string;
    messages: Anthropic.MessageParam[];
  } {
    const systemParts: string[] = [];
    const converted: Anthropic.MessageParam[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          systemParts.push(message.content);
          break;
        case 'user':
          converted.push({ role: 'user', content: message.content });
          break;
        case 'assistant':
          converted.push({ role: 'assistant', content: assistantContent(message) });
          break;
        case 'tool': {
          const result: Anthropic.ToolResultBlockParam = {
            type: 'tool_result',
            tool_use_id: message.toolCallId,
            content: message.content,
            ...(message.isError ? { is_error: true } : {}),
          };
          // Results of the same turn go together in one user message.
          const previous = converted.at(-1);
          if (previous?.role === 'user' && Array.isArray(previous.content)) {
            previous.content.push(result);
          } else {
            converted.push({ role: 'user', content: [result] });
          }
          break;
        }
      }
    }

    const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
    return { system, messages: converted };
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
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        contentParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
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
      // Kept for the next turn when the model called a tool: see convertMessages.
      ...(toolCalls.length > 0
        ? { vendorContent: { provider: 'anthropic', content: response.content } }
        : {}),
      model: response.model || model,
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
      // Checked with instanceof so it survives minified bundles; timeouts are included.
      const connectionFailure = error instanceof Anthropic.APIConnectionError;
      return new LLMProviderError('anthropic', error, true, { connectionFailure });
    }
    return new LLMProviderError('anthropic', new Error(String(error)), true);
  }
}

/**
 * A model named `claude-<family>-<major>[-<minor>]`, the naming of Claude 4 and later, also
 * behind a platform prefix (`anthropic.`, `us.anthropic.`) or with a version suffix
 * (`-20250805`, `@20251101`, `-v1:0`).
 */
function modelVersion(model: string): { family: string; major: number; minor: number } | undefined {
  const match =
    /^(?:[\w-]+\.)*claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:[-@:]|$)/.exec(
      model
    );
  if (!match?.[1] || !match[2]) return undefined;
  return { family: match[1], major: Number(match[2]), minor: Number(match[3] ?? 0) };
}

/**
 * Whether the model takes `temperature`. Claude Opus 4.7 and later, Sonnet 5 and later, and the
 * Fable and Mythos models reject sampling parameters with a 400; older models accept them.
 */
export function acceptsSampling(model: string): boolean {
  const version = modelVersion(model);
  if (!version) return true;
  const { family, major, minor } = version;
  if (family === 'fable' || family === 'mythos') return false;
  if (family === 'opus') return major < 4 || (major === 4 && minor < 7);
  return major < 5;
}

/**
 * Output budget when the request sets none. Claude 4 and later may think before answering
 * (Opus 5, Sonnet 5 and Fable by default, the others when thinking is on), and thinking counts
 * in `max_tokens`: 4 096 would cut answers short, so they get 16 000 (the vendor client refuses
 * a non-streaming call above about 21 000). Opus 4 and 4.1 are capped at 8 192 without
 * streaming by that client, and Claude 3 models accept at most 4 096 to 8 192 output tokens.
 */
function defaultMaxTokens(model: string): number {
  const version = modelVersion(model);
  if (!version) return 4_096;
  if (version.family === 'opus' && version.major === 4 && version.minor <= 1) return 8_192;
  return 16_000;
}

/** An assistant turn: as this vendor returned it when available, else rebuilt from its parts. */
function assistantContent(
  message: Extract<LLMMessage, { role: 'assistant' }>
): Anthropic.MessageParam['content'] {
  if (message.vendorContent?.provider === 'anthropic') {
    // Blocks returned by the Messages API are valid input for the same API.
    return message.vendorContent.content as Anthropic.ContentBlockParam[];
  }
  if (!message.toolCalls || message.toolCalls.length === 0) {
    return message.content;
  }
  const blocks: Anthropic.ContentBlockParam[] = message.content
    ? [{ type: 'text', text: message.content }]
    : [];
  for (const [index, call] of message.toolCalls.entries()) {
    blocks.push({
      type: 'tool_use',
      id: call.id ?? `toolu_${index}`,
      name: call.function.name,
      input: JSON.parse(call.function.arguments || '{}') as unknown,
    });
  }
  return blocks;
}
