import type { IEventStore } from '../stores/event-store.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';
import type { DecisionEvaluationRecord } from './cognitive-controller.js';
import type { Decision, MentalState, ThoughtPatch } from './mental-state.js';
import type { OperationOutcome } from './operation-outcome.js';
import type { OperationSelection } from './operation-selector.js';
import type { ThinkerProfile } from './thinker-profile.js';

/**
 * Writes the events of a cognitive run. Keeping the event shapes in one place keeps them
 * aligned with `rebuildMentalState` and `buildControllerDataset`, which read them back.
 */
export class CognitiveRunRecorder {
  constructor(
    private readonly eventStore: IEventStore,
    private readonly agent: { id: string; version: string },
    private readonly currentProfile: () => ThinkerProfile
  ) {}

  async record(runId: string, type: Event['type'], data: Record<string, unknown>): Promise<void> {
    const profile = this.currentProfile();
    await this.eventStore.append(runId, {
      id: generateEventId(),
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
      outcome: OperationOutcome;
    }
  ): Promise<void> {
    const { outcome } = thought;
    await this.record(runId, 'cognition.thought', {
      step: thought.step,
      operation: thought.operation,
      patch: thought.patch,
      issues: thought.issues,
      failed: outcome.failure !== undefined || !outcome.patch,
      ...(outcome.ignoredFields && outcome.ignoredFields.length > 0
        ? { ignoredFields: outcome.ignoredFields }
        : {}),
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
      confidence: state.confidence,
      steps: state.step,
      hypotheses: state.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        status: hypothesis.status,
        support: hypothesis.support,
      })),
    });
    await this.record(runId, 'run.completed', { output: decision.answer, decision });
  }
}
