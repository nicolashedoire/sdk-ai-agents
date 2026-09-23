import { applyDecision, applyHypothesisChanges } from './hypothesis-transitions.js';
import type { Contradiction, MentalState, ThoughtPatch } from './mental-state.js';

export interface ThoughtApplication {
  state: MentalState;
  /** References the reducer ignored (unknown ids, forbidden transitions). */
  issues: string[];
}

/**
 * Applies one thought to the state. Pure and deterministic: ids are derived from the
 * existing items, so folding the same patches always rebuilds the same state.
 *
 * Invariants enforced here rather than trusted to the model:
 * - a fatal critique without rebuttal rejects its hypothesis;
 * - a rejected hypothesis cannot be revived or selected;
 * - references to unknown ids are ignored and reported as issues.
 */
export function applyThought(
  previous: MentalState,
  operation: string,
  patch: ThoughtPatch
): ThoughtApplication {
  const step = previous.step + 1;
  const issues: string[] = [];
  const state: MentalState = {
    ...previous,
    step,
    facts: [...previous.facts],
    assumptions: [...previous.assumptions],
    constraints: [...previous.constraints],
    unknowns: previous.unknowns.map((unknown) => ({ ...unknown })),
    hypotheses: previous.hypotheses.map((hypothesis) => ({
      ...hypothesis,
      simulations: [...hypothesis.simulations],
      critiques: [...hypothesis.critiques],
    })),
    contradictions: previous.contradictions.map((contradiction) => ({ ...contradiction })),
    failures: [...previous.failures],
    trail: [
      ...previous.trail,
      { step, operation, summary: patch.summary, ...(patch.failed ? { failed: true } : {}) },
    ],
  };

  for (const fact of patch.addFacts) {
    state.facts.push({
      id: `F${state.facts.length + 1}`,
      statement: fact.statement,
      source: fact.source,
      confidence: fact.confidence,
      ...(fact.evidence ? { evidence: fact.evidence } : {}),
      step,
    });
  }
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
  applyHypothesisChanges(state, patch, step, issues);
  applyContradictionChanges(state, patch, step, issues);

  for (const failure of patch.addFailures) {
    state.failures.push({
      id: `X${state.failures.length + 1}`,
      operation,
      description: failure.description,
      step,
    });
  }

  if (operation === 'compare') {
    state.comparedAtStep = step;
  }
  if (patch.confidence !== undefined) {
    state.confidence = patch.confidence;
  }
  if (patch.decision) {
    state.decision = applyDecision(state, patch.decision, step, issues);
    state.confidence = state.decision.confidence;
  }

  return { state, issues };
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

function applyContradictionChanges(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): void {
  const knownIds = new Set<string>([
    ...state.facts.map((item) => item.id),
    ...state.assumptions.map((item) => item.id),
    ...state.constraints.map((item) => item.id),
    ...state.unknowns.map((item) => item.id),
    ...state.hypotheses.map((item) => item.id),
  ]);

  for (const contradiction of patch.addContradictions) {
    const between = contradiction.between.filter((id) => {
      if (knownIds.has(id)) return true;
      issues.push(`contradiction references unknown id ${id}`);
      return false;
    });
    const created: Contradiction = {
      id: `C${state.contradictions.length + 1}`,
      description: contradiction.description,
      between,
      resolved: false,
      step,
    };
    state.contradictions.push(created);
  }

  for (const resolution of patch.resolveContradictions) {
    const contradiction = state.contradictions.find(
      (item) => item.id === resolution.contradictionId
    );
    if (!contradiction) {
      issues.push(`cannot resolve contradiction ${resolution.contradictionId}: not found`);
      continue;
    }
    contradiction.resolved = true;
    contradiction.resolution = resolution.resolution;
  }
}
