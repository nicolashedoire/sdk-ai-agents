import type { Trace } from './sdk.js';

export interface GoldenTrace {
  id: string;
  name: string;
  description?: string;
  runId: string;
  agentId: string;
  /** Name of the governed agent that ran it, when its events record one. */
  agentName?: string;
  createdAt: number;
  trace: Trace;
  metadata?: Record<string, unknown>;
}

export interface GoldenTraceConfig {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
