import OpenAI from 'openai';
import { LLMProviderError } from '../errors/index.js';
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  OpenAIReasoningEffort,
  VendorClientOptions,
} from './llm-provider.js';

/**
 * Model used when neither the request nor the configuration names one: a current model that
 * calls tools through Chat Completions, on OpenAI and Azure alike (`gpt-4` shuts down on
 * 2026-10-23).
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.4';

/** How the OpenAI provider shapes its requests, for OpenAI models and compatible servers. */
export interface OpenAIRequestOptions {
  /**
   * Which models are reasoning models: they get `max_completion_tokens` and `reasoning_effort`,
   * and never `temperature`. When omitted, detected from the model name: the o-series (`o1`,
   * `o3`, `o4-mini`…) and GPT-5 and later (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), dated or
   * fine-tuned (`ft:o4-mini-…`). `true` or `false` holds for every model of this provider; a
   * list names the models that are, for names that say nothing (Azure deployments, gateway
   * aliases), the others being detected.
   */
  reasoningModels?: boolean | readonly string[];
  /** Reasoning effort sent to reasoning models when the request sets none (API default otherwise). */
  reasoningEffort?: OpenAIReasoningEffort;
  /**
   * Tool calls and results in the OpenAI format (assistant `tool_calls`, `tool` messages).
   * `false` for a compatible server that does not support them: the SDK then sends them as
   * plain text, as to any provider without native tool messages. Default `true`.
   */
  nativeToolMessages?: boolean;
}

/** Options of the OpenAI provider: its client's, and how it shapes requests. */
export interface OpenAIProviderOptions extends VendorClientOptions, OpenAIRequestOptions {}

/**
 * The body of a Chat Completions request. The installed client's types may predate some
 * `reasoning_effort` values; the API itself decides which ones a model accepts.
 */
type ChatCompletionBody = Omit<
  OpenAI.ChatCompletionCreateParamsNonStreaming,
  'reasoning_effort'
> & {
  reasoning_effort?: OpenAIReasoningEffort;
};

export class OpenAIProvider implements LLMProvider {
  readonly nativeToolMessages: boolean;
  private client: OpenAI;
  private defaultModel: string;
  private reasoningModels?: boolean | readonly string[];
  private reasoningEffort?: OpenAIReasoningEffort;

  constructor(
    apiKey: string,
    defaultModel = DEFAULT_OPENAI_MODEL,
    options: OpenAIProviderOptions = {}
  ) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }
    this.client = new OpenAI({
      apiKey,
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
    });
    this.defaultModel = defaultModel;
    this.nativeToolMessages = options.nativeToolMessages ?? true;
    this.reasoningModels = options.reasoningModels;
    this.reasoningEffort = options.reasoningEffort;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    if (request.abortSignal?.aborted) {
      // Never send (nor pay for) a request that is already cancelled.
      throw new Error('Request aborted');
    }
    try {
      // The signal cancels the HTTP request itself: the answer is not waited for.
      const response = await this.client.chat.completions.create(
        this.requestBody(request) as OpenAI.ChatCompletionCreateParamsNonStreaming,
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

  /**
   * The Chat Completions body of a request, with the parameters its model takes. A reasoning
   * model refuses `temperature` and `max_tokens` with a 400: it gets its output budget, reasoning
   * included, as `max_completion_tokens`, and the reasoning effort. Other models keep
   * `temperature` and `max_tokens`, the parameter every OpenAI-compatible server knows (some
   * ignore `max_completion_tokens`, which would silently lift the limit).
   */
  private requestBody(request: LLMRequest): ChatCompletionBody {
    const model = request.model || this.defaultModel;
    const tools = (request.tools ?? []).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    }));
    const body: ChatCompletionBody = {
      model,
      messages: request.messages.map(toOpenAIMessage),
      ...(tools.length > 0 ? { tools, tool_choice: 'auto' as const } : {}),
    };
    if (this.isReasoningModel(model)) {
      const effort = request.reasoningEffort ?? this.reasoningEffort;
      if (request.maxTokens !== undefined) body.max_completion_tokens = request.maxTokens;
      if (effort !== undefined) body.reasoning_effort = effort;
    } else {
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
    }
    return body;
  }

  private isReasoningModel(model: string): boolean {
    if (typeof this.reasoningModels === 'boolean') {
      return this.reasoningModels;
    }
    return this.reasoningModels?.includes(model) === true || isOpenAIReasoningModel(model);
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

/**
 * Whether a model name is an OpenAI reasoning model: the o-series (`o1`, `o3`, `o4-mini`…) and
 * GPT-5 and later (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), also dated (`o3-2025-04-16`) or
 * fine-tuned (`ft:o4-mini-2025-04-16:org::id`). Earlier GPT models (`gpt-4o`, `gpt-4.1`, Azure's
 * `gpt-35-turbo`) and open-weight ones served by compatible servers (`gpt-oss-20b`) are not. A
 * name that says nothing, such as an Azure deployment, cannot be detected: see
 * `reasoningModels`.
 */
function isOpenAIReasoningModel(model: string): boolean {
  const name = model.startsWith('ft:') ? model.slice('ft:'.length) : model;
  return /^o\d/.test(name) || /^gpt-[5-9](?:[.-]|$)/.test(name);
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
