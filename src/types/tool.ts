import type { z } from 'zod';

export interface ToolMetadata {
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  /**
   * Every call waits for a human decision (`sdk.approveAction` / `sdk.rejectAction`) before
   * the tool runs. The call is refused if the caller gives up first.
   */
  requiresApproval?: boolean;
  /**
   * The tool only reads: it changes nothing in the systems it reaches. Shown to MCP clients
   * as the `readOnlyHint` annotation; it does not relax any policy.
   */
  readOnly?: boolean;
}

/** What a tool handler knows about the call it serves. */
export interface ToolCallContext {
  runId: string;
  agentId: string;
  /** Aborted when the caller gives up: run stopped, MCP request cancelled or timed out. */
  signal?: AbortSignal;
}

/** Retries for idempotent tools. Only tool errors are retried, never policy decisions. */
export interface ToolRetryPolicy {
  maxRetries: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface ToolDefinition<Schema extends z.ZodSchema = z.ZodSchema> {
  name: string;
  description: string;
  schema: Schema;
  /**
   * Receives the parameters already validated by `schema`, typed from it, and the context of
   * the call (run, caller, abort signal) when it runs through the governed pipeline.
   */
  handler(params: z.infer<Schema>, context?: ToolCallContext): Promise<unknown>;
  version?: string;
  capability?: string;
  metadata?: ToolMetadata;
  /**
   * JSON Schema shown to the LLM instead of the one derived from `schema`. Used by tools
   * imported from MCP servers, whose schema is already JSON Schema.
   */
  inputJsonSchema?: Record<string, unknown>;
  retry?: ToolRetryPolicy;
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  schema: z.ZodSchema;
  handler: (params: unknown, context?: ToolCallContext) => Promise<unknown>;
  version: string;
  capability?: string;
  metadata?: ToolMetadata;
  inputJsonSchema?: Record<string, unknown>;
  retry?: ToolRetryPolicy;
}

export interface Capability {
  id: string;
  name: string;
  description: string;
  tools: string[];
  version: string;
  metadata?: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: Error;
}
