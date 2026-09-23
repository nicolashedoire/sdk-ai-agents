import { OPERATION_DESCRIPTIONS, type CognitiveOperation } from './cognitive-operations.js';
import {
  activeHypotheses,
  describeMentalState,
  type MentalState,
  type ThoughtPatch,
} from './mental-state.js';
import { renderProfile, type ThinkerProfile } from './thinker-profile.js';

/** Operations produced by a thought generator (`integrate` digests a tool observation). */
export type GeneratedOperation = Exclude<CognitiveOperation, 'seek_information'> | 'integrate';

export interface Observation {
  unknownId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result: unknown;
}

type PatchField = Exclude<keyof ThoughtPatch, 'summary'>;

/** Fields each operation may write. Anything else in a model reply is ignored. */
export const ALLOWED_FIELDS: Record<GeneratedOperation, readonly PatchField[]> = {
  represent: [
    'addFacts',
    'addAssumptions',
    'addConstraints',
    'addUnknowns',
    'addContradictions',
    'resolveContradictions',
    'confidence',
  ],
  hypothesize: ['addHypotheses', 'addAssumptions', 'addUnknowns', 'confidence'],
  simulate: ['simulations', 'addUnknowns', 'addContradictions', 'confidence'],
  critique: ['critiques', 'hypothesisUpdates', 'addUnknowns', 'addContradictions', 'confidence'],
  integrate: [
    'addFacts',
    'resolveUnknowns',
    'dropUnknowns',
    'addContradictions',
    'resolveContradictions',
    'hypothesisUpdates',
    'confidence',
  ],
  compare: ['hypothesisUpdates', 'resolveContradictions', 'confidence'],
  decide: ['decision', 'confidence'],
};

/** Field that must be non-empty for the thought to be useful. */
export const REQUIRED_FIELD: Partial<Record<GeneratedOperation, PatchField>> = {
  hypothesize: 'addHypotheses',
  simulate: 'simulations',
  critique: 'critiques',
  compare: 'hypothesisUpdates',
  decide: 'decision',
};

const FIELD_SPECS: Record<PatchField, string> = {
  addFacts:
    '"addFacts": [{ "statement": string, "source": "input" | "tool" | "inference", "confidence": number, "evidence"?: string }]',
  addAssumptions: '"addAssumptions": [{ "statement": string, "confidence": number }]',
  addConstraints: '"addConstraints": [{ "statement": string }]',
  addUnknowns: '"addUnknowns": [{ "question": string }]',
  resolveUnknowns: '"resolveUnknowns": [{ "unknownId": "U1", "resolution": string }]',
  dropUnknowns: '"dropUnknowns": [{ "unknownId": "U1", "reason": string }]',
  addHypotheses: '"addHypotheses": [{ "statement": string, "rationale": string }]',
  simulations:
    '"simulations": [{ "hypothesisId": "H1", "steps": [string], "outcome": string, "sideEffects": [string] }]',
  critiques:
    '"critiques": [{ "hypothesisId": "H1", "objection": string, "severity": "minor" | "major" | "fatal", "rebuttal"?: string }]',
  hypothesisUpdates:
    '"hypothesisUpdates": [{ "hypothesisId": "H1", "support": number, "reject"?: boolean, "reason"?: string }]',
  addContradictions: '"addContradictions": [{ "description": string, "between": ["F1", "H2"] }]',
  resolveContradictions:
    '"resolveContradictions": [{ "contradictionId": "C1", "resolution": string }]',
  addFailures: '"addFailures": [{ "description": string }]',
  investigatedUnknownId: '"investigatedUnknownId": string',
  failed: '"failed": boolean',
  confidence: '"confidence": number',
  decision:
    '"decision": { "hypothesisId"?: "H1", "answer": string, "rationale": string, "confidence": number, "nextActions": [string] }',
};

function operationInstructions(
  operation: GeneratedOperation,
  state: MentalState,
  maxNewHypotheses: number
): string {
  const active = activeHypotheses(state);
  const unsimulated = active
    .filter((hypothesis) => hypothesis.simulations.length === 0)
    .map((hypothesis) => hypothesis.id);
  const uncritiqued = active
    .filter((hypothesis) => hypothesis.critiques.length === 0)
    .map((hypothesis) => hypothesis.id);

  switch (operation) {
    case 'represent':
      return [
        'Represent the problem explicitly before solving it.',
        'Extract the facts stated in the goal and context (source "input"), the assumptions you are making, the constraints any answer must respect and the open questions whose answers would change the conclusion.',
        'If contradictions are listed, reframe the problem so they can be resolved, and resolve the ones that no longer hold.',
      ].join(' ');
    case 'hypothesize':
      return `Propose between 1 and ${maxNewHypotheses} NEW candidate answers or solutions. Each must differ from the existing and rejected hypotheses, be concrete, and come with the reason the thinker would consider it.`;
    case 'simulate':
      return `Simulate the hypotheses that have no simulation yet (${unsimulated.join(', ') || 'none'}). For each one, write the chain of consequences if it were adopted: immediate effects first, then indirect and second-order effects, then the resulting outcome and its side effects.`;
    case 'critique':
      return `Act as the thinker's inner critic for the hypotheses without critique (${uncritiqued.join(', ') || 'none'}). Find the strongest reason each could be wrong or fail, using the thinker's rejection criteria. Use severity "fatal" only when the hypothesis cannot survive the objection; add a rebuttal when one exists. Update each hypothesis support in [0, 1].`;
    case 'integrate':
      return 'A tool was used to investigate an open unknown. Extract the facts the observation establishes (source "tool"), resolve the unknown if the observation answers it (or drop it if it cannot be answered), flag contradictions with existing items and adjust hypothesis support.';
    case 'compare':
      return "Compare every active hypothesis against the facts, simulations, critiques and the thinker's priorities. Give each a support in [0, 1] that reflects how the thinker would rank it, and reject those the thinker would reject.";
    case 'decide':
      return [
        'Commit to the answer the thinker would give.',
        "Select the best-supported hypothesis (or none if none is acceptable), write the answer for the person who asked, and explain the rationale following the thinker's order of attention.",
        'State the remaining uncertainty and list concrete next actions (for example a small prototype or a check that would change the conclusion).',
      ].join(' ');
  }
}

export function buildSystemPrompt(profile: ThinkerProfile, extraInstructions?: string): string {
  return [
    'You are the reasoning core of a cognitive agent. You do not chat: you perform ONE cognitive operation on an explicit mental state and return a JSON patch describing what changed.',
    'Reason the way the thinker described below reasons: follow their order of attention, apply their heuristics, weigh their priorities and reject what they would reject.',
    '',
    renderProfile(profile),
    '',
    'Output rules:',
    '- Reply with exactly one JSON object. No prose before or after it, no Markdown fences.',
    '- Refer to existing items by their ids (F1, A1, K1, U1, H1, C1). Never invent ids for new items: the engine assigns them.',
    '- Keep every statement short, concrete and checkable. Do not repeat items that already exist.',
    '- Probabilities, supports and confidences are numbers between 0 and 1.',
    ...(extraInstructions ? ['', extraInstructions] : []),
  ].join('\n');
}

export function buildOperationPrompt(input: {
  operation: GeneratedOperation;
  state: MentalState;
  observation?: Observation;
  maxNewHypotheses: number;
}): string {
  const { operation, state, observation } = input;
  const description =
    operation === 'integrate'
      ? 'Digest the result of an investigation.'
      : OPERATION_DESCRIPTIONS[operation];
  const fields = ALLOWED_FIELDS[operation].map((field) => `  ${FIELD_SPECS[field]}`);
  const required = REQUIRED_FIELD[operation];

  return [
    `Operation: ${operation} — ${description}`,
    `Instructions: ${operationInstructions(operation, state, input.maxNewHypotheses)}`,
    '',
    'Mental state:',
    JSON.stringify(describeMentalState(state), null, 2),
    ...(observation
      ? [
          '',
          `Observation for ${observation.unknownId} (tool "${observation.toolName}"):`,
          JSON.stringify(
            { parameters: observation.parameters, result: observation.result },
            null,
            2
          ),
        ]
      : []),
    '',
    'Reply with a JSON object containing:',
    '  "summary": string (one sentence describing this thought)',
    ...fields,
    ...(required
      ? [`"${required}" is required and must not be empty. Other fields are optional.`]
      : ['Every field except "summary" is optional.']),
  ].join('\n');
}
