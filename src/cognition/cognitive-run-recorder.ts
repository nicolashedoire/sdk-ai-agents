import type { IEventStore } from '../stores/event-store.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';
import type { DecisionEvaluationRecord } from './cognitive-controller.js';
import type { MentalState } from './mental-state.js';
import type { OperationOutcome } from './operation-outcome.js';
import type { OperationSelection } from './operation-selector.js';
import type { CognitiveRunMeter } from './run-meter.js';
import type { ThinkerProfile } from './thinker-profile.js';
import type { Decision, ThoughtPatch } from './thought-patch.js';

/**
 * Writes the events of a cognitive run. Keeping the event shapes in one place keeps them
 * aligned with `rebuildMentalState` and `buildControllerDataset`, which read them back.
 * Every model call it records (thoughts, typed decisions, operations cut short after billed
 * attempts, answers a provider discarded) is counted by the run's `meter` as `getRunCost`
 * reads it, so run limits and budgets count what the run's cost report prices.
 */
export class CognitiveRunRecorder {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly agent: { id: string; version: string },
    private readonly currentProfile: () => ThinkerProfile,
    private readonly meter?: CognitiveRunMeter
  ) {}

  /**
   * Appends an event and returns its id, so observations can point to their source. The model
   * calls it records are counted first: a store that fails does not leave them out of budgets.
   */
  async record(runId: string, type: Event['type'], data: Record<string, unknown>): Promise<string> {
    await this.meter?.countRecorded({ type, data });
    const profile = this.currentProfile();
    const id = generateEventId();
    await this.eventStore.append(runId, {
      id,
      runId,
      type,
      timestamp: Date.now(),
      data,
      metadata: {
        agentId: this.agent.id,
        agentVersion: this.agent.version,
        profileId: profile.id,
        profileVersion: profile.version,
      },
    });
    return id;
  }

  async evaluations(
    runId: string,
    step: number,
    evaluations: DecisionEvaluationRecord[]
  ): Promise<void> {
    for (const evaluation of evaluations) {
      await this.record(runId, 'decision.evaluated', { step, ...evaluation });
    }
  }

  async selection(runId: string, step: number, selection: OperationSelection): Promise<void> {
    const { decision, available, stepsRemaining } = selection;
    await this.evaluations(runId, step, decision.evaluations ?? []);
    await this.record(runId, 'cognition.operation_selected', {
      step,
      operation: decision.operation,
      controller: decision.controller,
      available,
      stepsRemaining,
      ...(selection.forced ? { forced: true } : {}),
      ...(decision.confidence !== undefined ? { confidence: decision.confidence } : {}),
      ...(decision.probabilities ? { probabilities: decision.probabilities } : {}),
      ...(decision.rationale ? { rationale: decision.rationale } : {}),
      ...(decision.fallbackFrom ? { fallbackFrom: decision.fallbackFrom } : {}),
    });
  }

  async thought(
    runId: string,
    thought: {
      step: number;
      operation: string;
      patch: ThoughtPatch;
      issues: string[];
      failed: boolean;
      ignoredFields: string[];
      outcome: OperationOutcome;
    }
  ): Promise<void> {
    const { outcome } = thought;
    await this.record(runId, 'cognition.thought', {
      step: thought.step,
      operation: thought.operation,
      patch: thought.patch,
      issues: thought.issues,
      failed: thought.failed,
      ...(thought.ignoredFields.length > 0 ? { ignoredFields: thought.ignoredFields } : {}),
      ...(outcome.model ? { model: outcome.model } : {}),
      ...(outcome.requestedModel ? { requestedModel: outcome.requestedModel } : {}),
      ...(outcome.usage ? { usage: outcome.usage } : {}),
    });
  }

  async conclusion(runId: string, state: MentalState, decision: Decision): Promise<void> {
    // Recorded as a final-answer intention so the native replay reproduces the answer.
    await this.record(runId, 'intention.generated', {
      intention: { type: 'final_answer', reasoning: decision.answer },
      message: decision.answer,
      source: 'cognition',
    });
    await this.record(runId, 'cognition.concluded', {
      decision,
      ...(decision.status ? { status: decision.status } : {}),
      confidence: state.confidence,
      steps: state.step,
      evidenceRevision: state.evidenceRevision,
      hypotheses: state.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        kind: hypothesis.kind,
        statement: hypothesis.statement,
        status: hypothesis.status,
        support: hypothesis.support,
        ...(hypothesis.preferenceFit !== undefined
          ? { preferenceFit: hypothesis.preferenceFit }
          : {}),
        ...(hypothesis.parentId ? { parentId: hypothesis.parentId } : {}),
      })),
      predictions: state.predictions.map((prediction) => ({
        id: prediction.id,
        hypothesisId: prediction.hypothesisId,
        status: prediction.status,
      })),
    });
    await this.record(runId, 'run.completed', { output: decision.answer, decision });
  }
}
