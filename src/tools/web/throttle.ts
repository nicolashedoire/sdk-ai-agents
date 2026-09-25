import { parseRetryAfter } from '../../utils/http.js';
import type { WebResponse } from './guarded-http.js';
import { sleep } from './politeness.js';
import { SearchThrottledError, WebHttpError } from './web-errors.js';

/** How long to wait before trying a throttled service again, when it does not say. */
export const THROTTLE_WAIT_MS = 10_000;
/** Longest wait for a second try, whatever the service asks. */
export const MAX_THROTTLE_WAIT_MS = 30_000;
/** Time a second try needs, past its wait, for it to be worth starting before the deadline. */
const ATTEMPT_ROOM_MS = 3_000;

/** The wait an answer asks for (`Retry-After`, in seconds or as a date), if any. */
export function retryAfterOf(response: WebResponse): number | undefined {
  return parseRetryAfter(response.headers['retry-after'] ?? null);
}

/** A service that refused to answer now: a throttle page, HTTP 429. */
export function isThrottle(error: unknown): error is Error {
  return (
    error instanceof SearchThrottledError || (error instanceof WebHttpError && error.status === 429)
  );
}

/**
 * Runs `attempt`; when a service throttles it, waits (as long as it asked with `Retry-After`,
 * else `waitMs`) and runs it once more — only if that wait is at most 30 s and the call's
 * deadline leaves room for it and the second try. A service that asked for longer is never
 * tried again early: its throttle is thrown at once, with the wait it asked for
 * (`retryAfterMs`), for a caller that can come back later (a study). When the second try is
 * throttled too, that throttle is thrown.
 */
export async function retryOnceIfThrottled<T>(
  attempt: () => Promise<T>,
  options: { waitMs: number; deadline?: number; signal?: AbortSignal }
): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!isThrottle(error) || options.signal?.aborted) throw error;
    const asked = error instanceof SearchThrottledError ? error.retryAfterMs : undefined;
    // Sooner than asked, the second try would be throttled again, and could lengthen the block.
    if (asked !== undefined && asked > MAX_THROTTLE_WAIT_MS) throw error;
    const wait = asked ?? options.waitMs;
    const deadline = options.deadline ?? Number.POSITIVE_INFINITY;
    if (Date.now() + wait + ATTEMPT_ROOM_MS > deadline) throw error;
    await sleep(wait, options.signal);
    return attempt();
  }
}
