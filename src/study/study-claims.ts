import type { ProposedItem } from './study-replies.js';
import type {
  StudyClaim,
  StudyClaimStatus,
  StudyComponent,
  StudyPassage,
  StudyPriorArt,
} from './study-types.js';

/** What the study knows when it settles a claim's status. */
export interface ClaimContext {
  passage: StudyPassage;
  runId: string;
  /** Whether the study retrieved a result with this id, in any of its runs. */
  retrieved: (id: string) => boolean;
  /** The study has sources: without them nothing can be established. */
  hasSources: boolean;
}

/**
 * Turns a proposed item into a claim whose status the study checked, not the model:
 * - `established` needs a result this study retrieved: a citation of a result it never
 *   retrieved supports nothing, and a claim left without one is a `hypothesis`, with why;
 * - `novelty` stays "to verify" until the study searched for its prior art
 *   (`applyPriorArt`).
 */
export function settleClaim(id: string, proposed: ProposedItem, context: ClaimContext): StudyClaim {
  const sources = proposed.sources.filter((source) => context.retrieved(source));
  const unretrieved = proposed.sources.filter((source) => !context.retrieved(source));
  const declared = proposed.declaredStatus ?? 'hypothesis';
  const claim: StudyClaim = {
    ...proposed.fields,
    id,
    passage: context.passage,
    statement: proposed.statement,
    status: declared,
    sources,
    ...(unretrieved.length > 0 ? { unretrievedSources: unretrieved } : {}),
    servesObjective: proposed.servesObjective,
    runId: context.runId,
  };
  if (declared === 'established' && sources.length === 0) {
    lower(claim, 'hypothesis', unsupported(unretrieved, context.hasSources));
  }
  if (claim.status === 'novelty') {
    claim.toVerify = true;
    claim.statusReason = context.hasSources
      ? 'Novelty to verify: its prior art has not been searched yet.'
      : 'Novelty to verify: the study has no source to search its prior art.';
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
}

/**
 * Settles a component of an assembly. A component is a prior technique: `established` only by
 * a result this study retrieved, and never a novelty, since the novelty of a proposal lies in
 * its assembly. One presented as new is established when a retrieved result documents it, and
 * a hypothesis otherwise.
 */
export function settleComponent(
  proposed: ProposedComponent,
  context: Pick<ClaimContext, 'retrieved' | 'hasSources'>
): StudyComponent {
  const sources = proposed.sources.filter((source) => context.retrieved(source));
  const unretrieved = proposed.sources.filter((source) => !context.retrieved(source));
  const declared = proposed.status ?? 'hypothesis';
  const component: StudyComponent = {
    name: proposed.name,
    statement: proposed.statement,
    ...(proposed.date ? { date: proposed.date } : {}),
    status: declared,
    sources,
    ...(unretrieved.length > 0 ? { unretrievedSources: unretrieved } : {}),
  };
  if (declared === 'novelty') {
    const documented = sources.length > 0;
    component.declaredStatus = 'novelty';
    component.status = documented ? 'established' : 'hypothesis';
    component.statusReason = documented
      ? 'Presented as new, but a component is a prior technique, and a retrieved result documents it: the novelty lies in the assembly.'
      : 'Presented as new without a retrieved source: a component is a prior technique, and this one stays a hypothesis.';
  } else if (declared === 'established' && sources.length === 0) {
    component.declaredStatus = 'established';
    component.status = 'hypothesis';
    component.statusReason = unsupported(unretrieved, context.hasSources);
  }
  return component;
}

/** Why an `established` claim is only a hypothesis. */
function unsupported(unretrieved: string[], hasSources: boolean): string {
  if (!hasSources) {
    return 'Declared established, but the study has no source: nothing can be established.';
  }
  if (unretrieved.length > 0) {
    return `Declared established, but it cites ${unretrieved.join(', ')}, never retrieved in this study.`;
  }
  return 'Declared established, but it cites no result retrieved in this study.';
}

/**
 * Records what the prior-art search found for a novelty. It stays a novelty, no longer to
 * verify, unless the closest work already does it: it is then a `hypothesis`.
 */
export function applyPriorArt(claim: StudyClaim, priorArt: StudyPriorArt): void {
  claim.priorArt = priorArt;
  claim.toVerify = undefined;
  claim.statusReason = undefined;
  if (priorArt.verdict === 'exists') {
    lower(claim, 'hypothesis', `Not a novelty: ${priorArt.closest}`);
  }
}

/** A novelty whose prior art could not be searched or assessed: why it stays to verify. */
export function leaveToVerify(claim: StudyClaim, reason: string): void {
  claim.toVerify = true;
  claim.statusReason = `Novelty to verify: ${reason}`;
}

function lower(claim: StudyClaim, status: StudyClaimStatus, reason: string): void {
  claim.declaredStatus = claim.declaredStatus ?? claim.status;
  claim.status = status;
  claim.statusReason = reason;
}
