import { z } from 'zod';
import { DecisionClientError, ValidationError } from '../errors/index.js';
import { truncate } from '../utils/truncate.js';

/**
 * Typed decisions ("System One" questions).
 *
 * A typed decision asks a model a narrow question about a `state` and gets back a
 * structured, calibrated answer instead of free text:
 * - `noul`   – a yes/no question, answered with the probability that the answer is yes;
 * - `choice` – pick one option from a closed set, with a probability per option;
 * - `score`  – place the state on an ordered rubric (2 to 10 levels).
 *
 * The contract mirrors TypeSafe's Jev API so that Jev, a self-hosted clone exposing the
 * same endpoint, or an in-memory implementation can be used interchangeably.
 */

/** Text or JSON structure accepted by `state`, `instructions` and `criteria`. */
export type Structured = string | Record<string, unknown> | unknown[];

export interface NoulQuestion {
  type: 'noul';
  instructions: Structured;
  criteria?: { true?: Structured; false?: Structured };
}

export interface ChoiceQuestion<Option extends string = string> {
  type: 'choice';
  instructions: Structured;
  /** Option → description (or `null` when the option needs no description). */
  criteria: Record<Option, Structured | null>;
}

export interface ScoreQuestion {
  type: 'score';
  instructions: Structured;
  /** Ordered level descriptions, lowest first. */
  criteria: Structured[];
}

export type TypedQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type TypedQuestions = Record<string, TypedQuestion>;

const probabilityMapSchema = z.record(z.number().min(0).max(1));

export const noulAnswerSchema = z.object({
  type: z.literal('noul'),
  noul: z.number().min(0).max(1),
});

export const choiceAnswerSchema = z.object({
  type: z.literal('choice'),
  choice: z.string(),
  probabilities: probabilityMapSchema,
  confidence: z.number().min(0).max(1),
});

export const scoreAnswerSchema = z.object({
  type: z.literal('score'),
  score: z.number(),
  legend: z.record(z.string()),
  probabilities: probabilityMapSchema,
  confidence: z.number().min(0).max(1),
});

export const typedAnswerSchema = z.discriminatedUnion('type', [
  noulAnswerSchema,
  choiceAnswerSchema,
  scoreAnswerSchema,
]);

export type NoulAnswer = z.infer<typeof noulAnswerSchema>;
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export type ScoreAnswer = z.infer<typeof scoreAnswerSchema>;
export type TypedAnswer = z.infer<typeof typedAnswerSchema>;

/** Answer type matching a question type. */
export type AnswerFor<Q extends TypedQuestion> = Q extends NoulQuestion
  ? NoulAnswer
  : Q extends ChoiceQuestion<infer Option>
    ? Omit<ChoiceAnswer, 'choice' | 'probabilities'> & {
        /** One of the options of the question. */
        choice: Option;
        probabilities: Record<Option, number>;
      }
    : ScoreAnswer;

export type TypedAnswers<Q extends TypedQuestions> = { [K in keyof Q]: AnswerFor<Q[K]> };

export interface DecisionRequest<Q extends TypedQuestions> {
  state: Structured;
  questions: Q;
  /** Overrides the client's default model for this request. */
  model?: string;
  abortSignal?: AbortSignal;
}

export interface DecisionUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface DecisionResponse<Q extends TypedQuestions> {
  /** Versioned model id that answered (e.g. `jev-1.13.0`). */
  model: string;
  answers: TypedAnswers<Q>;
  /**
   * Tokens the call used. Absent when the backend reported no input/output token counts: the
   * cost of the call is then unknown (`sdk.getRunCost` counts it as unmetered), not zero.
   */
  usage?: DecisionUsage;
}

/**
 * Port for any typed-decision backend (Jev, an open-source clone, an in-memory
 * implementation for tests).
 */
export interface TypedDecisionClient {
  /** Short backend name recorded in events (e.g. `jev`). */
  readonly name: string;
  evaluate<Q extends TypedQuestions>(request: DecisionRequest<Q>): Promise<DecisionResponse<Q>>;
}

export const MAX_CHOICE_OPTIONS = 255;
export const MIN_SCORE_LEVELS = 2;
export const MAX_SCORE_LEVELS = 10;

/** Builds a yes/no question. */
export function noul(instructions: Structured, criteria?: NoulQuestion['criteria']): NoulQuestion {
  return criteria ? { type: 'noul', instructions, criteria } : { type: 'noul', instructions };
}

/** Builds a question that picks one option from a closed set. */
export function choice<Option extends string>(
  instructions: Structured,
  criteria: Record<Option, Structured | null>
): ChoiceQuestion<Option> {
  return { type: 'choice', instructions, criteria };
}

/** Builds a question that rates the state on ordered levels (lowest first). */
export function score(instructions: Structured, levels: Structured[]): ScoreQuestion {
  return { type: 'score', instructions, criteria: levels };
}

/**
 * Checks the documented limits before a request leaves the process.
 * @throws ValidationError when a question cannot be answered by the API.
 */
export function assertValidQuestions(questions: TypedQuestions): void {
  const entries = Object.entries(questions);
  if (entries.length === 0) {
    throw new ValidationError('questions', 'at least one question is required');
  }
  for (const [id, question] of entries) {
    if (id.trim() === '') {
      throw new ValidationError('questions', 'question ids must not be empty');
    }
    if (question.type === 'choice') {
      const optionCount = Object.keys(question.criteria).length;
      if (optionCount < 2 || optionCount > MAX_CHOICE_OPTIONS) {
        throw new ValidationError(
          `questions.${id}.criteria`,
          `a choice needs between 2 and ${MAX_CHOICE_OPTIONS} options (got ${optionCount})`
        );
      }
    }
    if (question.type === 'score') {
      const levelCount = question.criteria.length;
      if (levelCount < MIN_SCORE_LEVELS || levelCount > MAX_SCORE_LEVELS) {
        throw new ValidationError(
          `questions.${id}.criteria`,
          `a score needs between ${MIN_SCORE_LEVELS} and ${MAX_SCORE_LEVELS} levels (got ${levelCount})`
        );
      }
    }
  }
}

/**
 * Validates raw answers against the questions that were asked: every question must be
 * answered, with the matching type, and a choice must name one of the offered options.
 */
export function parseAnswers<Q extends TypedQuestions>(
  questions: Q,
  rawAnswers: unknown
): TypedAnswers<Q> {
  const answersRecord = z.record(z.unknown()).safeParse(rawAnswers);
  if (!answersRecord.success) {
    throw new ValidationError('answers', 'answers must be an object keyed by question id');
  }

  const parsed: Record<string, TypedAnswer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const result = typedAnswerSchema.safeParse(answersRecord.data[id]);
    if (!result.success) {
      throw new ValidationError(
        `answers.${id}`,
        result.error.issues[0]?.message ?? 'invalid answer'
      );
    }
    const answer = result.data;
    if (answer.type !== question.type) {
      throw new ValidationError(
        `answers.${id}`,
        `expected a ${question.type} answer, received ${answer.type}`
      );
    }
    if (
      answer.type === 'choice' &&
      question.type === 'choice' &&
      !Object.hasOwn(question.criteria, answer.choice)
    ) {
      throw new ValidationError(`answers.${id}`, `"${answer.choice}" is not one of the options`);
    }
    parsed[id] = answer;
  }
  return parsed as TypedAnswers<Q>;
}

/**
 * The call behind an error of a backend that answered, and billed the call, although its
 * answer was rejected (see `DecisionClientError.billed`): the model, the usage it reported
 * and why the answer was rejected. Undefined for any other failure.
 */
export function rejectedDecision(
  error: unknown
): { model: string; usage?: DecisionUsage; error: string } | undefined {
  if (!(error instanceof DecisionClientError) || !error.billed) {
    return undefined;
  }
  const { model, usage } = error.billed;
  const cause = error.originalError ? `: ${error.originalError.message}` : '';
  // The message quotes the model's answer: bounded, like the other failures that are stored.
  return { model, ...(usage ? { usage } : {}), error: truncate(`${error.message}${cause}`) };
}

/** Normalizes a score answer to [0, 1] (0 = lowest level, 1 = highest level). */
export function normalizeScore(answer: ScoreAnswer): number {
  const levels = Object.keys(answer.legend).length;
  if (levels < 2) {
    return 0;
  }
  return Math.min(1, Math.max(0, answer.score / (levels - 1)));
}
