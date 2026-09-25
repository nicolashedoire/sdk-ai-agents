import type { ActionEngine } from './engines/action-engine.js';
import type { PolicyEngine } from './engines/policy-engine.js';
import type {
  AnsweredModelCall,
  ReasoningEngine,
  ReasoningStep,
} from './engines/reasoning-engine.js';
import type { LLMMessage } from './providers/llm-provider.js';
import type { IEventStore } from './stores/event-store.js';
import { finishWatch, watchRun } from './stores/observed-event-store.js';
import type { Event } from './types/events.js';
import type { Agent, OpenAIProviderSettings, ProviderSettings } from './types/agent.js';
import type { Policy } from './types/policy.js';
import type { Intention, RunInput, RunResult } from './types/run.js';
import type { Tool } from './types/tool.js';
import { computeConfigHash } from './utils/config-hash.js';
import { DEFAULT_MAX_STEPS, DEFAULT_TIMEOUT_MS } from './utils/constants.js';
import { generateEventId, generateRunId } from './utils/id.js';
import { tokensOfUsage } from './utils/usage-tokens.js';

/** Answer to a call the model made alongside the one that ran. */
const NOT_RUN = 'Not run: one tool runs per step. Call it again if it is still needed.';

interface RunState {
  conversationHistory: LLMMessage[];
  /** The user's message still to send; empty once it is in the history. */
  currentInput: string;
  step: number;
  /** Tokens the run's model calls used so far. */
  tokensUsed: number;
  maxSteps: number;
  timeout: number;
  startTime: number;
  cancelled?: boolean;
  abortController?: AbortController;
  /** Where the text the model writes goes, as it is written. */
  text: Pick<RunInput, 'onText' | 'onTextRestart'>;
  providerSettings?: {
    openai?: OpenAIProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings;
  };
}

export class AgentImpl {
  private activeRuns: Map<
    string,
    {
      cancelled: boolean;
      abortController: AbortController;
      /** The configuration the run started with: its lifecycle events record this hash. */
      configHash: string | undefined;
    }
  > = new Map();

  constructor(
    private agent: Agent,
    private reasoningEngine: ReasoningEngine,
    private actionEngine: ActionEngine,
    private policyEngine: PolicyEngine,
    private eventStore: IEventStore
  ) {}

  get id(): string {
    return this.agent.id;
  }

  get name(): string {
    return this.agent.name;
  }

  /** `version` of the configuration (`1.0.0` when none is given). */
  get version(): string {
    return this.agent.version;
  }

  /**
   * Hash of the configuration: name, model, system prompt, `maxSteps` and `timeout`, provider
   * settings, `version`, capabilities, tools (name, description, version, parameter schema,
   * metadata, retry settings) and the agent's own policies with their rules. Two agents with
   * the same hash are configured alike (tool handlers aside). It changes with `setPolicy` and
   * `addTools`; each run records the hash it started with.
   */
  get configHash(): string | undefined {
    return this.agent.configHash;
  }

  async run(input: RunInput): Promise<RunResult> {
    const runId = generateRunId();
    // Watched before anything is recorded, so the listener gets every event of the run.
    const watch = watchRun(this.eventStore, runId, input.onEvent);
    const abortController = new AbortController();
    try {
      return await this.execute(runId, input, abortController);
    } finally {
      // Waits for the listener, unless the run was stopped or cancelled, or the caller gives up.
      await finishWatch(watch, [abortController.signal, input.signal]);
    }
  }

  private async execute(
    runId: string,
    input: RunInput,
    abortController: AbortController
  ): Promise<RunResult> {
    this.activeRuns.set(runId, {
      cancelled: false,
      abortController,
      configHash: this.agent.configHash,
    });
    // The caller's signal stops the run: a pending approval is cancelled with it. Neither it
    // nor the listener and the text callbacks are recorded.
    const { signal, onEvent: _listener, onText, onTextRestart, ...recorded } = input;
    const cancel = () => abortController.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    await this.logRunStarted(runId, recorded);

    try {
      const state = this.initializeRunState(input, abortController);
      return await this.executeRunLoop(runId, state);
    } catch (error) {
      if (this.activeRuns.get(runId)?.cancelled || abortController.signal.aborted) {
        return await this.handleRunCancelled(runId);
      }
      return await this.handleRunError(runId, error);
    } finally {
      signal?.removeEventListener('abort', cancel);
      this.activeRuns.delete(runId);
    }
  }

  addTools(tools: Tool[]): void {
    this.agent.tools.push(...tools);
    this.configurationChanged();
  }

  setPolicy(policy: Policy): void {
    // Applied first: a policy the engine refuses is not listed as the agent's.
    this.policyEngine.applyAgentPolicy(this.agent.id, policy);
    this.agent.policies.push(policy);
    this.configurationChanged();
  }

  /** Runs started from now on record the new configuration. */
  private configurationChanged(): void {
    this.agent.configHash = computeConfigHash(this.agent);
    this.agent.updatedAt = Date.now();
  }

  async stop(runId?: string): Promise<void> {
    if (runId) {
      await this.stopRun(runId);
    } else {
      for (const [id] of this.activeRuns) {
        await this.stopRun(id);
      }
    }
  }

  async stopRun(runId: string): Promise<void> {
    const run = this.activeRuns.get(runId);
    if (run) {
      run.cancelled = true;
      run.abortController.abort();
      await this.logEvent(runId, 'run.stopped', {
        reason: 'Stopped by user',
        agentId: this.agent.id,
      });
    }
  }

  private initializeRunState(input: RunInput, abortController: AbortController): RunState {
    return {
      conversationHistory: [],
      currentInput: input.message,
      step: 0,
      tokensUsed: 0,
      maxSteps: this.agent.config.maxSteps || DEFAULT_MAX_STEPS,
      timeout: this.agent.config.timeout || DEFAULT_TIMEOUT_MS,
      startTime: Date.now(),
      abortController,
      text: { onText: input.onText, onTextRestart: input.onTextRestart },
      providerSettings: input.providerSettings,
    };
  }

  private async executeRunLoop(runId: string, state: RunState): Promise<RunResult> {
    while (state.step < state.maxSteps) {
      this.checkCancellation(runId, state);
      this.checkTimeout(state);

      try {
        const { intention, toolCall } = await this.generateStep(runId, state);

        this.checkCancellation(runId, state);

        if (intention.type === 'final_answer') {
          return await this.completeRun(runId, intention.reasoning);
        }

        if (toolCall) {
          await this.handleToolCall(runId, state, intention, toolCall);
          this.checkCancellation(runId, state);
        }

        state.step++;
      } catch (error) {
        if (state.abortController?.signal.aborted || this.activeRuns.get(runId)?.cancelled) {
          throw new Error('Run cancelled');
        }
        throw error;
      }
    }

    throw new Error(`Max steps (${state.maxSteps}) exceeded`);
  }

  private checkCancellation(runId: string, state: RunState): void {
    const run = this.activeRuns.get(runId);
    if (run?.cancelled || state.abortController?.signal.aborted) {
      state.cancelled = true;
      throw new Error('Run cancelled');
    }
  }

  private checkTimeout(state: RunState): void {
    if (Date.now() - state.startTime > state.timeout) {
      throw new Error('Timeout exceeded');
    }
  }

  /**
   * Adds a model call's tokens to the run, and its tokens and cost to the agent's budgets.
   * Called by the reasoning engine as soon as the vendor answered, so a step that then fails
   * (tool arguments that are not valid JSON) and an answer a provider discarded are counted.
   */
  private async recordModelCall(state: RunState, call: AnsweredModelCall): Promise<void> {
    state.tokensUsed += tokensOfUsage(call.usage);
    await this.policyEngine.recordModelUsage(this.agent.id, call);
  }

  private async generateStep(runId: string, state: RunState): Promise<ReasoningStep> {
    // Merge agent and run providerSettings
    // Priority: run settings > agent settings
    const providerSettings = this.mergeProviderSettings(
      this.agent.config.providerSettings,
      state.providerSettings
    );

    return await this.reasoningEngine.generateStep(
      {
        runId,
        agentId: this.agent.id,
        input: state.currentInput,
        conversationHistory: state.conversationHistory,
        availableTools: this.agent.tools,
        systemPrompt: this.agent.config.systemPrompt,
        model: this.agent.model,
        providerSettings, // Pass providerSettings instead of resolved settings
        onModelUsage: (call) => this.recordModelCall(state, call),
        ...state.text,
      },
      this.eventStore,
      state.abortController?.signal
    );
  }

  /**
   * Merges agent and run providerSettings. For each field the priority is: run
   * provider-specific > run default > agent provider-specific > agent default. Each provider's
   * group is resolved completely here, so a run default wins over an agent's provider-specific
   * value (it did not when the groups were merged separately).
   */
  private mergeProviderSettings(
    agentSettings?: Agent['config']['providerSettings'],
    runSettings?: RunInput['providerSettings']
  ):
    | {
        openai?: OpenAIProviderSettings;
        anthropic?: ProviderSettings;
        default?: ProviderSettings;
      }
    | undefined {
    if (!agentSettings && !runSettings) {
      return undefined;
    }

    return {
      default: layerSettings(agentSettings?.default, runSettings?.default),
      openai: layerOpenAISettings(
        agentSettings?.default,
        agentSettings?.openai,
        runSettings?.default,
        runSettings?.openai
      ),
      anthropic: layerSettings(
        agentSettings?.default,
        agentSettings?.anthropic,
        runSettings?.default,
        runSettings?.anthropic
      ),
    };
  }

  private async handleToolCall(
    runId: string,
    state: RunState,
    intention: Intention,
    toolCall: NonNullable<ReasoningStep['toolCall']>
  ): Promise<void> {
    if (state.abortController?.signal.aborted) {
      throw new Error('Run cancelled');
    }

    const result = await this.actionEngine.executeIntention(intention, {
      runId,
      agentId: this.agent.id,
      // What budget policies check: the run's step, tokens and start time.
      run: { step: state.step, tokensUsed: state.tokensUsed, startedAt: state.startTime },
      abortSignal: state.abortController?.signal,
      // Only this agent's tools, even if the model names another tool registered in the SDK.
      allowedTools: this.agent.tools.map((tool) => tool.name),
    });

    // The turn so far: the user's message, the model's call, then the tool's result, which
    // refers to the call by its id. The next step continues from there, with no new input.
    // The user's message opens the conversation, even when empty (it must come first).
    if (state.currentInput || state.conversationHistory.length === 0) {
      state.conversationHistory.push({ role: 'user', content: state.currentInput });
    }
    state.conversationHistory.push(toolCall.turn, {
      role: 'tool',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      // As in the plain-text lines of earlier versions ("undefined" for a tool returning nothing).
      content: String(JSON.stringify(result.result)),
    });
    for (const other of toolCall.notRun) {
      state.conversationHistory.push({
        role: 'tool',
        toolCallId: other.id,
        toolName: other.name,
        content: NOT_RUN,
        isError: true,
      });
    }
    state.currentInput = '';
  }

  private async completeRun(runId: string, output: string | undefined): Promise<RunResult> {
    await this.logEvent(runId, 'run.completed', { output });
    return {
      runId,
      status: 'completed',
      output,
    };
  }

  private async handleRunError(runId: string, error: unknown): Promise<RunResult> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === 'Run cancelled') {
      return await this.handleRunCancelled(runId);
    }

    await this.logEvent(runId, 'run.failed', {
      error: errorMessage,
    });

    return {
      runId,
      status: 'failed',
      error: error instanceof Error ? error : new Error(errorMessage),
    };
  }

  private async handleRunCancelled(runId: string): Promise<RunResult> {
    await this.logEvent(runId, 'run.cancelled', {
      reason: 'Stopped by user',
    });

    return {
      runId,
      status: 'cancelled',
    };
  }

  private async logRunStarted(runId: string, input: RunInput): Promise<void> {
    await this.logEvent(runId, 'run.started', { input });
  }

  private async logEvent(
    runId: string,
    type: Event['type'],
    data: Record<string, unknown>
  ): Promise<void> {
    const configHash = this.activeRuns.get(runId)?.configHash ?? this.agent.configHash;
    await this.eventStore.append(runId, {
      id: generateEventId(),
      runId,
      type,
      timestamp: Date.now(),
      data,
      metadata: {
        agentId: this.agent.id,
        agentVersion: this.agent.version,
        // The id is new in every process: the name and the configuration say which agent ran.
        agentName: this.agent.name,
        ...(configHash ? { configHash } : {}),
      },
    });
  }
}

/** Layers settings from lowest to highest priority; an unset field never hides a lower one. */
function layerSettings(...layers: Array<ProviderSettings | undefined>): ProviderSettings {
  const result: ProviderSettings = {};
  for (const layer of layers) {
    if (layer?.temperature !== undefined) result.temperature = layer.temperature;
    if (layer?.maxTokens !== undefined) result.maxTokens = layer.maxTokens;
  }
  return result;
}

/** The OpenAI group: the common fields layered, then the OpenAI-only ones of the OpenAI layers. */
function layerOpenAISettings(
  agentDefault: ProviderSettings | undefined,
  agentOpenAI: OpenAIProviderSettings | undefined,
  runDefault: ProviderSettings | undefined,
  runOpenAI: OpenAIProviderSettings | undefined
): OpenAIProviderSettings {
  const result: OpenAIProviderSettings = layerSettings(
    agentDefault,
    agentOpenAI,
    runDefault,
    runOpenAI
  );
  const reasoningEffort = runOpenAI?.reasoningEffort ?? agentOpenAI?.reasoningEffort;
  if (reasoningEffort !== undefined) result.reasoningEffort = reasoningEffort;
  return result;
}
