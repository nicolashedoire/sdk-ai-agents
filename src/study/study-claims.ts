import { studyReason } from './study-labels.js';
import type { ProposedItem } from './study-replies.js';
import type {
  StudyClaim,
  StudyClaimStatus,
  StudyComponent,
  StudyPassage,
  StudyPriorArt,
  StudyReason,
  StudyReasonCode,
  StudyTrace,
} from './study-types.js';

/** What the study knows when it settles a claim's status. */
export interface ClaimContext {
  passage: StudyPassage;
  runId: string;
  /**
   * Whether the prompt that wrote the claim listed a result with this id. A result retrieved
   * elsewhere in the study, but not listed there, supports nothing: the model never saw it.
   */
  listed: (id: string) => boolean;
  /** The study has sources: without them nothing can be established. */
  hasSources: boolean;
}

/**
 * Turns a proposed item into a claim whose status the study checked, not the model:
 * - `established` needs a result its prompt listed: a citation of any other id supports
 *   nothing, and a claim left without one is a `hypothesis`, with why;
 * - `novelty` stays "to verify" until the study searched for its prior art
 *   (`applyPriorArt`).
 */
export function settleClaim(id: string, proposed: ProposedItem, context: ClaimContext): StudyClaim {
  const sources = proposed.sources.filter((source) => context.listed(source));
  const unlisted = proposed.sources.filter((source) => !context.listed(source));
  const declared = proposed.declaredStatus ?? 'hypothesis';
  const claim: StudyClaim = {
    ...proposed.fields,
    id,
    passage: context.passage,
    statement: proposed.statement,
    status: declared,
    sources,
    ...(unlisted.length > 0 ? { unlistedSources: unlisted } : {}),
    servesObjective: proposed.servesObjective,
    runId: context.runId,
  };
  if (declared === 'established' && sources.length === 0) {
    lower(claim, 'hypothesis', unsupported(unlisted, context.hasSources));
  }
  if (claim.status === 'novelty') {
    leaveToVerify(claim, context.hasSources ? 'priorArtNotSearchedYet' : 'priorArtNoSource');
  }
  return claim;
}

/** A component of an assembly as the model wrote it. */
export interface ProposedComponent {
  name: string;
  statement: string;
  date?: string;
  status?: StudyClaimStatus;
  sources: string[];
  from: string[];
}

/**
 * Settles a component of an assembly. A component is a prior technique: `established` only by
 * a result its prompt listed, and never a novelty, since the novelty of a proposal lies in its
 * assembly. One presented as new is established when a listed result documents it, and a
 * hypothesis otherwise. It must come from a record of the investigation (`traceOf`).
 */
export function settleComponent(
  proposed: ProposedComponent,
  context: Pick<ClaimContext, 'listed' | 'hasSources'>,
  traceable: (id: string) => boolean
): StudyComponent {
  const sources = proposed.sources.filter((source) => context.listed(source));
  const unlisted = proposed.sources.filter((source) => !context.listed(source));
  const declared = proposed.status ?? 'hypothesis';
  const component: StudyComponent = {
    name: proposed.name,
    statement: proposed.statement,
    ...(proposed.date ? { date: proposed.date } : {}),
    status: declared,
    sources,
    ...(unlisted.length > 0 ? { unlistedSources: unlisted } : {}),
    ...traceOf(proposed.from, traceable),
  };
  if (declared === 'novelty') {
    const documented = sources.length > 0;
    component.declaredStatus = 'novelty';
    component.status = documented ? 'established' : 'hypothesis';
    component.statusReason = studyReason(
      documented ? 'componentDocumented' : 'componentUndocumented'
    );
  } else if (declared === 'established' && sources.length === 0) {
    component.declaredStatus = 'established';
    component.status = 'hypothesis';
    component.statusReason = unsupported(unlisted, context.hasSources);
  }
  return component;
}

/**
 * Where a part of a design comes from: the records of the investigation it cites, among those
 * its prompt listed. A part that cites none is `untraced`: it does not follow from the
 * investigation, and the report says so.
 */
export function traceOf(cited: string[], traceable: (id: string) => boolean): StudyTrace {
  const from = cited.filter((id) => traceable(id));
  const unknown = cited.filter((id) => !traceable(id));
  return {
    from,
    ...(unknown.length > 0 ? { unknownFrom: unknown } : {}),
    ...(from.length === 0 ? { untraced: true } : {}),
  };
}

/** Why an `established` claim is only a hypothesis. */
function unsupported(unlisted: string[], hasSources: boolean): StudyReason {
  if (!hasSources) return studyReason('noSourceConfigured');
  if (unlisted.length > 0) return studyReason('citesUnlisted', { ids: unlisted.join(', ') });
  return studyReason('citesNothing');
}

/**
 * Records what the prior-art search found for a claim (a novelty, or a capability's
 * assembly, whatever its declared status). A novelty is no longer to verify, unless the
 * closest work already does it: it is then a `hypothesis`. A status is never raised.
 */
export function applyPriorArt(claim: StudyClaim, priorArt: StudyPriorArt): void {
  claim.priorArt = priorArt;
  claim.toVerify = undefined;
  claim.priorArtReason = undefined;
  if (claim.status !== 'novelty') {
    // Not a novelty, but an assembly already done is no new capability: the report says so.
    if (priorArt.verdict === 'exists') {
      claim.priorArtReason = studyReason('assemblyExists', { closest: priorArt.closest });
    }
    return;
  }
  claim.statusReason = undefined;
  if (priorArt.verdict === 'exists') {
    lower(claim, 'hypothesis', studyReason('priorArtExists', { closest: priorArt.closest }));
  }
}

/**
 * A claim whose prior art could not be searched or assessed stays to verify, with why: a
 * novelty in its `statusReason`, the assembly of a capability of another status (`capability`)
 * in its `priorArtReason`, so that its other reasons stay. Any other claim is left as it is.
 */
export function leaveToVerify(claim: StudyClaim, code: StudyReasonCode, capability = false): void {
  if (claim.status === 'novelty') {
    claim.toVerify = true;
    claim.statusReason = studyReason(code);
  } else if (capability) {
    claim.toVerify = true;
    claim.priorArtReason = studyReason(code);
  }
}

function lower(claim: StudyClaim, status: StudyClaimStatus, reason: StudyReason): void {
  claim.declaredStatus = claim.declaredStatus ?? claim.status;
  claim.status = status;
  claim.statusReason = reason;
}
