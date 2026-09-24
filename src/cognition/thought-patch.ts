import { z } from 'zod';

/**
 * Contract of a thought: the delta one cognitive operation applies to the mental state.
 * Ids of new items are assigned by the reducer. Fields marked "engine" are written by the
 * engine only; a model reply that contains them is stripped before it is applied.
 */

const unitInterval = z.number().min(0).max(1);
const requiredText = z.string().trim().min(1);
const references = z.array(requiredText).default([]);

export const factSourceSchema = z.enum(['input', 'tool', 'inference']);
export const critiqueSeveritySchema = z.enum(['minor', 'major', 'fatal']);

/** A proposal answers the goal; a rule generalizes; an explanation names a cause. */
export const hypothesisKindSchema = z.enum(['proposal', 'rule', 'explanation']);
/** Induction generalizes from cases, abduction explains, deduction derives from premises. */
export const inferenceKindSchema = z.enum(['induction', 'abduction', 'deduction']);

export const comparisonRelationSchema = z.enum([
  'similarity',
  'difference',
  'evolution',
  'incompatibility',
  'counterexample',
]);

export const contradictionCategorySchema = z.enum([
  'source_disagreement',
  'temporal_change',
  'context_difference',
  'logical_incompatibility',
  'refuted_prediction',
]);

export const resolutionActionSchema = z.enum(['retracted', 'restricted', 'replaced', 'explained']);
export const outcomeVerdictSchema = z.enum(['confirmed', 'refuted', 'inconclusive']);
export const decisionStatusSchema = z.enum(['committed', 'provisional', 'abstain']);
export const observationSourceKindSchema = z.enum(['input', 'tool', 'evaluation']);

/** Observation as recorded by the engine, before the reducer gives it an id. */
export const observationRecordSchema = z.object({
  sourceKind: observationSourceKindSchema,
  /** Tool name or evaluator id. */
  source: z.string().optional(),
  /** Event holding the full payload (`action.executed`, `cognition.evaluated`). */
  sourceEventId: z.string().optional(),
  observedAt: z.number(),
  context: z.string().optional(),
  /** Bounded, human-readable form of what was observed. */
  summary: requiredText,
  /** Hash of the full observed content. */
  fingerprint: requiredText,
  /** Observations sharing an origin are not independent confirmations. */
  originGroup: requiredText,
});

/**
 * Knowledge an earlier run established with real tests, as recalled at the start of a run.
 * Recorded in `cognition.started`, so a rebuild never reads the knowledge store again.
 */
export const recalledKnowledgeSchema = z.object({
  /** Stable id of the item in the knowledge store. */
  itemId: requiredText,
  statement: requiredText,
  kind: z.enum(['rule', 'explanation']),
  scope: z.string().optional(),
  /** `contested` when earlier tests both confirmed and refuted it. */
  status: z.enum(['verified', 'refuted', 'contested']),
  confirmations: z.number().int().min(0),
  refutations: z.number().int().min(0),
  /** Short lines: what was expected and what was observed in the latest tests. */
  evidence: z.array(z.string()).default([]),
});

export const evaluationRecordSchema = z.object({
  predictionId: requiredText,
  verdict: outcomeVerdictSchema,
  evaluatorId: requiredText,
  evaluatorVersion: requiredText,
  observation: observationRecordSchema.optional(),
  metrics: z.record(z.number()).optional(),
  /** Candidate causes of a mismatch: proposals until they are tested. */
  causeCandidates: z.array(requiredText).default([]),
  reason: z.string().optional(),
});

export const decisionSchema = z.object({
  hypothesisId: z.string().optional(),
  answer: requiredText,
  rationale: requiredText,
  confidence: unitInterval,
  nextActions: z.array(requiredText).default([]),
  /** Engine: set from the decision readiness check. */
  status: decisionStatusSchema.optional(),
  /** Engine: what prevented a committed decision. */
  missing: z.array(requiredText).optional(),
});

export const thoughtPatchSchema = z.object({
  summary: requiredText,
  addFacts: z
    .array(
      z.object({
        statement: requiredText,
        source: factSourceSchema.default('inference'),
        confidence: unitInterval.default(0.7),
        evidence: z.string().optional(),
        /** Observations the fact was read from. */
        observationRefs: references,
      })
    )
    .default([]),
  reviseFacts: z
    .array(
      z.object({
        factId: requiredText,
        status: z.enum(['retracted', 'superseded']),
        reason: requiredText,
        /** New statement that supersedes the fact. */
        replacement: z.object({ statement: requiredText, observationRefs: references }).optional(),
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
  comparisons: z
    .array(
      z.object({
        left: z.array(requiredText).min(1),
        right: z.array(requiredText).min(1),
        relation: comparisonRelationSchema,
        /** Property or dimension being compared. */
        aspect: requiredText,
        context: z.string().optional(),
        rationale: requiredText,
        /** Rule or explanation that a counterexample contradicts. */
        hypothesisId: z.string().optional(),
      })
    )
    .default([]),
  addHypotheses: z
    .array(
      z.object({
        statement: requiredText,
        rationale: z.string().optional(),
        kind: hypothesisKindSchema.default('proposal'),
        inference: inferenceKindSchema.optional(),
        /** Observations, facts or assumptions the hypothesis rests on. */
        premiseRefs: references,
        /** Where the hypothesis is claimed to hold. */
        scope: z.string().optional(),
        /** Hypothesis this one revises. */
        parentId: z.string().optional(),
        /** What changed compared with the parent. */
        difference: z.string().optional(),
      })
    )
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
  predictions: z
    .array(
      z.object({
        hypothesisId: requiredText,
        expected: requiredText,
        /** Observation that would prove the hypothesis wrong. */
        falsifier: requiredText,
        context: z.string().optional(),
        /** Structured parameters a domain evaluator needs to run the test. */
        test: z.record(z.unknown()).optional(),
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
        /** How well the evidence supports the hypothesis, regardless of preferences. */
        support: unitInterval.optional(),
        /** How well a proposal suits the thinker. Never changes its support. */
        preferenceFit: unitInterval.optional(),
        basisRefs: references,
        reject: z.boolean().optional(),
        reason: z.string().optional(),
      })
    )
    .default([]),
  addContradictions: z
    .array(
      z.object({
        description: requiredText,
        between: z.array(requiredText).default([]),
        category: contradictionCategorySchema.optional(),
      })
    )
    .default([]),
  resolveContradictions: z
    .array(
      z.object({
        contradictionId: requiredText,
        resolution: requiredText,
        action: resolutionActionSchema.optional(),
        /** Observations or facts that justify the resolution. */
        basisRefs: references,
      })
    )
    .default([]),
  addFailures: z.array(z.object({ description: requiredText })).default([]),
  /** Engine: observations made during the operation (tool results). */
  observations: z.array(observationRecordSchema).default([]),
  /** Engine: results of prediction tests. */
  evaluations: z.array(evaluationRecordSchema).default([]),
  /** Engine: set when an operation investigated an unknown (counts attempts). */
  investigatedUnknownId: z.string().optional(),
  /** Engine: set on the thought recorded for an operation that failed. */
  failed: z.boolean().optional(),
  /** Confidence claimed by the model. Only legacy (v1) runs use it as the state confidence. */
  confidence: unitInterval.optional(),
  decision: decisionSchema.optional(),
});

export type ThoughtPatchInput = z.input<typeof thoughtPatchSchema>;
export type ThoughtPatch = z.output<typeof thoughtPatchSchema>;
export type Decision = z.output<typeof decisionSchema>;
export type DecisionStatus = z.infer<typeof decisionStatusSchema>;
export type FactSource = z.infer<typeof factSourceSchema>;
export type CritiqueSeverity = z.infer<typeof critiqueSeveritySchema>;
export type HypothesisKind = z.infer<typeof hypothesisKindSchema>;
export type InferenceKind = z.infer<typeof inferenceKindSchema>;
export type ComparisonRelation = z.infer<typeof comparisonRelationSchema>;
export type ContradictionCategory = z.infer<typeof contradictionCategorySchema>;
export type ResolutionAction = z.infer<typeof resolutionActionSchema>;
export type OutcomeVerdict = z.infer<typeof outcomeVerdictSchema>;
export type ObservationSourceKind = z.infer<typeof observationSourceKindSchema>;
export type ObservationRecord = z.output<typeof observationRecordSchema>;
export type EvaluationRecord = z.output<typeof evaluationRecordSchema>;
export type RecalledKnowledgeRecord = z.output<typeof recalledKnowledgeSchema>;

/** Patch fields only the engine may write. */
export const ENGINE_FIELDS = [
  'observations',
  'evaluations',
  'investigatedUnknownId',
  'failed',
  'addFailures',
] as const satisfies readonly (keyof ThoughtPatch)[];
