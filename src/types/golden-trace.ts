import type { Trace } from './sdk.js';

export interface GoldenTrace {
  id: string;
  name: string;
  description?: string;
  runId: string;
  agentId: string;
  createdAt: number;
  trace: Trace;
  metadata?: Record<string, unknown>;
}

export interface GoldenTraceConfig {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

