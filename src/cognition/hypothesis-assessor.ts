import { ValidationError } from '../errors/index.js';
import {
  normalizeScore,
  score,
  type ScoreQuestion,
  type TypedDecisionClient,
} from '../decisions/typed-decisions.js';
import type { DecisionEvaluationRecord } from './cognitive-controller.js';
import { activeHypotheses, type MentalState, type ThoughtPatch } from './mental-state.js';
import { thoughtPatchSchema } from './mental-state.js';
import type { ThinkerProfile } from './thinker-profile.js';
import { describeThinker } from './typed-decision-state.js';

export interface HypothesisAssessment {
  patch: ThoughtPatch;
  evaluations: DecisionEvaluationRecord[];
}

/** Ranks the active hypotheses during the `compare` operation. */
export interface HypothesisAssessor {
  readonly name: string;
  assess(input: {
    state: MentalState;
    profile: ThinkerProfile;
    abortSignal?: AbortSignal;
  }): Promise<HypothesisAssessment>;
}

export interface TypedHypothesisAssessorOptions {
  /** Weight of the evidence score; the thinker-fit score gets the rest. Defaults to 0.6. */
  evidenceWeight?: number;
  /** Hypotheses whose combined support falls below this value are rejected. Defaults to 0.15. */
  rejectBelow?: number;
  model?: string;
}

const EVIDENCE_LEVELS = [
  'Refuted by its simulations or critiques',
  'Weakly supported',
  'Plausible',
  'Strongly supported',
  'Established by facts',
];

const FIT_LEVELS = [
  'Meets one of `thinker.rejects`',
  'Poor fit with `thinker.priorities`',
  'Acceptable fit with `thinker.priorities`',
  'Good fit with `thinker.priorities`',
  'Ideal fit with `thinker.priorities`',
];

/**
 * Compares hypotheses with two atomic Score questions each (evidence, fit with the
 * thinker) asked in a single typed-decision request. The combination and the rejection
 * threshold stay in code, as recommended for calibrated decision models.
 */
export class TypedHypothesisAssessor implements HypothesisAssessor {
  readonly name: string;
  private readonly evidenceWeight: number;
  private readonly rejectBelow: number;

  constructor(
    private readonly client: TypedDecisionClient,
    private readonly options: TypedHypothesisAssessorOptions = {}
  ) {
    this.name = client.name;
    this.evidenceWeight = Math.min(1, Math.max(0, options.evidenceWeight ?? 0.6));
    this.rejectBelow = options.rejectBelow ?? 0.15;
  }

  async assess(input: {
    state: MentalState;
    profile: ThinkerProfile;
    abortSignal?: AbortSignal;
  }): Promise<HypothesisAssessment> {
    const hypotheses = activeHypotheses(input.state);
    if (hypotheses.length === 0) {
      throw new ValidationError('hypotheses', 'there is no active hypothesis to compare');
    }

    const state = {
      goal: input.state.goal,
      thinker: describeThinker(input.profile),
      facts: input.state.facts.slice(-30).map((fact) => fact.statement),
      hypotheses: hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        simulations: hypothesis.simulations.map((simulation) => simulation.outcome),
        critiques: hypothesis.critiques.map(
          (critique) =>
            `[${critique.severity}] ${critique.objection}${critique.rebuttal ? ` — rebuttal: ${critique.rebuttal}` : ''}`
        ),
      })),
    };

    const questions: Record<string, ScoreQuestion> = {};
    hypotheses.forEach((hypothesis, index) => {
      questions[`evidence_${hypothesis.id}`] = score(
        `How well do the facts, simulations and critiques support \`hypotheses[${index}]\` as an answer to \`goal\`?`,
        EVIDENCE_LEVELS
      );
      questions[`fit_${hypothesis.id}`] = score(
        `How well does \`hypotheses[${index}]\` match how \`thinker\` judges solutions?`,
        FIT_LEVELS
      );
    });

    const response = await this.client.evaluate({
      state,
      questions,
      ...(this.options.model ? { model: this.options.model } : {}),
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });

    const updates = hypotheses.map((hypothesis) => {
      const evidence = response.answers[`evidence_${hypothesis.id}`];
      const fit = response.answers[`fit_${hypothesis.id}`];
      const support =
        evidence && fit
          ? this.evidenceWeight * normalizeScore(evidence) +
            (1 - this.evidenceWeight) * normalizeScore(fit)
          : hypothesis.support;
      const rounded = Math.round(support * 100) / 100;
      return rounded < this.rejectBelow
        ? {
            hypothesisId: hypothesis.id,
            support: rounded,
            reject: true,
            reason: `combined support ${rounded} below ${this.rejectBelow}`,
          }
        : { hypothesisId: hypothesis.id, support: rounded };
    });

    const ranking = [...updates]
      .sort((left, right) => (right.support ?? 0) - (left.support ?? 0))
      .map((update) => `${update.hypothesisId} ${update.support}`)
      .join(', ');

    return {
      patch: thoughtPatchSchema.parse({
        summary: `Compared ${hypotheses.length} hypotheses with ${this.client.name}: ${ranking}`,
        hypothesisUpdates: updates,
        confidence: Math.max(...updates.map((update) => update.support ?? 0)),
      }),
      evaluations: [
        {
          client: this.client.name,
          purpose: 'hypothesis_assessment',
          model: response.model,
          state,
          questions,
          answers: response.answers,
          usage: response.usage,
        },
      ],
    };
  }
}
