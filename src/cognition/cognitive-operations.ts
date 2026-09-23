import { readyHypothesis } from './decision-readiness.js';
import {
  activeHypotheses,
  comparableObservations,
  openUnknowns,
  pendingPredictions,
  predictionTestsLeft,
  unresolvedContradictions,
  type Hypothesis,
  type MentalState,
  type Prediction,
  type Unknown,
} from './mental-state.js';
import type { ThoughtPatch } from './thought-patch.js';

/**
 * The explicit operations a cognitive run can perform. A controller chooses one per step;
 * the engine executes it and records the resulting thought.
 */
export const COGNITIVE_OPERATIONS = [
  'represent',
  'compare_observations',
  'hypothesize',
  'simulate',
  'test_prediction',
  'revise',
  'critique',
  'seek_information',
  'compare',
  'decide',
] as const;

export type CognitiveOperation = (typeof COGNITIVE_OPERATIONS)[number];

export const OPERATION_DESCRIPTIONS: Record<CognitiveOperation, string> = {
  represent:
    'Turn the problem into explicit facts, assumptions, constraints and open questions (unknowns).',
  compare_observations:
    'Relate observations to each other: similarities, differences, changes, incompatibilities and counterexamples.',
  hypothesize:
    'Propose new candidate answers, rules or explanations that differ from the existing ones.',
  simulate: 'Project the consequences of a hypothesis step by step and state testable predictions.',
  test_prediction: 'Confront a recorded prediction with the result of a real test.',
  revise: 'Turn a hypothesis refuted by evidence into a variant that explains the counterexample.',
  critique: 'Search for the strongest reasons why a hypothesis could be wrong or fail.',
  seek_information: 'Use an available tool to answer an open unknown with real data.',
  compare:
    'Judge how well the evidence supports each hypothesis and how well proposals suit the thinker.',
  decide: 'Commit to an answer with its rationale, confidence and next actions.',
};

/** Reframing is offered for open contradictions until the problem was represented this often. */
export const MAX_REPRESENTATIONS = 3;

/** An unknown is abandoned after this many unsuccessful investigations. */
export const MAX_ATTEMPTS_PER_UNKNOWN = 2;

/** An operation is no longer offered after failing this many times in a row. */
export const MAX_FAILED_ATTEMPTS = 2;

export interface AvailabilityContext {
  maxHypotheses: number;
  /** True when tools are available and the tool-call budget is not exhausted. */
  canSeekInformation: boolean;
}

/**
 * Operations whose preconditions hold. The code, not the model, decides what is possible:
 * a controller can only choose among these. `decide` is offered only once an answer passes
 * the readiness check; the engine still forces a (provisional) decision on the last step.
 */
export function availableOperations(
  state: MentalState,
  context: AvailabilityContext
): CognitiveOperation[] {
  if (state.decision) {
    return [];
  }
  const representations = state.trail.filter(
    (entry) => entry.operation === 'represent' && !entry.failed
  ).length;
  if (representations === 0) {
    return ['represent'];
  }

  const active = activeHypotheses(state);
  const hasCapacity = active.length < context.maxHypotheses;
  const canRetry = (operation: CognitiveOperation) =>
    recentFailures(state, operation) < MAX_FAILED_ATTEMPTS;
  const available: CognitiveOperation[] = [];

  if (unresolvedContradictions(state).length > 0 && representations < MAX_REPRESENTATIONS) {
    available.push('represent');
  }
  if (hasUncomparedObservations(state)) {
    available.push('compare_observations');
  }
  if (hasCapacity && canRetry('hypothesize')) {
    available.push('hypothesize');
  }
  if (active.some((hypothesis) => hypothesis.simulations.length === 0) && canRetry('simulate')) {
    available.push('simulate');
  }
  if (nextPredictionToTest(state)) {
    available.push('test_prediction');
  }
  if (hasCapacity && nextRevisionTarget(state)) {
    available.push('revise');
  }
  if (active.some((hypothesis) => hypothesis.critiques.length === 0) && canRetry('critique')) {
    available.push('critique');
  }
  if (
    context.canSeekInformation &&
    nextUnknownToInvestigate(state) &&
    canRetry('seek_information')
  ) {
    available.push('seek_information');
  }
  if (needsComparison(state) && canRetry('compare')) {
    available.push('compare');
  }
  if (readyHypothesis(state) && canRetry('decide')) {
    available.push('decide');
  }
  return available;
}

/** First open unknown that has not exhausted its investigation attempts. */
export function nextUnknownToInvestigate(state: MentalState): Unknown | undefined {
  return openUnknowns(state).find((unknown) => unknown.attempts < MAX_ATTEMPTS_PER_UNKNOWN);
}

/** First pending prediction of a live hypothesis, while the test budget allows it. */
export function nextPredictionToTest(state: MentalState): Prediction | undefined {
  return predictionTestsLeft(state) > 0 ? pendingPredictions(state)[0] : undefined;
}

/**
 * First hypothesis contradicted by evidence (a refuted prediction or a counterexample)
 * that has no variant yet. Hypotheses rejected by a critique are replaced by `hypothesize`.
 */
export function nextRevisionTarget(state: MentalState): Hypothesis | undefined {
  if (recentFailures(state, 'revise') >= MAX_FAILED_ATTEMPTS) {
    return undefined;
  }
  return state.hypotheses.find((hypothesis) => {
    const refuted = state.predictions.some(
      (prediction) => prediction.hypothesisId === hypothesis.id && prediction.status === 'refuted'
    );
    const revised = state.hypotheses.some((candidate) => candidate.parentId === hypothesis.id);
    return (refuted || hypothesis.counterEvidenceRefs.length > 0) && !revised;
  });
}

/** True when observations arrived since the last comparison of observations. */
export function hasUncomparedObservations(state: MentalState): boolean {
  const comparable = comparableObservations(state).length;
  return (
    comparable >= 2 &&
    comparable > state.observationsCompared &&
    recentFailures(state, 'compare_observations') < MAX_FAILED_ATTEMPTS
  );
}

/**
 * True when critiqued hypotheses must be (re)assessed: never compared, changed since the
 * last comparison, or (from schema version 2) judged before the evidence last changed.
 */
export function needsComparison(state: MentalState): boolean {
  const active = activeHypotheses(state);
  const critiqued = active.filter((hypothesis) => hypothesis.critiques.length > 0);
  if (critiqued.length === 0) {
    return false;
  }
  if (state.comparedAtStep === undefined) {
    return true;
  }
  const comparedAt = state.comparedAtStep;
  if (active.some((hypothesis) => hypothesis.updatedAtStep > comparedAt)) {
    return true;
  }
  return (
    state.schemaVersion >= 2 &&
    critiqued.some((hypothesis) => (hypothesis.assessedAtRevision ?? -1) < state.evidenceRevision)
  );
}

/**
 * Failed attempts of an operation since its last success. New evidence brought by another
 * step since then is a reason to try again: older failures no longer count. What failing
 * steps wrote themselves is not new evidence; what the engine recorded (a tool or test
 * result) is.
 */
export function recentFailures(state: MentalState, operation: CognitiveOperation): number {
  let failures = 0;
  for (const entry of [...state.trail].reverse()) {
    if (entry.operation !== operation) {
      if (entry.newEvidence) break;
      continue;
    }
    if (!entry.failed) break;
    failures++;
  }
  return failures;
}

export function isCognitiveOperation(value: unknown): value is CognitiveOperation {
  return typeof value === 'string' && (COGNITIVE_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Keeps the number of hypotheses in play within `maxHypotheses`: extra proposals are
 * dropped (in order) and reported as issues on the thought.
 */
export function capNewHypotheses(
  patch: ThoughtPatch,
  state: MentalState,
  maxHypotheses: number
): { patch: ThoughtPatch; issues: string[] } {
  const capacity = Math.max(0, maxHypotheses - activeHypotheses(state).length);
  if (patch.addHypotheses.length <= capacity) {
    return { patch, issues: [] };
  }
  const dropped = patch.addHypotheses.length - capacity;
  return {
    patch: { ...patch, addHypotheses: patch.addHypotheses.slice(0, capacity) },
    issues: [`${dropped} hypothesis proposal(s) dropped: at most ${maxHypotheses} in play`],
  };
}
