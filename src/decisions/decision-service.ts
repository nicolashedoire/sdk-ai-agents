import type { IEventStore } from '../stores/event-store.js';
import { generateEventId, generateId } from '../utils/id.js';
import {
  choice,
  noul,
  normalizeScore,
  rejectedDecision,
  score,
  type DecisionResponse,
  type DecisionUsage,
  type NoulQuestion,
  type Structured,
  type TypedDecisionClient,
  type TypedQuestions,
} from './typed-decisions.js';

/** Options as a list of names, or as a map of name → description (recommended). */
export type DecisionOptions = string[] | Record<string, Structured | null>;

interface Traced {
  /** Records the call in this run's event log (a dedicated `decision_*` stream otherwise). */
  runId?: string;
  agentId?: string;
  model?: string;
  abortSignal?: AbortSignal;
}

export interface AskInput<Q extends TypedQuestions> extends Traced {
  /** What the model evaluates: text or structured data (records, chat logs, app state). */
  context: Structured;
  questions: Q;
}

export interface ChooseResult {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  /** False when confidence is below `minConfidence`: route to a human or a stronger model. */
  confident: boolean;
  runId: string;
}

export interface SelectManyResult {
  /** Options whose probability reaches the threshold, most likely first. */
  selected: string[];
  probabilities: Record<string, number>;
  runId: string;
}

export interface CheckResult {
  probability: number;
  yes: boolean;
  runId: string;
}

export interface RateResult {
  /** Probability-weighted level index (can fall between levels). */
  score: number;
  /** Score scaled to [0, 1]. */
  normalized: number;
  /** Description of the closest level. */
  level: string;
  confidence: number;
  runId: string;
}

/**
 * Typed decisions with context injection, single and multiple choice, yes/no checks and
 * ratings. Every call is written to the event log as `decision.evaluated`, with its usage,
 * so it is traceable and priced like any other model call — also a call whose answer the
 * client rejected (recorded with its `error`, then the error is thrown).
 */
export class DecisionService {
  constructor(
    private readonly client: TypedDecisionClient,
    private readonly eventStore: IEventStore
  ) {}

  /** Asks any set of typed questions about one context in a single request. */
  async ask<Q extends TypedQuestions>(
    input: AskInput<Q>
  ): Promise<DecisionResponse<Q> & { runId: string }> {
    // A run id the store would refuse is refused before the paid call, not after it.
    if (input.runId !== undefined) this.eventStore.checkRunId?.(input.runId);
    const runId = input.runId ?? `decision_${generateId()}`;
    let response: DecisionResponse<Q>;
    try {
      response = await this.client.evaluate({
        state: input.context,
        questions: input.questions,
        ...(input.model ? { model: input.model } : {}),
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    } catch (error) {
      // The backend answered and billed the call, but its answer was rejected: recorded so
      // that it is priced, before the error reaches the caller.
      // A store that cannot record it does not replace the client's error.
      const rejected = rejectedDecision(error);
      if (rejected) {
        await this.record(runId, input, { answers: {}, ...rejected }).catch(() => undefined);
      }
      throw error;
    }
    await this.record(runId, input, {
      model: response.model,
      answers: response.answers,
      ...(response.usage ? { usage: response.usage } : {}),
    });
    return { ...response, runId };
  }

  private async record(
    runId: string,
    input: AskInput<TypedQuestions>,
    outcome: { model: string; answers: object; usage?: DecisionUsage; error?: string }
  ): Promise<void> {
    await this.eventStore.append(runId, {
      id: generateEventId(),
      runId,
      type: 'decision.evaluated',
      timestamp: Date.now(),
      data: {
        client: this.client.name,
        purpose: 'direct',
        model: outcome.model,
        state: input.context,
        questions: input.questions,
        answers: outcome.answers,
        ...(outcome.usage ? { usage: outcome.usage } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      },
      ...(input.agentId ? { metadata: { agentId: input.agentId } } : {}),
    });
  }

  /** Picks exactly one option. */
  async choose(
    input: Traced & {
      context: Structured;
      question: Structured;
      options: DecisionOptions;
      minConfidence?: number;
    }
  ): Promise<ChooseResult> {
    const response = await this.ask({
      ...input,
      questions: { choice: choice(input.question, toCriteria(input.options)) },
    });
    const answer = response.answers.choice;
    return {
      choice: answer.choice,
      confidence: answer.confidence,
      probabilities: answer.probabilities,
      confident: answer.confidence >= (input.minConfidence ?? 0.5),
      runId: response.runId,
    };
  }

  /**
   * Selects every option that applies (multi-label). Each option becomes its own yes/no
   * question, all sent in one request, and the threshold is applied in code.
   */
  async selectMany(
    input: Traced & {
      context: Structured;
      question: Structured;
      options: DecisionOptions;
      threshold?: number;
    }
  ): Promise<SelectManyResult> {
    const criteria = toCriteria(input.options);
    const names = Object.keys(criteria);
    const questions: Record<string, NoulQuestion> = {};
    names.forEach((name, index) => {
      questions[`option_${index}`] = noul({
        question: input.question,
        option: name,
        ...(criteria[name] ? { description: criteria[name] } : {}),
        ask: 'Given `question`, does `option` apply to the state?',
      });
    });
    const response = await this.ask({ ...input, questions });
    const probabilities: Record<string, number> = {};
    names.forEach((name, index) => {
      probabilities[name] = response.answers[`option_${index}`]?.noul ?? 0;
    });
    const threshold = input.threshold ?? 0.5;
    const selected = names
      .filter((name) => (probabilities[name] ?? 0) >= threshold)
      .sort((left, right) => (probabilities[right] ?? 0) - (probabilities[left] ?? 0));
    return { selected, probabilities, runId: response.runId };
  }

  /** Answers a yes/no question with a calibrated probability. */
  async check(
    input: Traced & {
      context: Structured;
      question: Structured;
      criteria?: NoulQuestion['criteria'];
      threshold?: number;
    }
  ): Promise<CheckResult> {
    const response = await this.ask({
      ...input,
      questions: { check: noul(input.question, input.criteria) },
    });
    const probability = response.answers.check.noul;
    return { probability, yes: probability >= (input.threshold ?? 0.5), runId: response.runId };
  }

  /** Rates the context on ordered levels (lowest first, 2 to 10 levels). */
  async rate(
    input: Traced & { context: Structured; question: Structured; levels: Structured[] }
  ): Promise<RateResult> {
    const response = await this.ask({
      ...input,
      questions: { rating: score(input.question, input.levels) },
    });
    const answer = response.answers.rating;
    const nearest = Math.min(Math.max(Math.round(answer.score), 0), input.levels.length - 1);
    const level = answer.legend[String(nearest)] ?? String(nearest);
    return {
      score: answer.score,
      normalized: normalizeScore(answer),
      level,
      confidence: answer.confidence,
      runId: response.runId,
    };
  }
}

function toCriteria(options: DecisionOptions): Record<string, Structured | null> {
  if (!Array.isArray(options)) {
    return options;
  }
  const criteria: Record<string, Structured | null> = {};
  for (const option of options) {
    criteria[option] = null;
  }
  return criteria;
}
