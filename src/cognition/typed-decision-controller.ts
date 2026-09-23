import { choice, noul, type TypedDecisionClient } from '../decisions/typed-decisions.js';
import {
  HeuristicController,
  type CognitiveController,
  type ControllerDecision,
  type ControllerInput,
  type DecisionEvaluationRecord,
} from './cognitive-controller.js';
import {
  hasUncomparedObservations,
  isCognitiveOperation,
  nextRevisionTarget,
  OPERATION_DESCRIPTIONS,
} from './cognitive-operations.js';
import { missingForCommitment, readyHypothesis } from './decision-readiness.js';
import {
  activeFacts,
  activeHypotheses,
  comparableObservations,
  openUnknowns,
  pendingPredictions,
  unresolvedContradictions,
} from './mental-state.js';
import { describeThinker } from './typed-decision-state.js';

export interface TypedDecisionControllerOptions {
  /** Below this Choice confidence the fallback controller decides. Defaults to 0.35. */
  minConfidence?: number;
  /** `ready_to_decide` probability that triggers a decision. Defaults to 0.8. */
  readinessThreshold?: number;
  /** Used on low confidence, invalid choices or client errors. Defaults to the heuristic controller. */
  fallback?: CognitiveController;
  /** Overrides the client's default model. */
  model?: string;
}

/** Operation criteria written for literal readers: each option states when it applies. */
const OPERATION_CRITERIA: Record<string, string> = {
  represent: `${OPERATION_DESCRIPTIONS.represent} Choose it when \`contradictions\` is not empty or the problem is poorly framed.`,
  compare_observations: `${OPERATION_DESCRIPTIONS.compare_observations} Choose it when \`observations.uncompared\` is true.`,
  test_prediction: `${OPERATION_DESCRIPTIONS.test_prediction} Choose it when \`pendingPredictions\` is not empty.`,
  revise: `${OPERATION_DESCRIPTIONS.revise} Choose it when \`contradictedHypotheses\` is not empty.`,
  hypothesize: `${OPERATION_DESCRIPTIONS.hypothesize} Choose it when \`hypotheses\` is empty or every hypothesis is weak.`,
  simulate: `${OPERATION_DESCRIPTIONS.simulate} Choose it when a hypothesis has \`simulated: false\`.`,
  critique: `${OPERATION_DESCRIPTIONS.critique} Choose it when a hypothesis has \`critiqued: false\`.`,
  seek_information: `${OPERATION_DESCRIPTIONS.seek_information} Choose it when an entry of \`openUnknowns\` matters for the conclusion.`,
  compare: `${OPERATION_DESCRIPTIONS.compare} Choose it when several hypotheses were critiqued and must be ranked, or a hypothesis has \`assessmentStale: true\`.`,
  decide: `${OPERATION_DESCRIPTIONS.decide} Choose it when the examined hypotheses are enough to answer \`goal\`, or \`progress.stepsRemaining\` is small.`,
};

/**
 * Controller backed by a typed-decision model such as Jev. One request asks two questions
 * about the mental state: which operation comes next (Choice) and whether the reasoning is
 * ready to conclude (Noul). Code keeps control: the choice is restricted to available
 * operations, low-confidence answers and client failures fall back to a deterministic
 * controller, and every call is returned for the audit trail.
 */
export class TypedDecisionController implements CognitiveController {
  readonly name: string;
  private readonly minConfidence: number;
  private readonly readinessThreshold: number;
  private readonly fallback: CognitiveController;

  constructor(
    private readonly client: TypedDecisionClient,
    private readonly options: TypedDecisionControllerOptions = {}
  ) {
    this.name = client.name;
    this.minConfidence = options.minConfidence ?? 0.35;
    this.readinessThreshold = options.readinessThreshold ?? 0.8;
    this.fallback = options.fallback ?? new HeuristicController();
  }

  async selectNext(input: ControllerInput): Promise<ControllerDecision> {
    const [only] = input.available;
    if (only && input.available.length === 1) {
      return { operation: only, controller: this.name, rationale: 'only available operation' };
    }

    const state = this.buildState(input);
    const criteria: Record<string, string> = {};
    for (const operation of input.available) {
      criteria[operation] = OPERATION_CRITERIA[operation] ?? OPERATION_DESCRIPTIONS[operation];
    }
    const questions = {
      next_operation: choice(
        'Which operation should the reasoner perform next to answer `goal` the way `thinker` reasons?',
        criteria
      ),
      ready_to_decide: noul('Is the reasoning ready to commit to a final answer to `goal`?', {
        true: 'At least one hypothesis was simulated and critiqued, no unresolved contradiction blocks it, and more exploration is unlikely to change the conclusion.',
        false:
          'Important hypotheses are unexamined, an open unknown matters for the conclusion, or a contradiction is unresolved.',
      }),
    };

    let evaluation: DecisionEvaluationRecord;
    try {
      const response = await this.client.evaluate({
        state,
        questions,
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      evaluation = {
        client: this.client.name,
        purpose: 'operation_selection',
        model: response.model,
        state,
        questions,
        answers: response.answers,
        usage: response.usage,
      };

      const next = response.answers.next_operation;
      const readiness = response.answers.ready_to_decide.noul;
      const examined = activeHypotheses(input.state).some(
        (hypothesis) => hypothesis.critiques.length > 0
      );

      if (input.available.includes('decide') && examined && readiness >= this.readinessThreshold) {
        return {
          operation: 'decide',
          controller: this.name,
          confidence: readiness,
          probabilities: next.probabilities,
          rationale: `ready to decide (p=${readiness.toFixed(2)})`,
          evaluations: [evaluation],
        };
      }
      if (!isCognitiveOperation(next.choice) || !input.available.includes(next.choice)) {
        return this.defer(input, `"${next.choice}" is not an available operation`, [evaluation]);
      }
      if (next.confidence < this.minConfidence) {
        return this.defer(
          input,
          `confidence ${next.confidence.toFixed(2)} below ${this.minConfidence}`,
          [evaluation]
        );
      }
      return {
        operation: next.choice,
        controller: this.name,
        confidence: next.confidence,
        probabilities: next.probabilities,
        rationale: `chosen with confidence ${next.confidence.toFixed(2)}`,
        evaluations: [evaluation],
      };
    } catch (error) {
      if (input.abortSignal?.aborted) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return this.defer(input, `decision client failed: ${message}`, []);
    }
  }

  private async defer(
    input: ControllerInput,
    reason: string,
    evaluations: DecisionEvaluationRecord[]
  ): Promise<ControllerDecision> {
    const decision = await this.fallback.selectNext(input);
    return {
      ...decision,
      fallbackFrom: { controller: this.name, reason },
      evaluations: [...evaluations, ...(decision.evaluations ?? [])],
    };
  }

  private buildState(input: ControllerInput): Record<string, unknown> {
    const { state } = input;
    const revisionTarget = nextRevisionTarget(state);
    return {
      goal: state.goal,
      thinker: describeThinker(input.profile),
      progress: {
        stepsRemaining: input.stepsRemaining,
        confidence: state.confidence,
        decisionThreshold: input.decisionThreshold,
        recentOperations: state.trail.slice(-5).map((entry) => entry.operation),
      },
      facts: activeFacts(state)
        .slice(-30)
        .map((fact) => fact.statement),
      observations: {
        count: comparableObservations(state).length,
        uncompared: hasUncomparedObservations(state),
      },
      openUnknowns: openUnknowns(state).map((unknown) => unknown.question),
      hypotheses: activeHypotheses(state).map((hypothesis) => ({
        id: hypothesis.id,
        kind: hypothesis.kind,
        statement: hypothesis.statement,
        support: hypothesis.support,
        simulated: hypothesis.simulations.length > 0,
        critiqued: hypothesis.critiques.length > 0,
        assessmentStale: (hypothesis.assessedAtRevision ?? -1) < state.evidenceRevision,
      })),
      pendingPredictions: pendingPredictions(state).map((prediction) => prediction.expected),
      contradictedHypotheses: revisionTarget ? [revisionTarget.id] : [],
      contradictions: unresolvedContradictions(state).map((item) => item.description),
      missingForCommitment: readyHypothesis(state) ? [] : missingForCommitment(state),
    };
  }
}
