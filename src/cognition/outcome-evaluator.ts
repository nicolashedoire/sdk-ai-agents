import { z } from 'zod';
import { nextPredictionToTest } from './cognitive-operations.js';
import type { CognitiveRunRecorder } from './cognitive-run-recorder.js';
import type { Hypothesis, MentalState, Prediction } from './mental-state.js';
import { observationFromTest } from './observation-records.js';
import { truncate } from '../utils/truncate.js';
import { toError, type OperationOutcome } from './operation-outcome.js';
import { outcomeVerdictSchema } from './thought-patch.js';

/** What a real test observed about one prediction. */
export const outcomeReportSchema = z.object({
  verdict: outcomeVerdictSchema,
  /** What was measured; recorded as an observation. */
  observed: z.unknown().optional(),
  summary: z.string().trim().min(1).optional(),
  context: z.string().optional(),
  metrics: z.record(z.number()).optional(),
  /** Candidate causes of a mismatch: proposals until they are tested. */
  causeCandidates: z.array(z.string().trim().min(1)).optional(),
  reason: z.string().optional(),
});

export type OutcomeReport = z.input<typeof outcomeReportSchema>;

/**
 * Confronts a prediction with the world: a measurement, a simulation, a test suite, a
 * query. It must report `inconclusive` when it cannot tell, and it should not be a model
 * judging its own reasoning: self-critique prepares a test, it does not replace one.
 */
export interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: {
    prediction: Prediction;
    hypothesis: Hypothesis;
    state: MentalState;
    abortSignal?: AbortSignal;
  }): Promise<OutcomeReport>;
}

/**
 * Performs `test_prediction`: runs the evaluator on the next pending prediction, records
 * the full report as a `cognition.evaluated` event and returns the evaluation for the
 * thought. A failing or invalid evaluator gives an inconclusive result, never a refutation.
 */
export class PredictionTester {
  constructor(
    private readonly evaluator: OutcomeEvaluator,
    private readonly recorder: CognitiveRunRecorder
  ) {}

  async test(input: {
    runId: string;
    state: MentalState;
    step: number;
    signal: AbortSignal;
  }): Promise<OperationOutcome> {
    const { state, signal } = input;
    const prediction = nextPredictionToTest(state);
    const hypothesis = state.hypotheses.find(
      (candidate) => candidate.id === prediction?.hypothesisId
    );
    if (!prediction || !hypothesis) {
      return { failure: new Error('no pending prediction to test') };
    }

    const startedAt = Date.now();
    const report = await this.runEvaluator(prediction, hypothesis, state, signal);
    const observed = report.observed ?? report.summary;
    const eventId = await this.recorder.record(input.runId, 'cognition.evaluated', {
      step: input.step,
      predictionId: prediction.id,
      hypothesisId: hypothesis.id,
      evaluator: { id: this.evaluator.id, version: this.evaluator.version },
      ...report,
      durationMs: Date.now() - startedAt,
    });
    const observation =
      observed === undefined
        ? undefined
        : observationFromTest({
            evaluatorId: this.evaluator.id,
            observed,
            ...(report.summary ? { summary: report.summary } : {}),
            sourceEventId: eventId,
            observedAt: startedAt,
            ...((report.context ?? prediction.context)
              ? { context: report.context ?? prediction.context }
              : {}),
          });

    return {
      engine: {
        summary: `Tested ${prediction.id} of ${hypothesis.id}: ${report.verdict}${report.reason ? ` (${truncate(report.reason, 200)})` : ''}`,
        evaluations: [
          {
            predictionId: prediction.id,
            verdict: report.verdict,
            evaluatorId: this.evaluator.id,
            evaluatorVersion: this.evaluator.version,
            ...(observation ? { observation } : {}),
            ...(report.metrics ? { metrics: report.metrics } : {}),
            causeCandidates: report.causeCandidates ?? [],
            ...(report.reason ? { reason: truncate(report.reason) } : {}),
          },
        ],
      },
    };
  }

  private async runEvaluator(
    prediction: Prediction,
    hypothesis: Hypothesis,
    state: MentalState,
    signal: AbortSignal
  ): Promise<z.output<typeof outcomeReportSchema>> {
    let raw: unknown;
    try {
      raw = await this.evaluator.evaluate({ prediction, hypothesis, state, abortSignal: signal });
    } catch (error) {
      if (signal.aborted) throw error;
      return { verdict: 'inconclusive', reason: `evaluator failed: ${toError(error).message}` };
    }
    const parsed = outcomeReportSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return {
        verdict: 'inconclusive',
        reason:
          `invalid evaluator report: ${issue?.path.join('.') || 'report'} ${issue?.message ?? ''}`.trim(),
      };
    }
    if (
      parsed.data.verdict === 'refuted' &&
      parsed.data.observed === undefined &&
      !parsed.data.summary
    ) {
      // A refutation rejects a hypothesis: it must say what was observed.
      return {
        ...parsed.data,
        verdict: 'inconclusive',
        reason: 'a refutation must report what was observed',
      };
    }
    return parsed.data;
  }
}
