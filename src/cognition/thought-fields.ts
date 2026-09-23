import type { CognitiveOperation } from './cognitive-operations.js';
import type { ENGINE_FIELDS, ThoughtPatch } from './thought-patch.js';

/**
 * Operations produced by a thought generator. `integrate` digests a tool observation;
 * `seek_information` and `test_prediction` are performed by the engine itself.
 */
export type GeneratedOperation =
  | Exclude<CognitiveOperation, 'seek_information' | 'test_prediction'>
  | 'integrate';

type EngineField = (typeof ENGINE_FIELDS)[number];

/** Patch fields a model may write (the engine writes provenance and test results). */
export type ModelField = Exclude<keyof ThoughtPatch, 'summary' | EngineField>;

/** Fields each operation may write. Anything else in a model reply is ignored. */
export const ALLOWED_FIELDS: Record<GeneratedOperation, readonly ModelField[]> = {
  represent: [
    'addFacts',
    'reviseFacts',
    'addAssumptions',
    'addConstraints',
    'addUnknowns',
    'addContradictions',
    'resolveContradictions',
  ],
  compare_observations: ['comparisons', 'addUnknowns', 'addContradictions'],
  hypothesize: ['addHypotheses', 'addAssumptions', 'addUnknowns'],
  simulate: ['simulations', 'predictions', 'addUnknowns', 'addContradictions'],
  revise: ['addHypotheses', 'hypothesisUpdates', 'addUnknowns', 'resolveContradictions'],
  critique: ['critiques', 'hypothesisUpdates', 'addUnknowns', 'addContradictions'],
  integrate: [
    'addFacts',
    'reviseFacts',
    'resolveUnknowns',
    'dropUnknowns',
    'addContradictions',
    'resolveContradictions',
    'hypothesisUpdates',
  ],
  compare: ['hypothesisUpdates', 'resolveContradictions'],
  decide: ['decision'],
};

/** Field that must be non-empty for the thought to be useful. */
export const REQUIRED_FIELD: Partial<Record<GeneratedOperation, ModelField>> = {
  compare_observations: 'comparisons',
  hypothesize: 'addHypotheses',
  simulate: 'simulations',
  revise: 'addHypotheses',
  critique: 'critiques',
  compare: 'hypothesisUpdates',
  decide: 'decision',
};

const REFS = '["O1", "F2"]';

export const FIELD_SPECS: Record<ModelField, string> = {
  addFacts: `"addFacts": [{ "statement": string, "source": "input" | "tool" | "inference", "confidence": number, "evidence"?: string, "observationRefs"?: ${REFS} }]`,
  reviseFacts:
    '"reviseFacts": [{ "factId": "F1", "status": "retracted" | "superseded", "reason": string, "replacement"?: { "statement": string, "observationRefs"?: ["O2"] } }]',
  addAssumptions: '"addAssumptions": [{ "statement": string, "confidence": number }]',
  addConstraints: '"addConstraints": [{ "statement": string }]',
  addUnknowns: '"addUnknowns": [{ "question": string }]',
  resolveUnknowns: '"resolveUnknowns": [{ "unknownId": "U1", "resolution": string }]',
  dropUnknowns: '"dropUnknowns": [{ "unknownId": "U1", "reason": string }]',
  comparisons:
    '"comparisons": [{ "left": ["O1"], "right": ["O2"], "relation": "similarity" | "difference" | "evolution" | "incompatibility" | "counterexample", "aspect": string, "context"?: string, "rationale": string, "hypothesisId"?: "H1" }]',
  addHypotheses: `"addHypotheses": [{ "statement": string, "rationale": string, "kind": "proposal" | "rule" | "explanation", "inference"?: "induction" | "abduction" | "deduction", "premiseRefs"?: ${REFS}, "scope"?: string, "parentId"?: "H1", "difference"?: string }]`,
  simulations:
    '"simulations": [{ "hypothesisId": "H1", "steps": [string], "outcome": string, "sideEffects": [string] }]',
  predictions:
    '"predictions": [{ "hypothesisId": "H1", "expected": string, "falsifier": string, "context"?: string, "test"?: object }]',
  critiques:
    '"critiques": [{ "hypothesisId": "H1", "objection": string, "severity": "minor" | "major" | "fatal", "rebuttal"?: string }]',
  hypothesisUpdates: `"hypothesisUpdates": [{ "hypothesisId": "H1", "support"?: number, "preferenceFit"?: number, "basisRefs"?: ${REFS}, "reject"?: boolean, "reason"?: string }]`,
  addContradictions:
    '"addContradictions": [{ "description": string, "between": ["F1", "H2"], "category"?: "source_disagreement" | "temporal_change" | "context_difference" | "logical_incompatibility" | "refuted_prediction" }]',
  resolveContradictions: `"resolveContradictions": [{ "contradictionId": "C1", "resolution": string, "action": "retracted" | "restricted" | "replaced" | "explained", "basisRefs": ${REFS} }]`,
  confidence: '"confidence": number',
  decision:
    '"decision": { "hypothesisId"?: "H1", "answer": string, "rationale": string, "confidence": number, "nextActions": [string] }',
};
