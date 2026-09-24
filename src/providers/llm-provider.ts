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
  | { role: 'tool'; toolCallId: string; toolName: string; content: string };

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

  /** Per-provider settings (for FallbackProvider); take precedence over temperature/maxTokens when set */
  providerSettings?: {
    openai?: { temperature?: number; maxTokens?: number };
    anthropic?: { temperature?: number; maxTokens?: number };
    default?: { temperature?: number; maxTokens?: number };
  };

  /** Abort signal to cancel the request (optional) */
  abortSignal?: AbortSignal;
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
   * @param model - Model name (e.g. "gpt-4", "claude-3-opus")
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
