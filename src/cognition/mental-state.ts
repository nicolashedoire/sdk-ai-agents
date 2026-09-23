import { z } from 'zod';

/**
 * Explicit mental state of a cognitive run.
 *
 * The state is never edited in place: every cognitive operation produces a `ThoughtPatch`,
 * the patch is recorded as an event, and the state is the fold of all recorded patches.
 * A run's reasoning can therefore be rebuilt, audited and replayed from its event log.
 */

const unitInterval = z.number().min(0).max(1);
const requiredText = z.string().trim().min(1);

export const factSourceSchema = z.enum(['input', 'tool', 'inference']);
export const critiqueSeveritySchema = z.enum(['minor', 'major', 'fatal']);

export const decisionSchema = z.object({
  hypothesisId: z.string().optional(),
  answer: requiredText,
  rationale: requiredText,
  confidence: unitInterval,
  nextActions: z.array(requiredText).default([]),
});

/** Delta produced by one cognitive operation. Ids of new items are assigned by the reducer. */
export const thoughtPatchSchema = z.object({
  summary: requiredText,
  addFacts: z
    .array(
      z.object({
        statement: requiredText,
        source: factSourceSchema.default('inference'),
        confidence: unitInterval.default(0.7),
        evidence: z.string().optional(),
      })
    )
    .default([]),
  addAssumptions: z
    .array(z.object({ statement: requiredText, confidence: unitInterval.default(0.5) }))
    .default([]),
  addConstraints: z.array(z.object({ statement: requiredText })).default([]),
  addUnknowns: z.array(z.object({ question: requiredText })).default([]),
  resolveUnknowns: z
    .array(z.object({ unknownId: requiredText, resolution: requiredText }))
    .default([]),
  dropUnknowns: z.array(z.object({ unknownId: requiredText, reason: requiredText })).default([]),
  addHypotheses: z
    .array(z.object({ statement: requiredText, rationale: z.string().optional() }))
    .default([]),
  simulations: z
    .array(
      z.object({
        hypothesisId: requiredText,
        steps: z.array(requiredText).min(1),
        outcome: requiredText,
        sideEffects: z.array(requiredText).default([]),
      })
    )
    .default([]),
  critiques: z
    .array(
      z.object({
        hypothesisId: requiredText,
        objection: requiredText,
        severity: critiqueSeveritySchema,
        rebuttal: z.string().optional(),
      })
    )
    .default([]),
  hypothesisUpdates: z
    .array(
      z.object({
        hypothesisId: requiredText,
        support: unitInterval.optional(),
        reject: z.boolean().optional(),
        reason: z.string().optional(),
      })
    )
    .default([]),
  addContradictions: z
    .array(z.object({ description: requiredText, between: z.array(requiredText).default([]) }))
    .default([]),
  resolveContradictions: z
    .array(z.object({ contradictionId: requiredText, resolution: requiredText }))
    .default([]),
  addFailures: z.array(z.object({ description: requiredText })).default([]),
  /** Set by the engine when an operation investigated an unknown (counts attempts). */
  investigatedUnknownId: z.string().optional(),
  /** Set by the engine on the thought recorded for an operation that failed. */
  failed: z.boolean().optional(),
  confidence: unitInterval.optional(),
  decision: decisionSchema.optional(),
});

export type ThoughtPatchInput = z.input<typeof thoughtPatchSchema>;
export type ThoughtPatch = z.output<typeof thoughtPatchSchema>;
export type Decision = z.output<typeof decisionSchema>;
export type FactSource = z.infer<typeof factSourceSchema>;
export type CritiqueSeverity = z.infer<typeof critiqueSeveritySchema>;

export interface Fact {
  id: string;
  statement: string;
  source: FactSource;
  confidence: number;
  evidence?: string;
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
  status: HypothesisStatus;
  /** Estimated support in [0, 1]; starts neutral at 0.5. */
  support: number;
  simulations: Simulation[];
  critiques: Critique[];
  rejectionReason?: string;
  createdAtStep: number;
  updatedAtStep: number;
}

export interface Contradiction {
  id: string;
  description: string;
  between: string[];
  resolved: boolean;
  resolution?: string;
  step: number;
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
  /** True when the operation failed (its thought only records the failure). */
  failed?: boolean;
}

export interface MentalState {
  goal: string;
  context?: Record<string, unknown>;
  /** Number of thoughts applied so far. */
  step: number;
  facts: Fact[];
  assumptions: Assumption[];
  constraints: Constraint[];
  unknowns: Unknown[];
  hypotheses: Hypothesis[];
  contradictions: Contradiction[];
  failures: Failure[];
  /** Overall confidence in the current best answer, in [0, 1]. */
  confidence: number;
  /** Step of the last comparison of hypotheses. */
  comparedAtStep?: number;
  decision?: Decision;
  trail: TrailEntry[];
}

export function createMentalState(goal: string, context?: Record<string, unknown>): MentalState {
  return {
    goal,
    ...(context ? { context } : {}),
    step: 0,
    facts: [],
    assumptions: [],
    constraints: [],
    unknowns: [],
    hypotheses: [],
    contradictions: [],
    failures: [],
    confidence: 0,
    trail: [],
  };
}

/** Hypotheses still in play (not rejected). */
export function activeHypotheses(state: MentalState): Hypothesis[] {
  return state.hypotheses.filter((hypothesis) => hypothesis.status !== 'rejected');
}

export function openUnknowns(state: MentalState): Unknown[] {
  return state.unknowns.filter((unknown) => unknown.status === 'open');
}

export function unresolvedContradictions(state: MentalState): Contradiction[] {
  return state.contradictions.filter((contradiction) => !contradiction.resolved);
}

/**
 * Compact, id-addressable view of the state, shared by LLM prompts and typed-decision
 * requests. Rejected hypotheses are kept (with their reason) so they are not proposed again.
 */
export function describeMentalState(state: MentalState): Record<string, unknown> {
  return {
    goal: state.goal,
    ...(state.context ? { context: state.context } : {}),
    step: state.step,
    confidence: round(state.confidence),
    facts: state.facts.map((fact) => ({
      id: fact.id,
      statement: fact.statement,
      source: fact.source,
      confidence: round(fact.confidence),
    })),
    assumptions: state.assumptions.map((assumption) => ({
      id: assumption.id,
      statement: assumption.statement,
      confidence: round(assumption.confidence),
    })),
    constraints: state.constraints.map((constraint) => ({
      id: constraint.id,
      statement: constraint.statement,
    })),
    unknowns: state.unknowns.map((unknown) => ({
      id: unknown.id,
      question: unknown.question,
      status: unknown.status,
      ...(unknown.resolution ? { resolution: unknown.resolution } : {}),
    })),
    hypotheses: state.hypotheses.map((hypothesis) => ({
      id: hypothesis.id,
      statement: hypothesis.statement,
      status: hypothesis.status,
      support: round(hypothesis.support),
      simulations: hypothesis.simulations.map((simulation) => simulation.outcome),
      critiques: hypothesis.critiques.map(
        (critique) => `[${critique.severity}] ${critique.objection}`
      ),
      ...(hypothesis.rejectionReason ? { rejectionReason: hypothesis.rejectionReason } : {}),
    })),
    contradictions: unresolvedContradictions(state).map((contradiction) => ({
      id: contradiction.id,
      description: contradiction.description,
      between: contradiction.between,
    })),
    failures: state.failures.map((failure) => `${failure.operation}: ${failure.description}`),
    recentOperations: state.trail.slice(-5).map((entry) => entry.operation),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
