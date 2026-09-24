import OpenAI from 'openai';
import { LLMProviderError, ValidationError } from '../errors/index.js';
import type {
  LLMMessage,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  OpenAIReasoningEffort,
  VendorClientOptions,
} from './llm-provider.js';

/**
 * Model used when neither the request nor the configuration names one (`gpt-4` shuts down on
 * 2026-10-23), on OpenAI and Azure alike. A reasoning model that calls tools through Chat
 * Completions with its default effort, `none`: with another effort, OpenAI refuses tools there
 * (see `reasoningEffort`).
 */
export const DEFAULT_OPENAI_MODEL = 'gpt-5.4';

/** Address of OpenAI's own API. */
const OPENAI_API = 'https://api.openai.com/v1';

/**
 * Whether a streamed request asks for its usage (`stream_options.include_usage`): as set, else
 * only on OpenAI's own API, since a compatible server may refuse the field or ignore it.
 */
export function asksForStreamUsage(baseURL: string, includeStreamUsage?: boolean): boolean {
  return includeStreamUsage ?? baseURL.replace(/\/+$/, '') === OPENAI_API;
}

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
  /**
   * Reasoning effort sent to reasoning models when the request sets none; the model's own
   * default otherwise. On Chat Completions, which this provider uses, GPT-5.4 and later call
   * tools only with the effort `none`: GPT-5.4 defaults to it, but GPT-5.5, GPT-5.6 and GPT-6
   * Sol and Luna default to `medium`, so an agent with tools needs `none` on them, and GPT-6
   * Astra cannot call tools there at all. The effort is sent as given, never changed.
   */
  reasoningEffort?: OpenAIReasoningEffort;
  /**
   * Whether the server accepts earlier tool calls and results in the conversation, in the OpenAI
   * format (assistant `tool_calls`, `tool` messages). `false` for a compatible server that does
   * not: they are then sent as plain text. Tools are still offered, and the tool calls of a reply
   * still read. In a fallback chain, one provider with `false` makes the whole chain send plain
   * text. Default `true`.
   */
  nativeToolMessages?: boolean;
  /**
   * Whether a streamed request asks for its usage (`stream_options: { include_usage: true }`).
   * By default only on OpenAI's own API: a compatible server may refuse the field, or ignore
   * it. Without usage, the call counts as unmetered.
   */
  includeStreamUsage?: boolean;
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
  /** Streamed requests ask for their usage; off for good once the server refused the field. */
  private streamUsage: boolean;
  /** Models the API refused to stream (an organization not verified for them). */
  private readonly unstreamable = new Set<string>();

  constructor(
    apiKey: string,
    defaultModel = DEFAULT_OPENAI_MODEL,
    options: OpenAIProviderOptions = {}
  ) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('OpenAI API key is required');
    }
    assertOpenAIRequestOptions(options, 'options');
    this.client = new OpenAI({
      apiKey,
      ...(options.maxRetries !== undefined ? { maxRetries: options.maxRetries } : {}),
      ...(options.baseURL !== undefined ? { baseURL: options.baseURL } : {}),
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
    });
    this.defaultModel = defaultModel;
    this.nativeToolMessages = options.nativeToolMessages ?? true;
    this.reasoningModels = options.reasoningModels;
    this.reasoningEffort = options.reasoningEffort;
    this.streamUsage = asksForStreamUsage(this.client.baseURL, options.includeStreamUsage);
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    if (request.abortSignal?.aborted) {
      // Never send (nor pay for) a request that is already cancelled.
      throw new Error('Request aborted');
    }
    try {
      const body = this.requestBody(request);

      // The signal cancels the HTTP request itself: the answer is not waited for.
      const completion = request.onTextDelta
        ? await this.streamCompletion(body, request.onTextDelta, request.abortSignal)
        : await this.complete(body, request.abortSignal);

      if (request.abortSignal?.aborted) {
        throw new Error('Request aborted');
      }

      const message = completion.message;
      if (!message) {
        // Billed all the same: the caller is told what it cost before this call fails. A
        // stream reports its usage in its last chunk, when asked for.
        if (completion.usage) {
          request.onDiscardedAnswer?.({
            provider: 'openai',
            // The model that answered, else the one the request body named.
            model: completion.model || request.model || this.defaultModel,
            usage: {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
            },
            reason: 'No response from LLM',
          });
        }
        throw new Error('No response from LLM');
      }

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
        model: completion.model,
        usage: completion.usage
          ? {
              promptTokens: completion.usage.prompt_tokens,
              completionTokens: completion.usage.completion_tokens,
              totalTokens: completion.usage.total_tokens,
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

  /** The answer in one response. */
  private async complete(
    body: ChatCompletionBody,
    signal: AbortSignal | undefined
  ): Promise<Completion> {
    const response = await this.client.chat.completions.create(
      body as OpenAI.ChatCompletionCreateParamsNonStreaming,
      { signal }
    );
    return { model: response.model, message: response.choices[0]?.message, usage: response.usage };
  }

  /**
   * The answer streamed, each piece of text passed on as it arrives. When the API refuses to
   * stream this model (OpenAI does for an organization that is not verified for it), the answer
   * comes in one response, its text in one piece, and the model is no longer streamed.
   */
  private async streamCompletion(
    body: ChatCompletionBody,
    onTextDelta: (delta: string) => void,
    signal: AbortSignal | undefined
  ): Promise<Completion> {
    if (!this.unstreamable.has(body.model)) {
      try {
        return await this.readStream(body, onTextDelta, signal);
      } catch (error) {
        if (!refusesStreaming(error)) throw error;
        this.unstreamable.add(body.model);
      }
    }
    const completion = await this.complete(body, signal);
    if (completion.message?.content) onTextDelta(completion.message.content);
    return completion;
  }

  /** Sends the streamed request; a server that refuses `stream_options` gets it without. */
  private async openStream(
    body: ChatCompletionBody,
    signal: AbortSignal
  ): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>> {
    const send = () =>
      this.client.chat.completions.create(
        {
          ...(body as OpenAI.ChatCompletionCreateParamsNonStreaming),
          stream: true,
          ...(this.streamUsage ? { stream_options: { include_usage: true } } : {}),
        },
        { signal }
      );
    try {
      return await send();
    } catch (error) {
      if (!this.streamUsage || !refusesStreamUsage(error)) throw error;
      // Asked once more without it, and never again: its answers then carry no usage.
      this.streamUsage = false;
      return await send();
    }
  }

  /**
   * Reads the stream, passing each piece of text on as it arrives, and assembles what the
   * non-streaming API returns: the text, the tool calls (their pieces joined by index), the
   * model and the usage (sent in a last chunk when asked for). The client's timeout ends when
   * the answer starts: a stream that then sends nothing for as long is cut here.
   */
  private async readStream(
    body: ChatCompletionBody,
    onTextDelta: (delta: string) => void,
    signal: AbortSignal | undefined
  ): Promise<Completion> {
    const reading = new AbortController();
    const cancel = () => reading.abort();
    if (signal?.aborted) cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    const idleMs = this.client.timeout;
    let stalled = false;
    let timer: NodeJS.Timeout | undefined;
    const awaitNextEvent = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        stalled = true;
        reading.abort();
      }, idleMs);
    };

    let model = body.model;
    let usage: OpenAI.CompletionUsage | undefined;
    let answered = false;
    let content: string | null = null;
    let finishReason: string | null = null;
    const toolCalls = new Map<string, { rank: number; call: CompletionToolCall }>();
    let lastCall: string | undefined;

    try {
      const stream = await this.openStream(body, reading.signal);
      awaitNextEvent();
      for await (const chunk of stream) {
        awaitNextEvent();
        if (chunk.model) model = chunk.model;
        if (chunk.usage) usage = chunk.usage;
        // The SDK asks for one answer: the choice of index 0, as without streaming.
        const choice = chunk.choices?.find((candidate) => candidate.index === 0);
        if (!choice) continue;
        answered = true;
        const { delta } = choice;
        if (delta.content) {
          content = (content ?? '') + delta.content;
          onTextDelta(delta.content);
        }
        for (const piece of delta.tool_calls ?? []) {
          // Compatible servers may leave out `index`: a new id then starts a new call, and a
          // piece with neither continues the last one.
          const index: number | undefined = piece.index;
          const key =
            index !== undefined ? `#${index}` : piece.id ? `id ${piece.id}` : (lastCall ?? '#0');
          const entry = toolCalls.get(key) ?? {
            rank: index ?? toolCalls.size,
            call: { function: { name: '', arguments: '' } },
          };
          toolCalls.set(key, entry);
          lastCall = key;
          if (piece.id) entry.call.id = piece.id;
          if (piece.function?.name) entry.call.function.name = piece.function.name;
          if (piece.function?.arguments) entry.call.function.arguments += piece.function.arguments;
        }
        if (choice.finish_reason) finishReason = choice.finish_reason;
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }

    if (stalled) {
      throw new OpenAI.APIConnectionTimeoutError({
        message: `The answer stream sent nothing for ${idleMs} ms`,
      });
    }
    // A cancelled stream ends early without an error: the caller sees the abort.
    if (signal?.aborted || !answered) {
      return { model, usage };
    }
    if (!finishReason) {
      // Every answer ends with a reason: without it, the stream was cut short.
      throw new OpenAI.APIConnectionError({
        message: 'The answer stream ended before the answer was complete',
      });
    }
    return {
      model,
      usage,
      message: {
        content,
        tool_calls: [...toolCalls.values()]
          .sort((first, second) => first.rank - second.rank)
          .map((entry) => entry.call),
      },
    };
  }

  supportsModel(model: string): boolean {
    return /^(ft:)?(gpt-|chatgpt-|o\d)/.test(model);
  }

  getProviderName(): string {
    return 'openai';
  }

  /**
   * The Chat Completions body of a request, with the parameters its model takes. A reasoning
   * model refuses `max_tokens`, and `temperature` unless its effort is `none`, with a 400. As
   * the default effort varies by model, it never gets a temperature (the request's is ignored);
   * it gets its output budget, reasoning included, as `max_completion_tokens`, and the
   * reasoning effort. Other models keep `temperature` and `max_tokens`, the parameter every
   * OpenAI-compatible server knows (some ignore `max_completion_tokens`, which would silently
   * lift the limit).
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
 * GPT-5 and later (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`, `gpt-10`…), whatever the letter case, also dated
 * (`o3-2025-04-16`) or fine-tuned (`ft:o4-mini-2025-04-16:org::id`). Earlier GPT models
 * (`gpt-4o`, `gpt-4.1`, Azure's `gpt-35-turbo`, whose 35 is GPT-3.5) and open-weight ones served
 * by compatible servers (`gpt-oss-20b`) are not. A name that says nothing, such as an Azure
 * deployment, cannot be detected: see `reasoningModels`.
 */
function isOpenAIReasoningModel(model: string): boolean {
  const name = model.replace(/^ft:/i, '');
  return /^o\d/i.test(name) || /^gpt-(?!35(?:[.-]|$))(?:[5-9]|[1-9]\d+)(?:[.-]|$)/i.test(name);
}

/**
 * Checks OpenAI request options given as plain values (a JSON configuration, JavaScript code),
 * whose types nothing checked: a string given as `reasoningModels` would otherwise match every
 * model name it contains. `path` names the options in the error.
 */
export function assertOpenAIRequestOptions(
  options: OpenAIRequestOptions | undefined,
  path: string
): void {
  if (options === undefined || options === null) return;
  const reasoningModels: unknown = options.reasoningModels;
  const reasoningEffort: unknown = options.reasoningEffort;
  const nativeToolMessages: unknown = options.nativeToolMessages;
  const includeStreamUsage: unknown = options.includeStreamUsage;
  if (
    reasoningModels !== undefined &&
    typeof reasoningModels !== 'boolean' &&
    !(Array.isArray(reasoningModels) && reasoningModels.every((name) => typeof name === 'string'))
  ) {
    throw new ValidationError(
      `${path}.reasoningModels`,
      `must be true, false or a list of model names, got ${shownValue(reasoningModels)}`
    );
  }
  if (
    reasoningEffort !== undefined &&
    (typeof reasoningEffort !== 'string' || reasoningEffort.trim() === '')
  ) {
    throw new ValidationError(
      `${path}.reasoningEffort`,
      `must be a reasoning effort such as 'low', got ${shownValue(reasoningEffort)}`
    );
  }
  if (nativeToolMessages !== undefined && typeof nativeToolMessages !== 'boolean') {
    throw new ValidationError(
      `${path}.nativeToolMessages`,
      `must be true or false, got ${shownValue(nativeToolMessages)}`
    );
  }
  if (includeStreamUsage !== undefined && typeof includeStreamUsage !== 'boolean') {
    throw new ValidationError(
      `${path}.includeStreamUsage`,
      `must be true or false, got ${shownValue(includeStreamUsage)}`
    );
  }
}

/** A plain value as an error can show it ("true" for a string, not true). */
function shownValue(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return 'a list with a value that is not a string';
  if (typeof value === 'object' && value !== null) return 'an object';
  if (typeof value === 'function') return 'a function';
  return String(value);
}

/** A 400 (or 422) naming `stream_options`: a compatible server that does not take it. */
function refusesStreamUsage(error: unknown): boolean {
  return (
    error instanceof OpenAI.APIError &&
    (error.status === 400 || error.status === 422) &&
    (error.param === 'stream_options' || error.message.includes('stream_options'))
  );
}

/**
 * A 400 refusing to stream: `param: 'stream'`, or a message about streaming, such as OpenAI's
 * "Your organization must be verified to stream this model".
 */
function refusesStreaming(error: unknown): boolean {
  return (
    error instanceof OpenAI.APIError &&
    error.status === 400 &&
    (error.param === 'stream' || /\bstream(ing)?\b/i.test(error.message))
  );
}

/** A tool call of the answer; the stream may leave out its id, which the SDK then gives. */
interface CompletionToolCall {
  id?: string;
  function: { name: string; arguments: string };
}

/** What both ways of calling the API give: the first choice's message, the model and usage. */
interface Completion {
  model: string;
  message?: { content: string | null; tool_calls?: CompletionToolCall[] };
  usage?: OpenAI.CompletionUsage | null;
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
