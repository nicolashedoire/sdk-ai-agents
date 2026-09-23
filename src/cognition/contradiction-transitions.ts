import {
  knownReferences,
  sameStatement,
  type Contradiction,
  type MentalState,
} from './mental-state.js';
import type { ContradictionCategory, ResolutionAction, ThoughtPatch } from './thought-patch.js';

/**
 * Contradiction rules applied by the reducer. From schema version 2 on, a contradiction is
 * resolved only once, and only by citing the observations or facts that settle it: it does
 * not disappear because a sentence says it is resolved.
 */
export function applyContradictionChanges(
  state: MentalState,
  patch: ThoughtPatch,
  step: number,
  issues: string[]
): boolean {
  const known = knownReferences(state);
  let added = false;
  for (const contradiction of patch.addContradictions) {
    const between = contradiction.between.filter((id) => {
      if (known.has(id)) return true;
      issues.push(`contradiction references unknown id ${id}`);
      return false;
    });
    const repeated =
      state.schemaVersion >= 2
        ? state.contradictions.find(
            (item) =>
              !item.resolved &&
              sameStatement(item.description, contradiction.description) &&
              [...item.between].sort().join(',') === [...between].sort().join(',')
          )
        : undefined;
    if (repeated) {
      issues.push(`contradiction already recorded as ${repeated.id}`);
      continue;
    }
    added = true;
    addContradiction(state, step, {
      description: contradiction.description,
      between,
      ...(contradiction.category ? { category: contradiction.category } : {}),
    });
  }

  let resolved = false;
  for (const resolution of patch.resolveContradictions) {
    const contradiction = state.contradictions.find(
      (item) => item.id === resolution.contradictionId
    );
    if (!contradiction) {
      issues.push(`cannot resolve contradiction ${resolution.contradictionId}: not found`);
      continue;
    }
    if (state.schemaVersion < 2) {
      contradiction.resolved = true;
      contradiction.resolution = resolution.resolution;
      resolved = true;
      continue;
    }
    if (contradiction.resolved) {
      issues.push(`contradiction ${contradiction.id} is already resolved`);
      continue;
    }
    const basis = evidenceBasis(state, resolution.basisRefs, contradiction.id, issues);
    if (basis.length === 0) {
      issues.push(
        `cannot resolve contradiction ${contradiction.id}: cite the observations or facts that resolve it`
      );
      continue;
    }
    resolve(contradiction, {
      resolution: resolution.resolution,
      action: resolution.action ?? 'explained',
      basis,
    });
    resolved = true;
  }
  return added || resolved;
}

/**
 * Adds a contradiction found by the engine (a counterexample, an incompatibility, a refuted
 * prediction), unless the same one was already recorded.
 */
export function recordContradiction(
  state: MentalState,
  step: number,
  input: {
    description: string;
    between: string[];
    category: ContradictionCategory;
    resolvedBy?: { resolution: string; action: ResolutionAction; basis: string[] };
  }
): boolean {
  const key = [...input.between].sort().join(',');
  const known = state.contradictions.some(
    (item) => item.category === input.category && [...item.between].sort().join(',') === key
  );
  if (known) {
    return false;
  }
  const contradiction = addContradiction(state, step, input);
  if (input.resolvedBy) {
    resolve(contradiction, input.resolvedBy);
  }
  return true;
}

/** Observations from different origins that disagree are a source disagreement. */
export function incompatibilityCategory(state: MentalState, ids: string[]): ContradictionCategory {
  const origins = new Set(
    state.observations
      .filter((observation) => ids.includes(observation.id))
      .map((observation) => observation.originGroup)
  );
  return origins.size > 1 ? 'source_disagreement' : 'logical_incompatibility';
}

function addContradiction(
  state: MentalState,
  step: number,
  input: { description: string; between: string[]; category?: ContradictionCategory }
): Contradiction {
  const contradiction: Contradiction = {
    id: `C${state.contradictions.length + 1}`,
    description: input.description,
    between: input.between,
    ...(input.category ? { category: input.category } : {}),
    resolved: false,
    step,
  };
  state.contradictions.push(contradiction);
  return contradiction;
}

function resolve(
  contradiction: Contradiction,
  input: { resolution: string; action: ResolutionAction; basis: string[] }
): void {
  contradiction.resolved = true;
  contradiction.resolution = input.resolution;
  contradiction.resolutionAction = input.action;
  contradiction.resolutionBasis = input.basis;
}

/** Only observations and facts are evidence; other references are reported and dropped. */
function evidenceBasis(
  state: MentalState,
  refs: string[],
  contradictionId: string,
  issues: string[]
): string[] {
  const evidence = new Set([
    ...state.observations.map((observation) => observation.id),
    ...state.facts.map((fact) => fact.id),
  ]);
  return refs.filter((ref) => {
    if (evidence.has(ref)) return true;
    issues.push(
      `resolution of ${contradictionId} cites ${ref}, which is not an observation or a fact`
    );
    return false;
  });
}
