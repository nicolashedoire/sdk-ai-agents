import type {
  DecisionRequest,
  DecisionResponse,
  TypedAnswer,
  TypedDecisionClient,
  TypedQuestion,
  TypedQuestions,
} from '../../decisions/typed-decisions.js';
import { parseAnswers } from '../../decisions/typed-decisions.js';

export type Answerer = (id: string, question: TypedQuestion, state: unknown) => TypedAnswer;

/**
 * Deterministic typed-decision backend for tests. Answers come from a function of the
 * question, validated with the same `parseAnswers` contract as the real Jev client.
 */
export class InMemoryDecisionClient implements TypedDecisionClient {
  readonly name: string;
  readonly requests: Array<{ state: unknown; questions: TypedQuestions }> = [];
  failWith?: Error;

  constructor(
    private readonly answer: Answerer,
    options: { name?: string } = {}
  ) {
    this.name = options.name ?? 'memory';
  }

  async evaluate<Q extends TypedQuestions>(
    request: DecisionRequest<Q>
  ): Promise<DecisionResponse<Q>> {
    this.requests.push({ state: request.state, questions: request.questions });
    if (this.failWith) {
      throw this.failWith;
    }
    const raw: Record<string, TypedAnswer> = {};
    for (const [id, question] of Object.entries(request.questions)) {
      raw[id] = this.answer(id, question, request.state);
    }
    return {
      model: 'memory-1',
      answers: parseAnswers(request.questions, raw),
      usage: { inputTokens: 1_000, outputTokens: 10 },
    };
  }
}

/** Choice answer concentrated on one option. */
export function pick(question: TypedQuestion, option: string, probability = 0.9): TypedAnswer {
  if (question.type !== 'choice') {
    throw new Error('pick() expects a choice question');
  }
  const options = Object.keys(question.criteria);
  const rest = options.length > 1 ? (1 - probability) / (options.length - 1) : 0;
  const probabilities: Record<string, number> = {};
  for (const name of options) {
    probabilities[name] = name === option ? probability : rest;
  }
  const count = options.length;
  const confidence = Math.max(0, Math.min(1, (count * probability - 1) / (count - 1)));
  return { type: 'choice', choice: option, probabilities, confidence };
}

export function yes(probability: number): TypedAnswer {
  return { type: 'noul', noul: probability };
}

export function level(question: TypedQuestion, index: number): TypedAnswer {
  if (question.type !== 'score') {
    throw new Error('level() expects a score question');
  }
  const legend: Record<string, string> = {};
  const probabilities: Record<string, number> = {};
  question.criteria.forEach((criterion, position) => {
    legend[String(position)] =
      typeof criterion === 'string' ? criterion : JSON.stringify(criterion);
    probabilities[String(position)] = position === index ? 1 : 0;
  });
  return { type: 'score', score: index, legend, probabilities, confidence: 1 };
}
