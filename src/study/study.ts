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
} from './passages.js';
import { applyPriorArt, leaveToVerify, settleClaim } from './study-claims.js';
import { type StudySettings, studySettings } from './study-config.js';
import { renderStudyMarkdown } from './study-markdown.js';
import { StudyModel } from './study-model.js';
import {
  amendmentPrompt,
  guardianPrompt,
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
  StudyArchitecture,
  StudyCharter,
  StudyClaim,
  StudyConfig,
  StudyDriftEntry,
  StudyExperimentOutcome,
  StudyPassage,
  StudyReport,
  StudyResult,
  StudyRunOptions,
  StudySearch,
  StudySearchResult,
  StudyStatus,
  StudyStopReason,
} from './study-types.js';

/** What a study uses of the SDK: its provider, store, policies and governed tools. */
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

/** How a passage is performed in a run. */
interface PassageMode {
  /** Reopened by a later passage, on one unknown: its new items are added to the earlier ones. */
  reopened?: { by: StudyPassage; focus: string; reason: string };
}

/**
 * A researcher: it understands an object, then proposes how to organise it with the knowledge
 * and techniques of today, passage by passage, and designs the experiments that would decide.
 * It builds, runs and measures nothing.
 *
 * It is made to stay on its objective. The charter is frozen and hashed at creation. Every
 * model call is built afresh from the charter, the accepted amendments, the passage's task and
 * the compact records it needs, and ends with the objective: nothing is inherited from a
 * conversation. Every item says what it serves; after each passage a guardian removes the items
 * off the objective, logs them, and has the passage redone once when too many were. An
 * amendment is accepted only when it refines the objective. Claim statuses are checked in code:
 * `established` needs a result this study retrieved, `novelty` a search for prior art.
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
  private readonly registry = new ResultRegistry();
  private readonly searches: StudySearch[] = [];
  private readonly driftLog: StudyDriftEntry[] = [];
  private readonly amendmentLog: StudyAmendment[] = [];
  private readonly records = new Map<StudyPassage, PassageRecord>();
  private readonly lastIds = new Map<string, number>();
  private readonly runIds: string[] = [];
  private readonly unsearched = new Set<StudyPassage>();
  private readonly totals = { modelCalls: 0, redos: 0, loops: 0 };
  private last?: { status: StudyStatus; stoppedBy?: StudyStopReason; error?: string };
  private running = false;

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
      runIds: this.runIds,
    });
  }

  /**
   * Runs the passages, from the first one not complete (or from the first with `restart`).
   * Limits, a budget policy, a cancellation or an error end the run with its status and the
   * report of what was done: nothing done is thrown away. Throws only for a run already in
   * progress, an `onEvent` that cannot be served, or an event store that fails.
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
    this.runIds.push(runId);
    const timer = setTimeout(() => {
      run.timedOut = true;
      run.abort.abort();
    }, limits.timeoutMs);
    const cancel = () => run.abort.abort();
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    try {
      if (options.restart) {
        this.records.clear();
        this.unsearched.clear();
      }
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
        this.totals.modelCalls += run.modelCalls;
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
   * Adds an instruction, classified against the charter by the guardian in a run of its own:
   * `refines` is accepted, numbered and shown under the charter in every later prompt (those
   * of a run in progress included); `conflicts` and `changesObjective` are refused with the
   * reason, and never reach a prompt. An amendment that cannot be classified is refused too.
   */
  async amend(text: string): Promise<StudyAmendment> {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new ValidationError('text', 'must be a non-empty string');
    }
    const instruction = text.trim();
    const runId = generateRunId();
    // One call and its repair: nothing else runs in it.
    const run = new StudyRun(
      runId,
      this.recorder,
      { maxModelCalls: 2, maxSearches: 0, maxLoops: 0 },
      this.environment.policyEngine,
      this.id
    );
    this.runIds.push(runId);
    await run.record('run.started', {
      input: { message: instruction, context: { study: this.name } },
      mode: 'study-amendment',
    });
    let verdict: StudyAmendment['verdict'];
    let reason: string;
    try {
      ({ verdict, reason } = await this.model.ask(run, {
        purpose: 'amendment',
        temperature: 0,
        messages: (rejection) => amendmentPrompt(this.frame(), instruction, rejection),
        parse: (reply) => parseAmendmentReply(reply),
      }));
    } catch (error) {
      verdict = 'unclassified';
      reason = `it could not be classified (${error instanceof Error ? error.message : String(error)}), so it is refused: the objective comes first`;
    } finally {
      this.totals.modelCalls += run.modelCalls;
    }
    if (verdict === 'changesObjective') {
      reason = `${reason} A new objective is a new study: create one with sdk.createStudy.`;
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
    return { ...amendment };
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

  private frame(): PromptFrame {
    return {
      charter: this.charter,
      charterHash: this.charterHash,
      amendments: this.amendmentLog.filter((amendment) => amendment.accepted),
      language: this.language,
    };
  }

  private async start(run: StudyRun): Promise<void> {
    await run.record('run.started', {
      input: {
        message: this.charter.object,
        context: { study: this.name, objective: this.charter.objective },
      },
      mode: 'study',
    });
    const resumeAt = PASSAGES.find((spec) => !this.records.get(spec.passage)?.complete)?.passage;
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
      ...(resumeAt && resumeAt !== 'observe' ? { resumeAt } : {}),
    });
  }

  /** The passages in order, from the first not complete; a passage may reopen an earlier one. */
  private async runPassages(run: StudyRun): Promise<void> {
    const start = PASSAGES.findIndex((spec) => !this.records.get(spec.passage)?.complete);
    if (start === -1) return;
    for (const spec of PASSAGES.slice(start)) {
      let reopen = await this.performPassage(run, spec, {});
      while (reopen && run.loops < run.limits.maxLoops) {
        run.loops++;
        const reopened = { by: spec.passage, focus: reopen.focus, reason: reopen.reason };
        await this.performPassage(run, passageSpec(reopen.passage), { reopened });
        this.records.get(reopen.passage)?.reopenedBy.push(spec.passage);
        // The passage that was blocked runs again, with what the reopened one added.
        reopen = await this.performPassage(run, spec, {});
      }
    }
  }

  /**
   * One passage: its searches, its items, the guardian's check (and one redo past the drift
   * threshold), the prior-art search of design's novelties. Its items are kept as soon as they
   * exist, so a run that stops keeps them. Returns the earlier passage it asks to reopen.
   */
  private async performPassage(
    run: StudyRun,
    spec: PassageSpec,
    mode: PassageMode
  ): Promise<ReopenRequest | undefined> {
    await this.admitStep(run, spec.passage);
    const amendments = this.frame().amendments.map((amendment) => amendment.number);
    await run.record('study.passage_started', {
      passage: spec.passage,
      number: spec.number,
      amendments,
      ...(mode.reopened
        ? { reopenedBy: mode.reopened.by, focus: mode.reopened.focus, reason: mode.reopened.reason }
        : {}),
    });
    const results = spec.researches ? await this.research(run, spec, mode) : [];

    const earlier = this.records.get(spec.passage);
    // A reopened passage adds to its items; otherwise a new attempt replaces them.
    const kept = mode.reopened ? [...(earlier?.items ?? [])] : [];
    const record: PassageRecord = {
      passage: spec.passage,
      items: earlier?.items ?? [],
      complete: mode.reopened ? (earlier?.complete ?? false) : false,
      attempts: 0,
      reopenedBy: earlier?.reopenedBy ?? [],
      runId: run.runId,
    };

    let feedback: Array<{ statement: string; reason: string }> | undefined;
    let reply: PassageReply | undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      reply = await this.generate(run, spec, { results, mode, feedback });
      const batch = this.settle(run, spec, reply);
      record.items = [...kept, ...batch];
      record.attempts = attempt;
      this.records.set(spec.passage, record);
      const refused = await this.logRefused(run, spec.passage, reply.refused, attempt);
      const removed = await this.guard(run, spec.passage, batch, attempt);
      record.items = [
        ...kept,
        ...batch.filter((item) => !removed.some((entry) => entry.item === item)),
      ];

      // Past the threshold, the passage is redone once, told what was rejected and why.
      const rejected = [...refused, ...removed.map((entry) => entry.drift)];
      const produced = batch.length + refused.length;
      if (
        attempt === 1 &&
        produced > 0 &&
        rejected.length / produced > this.settings.driftThreshold
      ) {
        run.redos++;
        feedback = rejected.map((entry) => ({
          statement: entry.item.statement ?? '(no statement)',
          reason: entry.reason,
        }));
        continue;
      }
      break;
    }
    if (spec.passage === 'design') await this.checkPriorArt(run);
    record.complete = true;

    const reopen = mode.reopened ? undefined : reply?.reopen;
    await run.record('study.passage_completed', {
      passage: spec.passage,
      attempts: record.attempts,
      items: record.items.map(({ collection, claim: { runId: _runId, ...claim } }) => ({
        collection,
        ...claim,
      })),
      ...(mode.reopened ? { reopenedBy: mode.reopened.by } : {}),
      ...(reopen && run.loops < run.limits.maxLoops ? { reopen } : {}),
    });
    return reopen;
  }

  /**
   * Checks the budget and timeout policies before a passage, as a cognitive agent does before
   * a step: past a limit the run stops, with the passages done so far.
   */
  private async admitStep(run: StudyRun, passage: StudyPassage): Promise<void> {
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
      passage,
      reason,
      violatedPolicies: validation.violatedPolicies ?? [],
    });
    throw new StudyStop('policy', reason);
  }

  private generate(
    run: StudyRun,
    spec: PassageSpec,
    input: {
      results: StudySearchResult[];
      mode: PassageMode;
      feedback: Array<{ statement: string; reason: string }> | undefined;
    }
  ): Promise<PassageReply> {
    const records = this.recordsFor(spec);
    const citedResults = this.citedResults(records);
    const earlier = PASSAGES.filter((candidate) => candidate.number < spec.number).map(
      (candidate) => candidate.passage
    );
    // Reopening is offered only while a loop is left (`runPassages` bounds the loops), and
    // never to a passage that was itself reopened.
    const reopenable = input.mode.reopened || run.loops >= run.limits.maxLoops ? [] : earlier;
    return this.model.ask(run, {
      purpose: 'passage',
      passage: spec.passage,
      temperature: this.settings.temperature,
      messages: (rejection) =>
        passagePrompt(this.frame(), {
          spec,
          records,
          results: input.results,
          citedResults,
          hasSources: this.sources.length > 0,
          ...(input.mode.reopened ? { reopened: input.mode.reopened } : {}),
          ...(input.feedback ? { driftFeedback: input.feedback } : {}),
          reopenable,
          ...(rejection ? { rejection } : {}),
        }),
      parse: (reply, final) =>
        parsePassageReply(spec, reply, { leads: this.charter.leads, reopenable: earlier, final }),
    });
  }

  /** Gives each proposed item its id and a status the study checked. */
  private settle(run: StudyRun, spec: PassageSpec, reply: PassageReply): StoredItem[] {
    const chain = this.itemsOf('chain').map((stage) => stage.stage);
    return reply.items.map((proposed) => {
      const collection = COLLECTIONS.find((candidate) => candidate.key === proposed.collection);
      const claim = settleClaim(this.nextId(collection?.prefix ?? '?'), proposed, {
        passage: spec.passage,
        runId: run.runId,
        retrieved: (id) => this.registry.has(id),
        hasSources: this.sources.length > 0,
      });
      claim.unchecked = true;
      if (proposed.collection === 'architectures') {
        const architecture = claim as StudyArchitecture;
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
   * items. Returns the items it judged off the objective, logged in the drift log.
   */
  private async guard(
    run: StudyRun,
    passage: StudyPassage,
    batch: StoredItem[],
    attempt: number
  ): Promise<Array<{ item: StoredItem; drift: StudyDriftEntry }>> {
    if (batch.length === 0) return [];
    const shown = batch.map(({ claim }) => ({
      id: claim.id,
      statement: claim.statement,
      servesObjective: claim.servesObjective,
    }));
    const ids = shown.map((item) => item.id);
    const verdicts = await this.model.ask(run, {
      purpose: 'check',
      passage,
      temperature: 0,
      messages: (rejection) => guardianPrompt(this.frame(), passage, shown, rejection),
      parse: (reply, final) => parseGuardianReply(reply, ids, final),
    });
    const removed: Array<{ item: StoredItem; drift: StudyDriftEntry }> = [];
    for (const item of batch) {
      const verdict = verdicts.get(item.claim.id);
      if (verdict && !verdict.onObjective) {
        const drift = await this.logDrift(run, {
          passage,
          collection: item.collection,
          item: {
            id: item.claim.id,
            statement: item.claim.statement,
            servesObjective: item.claim.servesObjective,
          },
          reason: verdict.reason,
          by: 'guardian',
          attempt,
          runId: run.runId,
        });
        removed.push({ item, drift });
      } else {
        item.claim.unchecked = undefined;
      }
    }
    return removed;
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
    request: RequestedSearch
  ): Promise<StudySearch> {
    const base = {
      passage,
      purpose,
      tool: request.source,
      query: request.query,
      servesObjective: request.servesObjective,
      ...(request.claim ? { claims: [request.claim] } : {}),
      runId: run.runId,
    };
    let entry: StudySearch;
    if (run.searchesLeft === 0) {
      run.unsearched.add(passage);
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
        entry = { ...base, resultIds: [], error: truncate(searchError(error)) };
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
   * Searches for the prior art of every claimed novelty not checked yet (the design's and the
   * crossings'), then asks what the closest existing work is. A novelty whose prior art could
   * not be searched and assessed stays "to verify", with why.
   */
  private async checkPriorArt(run: StudyRun): Promise<void> {
    const claims = this.allClaims().filter(
      (claim) => claim.status === 'novelty' && claim.toVerify && !claim.priorArt
    );
    if (claims.length === 0 || this.sources.length === 0) return;
    if (run.searchesLeft === 0) {
      run.unsearched.add('design');
      for (const claim of claims) {
        leaveToVerify(
          claim,
          'the search budget (maxSearches) ran out before its prior-art search.'
        );
      }
      return;
    }
    const ids = claims.map((claim) => claim.id);
    const shown = claims.map(({ id, statement }) => ({ id, statement }));
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
    const searched = new Map<string, string[]>();
    for (const search of requested) {
      const entry = await this.search(run, 'design', 'priorArt', search);
      if (entry.error || entry.skipped || !search.claim) continue;
      searched.set(search.claim, [...(searched.get(search.claim) ?? []), ...entry.resultIds]);
    }
    for (const claim of claims) {
      leaveToVerify(
        claim,
        searched.has(claim.id)
          ? 'its prior-art search ran, but its results were not assessed.'
          : 'no prior-art search was run for it.'
      );
    }
    const checked = claims.filter((claim) => searched.has(claim.id));
    if (checked.length === 0) return;
    const results = this.resultsById([...searched.values()].flat());
    const checkedIds = checked.map((claim) => claim.id);
    const checks = await this.model.ask(run, {
      purpose: 'priorArtCheck',
      passage: 'design',
      temperature: 0,
      messages: (rejection) =>
        priorArtCheckPrompt(
          this.frame(),
          checked.map(({ id, statement }) => ({ id, statement })),
          results,
          rejection
        ),
      parse: (reply) => parsePriorArtReply(reply, checkedIds),
    });
    for (const claim of checked) {
      const check = checks.find((candidate) => candidate.claim === claim.id);
      if (!check) continue;
      applyPriorArt(claim, {
        closest: check.closest,
        sources: check.sources.filter((id) => this.registry.has(id)),
        verdict: check.verdict,
      });
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
      stats: report.stats,
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

  /** The compact records a passage needs from the earlier ones. */
  private recordsFor(spec: PassageSpec): RecordsForPrompt {
    return Object.fromEntries(spec.needs.map((key) => [key, this.itemsOf(key)]));
  }

  private citedResults(records: RecordsForPrompt): StudySearchResult[] {
    const ids = Object.values(records).flatMap((items) =>
      (items ?? []).flatMap((item) => item.sources)
    );
    return this.resultsById(ids);
  }

  private itemsOf<Key extends StudyCollection>(key: Key): StudyCollections[Key][] {
    return PASSAGES.flatMap((spec) =>
      (this.records.get(spec.passage)?.items ?? [])
        .filter((item) => item.collection === key)
        .map((item) => item.claim as StudyCollections[Key])
    );
  }

  private allClaims(): StudyClaim[] {
    return PASSAGES.flatMap((spec) =>
      (this.records.get(spec.passage)?.items ?? []).map((item) => item.claim)
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
