import { z } from 'zod';
import {
  HeuristicController,
  type CognitiveController,
  type ControllerDecision,
} from './cognitive-controller.js';
import { availableOperations, type CognitiveOperation } from './cognitive-operations.js';
import type { MentalState } from './mental-state.js';
import type { ThinkerProfile } from './thinker-profile.js';

export interface CognitiveLimits {
  /** Maximum number of cognitive operations; the last one is always `decide`. */
  maxSteps: number;
  timeoutMs: number;
  /** Maximum number of hypotheses in play at the same time. */
  maxHypotheses: number;
  maxToolCalls: number;
  /** Minimum evidence support of a committed answer; exploration may stop above it. */
  decisionThreshold: number;
  /** The run fails after this many operations fail in a row. */
  maxConsecutiveFailures: number;
  /** Predictions the outcome evaluator may test in one run (ignored without an evaluator). */
  maxPredictionTests: number;
  /** Weight of the thinker's preferences when ranking proposals, in [0, 1]. */
  preferenceWeight: number;
}

const MAX_TIMER_MS = 2_147_483_647;

/** Validates limits so a typo cannot silently disable the timeout or the step budget. */
export const cognitiveLimitsSchema = z.object({
  maxSteps: z.number().int().min(1).max(200),
  timeoutMs: z.number().int().min(1).max(MAX_TIMER_MS),
  maxHypotheses: z.number().int().min(1).max(20),
  maxToolCalls: z.number().int().min(0),
  decisionThreshold: z.number().min(0).max(1),
  maxConsecutiveFailures: z.number().int().min(1),
  maxPredictionTests: z.number().int().min(0),
  preferenceWeight: z.number().min(0).max(1),
}) satisfies z.ZodType<CognitiveLimits>;

export const DEFAULT_COGNITIVE_LIMITS: CognitiveLimits = {
  maxSteps: 12,
  timeoutMs: 180_000,
  maxHypotheses: 3,
  maxToolCalls: 5,
  decisionThreshold: 0.75,
  maxConsecutiveFailures: 3,
  maxPredictionTests: 4,
  preferenceWeight: 0.4,
};

export interface OperationSelection {
  decision: ControllerDecision;
  available: CognitiveOperation[];
  stepsRemaining: number;
  /** True when the engine imposed a decision (last step, or nothing else possible). */
  forced: boolean;
}

/**
 * Computes what is possible, asks the controller to choose and keeps code in control:
 * the last step always decides, and a choice outside the available operations is replaced
 * by the heuristic controller's choice.
 */
export class OperationSelector {
  private readonly heuristic = new HeuristicController();

  constructor(
    private readonly controller: CognitiveController,
    private readonly limits: CognitiveLimits,
    private readonly hasTools: boolean
  ) {}

  async select(input: {
    state: MentalState;
    profile: ThinkerProfile;
    step: number;
    toolCalls: number;
    signal: AbortSignal;
  }): Promise<OperationSelection> {
    const stepsRemaining = this.limits.maxSteps - input.step + 1;
    const available = availableOperations(input.state, {
      maxHypotheses: this.limits.maxHypotheses,
      canSeekInformation: this.hasTools && input.toolCalls < this.limits.maxToolCalls,
    });

    if (available.length === 0 || stepsRemaining === 1) {
      return {
        available,
        stepsRemaining,
        forced: true,
        decision: {
          operation: 'decide',
          controller: 'engine',
          rationale:
            available.length === 0
              ? 'no other operation is possible'
              : 'last step: a decision is required',
        },
      };
    }

    const controllerInput = {
      state: input.state,
      profile: input.profile,
      available,
      stepsRemaining,
      decisionThreshold: this.limits.decisionThreshold,
      abortSignal: input.signal,
    };
    let decision: ControllerDecision;
    try {
      decision = await this.controller.selectNext(controllerInput);
    } catch (error) {
      if (input.signal.aborted) throw error;
      const fallback = await this.heuristic.selectNext(controllerInput);
      const reason = error instanceof Error ? error.message : String(error);
      return {
        available,
        stepsRemaining,
        forced: false,
        decision: {
          ...fallback,
          fallbackFrom: {
            controller: this.controller.name,
            reason: `controller failed: ${reason}`,
          },
        },
      };
    }
    if (available.includes(decision.operation)) {
      return { decision, available, stepsRemaining, forced: false };
    }

    const fallback = await this.heuristic.selectNext(controllerInput);
    return {
      available,
      stepsRemaining,
      forced: false,
      decision: {
        ...fallback,
        fallbackFrom: {
          controller: decision.controller,
          reason: `"${decision.operation}" is not available`,
        },
        ...(decision.evaluations ? { evaluations: decision.evaluations } : {}),
      },
    };
  }
}
