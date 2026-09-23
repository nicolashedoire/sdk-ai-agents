import {
  capNewHypotheses,
  nextRevisionTarget,
  type CognitiveOperation,
} from './cognitive-operations.js';
import { abstention, settleDecision } from './decision-readiness.js';
import { proposalRefusal } from './hypothesis-transitions.js';
import { activeHypotheses, sameStatement, type MentalState } from './mental-state.js';
import { truncate, type OperationOutcome, type ProposedThought } from './operation-outcome.js';
import { ALLOWED_FIELDS } from './thought-fields.js';
import { thoughtPatchSchema, type ThoughtPatch } from './thought-patch.js';

/**
 * Single entry point of every thought into the state. Whatever produced it (the LLM
 * generator, a typed-decision assessor, a custom component), a proposal only keeps the
 * fields its operation may write; provenance, test results and the decision status are then
 * added by the engine.
 */

export interface AssembledThought {
  patch: ThoughtPatch;
  failed: boolean;
  failureMessage?: string;
  /** Proposal fields dropped because the operation may not write them. */
  ignoredFields: string[];
  /** Engine adjustments worth recording on the thought. */
  issues: string[];
  /**
   * True when the engine deferred a decision that was not ready. It counts as a failed
   * attempt of `decide`, not as a failure of the model.
   */
  deferred?: boolean;
}

export type AdmittedProposal =
  | { ok: true; patch: ThoughtPatch; ignoredFields: string[] }
  | { ok: false; error: string };

export function admitProposal(proposal: ProposedThought): AdmittedProposal {
  const allowed = new Set<string>(ALLOWED_FIELDS[proposal.contract]);
  const kept: Record<string, unknown> = { summary: proposal.patch.summary };
  const ignoredFields: string[] = [];
  for (const [field, value] of Object.entries(proposal.patch)) {
    if (field === 'summary' || isEmpty(value)) continue;
    if (allowed.has(field)) {
      kept[field] = value;
    } else {
      ignoredFields.push(field);
    }
  }
  const decision = proposal.patch.decision;
  if (decision && allowed.has('decision')) {
    const { status, missing, ...proposed } = decision;
    kept.decision = proposed;
    if (status !== undefined || missing !== undefined) ignoredFields.push('decision.status');
  }
  const parsed = thoughtPatchSchema.safeParse(kept);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `invalid thought: ${issue?.path.join('.') || 'patch'}: ${issue?.message ?? 'invalid value'}`,
    };
  }
  return { ok: true, patch: parsed.data, ignoredFields };
}

/**
 * A comparison must judge every hypothesis still in play (or reject it); otherwise the ones
 * it skipped would keep an assessment made on older evidence.
 */
export function unassessedHypotheses(state: MentalState, patch: ThoughtPatch): string[] {
  const judged = new Set(
    patch.hypothesisUpdates
      .filter((update) => update.support !== undefined || update.reject)
      .map((update) => update.hypothesisId)
  );
  return activeHypotheses(state)
    .map((hypothesis) => hypothesis.id)
    .filter((id) => !judged.has(id));
}

export function assembleThought(input: {
  operation: CognitiveOperation;
  outcome: OperationOutcome;
  state: MentalState;
  maxHypotheses: number;
  /** True when the step budget forces a conclusion. */
  forced: boolean;
}): AssembledThought {
  const { operation, outcome, state } = input;
  const engine = outcome.engine ?? {};
  const engineFields = {
    observations: engine.observations ?? [],
    evaluations: engine.evaluations ?? [],
    ...(engine.investigatedUnknownId
      ? { investigatedUnknownId: engine.investigatedUnknownId }
      : {}),
  };
  const v2 = state.schemaVersion >= 2;
  // A forced conclusion always concludes: the engine abstains when no decision can be used.
  const concludes = v2 && operation === 'decide' && input.forced;

  const fail = (reason: string): AssembledThought => {
    const message = truncate(reason);
    if (concludes) {
      return {
        failed: false,
        ignoredFields: [],
        issues: [`the decision could not be produced (${message}): the engine abstains`],
        patch: thoughtPatchSchema.parse({
          summary: `Abstained: ${message}`,
          addFailures: [{ description: message }],
          ...engineFields,
          decision: abstention(state, `the decision could not be produced (${message})`),
        }),
      };
    }
    // A tool result is kept even when its interpretation failed.
    return {
      failed: true,
      failureMessage: message,
      ignoredFields: [],
      issues: [],
      patch: thoughtPatchSchema.parse({
        summary: `${operation} failed: ${message}`,
        failed: true,
        addFailures: [{ description: message }],
        ...engineFields,
      }),
    };
  };

  if (outcome.failure || (!outcome.proposal && !engine.summary)) {
    return fail(outcome.failure?.message ?? 'operation produced no thought');
  }
  const admitted = outcome.proposal
    ? admitProposal(outcome.proposal)
    : {
        ok: true as const,
        patch: thoughtPatchSchema.parse({ summary: engine.summary }),
        ignoredFields: [],
      };
  if (!admitted.ok) {
    return fail(admitted.error);
  }
  let patch: ThoughtPatch = {
    ...admitted.patch,
    ...engineFields,
    addFailures: (engine.failures ?? []).map((description) => ({ description })),
    ...(engine.dropUnknowns ? { dropUnknowns: engine.dropUnknowns } : {}),
  };
  const issues: string[] = [];

  if (v2 && operation === 'compare') {
    const skipped = unassessedHypotheses(state, patch);
    if (skipped.length > 0) {
      return fail(`the comparison did not reassess ${skipped.join(', ')}`);
    }
  }
  if (operation === 'revise') {
    patch = withRevisionParent(patch, state);
  }
  if (v2) {
    // Refused proposals are removed before the cap, so they cannot take a valid one's place.
    patch = withoutRefusedProposals(patch, state, issues);
  }
  const bounded = capNewHypotheses(patch, state, input.maxHypotheses);
  patch = bounded.patch;
  issues.push(...bounded.issues);

  if (concludes && !patch.decision) {
    return fail('no decision was proposed');
  }
  if (patch.decision && v2) {
    const settlement = settleDecision(state, patch.decision, input.forced);
    if (settlement.outcome === 'defer') {
      // A deferred decision counts as a failed attempt, so `decide` is not offered forever.
      return { ...fail(settlement.issue), deferred: true };
    }
    patch = { ...patch, decision: settlement.decision };
    if (settlement.issue) issues.push(settlement.issue);
  }
  return { patch, failed: false, ignoredFields: admitted.ignoredFields, issues };
}

function withoutRefusedProposals(
  patch: ThoughtPatch,
  state: MentalState,
  issues: string[]
): ThoughtPatch {
  const kept: ThoughtPatch['addHypotheses'] = [];
  for (const proposal of patch.addHypotheses) {
    const refusal =
      proposalRefusal(state, proposal) ??
      (kept.some((other) => sameStatement(other.statement, proposal.statement))
        ? `"${proposal.statement}" is proposed twice`
        : undefined);
    if (refusal) {
      issues.push(refusal);
    } else {
      kept.push(proposal);
    }
  }
  return { ...patch, addHypotheses: kept };
}

/** Variants proposed by `revise` descend from the hypothesis being revised. */
function withRevisionParent(patch: ThoughtPatch, state: MentalState): ThoughtPatch {
  const target = nextRevisionTarget(state);
  if (!target) return patch;
  return {
    ...patch,
    addHypotheses: patch.addHypotheses.map((hypothesis) =>
      hypothesis.parentId ? hypothesis : { ...hypothesis, parentId: target.id }
    ),
  };
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === false || (Array.isArray(value) && value.length === 0);
}
