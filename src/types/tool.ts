import type { z } from 'zod';

export interface ToolMetadata {
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  requiresApproval?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodSchema;
  handler: (params: unknown) => Promise<unknown>;
  version?: string;
  capability?: string;
  metadata?: ToolMetadata;
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
