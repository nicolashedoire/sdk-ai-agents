import type { ActionEngine } from './engines/action-engine.js';
import type { PolicyEngine } from './engines/policy-engine.js';
import type { ReasoningEngine, ReasoningStep } from './engines/reasoning-engine.js';
import type { LLMMessage } from './providers/llm-provider.js';
import type { IEventStore } from './stores/event-store.js';
import type { Event } from './types/events.js';
import type { Agent, ProviderSettings } from './types/agent.js';
import type { Policy } from './types/policy.js';
import type { Intention, RunInput, RunResult } from './types/run.js';
import type { Tool } from './types/tool.js';
import { DEFAULT_MAX_STEPS, DEFAULT_TIMEOUT_MS } from './utils/constants.js';
import { generateEventId, generateRunId } from './utils/id.js';

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
  providerSettings?: {
    openai?: ProviderSettings;
    anthropic?: ProviderSettings;
    default?: ProviderSettings;
  };
}

export class AgentImpl {
  private activeRuns: Map<string, { cancelled: boolean; abortController: AbortController }> =
    new Map();

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

  async run(input: RunInput): Promise<RunResult> {
    const runId = generateRunId();
    const abortController = new AbortController();
    this.activeRuns.set(runId, { cancelled: false, abortController });
    // The caller's signal stops the run: a pending approval is cancelled with it.
    const { signal, ...recorded } = input;
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
  }

  setPolicy(policy: Policy): void {
    this.agent.policies.push(policy);
    this.policyEngine.applyAgentPolicy(this.agent.id, policy);
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
      providerSettings: input.providerSettings,
    };
  }

  private async executeRunLoop(runId: string, state: RunState): Promise<RunResult> {
    while (state.step < state.maxSteps) {
      this.checkCancellation(runId, state);
      this.checkTimeout(state);

      try {
        const { intention, usage, assistantTurn } = await this.generateStep(runId, state);
        await this.recordTokens(state, usage);

        this.checkCancellation(runId, state);

        if (intention.type === 'final_answer') {
          return await this.completeRun(runId, intention.reasoning);
        }

        if (intention.type === 'tool_call') {
          await this.handleToolCall(runId, state, intention, assistantTurn);
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

  /** Adds a model call's tokens to the run and to the agent's token budgets. */
  private async recordTokens(state: RunState, usage: ReasoningStep['usage']): Promise<void> {
    const tokens =
      usage?.totalTokens ?? (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
    state.tokensUsed += tokens;
    await this.policyEngine.recordTokenUsage(this.agent.id, tokens);
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
        openai?: ProviderSettings;
        anthropic?: ProviderSettings;
        default?: ProviderSettings;
      }
    | undefined {
    if (!agentSettings && !runSettings) {
      return undefined;
    }

    return {
      default: layerSettings(agentSettings?.default, runSettings?.default),
      openai: layerSettings(
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
    assistantTurn: ReasoningStep['assistantTurn']
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
    const toolName = intention.toolName ?? '';
    const call = assistantTurn?.toolCalls?.[0];
    if (state.currentInput) {
      state.conversationHistory.push({ role: 'user', content: state.currentInput });
    }
    state.conversationHistory.push(
      assistantTurn ?? {
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: `call_${state.step}`,
            function: { name: toolName, arguments: JSON.stringify(intention.parameters ?? {}) },
          },
        ],
      }
    );
    state.conversationHistory.push({
      role: 'tool',
      toolCallId: call?.id ?? `call_${state.step}`,
      toolName,
      content: JSON.stringify(result.result) ?? 'null',
    });
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
    await this.eventStore.append(runId, {
      id: generateEventId(),
      runId,
      type,
      timestamp: Date.now(),
      data,
      metadata: {
        agentId: this.agent.id,
        agentVersion: this.agent.version,
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
