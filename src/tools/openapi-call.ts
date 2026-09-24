import { clip, readBoundedText } from './bounded-text.js';
import type { PreparedRequest } from './openapi-arguments.js';
import type { OpenApiFetch, OpenApiOperation } from './openapi-spec.js';

/** What an operation tool returns: the HTTP status and the parsed body. */
export interface OpenApiResult {
  status: number;
  data: unknown;
  /** Set when the body was longer than `maxResponseBytes` and was cut. */
  truncated?: true;
}

/** A non-2xx answer. `status` lets retries skip client errors (4xx). */
export class HttpStatusError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'HttpStatusError';
  }
}

export interface SendOptions {
  fetch: OpenApiFetch;
  timeoutMs: number;
  maxResponseBytes: number;
  signal?: AbortSignal;
}

/** Sends a prepared request; a non-2xx status or a redirect is an error. */
export async function sendRequest(
  operation: OpenApiOperation,
  request: PreparedRequest,
  options: SendOptions
): Promise<OpenApiResult> {
  const label = `${operation.method.toUpperCase()} ${operation.path}`;
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = setTimeout(abort, options.timeoutMs);
  let status: number;
  let redirected: boolean;
  let contentType: string | null;
  let content: { text: string; truncated: boolean };
  try {
    const response = await options.fetch(request.url, {
      method: operation.method.toUpperCase(),
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      signal: controller.signal,
      redirect: 'manual',
    });
    status = response.status;
    // A custom fetch may ignore `redirect: 'manual'`: a followed redirect is refused too.
    redirected = response.redirected === true;
    contentType = response.headers.get('content-type');
    content = await readBoundedText(response, options.maxResponseBytes);
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new Error(`${label} timed out after ${options.timeoutMs} ms`);
    }
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} failed: ${reason}`, { cause: error });
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
  if (redirected || (status >= 300 && status < 400)) {
    throw new HttpStatusError(
      `${label} returned HTTP ${status}: redirects are not followed`,
      status
    );
  }
  if (status < 200 || status >= 300) {
    const detail = clip(content.text.trim(), 500);
    throw new HttpStatusError(
      `${label} returned HTTP ${status}${detail ? `: ${detail}` : ''}`,
      status
    );
  }
  return toResult(status, contentType, content);
}

/** Worth retrying: server errors (5xx), 429, timeouts and network failures — not 4xx. */
export function isRetryableCallError(error: Error): boolean {
  return error instanceof HttpStatusError ? error.status >= 500 || error.status === 429 : true;
}

function toResult(
  status: number,
  contentType: string | null,
  content: { text: string; truncated: boolean }
): OpenApiResult {
  if (content.truncated) {
    return { status, data: content.text, truncated: true };
  }
  if (content.text === '') {
    return { status, data: null };
  }
  if (contentType && /json/i.test(contentType)) {
    try {
      const data: unknown = JSON.parse(content.text);
      return { status, data };
    } catch {
      return { status, data: content.text };
    }
  }
  return { status, data: content.text };
}
