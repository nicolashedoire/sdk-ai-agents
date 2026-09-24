import type { Event, LiveEventListener, RunStatus } from './events.js';
import type { OpenAIProviderSettings, ProviderSettings } from './agent.js';

export interface RunInput {
  message: string;
  context?: Record<string, unknown>;
  /** Cancels the run when aborted (e.g. the MCP client that asked gave up). Not recorded. */
  signal?: AbortSignal;
  /**
   * Called with every event recorded for this run, in order, once the event store has accepted
   * it; a promise it returns is awaited before its next event. The run never waits for it, and
   * `run()` resolves once it has settled on every event. Its errors are reported, never thrown
   * into the run. Not recorded. A replay takes it in the options of `sdk.replay`.
   */
  onEvent?: LiveEventListener;
  metadata?: Record<string, unknown>;
  providerSettings?: {
    openai?: OpenAIProviderSettings;
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

/** How far a run has gone, as budget and timeout policies see it. */
export interface RunProgress {
  /** Steps completed before this call (0 for the first). */
  step: number;
  /** Tokens the run's model calls used so far. */
  tokensUsed: number;
  /** When the run started (ms since the epoch). */
  startedAt: number;
}

export interface ActionContext {
  runId: string;
  agentId: string;
  /**
   * Progress of the calling run, checked by budget policies (`maxSteps`, `maxTokens`,
   * `maxDuration`). Absent for a call outside a run, such as a tool called by an MCP client.
   */
  run?: RunProgress;
  mode?: 'normal' | 'replay';
  /**
   * Replay only: the original run got a human approval for this very call (same tool, same
   * parameters). Tool-level approvals are then not asked again; any other call is refused.
   */
  preApproved?: boolean;
  abortSignal?: AbortSignal;
  /**
   * Tools this caller may use. When set, any other tool is denied before execution, even
   * if it is registered in the SDK. Cognitive agents and the MCP server always set it.
   */
  allowedTools?: string[];
  /**
   * Longest wait for a human approval, in milliseconds. Past it, the approval is cancelled
   * and the action refused. Without it, an approval waits until decided or aborted.
   */
  approvalTimeoutMs?: number;
  /**
   * Given to the tool handler as `ToolCallContext.onEvent`: the caller watches the call live,
   * and the runs the tool starts for it (an agent tool) are delivered to it too.
   */
  onEvent?: LiveEventListener;
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

export interface ReplayOptions {
  /** Called with every event of the replay, as `RunInput.onEvent` is for a run. */
  onEvent?: LiveEventListener;
}
