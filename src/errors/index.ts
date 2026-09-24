import type { DiscardedAnswer } from '../providers/llm-provider.js';

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

/** A call a decision backend answered, and billed, although its answer was then rejected. */
export interface BilledDecisionCall {
  /** Model that answered (or the one requested, when the answer did not say). */
  model: string;
  /** Tokens the backend reported; absent when it reported none (the cost is then unknown). */
  usage?: { inputTokens: number; outputTokens: number };
}

export class DecisionClientError extends SDKError {
  public status?: number;
  public retryable: boolean;
  /**
   * Set when the backend answered but the answer was rejected (answers that do not match the
   * questions, or a malformed body that still reported its usage): the call was billed, and
   * `sdk.decisions` and cognitive agents record it so that it is priced.
   */
  public billed?: BilledDecisionCall;

  constructor(
    public client: string,
    public detail: string,
    options: {
      status?: number;
      retryable: boolean;
      originalError?: Error;
      billed?: BilledDecisionCall;
    }
  ) {
    super(`Decision client error (${client}): ${detail}`, 'DECISION_ERROR', options.originalError);
    this.name = 'DecisionClientError';
    this.status = options.status;
    this.retryable = options.retryable;
    this.billed = options.billed;
  }
}

export interface ModelUsage {
  promptTokens: number;
  completionTokens: number;
  /** Number of model calls behind this usage (repairs included). */
  calls: number;
  /**
   * Calls among `calls` that reported no input/output token counts: their tokens are not in
   * `promptTokens`/`completionTokens`, and their cost is unknown. Absent when there are none.
   */
  unmeteredCalls?: number;
}

export class ThoughtGenerationError extends SDKError {
  /** Tokens consumed by the failed attempts, so they can still be priced. */
  public usage?: ModelUsage;
  /** Answers a provider discarded after the vendor billed them, priced at their own model. */
  public discarded?: DiscardedAnswer[];
  public model?: string;
  public requestedModel?: string;

  constructor(
    public operation: string,
    public detail: string,
    options: {
      originalError?: Error;
      usage?: ModelUsage;
      discarded?: DiscardedAnswer[];
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
    this.discarded = options.discarded;
    this.model = options.model;
    this.requestedModel = options.requestedModel;
  }
}
