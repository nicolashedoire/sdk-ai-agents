import type { TypedAnswer, TypedQuestions } from '../decisions/typed-decisions.js';
import type { CognitiveOperation } from './cognitive-operations.js';
import { activeHypotheses, openUnknowns, type MentalState } from './mental-state.js';
import type { ThinkerProfile } from './thinker-profile.js';

export interface ControllerInput {
  state: MentalState;
  profile: ThinkerProfile;
  /** Operations whose preconditions hold; the controller must pick one of them. */
  available: CognitiveOperation[];
  /** Steps left including the current one. */
  stepsRemaining: number;
  /** Confidence at which the reasoning may stop exploring. */
  decisionThreshold: number;
  abortSignal?: AbortSignal;
}

/** A typed-decision call made while reasoning, kept for the audit trail. */
export interface DecisionEvaluationRecord {
  client: string;
  purpose: 'operation_selection' | 'hypothesis_assessment' | 'direct';
  model: string;
  state: unknown;
  questions: TypedQuestions;
  answers: Record<string, TypedAnswer>;
  usage: { inputTokens: number; outputTokens: number };
}

export interface ControllerDecision {
  operation: CognitiveOperation;
  /** Name of the controller that actually made the choice. */
  controller: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  rationale?: string;
  /** Set when a primary controller deferred to its fallback. */
  fallbackFrom?: { controller: string; reason: string };
  evaluations?: DecisionEvaluationRecord[];
}

/** Chooses the next cognitive operation. */
export interface CognitiveController {
  readonly name: string;
  selectNext(input: ControllerInput): Promise<ControllerDecision>;
}

/**
 * Deterministic controller: a fixed order of attention that needs no model call.
 * represent → hypothesize → simulate → critique → seek information → compare → decide,
 * exploring an alternative hypothesis while confidence stays below the threshold.
 */
export class HeuristicController implements CognitiveController {
  readonly name = 'heuristic';

  async selectNext(input: ControllerInput): Promise<ControllerDecision> {
    const { operation, rationale } = this.choose(input);
    return { operation, controller: this.name, rationale };
  }

  private choose(input: ControllerInput): { operation: CognitiveOperation; rationale: string } {
    const { available, state, stepsRemaining, decisionThreshold } = input;
    const can = (operation: CognitiveOperation) => available.includes(operation);
    const [first] = available;
    if (!first) {
      return { operation: 'decide', rationale: 'no operation is available' };
    }
    if (available.length === 1) {
      return { operation: first, rationale: 'only available operation' };
    }

    if (stepsRemaining <= 2 && can('decide')) {
      return stepsRemaining === 2 && can('compare')
        ? { operation: 'compare', rationale: 'weigh hypotheses before the final step' }
        : { operation: 'decide', rationale: 'step budget nearly exhausted' };
    }
    if (can('represent') && state.contradictions.some((item) => !item.resolved)) {
      return { operation: 'represent', rationale: 'unresolved contradiction: reframe the problem' };
    }

    const active = activeHypotheses(state);
    if (active.length === 0 && can('hypothesize')) {
      return { operation: 'hypothesize', rationale: 'no hypothesis in play' };
    }
    if (can('simulate')) {
      return { operation: 'simulate', rationale: 'a hypothesis has not been simulated' };
    }
    if (can('critique')) {
      return { operation: 'critique', rationale: 'a hypothesis has not been critiqued' };
    }
    if (
      can('seek_information') &&
      state.confidence < decisionThreshold &&
      openUnknowns(state).length > 0
    ) {
      return { operation: 'seek_information', rationale: 'an open unknown can be investigated' };
    }
    if (
      can('hypothesize') &&
      active.length < 2 &&
      state.confidence < decisionThreshold &&
      stepsRemaining > 4
    ) {
      return { operation: 'hypothesize', rationale: 'explore an alternative before committing' };
    }
    if (can('compare')) {
      return { operation: 'compare', rationale: 'hypotheses changed since the last comparison' };
    }
    if (can('decide')) {
      return { operation: 'decide', rationale: 'hypotheses examined' };
    }
    return { operation: first, rationale: 'first available operation' };
  }
}
