import { UNKNOWN_MODEL, modelCallsOf, tokensOfRecord } from '../costs/run-cost.js';
import type { LLMResponse } from '../providers/llm-provider.js';
import type { Event } from '../types/events.js';
import type { RunProgress } from '../types/run.js';
import { tokensOfUsage } from '../utils/usage-tokens.js';

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
 * completed, the tokens of its model calls (thoughts, tool selections, typed decisions,
 * answers a provider discarded) and when it started. Each model call is also handed to
 * `onModelCall`, which counts it in the agent's budgets per period.
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

  /** Counts a model call the component that made it reports (the reasoning engine's). */
  async countModelCall(call: MeteredModelCall): Promise<void> {
    this.tokensUsed += tokensOfUsage(call.usage);
    await this.onModelCall?.(call);
  }

  /**
   * Counts the model calls an event of the run records, read exactly as `getRunCost` reads
   * them: the calls that reported token counts with their tokens, the others as calls whose
   * token counts, and cost, are unknown. An event that records no model call counts nothing.
   */
  async countRecorded(event: Pick<Event, 'type' | 'data'>): Promise<void> {
    const record = modelCallsOf(event);
    if (!record) return;
    this.tokensUsed += tokensOfRecord(record);
    if (!this.onModelCall) return;
    // A call that named no model has no price, whatever the pricing table says.
    const names = {
      ...(record.model !== UNKNOWN_MODEL ? { model: record.model } : {}),
      ...(record.requestedModel ? { requestedModel: record.requestedModel } : {}),
    };
    const metered = record.calls - record.unmeteredCalls;
    if (metered > 0) {
      await this.onModelCall({
        ...names,
        usage: { promptTokens: record.inputTokens, completionTokens: record.outputTokens },
        calls: metered,
      });
    }
    if (record.unmeteredCalls > 0) {
      // Their tokens are the totals some of them reported alone; their cost is unknown.
      await this.onModelCall({
        ...names,
        ...(record.totalOnlyTokens > 0 ? { usage: { totalTokens: record.totalOnlyTokens } } : {}),
        calls: record.unmeteredCalls,
      });
    }
  }
}
