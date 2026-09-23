/**
 * LLM Provider Abstraction
 * 
 * Common interface for every LLM provider (OpenAI, Anthropic, etc.)
 * Abstracts provider differences and normalizes responses.
 */

/**
 * Normalized request to generate an LLM completion
 */
export interface LLMRequest {
  /** Run the request belongs to, used to trace retries and costs (optional). */
  runId?: string;

  /** Model to use (e.g. "gpt-4", "claude-3-opus") */
  model: string;
  
  /** Conversation messages */
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  
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
  toolCalls?: Array<{
    function: {
      name: string;
      arguments: string; // JSON string
    };
  }>;
  
  /** Model that generated the response */
  model: string;
  
  /** Token usage (optional) */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
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
}

