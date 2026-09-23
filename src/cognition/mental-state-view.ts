import { missingForCommitment, rankHypotheses, readyHypothesis } from './decision-readiness.js';
import { unresolvedContradictions, type Hypothesis, type MentalState } from './mental-state.js';

/**
 * Compact, id-addressable view of the state, shared by LLM prompts, typed-decision requests
 * and exported datasets. Rejected hypotheses and revised facts are kept, with their reason,
 * so they are not proposed again. Empty collections are omitted to keep prompts short.
 */
export function describeMentalState(state: MentalState): Record<string, unknown> {
  const view: Record<string, unknown> = {
    goal: state.goal,
    ...(state.context ? { context: state.context } : {}),
    step: state.step,
    confidence: round(state.confidence),
  };
  const add = (key: string, items: unknown[]) => {
    if (items.length > 0) view[key] = items;
  };

  add(
    'observations',
    state.observations.map((observation) => ({
      id: observation.id,
      kind: observation.sourceKind,
      ...(observation.source ? { source: observation.source } : {}),
      summary: observation.summary,
      ...(observation.context ? { context: observation.context } : {}),
      origin: observation.originGroup,
      ...(observation.duplicateOf ? { duplicateOf: observation.duplicateOf } : {}),
    }))
  );
  add(
    'facts',
    state.facts.map((fact) => ({
      id: fact.id,
      statement: fact.statement,
      source: fact.source,
      confidence: round(fact.confidence),
      ...(fact.evidence ? { evidence: fact.evidence } : {}),
      ...(fact.observationRefs.length > 0 ? { observations: fact.observationRefs } : {}),
      ...(fact.status !== 'active'
        ? {
            status: fact.status,
            revision: fact.revision?.reason,
            replacedBy: fact.revision?.replacedBy,
          }
        : {}),
    }))
  );
  add(
    'assumptions',
    state.assumptions.map((assumption) => ({
      id: assumption.id,
      statement: assumption.statement,
      confidence: round(assumption.confidence),
    }))
  );
  add(
    'constraints',
    state.constraints.map((constraint) => ({ id: constraint.id, statement: constraint.statement }))
  );
  add(
    'unknowns',
    state.unknowns.map((unknown) => ({
      id: unknown.id,
      question: unknown.question,
      status: unknown.status,
      ...(unknown.resolution ? { resolution: unknown.resolution } : {}),
    }))
  );
  add(
    'comparisons',
    state.comparisons.slice(-10).map((comparison) => ({
      id: comparison.id,
      relation: comparison.relation,
      between: [comparison.left, comparison.right],
      aspect: comparison.aspect,
      ...(comparison.hypothesisId ? { hypothesis: comparison.hypothesisId } : {}),
    }))
  );
  add(
    'hypotheses',
    state.hypotheses.map((hypothesis) => describeHypothesis(state, hypothesis))
  );
  // Tests already run and what they showed, so the same experiment is not proposed again.
  add(
    'experiments',
    state.predictions
      .filter((prediction) => prediction.evaluation)
      .map((prediction) => {
        const observed = state.observations.find(
          (observation) => observation.id === prediction.evaluation?.observationId
        );
        return {
          prediction: prediction.id,
          ...(prediction.test ? { test: prediction.test } : {}),
          verdict: prediction.status,
          ...(observed ? { observed: observed.summary } : {}),
        };
      })
  );
  add(
    'contradictions',
    unresolvedContradictions(state).map((contradiction) => ({
      id: contradiction.id,
      description: contradiction.description,
      between: contradiction.between,
      ...(contradiction.category ? { category: contradiction.category } : {}),
    }))
  );
  add(
    'failures',
    state.failures.map((failure) => `${failure.operation}: ${failure.description}`)
  );
  if (state.schemaVersion >= 2 && state.hypotheses.length > 0) {
    const ready = readyHypothesis(state);
    view.readiness = ready
      ? { readyToCommit: ready.id }
      : { readyToCommit: null, missing: missingForCommitment(state) };
    view.ranking = rankHypotheses(state).map((hypothesis) => hypothesis.id);
  }
  view.recentOperations = state.trail.slice(-5).map((entry) => entry.operation);
  return view;
}

function describeHypothesis(state: MentalState, hypothesis: Hypothesis): Record<string, unknown> {
  const predictions = state.predictions.filter(
    (prediction) => prediction.hypothesisId === hypothesis.id
  );
  const stale =
    state.schemaVersion >= 2 &&
    hypothesis.status !== 'rejected' &&
    (hypothesis.assessedAtRevision ?? -1) < state.evidenceRevision;
  return {
    id: hypothesis.id,
    kind: hypothesis.kind,
    statement: hypothesis.statement,
    status: hypothesis.status,
    support: round(hypothesis.support),
    ...(hypothesis.preferenceFit !== undefined
      ? { preferenceFit: round(hypothesis.preferenceFit) }
      : {}),
    ...(stale ? { assessmentStale: true } : {}),
    ...(hypothesis.inference ? { inference: hypothesis.inference } : {}),
    ...(hypothesis.scope ? { scope: hypothesis.scope } : {}),
    ...(hypothesis.parentId
      ? { revises: hypothesis.parentId, difference: hypothesis.difference }
      : {}),
    ...(hypothesis.premiseRefs.length > 0 ? { premises: hypothesis.premiseRefs } : {}),
    ...(hypothesis.evidenceRefs.length > 0 ? { confirmedBy: hypothesis.evidenceRefs } : {}),
    ...(hypothesis.counterEvidenceRefs.length > 0
      ? { contradictedBy: hypothesis.counterEvidenceRefs }
      : {}),
    simulations: hypothesis.simulations.map((simulation) => simulation.outcome),
    critiques: hypothesis.critiques.map(
      (critique) => `[${critique.severity}] ${critique.objection}`
    ),
    ...(predictions.length > 0
      ? {
          predictions: predictions.map((prediction) => ({
            id: prediction.id,
            expected: prediction.expected,
            falsifier: prediction.falsifier,
            status: prediction.status,
            ...(prediction.evaluation?.reason ? { result: prediction.evaluation.reason } : {}),
          })),
        }
      : {}),
    ...(hypothesis.rejectionReason ? { rejectionReason: hypothesis.rejectionReason } : {}),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
