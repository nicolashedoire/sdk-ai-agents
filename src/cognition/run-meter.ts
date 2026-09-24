import type { LLMResponse } from '../providers/llm-provider.js';
import type { RunProgress } from '../types/run.js';

/** A model call of a cognitive run, as run limits and budgets per period count it. */
export interface MeteredModelCall {
  /** Model that answered, and the model asked for (a price is looked up for either). */
  model?: string;
  requestedModel?: string;
  /** Token counts the call reported; absent when it reported none. */
  usage?: LLMResponse['usage'];
  /** Model calls behind this usage (a thought and its repairs), 1 by default. */
  calls?: number;
}

/**
 * How far a cognitive run has gone, as budget and timeout policies see it: the steps it
 * completed, the tokens of its model calls (thoughts, tool selections, typed decisions) and
 * when it started. Each model call is also handed to `onModelCall`, which counts it in the
 * agent's budgets per period.
 */
export class CognitiveRunMeter {
  private completedSteps = 0;
  private tokensUsed = 0;

  constructor(
    readonly startedAt: number,
    private readonly onModelCall?: (call: MeteredModelCall) => Promise<void>
  ) {}

  /** Enters `step` (1 for the first): the steps before it are complete. */
  startStep(step: number): RunProgress {
    this.completedSteps = step - 1;
    return this.progress();
  }

  progress(): RunProgress {
    return { step: this.completedSteps, tokensUsed: this.tokensUsed, startedAt: this.startedAt };
  }

  async countModelCall(call: MeteredModelCall): Promise<void> {
    const { usage } = call;
    this.tokensUsed +=
      usage?.totalTokens ?? (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0);
    await this.onModelCall?.(call);
  }
}
