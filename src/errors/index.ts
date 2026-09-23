export class SDKError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'SDKError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends SDKError {
  constructor(
    public field: string,
    public reason: string,
    public schema?: unknown
  ) {
    super(`Validation failed: ${field} - ${reason}`, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class PolicyViolationError extends SDKError {
  constructor(
    public policyId: string,
    public intention: unknown,
    public reason: string
  ) {
    super(`Policy violation: ${policyId} - ${reason}`, 'POLICY_VIOLATION');
    this.name = 'PolicyViolationError';
  }
}

export class ToolExecutionError extends SDKError {
  constructor(
    public toolName: string,
    public originalError: Error,
    public parameters: unknown
  ) {
    super(`Tool execution failed: ${toolName}`, 'TOOL_ERROR', originalError);
    this.name = 'ToolExecutionError';
  }
}

export class ToolNotFoundError extends SDKError {
  constructor(message: string) {
    super(message, 'TOOL_NOT_FOUND');
    this.name = 'ToolNotFoundError';
  }
}

export class LLMProviderError extends SDKError {
  /** Set by providers that recognize a connection failure or timeout of their vendor SDK. */
  public connectionFailure?: boolean;

  constructor(
    public provider: string,
    public originalError: Error,
    public retryable = true,
    options: { connectionFailure?: boolean } = {}
  ) {
    // The vendor's message says what went wrong (rate limit, no credit, invalid key…). Key
    // fragments some vendors echo back are masked: this message reaches events and alerts.
    super(
      `LLM provider error: ${provider}: ${redactApiKeys(originalError.message)}`,
      'LLM_ERROR',
      originalError
    );
    this.name = 'LLMProviderError';
    this.connectionFailure = options.connectionFailure;
  }
}

/** Masks API keys (even partial ones, such as `sk-proj-ab…yz12`) in a message. */
export function redactApiKeys(text: string): string {
  return text.replace(/\b(sk|rk|pk)-[A-Za-z0-9_\-*.…]{3,}/g, '$1-***');
}

export class EventStoreError extends SDKError {
  constructor(
    public operation: string,
    public originalError: Error
  ) {
    super(`Event store error: ${operation}`, 'EVENT_STORE_ERROR', originalError);
    this.name = 'EventStoreError';
  }
}

export class DecisionClientError extends SDKError {
  public status?: number;
  public retryable: boolean;

  constructor(
    public client: string,
    public detail: string,
    options: { status?: number; retryable: boolean; originalError?: Error }
  ) {
    super(`Decision client error (${client}): ${detail}`, 'DECISION_ERROR', options.originalError);
    this.name = 'DecisionClientError';
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  /** Number of model calls behind this usage (repairs included). */
  calls: number;
}

export class ThoughtGenerationError extends SDKError {
  /** Tokens consumed by the failed attempts, so they can still be priced. */
  public usage?: ModelUsage;
  public model?: string;
  public requestedModel?: string;

  constructor(
    public operation: string,
    public detail: string,
    options: {
      originalError?: Error;
      usage?: ModelUsage;
      model?: string;
      requestedModel?: string;
    } = {}
  ) {
    super(
      `Thought generation failed (${operation}): ${detail}`,
      'THOUGHT_ERROR',
      options.originalError
    );
    this.name = 'ThoughtGenerationError';
    this.usage = options.usage;
    this.model = options.model;
    this.requestedModel = options.requestedModel;
  }
}
