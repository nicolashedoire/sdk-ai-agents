import type { z } from 'zod';

export interface ToolMetadata {
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresApproval?: boolean;
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
  /** Receives the parameters already validated by `schema`, typed from it. */
  handler(params: z.infer<Schema>): Promise<unknown>;
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
  handler: (params: unknown) => Promise<unknown>;
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
