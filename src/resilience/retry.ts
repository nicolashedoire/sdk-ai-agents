import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { LLMProviderError } from '../errors/index.js';
import { parseRetryAfter } from '../utils/http.js';

export interface RetryPolicy {
  /** Retries after the first attempt. 0 disables retries. */
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Delay multiplier between attempts. Defaults to 2. */
  multiplier?: number;
  /** Randomizes each delay in [delay/2, delay] to avoid synchronized retries. Defaults to true. */
  jitter?: boolean;
  /** Decides whether an error is worth retrying. Defaults to `isTransientError`. */
  retryOn?: (error: unknown) => boolean;
  /**
   * Longest pause requested by a server (`retry-after`) that is honored. A longer request
   * ends the retries. Defaults to 60 s; the SDK lowers it to `maxDelayMs` when a fallback
   * provider can take over.
   */
  maxRetryAfterMs?: number;
}

export const DEFAULT_MAX_RETRY_AFTER_MS = 60_000;

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  initialDelayMs: 500,
  maxDelayMs: 8_000,
  multiplier: 2,
  jitter: true,
};

export interface RetryAttemptInfo {
  /** 1 for the first retry. */
  retry: number;
  delayMs: number;
  error: unknown;
}

export interface RetryOptions {
  signal?: AbortSignal;
  onRetry?: (info: RetryAttemptInfo) => void | Promise<void>;
  /** Waiting port, injectable for deterministic tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Random source in [0, 1) used for jitter. */
  random?: () => number;
}

const TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'EPIPE',
  'UND_ERR_SOCKET',
  // The connection closed in the middle of a streamed answer (Node streams, node-fetch).
  'ERR_STREAM_PREMATURE_CLOSE',
]);

/** Codes of an exhausted account: waiting does not bring credit back. */
const EXHAUSTED_ACCOUNT_CODES = new Set([
  'insufficient_quota',
  'credit_balance_exhausted',
  'billing_hard_limit_reached',
  'billing_not_active',
]);

/**
 * Types of the errors a vendor sends in the middle of a streamed answer, once the HTTP status
 * (200) is gone: those whose HTTP counterpart is transient. OpenAI `server_error` (500);
 * Anthropic `rate_limit_error` (429), `api_error` (500), `timeout_error` (504) and
 * `overloaded_error` (529).
 */
const TRANSIENT_STREAM_ERROR_TYPES = new Set([
  'server_error',
  'rate_limit_error',
  'api_error',
  'timeout_error',
  'overloaded_error',
]);

const CONNECTION_ERROR_CLASSES = new Set([
  'APIConnectionError',
  'APIConnectionTimeoutError',
  'FetchError',
]);

/**
 * True for errors a retry can fix: rate limits, overloads, server errors, timeouts and
 * network failures. Authentication, validation and policy errors are never retried, nor is
 * an account out of credit or quota (a 429 that waiting cannot fix).
 *
 * Vendor SDK errors are recognized by class name (their `name` property is a plain
 * `Error`), by the network code carried on `cause`, and, for an OpenAI or Anthropic API error
 * sent in the middle of a stream (it has no status), by the vendor's error type.
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof LLMProviderError && error.connectionFailure) {
    return true;
  }
  for (const candidate of errorChain(error)) {
    const code = readString(candidate, 'code');
    const type = readString(candidate, 'type');
    if (
      (code && EXHAUSTED_ACCOUNT_CODES.has(code)) ||
      (type && EXHAUSTED_ACCOUNT_CODES.has(type))
    ) {
      return false;
    }
    const status = readNumber(candidate, 'status') ?? readNumber(candidate, 'statusCode');
    if (status !== undefined) {
      return TRANSIENT_STATUSES.has(status);
    }
    if (code && TRANSIENT_CODES.has(code)) {
      return true;
    }
    if (
      (candidate instanceof OpenAI.APIError || candidate instanceof Anthropic.APIError) &&
      vendorErrorTypes(candidate).some((kind) => TRANSIENT_STREAM_ERROR_TYPES.has(kind))
    ) {
      return true;
    }
    const className = candidate.constructor?.name;
    const name = readString(candidate, 'name');
    if (
      (className && CONNECTION_ERROR_CLASSES.has(className)) ||
      (name && CONNECTION_ERROR_CLASSES.has(name))
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Delay requested by the server through `retry-after-ms` or `retry-after`, read from the
 * headers vendor SDK errors carry (plain object or `Headers`).
 */
export function retryAfterFromError(error: unknown): number | undefined {
  for (const candidate of errorChain(error)) {
    const headers: unknown = Reflect.get(candidate, 'headers');
    if (!headers || typeof headers !== 'object') continue;
    const milliseconds = Number(readHeader(headers, 'retry-after-ms'));
    if (
      Number.isFinite(milliseconds) &&
      milliseconds >= 0 &&
      readHeader(headers, 'retry-after-ms')
    ) {
      return milliseconds;
    }
    const retryAfter = parseRetryAfter(readHeader(headers, 'retry-after') ?? null);
    if (retryAfter !== undefined) {
      return retryAfter;
    }
  }
  return undefined;
}

/** The error, the error it wraps (`originalError`) and their causes. */
function errorChain(error: unknown): object[] {
  const chain: object[] = [];
  const queue: unknown[] = [error];
  while (queue.length > 0 && chain.length < 6) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || chain.includes(current)) continue;
    chain.push(current);
    queue.push(
      current instanceof LLMProviderError ? current.originalError : undefined,
      Reflect.get(current, 'cause')
    );
  }
  return chain;
}

/**
 * The error types a vendor error carries: its own `type` (OpenAI), and those of the body it
 * holds in `error` (OpenAI `{ type }`, Anthropic `{ type: 'error', error: { type } }`).
 */
function vendorErrorTypes(candidate: object): string[] {
  const types: string[] = [];
  let current: unknown = candidate;
  for (let depth = 0; depth < 3 && current && typeof current === 'object'; depth++) {
    const type = readString(current, 'type');
    if (type) types.push(type);
    current = Reflect.get(current, 'error');
  }
  return types;
}

function readHeader(headers: object, name: string): string | undefined {
  const getter: unknown = Reflect.get(headers, 'get');
  const value: unknown =
    typeof getter === 'function' ? getter.call(headers, name) : Reflect.get(headers, name);
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** Runs `operation`, retrying failures accepted by the policy with exponential backoff. */
export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  options: RetryOptions = {}
): Promise<T> {
  const retryOn = policy.retryOn ?? isTransientError;
  const sleep = options.sleep ?? sleepFor;
  const random = options.random ?? Math.random;
  let attempt = 0;

  for (;;) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (options.signal?.aborted || attempt >= policy.maxRetries || !retryOn(error)) {
        throw error;
      }
      const base = Math.min(
        policy.initialDelayMs * (policy.multiplier ?? 2) ** attempt,
        policy.maxDelayMs
      );
      const requested = retryAfterFromError(error);
      if (
        requested !== undefined &&
        requested > (policy.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS)
      ) {
        // Longer than the policy accepts to wait: stop so a fallback (or the caller) takes over.
        throw error;
      }
      const delayMs =
        requested !== undefined
          ? requested
          : policy.jitter === false
            ? base
            : Math.round(base / 2 + (random() * base) / 2);
      attempt++;
      await options.onRetry?.({ retry: attempt, delayMs, error });
      await sleep(delayMs, options.signal);
    }
  }
}

function sleepFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Retry aborted'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('Retry aborted'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function readNumber(value: object, key: string): number | undefined {
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'number' ? field : undefined;
}

function readString(value: object, key: string): string | undefined {
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'string' ? field : undefined;
}
