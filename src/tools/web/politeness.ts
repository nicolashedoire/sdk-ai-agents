import { WebRequestRefusedError } from './web-errors.js';

/**
 * Spaces the requests to each host: a request starts at least `intervalMs` after the previous
 * one to the same host started. Concurrent calls queue in order. A wait longer than
 * `maxWaitMs` is refused rather than made (the host asked for more patience than a tool call
 * has).
 */
export class HostPacer {
  /** When the last request to each host was scheduled to start. */
  private readonly last = new Map<string, number>();

  constructor(private readonly maxWaitMs: number) {}

  async wait(host: string, intervalMs: number, signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const previous = this.last.get(host);
    const start = previous === undefined ? now : Math.max(now, previous + intervalMs);
    const delay = start - now;
    if (delay > this.maxWaitMs) {
      throw new WebRequestRefusedError(
        `${host} asks for ${Math.ceil(intervalMs / 1000)} s between requests: try again in ${Math.ceil(delay / 1000)} s`,
        'pacing'
      );
    }
    // The slot is taken before waiting, so the next caller queues behind it.
    this.last.set(host, start);
    this.forgetOld(now);
    if (delay > 0) await sleep(delay, signal);
  }

  /** Hosts not asked for in a while are forgotten, so the map stays small. */
  private forgetOld(now: number): void {
    if (this.last.size < 1_000) return;
    for (const [host, time] of this.last) {
      if (now - time > 600_000) this.last.delete(host);
    }
  }
}

/** Waits `ms`, or rejects as soon as `signal` aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortReason(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new Error('The request was cancelled');
}
