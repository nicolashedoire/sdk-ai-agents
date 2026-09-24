import { ValidationError } from '../errors/index.js';
import type {
  Event,
  EventFilters,
  EventLog,
  LiveEventFilter,
  LiveEventListener,
} from '../types/events.js';
import type { EventSubscription, IEventStore } from './event-store.js';

export interface ObservedEventStoreOptions {
  /**
   * Called when a listener throws or rejects, with the event it was given; the listener still
   * gets the next events. Default: one line on standard error (`console.error`).
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
 *   listener is called before `append` returns.
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

  private readonly subscriptions = new Set<LiveSubscription>();
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
   * `ValidationError` for a listener that is not a function or a malformed filter.
   */
  subscribe(listener: LiveEventListener, filter: LiveEventFilter = {}): LiveSubscription {
    if (typeof listener !== 'function') {
      throw new ValidationError('listener', 'must be a function');
    }
    assertFilter(filter);
    const subscription = new LiveSubscription(
      listener,
      { ...filter, ...(filter.types ? { types: [...filter.types] } : {}) },
      this.reportError,
      () => this.subscriptions.delete(subscription)
    );
    this.subscriptions.add(subscription);
    return subscription;
  }

  private publish(runId: string, event: Event): void {
    if (this.subscriptions.size === 0) return;
    // A copy of the set: a listener may subscribe or unsubscribe while it is called.
    for (const subscription of [...this.subscriptions]) {
      if (subscription.matches(runId, event)) subscription.forward(asRecorded(event));
    }
  }
}

/**
 * One listener's subscription: a queue delivered one event at a time, in order.
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

  constructor(
    private readonly listener: LiveEventListener,
    private readonly filter: LiveEventFilter,
    private readonly reportError: (error: unknown, event: Event) => void,
    private readonly detach: () => void
  ) {}

  /** Whether an event appended to `runId` is one this subscriber asked for. */
  matches(runId: string, event: Event): boolean {
    const { runId: wantedRun, agentId, types } = this.filter;
    return (
      (wantedRun === undefined || wantedRun === runId) &&
      (agentId === undefined || event.metadata?.agentId === agentId) &&
      (types === undefined || types.includes(event.type))
    );
  }

  /**
   * Delivers an event in turn with the others, without checking the filter: used for the
   * events of runs started on the subscriber's behalf (an agent run by a tool it called).
   */
  forward(event: Event): void {
    if (!this.open) return;
    this.queue.push(event);
    if (!this.delivering) this.deliver();
  }

  unsubscribe(): void {
    this.open = false;
    this.dropped = true;
    // What was queued is dropped: the listener is not called again.
    this.queue.length = 0;
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
    this.wakeIdleWaiters();
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

/**
 * Subscribes the `onEvent` listener of a run, before the run records anything. Nothing without
 * a listener; a `ValidationError` for a listener that is not a function, or a store that does
 * not deliver live events.
 */
export function watchRun<Subscription extends EventSubscription>(
  store: { subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): Subscription },
  runId: string,
  listener: LiveEventListener | undefined
): Subscription | undefined {
  if (listener === undefined) return undefined;
  if (typeof listener !== 'function') {
    throw new ValidationError('onEvent', 'must be a function');
  }
  if (!store.subscribe) {
    throw new ValidationError(
      'onEvent',
      'this event store does not deliver live events: wrap it in an ObservedEventStore (createSDK does)'
    );
  }
  return store.subscribe(listener, { runId });
}

function assertFilter(filter: LiveEventFilter): void {
  if (typeof filter !== 'object' || filter === null) {
    throw new ValidationError('filter', 'must be an object');
  }
  for (const field of ['runId', 'agentId'] as const) {
    if (filter[field] !== undefined && typeof filter[field] !== 'string') {
      throw new ValidationError(`filter.${field}`, 'must be a string');
    }
  }
  if (
    filter.types !== undefined &&
    !(Array.isArray(filter.types) && filter.types.every((type) => typeof type === 'string'))
  ) {
    throw new ValidationError('filter.types', 'must be a list of event types');
  }
}

/** The event as the store reads it back; the event itself if it cannot be written as JSON. */
function asRecorded(event: Event): Event {
  try {
    return JSON.parse(JSON.stringify(event)) as Event;
  } catch {
    return event;
  }
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
