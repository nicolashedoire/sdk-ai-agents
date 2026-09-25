import { CognitiveRunMeter } from '../cognition/run-meter.js';
import type { PolicyEngine } from '../engines/policy-engine.js';
import type { IEventStore } from '../stores/event-store.js';
import type { EventType } from '../types/events.js';
import { generateEventId } from '../utils/id.js';
import type { StudyPassage, StudyStopReason } from './study-types.js';

/** Why a run ended before its last passage, when it is not an error. */
export class StudyStop extends Error {
  constructor(
    readonly reason: StudyStopReason | 'cancelled',
    message: string
  ) {
    super(message);
    this.name = 'StudyStop';
  }
}

/** A study's events, all under its id (as `agentId`) and its name. */
export class StudyRecorder {
  constructor(
    private readonly store: IEventStore,
    private readonly study: { id: string; name: string }
  ) {}

  /**
   * Appends an event. The model calls it records are counted first by `meter`, exactly as
   * `getRunCost` reads them (`modelCallsOf`): budgets per period count what the cost prices.
   */
  async record(
    runId: string,
    type: EventType,
    data: Record<string, unknown>,
    meter?: CognitiveRunMeter
  ): Promise<void> {
    await meter?.countRecorded({ type, data });
    await this.store.append(runId, {
      id: generateEventId(),
      runId,
      type,
      timestamp: Date.now(),
      data,
      metadata: { agentId: this.study.id, studyName: this.study.name },
    });
  }
}

export interface StudyRunLimits {
  maxModelCalls: number;
  maxSearches: number;
  maxLoops: number;
}

/**
 * One run of a study: its id, its limits and how far it went. Every model call is admitted
 * here first, so `maxModelCalls` holds whatever calls it (a passage, a repair, the guardian).
 */
export class StudyRun {
  readonly abort = new AbortController();
  readonly meter: CognitiveRunMeter;
  timedOut = false;
  /** Model calls admitted (`maxModelCalls` counts them). */
  modelCalls = 0;
  /** Model calls the vendor answered (what the report and the run's events count). */
  answered = 0;
  /** Searches run (`maxSearches` counts them), and searches skipped once it was spent. */
  searches = 0;
  skipped = 0;
  loops = 0;
  /**
   * The guardian judged items late in a passage already complete: the later passages that read
   * them run again in this run (it took a loop).
   */
  catchingUp = false;
  redos = 0;
  /**
   * Steps admitted by the budget policies: each passage performed, reopenings, redos and the
   * guardian's check of what a stopped run left unjudged included.
   */
  steps = 0;
  /** Passages that wanted to search once `maxSearches` was spent. */
  readonly unsearched = new Set<StudyPassage>();

  constructor(
    readonly runId: string,
    private readonly recorder: StudyRecorder,
    readonly limits: StudyRunLimits,
    policyEngine: PolicyEngine | undefined,
    studyId: string
  ) {
    // Each model call counts in the study's budgets per period as it is recorded.
    this.meter = new CognitiveRunMeter(
      Date.now(),
      policyEngine ? (call) => policyEngine.recordModelUsage(studyId, call) : undefined
    );
  }

  get signal(): AbortSignal {
    return this.abort.signal;
  }

  get searchesLeft(): number {
    return Math.max(0, this.limits.maxSearches - this.searches);
  }

  record(type: EventType, data: Record<string, unknown>): Promise<void> {
    return this.recorder.record(this.runId, type, data, this.meter);
  }

  /** Throws a `StudyStop` once the run is cancelled or timed out. */
  checkpoint(): void {
    if (!this.signal.aborted) return;
    throw this.timedOut
      ? new StudyStop('timeoutMs', 'the run reached its timeout (limits.timeoutMs)')
      : new StudyStop('cancelled', 'the run was cancelled');
  }

  /** Counts one more model call, or throws a `StudyStop` when none is left. */
  admitModelCall(): void {
    this.checkpoint();
    if (this.modelCalls >= this.limits.maxModelCalls) {
      throw new StudyStop(
        'maxModelCalls',
        `the run made its ${this.limits.maxModelCalls} model calls (limits.maxModelCalls)`
      );
    }
    this.modelCalls++;
  }

  /** What an error means for the run: a stop when the run was aborted, else itself. */
  stopFor(error: unknown): unknown {
    if (error instanceof StudyStop) return error;
    if (!this.signal.aborted) return error;
    try {
      this.checkpoint();
    } catch (stop) {
      return stop;
    }
    return error;
  }
}
