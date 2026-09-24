import { LiveEventsDroppedError, ValidationError } from '../errors/index.js';
import type {
  Event,
  EventFilters,
  EventLog,
  LiveEventFilter,
  LiveEventListener,
  LiveSubscriptionOptions,
} from '../types/events.js';
import type { EventSubscription, IEventStore } from './event-store.js';

/** Events that may wait for a busy listener before new ones are dropped for it. */
export const DEFAULT_MAX_QUEUED_EVENTS = 10_000;

export interface ObservedEventStoreOptions {
  /**
   * Called when a listener throws or rejects, with the event it was given, and when events
   * were dropped for a listener that fell too far behind (a `LiveEventsDroppedError`, with the
   * first event dropped). The listener still gets the next events. Default: one line on
   * standard error (`console.error`).
   */
  onListenerError?: (error: unknown, event: Event) => void;
}

/**
 * Event store decorator that delivers live events. The SDK wraps its store in one, so the events
 * of every run (agents, cognitive runs, MCP calls and resource reads, typed decisions, replays)
 * reach `sdk.subscribe` and the `onEvent` of each run.
 *
 * - An event is delivered once the wrapped store's `append` has succeeded, never before and
 *   never if it failed. What "stored" means is the store's: a committed row for the SQL stores,
 *   an event buffered in memory (readable at once, on disk within 100 ms) for `FileEventStore`.
 * - Within a run, events are delivered in the order `append` was called, even when appends
 *   overlap. Each subscriber gets its own copy, as the store reads it back (JSON).
 * - A listener gets one event at a time: when it returns a promise, its next event waits until
 *   that promise settles. The run never waits: `append` only queues the event. A synchronous
 *   listener is called before `append` returns. At most `maxQueued` events wait for a listener.
 * - A listener that throws or rejects is reported to `onListenerError`, never to the run.
 */
export class ObservedEventStore implements IEventStore {
  readonly queryEvents?: IEventStore['queryEvents'];
  readonly getEventsByAgent?: IEventStore['getEventsByAgent'];
  readonly getEventsByUser?: IEventStore['getEventsByUser'];
  readonly getEventsBySession?: IEventStore['getEventsBySession'];
  readonly countEvents?: IEventStore['countEvents'];
  readonly checkRunId?: IEventStore['checkRunId'];
  readonly groupEventsBy?: IEventStore['groupEventsBy'];
  readonly backup?: IEventStore['backup'];
  /** Restored events are history, not live: they are not delivered. */
  readonly restore?: IEventStore['restore'];

  /** Subscriptions to one run, by run id. */
  private readonly byRun = new Map<string, Set<LiveSubscription>>();
  /** Subscriptions not limited to a run. */
  private readonly anyRun = new Set<LiveSubscription>();
  private subscriptionCount = 0;
  /** Per run, the delivery of the last event appended (settled, never rejected). */
  private readonly lastDelivery = new Map<string, Promise<void>>();
  private readonly reportError: (error: unknown, event: Event) => void;

  constructor(
    private readonly inner: IEventStore,
    options: ObservedEventStoreOptions = {}
  ) {
    this.reportError = options.onListenerError ?? reportOnStandardError;
    this.queryEvents = inner.queryEvents?.bind(inner);
    this.getEventsByAgent = inner.getEventsByAgent?.bind(inner);
    this.getEventsByUser = inner.getEventsByUser?.bind(inner);
    this.getEventsBySession = inner.getEventsBySession?.bind(inner);
    this.countEvents = inner.countEvents?.bind(inner);
    this.checkRunId = inner.checkRunId?.bind(inner);
    this.groupEventsBy = inner.groupEventsBy?.bind(inner);
    this.backup = inner.backup?.bind(inner);
    this.restore = inner.restore?.bind(inner);
  }

  async append(runId: string, event: Event): Promise<void> {
    const appended = Promise.resolve(this.inner.append(runId, event));
    // Observed now, rethrown below: a failure must not wait unhandled for an earlier delivery.
    appended.catch(() => undefined);
    const previous = this.lastDelivery.get(runId);
    // An event of a run waits for the delivery of the one appended before it, so overlapping
    // appends are still delivered in the order they were made.
    const delivered = (previous ? previous.then(() => appended) : appended).then(() =>
      this.publish(runId, event)
    );
    const settled = delivered.then(
      () => undefined,
      () => undefined
    );
    this.lastDelivery.set(runId, settled);
    void settled.then(() => {
      if (this.lastDelivery.get(runId) === settled) this.lastDelivery.delete(runId);
    });
    // Rejects with the store's error: a failed append is never delivered.
    await delivered;
  }

  getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    return this.inner.getEvents(runId, filters);
  }

  getRunIds(filters?: { since?: number; until?: number }): Promise<string[]> {
    return this.inner.getRunIds(filters);
  }

  exportEventLog(runId: string): Promise<EventLog> {
    return this.inner.exportEventLog(runId);
  }

  /**
   * Delivers every matching event appended from now on to `listener`. Throws a
   * `ValidationError` for a listener that is not a function or malformed options.
   */
  subscribe(listener: LiveEventListener, options: LiveSubscriptionOptions = {}): LiveSubscription {
    if (typeof listener !== 'function') {
      throw new ValidationError('listener', 'must be a function');
    }
    const { maxQueued = DEFAULT_MAX_QUEUED_EVENTS, ...filter } = assertOptions(options);
    const { runId } = filter;
    const subscription = new LiveSubscription(
      listener,
      { ...filter, ...(filter.types ? { types: [...filter.types] } : {}) },
      maxQueued,
      this.subscriptionCount++,
      this.reportError,
      () => this.remove(subscription, runId)
    );
    if (runId === undefined) {
      this.anyRun.add(subscription);
    } else {
      const forRun = this.byRun.get(runId) ?? new Set();
      forRun.add(subscription);
      this.byRun.set(runId, forRun);
    }
    return subscription;
  }

  private remove(subscription: LiveSubscription, runId: string | undefined): void {
    if (runId === undefined) {
      this.anyRun.delete(subscription);
      return;
    }
    const forRun = this.byRun.get(runId);
    forRun?.delete(subscription);
    if (forRun?.size === 0) this.byRun.delete(runId);
  }

  private publish(runId: string, event: Event): void {
    const forRun = this.byRun.get(runId);
    if (!forRun && this.anyRun.size === 0) return;
    // Taken before any delivery: a listener may subscribe or unsubscribe while it is called.
    const matching = [...(forRun ?? []), ...this.anyRun].filter((subscription) =>
      subscription.matches(runId, event)
    );
    if (matching.length === 0) return;
    if (forRun && this.anyRun.size > 0) {
      matching.sort((first, second) => first.order - second.order);
    }
    const copy = copier(event);
    for (const subscription of matching) {
      const delivered = copy();
      if (delivered) {
        subscription.forward(delivered);
      } else {
        this.report(new Error('the event cannot be copied, so it was not delivered'), event);
      }
    }
  }

  private report(error: unknown, event: Event): void {
    try {
      this.reportError(error, event);
    } catch {
      reportOnStandardError(error, event);
    }
  }
}

/**
 * One listener's subscription: a bounded queue delivered one event at a time, in order.
 * `unsubscribe` and `close` are safe at any moment, from the listener itself included.
 */
export class LiveSubscription implements EventSubscription {
  private readonly queue: Event[] = [];
  private delivering = false;
  /** Takes new events: false once closed or unsubscribed. */
  private open = true;
  /** Unsubscribed: nothing more will be delivered, whatever the listener is still doing. */
  private dropped = false;
  private idleWaiters: Array<() => void> = [];
  /** Events refused since the queue was last full, and the first of them. */
  private overflow: { count: number; first: Event } | undefined;

  constructor(
    private readonly listener: LiveEventListener,
    private readonly filter: LiveEventFilter,
    private readonly maxQueued: number,
    /** @internal Subscription order, kept when a run's subscribers and others are merged. */
    readonly order: number,
    private readonly reportError: (error: unknown, event: Event) => void,
    private readonly detach: () => void
  ) {}

  /** @internal Whether an event appended to `runId` is one this subscriber asked for. */
  matches(runId: string, event: Event): boolean {
    const { runId: wantedRun, agentId, types } = this.filter;
    return (
      (wantedRun === undefined || wantedRun === runId) &&
      (agentId === undefined || event.metadata?.agentId === agentId) &&
      (types === undefined || types.includes(event.type))
    );
  }

  /**
   * @internal Delivers an event in turn with the others, without checking the filter: used by
   * the SDK for the events of runs started on the subscriber's behalf (an agent run by a tool).
   */
  forward(event: Event): void {
    if (!this.open) return;
    if (this.queue.length >= this.maxQueued) {
      if (this.overflow) this.overflow.count++;
      else this.overflow = { count: 1, first: event };
      return;
    }
    // Room again: the burst of dropped events is over.
    this.reportOverflow();
    // The report may have unsubscribed the listener: it is not called again.
    if (!this.open) return;
    this.queue.push(event);
    if (!this.delivering) this.deliver();
  }

  unsubscribe(): void {
    this.open = false;
    this.dropped = true;
    // What was queued is dropped: the listener is not called again.
    this.queue.length = 0;
    this.overflow = undefined;
    this.detach();
    this.wakeIdleWaiters();
  }

  close(): Promise<void> {
    this.open = false;
    this.detach();
    if (!this.delivering || this.dropped) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private deliver(): void {
    this.delivering = true;
    for (let event = this.queue.shift(); event; event = this.queue.shift()) {
      let pending: PromiseLike<unknown> | undefined;
      try {
        const returned: unknown = this.listener(event);
        pending = isThenable(returned) ? returned : undefined;
      } catch (error) {
        this.report(error, event);
        continue;
      }
      if (pending) {
        // The next event waits for this one: an async listener cannot reorder them.
        Promise.resolve(pending)
          .then(undefined, (error: unknown) => this.report(error, event))
          .then(() => this.deliver());
        return;
      }
    }
    this.delivering = false;
    this.reportOverflow();
    this.wakeIdleWaiters();
  }

  private reportOverflow(): void {
    const overflow = this.overflow;
    if (!overflow) return;
    this.overflow = undefined;
    this.report(new LiveEventsDroppedError(overflow.count, this.maxQueued), overflow.first);
  }

  private report(error: unknown, event: Event): void {
    try {
      this.reportError(error, event);
    } catch {
      // The error handler failed too: the listener's error still gets a line.
      reportOnStandardError(error, event);
    }
  }

  private wakeIdleWaiters(): void {
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const wake of waiters) wake();
  }
}

/** Listeners that forward events to a caller watching a tool call: they are best effort. */
const forwardingListeners = new WeakSet<LiveEventListener>();

/**
 * Marks the listener a tool call gives to the runs its tool starts (`ToolCallContext.onEvent`).
 * A run whose store cannot deliver live events (an agent built by hand on a plain store) runs
 * without it instead of refusing it: the caller did not ask for that run's events explicitly.
 */
export function forwardingListener(listener: (event: Event) => void): LiveEventListener {
  forwardingListeners.add(listener);
  return listener;
}

/**
 * Throws a `ValidationError` when a run cannot give its events to `listener`: a listener that
 * is not a function, or a store that does not deliver live events (a forwarding listener
 * excepted). Checked before the run does anything.
 */
export function checkRunListener(
  store: { subscribe?: unknown },
  listener: LiveEventListener | undefined
): void {
  if (listener === undefined) return;
  if (typeof listener !== 'function') {
    throw new ValidationError('onEvent', 'must be a function');
  }
  if (!store.subscribe && !forwardingListeners.has(listener)) {
    throw new ValidationError(
      'onEvent',
      'this event store does not deliver live events: wrap it in an ObservedEventStore (createSDK does)'
    );
  }
}

/**
 * Subscribes the `onEvent` listener of a run, before the run records anything (see
 * `checkRunListener` for what is refused). Nothing without a listener, or for a forwarding
 * listener on a store that does not deliver live events.
 */
export function watchRun<Subscription extends EventSubscription>(
  store: {
    subscribe?(listener: LiveEventListener, options?: LiveSubscriptionOptions): Subscription;
  },
  runId: string,
  listener: LiveEventListener | undefined
): Subscription | undefined {
  checkRunListener(store, listener);
  if (listener === undefined || !store.subscribe) return undefined;
  return store.subscribe(listener, { runId });
}

/**
 * Ends a run's watch: waits until the listener has settled on every event it took, unless the
 * run was stopped or cancelled, or its caller gives up (any of `signals` aborts), before or
 * during the wait. Then the listener is unsubscribed: what it has not received yet is dropped.
 */
export async function finishWatch(
  watch: EventSubscription | undefined,
  signals: Array<AbortSignal | undefined>
): Promise<void> {
  if (!watch) return;
  const given = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  const stop = () => watch.unsubscribe();
  if (given.some((signal) => signal.aborted)) {
    stop();
    return;
  }
  for (const signal of given) signal.addEventListener('abort', stop, { once: true });
  try {
    await watch.close();
  } finally {
    for (const signal of given) signal.removeEventListener('abort', stop);
  }
}

function assertOptions(options: LiveSubscriptionOptions): LiveSubscriptionOptions {
  if (typeof options !== 'object' || options === null) {
    throw new ValidationError('filter', 'must be an object');
  }
  for (const field of ['runId', 'agentId'] as const) {
    if (options[field] !== undefined && typeof options[field] !== 'string') {
      throw new ValidationError(`filter.${field}`, 'must be a string');
    }
  }
  if (
    options.types !== undefined &&
    !(Array.isArray(options.types) && options.types.every((type) => typeof type === 'string'))
  ) {
    throw new ValidationError('filter.types', 'must be a list of event types');
  }
  const { maxQueued } = options;
  if (
    maxQueued !== undefined &&
    !(maxQueued === Number.POSITIVE_INFINITY || (Number.isInteger(maxQueued) && maxQueued >= 1))
  ) {
    throw new ValidationError('maxQueued', 'must be a whole number of at least 1, or Infinity');
  }
  return options;
}

/**
 * Makes one copy of an event per call, as the store reads it back: serialized to JSON once,
 * parsed for each subscriber. An event JSON cannot hold (a bigint, a cycle) is cloned instead;
 * `undefined` when it cannot be copied at all. The event itself is never shared.
 */
function copier(event: Event): () => Event | undefined {
  let json: string | undefined;
  try {
    json = JSON.stringify(event);
  } catch {
    json = undefined;
  }
  if (json !== undefined) {
    const text = json;
    return () => JSON.parse(text) as Event;
  }
  return () => {
    try {
      return structuredClone(event);
    } catch {
      return undefined;
    }
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof Reflect.get(value, 'then') === 'function'
  );
}

function reportOnStandardError(error: unknown, event: Event): void {
  console.error(
    `Event listener failed on ${event.type} of run ${event.runId}:`,
    error instanceof Error ? error.message : String(error)
  );
}
