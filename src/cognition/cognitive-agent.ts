import { ValidationError } from '../errors/index.js';
import type { IEventStore } from '../stores/event-store.js';
import type { RunStatus } from '../types/events.js';
import type { Tool } from '../types/tool.js';
import { generateRunId } from '../utils/id.js';
import type { CognitiveController } from './cognitive-controller.js';
import type { CognitiveOperation } from './cognitive-operations.js';
import { CognitiveRunRecorder } from './cognitive-run-recorder.js';
import type { HypothesisAssessor } from './hypothesis-assessor.js';
import type { InformationSeeker } from './information-seeker.js';
import type { ThoughtGenerator } from './llm-thought-generator.js';
import { applyThought } from './mental-state-reducer.js';
import {
  CURRENT_SCHEMA_VERSION,
  createMentalState,
  type CommitRules,
  type MentalState,
} from './mental-state.js';
import {
  observationFromInput,
  observationInputSchema,
  type ObservationInput,
} from './observation-records.js';
import { toError, truncate, type OperationOutcome } from './operation-outcome.js';
import { OperationPerformer } from './operation-performer.js';
import { OperationSelector, type CognitiveLimits } from './operation-selector.js';
import { PredictionTester, type OutcomeEvaluator } from './outcome-evaluator.js';
import { assembleThought } from './patch-admission.js';
import { learnFromRun } from './profile-learning.js';
import { RunKnowledge, type KnowledgeSettings } from './run-knowledge.js';
import {
  defineThinkerProfile,
  type ReasoningFeedback,
  type ThinkerProfile,
  type ThinkerProfileInput,
} from './thinker-profile.js';
import type { Decision, ObservationRecord } from './thought-patch.js';

export interface CognitiveAgentDependencies {
  identity: { id: string; name: string; version: string; model: string; tools: Tool[] };
  limits: CognitiveLimits;
  profile: ThinkerProfile;
  generator: ThoughtGenerator;
  controller: CognitiveController;
  assessor?: HypothesisAssessor;
  /** Confronts predictions with real tests; without it predictions stay untested. */
  evaluator?: OutcomeEvaluator;
  seeker: InformationSeeker;
  eventStore: IEventStore;
  /** Memory across runs: recalls what earlier tests established, records what this run's did. */
  knowledge?: KnowledgeSettings;
}

export interface ThinkInput {
  /** The problem, question or decision to reason about. */
  problem: string;
  context?: Record<string, unknown>;
  /** What was already observed (measurements, cases, documents), with its origin. */
  observations?: ObservationInput[];
  metadata?: Record<string, unknown>;
  /** Cancels the run when aborted (e.g. the MCP client that asked gave up). Not recorded. */
  signal?: AbortSignal;
}

export interface CognitiveRunResult {
  runId: string;
  status: RunStatus;
  answer?: string;
  /** `decision.status` says whether the answer is committed, provisional or an abstention. */
  decision?: Decision;
  state: MentalState;
  error?: Error;
}

interface RunContext {
  runId: string;
  abortController: AbortController;
  timedOut: boolean;
  toolCalls: number;
  consecutiveFailures: number;
  /** Reason of the last failed operation, reported when the run gives up. */
  lastFailure?: string;
  /** Profile snapshot: feedback given during the run applies to the next one. */
  profile: ThinkerProfile;
  recorder: CognitiveRunRecorder;
  performer: OperationPerformer;
}

/**
 * An agent that reasons before it answers: it keeps an explicit mental state and loops
 * over cognitive operations (represent, compare observations, hypothesize, simulate, test
 * predictions, revise, critique, seek information, compare, decide) until it can commit to
 * a decision — or says, at the end of its budget, what is still missing.
 *
 * Every choice and every thought is an event: the run can be audited, its state rebuilt
 * with `rebuildMentalState`, and its tool calls replayed like any other run. Tools go
 * through the regular ActionEngine, so policies, approvals and budgets still apply.
 */
export class CognitiveAgent {
  private profile: ThinkerProfile;
  private readonly selector: OperationSelector;
  private readonly recorder: CognitiveRunRecorder;
  private readonly activeRuns = new Map<string, RunContext>();
  private readonly knowledge: RunKnowledge | undefined;

  constructor(private readonly deps: CognitiveAgentDependencies) {
    this.profile = deps.profile;
    this.knowledge = deps.knowledge ? new RunKnowledge(deps.knowledge) : undefined;
    this.selector = new OperationSelector(
      deps.controller,
      deps.limits,
      deps.identity.tools.length > 0
    );
    this.recorder = new CognitiveRunRecorder(deps.eventStore, deps.identity, () => this.profile);
  }

  get id(): string {
    return this.deps.identity.id;
  }

  get name(): string {
    return this.deps.identity.name;
  }

  getProfile(): ThinkerProfile {
    return this.profile;
  }

  setProfile(profile: ThinkerProfileInput): void {
    this.profile = defineThinkerProfile(profile);
  }

  async think(input: ThinkInput): Promise<CognitiveRunResult> {
    const problem = input.problem?.trim();
    if (!problem) {
      throw new ValidationError('problem', 'a problem to think about is required');
    }
    const observations = this.initialObservations(input.observations ?? []);
    const recalled = this.knowledge ? await this.knowledge.recall(problem) : undefined;

    const { limits } = this.deps;
    const profile = this.profile;
    const recorder = new CognitiveRunRecorder(
      this.deps.eventStore,
      this.deps.identity,
      () => profile
    );
    const run: RunContext = {
      runId: generateRunId(),
      abortController: new AbortController(),
      timedOut: false,
      toolCalls: 0,
      consecutiveFailures: 0,
      profile,
      recorder,
      performer: new OperationPerformer({
        generator: this.deps.generator,
        seeker: this.deps.seeker,
        recorder,
        ...(this.deps.assessor ? { assessor: this.deps.assessor } : {}),
        ...(this.deps.evaluator
          ? { tester: new PredictionTester(this.deps.evaluator, recorder) }
          : {}),
      }),
    };
    this.activeRuns.set(run.runId, run);
    const timer = setTimeout(() => {
      run.timedOut = true;
      run.abortController.abort();
    }, limits.timeoutMs);
    const cancel = () => run.abortController.abort();
    input.signal?.addEventListener('abort', cancel, { once: true });
    if (input.signal?.aborted) {
      cancel();
    }

    const commitRules: CommitRules = {
      decisionThreshold: limits.decisionThreshold,
      maxPredictionTests: this.deps.evaluator ? limits.maxPredictionTests : 0,
      preferenceWeight: limits.preferenceWeight,
      minProposalSupport: limits.minProposalSupport,
    };
    let state = createMentalState(problem, input.context, {
      observations,
      commitRules,
      ...(recalled ? { knowledge: recalled.items } : {}),
    });
    try {
      await run.recorder.record(run.runId, 'run.started', {
        input: { message: problem, context: input.context, metadata: input.metadata },
        mode: 'cognitive',
      });
      await run.recorder.record(run.runId, 'cognition.started', {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        goal: problem,
        ...(input.context ? { context: input.context } : {}),
        observations,
        commitRules,
        ...(recalled ? { knowledge: recalled } : {}),
        profile: { id: profile.id, name: profile.name, version: profile.version },
        controller: this.deps.controller.name,
        assessor: this.deps.assessor?.name ?? 'llm',
        ...(this.deps.evaluator
          ? { evaluator: { id: this.deps.evaluator.id, version: this.deps.evaluator.version } }
          : {}),
        allowedTools: this.deps.identity.tools.map((tool) => tool.name),
        limits,
      });

      for (let step = 1; step <= limits.maxSteps; step++) {
        if (run.abortController.signal.aborted) {
          throw new Error('Run interrupted');
        }
        const selection = await this.selector.select({
          state,
          profile: run.profile,
          step,
          toolCalls: run.toolCalls,
          signal: run.abortController.signal,
        });
        await run.recorder.selection(run.runId, step, selection);
        const outcome = await run.performer.perform({
          runId: run.runId,
          operation: selection.decision.operation,
          state,
          profile: run.profile,
          step,
          signal: run.abortController.signal,
        });
        if (outcome.toolCalled) run.toolCalls++;
        state = await this.apply(
          run,
          state,
          step,
          selection.decision.operation,
          outcome,
          selection.forced
        );
        if (state.decision) {
          await run.recorder.conclusion(run.runId, state, state.decision);
          return {
            runId: run.runId,
            status: 'completed',
            answer: state.decision.answer,
            decision: state.decision,
            state,
          };
        }
        if (run.consecutiveFailures >= limits.maxConsecutiveFailures) {
          throw new Error(
            `${run.consecutiveFailures} consecutive operations failed (last: ${run.lastFailure ?? 'unknown'})`
          );
        }
      }
      throw new Error(`No decision reached within ${limits.maxSteps} steps`);
    } catch (error) {
      if (!run.timedOut && run.abortController.signal.aborted) {
        await run.recorder.record(run.runId, 'run.cancelled', { reason: 'Stopped by user' });
        return { runId: run.runId, status: 'cancelled', state };
      }
      const failure = run.timedOut
        ? new Error(`Timeout exceeded (${limits.timeoutMs} ms)`)
        : toError(error);
      await run.recorder.record(run.runId, 'run.failed', {
        error: truncate(failure.message),
        steps: state.step,
      });
      return { runId: run.runId, status: 'failed', error: failure, state };
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', cancel);
      this.activeRuns.delete(run.runId);
      // Tests stay valid whatever the run's outcome: a failed or stopped run still learned them.
      await this.rememberFindings(run, state);
    }
  }

  private async rememberFindings(run: RunContext, state: MentalState): Promise<void> {
    try {
      const recorded = await this.knowledge?.remember(state, run.runId);
      if (recorded) {
        await run.recorder.record(run.runId, 'cognition.knowledge_recorded', recorded);
      }
    } catch (error) {
      // Memory is best effort: it never replaces the run's result.
      console.warn(`Knowledge of run ${run.runId} could not be recorded:`, toError(error).message);
    }
  }

  /** Stops one run, or every active run of this agent. */
  async stop(runId?: string): Promise<void> {
    const runs = runId ? [this.activeRuns.get(runId)] : [...this.activeRuns.values()];
    for (const run of runs) {
      if (run && !run.abortController.signal.aborted) {
        run.abortController.abort();
        await run.recorder.record(run.runId, 'run.stopped', {
          reason: 'Stopped by user',
          agentId: this.id,
        });
      }
    }
  }

  /**
   * Teaches the agent from the thinker's verdict on a finished run and returns the refined
   * profile. The feedback is appended to the run's event log.
   */
  async learnFromFeedback(runId: string, feedback: ReasoningFeedback): Promise<ThinkerProfile> {
    const events = await this.deps.eventStore.getEvents(runId);
    const lesson = learnFromRun(this.profile, runId, events, feedback);
    this.profile = lesson.profile;
    await this.recorder.record(runId, 'cognition.feedback', lesson.event);
    return this.profile;
  }

  private initialObservations(inputs: ObservationInput[]): ObservationRecord[] {
    const now = Date.now();
    return inputs.map((input, index) => {
      const parsed = observationInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new ValidationError(
          `observations.${index}`,
          parsed.error.issues[0]?.message ?? 'invalid observation'
        );
      }
      return observationFromInput(parsed.data, now);
    });
  }

  private async apply(
    run: RunContext,
    state: MentalState,
    step: number,
    operation: CognitiveOperation,
    outcome: OperationOutcome,
    forced: boolean
  ): Promise<MentalState> {
    const thought = assembleThought({
      operation,
      outcome,
      state,
      maxHypotheses: this.deps.limits.maxHypotheses,
      forced,
    });
    const { state: next, issues, noEffect } = applyThought(state, operation, thought.patch);
    const failure = thought.failureMessage ?? noEffect;

    // Only failures of the model or its tools count toward `maxConsecutiveFailures`. A
    // deferred decision or a step that changed nothing is an engine verdict: it counts as a
    // failed attempt of that operation (see `recentFailures`), never as a reason to abort.
    if (thought.failed && !thought.deferred) {
      run.consecutiveFailures++;
      run.lastFailure = failure;
    } else if (!failure) {
      run.consecutiveFailures = 0;
    }
    if (failure) {
      await run.recorder.record(run.runId, 'cognition.operation_failed', {
        step,
        operation,
        error: failure,
      });
    }
    await run.recorder.thought(run.runId, {
      step,
      operation,
      patch: thought.patch,
      issues: [...thought.issues, ...issues],
      failed: failure !== undefined,
      ignoredFields: [...(outcome.ignoredFields ?? []), ...thought.ignoredFields],
      outcome,
    });
    return next;
  }
}
