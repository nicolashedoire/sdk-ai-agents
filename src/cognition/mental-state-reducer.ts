import { stateConfidence } from './decision-readiness.js';
import { applyContradictionChanges } from './contradiction-transitions.js';
import {
  applyComparisons,
  applyEvaluations,
  applyFactChanges,
  applyObservations,
} from './evidence-transitions.js';
import {
  applyDecision,
  applyHypothesisProposals,
  applyHypothesisUpdates,
} from './hypothesis-transitions.js';
import { comparableObservations, type Hypothesis, type MentalState } from './mental-state.js';
import type { ThoughtPatch } from './thought-patch.js';

export interface ThoughtApplication {
  state: MentalState;
  /** References the reducer ignored (unknown ids, forbidden transitions). */
  issues: string[];
  /** Set when the operation changed nothing it was meant to change (schema version 2). */
  noEffect?: string;
}

/**
 * Applies one thought to the state. Pure and deterministic: ids are derived from the
 * existing items, so folding the same patches always rebuilds the same state.
 *
 * Invariants enforced here rather than trusted to the model:
 * - a fatal critique without rebuttal, or a refuted prediction, rejects its hypothesis;
 * - a rejected hypothesis cannot be revived, restated or selected;
 * - evidence changes make earlier assessments stale; preferences never change support;
 * - references to unknown ids are ignored and reported as issues.
 */
export function applyThought(
  previous: MentalState,
  operation: string,
  patch: ThoughtPatch
): ThoughtApplication {
  const step = previous.step + 1;
  const issues: string[] = [];
  const state = copyState(previous, step, operation, patch);

  // Observations and test results are recorded by the engine; the rest is written by the model.
  let engineEvidence = applyObservations(state, patch, step);
  let evidenceChanged = engineEvidence;
  evidenceChanged = applyFactChanges(state, patch, step, issues) || evidenceChanged;
  for (const assumption of patch.addAssumptions) {
    state.assumptions.push({
      id: `A${state.assumptions.length + 1}`,
      statement: assumption.statement,
      confidence: assumption.confidence,
      step,
    });
  }
  for (const constraint of patch.addConstraints) {
    state.constraints.push({
      id: `K${state.constraints.length + 1}`,
      statement: constraint.statement,
      step,
    });
  }
  for (const unknown of patch.addUnknowns) {
    state.unknowns.push({
      id: `U${state.unknowns.length + 1}`,
      question: unknown.question,
      status: 'open',
      attempts: 0,
      step,
    });
  }
  applyUnknownChanges(state, patch, issues);
  applyHypothesisProposals(state, patch, step, issues);
  evidenceChanged = applyComparisons(state, patch, step, issues) || evidenceChanged;
  engineEvidence = applyEvaluations(state, patch, step, issues) || engineEvidence;
  evidenceChanged = engineEvidence || evidenceChanged;
  evidenceChanged = applyContradictionChanges(state, patch, step, issues) || evidenceChanged;
  for (const failure of patch.addFailures) {
    state.failures.push({
      id: `X${state.failures.length + 1}`,
      operation,
      description: failure.description,
      step,
    });
  }

  const legacy = state.schemaVersion < 2;
  if (evidenceChanged && !legacy) {
    state.evidenceRevision += 1;
  }
  applyHypothesisUpdates(state, patch, step, issues);
  let failed = patch.failed === true;
  let noEffect: string | undefined;
  if (!legacy) {
    // An operation that changed nothing it was meant to change counts as a failed attempt,
    // so it is not repeated blindly. The entry keeps the evidence revision it happened at.
    noEffect = failed ? undefined : missingEffect(previous, state, operation);
    if (noEffect) {
      issues.push(noEffect);
      failed = true;
    }
    // A failed step only brings new evidence through what the engine recorded.
    stampTrail(state, failed, evidenceChanged && (!failed || engineEvidence));
  }

  if (operation === 'compare' && (legacy || !failed)) {
    state.comparedAtStep = step;
    state.comparedAtRevision = state.evidenceRevision;
  }
  if (operation === 'compare_observations' && !failed) {
    state.observationsCompared = comparableObservations(state).length;
  }

  if (legacy) {
    if (patch.confidence !== undefined) state.confidence = patch.confidence;
  } else {
    state.confidence = stateConfidence(state);
  }
  if (patch.decision) {
    const decision = applyDecision(state, patch.decision, step, issues);
    if (decision) {
      state.decision = decision;
      if (legacy || decision.status !== 'abstain') state.confidence = decision.confidence;
    }
  }

  return { state, issues, ...(noEffect ? { noEffect } : {}) };
}

/** What an operation was meant to change and did not, if anything. */
function missingEffect(
  previous: MentalState,
  state: MentalState,
  operation: string
): string | undefined {
  switch (operation) {
    case 'hypothesize':
    case 'revise':
      return state.hypotheses.length > previous.hypotheses.length
        ? undefined
        : `${operation} added no hypothesis`;
    case 'simulate':
      return newlyExamined(previous, state, (hypothesis) => hypothesis.simulations.length)
        ? undefined
        : 'simulate examined no hypothesis that lacked a simulation';
    case 'critique':
      return newlyExamined(previous, state, (hypothesis) => hypothesis.critiques.length) ||
        newlyRejected(previous, state)
        ? undefined
        : 'critique examined no hypothesis that lacked a critique';
    case 'compare_observations':
      return state.comparisons.length > previous.comparisons.length
        ? undefined
        : 'compare_observations recorded no comparison';
    case 'seek_information':
      return learnedSomething(previous, state)
        ? undefined
        : 'seek_information brought no observation and settled no unknown';
    default:
      return undefined;
  }
}

/** A new (non-repeated) observation, a new fact, or an unknown settled. */
function learnedSomething(previous: MentalState, state: MentalState): boolean {
  const observed = state.observations
    .slice(previous.observations.length)
    .some((observation) => !observation.duplicateOf);
  const settled = state.unknowns.some(
    (unknown) =>
      unknown.status !== 'open' &&
      previous.unknowns.find((before) => before.id === unknown.id)?.status === 'open'
  );
  return observed || settled || state.facts.length > previous.facts.length;
}

/** True when a hypothesis that had none of something (simulation, critique) now has one. */
function newlyExamined(
  previous: MentalState,
  state: MentalState,
  count: (hypothesis: Hypothesis) => number
): boolean {
  return previous.hypotheses.some((before) => {
    const after = state.hypotheses.find((hypothesis) => hypothesis.id === before.id);
    return count(before) === 0 && after !== undefined && count(after) > 0;
  });
}

function newlyRejected(previous: MentalState, state: MentalState): boolean {
  return state.hypotheses.some(
    (hypothesis) =>
      hypothesis.status === 'rejected' &&
      previous.hypotheses.find((before) => before.id === hypothesis.id)?.status !== 'rejected'
  );
}

function stampTrail(state: MentalState, failed: boolean, newEvidence: boolean): void {
  const last = state.trail.at(-1);
  if (!last) return;
  state.trail[state.trail.length - 1] = {
    ...last,
    ...(failed ? { failed: true } : {}),
    revision: state.evidenceRevision,
    ...(newEvidence ? { newEvidence: true } : {}),
  };
}

function copyState(
  previous: MentalState,
  step: number,
  operation: string,
  patch: ThoughtPatch
): MentalState {
  return {
    ...previous,
    step,
    observations: [...previous.observations],
    facts: previous.facts.map((fact) => ({ ...fact })),
    assumptions: [...previous.assumptions],
    constraints: [...previous.constraints],
    unknowns: previous.unknowns.map((unknown) => ({ ...unknown })),
    hypotheses: previous.hypotheses.map((hypothesis) => ({
      ...hypothesis,
      premiseRefs: [...hypothesis.premiseRefs],
      evidenceRefs: [...hypothesis.evidenceRefs],
      counterEvidenceRefs: [...hypothesis.counterEvidenceRefs],
      simulations: [...hypothesis.simulations],
      critiques: [...hypothesis.critiques],
    })),
    comparisons: [...previous.comparisons],
    predictions: previous.predictions.map((prediction) => ({ ...prediction })),
    contradictions: previous.contradictions.map((contradiction) => ({ ...contradiction })),
    failures: [...previous.failures],
    trail: [
      ...previous.trail,
      { step, operation, summary: patch.summary, ...(patch.failed ? { failed: true } : {}) },
    ],
  };
}

function applyUnknownChanges(state: MentalState, patch: ThoughtPatch, issues: string[]): void {
  if (patch.investigatedUnknownId) {
    const investigated = state.unknowns.find(
      (unknown) => unknown.id === patch.investigatedUnknownId
    );
    if (investigated) {
      investigated.attempts += 1;
    } else {
      issues.push(`investigated unknown ${patch.investigatedUnknownId} does not exist`);
    }
  }
  for (const resolved of patch.resolveUnknowns) {
    const unknown = state.unknowns.find((candidate) => candidate.id === resolved.unknownId);
    if (!unknown) {
      issues.push(`cannot resolve unknown ${resolved.unknownId}: not found`);
      continue;
    }
    unknown.status = 'resolved';
    unknown.resolution = resolved.resolution;
  }
  for (const dropped of patch.dropUnknowns) {
    const unknown = state.unknowns.find((candidate) => candidate.id === dropped.unknownId);
    if (!unknown) {
      issues.push(`cannot drop unknown ${dropped.unknownId}: not found`);
      continue;
    }
    if (unknown.status === 'open') {
      unknown.status = 'dropped';
      unknown.resolution = dropped.reason;
    }
  }
}
