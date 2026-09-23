import { incompatibilityCategory, recordContradiction } from './contradiction-transitions.js';
import { rejectHypothesis } from './hypothesis-transitions.js';
import {
  appendObservation,
  sameStatement,
  type Hypothesis,
  type MentalState,
} from './mental-state.js';
import type { ThoughtPatch } from './thought-patch.js';

/**
 * Evidence rules applied by the reducer: where observations and facts come from, how they
 * are revised, and what comparisons and test results change. Each function returns true
 * when the evidence base changed; repeating the same evidence changes nothing.
 */

export function applyObservations(state: MentalState, patch: ThoughtPatch, step: number): boolean {
  let changed = false;
  for (const record of patch.observations) {
    changed = appendObservation(state, record, step).isNew || changed;
  }
  return changed;
}

export function applyFactChanges(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): boolean {
  // Tool facts without explicit references were read from this thought's tool observations.
  // References to a repeated observation point to its original: it is the same evidence.
  const toolObservations = state.observations
    .filter((observation) => observation.step === step && observation.sourceKind === 'tool')
    .map((observation) => observation.duplicateOf ?? observation.id);

  let changed = false;
  for (const fact of patch.addFacts) {
    const known =
      state.schemaVersion >= 2
        ? state.facts.find(
            (existing) =>
              existing.status === 'active' && sameStatement(existing.statement, fact.statement)
          )
        : undefined;
    const cited = observationRefs(state, fact.observationRefs, issues);
    if (known) {
      // The same fact read again: keep the new source as corroboration, not as a new fact.
      const sources = cited.length === 0 && fact.source === 'tool' ? toolObservations : cited;
      const corroborating = sources.filter((id) => !known.observationRefs.includes(id));
      issues.push(`fact already known as ${known.id}: ${fact.statement}`);
      if (corroborating.length > 0) {
        known.observationRefs = [...known.observationRefs, ...corroborating];
        changed = true;
      }
      continue;
    }
    state.facts.push({
      id: `F${state.facts.length + 1}`,
      statement: fact.statement,
      source: fact.source,
      confidence: fact.confidence,
      ...(fact.evidence ? { evidence: fact.evidence } : {}),
      observationRefs: cited.length === 0 && fact.source === 'tool' ? toolObservations : cited,
      status: 'active',
      step,
    });
    changed = true;
  }

  for (const revision of patch.reviseFacts) {
    const fact = state.facts.find((candidate) => candidate.id === revision.factId);
    if (!fact) {
      issues.push(`cannot revise fact ${revision.factId}: not found`);
      continue;
    }
    if (fact.status !== 'active') {
      issues.push(`cannot revise fact ${fact.id}: already ${fact.status}`);
      continue;
    }
    let replacedBy: string | undefined;
    if (revision.replacement) {
      replacedBy = `F${state.facts.length + 1}`;
      state.facts.push({
        id: replacedBy,
        statement: revision.replacement.statement,
        source: fact.source,
        confidence: fact.confidence,
        observationRefs: observationRefs(state, revision.replacement.observationRefs, issues),
        status: 'active',
        step,
      });
    }
    fact.status = replacedBy ? 'superseded' : revision.status;
    fact.revision = { reason: revision.reason, step, ...(replacedBy ? { replacedBy } : {}) };
    changed = true;
  }
  return changed;
}

/** Records comparisons; a counterexample is kept as counter-evidence of the hypothesis. */
export function applyComparisons(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): boolean {
  const evidenceIds = new Set([
    ...state.observations.map((item) => item.id),
    ...state.facts.map((item) => item.id),
  ]);
  const keep = (ids: string[]) =>
    ids.filter((id) => {
      if (evidenceIds.has(id)) return true;
      issues.push(`comparison references unknown observation or fact ${id}`);
      return false;
    });

  let changed = false;
  for (const comparison of patch.comparisons) {
    const left = keep(comparison.left);
    const right = keep(comparison.right);
    if (left.length === 0 || right.length === 0) {
      issues.push(`comparison "${comparison.aspect}" dropped: it needs two sides`);
      continue;
    }
    const hypothesis = comparison.hypothesisId
      ? liveHypothesis(state, comparison.hypothesisId, issues)
      : undefined;
    state.comparisons.push({
      id: `R${state.comparisons.length + 1}`,
      left,
      right,
      relation: comparison.relation,
      aspect: comparison.aspect,
      ...(comparison.context ? { context: comparison.context } : {}),
      rationale: comparison.rationale,
      ...(hypothesis ? { hypothesisId: hypothesis.id } : {}),
      step,
    });

    if (comparison.relation === 'counterexample' && hypothesis) {
      const added = addUnique(hypothesis.counterEvidenceRefs, left);
      const recorded = recordContradiction(state, step, {
        description: `${left.join(', ')} contradict ${hypothesis.id} (${comparison.aspect})`,
        between: [...left, hypothesis.id],
        category: 'logical_incompatibility',
      });
      changed = added || recorded || changed;
    }
    if (comparison.relation === 'incompatibility') {
      changed =
        recordContradiction(state, step, {
          description: `${left.join(', ')} and ${right.join(', ')} disagree on ${comparison.aspect}`,
          between: [...left, ...right],
          category: incompatibilityCategory(state, [...left, ...right]),
        }) || changed;
    }
  }
  return changed;
}

/**
 * Applies prediction tests. Only a prediction recorded at an earlier step can be tested,
 * once. A refuted prediction rejects its hypothesis — its falsifier was observed — and is
 * logged as a resolved `refuted_prediction` contradiction. An inconclusive test changes the
 * evidence only through what it observed.
 */
export function applyEvaluations(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): boolean {
  let changed = false;
  for (const evaluation of patch.evaluations) {
    const recorded = evaluation.observation
      ? appendObservation(state, evaluation.observation, step)
      : undefined;
    changed = recorded?.isNew || changed;

    const prediction = state.predictions.find(
      (candidate) => candidate.id === evaluation.predictionId
    );
    if (!prediction) {
      issues.push(`evaluation references unknown prediction ${evaluation.predictionId}`);
      continue;
    }
    if (prediction.status !== 'pending') {
      issues.push(`prediction ${prediction.id} was already evaluated`);
      continue;
    }
    if (prediction.step >= step) {
      issues.push(`prediction ${prediction.id} must be recorded before it is tested`);
      continue;
    }

    prediction.status = evaluation.verdict;
    prediction.evaluation = {
      verdict: evaluation.verdict,
      evaluatorId: evaluation.evaluatorId,
      evaluatorVersion: evaluation.evaluatorVersion,
      ...(recorded ? { observationId: recorded.observation.id } : {}),
      ...(evaluation.metrics ? { metrics: evaluation.metrics } : {}),
      causeCandidates: evaluation.causeCandidates,
      ...(evaluation.reason ? { reason: evaluation.reason } : {}),
      step,
    };
    if (evaluation.verdict === 'inconclusive') continue;
    changed = true;

    const hypothesis = state.hypotheses.find(
      (candidate) => candidate.id === prediction.hypothesisId
    );
    if (!hypothesis) continue;
    // A repeated observation points to the original: it is the same evidence.
    const evidence = recorded
      ? (recorded.observation.duplicateOf ?? recorded.observation.id)
      : undefined;
    if (evaluation.verdict === 'confirmed' && evidence) {
      addUnique(hypothesis.evidenceRefs, [evidence]);
    }
    if (evaluation.verdict === 'refuted') {
      if (evidence) addUnique(hypothesis.counterEvidenceRefs, [evidence]);
      if (hypothesis.status !== 'rejected') {
        const detail = evaluation.reason ? `: ${evaluation.reason}` : '';
        rejectHypothesis(hypothesis, `prediction ${prediction.id} refuted${detail}`, step);
      }
      recordContradiction(state, step, {
        description: `${prediction.id} expected "${prediction.expected}"${evaluation.reason ? `, but ${evaluation.reason}` : ''}`,
        between: [prediction.id, hypothesis.id, ...(evidence ? [evidence] : [])],
        category: 'refuted_prediction',
        resolvedBy: {
          resolution: `${hypothesis.id} rejected: its falsifier was observed`,
          action: 'retracted',
          basis: evidence ? [evidence] : [],
        },
      });
    }
  }
  return changed;
}

function observationRefs(state: MentalState, ids: string[], issues: string[]): string[] {
  const refs: string[] = [];
  for (const id of ids) {
    const observation = state.observations.find((candidate) => candidate.id === id);
    if (!observation) {
      issues.push(`fact cites unknown observation ${id}`);
      continue;
    }
    const original = observation.duplicateOf ?? observation.id;
    if (!refs.includes(original)) refs.push(original);
  }
  return refs;
}

function liveHypothesis(state: MentalState, id: string, issues: string[]): Hypothesis | undefined {
  const hypothesis = state.hypotheses.find((candidate) => candidate.id === id);
  if (!hypothesis || hypothesis.status === 'rejected') {
    issues.push(
      `comparison cannot target hypothesis ${id}: ${hypothesis ? 'rejected' : 'not found'}`
    );
    return undefined;
  }
  return hypothesis;
}

/** Adds the ids not already present; returns true when something was added. */
function addUnique(target: string[], ids: string[]): boolean {
  let added = false;
  for (const id of ids) {
    if (!target.includes(id)) {
      target.push(id);
      added = true;
    }
  }
  return added;
}
