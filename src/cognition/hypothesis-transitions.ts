import type {
  Decision,
  Hypothesis,
  HypothesisStatus,
  MentalState,
  ThoughtPatch,
} from './mental-state.js';

/**
 * Hypothesis lifecycle rules applied by the reducer. They live in code rather than in
 * prompts so a model cannot revive a rejected idea or skip a critique.
 */

export function applyHypothesisChanges(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): void {
  for (const hypothesis of patch.addHypotheses) {
    state.hypotheses.push({
      id: `H${state.hypotheses.length + 1}`,
      statement: hypothesis.statement,
      ...(hypothesis.rationale ? { rationale: hypothesis.rationale } : {}),
      status: 'proposed',
      support: 0.5,
      simulations: [],
      critiques: [],
      createdAtStep: step,
      updatedAtStep: step,
    });
  }

  for (const simulation of patch.simulations) {
    const hypothesis = findLiveHypothesis(state, simulation.hypothesisId, 'simulate', issues);
    if (!hypothesis) continue;
    hypothesis.simulations.push({
      steps: simulation.steps,
      outcome: simulation.outcome,
      sideEffects: simulation.sideEffects,
      step,
    });
    advance(hypothesis, 'simulated', step);
  }

  for (const critique of patch.critiques) {
    const hypothesis = findLiveHypothesis(state, critique.hypothesisId, 'critique', issues);
    if (!hypothesis) continue;
    hypothesis.critiques.push({
      objection: critique.objection,
      severity: critique.severity,
      ...(critique.rebuttal ? { rebuttal: critique.rebuttal } : {}),
      step,
    });
    advance(hypothesis, 'critiqued', step);
    if (critique.severity === 'fatal' && !critique.rebuttal?.trim()) {
      reject(hypothesis, critique.objection, step);
    }
  }

  for (const update of patch.hypothesisUpdates) {
    const hypothesis = findLiveHypothesis(state, update.hypothesisId, 'update', issues);
    if (!hypothesis) continue;
    if (update.support !== undefined) {
      hypothesis.support = update.support;
      hypothesis.updatedAtStep = step;
    }
    if (update.reject) {
      reject(hypothesis, update.reason ?? 'rejected during reasoning', step);
    }
  }
}

export function applyDecision(
  state: MentalState,
  decision: Decision,
  step: number,
  issues: string[]
): Decision {
  if (!decision.hypothesisId) {
    return decision;
  }
  const hypothesis = state.hypotheses.find((candidate) => candidate.id === decision.hypothesisId);
  if (!hypothesis || hypothesis.status === 'rejected') {
    issues.push(
      hypothesis
        ? `decision cannot select rejected hypothesis ${hypothesis.id}`
        : `decision references unknown hypothesis ${decision.hypothesisId}`
    );
    const { hypothesisId: _ignored, ...withoutReference } = decision;
    return withoutReference;
  }
  hypothesis.status = 'selected';
  hypothesis.updatedAtStep = step;
  return decision;
}

function findLiveHypothesis(
  state: MentalState,
  id: string,
  action: string,
  issues: string[]
): Hypothesis | undefined {
  const hypothesis = state.hypotheses.find((candidate) => candidate.id === id);
  if (!hypothesis) {
    issues.push(`cannot ${action} hypothesis ${id}: not found`);
    return undefined;
  }
  if (hypothesis.status === 'rejected') {
    issues.push(`cannot ${action} hypothesis ${id}: already rejected`);
    return undefined;
  }
  return hypothesis;
}

const STATUS_RANK: Record<HypothesisStatus, number> = {
  proposed: 0,
  simulated: 1,
  critiqued: 2,
  selected: 3,
  rejected: 4,
};

/** Moves a hypothesis forward in its lifecycle, never backward. */
function advance(hypothesis: Hypothesis, status: HypothesisStatus, step: number): void {
  if (STATUS_RANK[status] > STATUS_RANK[hypothesis.status]) {
    hypothesis.status = status;
  }
  hypothesis.updatedAtStep = step;
}

function reject(hypothesis: Hypothesis, reason: string, step: number): void {
  hypothesis.status = 'rejected';
  hypothesis.rejectionReason = reason;
  hypothesis.updatedAtStep = step;
}
