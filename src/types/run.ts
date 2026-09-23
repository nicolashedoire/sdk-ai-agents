import type { Event, RunStatus } from './events.js';
import type { ProviderSettings } from './agent.js';

export interface RunInput {
  message: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  providerSettings?: {
    openai?: ProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings; // Default settings for every provider
  };
}

export interface RunOutput {
  message: string;
  data?: unknown;
}

export interface Run {
  id: string;
  agentId: string;
  status: RunStatus;
  input: RunInput;
  output?: RunOutput;
  startedAt: number;
  completedAt?: number;
  events: Event[];
  version: string;
}

export interface RunResult {
  runId: string;
  status: RunStatus;
  output?: string;
  error?: Error;
  events?: Event[];
}

export interface Intention {
  type: 'tool_call' | 'final_answer' | 'continue';
  toolName?: string;
  parameters?: Record<string, unknown>;
  reasoning?: string;
}

export interface ActionContext {
  runId: string;
  agentId: string;
  mode?: 'normal' | 'replay';
  abortSignal?: AbortSignal;
  /**
   * Tools this caller may use. When set, any other tool is denied before execution, even
   * if it is registered in the SDK. Cognitive agents and the MCP server always set it.
   */
  allowedTools?: string[];
}

export interface ActionResult {
  success: boolean;
  result?: unknown;
  error?: Error;
  events: Event[];
}

export interface ReplayModifications {
  input?: RunInput;
  policies?: string[];
  tools?: string[];
}
