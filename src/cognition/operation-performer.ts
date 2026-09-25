import { ThoughtGenerationError } from '../errors/index.js';
import type { DiscardedAnswer } from '../providers/llm-provider.js';
import type { CognitiveOperation } from './cognitive-operations.js';
import type { CognitiveRunRecorder } from './cognitive-run-recorder.js';
import { HypothesisAssessmentError, type HypothesisAssessor } from './hypothesis-assessor.js';
import type { InformationSeeker } from './information-seeker.js';
import type { ThoughtGenerator } from './llm-thought-generator.js';
import type { MentalState } from './mental-state.js';
import { truncate } from '../utils/truncate.js';
import { failureOutcome, toError, type OperationOutcome } from './operation-outcome.js';
import type { PredictionTester } from './outcome-evaluator.js';
import type { CognitiveRunMeter } from './run-meter.js';
import type { ThinkerProfile } from './thinker-profile.js';

export interface OperationPerformerDependencies {
  generator: ThoughtGenerator;
  seeker: InformationSeeker;
  recorder: CognitiveRunRecorder;
  /** Progress of the run, given with its tool calls. */
  meter: CognitiveRunMeter;
  assessor?: HypothesisAssessor;
  tester?: PredictionTester;
}

/**
 * Executes one cognitive operation and returns its outcome without touching the state:
 * tools for `seek_information`, the outcome evaluator for `test_prediction`, the
 * typed-decision assessor for `compare` when configured, the thought generator otherwise.
 * Failures become outcomes, except cancellation: the model calls billed before it are then
 * recorded here, since no thought will carry them.
 */
export class OperationPerformer {
  constructor(private readonly deps: OperationPerformerDependencies) {}

  async perform(input: {
    runId: string;
    operation: CognitiveOperation;
    state: MentalState;
    profile: ThinkerProfile;
    step: number;
    signal: AbortSignal;
  }): Promise<OperationOutcome> {
    let outcome: OperationOutcome;
    try {
      outcome = await this.run(input);
    } catch (error) {
      if (input.signal.aborted) {
        await this.recordInterrupted(input, error);
        throw error;
      }
      outcome = failureOutcome(error);
    }
    await this.recordDiscarded(input.runId, outcome.discarded ?? []);
    return outcome;
  }

  private async run(input: {
    runId: string;
    operation: CognitiveOperation;
    state: MentalState;
    profile: ThinkerProfile;
    step: number;
    signal: AbortSignal;
  }): Promise<OperationOutcome> {
    const { runId, operation, profile, signal } = input;
    // Components get a copy: whatever they do with it cannot alter the recorded state.
    const state = isolatedCopy(input.state);
    if (operation === 'seek_information') {
      return await this.deps.seeker.investigate({
        runId,
        state,
        profile,
        signal,
        meter: this.deps.meter,
      });
    }
    if (operation === 'test_prediction') {
      return this.deps.tester
        ? await this.deps.tester.test({ runId, state, step: input.step, signal })
        : { failure: new Error('no outcome evaluator is configured') };
    }
    if (operation === 'compare' && this.deps.assessor) {
      const assessed = await this.assess(this.deps.assessor, { ...input, state });
      if (assessed) return assessed;
    }
    const generated = await this.deps.generator.generate({
      runId,
      operation,
      state,
      profile,
      abortSignal: signal,
    });
    return {
      proposal: { contract: operation, patch: generated.patch },
      ignoredFields: generated.ignoredFields,
      ...(generated.model ? { model: generated.model } : {}),
      ...(generated.requestedModel ? { requestedModel: generated.requestedModel } : {}),
      ...(generated.usage ? { usage: generated.usage } : {}),
      ...(generated.discarded ? { discarded: generated.discarded } : {}),
    };
  }

  /**
   * Records each answer a provider discarded after the vendor billed it, as the reasoning
   * engine does, so that it is priced at the model that gave it.
   */
  private async recordDiscarded(runId: string, answers: DiscardedAnswer[]): Promise<void> {
    for (const answer of answers) {
      await this.deps.recorder.record(runId, 'provider.answer_discarded', {
        provider: answer.provider,
        model: answer.model,
        ...(answer.requestedModel ? { requestedModel: answer.requestedModel } : {}),
        usage: answer.usage,
        reason: answer.reason,
      });
    }
  }

  /**
   * An operation stopped by a cancellation or a timeout after attempts the vendor billed (an
   * invalid reply, then a repair cut short): their usage is recorded with the failure, and
   * the answers a provider discarded as their own events.
   */
  private async recordInterrupted(
    input: { runId: string; operation: CognitiveOperation; step: number },
    error: unknown
  ): Promise<void> {
    if (!(error instanceof ThoughtGenerationError)) return;
    await this.recordDiscarded(input.runId, error.discarded ?? []);
    if (!error.usage) return;
    await this.deps.recorder.record(input.runId, 'cognition.operation_failed', {
      step: input.step,
      operation: input.operation,
      error: truncate(error.message),
      ...(error.model ? { model: error.model } : {}),
      ...(error.requestedModel ? { requestedModel: error.requestedModel } : {}),
      usage: error.usage,
    });
  }

  /** Compares with the typed-decision assessor; undefined lets the LLM compare instead. */
  private async assess(
    assessor: HypothesisAssessor,
    input: {
      runId: string;
      state: MentalState;
      profile: ThinkerProfile;
      step: number;
      signal: AbortSignal;
    }
  ): Promise<OperationOutcome | undefined> {
    try {
      const assessment = await assessor.assess({
        state: input.state,
        profile: input.profile,
        abortSignal: input.signal,
      });
      await this.deps.recorder.evaluations(input.runId, input.step, assessment.evaluations);
      return { proposal: { contract: 'compare', patch: assessment.patch } };
    } catch (error) {
      if (error instanceof HypothesisAssessmentError) {
        // Calls made before the failure were billed: keep them in the trace and the costs,
        // also when the run is being stopped.
        await this.deps.recorder.evaluations(input.runId, input.step, error.evaluations);
      }
      if (input.signal.aborted) throw error;
      await this.deps.recorder.record(input.runId, 'cognition.operation_failed', {
        step: input.step,
        operation: 'compare',
        error: truncate(toError(error).message),
        recovery: 'falling back to the LLM comparison',
      });
      return undefined;
    }
  }
}

/**
 * Deep copy of what the engine owns (it is plain JSON data). The problem's `context` is
 * passed as given: it belongs to the caller and may hold values that cannot be cloned.
 */
function isolatedCopy(state: MentalState): MentalState {
  const { context, ...owned } = state;
  return { ...structuredClone(owned), ...(context ? { context } : {}) };
}
