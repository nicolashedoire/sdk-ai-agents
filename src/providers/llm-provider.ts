/**
 * LLM Provider Abstraction
 *
 * Common interface for every LLM provider (OpenAI, Anthropic, etc.)
 * Abstracts provider differences and normalizes responses.
 */

/** A tool call made by the model. */
export interface LLMToolCall {
  /** Id the tool's result refers to (given by the vendor, or by the SDK when it gives none). */
  id?: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * A message of the conversation. Assistant tool calls and `tool` results are only sent to
 * providers that declare `nativeToolMessages`; other providers get them as plain text.
 */
export type LLMMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string;
      /** Tool calls the model made in this turn. */
      toolCalls?: LLMToolCall[];
      /**
       * The turn as the vendor returned it (with its thinking blocks, for instance), sent back
       * unchanged when the conversation continues with the same vendor.
       */
      vendorContent?: { provider: string; content: unknown };
    }
  | {
      role: 'tool';
      toolCallId: string;
      toolName: string;
      content: string;
      /** The tool did not run (or failed): `content` says why. */
      isError?: boolean;
    };

/**
 * How much an OpenAI reasoning model thinks before it answers (`reasoning_effort`). Not every
 * model accepts every value, and the API refuses the others: `minimal` exists only for the
 * first GPT-5 models, `none` from GPT-5.1 on (not for GPT-6 Astra), `xhigh` from GPT-5.4 on,
 * and `max` is documented only for GPT-5.6 and GPT-6 on the Responses API, which the SDK does
 * not use.
 */
export type OpenAIReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

/**
 * Normalized request to generate an LLM completion
 */
export interface LLMRequest {
  /** Run the request belongs to, used to trace retries and costs (optional). */
  runId?: string;

  /** Model to use (e.g. "gpt-4o"). An empty string lets the provider use its default model. */
  model: string;

  /** Conversation messages */
  messages: LLMMessage[];

  /** Tools available to the LLM (optional) */
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;

  /** Sampling temperature (optional) */
  temperature?: number;

  /** Maximum number of tokens to generate (optional) */
  maxTokens?: number;

  /**
   * Reasoning effort of an OpenAI reasoning model (optional). The OpenAI provider sends it to
   * reasoning models only; other providers ignore it.
   */
  reasoningEffort?: OpenAIReasoningEffort;

  /** Per-provider settings (for FallbackProvider); take precedence over temperature/maxTokens when set */
  providerSettings?: {
    openai?: { temperature?: number; maxTokens?: number; reasoningEffort?: OpenAIReasoningEffort };
    anthropic?: { temperature?: number; maxTokens?: number };
    default?: { temperature?: number; maxTokens?: number };
  };

  /** Abort signal to cancel the request (optional) */
  abortSignal?: AbortSignal;

  /**
   * Called when a provider discards an answer the vendor billed and reported the usage of
   * (the OpenAI provider's empty answer, which it fails on or fails over from), so the caller
   * can still count it. Passed unchanged to the providers of a fallback chain and to retries.
   */
  onDiscardedAnswer?: (answer: DiscardedAnswer) => void;
}

/** An answer a vendor billed, with the usage it reported, that the provider could not use. */
export interface DiscardedAnswer {
  /** Provider that received it (`openai`…). */
  provider: string;
  /** Model that answered, else the one requested. */
  model: string;
  usage: NonNullable<LLMResponse['usage']>;
  /** Why it could not be used. */
  reason: string;
}

/**
 * Normalized response from an LLM provider
 */
export interface LLMResponse {
  /** Text content of the response (null when there are only tool calls) */
  content: string | null;

  /** Tool calls requested by the LLM (optional) */
  toolCalls?: LLMToolCall[];

  /** The answer as the vendor returned it, to send back in the next turn (see LLMMessage). */
  vendorContent?: { provider: string; content: unknown };

  /** Model that generated the response */
  model: string;

  /** Token usage (optional) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** Options of the vendor client (OpenAI, Anthropic) behind a built-in provider. */
export interface VendorClientOptions {
  /**
   * Retries performed by the vendor client itself. The SDK sets it to 0 when its own retry
   * policy is active, so retries are not stacked.
   */
  maxRetries?: number;
  /**
   * Address of the API, for a compatible endpoint (Azure OpenAI, a local model server, a
   * gateway) or a proxy. The vendor's own address when omitted.
   */
  baseURL?: string;
}

/**
 * Common interface for every LLM provider
 *
 * It abstracts the differences between providers (OpenAI, Anthropic, etc.)
 * and normalizes request and response formats.
 */
export interface LLMProvider {
  /**
   * Generates an LLM completion for the given request
   *
   * @param request - Normalized LLMRequest
   * @returns Promise resolved with a normalized LLMResponse
   * @throws LLMProviderError when the provider fails
   */
  generateCompletion(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Checks whether the provider supports a model
   *
   * @param model - Model name (e.g. "gpt-5.4", "claude-opus-5")
   * @returns true when the model is supported, false otherwise
   */
  supportsModel(model: string): boolean;

  /**
   * Returns the provider name (e.g. "openai", "anthropic")
   *
   * @returns Provider name
   */
  getProviderName(): string;

  /**
   * True when the provider takes assistant tool calls and `tool` messages in the vendor's
   * native format. Otherwise the SDK sends tool results as plain text, as it always did.
   */
  readonly nativeToolMessages?: boolean;
}
