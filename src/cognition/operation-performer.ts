import type { CognitiveOperation } from './cognitive-operations.js';
import type { CognitiveRunRecorder } from './cognitive-run-recorder.js';
import type { HypothesisAssessor } from './hypothesis-assessor.js';
import type { InformationSeeker } from './information-seeker.js';
import type { ThoughtGenerator } from './llm-thought-generator.js';
import type { MentalState } from './mental-state.js';
import { failureOutcome, toError, truncate, type OperationOutcome } from './operation-outcome.js';
import type { ThinkerProfile } from './thinker-profile.js';

export interface OperationPerformerDependencies {
  generator: ThoughtGenerator;
  seeker: InformationSeeker;
  recorder: CognitiveRunRecorder;
  assessor?: HypothesisAssessor;
}

/**
 * Executes one cognitive operation and returns its outcome without touching the state:
 * tools for `seek_information`, the typed-decision assessor for `compare` when configured,
 * the thought generator otherwise. Failures become outcomes, except cancellation.
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
    const { runId, operation, state, profile, signal } = input;
    try {
      if (operation === 'seek_information') {
        return await this.deps.seeker.investigate({ runId, state, profile, signal });
      }
      if (operation === 'compare' && this.deps.assessor) {
        const assessed = await this.assess(this.deps.assessor, input);
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
        patch: generated.patch,
        ignoredFields: generated.ignoredFields,
        ...(generated.model ? { model: generated.model } : {}),
        ...(generated.requestedModel ? { requestedModel: generated.requestedModel } : {}),
        ...(generated.usage ? { usage: generated.usage } : {}),
      };
    } catch (error) {
      if (signal.aborted) throw error;
      return failureOutcome(error);
    }
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
      return { patch: assessment.patch };
    } catch (error) {
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
