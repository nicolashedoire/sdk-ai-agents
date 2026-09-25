/** Why the web tools refused a request before (or instead of) sending it. */
export type WebRefusalReason =
  | 'scheme'
  | 'private-address'
  | 'downgrade'
  | 'redirects'
  | 'robots'
  | 'content-type'
  | 'too-large'
  | 'pacing';

/**
 * A request the web tools refused on purpose: a private address, a scheme other than http(s),
 * a redirect from https to http, too many redirects, a page robots.txt disallows… Never
 * retried: the same request would be refused again.
 */
export class WebRequestRefusedError extends Error {
  constructor(
    message: string,
    readonly reason: WebRefusalReason
  ) {
    super(message);
    this.name = 'WebRequestRefusedError';
  }
}

/** A non-2xx answer. `status` tells retries apart: 429 and 5xx are worth another try. */
export class WebHttpError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'WebHttpError';
  }
}

/** A request that did not finish in time. */
export class WebTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebTimeoutError';
  }
}

/**
 * A search provider that refused to answer now: HTTP 429, a captcha or "unusual traffic" page,
 * an empty page where results were expected. `web_search` goes on with the next provider and
 * skips this one for a while (its circuit breaker opens at once).
 */
export class SearchThrottledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchThrottledError';
  }
}

/** Worth retrying: 429, server errors, timeouts and network failures — not refusals or 4xx. */
export function isRetryableWebError(error: Error): boolean {
  if (error instanceof WebRequestRefusedError) return false;
  if (error instanceof WebHttpError) return error.status === 429 || error.status >= 500;
  return true;
}
