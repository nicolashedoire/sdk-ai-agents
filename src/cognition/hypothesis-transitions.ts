import { assessReadiness, describeBlocker, missingForCommitment } from './decision-readiness.js';
import {
  knownReferences,
  sameStatement,
  type Hypothesis,
  type HypothesisStatus,
  type MentalState,
} from './mental-state.js';
import type { Decision, ThoughtPatch } from './thought-patch.js';

/**
 * Hypothesis lifecycle rules applied by the reducer. They live in code rather than in
 * prompts so a model cannot revive a rejected idea, skip a critique or let a preference
 * pass for evidence.
 */

/** New hypotheses, simulations, predictions and critiques. */
export function applyHypothesisProposals(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): void {
  const known = knownReferences(state);
  for (const proposal of patch.addHypotheses) {
    const id = `H${state.hypotheses.length + 1}`;
    const refusal = state.schemaVersion >= 2 ? proposalRefusal(state, proposal) : undefined;
    if (refusal) {
      issues.push(refusal);
      continue;
    }
    const premiseRefs = proposal.premiseRefs.filter((ref) => {
      if (known.has(ref)) return true;
      issues.push(`${id} cites unknown premise ${ref}`);
      return false;
    });
    let parentId = proposal.parentId;
    if (parentId && !state.hypotheses.some((hypothesis) => hypothesis.id === parentId)) {
      issues.push(`${id} revises unknown hypothesis ${parentId}`);
      parentId = undefined;
    }
    if (parentId && !proposal.difference?.trim()) {
      issues.push(`${id} revises ${parentId} without stating what changed`);
    }
    state.hypotheses.push({
      id,
      statement: proposal.statement,
      ...(proposal.rationale ? { rationale: proposal.rationale } : {}),
      kind: proposal.kind,
      ...(proposal.inference ? { inference: proposal.inference } : {}),
      status: 'proposed',
      support: 0.5,
      premiseRefs,
      evidenceRefs: [],
      counterEvidenceRefs: [],
      ...(proposal.scope ? { scope: proposal.scope } : {}),
      ...(parentId ? { parentId } : {}),
      ...(parentId && proposal.difference ? { difference: proposal.difference } : {}),
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

  for (const prediction of patch.predictions) {
    const hypothesis = findLiveHypothesis(state, prediction.hypothesisId, 'predict', issues);
    if (!hypothesis) continue;
    state.predictions.push({
      id: `P${state.predictions.length + 1}`,
      hypothesisId: hypothesis.id,
      expected: prediction.expected,
      falsifier: prediction.falsifier,
      ...(prediction.context ? { context: prediction.context } : {}),
      ...(prediction.test ? { test: prediction.test } : {}),
      status: 'pending',
      step,
    });
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
      rejectHypothesis(hypothesis, critique.objection, step);
    }
  }
}

/**
 * Support and preference updates. A hypothesis whose support is judged again is assessed at
 * the current evidence revision; the others keep their (possibly stale) assessment.
 */
export function applyHypothesisUpdates(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): void {
  const known = knownReferences(state);
  for (const update of patch.hypothesisUpdates) {
    const hypothesis = findLiveHypothesis(state, update.hypothesisId, 'update', issues);
    if (!hypothesis) continue;
    if (update.support !== undefined) {
      hypothesis.support = update.support;
      hypothesis.updatedAtStep = step;
      hypothesis.assessedAtRevision = state.evidenceRevision;
      const basis = update.basisRefs.filter((ref) => {
        if (known.has(ref)) return true;
        issues.push(`assessment of ${hypothesis.id} cites unknown id ${ref}`);
        return false;
      });
      if (basis.length > 0) hypothesis.assessmentBasis = basis;
    }
    if (update.preferenceFit !== undefined) {
      hypothesis.preferenceFit = update.preferenceFit;
    }
    if (update.reject) {
      rejectHypothesis(hypothesis, update.reason ?? 'rejected during reasoning', step);
    }
  }
}

/**
 * Applies a decision. Version 2 runs refuse a decision on a rejected or unknown hypothesis
 * and only commit when the readiness check passes; otherwise the decision is provisional
 * and lists what is missing. Version 1 runs keep their original rule.
 */
export function applyDecision(
  state: MentalState,
  decision: Decision,
  step: number,
  issues: string[]
): Decision | undefined {
  if (state.schemaVersion < 2) {
    return applyLegacyDecision(state, decision, step, issues);
  }
  if (decision.status === 'abstain' || !decision.hypothesisId) {
    // An abstention defends no answer: it carries no confidence and says what is missing.
    const { hypothesisId: _ignored, ...abstention } = decision;
    const missing = decision.missing?.length ? decision.missing : missingForCommitment(state);
    return { ...abstention, confidence: 0, status: 'abstain', missing };
  }

  const hypothesis = state.hypotheses.find((candidate) => candidate.id === decision.hypothesisId);
  if (!hypothesis || hypothesis.status === 'rejected') {
    issues.push(
      hypothesis
        ? `decision refused: ${hypothesis.id} was rejected (${hypothesis.rejectionReason ?? 'no reason'})`
        : `decision refused: unknown hypothesis ${decision.hypothesisId}`
    );
    return undefined;
  }

  const readiness = assessReadiness(state, hypothesis.id);
  let status = decision.status ?? (readiness.ready ? 'committed' : 'provisional');
  if (status === 'committed' && !readiness.ready) {
    issues.push(`decision on ${hypothesis.id} cannot be committed: it is provisional`);
    status = 'provisional';
  }
  const confidence = Math.min(decision.confidence, hypothesis.support);
  if (confidence < decision.confidence) {
    issues.push(
      `decision confidence capped at the evidence support of ${hypothesis.id} (${hypothesis.support})`
    );
  }
  hypothesis.status = 'selected';
  hypothesis.updatedAtStep = step;
  return {
    ...decision,
    confidence,
    status,
    missing: readiness.ready ? [] : readiness.blockers.map(describeBlocker),
  };
}

function applyLegacyDecision(
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

export function rejectHypothesis(hypothesis: Hypothesis, reason: string, step: number): void {
  hypothesis.status = 'rejected';
  hypothesis.rejectionReason = reason;
  hypothesis.updatedAtStep = step;
}

type HypothesisProposal = ThoughtPatch['addHypotheses'][number];

/**
 * Why a proposal is refused from schema version 2 on, if it is: it restates a hypothesis
 * already considered (a rejected idea may only come back as a variant), or it is a variant
 * that does not say what changed. Shared by the reducer and the engine's admission.
 */
export function proposalRefusal(
  state: MentalState,
  proposal: HypothesisProposal
): string | undefined {
  const restated = state.hypotheses.find((hypothesis) =>
    sameStatement(hypothesis.statement, proposal.statement)
  );
  if (restated) {
    return restated.status === 'rejected'
      ? `"${proposal.statement}" restates rejected hypothesis ${restated.id}; propose a variant instead`
      : `"${proposal.statement}" restates ${restated.id}, which is already in play`;
  }
  const parent = proposal.parentId;
  if (
    parent &&
    state.hypotheses.some((hypothesis) => hypothesis.id === parent) &&
    !proposal.difference?.trim()
  ) {
    return `variant of ${parent} refused: it must state what changed ("difference")`;
  }
  return undefined;
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
