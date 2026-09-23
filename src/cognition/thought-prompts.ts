import { OPERATION_DESCRIPTIONS, nextRevisionTarget } from './cognitive-operations.js';
import { describeMentalState } from './mental-state-view.js';
import { activeHypotheses, type MentalState } from './mental-state.js';
import {
  ALLOWED_FIELDS,
  FIELD_SPECS,
  REQUIRED_FIELD,
  type GeneratedOperation,
} from './thought-fields.js';
import { renderProfile, type ThinkerProfile } from './thinker-profile.js';

/** Tool result handed to the `integrate` operation. */
export interface ToolObservation {
  unknownId: string;
  /** Id the engine gives the observation when the thought is applied. */
  observationId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result: unknown;
}

const EVIDENCE_RULES =
  'Observations are recorded by the engine with their source. A source that asserts X shows that the source asserts X, not that X is true. Observations with the same origin are not independent confirmations.';

function operationInstructions(
  operation: GeneratedOperation,
  state: MentalState,
  maxNewHypotheses: number,
  observation?: ToolObservation
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
        'Extract the facts stated in the goal, the context and the observations (source "input", citing observationRefs), the assumptions you are making, the constraints any answer must respect and the open questions whose answers would change the conclusion.',
        EVIDENCE_RULES,
        'Retract or supersede facts that no longer hold instead of silently contradicting them. If contradictions are listed, reframe the problem and resolve the ones that no longer hold, citing the observations or facts that settle them.',
      ].join(' ');
    case 'compare_observations':
      return [
        'Compare the observations with each other (and with facts when useful): what is similar, what differs and in which context, what changed over time, what is incompatible, and which observations are counterexamples to a hypothesis (set its hypothesisId).',
        'A similarity is not a cause. If a difference suggests a variable nobody measured, add it as an unknown.',
        EVIDENCE_RULES,
      ].join(' ');
    case 'hypothesize':
      return [
        `Propose between 1 and ${maxNewHypotheses} NEW hypotheses that differ from the existing and rejected ones.`,
        'Set "kind": "proposal" for an answer or action, "rule" for a regularity generalized from cases, "explanation" for a cause.',
        'Set "inference" (induction from several cases, abduction for the best explanation, deduction from a rule and premises), cite the premiseRefs it rests on and state its scope.',
        'A few cases never justify a universal law: keep the scope to what was observed.',
      ].join(' ');
    case 'simulate':
      return [
        `Simulate the hypotheses that have no simulation yet (${unsimulated.join(', ') || 'none'}): immediate effects first, then indirect and second-order effects, then the outcome and its side effects.`,
        'For rules and explanations, deduce predictions that could fail: what should be observed (expected), which observation would prove the hypothesis wrong (falsifier), in which context, and the structured parameters a test needs (test).',
        'Choose tests whose outcome is not known yet: never repeat an entry of `experiments`, and prefer a test on which the hypotheses in play disagree.',
      ].join(' ');
    case 'revise':
      return reviseInstructions(state);
    case 'critique':
      return `Act as the thinker's inner critic for the hypotheses without critique (${uncritiqued.join(', ') || 'none'}). Find the strongest reason each could be wrong or fail, using the thinker's rejection criteria. Use severity "fatal" only when the hypothesis cannot survive the objection; add a rebuttal when one exists. Update each hypothesis support in [0, 1] from the evidence only.`;
    case 'integrate':
      return [
        `A tool was used to investigate an open unknown; its result was recorded as ${observation?.observationId ?? 'an observation'}.`,
        'Extract the facts it establishes (source "tool", citing it in observationRefs), resolve the unknown if the observation answers it (or drop it if it cannot be answered), retract facts it disproves, flag contradictions and adjust hypothesis support.',
        EVIDENCE_RULES,
      ].join(' ');
    case 'compare':
      return [
        'Judge every active hypothesis.',
        '"support" is how well the observations, facts, predictions and critiques support it, ignoring what the thinker prefers. "preferenceFit" is how well a proposal suits the thinker\'s priorities; give it only for hypotheses of kind "proposal".',
        'Cite the basisRefs of each judgement. Reject the hypotheses the evidence refutes and the proposals the thinker would reject. Resolve contradictions only by citing what settles them.',
      ].join(' ');
    case 'decide':
      return [
        'Commit to the answer the thinker would give.',
        "Select the hypothesis given by `readiness.readyToCommit`, write the answer for the person who asked, and explain the rationale following the thinker's order of attention.",
        'If `readyToCommit` is null, the budget is spent: select the best-ranked hypothesis and say plainly what `readiness.missing` lists, or select no hypothesis to abstain if none can be defended.',
        'List concrete next actions (for example a small prototype or a check that would change the conclusion).',
      ].join(' ');
  }
}

function reviseInstructions(state: MentalState): string {
  const target = nextRevisionTarget(state);
  if (!target) {
    return 'Revise the hypotheses contradicted by evidence.';
  }
  const refuted = state.predictions
    .filter(
      (prediction) => prediction.hypothesisId === target.id && prediction.status === 'refuted'
    )
    .map(
      (prediction) =>
        `${prediction.id} expected "${prediction.expected}" (${prediction.evaluation?.reason ?? 'refuted'})`
    );
  return [
    `Hypothesis ${target.id} ("${target.statement}") is contradicted by ${target.counterEvidenceRefs.join(', ') || 'a test'}${refuted.length > 0 ? `: ${refuted.join('; ')}` : ''}.`,
    `Compare the counterexample with what supported it (${target.premiseRefs.join(', ') || 'its premises'}) and identify what differs: a missing variable, a narrower scope or a different context.`,
    `Propose a variant with "parentId": "${target.id}" that restricts the scope or adds the variable, and state its "difference". Never restate the original.`,
    'The variant must agree with every observation so far, confirmations included (see `experiments`); widen the search to conditions not tested yet rather than repeating a known experiment.',
    'Add unknowns for what must be tested next and resolve the contradictions the variant explains, citing the observations.',
  ].join(' ');
}

export function buildSystemPrompt(profile: ThinkerProfile, extraInstructions?: string): string {
  return [
    'You are the reasoning core of a cognitive agent. You do not chat: you perform ONE cognitive operation on an explicit mental state and return a JSON patch describing what changed.',
    'Reason the way the thinker described below reasons: follow their order of attention, apply their heuristics, weigh their priorities and reject what they would reject. Their preferences decide which action to take; they never make a claim about the world more likely to be true.',
    '',
    renderProfile(profile),
    '',
    'Output rules:',
    '- Reply with exactly one JSON object. No prose before or after it, no Markdown fences.',
    '- Refer to existing items by their ids (O1, F1, A1, K1, U1, H1, P1, R1, C1). Never invent ids for new items: the engine assigns them.',
    '- Keep every statement short, concrete and checkable. Do not repeat items that already exist.',
    '- Probabilities, supports and confidences are numbers between 0 and 1.',
    ...(extraInstructions ? ['', extraInstructions] : []),
  ].join('\n');
}

export function buildOperationPrompt(input: {
  operation: GeneratedOperation;
  state: MentalState;
  observation?: ToolObservation;
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
    `Instructions: ${operationInstructions(operation, state, input.maxNewHypotheses, observation)}`,
    '',
    'Mental state:',
    JSON.stringify(describeMentalState(state), null, 2),
    ...(observation
      ? [
          '',
          `Observation ${observation.observationId} for ${observation.unknownId} (tool "${observation.toolName}"):`,
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
