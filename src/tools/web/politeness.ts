import { WebRequestRefusedError } from './web-errors.js';

/**
 * Spaces the requests to each host, one at a time: a request starts only once the previous
 * one to the same host has finished, and `intervalMs` after it finished. A service that asks
 * for "one request every 3 s, one connection at a time" (arXiv) gets exactly that, however
 * slowly it answers. Concurrent callers queue in order; one that gives up leaves its turn to
 * the next. A wait longer than `maxWaitMs`, past the previous request, is refused rather than
 * made (the host asked for more patience than a tool call has).
 */
export class HostPacer {
  /**
   * Per host: when the last request queued finishes (its end time), when the last one
   * finished, and how many are queued or running (a host with any is never forgotten).
   */
  private readonly hosts = new Map<
    string,
    { tail: Promise<number>; lastEnd: number; pending: number }
  >();

  /**
   * Waits for this host's turn. Call the function it gives once the request has finished
   * (body read or failed): the next request is paced from that moment.
   */
  async acquire(
    host: string,
    intervalMs: number,
    maxWaitMs: number,
    signal?: AbortSignal
  ): Promise<() => void> {
    this.forgetOld();
    let state = this.hosts.get(host);
    if (!state) {
      const start = Number.NEGATIVE_INFINITY;
      state = { tail: Promise.resolve(start), lastEnd: start, pending: 0 };
      this.hosts.set(host, state);
    }
    const previous = state.tail;
    let finish: (end: number) => void = () => undefined;
    state.tail = new Promise<number>((resolve) => {
      finish = resolve;
    });
    state.pending++;
    const slot = state;
    try {
      const previousEnd = await untilAborted(previous, signal);
      const delay = previousEnd + intervalMs - Date.now();
      if (delay > maxWaitMs) {
        throw new WebRequestRefusedError(
          `${host} asks for ${Math.ceil(intervalMs / 1000)} s between requests: try again in ${Math.ceil(delay / 1000)} s`,
          'pacing'
        );
      }
      if (delay > 0) await sleep(delay, signal);
    } catch (error) {
      // A caller that gives up passes its turn on: the next one is paced from the previous.
      slot.pending--;
      void previous.then(finish);
      throw error;
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const end = Date.now();
      slot.lastEnd = end;
      slot.pending--;
      finish(end);
    };
  }

  /**
   * Hosts not asked for in a while are forgotten, so the map stays small — never one with a
   * request queued or running, whose next request must still wait for it.
   */
  private forgetOld(): void {
    if (this.hosts.size < 1_000) return;
    const now = Date.now();
    for (const [host, state] of this.hosts) {
      if (state.pending === 0 && now - state.lastEnd > 600_000) this.hosts.delete(host);
    }
  }
}

/**
 * The pacer of the process: every `webTools()` shares it, so two sets of tools (an agent's and
 * a study's) never go faster together than one would alone.
 */
export const HOST_PACER = new HostPacer();

/** The promise's outcome, or the signal's reason as soon as it aborts. */
function untilAborted<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
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
