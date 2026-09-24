import type {
  ComparisonRelation,
  ContradictionCategory,
  CritiqueSeverity,
  Decision,
  FactSource,
  HypothesisKind,
  InferenceKind,
  ObservationRecord,
  OutcomeVerdict,
  RecalledKnowledgeRecord,
  ResolutionAction,
} from './thought-patch.js';

/**
 * Explicit mental state of a cognitive run.
 *
 * The state is never edited in place: every cognitive operation produces a `ThoughtPatch`,
 * the patch is recorded as an event, and the state is the fold of all recorded patches.
 * A run's reasoning can therefore be rebuilt, audited and replayed from its event log.
 */

/**
 * Version of the reasoning rules a run was recorded with. Version 1 runs (before evidence
 * tracking) are rebuilt with their original rules; new runs use version 2.
 */
export type SchemaVersion = 1 | 2;
export const CURRENT_SCHEMA_VERSION: SchemaVersion = 2;

/** Something the run observed, with its provenance. Recorded by the engine, never the model. */
export interface Observation extends ObservationRecord {
  id: string;
  /** Step that recorded it; 0 for observations given with the problem. */
  step: number;
  /** Earlier observation with the same content from the same origin: it adds no weight. */
  duplicateOf?: string;
}

export type FactStatus = 'active' | 'superseded' | 'retracted';

export interface Fact {
  id: string;
  statement: string;
  source: FactSource;
  confidence: number;
  evidence?: string;
  /** Observations the fact was read from. */
  observationRefs: string[];
  status: FactStatus;
  /** Why the fact is no longer active, and what replaced it. */
  revision?: { reason: string; step: number; replacedBy?: string };
  step: number;
}

export interface Assumption {
  id: string;
  statement: string;
  confidence: number;
  step: number;
}

export interface Constraint {
  id: string;
  statement: string;
  step: number;
}

export type UnknownStatus = 'open' | 'resolved' | 'dropped';

export interface Unknown {
  id: string;
  question: string;
  status: UnknownStatus;
  resolution?: string;
  attempts: number;
  step: number;
}

export interface Simulation {
  steps: string[];
  outcome: string;
  sideEffects: string[];
  step: number;
}

export interface Critique {
  objection: string;
  severity: CritiqueSeverity;
  rebuttal?: string;
  step: number;
}

export type HypothesisStatus = 'proposed' | 'simulated' | 'critiqued' | 'rejected' | 'selected';

export interface Hypothesis {
  id: string;
  statement: string;
  rationale?: string;
  kind: HypothesisKind;
  inference?: InferenceKind;
  status: HypothesisStatus;
  /** How well the evidence supports it, in [0, 1]; starts neutral at 0.5. Preferences never change it. */
  support: number;
  /** How well a proposal suits the thinker, in [0, 1]. Only ranks actions. */
  preferenceFit?: number;
  /** Evidence revision at which `support` was last judged. */
  assessedAtRevision?: number;
  /** References the last assessment relied on. */
  assessmentBasis?: string[];
  /** Observations, facts or assumptions it was inferred from. */
  premiseRefs: string[];
  /** Observations that confirmed its predictions. */
  evidenceRefs: string[];
  /** Observations that contradict it. */
  counterEvidenceRefs: string[];
  scope?: string;
  /** Hypothesis this one revises. */
  parentId?: string;
  /** What changed compared with the parent. */
  difference?: string;
  simulations: Simulation[];
  critiques: Critique[];
  rejectionReason?: string;
  createdAtStep: number;
  updatedAtStep: number;
}

/** A relation the reasoning found between observations or facts. */
export interface ObservationComparison {
  id: string;
  left: string[];
  right: string[];
  relation: ComparisonRelation;
  aspect: string;
  context?: string;
  rationale: string;
  hypothesisId?: string;
  step: number;
}

export type PredictionStatus = 'pending' | OutcomeVerdict;

export interface PredictionEvaluation {
  verdict: OutcomeVerdict;
  evaluatorId: string;
  evaluatorVersion: string;
  observationId?: string;
  metrics?: Record<string, number>;
  causeCandidates: string[];
  reason?: string;
  step: number;
}

/** A consequence of a hypothesis, recorded before it is tested. */
export interface Prediction {
  id: string;
  hypothesisId: string;
  expected: string;
  falsifier: string;
  context?: string;
  test?: Record<string, unknown>;
  status: PredictionStatus;
  evaluation?: PredictionEvaluation;
  step: number;
}

export interface Contradiction {
  id: string;
  description: string;
  between: string[];
  category?: ContradictionCategory;
  resolved: boolean;
  resolution?: string;
  resolutionAction?: ResolutionAction;
  /** Observations or facts that justify the resolution. */
  resolutionBasis?: string[];
  step: number;
}

/** Knowledge recalled from earlier runs (`M1`…): what real tests confirmed or refuted. */
export interface RememberedKnowledge extends RecalledKnowledgeRecord {
  id: string;
}

export interface Failure {
  id: string;
  operation: string;
  description: string;
  step: number;
}

export interface TrailEntry {
  step: number;
  operation: string;
  summary: string;
  /** True when the operation failed or changed nothing it was meant to change. */
  failed?: boolean;
  /** Evidence revision after the step (schema version 2). */
  revision?: number;
  /**
   * True when the step brought new evidence: any evidence change for a step that succeeded,
   * only engine records (observations, test results) for a step that failed.
   */
  newEvidence?: boolean;
}

/** Rules the conclusion guard applies. Recorded with the run so a rebuild applies the same ones. */
export interface CommitRules {
  /**
   * Minimum evidence support of a committed answer, except a proposal the thinker clearly
   * prefers (see `minProposalSupport`); also the fit that makes a proposal clearly preferred.
   */
  decisionThreshold: number;
  /** Predictions that may be tested in the run; 0 when no evaluator is configured. */
  maxPredictionTests: number;
  /** Weight of the thinker's preferences when ranking proposals (never for rules or explanations). */
  preferenceWeight: number;
  /**
   * When set, a proposal (a choice of action) the thinker clearly prefers — `preferenceFit` at
   * least `decisionThreshold` — may be committed with evidence support down to this floor.
   * Absent from runs recorded before the rule existed, which keep the evidence-only rule.
   */
  minProposalSupport?: number;
}

export const DEFAULT_COMMIT_RULES: CommitRules = {
  decisionThreshold: 0.75,
  maxPredictionTests: 0,
  preferenceWeight: 0.4,
};

export interface MentalState {
  schemaVersion: SchemaVersion;
  goal: string;
  context?: Record<string, unknown>;
  /** Number of thoughts applied so far. */
  step: number;
  observations: Observation[];
  facts: Fact[];
  assumptions: Assumption[];
  constraints: Constraint[];
  unknowns: Unknown[];
  hypotheses: Hypothesis[];
  comparisons: ObservationComparison[];
  predictions: Prediction[];
  contradictions: Contradiction[];
  failures: Failure[];
  /** What earlier runs established with real tests, recalled when the run started. */
  knowledge: RememberedKnowledge[];
  /** Confidence in the current best answer, in [0, 1]. */
  confidence: number;
  /** Increments whenever the evidence changes; older assessments become stale. */
  evidenceRevision: number;
  /** Step of the last comparison of hypotheses. */
  comparedAtStep?: number;
  /** Evidence revision covered by the last comparison of hypotheses. */
  comparedAtRevision?: number;
  /** Number of comparable observations covered by the last comparison of observations. */
  observationsCompared: number;
  commitRules: CommitRules;
  decision?: Decision;
  trail: TrailEntry[];
}

export interface MentalStateOptions {
  schemaVersion?: SchemaVersion;
  /** Observations given with the problem. */
  observations?: ObservationRecord[];
  commitRules?: Partial<CommitRules>;
  /** Knowledge recalled from earlier runs, in the order it is shown (ids `M1`…). */
  knowledge?: RecalledKnowledgeRecord[];
}

export function createMentalState(
  goal: string,
  context?: Record<string, unknown>,
  options: MentalStateOptions = {}
): MentalState {
  const state: MentalState = {
    schemaVersion: options.schemaVersion ?? CURRENT_SCHEMA_VERSION,
    goal,
    ...(context ? { context } : {}),
    step: 0,
    observations: [],
    facts: [],
    assumptions: [],
    constraints: [],
    unknowns: [],
    hypotheses: [],
    comparisons: [],
    predictions: [],
    contradictions: [],
    failures: [],
    knowledge: (options.knowledge ?? []).map((item, index) => ({ ...item, id: `M${index + 1}` })),
    confidence: 0,
    evidenceRevision: 0,
    observationsCompared: 0,
    commitRules: { ...DEFAULT_COMMIT_RULES, ...options.commitRules },
    trail: [],
  };
  for (const record of options.observations ?? []) {
    appendObservation(state, record, 0);
  }
  return state;
}

/**
 * Adds an observation to a state being built. An observation with the same content and
 * origin as an earlier one is kept for the record but marked as a duplicate.
 */
export function appendObservation(
  state: MentalState,
  record: ObservationRecord,
  step: number
): { observation: Observation; isNew: boolean } {
  const original = state.observations.find(
    (existing) =>
      existing.fingerprint === record.fingerprint && existing.originGroup === record.originGroup
  );
  const observation: Observation = {
    ...record,
    id: `O${state.observations.length + 1}`,
    step,
    ...(original ? { duplicateOf: original.duplicateOf ?? original.id } : {}),
  };
  state.observations.push(observation);
  return { observation, isNew: !original };
}

/** True when two statements say the same thing, ignoring case, punctuation and spacing. */
export function sameStatement(left: string, right: string): boolean {
  return normalizeStatement(left) === normalizeStatement(right);
}

/** Lower-case words only: two wordings that differ by case or punctuation are the same statement. */
export function normalizeStatement(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Hypotheses still in play (not rejected). */
export function activeHypotheses(state: MentalState): Hypothesis[] {
  return state.hypotheses.filter((hypothesis) => hypothesis.status !== 'rejected');
}

export function activeFacts(state: MentalState): Fact[] {
  return state.facts.filter((fact) => fact.status === 'active');
}

export function openUnknowns(state: MentalState): Unknown[] {
  return state.unknowns.filter((unknown) => unknown.status === 'open');
}

export function unresolvedContradictions(state: MentalState): Contradiction[] {
  return state.contradictions.filter((contradiction) => !contradiction.resolved);
}

/** Observations from the problem or from tools that are not repetitions. */
export function comparableObservations(state: MentalState): Observation[] {
  return state.observations.filter(
    (observation) => observation.sourceKind !== 'evaluation' && !observation.duplicateOf
  );
}

/** Pending predictions of hypotheses still in play. */
export function pendingPredictions(state: MentalState): Prediction[] {
  const live = new Set(activeHypotheses(state).map((hypothesis) => hypothesis.id));
  return state.predictions.filter(
    (prediction) => prediction.status === 'pending' && live.has(prediction.hypothesisId)
  );
}

/** Predictions tests still allowed in the run. */
export function predictionTestsLeft(state: MentalState): number {
  const done = state.predictions.filter((prediction) => prediction.evaluation).length;
  return Math.max(0, state.commitRules.maxPredictionTests - done);
}

/** Every id an item of the state can be referenced by. */
export function knownReferences(state: MentalState): Set<string> {
  return new Set<string>([
    ...state.observations.map((item) => item.id),
    ...state.facts.map((item) => item.id),
    ...state.assumptions.map((item) => item.id),
    ...state.constraints.map((item) => item.id),
    ...state.unknowns.map((item) => item.id),
    ...state.hypotheses.map((item) => item.id),
    ...state.comparisons.map((item) => item.id),
    ...state.predictions.map((item) => item.id),
    ...state.knowledge.map((item) => item.id),
  ]);
}
