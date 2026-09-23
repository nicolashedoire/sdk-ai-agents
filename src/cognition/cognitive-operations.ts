import {
  type ThoughtPatch,
  activeHypotheses,
  openUnknowns,
  unresolvedContradictions,
  type MentalState,
  type Unknown,
} from './mental-state.js';

/**
 * The explicit operations a cognitive run can perform. A controller chooses one per step;
 * the engine executes it and records the resulting thought.
 */
export const COGNITIVE_OPERATIONS = [
  'represent',
  'hypothesize',
  'simulate',
  'critique',
  'seek_information',
  'compare',
  'decide',
] as const;

export type CognitiveOperation = (typeof COGNITIVE_OPERATIONS)[number];

export const OPERATION_DESCRIPTIONS: Record<CognitiveOperation, string> = {
  represent:
    'Turn the problem into explicit facts, assumptions, constraints and open questions (unknowns).',
  hypothesize:
    'Propose new candidate explanations or solutions that differ from the existing ones.',
  simulate:
    'Project the consequences of a hypothesis step by step, including second-order effects.',
  critique: 'Search for the strongest reasons why a hypothesis could be wrong or fail.',
  seek_information: 'Use an available tool to answer an open unknown with real data.',
  compare: "Weigh the remaining hypotheses against the evidence and the thinker's priorities.",
  decide: 'Commit to an answer with its rationale, confidence and next actions.',
};

/** Reframing is offered for open contradictions until the problem was represented this often. */
export const MAX_REPRESENTATIONS = 3;

/** An unknown is abandoned after this many unsuccessful investigations. */
export const MAX_ATTEMPTS_PER_UNKNOWN = 2;

export interface AvailabilityContext {
  maxHypotheses: number;
  /** True when tools are available and the tool-call budget is not exhausted. */
  canSeekInformation: boolean;
}

/**
 * Operations whose preconditions hold. The code, not the model, decides what is possible:
 * a controller can only choose among these.
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
  const represented = representations > 0;
  if (!represented) {
    return ['represent'];
  }

  const active = activeHypotheses(state);
  const available: CognitiveOperation[] = [];

  if (unresolvedContradictions(state).length > 0 && representations < MAX_REPRESENTATIONS) {
    available.push('represent');
  }
  if (active.length < context.maxHypotheses) {
    available.push('hypothesize');
  }
  if (active.some((hypothesis) => hypothesis.simulations.length === 0)) {
    available.push('simulate');
  }
  if (active.some((hypothesis) => hypothesis.critiques.length === 0)) {
    available.push('critique');
  }
  if (context.canSeekInformation && nextUnknownToInvestigate(state)) {
    available.push('seek_information');
  }
  if (needsComparison(state)) {
    available.push('compare');
  }
  if (active.length > 0) {
    available.push('decide');
  }
  return available;
}

/** First open unknown that has not exhausted its investigation attempts. */
export function nextUnknownToInvestigate(state: MentalState): Unknown | undefined {
  return openUnknowns(state).find((unknown) => unknown.attempts < MAX_ATTEMPTS_PER_UNKNOWN);
}

/** True when a critiqued hypothesis changed since the last comparison. */
export function needsComparison(state: MentalState): boolean {
  const active = activeHypotheses(state);
  if (!active.some((hypothesis) => hypothesis.critiques.length > 0)) {
    return false;
  }
  if (state.comparedAtStep === undefined) {
    return true;
  }
  const comparedAt = state.comparedAtStep;
  return active.some((hypothesis) => hypothesis.updatedAtStep > comparedAt);
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
