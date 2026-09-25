import type { LLMProvider } from '../providers/llm-provider.js';
import type { LiveEventListener } from '../types/events.js';

/**
 * The seven passages of the method, in order. They form a loop: a passage may reopen an
 * earlier one (see `StudyLimits.maxLoops`).
 */
export type StudyPassage =
  | 'observe'
  | 'decompose'
  | 'historicalChoices'
  | 'changes'
  | 'cross'
  | 'design'
  | 'confront';

/**
 * What a claim is worth, checked by the study rather than trusted to the model:
 * - `established`: it cites a result the study itself retrieved from a source;
 * - `hypothesis`: plausible, not documented here;
 * - `novelty`: a new idea; it stays "to verify" until the study searched for prior art.
 */
export type StudyClaimStatus = 'established' | 'hypothesis' | 'novelty';

/**
 * Why the study set a status, removed an item or refused an amendment: a code the dossier
 * renders in the study's language (`studyLabels(language).reasons`), its parameters, and the
 * same reason in English. A reason the guardian or the model wrote is `judged`, its text in
 * `params.text`.
 */
export interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  /** The reason in English. */
  message: string;
}

export type StudyReasonCode =
  | 'judged'
  | 'noSourceConfigured'
  | 'citesUnlisted'
  | 'citesNothing'
  | 'priorArtNotSearchedYet'
  | 'priorArtNoSource'
  | 'priorArtSearchBudget'
  | 'priorArtNotSearched'
  | 'priorArtSearchFailed'
  | 'priorArtNoResult'
  | 'priorArtNotAssessed'
  | 'priorArtUnsupported'
  | 'priorArtExists'
  | 'assemblyExists'
  | 'componentDocumented'
  | 'componentUndocumented'
  | 'noServesObjective'
  | 'invalidItem'
  | 'notAnObject'
  | 'notAUserLead'
  | 'leadAlreadyJudged'
  | 'designWithoutCapability'
  | 'amendmentUnclassified'
  | 'amendmentCancelled'
  | 'amendmentTimedOut'
  | 'amendmentPolicy';

/** What the closest existing work says of a novelty, after a search for prior art. */
export interface StudyPriorArt {
  /** The closest existing work found, or why none is close. */
  closest: string;
  /** Results of this claim's own prior-art searches that show it: at least one. */
  sources: string[];
  /** `exists`: the idea is already done, so it is not a novelty. */
  verdict: 'novel' | 'partlyNovel' | 'exists';
}

/**
 * Every item of a study is a claim: a statement with its status, the results it cites and what
 * it serves in the objective. Ids are given by the study and never reused (`O1`, `A2`, `M1`).
 */
export interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  /** The status after the study's checks. */
  status: StudyClaimStatus;
  /** The status the model gave, when the study changed it. */
  declaredStatus?: StudyClaimStatus;
  /** Why the status was changed, or why a novelty is still to verify. */
  statusReason?: StudyReason;
  /** Ids of the results listed in the prompt that wrote it, which support it (`S1`…). */
  sources: string[];
  /** Ids it cited that its prompt did not list: they support nothing. */
  unlistedSources?: string[];
  /** Which part of the objective, or which need, it serves, in one sentence. */
  servesObjective: string;
  /**
   * A novelty, or the assembly of a capability, whose prior art was not searched and assessed:
   * for a novelty `statusReason` says why, for a capability of another status `priorArtReason`.
   */
  toVerify?: boolean;
  /**
   * For the assembly of a capability that is not a novelty: why its prior art was not checked,
   * or that the check found it already exists (`assemblyExists`).
   */
  priorArtReason?: StudyReason;
  /** The prior art found for a novelty. */
  priorArt?: StudyPriorArt;
  /**
   * The guardian has not judged it (the run stopped first, or the guardian gave it no valid
   * verdict). It stays in the report, flagged, and never reaches a later prompt; the next run
   * has the guardian judge it first.
   */
  unchecked?: boolean;
  /** The run that produced it. */
  runId: string;
}

export interface StudyObservation extends StudyClaim {
  kind: 'behaviour' | 'use' | 'variation' | 'failure';
  /** When, where, for whom and with what it holds. */
  conditions: string;
  era?: string;
}

/** A piece of the object: the map of its working, with its unknowns. */
export interface StudyPiece extends StudyClaim {
  name: string;
  function: string;
  inputs: string[];
  outputs: string[];
  /** The pieces it exchanges with, and how. */
  relations: string[];
  /** What stays to open, measure or document. */
  unknowns: string[];
  /** The piece it details, when the study went down into an opaque piece. */
  parent?: string;
}

/** A stage of the whole chain of the object (for a browser: receive, understand, execute…). */
export interface StudyChainStage extends StudyClaim {
  stage: string;
  pieces: string[];
}

export type StudyChoiceFactor =
  | 'hardware'
  | 'tools'
  | 'uses'
  | 'knowledge'
  | 'costs'
  | 'compatibility'
  | 'other';

export interface StudyHistoricalChoice extends StudyClaim {
  choice: string;
  piece?: string;
  /** The conditions of the time it answered. */
  factors: StudyChoiceFactor[];
  era?: string;
}

/** A research result, realisation, library, hardware or method that appeared since. */
export interface StudyAdvance extends StudyClaim {
  mechanism: string;
  date?: string;
  /** From the object's own domain, or from another one (`field`). */
  domain: 'object' | 'other';
  field?: string;
  evidence: string;
  conditions: string;
  availability: string;
  piece?: string;
}

/** The verdict on one of the user's leads, which are examples to verify, not truths. */
export interface StudyLeadVerdict extends StudyClaim {
  lead: string;
  verdict: 'relevant' | 'partlyRelevant' | 'notRelevant';
  reasons: string;
}

/** A tool the study found beyond the user's leads. */
export interface StudyIndependentLead extends StudyClaim {
  tool: string;
  kind: 'mathematical' | 'technical' | 'other';
  piece?: string;
}

/** One of the best current realisations: the reference for "better". */
export interface StudyReference extends StudyClaim {
  name: string;
  piece?: string;
  date?: string;
}

export interface StudyConstraint extends StudyClaim {
  constraint: string;
  state: 'remains' | 'weakened' | 'newRequirement';
  piece?: string;
}

export interface StudyRevisableDecision extends StudyClaim {
  decision: string;
  /** The condition that changed. */
  because: string;
  /** The possibility it opens. */
  opens: string;
}

/** A combination A + B. */
export interface StudyCombination extends StudyClaim {
  a: string;
  b: string;
  /** What A lets B do. */
  enables: string;
  /** What they must exchange. */
  exchange: string;
  /** What it costs: conversions, synchronisation. */
  cost: string;
  /** What it changes in the object, if anything. */
  changes: Array<'representation' | 'distribution' | 'responsibilities'>;
}

/** A principle an architecture changes: what makes a capability possible, not only faster. */
export type StudyPrinciple =
  | 'representation'
  | 'distribution'
  | 'responsibility'
  | 'trust'
  | 'verification'
  | 'other';

/**
 * A prior technique an architecture assembles. Its status is checked in code like any claim's,
 * and a component cannot be a novelty: the novelty of a proposal lies in its assembly.
 */
export interface StudyComponent extends StudyTrace {
  name: string;
  statement: string;
  date?: string;
  status: StudyClaimStatus;
  declaredStatus?: StudyClaimStatus;
  statusReason?: StudyReason;
  sources: string[];
  unlistedSources?: string[];
}

/**
 * The records of the investigation a part of a design comes from: advances (`V`), independent
 * leads (`I`), references (`R`), breakthroughs (`B`), revisable decisions (`D`), combinations
 * (`X`) and candidate capabilities (`Y`), as the design's prompt listed them. Checked in code:
 * a part that cites none of them is `untraced`, flagged in the report, not trusted.
 */
export interface StudyTrace {
  /** Ids of the records it comes from, among those its prompt listed. */
  from: string[];
  /** Ids it cited that its prompt did not list. */
  unknownFrom?: string[];
  /** It cites no record of the investigation its prompt listed. */
  untraced?: boolean;
}

/** What one component of an assembly gives the others, exchanges with them, and costs. */
export interface StudyAssemblyLink extends StudyTrace {
  component: string;
  gives: string;
  exchanges: string;
  cost: string;
}

/**
 * What an architecture makes possible. For a `capability`, what is difficult or impossible
 * today, for whom, and the constraint it lifts; for an `improvement`, what gets faster or
 * cheaper.
 */
export interface StudyCapabilityTarget {
  what: string;
  forWhom: string;
  liftedConstraint: string;
}

/**
 * A design of the object. Its components are prior techniques; its status is that of its
 * assembly and of the capability the assembly produces: a `novelty` is checked against prior
 * art as a combination.
 */
export interface StudyArchitecture extends StudyClaim {
  name: string;
  /**
   * `capability`: it makes possible something difficult or impossible today, by a change of
   * principle. `improvement`: it only makes something faster or cheaper. Improvements come
   * after capabilities in the report.
   */
  kind: 'capability' | 'improvement';
  /** The kind the model gave, when the guardian judged it only an improvement. */
  declaredKind?: 'capability';
  /** Why the guardian judged it only an improvement (faster or cheaper). */
  kindReason?: StudyReason;
  capability: StudyCapabilityTarget;
  /** The principle that changes (required for a capability). */
  principleChange?: { principle: StudyPrinciple; change: string };
  /** How the assembly produces the capability. */
  mechanism: string;
  components: StudyComponent[];
  assembly: StudyAssemblyLink[];
  conditions: string;
  benefit: string;
  addedCost: string;
  counterexample: string;
  /** How it covers each stage of the whole chain. */
  chain: Array<{ stage: string; how: string }>;
  /** Stages of the chain (passage `decompose`) it does not cover, as the study checked. */
  uncoveredStages: string[];
  predictions: string[];
}

/** A candidate new capability, proposed when the charter names none. */
export interface StudyCapability extends StudyClaim {
  capability: string;
  forWhom: string;
  /** Why it is difficult or impossible today: the constraint to lift. */
  hardToday: string;
  principle?: StudyPrinciple;
}

/**
 * A past breakthrough, in any domain, that came from assembling earlier techniques (Bitcoin:
 * signatures, hash chains, proof of work, Merkle trees and a P2P network, all prior, gave a
 * shared ledger without a trusted third party). Its pattern feeds the design.
 */
export interface StudyAnalogue extends StudyClaim {
  breakthrough: string;
  /** The number of the breakthrough it deconstructs among the charter's `analogues`. */
  named?: number;
  domain?: string;
  date?: string;
  /** The earlier techniques it assembled, with their dates. */
  components: Array<{ name: string; date?: string }>;
  liftedConstraint: string;
  /** The capability that opened. */
  capability: string;
  /** The assembly pattern, reusable elsewhere. */
  pattern: string;
}

/** One of the three states of a piece. */
export interface StudyThreeState extends StudyClaim {
  piece: string;
  state: 'atItsTime' | 'currentBest' | 'proposal';
  architecture?: string;
}

/** What is novel in the design (status `novelty`) and what is not (any other status). */
export interface StudyNoveltyClaim extends StudyClaim {
  architecture?: string;
}

export interface StudyExperiment extends StudyClaim {
  name: string;
  /** The architectures it decides between. */
  architectures: string[];
  protocol: string;
  measures: string[];
  criteria: string[];
  expected: Array<{ architecture: string; result: string }>;
  /** It tests the whole chain, not one mechanism. */
  wholeChain: boolean;
}

/**
 * The reusable card of a mechanism (11 fields). The study fills fields 1 to 9; fields 10 and 11
 * stay empty until the user records the result of an experiment they ran (`recordResult`).
 */
export interface MechanismCard extends StudyClaim {
  observation: string;
  mechanism: string;
  unknown: string;
  historicalChoice: string;
  evolution: string;
  newPossibility: string;
  proposedCombination: string;
  prediction: string;
  experiment: string;
  /** Field 10: what was found, and where the explanation fails. */
  resultAndError?: { result: string; error?: string };
  /** Field 11: what is kept, what changes, where the mechanism could be reused. */
  conclusionAndMemory?: string;
  /** When the user recorded fields 10 and 11. */
  resultRecordedAt?: number;
}

/** A result a source returned, numbered once for the whole study. */
export interface StudySearchResult {
  /** `S1`, `S2`…: the same result found again keeps its id. */
  id: string;
  title: string;
  /** Its URL, or another locator when the source gives none. */
  locator: string;
  date?: string;
  excerpt: string;
  /** The source tool that returned it first, and the query. */
  tool: string;
  query: string;
  runId: string;
}

/** A search the study asked for: run, failed, or skipped past `maxSearches`. */
export interface StudySearch {
  passage: StudyPassage;
  /** `priorArt`: looking for work that already does a novelty. */
  purpose: 'research' | 'priorArt';
  tool: string;
  query: string;
  servesObjective: string;
  /** The novelty claims whose prior art it looks for. */
  claims?: string[];
  resultIds: string[];
  error?: string;
  skipped?: 'maxSearches';
  runId: string;
}

/** An item removed for leaving the objective, or refused by the schema. */
export interface StudyDriftEntry {
  passage: StudyPassage;
  collection: string;
  /** The item as the model gave it. */
  item: { id?: string; statement?: string; servesObjective?: string };
  reason: StudyReason;
  /** `guardian`: judged off the objective; `schema`: refused before (no `servesObjective`…). */
  by: 'guardian' | 'schema';
  /** 2 when the passage was redone. */
  attempt: number;
  runId: string;
}

export type StudyAmendmentVerdict = 'refines' | 'conflicts' | 'changesObjective' | 'unclassified';

/**
 * An instruction added after creation, classified against the charter: only `refines` is
 * accepted; it is numbered and shown under the charter in every later prompt.
 */
export interface StudyAmendment {
  /** The number of an accepted amendment, from 1. */
  number?: number;
  text: string;
  verdict: StudyAmendmentVerdict;
  accepted: boolean;
  reason: StudyReason;
  /** The run that recorded its classification. */
  runId: string;
}

/**
 * The frozen frame of a study: every prompt starts with it. Changing the objective means a new
 * study.
 */
export interface StudyCharter {
  readonly object: string;
  /** The guiding question (the method's, in the study's language, by default). */
  readonly question: string;
  readonly objective: string;
  /** Needs and criteria of today: interactions, accessibility, compatibility… */
  readonly needs: readonly string[];
  /** The user's leads: examples to verify, not truths. */
  readonly leads: readonly string[];
  readonly scope: { readonly exclude: readonly string[] };
  /**
   * The new capability aimed at: what should become possible that is difficult today, not only
   * faster. Without it, the study proposes candidates.
   */
  readonly capability?: string;
  /** Breakthroughs by assembly to deconstruct as analogues (`Bitcoin`…). */
  readonly analogues: readonly string[];
}

export interface StudyLimits {
  /** Model calls per run, repairs and checks included (default 60). */
  maxModelCalls: number;
  /** Searches per run (default 20). Past it, the study goes on without new results. */
  maxSearches: number;
  /** Earlier passages a run may reopen (default 1). */
  maxLoops: number;
  /** Length of a run in milliseconds (default 20 minutes). */
  timeoutMs: number;
  /** Results kept from one search (default 5). */
  maxResultsPerSearch: number;
}

export interface StudyConfig {
  /** A short name for the study (recorded with its events). */
  name: string;
  /** The object to understand and redesign. */
  object: string;
  /** What the study must deliver. It never changes: a new objective is a new study. */
  objective: string;
  /** Defaults to the method's guiding question, in `language`. */
  question?: string;
  needs?: string[];
  /** Your leads, to verify: the study also looks beyond them. */
  leads?: string[];
  scope?: { exclude?: string[] };
  /**
   * The new capability you aim at: something difficult or impossible today that a change of
   * principle would make possible. Without it, the study proposes candidates.
   */
  capability?: string;
  /**
   * Breakthroughs by assembly to deconstruct (`['Bitcoin']`): their components, the constraint
   * they lifted, the capability that opened and the pattern. The study may find others.
   */
  analogues?: string[];
  /**
   * Names of SDK tools the study searches with (typically tools of an MCP search server added
   * with `connectMcpServer` and `sdk.defineTool`). They run through `executeTool`, governed.
   * Without sources, no claim can be established.
   */
  sources?: string[];
  /** Model of every call (the provider's default when omitted). */
  model?: string;
  /** A provider for this study instead of the SDK's. */
  llmProvider?: LLMProvider;
  /** Language of the texts and of the dossier (`en` by default; `fr`, `de`…). */
  language?: string;
  limits?: Partial<StudyLimits>;
  /**
   * Share of a passage's items that may be rejected (off the objective, or refused by the
   * schema) before the passage is redone once with the rejections as feedback (default 1/3).
   */
  driftThreshold?: number;
  /** Sampling temperature of the passages (default 0.4). Checks run at 0. */
  temperature?: number;
  maxTokens?: number;
}

export interface StudyRunOptions {
  /** Cancels the run when aborted: it ends as `cancelled`, with the report of what was done. */
  signal?: AbortSignal;
  /**
   * Called with every event of the run, in order, once the event store has accepted it, as
   * with `agent.run`: a promise it returns is awaited before its next event.
   */
  onEvent?: LiveEventListener;
  /**
   * Starts the study over: its passages, results, searches, drift log and numbers are cleared
   * (its charter and amendments stay). Without it, a run resumes where the last one stopped:
   * the guardian first judges what it had not judged, then the passages not complete run.
   */
  restart?: boolean;
}

/** How long an amendment's classification may take, and a signal to cancel it. */
export interface StudyAmendOptions {
  /** Cancels the classification: the amendment is then refused (`amendmentCancelled`). */
  signal?: AbortSignal;
  /** Longest wait, in milliseconds (default 60 000): past it, the amendment is refused. */
  timeoutMs?: number;
}

/**
 * `completed`: every passage ran. `stopped`: a limit or a policy ended the run (`stoppedBy`).
 * `failed`: an error ended it. `cancelled`: its signal did. The report keeps what was done.
 */
export type StudyStatus = 'completed' | 'stopped' | 'failed' | 'cancelled';

export type StudyStopReason = 'maxModelCalls' | 'timeoutMs' | 'policy';

export interface StudyPassageState {
  passage: StudyPassage;
  /**
   * `unchecked`: it has items the guardian did not judge yet. `partial`: its items were judged,
   * but the run stopped before the passage ended (its redo, or the prior-art search of design).
   */
  state: 'complete' | 'partial' | 'unchecked' | 'notRun';
  /** Times it was generated in its last run: 2 when the guardian made it redo. */
  attempts: number;
  /** The passages that reopened it (loops). */
  reopenedBy: StudyPassage[];
  /** The attempt whose items it kept, when the redo was worse than the first. */
  keptAttempt?: number;
  /** The redo it discarded for a better first attempt, and the items the guardian kept of it. */
  discarded?: { attempt: number; items: number };
  runId?: string;
}

export type StudyNoticeCode =
  | 'noSources'
  | 'stopped'
  | 'failed'
  | 'cancelled'
  | 'passagesNotRun'
  | 'uncheckedItems'
  | 'searchesSkipped'
  | 'leadsNotVerified'
  | 'analoguesNotDeconstructed'
  | 'noDesign'
  | 'noCapability'
  | 'minimumsNotMet'
  | 'untracedAssembly'
  | 'passagesOutdated'
  | 'capabilitiesToVerify'
  | 'capabilitiesExist'
  | 'noveltiesToVerify';

/**
 * What the reader must know before reading the dossier: a code the dossier renders in the
 * study's language (`studyLabels(language).noticeTexts`), with its parameters and details, and
 * the same notice in English.
 */
export interface StudyNotice {
  code: StudyNoticeCode;
  /** Values the notice names: `limit`, `error`, `count`. */
  params?: Record<string, string>;
  /** The passages, collections, leads or breakthroughs concerned. */
  details?: string[];
  /** The notice in English. */
  message: string;
}

/** For each piece, the object at its time, the best current realisations and our proposal. */
export interface StudyPieceStates {
  piece: string;
  atItsTime: StudyThreeState[];
  currentBest: StudyThreeState[];
  proposal: StudyThreeState[];
}

/**
 * The numbers of a study since its last `restart`. Amendments are classified in runs of their
 * own: they are counted apart, in `amendments`.
 */
export interface StudyStats {
  /** Runs of `run()`. */
  runs: number;
  /** Model calls the vendor answered in those runs (repairs and checks included). */
  modelCalls: number;
  /** Amendments classified, and the model calls the vendor answered for them. */
  amendments: { count: number; modelCalls: number };
  searches: number;
  searchesSkipped: number;
  results: number;
  items: number;
  /** Items removed: off the objective (guardian) or refused by the schema. */
  rejected: number;
  byStatus: Record<StudyClaimStatus, number>;
  /** Claims whose declared status the study lowered. */
  downgraded: number;
  noveltiesToVerify: number;
  /** Passages redone after the guardian rejected too many items. */
  redos: number;
  /** Earlier passages reopened. */
  loops: number;
}

export interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  /** SHA-256 of the charter, recorded in `study.started`. */
  charterHash: string;
  /** Accepted and refused amendments, in order. */
  amendments: StudyAmendment[];
  /** Status of the last run (`notRun` before the first). */
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];
  passages: StudyPassageState[];
  observations: StudyObservation[];
  /** The component map, with the unknowns of each piece. */
  pieces: StudyPiece[];
  chain: StudyChainStage[];
  threeStates: StudyPieceStates[];
  historicalChoices: StudyHistoricalChoice[];
  advances: StudyAdvance[];
  leadVerdicts: StudyLeadVerdict[];
  /** The user's leads that received no verdict. */
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];
  references: StudyReference[];
  /** Breakthroughs by assembly, the named ones and those the study found. */
  analogues: StudyAnalogue[];
  /** The named breakthroughs the study did not deconstruct. */
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];
  revisableDecisions: StudyRevisableDecision[];
  combinations: StudyCombination[];
  /** Candidate new capabilities (when the charter names none). */
  capabilities: StudyCapability[];
  /** Capabilities first, then improvements. */
  architectures: StudyArchitecture[];
  noveltyClaims: StudyNoveltyClaim[];
  experiments: StudyExperiment[];
  cards: MechanismCard[];
  results: StudySearchResult[];
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  /** The runs of the study, oldest first. */
  runIds: string[];
}

export interface StudyResult {
  runId: string;
  status: StudyStatus;
  stoppedBy?: StudyStopReason;
  error?: Error;
  report: StudyReport;
  /** The report as a readable dossier, in the study's language. */
  markdown: string;
}

/** The result of an experiment the user ran: fields 10 and 11 of a card. */
export interface StudyExperimentOutcome {
  /** What was found. */
  result: string;
  /** Where the explanation fails. */
  error?: string;
  /** What is kept, what changes, where the mechanism could be reused. */
  conclusion?: string;
}
