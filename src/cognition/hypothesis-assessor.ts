import { ValidationError } from '../errors/index.js';
import {
  normalizeScore,
  rejectedDecision,
  score,
  type DecisionResponse,
  type ScoreQuestion,
  type TypedDecisionClient,
} from '../decisions/typed-decisions.js';
import type { DecisionEvaluationRecord } from './cognitive-controller.js';
import { rankScore } from './decision-readiness.js';
import {
  activeFacts,
  activeHypotheses,
  type Hypothesis,
  type MentalState,
} from './mental-state.js';
import type { ThinkerProfile } from './thinker-profile.js';
import { thoughtPatchSchema, type ThoughtPatch } from './thought-patch.js';
import { describeThinker } from './typed-decision-state.js';

export interface HypothesisAssessment {
  patch: ThoughtPatch;
  evaluations: DecisionEvaluationRecord[];
}

/** Judges the active hypotheses during the `compare` operation. */
export interface HypothesisAssessor {
  readonly name: string;
  assess(input: {
    state: MentalState;
    profile: ThinkerProfile;
    abortSignal?: AbortSignal;
  }): Promise<HypothesisAssessment>;
}

/** An assessment that failed after typed-decision calls were made (they are still billed). */
export class HypothesisAssessmentError extends Error {
  constructor(
    message: string,
    readonly evaluations: DecisionEvaluationRecord[]
  ) {
    super(message);
    this.name = 'HypothesisAssessmentError';
  }
}

export interface TypedHypothesisAssessorOptions {
  /** Hypotheses whose evidence support falls below this value are rejected. Defaults to 0.15. */
  rejectBelow?: number;
  model?: string;
}

const EVIDENCE_LEVELS = [
  'Refuted by observations, predictions or critiques',
  'Weakly supported',
  'Plausible',
  'Strongly supported',
  'Established by observations',
];

const FIT_LEVELS = [
  'Meets one of `thinker.rejects`',
  'Poor fit with `thinker.priorities`',
  'Acceptable fit with `thinker.priorities`',
  'Good fit with `thinker.priorities`',
  'Ideal fit with `thinker.priorities`',
];

const MAX_FACTS = 30;

/**
 * Judges hypotheses with atomic Score questions. Evidence is asked in a request that does
 * not contain the thinker's profile, so preferences cannot color it; fit with the thinker is
 * asked separately, for proposals only. Preferences may reorder actions, never make a claim
 * more credible. Thresholds stay in code, as recommended for calibrated decision models.
 */
export class TypedHypothesisAssessor implements HypothesisAssessor {
  readonly name: string;
  private readonly rejectBelow: number;

  constructor(
    private readonly client: TypedDecisionClient,
    private readonly options: TypedHypothesisAssessorOptions = {}
  ) {
    this.name = client.name;
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

    const evidenceState = {
      goal: input.state.goal,
      facts: relevantFacts(input.state, hypotheses),
      hypotheses: hypotheses.map((hypothesis) => describeForAssessment(input.state, hypothesis)),
    };
    const evidenceQuestions: Record<string, ScoreQuestion> = {};
    hypotheses.forEach((hypothesis, index) => {
      evidenceQuestions[`evidence_${hypothesis.id}`] = score(
        `How well do the facts, observations, predictions and critiques support \`hypotheses[${index}]\`?`,
        EVIDENCE_LEVELS
      );
    });
    const evidence = await this.ask('evidence', evidenceState, evidenceQuestions, input, []);

    const proposals = hypotheses.filter((hypothesis) => hypothesis.kind === 'proposal');
    const fitState = {
      goal: input.state.goal,
      thinker: describeThinker(input.profile),
      proposals: proposals.map((hypothesis) => describeForAssessment(input.state, hypothesis)),
    };
    const fitQuestions: Record<string, ScoreQuestion> = {};
    proposals.forEach((hypothesis, index) => {
      fitQuestions[`fit_${hypothesis.id}`] = score(
        `How well does \`proposals[${index}]\` match how \`thinker\` judges solutions?`,
        FIT_LEVELS
      );
    });
    const fit =
      proposals.length > 0
        ? await this.ask('fit', fitState, fitQuestions, input, [evidence.record])
        : undefined;
    const records = [evidence.record, ...(fit ? [fit.record] : [])];

    const updates = hypotheses.map((hypothesis) => {
      const evidenceAnswer = evidence.response.answers[`evidence_${hypothesis.id}`];
      if (!evidenceAnswer) {
        // Keeping the old score would pass it off as a fresh assessment.
        throw new HypothesisAssessmentError(
          `${this.client.name} returned no evidence score for ${hypothesis.id}`,
          records
        );
      }
      const fitAnswer = fit?.response.answers[`fit_${hypothesis.id}`];
      const support = round(normalizeScore(evidenceAnswer));
      const preferenceFit = fitAnswer ? round(normalizeScore(fitAnswer)) : undefined;
      const base = {
        hypothesisId: hypothesis.id,
        support,
        ...(preferenceFit !== undefined ? { preferenceFit } : {}),
        basisRefs: [...hypothesis.premiseRefs, ...hypothesis.evidenceRefs],
      };
      if (support < this.rejectBelow) {
        return {
          ...base,
          reject: true,
          reason: `evidence support ${support} below ${this.rejectBelow}`,
        };
      }
      if (fitAnswer && fitAnswer.score === 0) {
        return { ...base, reject: true, reason: 'the thinker rejects this kind of solution' };
      }
      return base;
    });

    const patch = thoughtPatchSchema.parse({
      summary: `Assessed ${hypotheses.length} hypotheses with ${this.client.name}: ${this.describeRanking(input.state, updates)}`,
      hypothesisUpdates: updates,
    });
    return { patch, evaluations: records };
  }

  /**
   * One typed-decision request. When it fails after earlier requests of the assessment, or
   * after the backend billed an answer it rejected, the error carries those calls
   * (`HypothesisAssessmentError`) so they are still recorded and priced, also when the run is
   * being stopped.
   */
  private async ask(
    label: 'evidence' | 'fit',
    state: Record<string, unknown>,
    questions: Record<string, ScoreQuestion>,
    input: { abortSignal?: AbortSignal },
    earlier: DecisionEvaluationRecord[]
  ) {
    const call = {
      client: this.client.name,
      purpose: 'hypothesis_assessment' as const,
      state,
      questions,
    };
    let response: DecisionResponse<Record<string, ScoreQuestion>>;
    try {
      response = await this.client.evaluate({
        state,
        questions,
        ...(this.options.model ? { model: this.options.model } : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch (error) {
      const rejected = rejectedDecision(error);
      const records = rejected ? [...earlier, { ...call, answers: {}, ...rejected }] : earlier;
      if (records.length === 0) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      throw new HypothesisAssessmentError(`${label} request failed: ${reason}`, records);
    }
    const record: DecisionEvaluationRecord = {
      ...call,
      model: response.model,
      answers: response.answers,
      ...(response.usage ? { usage: response.usage } : {}),
    };
    return { response, record };
  }

  private describeRanking(
    state: MentalState,
    updates: Array<{ hypothesisId: string; support: number; preferenceFit?: number }>
  ): string {
    return updates
      .map((update) => {
        const hypothesis = state.hypotheses.find(
          (candidate) => candidate.id === update.hypothesisId
        );
        const judged = hypothesis
          ? rankScore(state, {
              ...hypothesis,
              support: update.support,
              ...(update.preferenceFit !== undefined
                ? { preferenceFit: update.preferenceFit }
                : {}),
            })
          : update.support;
        return { id: update.hypothesisId, support: update.support, judged };
      })
      .sort((left, right) => right.judged - left.judged)
      .map((entry) => `${entry.id} evidence ${entry.support}`)
      .join(', ');
  }
}

/** Facts the hypotheses rest on first, then the most recent ones, with their ids. */
function relevantFacts(state: MentalState, hypotheses: Hypothesis[]): string[] {
  const cited = new Set(
    hypotheses.flatMap((hypothesis) => [
      ...hypothesis.premiseRefs,
      ...hypothesis.evidenceRefs,
      ...hypothesis.counterEvidenceRefs,
    ])
  );
  const facts = activeFacts(state);
  const ordered = [
    ...facts.filter((fact) => cited.has(fact.id)),
    ...facts.filter((fact) => !cited.has(fact.id)).reverse(),
  ].slice(0, MAX_FACTS);
  return ordered.map(
    (fact) => `${fact.id}: ${fact.statement}${fact.evidence ? ` (evidence: ${fact.evidence})` : ''}`
  );
}

/** Premises from earlier runs, with what their tests showed. */
function remembered(state: MentalState, hypothesis: Hypothesis): Record<string, string[]> {
  const items = state.knowledge.filter((item) => hypothesis.premiseRefs.includes(item.id));
  if (items.length === 0) return {};
  return {
    earlierRuns: items.map(
      (item) =>
        `${item.id}: ${item.status} in earlier runs (${item.confirmations} confirmed, ${item.refutations} refuted): ${item.statement}`
    ),
  };
}

function describeForAssessment(
  state: MentalState,
  hypothesis: Hypothesis
): Record<string, unknown> {
  const observations = (ids: string[]) =>
    state.observations
      .filter((observation) => ids.includes(observation.id))
      .map((observation) => `${observation.id}: ${observation.summary}`);
  return {
    id: hypothesis.id,
    kind: hypothesis.kind,
    statement: hypothesis.statement,
    ...(hypothesis.scope ? { scope: hypothesis.scope } : {}),
    simulations: hypothesis.simulations.map((simulation) => simulation.outcome),
    critiques: hypothesis.critiques.map(
      (critique) =>
        `[${critique.severity}] ${critique.objection}${critique.rebuttal ? ` — rebuttal: ${critique.rebuttal}` : ''}`
    ),
    predictions: state.predictions
      .filter((prediction) => prediction.hypothesisId === hypothesis.id)
      .map((prediction) => `${prediction.expected} → ${prediction.status}`),
    confirmedBy: observations(hypothesis.evidenceRefs),
    contradictedBy: observations(hypothesis.counterEvidenceRefs),
    ...remembered(state, hypothesis),
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
