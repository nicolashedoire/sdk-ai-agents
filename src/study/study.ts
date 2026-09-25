import type { PolicyEngine } from '../engines/policy-engine.js';
import { SDKError, ValidationError } from '../errors/index.js';
import type { LLMProvider } from '../providers/llm-provider.js';
import type { IEventStore } from '../stores/event-store.js';
import { finishWatch, type LiveSubscription, watchRun } from '../stores/observed-event-store.js';
import type { LiveEventListener, LiveSubscriptionOptions } from '../types/events.js';
import type { Tool } from '../types/tool.js';
import { generateRunId } from '../utils/id.js';
import { truncate } from '../utils/truncate.js';
import { v4 as uuidv4 } from 'uuid';
import {
  COLLECTIONS,
  PASSAGES,
  type PassageSpec,
  passageSpec,
  type StudyCollection,
  type StudyCollections,
  TRACEABLE,
} from './passages.js';
import {
  applyPriorArt,
  leaveToVerify,
  type ProposedComponent,
  settleClaim,
  settleComponent,
  traceOf,
} from './study-claims.js';
import { type StudySettings, studySettings } from './study-config.js';
import { studyReason } from './study-labels.js';
import { renderStudyMarkdown } from './study-markdown.js';
import { StudyModel, StudyReplyError } from './study-model.js';
import {
  amendmentPrompt,
  type ClaimedNovelty,
  guardianPrompt,
  listedResultIds,
  passagePrompt,
  type PromptFrame,
  priorArtCheckPrompt,
  priorArtQueriesPrompt,
  queriesPrompt,
  type RecordsForPrompt,
} from './study-prompts.js';
import {
  parseAmendmentReply,
  parseGuardianReply,
  parsePassageReply,
  parsePriorArtReply,
  parseQueriesReply,
  type PassageReply,
  type RefusedItem,
  type ReopenRequest,
  type RequestedSearch,
} from './study-replies.js';
import { buildStudyReport, type PassageRecord, type StoredItem } from './study-report.js';
import { StudyRecorder, StudyRun, StudyStop } from './study-run.js';
import { readResults, ResultRegistry, resolveSources, type SearchSource } from './study-sources.js';
import type {
  MechanismCard,
  StudyAmendment,
  StudyAmendOptions,
  StudyArchitecture,
  StudyAssemblyLink,
  StudyCharter,
  StudyClaim,
  StudyConfig,
  StudyDriftEntry,
  StudyExperimentOutcome,
  StudyPassage,
  StudyReason,
  StudyReasonCode,
  StudyReport,
  StudyResult,
  StudyRunOptions,
  StudySearch,
  StudySearchResult,
  StudyStatus,
  StudyStopReason,
} from './study-types.js';

/**
 * @internal What a study uses of the SDK: its provider, store, policies and governed tools.
 * `sdk.createStudy` gives it; it is not part of the package's API.
 */
export interface StudyEnvironment {
  provider: LLMProvider;
  eventStore: IEventStore;
  /** The store that delivers live events, for `onEvent`. */
  liveEvents: {
    subscribe?(listener: LiveEventListener, options?: LiveSubscriptionOptions): LiveSubscription;
  };
  /** Budgets per period count the study's model calls; budget policies are checked. */
  policyEngine?: PolicyEngine;
  findTool(name: string): Tool | undefined;
  /** The SDK's governed tool execution: allowlists, policies, budgets, retries, traces. */
  executeTool(
    name: string,
    parameters: Record<string, unknown>,
    options: { runId: string; agentId: string; allowedTools: string[]; signal: AbortSignal }
  ): Promise<unknown>;
}

/** Searches asked for at once, before a passage or for the prior art of its novelties. */
const MAX_QUERIES_PER_REQUEST = 6;

/** Amendments a study accepts, and the length of one: instructions never pile up. */
export const MAX_AMENDMENTS = 10;
export const MAX_AMENDMENT_LENGTH = 500;

/** Longest wait for an amendment's classification, by default. */
const AMENDMENT_TIMEOUT_MS = 60_000;

/** The longest delay a Node.js timer holds; longer ones would fire at once. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/** How a passage is performed in a run. */
interface PassageMode {
  /** Reopened by a later passage, on one unknown: its new items are added to the earlier ones. */
  reopened?: { by: StudyPassage; focus: string; reason: string };
  /** The redo a stopped run owed it: the first attempt, what was rejected, its results. */
  redo?: {
    first: Attempt;
    feedback: Array<{ statement: string; reason: string }>;
    results: string[];
  };
}

/** A passage's reply, and what its prompt listed: the only ids its items may cite. */
interface Generated {
  reply: PassageReply;
  /** Result ids the prompt listed. */
  listed: ReadonlySet<string>;
  /** Ids of the investigation's records the prompt listed, which a design part may cite. */
  traceable: ReadonlySet<string>;
}

/** One attempt of a passage: what the guardian kept of it, and what its reply asked. */
interface Attempt {
  attempt: number;
  kept: StoredItem[];
  reopen?: ReopenRequest;
  /** Verdicts it gave again on leads already judged. */
  duplicates: RefusedItem[];
}

/**
 * A researcher: it understands an object, then proposes how to organise it with the knowledge
 * and techniques of today, passage by passage, and designs the experiments that would decide.
 * It builds, runs and measures nothing. Create it with `sdk.createStudy`.
 *
 * It is made to stay on its objective. The charter is frozen and hashed at creation. Every
 * model call is built afresh from the charter, the accepted amendments, the passage's task and
 * the compact records it needs, and ends with the objective: nothing is inherited from a
 * conversation. Every item says what it serves; after each passage a guardian removes the items
 * off the objective, logs them, and has the passage redone once when too many were; an item it
 * gave no valid verdict stays unchecked and never reaches a later prompt. An amendment is
 * accepted only when it refines the charter. Claim statuses are checked in code: `established`
 * needs a result listed in the prompt that wrote the claim, `novelty` a search for prior art.
 */
export class Study {
  readonly id = `study_${uuidv4()}`;
  readonly name: string;
  /** Frozen: a new objective is a new study. */
  readonly charter: StudyCharter;
  /** SHA-256 of the charter, recorded in `study.started`. */
  readonly charterHash: string;
  readonly language: string;

  private readonly settings: StudySettings;
  private readonly sources: SearchSource[];
  private readonly model: StudyModel;
  private readonly recorder: StudyRecorder;
  private registry = new ResultRegistry();
  /** The wait a throttled search's service asked for, by its entry. */
  private readonly throttleWaits = new WeakMap<StudySearch, number>();
  private readonly searches: StudySearch[] = [];
  private readonly driftLog: StudyDriftEntry[] = [];
  private readonly amendmentLog: StudyAmendment[] = [];
  private readonly records = new Map<StudyPassage, PassageRecord>();
  private readonly lastIds = new Map<string, number>();
  private readonly runIds: string[] = [];
  private readonly unsearched = new Set<StudyPassage>();
  private totals = { modelCalls: 0, redos: 0, loops: 0 };
  private readonly amendmentTotals = { count: 0, modelCalls: 0 };
  private last?: { status: StudyStatus; stoppedBy?: StudyStopReason; error?: string };
  private running = false;
  /** The amendment classified last: the next one waits for it. */
  private amending: Promise<unknown> = Promise.resolve();

  constructor(
    config: StudyConfig,
    private readonly environment: StudyEnvironment
  ) {
    this.settings = studySettings(config);
    this.sources = resolveSources(this.settings.sources, (name) => environment.findTool(name));
    this.name = this.settings.name;
    this.charter = this.settings.charter;
    this.charterHash = this.settings.charterHash;
    this.language = this.settings.language;
    this.model = new StudyModel(this.settings.llmProvider ?? environment.provider, {
      model: this.settings.model,
      ...(this.settings.maxTokens ? { maxTokens: this.settings.maxTokens } : {}),
    });
    this.recorder = new StudyRecorder(environment.eventStore, { id: this.id, name: this.name });
  }

  /** Accepted and refused amendments, in order. */
  get amendments(): StudyAmendment[] {
    return structuredClone(this.amendmentLog);
  }

  /** The report as it stands, with the results recorded since the last run. */
  report(): StudyReport {
    return buildStudyReport({
      studyId: this.id,
      name: this.name,
      language: this.language,
      charter: this.charter,
      charterHash: this.charterHash,
      hasSources: this.sources.length > 0,
      amendments: this.amendmentLog,
      ...(this.last ? { last: this.last } : {}),
      records: this.records,
      results: this.registry.all(),
      searches: this.searches,
      driftLog: this.driftLog,
      unsearched: [...this.unsearched],
      totals: this.totals,
      amendmentTotals: this.amendmentTotals,
      runIds: this.runIds,
      minimums: this.minimums(),
    });
  }

  /**
   * Runs the passages, resuming where the last run stopped: the guardian first judges what that
   * run left unjudged, then the passages not complete run (a passage judged but not finished,
   * such as a design whose prior-art search was cut short, only finishes). `restart` starts the
   * study over. Limits, a budget policy, a cancellation or an error end the run with its status
   * and the report of what was done: nothing done is thrown away. Throws only for a run already
   * in progress, an `onEvent` that cannot be served, or an event store that fails.
   */
  async run(options: StudyRunOptions = {}): Promise<StudyResult> {
    if (this.running) {
      throw new ValidationError('run', 'this study is already running: wait for its run to end');
    }
    const runId = generateRunId();
    // Before anything is recorded, so the listener gets every event of the run.
    const watch = watchRun(this.environment.liveEvents, runId, options.onEvent);
    this.running = true;
    const { limits } = this.settings;
    const run = new StudyRun(runId, this.recorder, limits, this.environment.policyEngine, this.id);
    run.deadline = Date.now() + limits.timeoutMs;
    if (options.restart) this.startOver();
    this.runIds.push(runId);
    const timer = setTimeout(() => {
      run.timedOut = true;
      run.abort.abort();
    }, limits.timeoutMs);
    const cancel = () => run.abort.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      let outcome: { status: StudyStatus; stoppedBy?: StudyStopReason; error?: Error };
      try {
        await this.start(run);
        await this.runPassages(run);
        outcome = { status: 'completed' };
      } catch (error) {
        outcome = outcomeOf(run.stopFor(error));
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', cancel);
        this.totals.modelCalls += run.answered;
        this.totals.redos += run.redos;
        this.totals.loops += run.loops;
        for (const passage of run.unsearched) this.unsearched.add(passage);
      }
      this.last = {
        status: outcome.status,
        ...(outcome.stoppedBy ? { stoppedBy: outcome.stoppedBy } : {}),
        ...(outcome.error ? { error: truncate(outcome.error.message) } : {}),
      };
      const report = this.report();
      await this.finish(run, outcome, report);
      return {
        runId,
        status: outcome.status,
        ...(outcome.stoppedBy ? { stoppedBy: outcome.stoppedBy } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
        report,
        markdown: renderStudyMarkdown(report),
      };
    } finally {
      this.running = false;
      // Waits for the listener, unless the run was cancelled or timed out, or the caller
      // gives up.
      await finishWatch(watch, [run.signal, options.signal]);
    }
  }

  /**
   * Adds an instruction, classified by the guardian against the charter alone (never against
   * earlier amendments, so they cannot build on one another), in a run of its own where budget
   * policies are checked first: `refines` is accepted, numbered and shown under the charter in
   * every later prompt (those of a run in progress included); `conflicts` and
   * `changesObjective` are refused with the reason, and never reach a prompt. An amendment that
   * cannot be classified (an error, a policy, `options.timeoutMs`, `options.signal`) is refused
   * too. Since each is judged against the charter alone, two amendments that contradict each
   * other can both be accepted: each refines the charter, and the guardian judges every later
   * item against the charter and all of them. Amendments are classified one at a time, in the
   * order they were asked (the timeout of one counts from its turn). Throws a `ValidationError`
   * for an empty text, a text longer than 500 characters, or a study that already accepted 10
   * amendments when its turn comes.
   */
  amend(text: string, options: StudyAmendOptions = {}): Promise<StudyAmendment> {
    if (typeof text !== 'string' || text.trim() === '') {
      return Promise.reject(new ValidationError('text', 'must be a non-empty string'));
    }
    const instruction = text.trim();
    if (instruction.length > MAX_AMENDMENT_LENGTH) {
      return Promise.reject(
        new ValidationError(
          'text',
          `must be at most ${MAX_AMENDMENT_LENGTH} characters (an amendment refines the charter; a longer one is a new study)`
        )
      );
    }
    const timeoutMs = options.timeoutMs ?? AMENDMENT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      return Promise.reject(
        new ValidationError('timeoutMs', 'must be a whole number of milliseconds, at least 1')
      );
    }
    // One at a time: the limit is checked when each one's turn comes, never twice at once.
    const turn = this.amending.then(() => this.classifyAmendment(instruction, options, timeoutMs));
    this.amending = turn.catch(() => undefined);
    return turn;
  }

  private async classifyAmendment(
    instruction: string,
    options: StudyAmendOptions,
    timeoutMs: number
  ): Promise<StudyAmendment> {
    if (this.amendmentLog.filter((entry) => entry.accepted).length >= MAX_AMENDMENTS) {
      throw new ValidationError(
        'text',
        `this study already accepted ${MAX_AMENDMENTS} amendments: create a new study with a charter that says it all`
      );
    }
    const runId = generateRunId();
    // One call and its repair: nothing else runs in it.
    const run = new StudyRun(
      runId,
      this.recorder,
      { maxModelCalls: 2, maxSearches: 0, maxLoops: 0 },
      this.environment.policyEngine,
      this.id
    );
    const timer = setTimeout(() => {
      run.timedOut = true;
      run.abort.abort();
    }, timeoutMs);
    const cancel = () => run.abort.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    let verdict: StudyAmendment['verdict'];
    let reason: StudyReason;
    try {
      await run.record('run.started', {
        input: { message: instruction, context: { study: this.name } },
        mode: 'study-amendment',
      });
      try {
        await this.admitStep(run);
        const classified = await this.model.ask(run, {
          purpose: 'amendment',
          temperature: 0,
          messages: (rejection) => amendmentPrompt(this.frame(), instruction, rejection),
          parse: (reply) => parseAmendmentReply(reply),
        });
        verdict = classified.verdict;
        reason = studyReason('judged', { text: classified.reason });
      } catch (error) {
        // Fail closed: what could not be classified is refused, the objective first.
        verdict = 'unclassified';
        reason = unclassifiedReason(run.stopFor(error));
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      this.amendmentTotals.count++;
      this.amendmentTotals.modelCalls += run.answered;
    }
    const accepted = verdict === 'refines';
    const amendment: StudyAmendment = {
      ...(accepted
        ? { number: this.amendmentLog.filter((entry) => entry.accepted).length + 1 }
        : {}),
      text: instruction,
      verdict,
      accepted,
      reason,
      runId,
    };
    this.amendmentLog.push(amendment);
    const { runId: _runId, ...recorded } = amendment;
    await run.record(accepted ? 'study.amendment_accepted' : 'study.amendment_refused', {
      ...recorded,
      charterHash: this.charterHash,
    });
    await run.record('run.completed', { output: { verdict, accepted } });
    return structuredClone(amendment);
  }

  /**
   * Records the result of an experiment you ran: fields 10 (result and error) and 11
   * (conclusion and memory) of a mechanism card. Recorded as `study.result_recorded` in the
   * run that wrote the card. Throws a `ValidationError` for an unknown card or an empty result.
   */
  async recordResult(cardId: string, outcome: StudyExperimentOutcome): Promise<MechanismCard> {
    const card = this.records
      .get('confront')
      ?.items.find(
        (item) =>
          item.collection === 'cards' && item.claim.id === String(cardId).trim().toUpperCase()
      )?.claim as MechanismCard | undefined;
    if (!card) {
      const known = (this.records.get('confront')?.items ?? [])
        .filter((item) => item.collection === 'cards')
        .map((item) => item.claim.id);
      throw new ValidationError(
        'cardId',
        `no card "${String(cardId).slice(0, 40)}" in this study (cards: ${known.join(', ') || 'none yet'})`
      );
    }
    const result = typeof outcome?.result === 'string' ? outcome.result.trim() : '';
    if (!result) throw new ValidationError('result', 'must be a non-empty string');
    const error = typeof outcome.error === 'string' ? outcome.error.trim() : '';
    const conclusion = typeof outcome.conclusion === 'string' ? outcome.conclusion.trim() : '';
    card.resultAndError = { result, ...(error ? { error } : {}) };
    if (conclusion) card.conclusionAndMemory = conclusion;
    card.resultRecordedAt = Date.now();
    await this.recorder.record(card.runId, 'study.result_recorded', {
      card: card.id,
      resultAndError: card.resultAndError,
      ...(card.conclusionAndMemory ? { conclusionAndMemory: card.conclusionAndMemory } : {}),
    });
    return structuredClone(card);
  }

  /** Clears everything a restart does not keep: only the charter and amendments remain. */
  private startOver(): void {
    this.records.clear();
    this.registry = new ResultRegistry();
    this.searches.length = 0;
    this.driftLog.length = 0;
    this.unsearched.clear();
    this.lastIds.clear();
    this.runIds.length = 0;
    this.totals = { modelCalls: 0, redos: 0, loops: 0 };
    this.last = undefined;
  }

  private frame(): PromptFrame {
    return {
      charter: this.charter,
      charterHash: this.charterHash,
      amendments: this.amendmentLog.filter((amendment) => amendment.accepted),
      language: this.language,
    };
  }

  /** Items a collection needs in this study: candidates when the charter names no capability. */
  private minimums(): Partial<Record<StudyCollection, number>> {
    return { capabilities: this.charter.capability ? 0 : 1 };
  }

  private async start(run: StudyRun): Promise<void> {
    await run.record('run.started', {
      input: {
        message: this.charter.object,
        context: { study: this.name, objective: this.charter.objective },
      },
      mode: 'study',
    });
    const resumeAt = PASSAGES.find((spec) => needsWork(this.records.get(spec.passage)))?.passage;
    await run.record('study.started', {
      name: this.name,
      charter: this.charter,
      charterHash: this.charterHash,
      language: this.language,
      ...(this.settings.model ? { model: this.settings.model } : {}),
      sources: this.sources.map((source) => source.name),
      limits: this.settings.limits,
      driftThreshold: this.settings.driftThreshold,
      amendments: this.frame().amendments.map(({ number, text }) => ({ number, text })),
      ...(resumeAt && this.records.size > 0 ? { resumeAt } : {}),
    });
  }

  /**
   * The passages in order; a passage may reopen an earlier one. A passage left by a stopped
   * run is taken up where it stopped: the guardian judges first what it had not judged (never
   * skipped); items it keeps then reach the passages that had run without them (`catchUp`); a
   * passage judged but not finished takes the redo it was due, or finishes; one that was
   * waiting for a loop runs again.
   */
  private async runPassages(run: StudyRun): Promise<void> {
    for (const spec of PASSAGES) {
      const record = this.records.get(spec.passage);
      if (record) {
        if (record.items.some((item) => item.claim.unchecked)) {
          const judged = await this.judgeLeftovers(run, spec, record);
          if (judged.length > 0 && record.complete) await this.catchUp(run, spec, judged);
        }
        // Outdated passages run again as a loop does; without a loop left, they stay outdated.
        if (record.outdated && !run.catchingUp && run.loops < run.limits.maxLoops) {
          run.loops++;
          run.catchingUp = true;
        }
        if (record.complete && !(record.outdated && run.catchingUp)) continue;
        if (!record.complete && !record.awaitingLoop) {
          // Stopped after its guardian: the redo rules apply as they would have, then it ends.
          const redo = await this.redoDue(run, spec, record);
          if (!redo) {
            await this.completePassage(run, spec, record, {}, { resumed: true });
            continue;
          }
          await this.loop(run, spec, await this.performPassage(run, spec, { redo }));
          continue;
        }
      }
      await this.loop(run, spec, await this.performPassage(run, spec, {}));
    }
  }

  /** Reopens the earlier passage a passage asked for, then runs that passage again. */
  private async loop(
    run: StudyRun,
    spec: PassageSpec,
    reopen: ReopenRequest | undefined
  ): Promise<void> {
    let request = reopen;
    while (request) {
      run.loops++;
      const reopened = { by: spec.passage, focus: request.focus, reason: request.reason };
      await this.performPassage(run, passageSpec(request.passage), { reopened });
      // The passage that was blocked runs again, with what the reopened one added.
      request = await this.performPassage(run, spec, {});
    }
  }

  /**
   * Items the guardian judged late, in a passage already complete, reach the passages that ran
   * without them: a design gets their prior-art search, and the later passages that read their
   * collections run again, as a loop does (`limits.maxLoops`). Without a loop left, those
   * passages stay outdated, and the report says so.
   */
  private async catchUp(run: StudyRun, spec: PassageSpec, judged: StoredItem[]): Promise<void> {
    if (spec.passage === 'design') await this.checkPriorArt(run);
    this.markOutdated(spec, new Set(judged.map((item) => item.collection)));
  }

  /**
   * Marks outdated the later passages, already complete, that read one of `changed`; stops at a
   * passage waiting for its loop, since what follows it has not run since.
   */
  private markOutdated(spec: PassageSpec, changed: Set<StudyCollection>): void {
    for (const later of PASSAGES.filter((candidate) => candidate.number > spec.number)) {
      const record = this.records.get(later.passage);
      if (!record) return;
      if (record.awaitingLoop) return;
      if (record.complete && later.needs.some((key) => changed.has(key))) record.outdated = true;
    }
  }

  /**
   * The redo a passage stopped after its first attempt's guardian was due, by the same rules as
   * in a run: past the drift threshold, or a design without any capability.
   */
  private async redoDue(
    run: StudyRun,
    spec: PassageSpec,
    record: PassageRecord
  ): Promise<PassageMode['redo']> {
    const generation = record.generation;
    if (!generation || generation.attempt !== 1) return undefined;
    const drifted =
      generation.produced > 0 &&
      generation.rejected.length / generation.produced > this.settings.driftThreshold;
    const aimless =
      spec.passage === 'design' ? await this.guardCapability(run, record.items, 1) : [];
    if (!drifted && aimless.length === 0) return undefined;
    run.redos++;
    return {
      first: {
        attempt: 1,
        kept: [...record.items],
        ...(generation.reopen ? { reopen: generation.reopen } : {}),
        duplicates: [],
      },
      feedback: feedbackOf([...generation.rejected, ...aimless]),
      results: generation.results,
    };
  }

  /**
   * One passage: its searches, its items, the guardian's check (and one redo past the drift
   * threshold, keeping the better of the two attempts), then its end (`completePassage`). Its
   * items are kept as soon as they exist, so a run that stops keeps them, unchecked; a redo that
   * cannot be judged leaves the first attempt standing. Returns the earlier passage it asks to
   * reopen, when a loop is left: it is then not complete.
   */
  private async performPassage(
    run: StudyRun,
    spec: PassageSpec,
    mode: PassageMode
  ): Promise<ReopenRequest | undefined> {
    await this.admitStep(run, spec.passage);
    const amendments = this.frame().amendments.map((amendment) => amendment.number);
    const earlier = this.records.get(spec.passage);
    await run.record('study.passage_started', {
      passage: spec.passage,
      number: spec.number,
      amendments,
      ...(mode.reopened
        ? { reopenedBy: mode.reopened.by, focus: mode.reopened.focus, reason: mode.reopened.reason }
        : {}),
      ...(mode.redo ? { redo: true, resumed: true } : {}),
      ...(earlier?.outdated && !mode.reopened ? { outdated: true } : {}),
    });
    const results = mode.redo
      ? this.resultsById(mode.redo.results)
      : spec.researches
        ? await this.research(run, spec, mode)
        : [];

    // A reopened passage adds to its items; otherwise a new attempt replaces them.
    const kept = mode.reopened ? [...(earlier?.items ?? [])] : [];
    const record: PassageRecord = {
      passage: spec.passage,
      items: earlier?.items ?? [],
      complete: mode.reopened ? (earlier?.complete ?? false) : false,
      attempts: 0,
      reopenedBy: [...(earlier?.reopenedBy ?? []), ...(mode.reopened ? [mode.reopened.by] : [])],
      runId: run.runId,
    };

    let feedback = mode.redo?.feedback;
    let first = mode.redo?.first;
    let chosen = first;
    for (let attempt = mode.redo ? 2 : 1; attempt <= 2; attempt++) {
      // A redo is a step of its own: the budget policies are checked again before it.
      if (attempt === 2 && !mode.redo) await this.admitStep(run, spec.passage);
      let current: Attempt;
      let rejected: StudyDriftEntry[];
      let aimless: StudyDriftEntry[];
      try {
        const generated = await this.generate(run, spec, { results, mode, feedback });
        const batch = this.settle(run, spec, generated);
        record.items = [...kept, ...batch];
        record.attempts = attempt;
        this.records.set(spec.passage, record);
        const refused = await this.logRefused(run, spec.passage, generated.reply.refused, attempt);
        record.generation = {
          attempt,
          produced: batch.length + refused.length,
          rejected: [...refused],
          results: results.map((result) => result.id),
          ...(generated.reply.reopen ? { reopen: generated.reply.reopen } : {}),
        };
        const removed = await this.guard(run, spec.passage, batch, attempt);
        record.generation.rejected.push(...removed.map((entry) => entry.drift));
        const keptBatch = batch.filter((item) => !removed.some((entry) => entry.item === item));
        record.items = [...kept, ...keptBatch];
        // A design that aims at no new capability is off the objective as a whole.
        aimless =
          spec.passage === 'design' && !mode.reopened
            ? await this.guardCapability(run, keptBatch, attempt)
            : [];
        rejected = record.generation.rejected;
        current = {
          attempt,
          kept: keptBatch,
          ...(generated.reply.reopen ? { reopen: generated.reply.reopen } : {}),
          duplicates: generated.reply.duplicates,
        };
      } catch (error) {
        // A redo that could not be judged leaves the first attempt standing.
        if (first) {
          record.items = [...kept, ...first.kept];
          record.keptAttempt = first.attempt;
          record.generation = undefined;
          this.records.set(spec.passage, record);
        }
        throw error;
      }
      // A redo worse than the first attempt does not replace it: it is discarded, and said so.
      if (first && this.better(spec, first, current)) {
        record.items = [...kept, ...first.kept];
        record.keptAttempt = first.attempt;
        record.discarded = { attempt: current.attempt, items: current.kept.length };
        chosen = first;
        break;
      }
      chosen = current;

      // Past the threshold, or without a capability, the passage is redone once, told what
      // was rejected and why.
      const drifted =
        record.generation.produced > 0 &&
        rejected.length / record.generation.produced > this.settings.driftThreshold;
      if (attempt === 1 && (drifted || aimless.length > 0)) {
        run.redos++;
        first = current;
        feedback = feedbackOf([...rejected, ...aimless]);
        continue;
      }
      break;
    }

    const extra = chosen?.duplicates.length ? { duplicates: chosen.duplicates } : {};
    const reopen = mode.reopened ? undefined : chosen?.reopen;
    if (reopen && run.loops < run.limits.maxLoops) {
      // It runs again after the loop: not complete, and no prior-art search on it yet.
      record.awaitingLoop = true;
      await this.recordCompleted(run, record, mode, { ...extra, reopen });
      return reopen;
    }
    await this.completePassage(run, spec, record, mode, extra);
    // Its items changed after the passages that read them ran: they run again.
    if (earlier?.outdated && !mode.reopened) {
      this.markOutdated(spec, new Set(spec.collections.map((collection) => collection.key)));
    }
    return undefined;
  }

  /** The end of a passage: design's prior-art search, then complete. */
  private async completePassage(
    run: StudyRun,
    spec: PassageSpec,
    record: PassageRecord,
    mode: PassageMode,
    extra: { resumed?: boolean; duplicates?: RefusedItem[] } = {}
  ): Promise<void> {
    if (extra.resumed) await this.admitStep(run, spec.passage);
    if (spec.passage === 'design' && !mode.reopened) await this.checkPriorArt(run);
    record.awaitingLoop = undefined;
    record.generation = undefined;
    if (!mode.reopened) record.complete = true;
    await this.recordCompleted(run, record, mode, extra);
  }

  private recordCompleted(
    run: StudyRun,
    record: PassageRecord,
    mode: PassageMode,
    extra: { reopen?: ReopenRequest; resumed?: boolean; duplicates?: RefusedItem[] }
  ): Promise<void> {
    const { duplicates, ...rest } = extra;
    return run.record('study.passage_completed', {
      passage: record.passage,
      attempts: record.attempts,
      ...(record.keptAttempt ? { keptAttempt: record.keptAttempt } : {}),
      ...(record.discarded ? { discarded: record.discarded } : {}),
      items: record.items.map(({ collection, claim: { runId: _runId, ...claim } }) => ({
        collection,
        ...claim,
      })),
      ...(mode.reopened ? { reopenedBy: mode.reopened.by } : {}),
      // Verdicts given again on leads already judged: dropped, and not drift.
      ...(duplicates?.length ? { duplicates } : {}),
      ...rest,
    });
  }

  /**
   * Whether attempt `a` is strictly better than `b`: for design, one aiming at a new
   * capability first; then one meeting every minimum once judged; then the more items kept.
   */
  private better(spec: PassageSpec, a: Attempt, b: Attempt): boolean {
    const score = (attempt: Attempt): number[] => {
      const judged = attempt.kept.filter((item) => !item.claim.unchecked);
      const aims = judged.some(
        (item) =>
          item.collection === 'architectures' &&
          (item.claim as StudyArchitecture).kind === 'capability'
      );
      const minimums = this.minimums();
      const met = spec.collections.every(
        (collection) =>
          judged.filter((item) => item.collection === collection.key).length >=
          (minimums[collection.key] ?? collection.min)
      );
      return [spec.passage === 'design' && aims ? 1 : 0, met ? 1 : 0, judged.length];
    };
    const [first, second] = [score(a), score(b)];
    for (let index = 0; index < first.length; index++) {
      if ((first[index] ?? 0) !== (second[index] ?? 0)) {
        return (first[index] ?? 0) > (second[index] ?? 0);
      }
    }
    return false;
  }

  /**
   * The guardian judges, first, what a stopped run left unjudged (or what it gave no valid
   * verdict): nothing unjudged goes further. Returns the items it judged and kept.
   */
  private async judgeLeftovers(
    run: StudyRun,
    spec: PassageSpec,
    record: PassageRecord
  ): Promise<StoredItem[]> {
    await this.admitStep(run, spec.passage);
    const pending = record.items.filter((item) => item.claim.unchecked);
    const removed = await this.guard(run, spec.passage, pending, Math.max(1, record.attempts));
    record.generation?.rejected.push(...removed.map((entry) => entry.drift));
    record.items = record.items.filter((item) => !removed.some((entry) => entry.item === item));
    return pending.filter(
      (item) => !item.claim.unchecked && !removed.some((entry) => entry.item === item)
    );
  }

  /**
   * Checks the budget and timeout policies before a step (a passage, a redo, an amendment), as
   * a cognitive agent does before a step: past a limit the run stops, with what was done.
   */
  private async admitStep(run: StudyRun, passage?: StudyPassage): Promise<void> {
    run.checkpoint();
    run.steps++;
    const progress = run.meter.startStep(run.steps);
    const { policyEngine } = this.environment;
    if (!policyEngine) return;
    const validation = await policyEngine.validateRunStep({
      runId: run.runId,
      agentId: this.id,
      currentStep: progress.step,
      tokensUsed: progress.tokensUsed,
      startTime: progress.startedAt,
    });
    if (validation.allowed) return;
    const reason = validation.reason ?? 'Policy violation';
    await run.record('policy.violated', {
      intention: { type: 'continue' },
      ...(passage ? { passage } : {}),
      reason,
      violatedPolicies: validation.violatedPolicies ?? [],
    });
    throw new StudyStop('policy', reason);
  }

  private async generate(
    run: StudyRun,
    spec: PassageSpec,
    input: {
      results: StudySearchResult[];
      mode: PassageMode;
      feedback: Array<{ statement: string; reason: string }> | undefined;
    }
  ): Promise<Generated> {
    const records = this.recordsFor(spec);
    const citedResults = this.citedResults(records);
    const hasSources = this.sources.length > 0;
    const listed = listedResultIds(input.results, citedResults, hasSources);
    const traceable = new Set(
      TRACEABLE.flatMap((key) => (records[key] ?? []).map((item) => item.id))
    );
    const earlier = PASSAGES.filter((candidate) => candidate.number < spec.number).map(
      (candidate) => candidate.passage
    );
    // Reopening is offered only while a loop is left (`runPassages` bounds the loops), and
    // never to a passage that was itself reopened.
    const reopenable = input.mode.reopened || run.loops >= run.limits.maxLoops ? [] : earlier;
    const judgedLeads = input.mode.reopened
      ? this.itemsOf('leadVerdicts').map((verdict) => verdict.lead)
      : [];
    const reply = await this.model.ask(run, {
      purpose: 'passage',
      passage: spec.passage,
      temperature: this.settings.temperature,
      messages: (rejection) =>
        passagePrompt(this.frame(), {
          spec,
          records,
          results: input.results,
          citedResults,
          hasSources,
          ...(input.mode.reopened ? { reopened: input.mode.reopened } : {}),
          ...(input.feedback ? { driftFeedback: input.feedback } : {}),
          reopenable,
          ...(rejection ? { rejection } : {}),
        }),
      parse: (text, final) =>
        parsePassageReply(spec, text, {
          leads: this.charter.leads,
          judgedLeads,
          analogues: this.charter.analogues,
          reopenable: earlier,
          minimums: this.minimums(),
          reopened: input.mode.reopened !== undefined,
          final,
        }),
    });
    return { reply, listed, traceable };
  }

  /**
   * Gives each proposed item its id and a status the study checked against what its prompt
   * listed: the results it may cite, and the records a design part may come from.
   */
  private settle(run: StudyRun, spec: PassageSpec, generated: Generated): StoredItem[] {
    const chain = this.itemsOf('chain').map((stage) => stage.stage);
    const context = {
      passage: spec.passage,
      runId: run.runId,
      listed: (id: string) => generated.listed.has(id),
      hasSources: this.sources.length > 0,
    };
    const traceable = (id: string) => generated.traceable.has(id);
    return generated.reply.items.map((proposed) => {
      const collection = COLLECTIONS.find((candidate) => candidate.key === proposed.collection);
      const claim = settleClaim(this.nextId(collection?.prefix ?? '?'), proposed, context);
      claim.unchecked = true;
      if (proposed.collection === 'architectures') {
        const architecture = claim as StudyArchitecture;
        // Each component is a claim of its own; the architecture's status is its assembly's.
        architecture.components = (proposed.fields.components as ProposedComponent[]).map(
          (component) => settleComponent(component, context, traceable)
        );
        architecture.assembly = (
          proposed.fields.assembly as Array<StudyAssemblyLink & { from: string[] }>
        ).map((link) => ({ ...link, ...traceOf(link.from, traceable) }));
        const covered = new Set(architecture.chain.map((entry) => stageKey(entry.stage)));
        architecture.uncoveredStages = chain.filter((stage) => !covered.has(stageKey(stage)));
      }
      return { collection: proposed.collection, claim };
    });
  }

  private async logRefused(
    run: StudyRun,
    passage: StudyPassage,
    refused: RefusedItem[],
    attempt: number
  ): Promise<StudyDriftEntry[]> {
    const entries: StudyDriftEntry[] = [];
    for (const item of refused) {
      entries.push(
        await this.logDrift(run, {
          passage,
          collection: item.collection,
          item: item.item,
          reason: item.reason,
          by: 'schema',
          attempt,
          runId: run.runId,
        })
      );
    }
    return entries;
  }

  /**
   * The guardian's check: a separate call that sees only the charter, the amendments and the
   * items (an architecture with its aim, mechanism and assembly). It fails closed: an item
   * without a valid verdict stays unchecked, and a guardian that judged none of them fails the
   * run. Returns the items it judged off the objective, logged in the drift log. A capability
   * it judges only faster or cheaper becomes an improvement, with its reason.
   */
  private async guard(
    run: StudyRun,
    passage: StudyPassage,
    batch: StoredItem[],
    attempt: number
  ): Promise<Array<{ item: StoredItem; drift: StudyDriftEntry }>> {
    if (batch.length === 0) return [];
    const shown = batch.map(({ collection, claim }) => ({
      id: claim.id,
      statement: claim.statement,
      servesObjective: claim.servesObjective,
      ...(collection === 'architectures' ? aimOf(claim as StudyArchitecture) : {}),
    }));
    const ids = shown.map((item) => item.id);
    const verdicts = await this.model.ask(run, {
      purpose: 'check',
      passage,
      temperature: 0,
      messages: (rejection) => guardianPrompt(this.frame(), passage, shown, rejection),
      parse: (reply, final) => parseGuardianReply(reply, ids, final),
    });
    if (verdicts.size === 0) {
      throw new StudyReplyError(
        { purpose: 'check', passage },
        'the guardian gave no valid verdict: the items stay unchecked, and the next run has them judged first'
      );
    }
    const removed: Array<{ item: StoredItem; drift: StudyDriftEntry }> = [];
    for (const item of batch) {
      const verdict = verdicts.get(item.claim.id);
      // Without a valid verdict, an item stays unchecked: never taken as judged.
      if (!verdict) continue;
      if (!verdict.onObjective) {
        const drift = await this.logDrift(run, {
          passage,
          collection: item.collection,
          item: {
            id: item.claim.id,
            statement: item.claim.statement,
            servesObjective: item.claim.servesObjective,
          },
          reason: studyReason('judged', { text: verdict.reason }),
          by: 'guardian',
          attempt,
          runId: run.runId,
        });
        removed.push({ item, drift });
        continue;
      }
      item.claim.unchecked = undefined;
      const architecture = item.claim as StudyArchitecture;
      if (
        item.collection === 'architectures' &&
        architecture.kind === 'capability' &&
        verdict.newCapability === false
      ) {
        architecture.kind = 'improvement';
        architecture.declaredKind = 'capability';
        architecture.kindReason = studyReason('judged', {
          text: verdict.capabilityReason ?? verdict.reason,
        });
        await run.record('study.capability_demoted', {
          passage,
          item: architecture.id,
          name: architecture.name,
          reason: architecture.kindReason,
        });
      }
    }
    return removed;
  }

  /**
   * A design whose architectures are all improvements (only faster or cheaper, as declared or
   * as the guardian judged them) is off the objective as a whole: logged, and redone once.
   */
  private async guardCapability(
    run: StudyRun,
    kept: StoredItem[],
    attempt: number
  ): Promise<StudyDriftEntry[]> {
    const aims = kept.some(
      (item) =>
        item.collection === 'architectures' &&
        !item.claim.unchecked &&
        (item.claim as StudyArchitecture).kind === 'capability'
    );
    if (aims) return [];
    return [
      await this.logDrift(run, {
        passage: 'design',
        collection: 'architectures',
        item: { statement: 'The design as a whole' },
        reason: studyReason('designWithoutCapability'),
        by: 'guardian',
        attempt,
        runId: run.runId,
      }),
    ];
  }

  private async logDrift(run: StudyRun, entry: StudyDriftEntry): Promise<StudyDriftEntry> {
    this.driftLog.push(entry);
    const { runId: _runId, ...recorded } = entry;
    await run.record('study.drift_rejected', recorded);
    return entry;
  }

  /** Asks what to search, runs it through the sources, and returns the results found. */
  private async research(
    run: StudyRun,
    spec: PassageSpec,
    mode: PassageMode
  ): Promise<StudySearchResult[]> {
    if (this.sources.length === 0) return [];
    if (run.searchesLeft === 0) {
      run.unsearched.add(spec.passage);
      return [];
    }
    const max = Math.min(MAX_QUERIES_PER_REQUEST, run.searchesLeft);
    const records = this.recordsFor(spec);
    const requested = await this.model.ask(run, {
      purpose: 'queries',
      passage: spec.passage,
      temperature: this.settings.temperature,
      messages: (rejection) =>
        queriesPrompt(this.frame(), {
          spec,
          records,
          sources: this.sources,
          maxQueries: max,
          ...(mode.reopened ? { reopened: mode.reopened } : {}),
          ...(rejection ? { rejection } : {}),
        }),
      parse: (reply, final) =>
        parseQueriesReply(reply, { sources: this.sourceNames(), max, final }),
    });
    const found: string[] = [];
    for (const search of requested) {
      found.push(...(await this.search(run, spec.passage, 'research', search)).resultIds);
    }
    return this.resultsById(found);
  }

  /**
   * One search, through the SDK's governed tool execution, recorded as `study.search` with the
   * ids of its results. A search that fails is recorded with its error; the study goes on.
   */
  private async search(
    run: StudyRun,
    passage: StudyPassage,
    purpose: StudySearch['purpose'],
    request: RequestedSearch,
    options: { retry?: boolean } = {}
  ): Promise<StudySearch> {
    const base = {
      passage,
      purpose,
      tool: request.source,
      query: request.query,
      servesObjective: request.servesObjective,
      ...(request.claim ? { claims: [request.claim] } : {}),
      ...(options.retry ? { retry: true as const } : {}),
      runId: run.runId,
    };
    let entry: StudySearch;
    if (run.searchesLeft === 0) {
      run.unsearched.add(passage);
      run.skipped++;
      entry = { ...base, resultIds: [], skipped: 'maxSearches' };
    } else {
      run.searches++;
      const source = this.sources.find((candidate) => candidate.name === request.source);
      try {
        const output = await this.environment.executeTool(
          request.source,
          { [source?.queryParameter ?? 'query']: request.query },
          {
            runId: run.runId,
            agentId: this.id,
            allowedTools: this.sourceNames(),
            signal: run.signal,
          }
        );
        const results = readResults(output).slice(0, this.settings.limits.maxResultsPerSearch);
        const ids = results.map((result) =>
          this.registry.add(result, {
            tool: request.source,
            query: request.query,
            runId: run.runId,
          })
        );
        entry = { ...base, resultIds: [...new Set(ids)] };
      } catch (error) {
        const stop = run.stopFor(error);
        if (stop instanceof StudyStop) throw stop;
        const throttle = throttleOf(error);
        entry = {
          ...base,
          resultIds: [],
          error: truncate(searchError(error)),
          ...(throttle ? { throttled: true as const } : {}),
        };
        if (throttle?.retryAfterMs !== undefined)
          this.throttleWaits.set(entry, throttle.retryAfterMs);
      }
    }
    this.searches.push(entry);
    const { runId: _runId, ...recorded } = entry;
    await run.record('study.search', {
      ...recorded,
      results: this.resultsById(entry.resultIds).map(({ id, title, locator, date }) => ({
        id,
        title,
        locator,
        ...(date ? { date } : {}),
      })),
    });
    return entry;
  }

  /**
   * Searches the prior art of every claimed novelty not checked yet (the design's and the
   * crossings'), and of the assembly of every capability architecture whatever status the model
   * gave it, as a combination; then asks what the closest existing work is. A claim's prior art
   * rests only on the results of its own searches, at least one of them: a novelty without it
   * stays "to verify", with why.
   */
  private async checkPriorArt(run: StudyRun): Promise<void> {
    const claims = this.allClaims().filter(
      (claim) => !claim.priorArt && (claim.status === 'novelty' || isCapability(claim))
    );
    // Whatever happens next, a claim whose prior art is not assessed carries why, a capability
    // of any status included: never a silent gap.
    const mark = (claim: StudyClaim, code: StudyReasonCode) =>
      leaveToVerify(claim, code, isCapability(claim));
    for (const claim of claims) {
      mark(claim, this.sources.length === 0 ? 'priorArtNoSource' : 'priorArtNotSearchedYet');
    }
    if (claims.length === 0 || this.sources.length === 0) return;
    if (run.searchesLeft === 0) {
      run.unsearched.add('design');
      for (const claim of claims) mark(claim, 'priorArtSearchBudget');
      return;
    }
    const ids = claims.map((claim) => claim.id);
    const shown = claims.map(claimedNovelty);
    const max = Math.min(MAX_QUERIES_PER_REQUEST, run.searchesLeft);
    const requested = await this.model.ask(run, {
      purpose: 'priorArtQueries',
      passage: 'design',
      temperature: this.settings.temperature,
      messages: (rejection) =>
        priorArtQueriesPrompt(this.frame(), shown, this.sources, max, rejection),
      parse: (reply, final) =>
        parseQueriesReply(reply, { sources: this.sourceNames(), max, claims: ids, final }),
    });
    // For each claim, how its own searches went and the results they found.
    const searched = new Map<string, { ran: number; skipped: number; results: string[] }>();
    const count = (claim: string, entry: StudySearch) => {
      const tally = searched.get(claim) ?? { ran: 0, skipped: 0, results: [] };
      if (entry.skipped) tally.skipped++;
      else if (!entry.error) tally.ran++;
      tally.results.push(...entry.resultIds);
      searched.set(claim, tally);
    };
    const throttled: Array<{ search: RequestedSearch; entry: StudySearch }> = [];
    for (const search of requested) {
      if (!search.claim) continue;
      const entry = await this.search(run, 'design', 'priorArt', search);
      count(search.claim, entry);
      if (entry.throttled) throttled.push({ search, entry });
    }
    // A throttle is transient: a novelty check must not be lost to one. The searches it failed
    // are tried once more, after the wait their services asked for, when the run has time left
    // for it and for the second tries. A service that asked for more than a study waits
    // (150 s), or for more than the run has left, is never tried again sooner than it asked:
    // its claims stay to verify.
    const room = run.deadline - Date.now() - STUDY_TIME_AFTER_RETRY_MS;
    const waitFor = (entry: StudySearch) =>
      Math.max(STUDY_THROTTLE_WAIT_MS, this.throttleWaits.get(entry) ?? 0);
    const retried = throttled.filter(({ entry }) => {
      const wait = waitFor(entry);
      return wait <= STUDY_MAX_THROTTLE_WAIT_MS && wait <= room;
    });
    if (retried.length > 0 && run.searchesLeft > 0) {
      await pause(Math.max(...retried.map(({ entry }) => waitFor(entry))), run.signal).catch(() =>
        run.checkpoint()
      );
      run.checkpoint();
      for (const { search } of retried) {
        if (!search.claim) continue;
        count(search.claim, await this.search(run, 'design', 'priorArt', search, { retry: true }));
      }
    }
    for (const claim of claims) {
      const tally = searched.get(claim.id);
      mark(
        claim,
        !tally
          ? 'priorArtNotSearched'
          : tally.results.length > 0
            ? 'priorArtNotAssessed'
            : tally.ran > 0
              ? 'priorArtNoResult'
              : tally.skipped > 0
                ? 'priorArtSearchBudget'
                : 'priorArtSearchFailed'
      );
    }
    const checked = claims.filter((claim) => (searched.get(claim.id)?.results.length ?? 0) > 0);
    if (checked.length === 0) return;
    const results = this.resultsById(
      checked.flatMap((claim) => searched.get(claim.id)?.results ?? [])
    );
    const checkedIds = checked.map((claim) => claim.id);
    const checks = await this.model.ask(run, {
      purpose: 'priorArtCheck',
      passage: 'design',
      temperature: 0,
      messages: (rejection) =>
        priorArtCheckPrompt(this.frame(), checked.map(claimedNovelty), results, rejection),
      parse: (reply) => parsePriorArtReply(reply, checkedIds),
    });
    for (const claim of checked) {
      const check = checks.find((candidate) => candidate.claim === claim.id);
      if (!check) continue;
      // Only the results of this claim's own searches can show its prior art.
      const own = new Set(searched.get(claim.id)?.results ?? []);
      const sources = check.sources.filter((id) => own.has(id));
      if (sources.length === 0) {
        mark(claim, 'priorArtUnsupported');
        continue;
      }
      applyPriorArt(claim, { closest: check.closest, sources, verdict: check.verdict });
    }
  }

  private async finish(
    run: StudyRun,
    outcome: { status: StudyStatus; stoppedBy?: StudyStopReason; error?: Error },
    report: StudyReport
  ): Promise<void> {
    const summary = {
      status: outcome.status,
      ...(outcome.stoppedBy ? { stoppedBy: outcome.stoppedBy } : {}),
      passages: report.passages.map(({ passage, state }) => ({ passage, state })),
      // This run's numbers; the report's `stats` are the study's.
      stats: {
        modelCalls: run.answered,
        searches: run.searches,
        searchesSkipped: run.skipped,
        redos: run.redos,
        loops: run.loops,
        steps: run.steps,
      },
    };
    if (outcome.status === 'completed') {
      await run.record('study.completed', summary);
      await run.record('run.completed', { output: summary });
      return;
    }
    const error = truncate(outcome.error?.message ?? outcome.status);
    await run.record('study.failed', { ...summary, error, partial: true });
    await run.record(outcome.status === 'cancelled' ? 'run.cancelled' : 'run.failed', {
      ...(outcome.status === 'cancelled' ? { reason: error } : { error }),
    });
  }

  /** The compact records a passage needs from the earlier ones: only what the guardian judged. */
  private recordsFor(spec: PassageSpec): RecordsForPrompt {
    return Object.fromEntries(spec.needs.map((key) => [key, this.itemsOf(key)]));
  }

  private citedResults(records: RecordsForPrompt): StudySearchResult[] {
    const ids = Object.values(records).flatMap((items) =>
      (items ?? []).flatMap((item) => item.sources)
    );
    return this.resultsById(ids);
  }

  /** The judged items of a collection: an unchecked one never reaches a prompt. */
  private itemsOf<Key extends StudyCollection>(key: Key): StudyCollections[Key][] {
    return PASSAGES.flatMap((spec) =>
      (this.records.get(spec.passage)?.items ?? [])
        .filter((item) => item.collection === key && !item.claim.unchecked)
        .map((item) => item.claim as StudyCollections[Key])
    );
  }

  private allClaims(): StudyClaim[] {
    return PASSAGES.flatMap((spec) =>
      (this.records.get(spec.passage)?.items ?? [])
        .filter((item) => !item.claim.unchecked)
        .map((item) => item.claim)
    );
  }

  private resultsById(ids: string[]): StudySearchResult[] {
    return [...new Set(ids)].flatMap((id) => {
      const result = this.registry.get(id);
      return result ? [result] : [];
    });
  }

  private sourceNames(): string[] {
    return this.sources.map((source) => source.name);
  }

  /** Ids are never reused, even for items a redo replaced: the drift log keeps pointing right. */
  private nextId(prefix: string): string {
    const next = (this.lastIds.get(prefix) ?? 0) + 1;
    this.lastIds.set(prefix, next);
    return `${prefix}${next}`;
  }
}

/** A passage a run still has to work on: not complete, or with items the guardian must judge. */
function needsWork(record: PassageRecord | undefined): boolean {
  return (
    !record ||
    !record.complete ||
    record.outdated === true ||
    record.items.some((item) => item.claim.unchecked)
  );
}

/** What a redo is told: the items rejected, and why. */
function feedbackOf(rejected: StudyDriftEntry[]): Array<{ statement: string; reason: string }> {
  return rejected.map((entry) => ({
    statement: entry.item.statement ?? '(no statement)',
    reason: entry.reason.message,
  }));
}

/** The status a run ends with, from what stopped it. */
function outcomeOf(stopped: unknown): {
  status: StudyStatus;
  stoppedBy?: StudyStopReason;
  error?: Error;
} {
  if (stopped instanceof StudyStop) {
    return stopped.reason === 'cancelled'
      ? { status: 'cancelled', error: stopped }
      : { status: 'stopped', stoppedBy: stopped.reason, error: stopped };
  }
  return {
    status: 'failed',
    error: stopped instanceof Error ? stopped : new Error(String(stopped)),
  };
}

/** An architecture aiming at a new capability, whose assembly's prior art is searched. */
function isCapability(claim: StudyClaim): boolean {
  return 'kind' in claim && (claim as StudyArchitecture).kind === 'capability';
}

/** Why an amendment could not be classified. */
function unclassifiedReason(error: unknown): StudyReason {
  if (error instanceof StudyStop) {
    if (error.reason === 'cancelled') return studyReason('amendmentCancelled');
    if (error.reason === 'timeoutMs') return studyReason('amendmentTimedOut');
    if (error.reason === 'policy') return studyReason('amendmentPolicy', { reason: error.message });
  }
  return studyReason('amendmentUnclassified', {
    error: truncate(error instanceof Error ? error.message : String(error), 200),
  });
}

/**
 * What the guardian sees of an architecture: its kind, the capability it aims at, the
 * principle it changes, its mechanism, its components and how they are assembled.
 */
function aimOf(architecture: StudyArchitecture): Record<string, unknown> {
  return {
    kind: architecture.kind,
    capability: architecture.capability,
    ...(architecture.principleChange ? { principleChange: architecture.principleChange } : {}),
    mechanism: architecture.mechanism,
    components: architecture.components.map(({ name, statement }) => ({ name, statement })),
    assembly: architecture.assembly.map(({ component, gives, exchanges, cost }) => ({
      component,
      gives,
      exchanges,
      cost,
    })),
  };
}

/** A novelty as prior-art prompts show it: an architecture as the combination it assembles. */
function claimedNovelty(claim: StudyClaim): ClaimedNovelty {
  const shown = { id: claim.id, statement: claim.statement };
  if (!('assembly' in claim && 'kind' in claim)) return shown;
  const architecture = claim as StudyArchitecture;
  return {
    ...shown,
    combination: architecture.components.map((component) => component.name).join(' + '),
    capability: architecture.capability.what,
  };
}

/** How long a study waits before a throttled prior-art search's second try, at least. */
const STUDY_THROTTLE_WAIT_MS = 5_000;
/** The longest wait a study gives a service: one that asks for more is not tried again. */
const STUDY_MAX_THROTTLE_WAIT_MS = 150_000;
/** The time the run must still have after that wait for the second tries to be made. */
const STUDY_TIME_AFTER_RETRY_MS = 60_000;

/**
 * Whether a search failed from a throttle: the tool's error, or what it wraps, says
 * `throttled: true` (as the SDK's web tools do), with the wait it asked for, if any.
 */
function throttleOf(error: unknown): { retryAfterMs?: number } | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 8 && typeof current === 'object' && current !== null; depth++) {
    if (Reflect.get(current, 'throttled') === true) {
      const after: unknown = Reflect.get(current, 'retryAfterMs');
      return typeof after === 'number' && Number.isFinite(after) ? { retryAfterMs: after } : {};
    }
    current =
      current instanceof SDKError && current.originalError
        ? current.originalError
        : Reflect.get(current, 'cause');
  }
  return undefined;
}

/** Waits `ms`, or rejects as soon as `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Why a search failed: the tool's own error, not only the governed pipeline's wrapper. */
function searchError(error: unknown): string {
  let cause = error;
  while (cause instanceof SDKError && cause.originalError && cause.originalError !== cause) {
    cause = cause.originalError;
  }
  const message = error instanceof Error ? error.message : String(error);
  return cause !== error && cause instanceof Error ? `${message}: ${cause.message}` : message;
}

function stageKey(stage: string): string {
  return stage.normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase();
}
