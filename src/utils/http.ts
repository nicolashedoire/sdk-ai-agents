import { ValidationError } from '../errors/index.js';

/** Minimal response surface used by the SDK's HTTP adapters (satisfied by `fetch`). */
export interface HttpResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/** Transport port. Defaults to the global `fetch`; inject another one for proxies or tests. */
export type FetchLike = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<HttpResponseLike>;

export function defaultFetch(): FetchLike {
  if (typeof globalThis.fetch !== 'function') {
    throw new ValidationError('fetch', 'no global fetch available; pass a fetch implementation');
  }
  return (url, init) => globalThis.fetch(url, init);
}

/** Parses `retry-after` given in seconds or as an HTTP date. */
export function parseRetryAfter(
  value: string | null,
  now: number = Date.now()
): number | undefined {
  if (!value) {
    return undefined;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(value);
  if (Number.isNaN(date)) {
    return undefined;
  }
  return Math.max(0, date - now);
}
