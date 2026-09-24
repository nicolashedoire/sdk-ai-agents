import {
  activeHypotheses,
  pendingPredictions,
  predictionTestsLeft,
  unresolvedContradictions,
  type Hypothesis,
  type MentalState,
} from './mental-state.js';
import type { Decision } from './thought-patch.js';

/**
 * Conclusion guard. Whether an answer may be committed is decided here, from the state,
 * independently of the controller and of the model's own confidence.
 */

export type DecisionBlocker =
  | { kind: 'no_hypothesis' }
  | { kind: 'unknown_hypothesis'; hypothesisId: string }
  | { kind: 'rejected_hypothesis'; hypothesisId: string; reason?: string }
  | { kind: 'not_critiqued'; hypothesisId: string }
  | { kind: 'stale_assessment'; hypothesisId: string }
  | { kind: 'contradiction'; contradictionId: string; description: string }
  | { kind: 'untested_prediction'; predictionId: string; expected: string }
  | { kind: 'low_support'; hypothesisId: string; support: number; threshold: number }
  | { kind: 'low_fit'; hypothesisId: string; fit: number; threshold: number; supportFloor: number };

export interface DecisionReadiness {
  hypothesisId?: string;
  ready: boolean;
  blockers: DecisionBlocker[];
}

/**
 * Ranking score. Rules and explanations are claims about the world: only evidence ranks
 * them. Proposals are actions: the thinker's preferences may reorder them, without ever
 * changing their evidence support.
 */
export function rankScore(state: MentalState, hypothesis: Hypothesis): number {
  if (hypothesis.kind !== 'proposal' || hypothesis.preferenceFit === undefined) {
    return hypothesis.support;
  }
  const weight = state.commitRules.preferenceWeight;
  return (1 - weight) * hypothesis.support + weight * hypothesis.preferenceFit;
}

/** Active hypotheses, best first. Ties keep creation order. */
export function rankHypotheses(state: MentalState): Hypothesis[] {
  return activeHypotheses(state)
    .map((hypothesis, index) => ({ hypothesis, index, score: rankScore(state, hypothesis) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((entry) => entry.hypothesis);
}

/** Evidence support of the best-ranked hypothesis (0 when none is in play). */
export function stateConfidence(state: MentalState): number {
  return rankHypotheses(state)[0]?.support ?? 0;
}

export function assessReadiness(state: MentalState, hypothesisId: string): DecisionReadiness {
  const hypothesis = state.hypotheses.find((candidate) => candidate.id === hypothesisId);
  if (!hypothesis) {
    return { hypothesisId, ready: false, blockers: [{ kind: 'unknown_hypothesis', hypothesisId }] };
  }
  if (hypothesis.status === 'rejected') {
    return {
      hypothesisId,
      ready: false,
      blockers: [
        {
          kind: 'rejected_hypothesis',
          hypothesisId,
          ...(hypothesis.rejectionReason ? { reason: hypothesis.rejectionReason } : {}),
        },
      ],
    };
  }

  const blockers: DecisionBlocker[] = [];
  if (hypothesis.critiques.length === 0) {
    blockers.push({ kind: 'not_critiqued', hypothesisId });
  }
  if (
    hypothesis.assessedAtRevision === undefined ||
    hypothesis.assessedAtRevision < state.evidenceRevision
  ) {
    blockers.push({ kind: 'stale_assessment', hypothesisId });
  }
  const scope = new Set([
    hypothesis.id,
    ...hypothesis.premiseRefs,
    ...hypothesis.evidenceRefs,
    ...hypothesis.counterEvidenceRefs,
  ]);
  for (const contradiction of unresolvedContradictions(state)) {
    // A contradiction that names nothing concerns the whole problem.
    const concerned =
      contradiction.between.length === 0 || contradiction.between.some((id) => scope.has(id));
    if (concerned) {
      blockers.push({
        kind: 'contradiction',
        contradictionId: contradiction.id,
        description: contradiction.description,
      });
    }
  }
  if (predictionTestsLeft(state) > 0) {
    for (const prediction of pendingPredictions(state)) {
      if (prediction.hypothesisId === hypothesisId) {
        blockers.push({
          kind: 'untested_prediction',
          predictionId: prediction.id,
          expected: prediction.expected,
        });
      }
    }
  }
  // A claim about the world needs strong evidence. A choice of action may also be committed
  // when the thinker clearly prefers it and its evidence support reaches a lower floor.
  const { decisionThreshold: threshold, minProposalSupport: floor } = state.commitRules;
  const fit = hypothesis.kind === 'proposal' ? hypothesis.preferenceFit : undefined;
  const preferred = floor !== undefined && fit !== undefined && fit >= threshold;
  const byEvidence = hypothesis.support >= threshold;
  const byPreference = preferred && hypothesis.support >= floor;
  if (!byEvidence && !byPreference) {
    // The thinker's clear choice only lacks the floor; anything else lacks the full threshold.
    blockers.push({
      kind: 'low_support',
      hypothesisId,
      support: hypothesis.support,
      threshold: preferred ? floor : threshold,
    });
    // Where the floor equals the threshold, a clear preference could not help: no fit to report.
    if (floor !== undefined && fit !== undefined && !preferred && floor < threshold) {
      blockers.push({ kind: 'low_fit', hypothesisId, fit, threshold, supportFloor: floor });
    }
  }
  return { hypothesisId, ready: blockers.length === 0, blockers };
}

/** Best-ranked hypothesis that may be committed, if any. */
export function readyHypothesis(state: MentalState): Hypothesis | undefined {
  return rankHypotheses(state).find((hypothesis) => assessReadiness(state, hypothesis.id).ready);
}

/** What stands between the best-ranked hypothesis and a committed answer. */
export function missingForCommitment(state: MentalState): string[] {
  const best = rankHypotheses(state)[0];
  if (!best) {
    return [describeBlocker({ kind: 'no_hypothesis' })];
  }
  const blockers = assessReadiness(state, best.id).blockers.map(describeBlocker);
  return blockers.length > 0 ? blockers : [`no hypothesis was selected (${best.id} could be)`];
}

/** Decision written by the engine when no answer can be defended. */
export function abstention(
  state: MentalState,
  reason: string,
  nextActions: string[] = []
): Decision {
  return {
    answer: `No answer can be committed yet: ${reason}.`,
    rationale: reason,
    confidence: 0,
    nextActions,
    status: 'abstain',
    missing: missingForCommitment(state),
  };
}

export function describeBlocker(blocker: DecisionBlocker): string {
  switch (blocker.kind) {
    case 'no_hypothesis':
      return 'no hypothesis is in play';
    case 'unknown_hypothesis':
      return `hypothesis ${blocker.hypothesisId} does not exist`;
    case 'rejected_hypothesis':
      return `hypothesis ${blocker.hypothesisId} was rejected${blocker.reason ? ` (${blocker.reason})` : ''}`;
    case 'not_critiqued':
      return `${blocker.hypothesisId} has not been critiqued`;
    case 'stale_assessment':
      return `${blocker.hypothesisId} was not reassessed since the evidence changed`;
    case 'contradiction':
      return `contradiction ${blocker.contradictionId} is unresolved: ${blocker.description}`;
    case 'untested_prediction':
      return `prediction ${blocker.predictionId} is untested: ${blocker.expected}`;
    case 'low_fit':
      return `${blocker.hypothesisId} is not clearly the thinker's choice either: its fit with the thinker is ${blocker.fit}, below ${blocker.threshold} (a clear choice would need evidence support of ${blocker.supportFloor} only)`;
    case 'low_support':
      return `${blocker.hypothesisId} has evidence support ${blocker.support}, below ${blocker.threshold}`;
  }
}

export type DecisionSettlement =
  | { outcome: 'apply'; decision: Decision; issue?: string }
  | { outcome: 'defer'; issue: string };

/**
 * Engine rule for a proposed decision. While the run can still investigate, a decision that
 * does not pass the readiness check (or selects no hypothesis) is deferred. When the budget
 * forces a conclusion it becomes provisional (a live hypothesis, with what is missing) or an
 * abstention written by the engine, with no confidence.
 */
export function settleDecision(
  state: MentalState,
  proposed: Decision,
  forced: boolean
): DecisionSettlement {
  const { status: _status, missing: _missing, ...decision } = proposed;
  if (!decision.hypothesisId) {
    if (!forced) {
      const ready = readyHypothesis(state);
      return {
        outcome: 'defer',
        issue: `decision deferred: it selects no hypothesis${ready ? ` (${ready.id} is ready to commit)` : ''}`,
      };
    }
    return {
      outcome: 'apply',
      decision: {
        ...abstention(state, 'no hypothesis was selected', decision.nextActions),
        // What the model wrote is kept as the explanation, not presented as an answer.
        rationale: `${decision.answer} ${decision.rationale}`,
      },
    };
  }
  const readiness = assessReadiness(state, decision.hypothesisId);
  if (readiness.ready) {
    return { outcome: 'apply', decision: { ...decision, status: 'committed', missing: [] } };
  }
  const reasons = readiness.blockers.map(describeBlocker);
  if (!forced) {
    return {
      outcome: 'defer',
      issue: `decision on ${decision.hypothesisId} deferred: ${reasons.join('; ')}`,
    };
  }
  const invalid = readiness.blockers.find(
    (blocker) => blocker.kind === 'unknown_hypothesis' || blocker.kind === 'rejected_hypothesis'
  );
  if (invalid) {
    const reason =
      invalid.kind === 'rejected_hypothesis'
        ? `the proposed answer relied on ${invalid.hypothesisId}, which was rejected${invalid.reason ? ` (${invalid.reason})` : ''}`
        : `the proposed answer relied on ${invalid.hypothesisId}, which does not exist`;
    return {
      outcome: 'apply',
      decision: abstention(state, reason, decision.nextActions),
      issue: `decision on ${decision.hypothesisId} replaced by an abstention`,
    };
  }
  return { outcome: 'apply', decision: { ...decision, status: 'provisional', missing: reasons } };
}
