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
  constructor(
    public provider: string,
    public originalError: Error,
    public retryable = true
  ) {
    super(`LLM provider error: ${provider}`, 'LLM_ERROR', originalError);
    this.name = 'LLMProviderError';
  }
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
