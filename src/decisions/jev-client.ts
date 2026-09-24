import { z } from 'zod';
import { DecisionClientError, ValidationError } from '../errors/index.js';
import {
  assertValidQuestions,
  parseAnswers,
  type DecisionRequest,
  type DecisionResponse,
  type DecisionUsage,
  type TypedDecisionClient,
  type TypedQuestions,
} from './typed-decisions.js';
import { defaultFetch, parseRetryAfter, type FetchLike } from '../utils/http.js';

export type { FetchLike, HttpResponseLike } from '../utils/http.js';

export interface JevClientConfig {
  /**
   * TypeSafe API key, or a Vercel AI Gateway key when `baseUrl` is the gateway's TypeSafe
   * endpoint. Optional only when `baseUrl` points to a self-hosted, keyless clone.
   */
  apiKey?: string;
  /** Defaults to `https://api.typesafe.ai`. Any server exposing `POST /v1/systemone` works. */
  baseUrl?: string;
  /** Defaults to `jev-latest`. Pin a versioned id (e.g. `jev-1.13.0`) to freeze thresholds. */
  model?: string;
  /** Per-attempt timeout. Defaults to 30 s. */
  timeoutMs?: number;
  /** Retries on 408, 429, 5xx, 529 and network errors. Defaults to 2. */
  maxRetries?: number;
  /** First backoff delay, doubled on each retry. Defaults to 500 ms. */
  retryBaseDelayMs?: number;
  /** Upper bound for any single wait, including `retry-after`. Defaults to 30 s. */
  maxRetryDelayMs?: number;
  fetch?: FetchLike;
  /** Waiting port, injectable to keep retry tests fast and deterministic. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface JevModel {
  name: string;
  description: string;
  releaseDate: string;
}

export const JEV_DEFAULT_BASE_URL = 'https://api.typesafe.ai';
export const JEV_DEFAULT_MODEL = 'jev-latest';

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529]);
const MAX_ERROR_DETAIL_LENGTH = 500;

const usageSchema = z
  .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
  .optional();

const evaluationResponseSchema = z.object({
  model: z.string(),
  answers: z.record(z.unknown()),
  usage: usageSchema,
});

/** What a body that is not a valid evaluation may still tell about the call's cost. */
const billedResponseSchema = z.object({ model: z.string().optional(), usage: usageSchema });

const modelsResponseSchema = z.object({
  models: z.array(
    z.object({ name: z.string(), description: z.string(), release_date: z.string() })
  ),
});

/**
 * HTTP adapter for TypeSafe Jev (`POST /v1/systemone`).
 *
 * Validates questions before sending, validates answers on return, retries transient
 * failures with exponential backoff (honoring `retry-after`) and never logs the API key.
 */
export class JevClient implements TypedDecisionClient {
  readonly name = 'jev';
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  /** True private field: the key never shows up when the client is logged or inspected. */
  readonly #apiKey: string | undefined;

  constructor(config: JevClientConfig = {}) {
    this.#apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? JEV_DEFAULT_BASE_URL).replace(/\/+$/, '');
    if (!config.apiKey && this.baseUrl === JEV_DEFAULT_BASE_URL) {
      throw new ValidationError('apiKey', 'a TypeSafe API key is required to call api.typesafe.ai');
    }
    this.model = config.model ?? JEV_DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.maxRetries = Math.max(0, config.maxRetries ?? 2);
    this.retryBaseDelayMs = config.retryBaseDelayMs ?? 500;
    this.maxRetryDelayMs = config.maxRetryDelayMs ?? 30_000;
    this.fetchImpl = config.fetch ?? defaultFetch();
    this.sleep = config.sleep ?? abortableSleep;
  }

  async evaluate<Q extends TypedQuestions>(
    request: DecisionRequest<Q>
  ): Promise<DecisionResponse<Q>> {
    assertValidQuestions(request.questions);
    const requestedModel = request.model ?? this.model;
    const body = JSON.stringify({
      state: request.state,
      model: requestedModel,
      questions: request.questions,
    });

    const payload = await this.send('POST', '/v1/systemone', body, request.abortSignal);
    const parsed = evaluationResponseSchema.safeParse(payload);
    if (!parsed.success) {
      // No usable answer: the call is reported as billed only if the body gives its usage.
      const billed = billedResponseSchema.safeParse(payload);
      const usage = billed.success ? toDecisionUsage(billed.data.usage) : undefined;
      throw new DecisionClientError(this.name, 'Unexpected response shape from /v1/systemone', {
        retryable: false,
        ...(billed.success && usage
          ? { billed: { model: billed.data.model ?? requestedModel, usage } }
          : {}),
      });
    }

    const usage = toDecisionUsage(parsed.data.usage);
    let answers: DecisionResponse<Q>['answers'];
    try {
      answers = parseAnswers(request.questions, parsed.data.answers);
    } catch (error) {
      // The model answered, and the call was billed: the caller can still count it.
      throw new DecisionClientError(this.name, 'Response answers do not match the questions', {
        retryable: false,
        originalError: toError(error),
        billed: { model: parsed.data.model, ...(usage ? { usage } : {}) },
      });
    }

    return {
      model: parsed.data.model,
      answers,
      // Without token counts the cost is unknown: no usage rather than zero tokens.
      ...(usage ? { usage } : {}),
    };
  }

  /** Lists the model names and aliases the account can use. */
  async listModels(abortSignal?: AbortSignal): Promise<JevModel[]> {
    const payload = await this.send('GET', '/v1/models', undefined, abortSignal);
    const parsed = modelsResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new DecisionClientError(this.name, 'Unexpected response shape from /v1/models', {
        retryable: false,
      });
    }
    return parsed.data.models.map((model) => ({
      name: model.name,
      description: model.description,
      releaseDate: model.release_date,
    }));
  }

  private async send(
    method: 'GET' | 'POST',
    path: string,
    body: string | undefined,
    abortSignal: AbortSignal | undefined
  ): Promise<unknown> {
    let attempt = 0;
    for (;;) {
      const outcome = await this.attempt(method, path, body, abortSignal);
      if (outcome.kind === 'success') {
        return outcome.payload;
      }
      if (!outcome.error.retryable || attempt >= this.maxRetries) {
        throw outcome.error;
      }
      const backoff = this.retryBaseDelayMs * 2 ** attempt;
      await this.sleep(
        Math.min(outcome.retryAfterMs ?? backoff, this.maxRetryDelayMs),
        abortSignal
      );
      attempt++;
    }
  }

  private async attempt(
    method: 'GET' | 'POST',
    path: string,
    body: string | undefined,
    abortSignal: AbortSignal | undefined
  ): Promise<
    | { kind: 'success'; payload: unknown }
    | { kind: 'failure'; error: DecisionClientError; retryAfterMs?: number }
  > {
    if (abortSignal?.aborted) {
      throw new DecisionClientError(this.name, 'Request aborted', { retryable: false });
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      if (this.#apiKey) {
        headers.Authorization = `Bearer ${this.#apiKey}`;
      }

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await response.text();

      if (response.status >= 200 && response.status < 300) {
        try {
          return { kind: 'success', payload: JSON.parse(text) };
        } catch {
          return {
            kind: 'failure',
            error: new DecisionClientError(this.name, 'Response body is not valid JSON', {
              status: response.status,
              retryable: false,
            }),
          };
        }
      }

      return {
        kind: 'failure',
        error: new DecisionClientError(
          this.name,
          `HTTP ${response.status}${describeErrorBody(text)}`,
          { status: response.status, retryable: RETRYABLE_STATUSES.has(response.status) }
        ),
        retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
      };
    } catch (error) {
      if (abortSignal?.aborted) {
        throw new DecisionClientError(this.name, 'Request aborted', { retryable: false });
      }
      const timedOut = controller.signal.aborted;
      return {
        kind: 'failure',
        error: new DecisionClientError(
          this.name,
          timedOut ? `Request timed out after ${this.timeoutMs} ms` : 'Network error',
          { retryable: true, originalError: toError(error) }
        ),
      };
    } finally {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
    }
  }
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DecisionClientError('jev', 'Request aborted', { retryable: false }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DecisionClientError('jev', 'Request aborted', { retryable: false }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Token counts as reported, or undefined when neither input nor output tokens were given. */
function toDecisionUsage(usage: z.infer<typeof usageSchema>): DecisionUsage | undefined {
  if (usage?.input_tokens === undefined && usage?.output_tokens === undefined) {
    return undefined;
  }
  return { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 };
}

function describeErrorBody(text: string): string {
  const trimmed = text.trim();
  if (trimmed === '') {
    return '';
  }
  return `: ${trimmed.slice(0, MAX_ERROR_DETAIL_LENGTH)}`;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
