import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/index.js';
import type { IEventStore } from '../stores/event-store.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { ObservedEventStore } from '../stores/observed-event-store.js';
import type { Event, EventLog, EventType, LiveEventListener } from '../types/events.js';

let sequence = 0;
function event(runId: string, type: EventType = 'action.executed', agentId = 'agent-1'): Event {
  sequence++;
  return {
    id: `evt_${sequence}`,
    runId,
    type,
    timestamp: sequence,
    data: { step: sequence },
    metadata: { agentId },
  };
}

/** A promise the test settles by hand. */
function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
} {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Lets pending promise callbacks and timers run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** Keeps events in memory; each append waits until the test opens its gate, or fails it. */
class GatedEventStore implements IEventStore {
  readonly stored: Event[] = [];
  private readonly gates: Array<{ open: () => void; fail: (error: Error) => void }> = [];

  async append(_runId: string, appended: Event): Promise<void> {
    await new Promise<void>((open, fail) => this.gates.push({ open, fail }));
    this.stored.push(appended);
  }

  open(index: number): void {
    this.gates[index]?.open();
  }

  fail(index: number, error: Error): void {
    this.gates[index]?.fail(error);
  }

  async getEvents(runId: string): Promise<Event[]> {
    return this.stored.filter((stored) => stored.runId === runId);
  }

  async getRunIds(): Promise<string[]> {
    return [...new Set(this.stored.map((stored) => stored.runId))];
  }

  async exportEventLog(): Promise<EventLog> {
    throw new Error('not used');
  }
}

describe('ObservedEventStore', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  function fileStore(): FileEventStore {
    const directory = mkdtempSync(join(tmpdir(), 'observed-store-'));
    const store = new FileEventStore(join(directory, 'events'));
    cleanups.push(async () => {
      await store.destroy();
      rmSync(directory, { recursive: true, force: true });
    });
    return store;
  }

  it('calls a synchronous listener before append returns, and never for a refused append', async () => {
    const observed = new ObservedEventStore(fileStore());
    const received: Event[] = [];
    observed.subscribe((live) => {
      received.push(live);
    });

    await observed.append('run_1', event('run_1', 'run.started'));
    expect(received.map((live) => live.type)).toEqual(['run.started']);

    // The file store refuses a run id that cannot name a file inside its folder.
    await expect(observed.append('../outside', event('../outside'))).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(received).toHaveLength(1);
  });

  it('delivers the events of a run in the order they were appended, even when appends overlap', async () => {
    const gated = new GatedEventStore();
    const observed = new ObservedEventStore(gated);
    const received: string[] = [];
    observed.subscribe((live) => {
      received.push(live.id);
    });
    const first = event('run_1');
    const second = event('run_1');
    const other = event('run_2');

    const appends = [
      observed.append('run_1', first),
      observed.append('run_1', second),
      observed.append('run_2', other),
    ];
    await settle();
    // The store accepts the second event first, and the other run's event before both.
    gated.open(2);
    gated.open(1);
    await settle();
    expect(gated.stored.map((stored) => stored.id)).toEqual([other.id, second.id]);
    expect(received).toEqual([other.id]);

    gated.open(0);
    await Promise.all(appends);
    expect(received).toEqual([other.id, first.id, second.id]);
  });

  it('never delivers a failed append, nor lets it hold up the next events of its run', async () => {
    const gated = new GatedEventStore();
    const observed = new ObservedEventStore(gated);
    const received: string[] = [];
    observed.subscribe((live) => {
      received.push(live.id);
    });
    const [first, refused, third] = [event('run_1'), event('run_1'), event('run_1')];

    const appends = [observed.append('run_1', first), observed.append('run_1', refused)];
    // The second append fails while the first is still in progress.
    gated.fail(1, new Error('disk full'));
    await settle();
    gated.open(0);
    await expect(appends[1]).rejects.toThrow('disk full');
    await appends[0];
    const next = observed.append('run_1', third);
    gated.open(2);
    await next;

    expect(received).toEqual([first.id, third.id]);
  });

  it('gives an async listener one event at a time, while appends go on without waiting for it', async () => {
    const observed = new ObservedEventStore(fileStore());
    const calls: string[] = [];
    const pending = [deferred(), deferred()];
    let started = 0;
    const subscription = observed.subscribe(async (live) => {
      calls.push(`start ${live.id}`);
      await pending[started++]?.promise;
      calls.push(`end ${live.id}`);
    });
    const [first, second, third] = [event('run_1'), event('run_1'), event('run_1')];

    // Every append returns although the listener has not finished with the first event.
    await observed.append('run_1', first);
    await observed.append('run_1', second);
    await observed.append('run_1', third);
    expect(calls).toEqual([`start ${first.id}`]);

    let closed = false;
    const closing = subscription.close().then(() => {
      closed = true;
    });
    pending[0]?.resolve();
    await settle();
    expect(calls).toEqual([`start ${first.id}`, `end ${first.id}`, `start ${second.id}`]);
    expect(closed).toBe(false);

    pending[1]?.resolve();
    await closing;
    expect(calls).toEqual([
      `start ${first.id}`,
      `end ${first.id}`,
      `start ${second.id}`,
      `end ${second.id}`,
      `start ${third.id}`,
      `end ${third.id}`,
    ]);

    // Closed: events appended afterwards are not delivered.
    await observed.append('run_1', event('run_1'));
    await settle();
    expect(calls).toHaveLength(6);
  });

  it('reports a listener that throws or rejects, and keeps delivering to it', async () => {
    const failures: Array<{ error: string; eventId: string }> = [];
    const observed = new ObservedEventStore(fileStore(), {
      onListenerError: (error, failed) => {
        failures.push({
          error: error instanceof Error ? error.message : String(error),
          eventId: failed.id,
        });
      },
    });
    const received: string[] = [];
    let calls = 0;
    const subscription = observed.subscribe((live) => {
      calls++;
      if (calls === 1) throw new Error('listener bug');
      received.push(live.id);
      return calls === 2 ? Promise.reject(new Error('listener rejected')) : undefined;
    });
    const events = [event('run_1'), event('run_1'), event('run_1')];

    for (const appended of events) await observed.append('run_1', appended);
    await subscription.close();

    expect(failures).toEqual([
      { error: 'listener bug', eventId: events[0]?.id },
      { error: 'listener rejected', eventId: events[1]?.id },
    ]);
    expect(received).toEqual([events[1]?.id, events[2]?.id]);
  });

  it('keeps delivering when the error handler itself throws', async () => {
    const observed = new ObservedEventStore(fileStore(), {
      onListenerError: () => {
        throw new Error('handler bug');
      },
    });
    const received: string[] = [];
    observed.subscribe((live) => {
      received.push(live.id);
      throw new Error('listener bug');
    });
    const events = [event('run_1'), event('run_1')];

    for (const appended of events) await observed.append('run_1', appended);

    expect(received).toEqual(events.map((appended) => appended.id));
  });

  it('stops at once when a listener unsubscribes, from inside itself included', async () => {
    const observed = new ObservedEventStore(fileStore());
    const received: string[] = [];
    const first = deferred();
    let calls = 0;
    const subscription = observed.subscribe((live) => {
      calls++;
      received.push(live.id);
      if (calls === 1) return first.promise;
      // Second event: unsubscribes while a third one waits in its queue.
      subscription.unsubscribe();
      return undefined;
    });
    const events = [event('run_1'), event('run_1'), event('run_1'), event('run_1')];

    for (const appended of events.slice(0, 3)) await observed.append('run_1', appended);
    first.resolve();
    await settle();
    await observed.append('run_1', events[3] as Event);
    await settle();

    expect(received).toEqual([events[0]?.id, events[1]?.id]);
    // Unsubscribing twice, or closing afterwards, is harmless.
    subscription.unsubscribe();
    await subscription.close();
  });

  it('gives a listener subscribed during a delivery only the events appended afterwards', async () => {
    const observed = new ObservedEventStore(fileStore());
    const late: string[] = [];
    let subscribed = false;
    observed.subscribe(() => {
      if (subscribed) return;
      subscribed = true;
      observed.subscribe((live) => {
        late.push(live.id);
      });
    });
    const [during, after] = [event('run_1'), event('run_1')];

    await observed.append('run_1', during);
    await observed.append('run_1', after);

    expect(late).toEqual([after.id]);
  });

  it('lets a listener unsubscribe another one while an event is being delivered', async () => {
    const observed = new ObservedEventStore(fileStore());
    const second: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    observed.subscribe(() => {
      unsubscribeSecond();
    });
    const subscription = observed.subscribe((live) => {
      second.push(live.id);
    });
    unsubscribeSecond = () => subscription.unsubscribe();

    await observed.append('run_1', event('run_1'));
    await observed.append('run_1', event('run_1'));

    expect(second).toEqual([]);
  });

  it('releases a pending close when the listener is unsubscribed, dropping what was queued', async () => {
    const observed = new ObservedEventStore(fileStore());
    const received: string[] = [];
    const never = new Promise<void>(() => undefined);
    const subscription = observed.subscribe((live) => {
      received.push(live.id);
      return never;
    });
    const events = [event('run_1'), event('run_1')];
    for (const appended of events) await observed.append('run_1', appended);

    let closed = false;
    const closing = subscription.close().then(() => {
      closed = true;
    });
    await settle();
    expect(closed).toBe(false);

    subscription.unsubscribe();
    await closing;
    // Closing again does not wait for the listener, which may never settle.
    await subscription.close();
    expect(received).toEqual([events[0]?.id]);
  });

  it('delivers events forwarded from another run in turn with its own, until it is closed', async () => {
    const observed = new ObservedEventStore(fileStore());
    const received: string[] = [];
    const subscription = observed.subscribe((live) => void received.push(live.id), {
      runId: 'run_1',
    });
    const [own, nested, later] = [event('run_1'), event('run_2'), event('run_2')];

    await observed.append('run_1', own);
    // The run of an agent the watched run started: forwarded, not matched by the filter.
    subscription.forward(nested);
    await observed.append('run_2', event('run_2'));
    await subscription.close();
    subscription.forward(later);

    expect(received).toEqual([own.id, nested.id]);
  });

  it('delivers only the events a filter asks for', async () => {
    const observed = new ObservedEventStore(fileStore());
    const byRun: string[] = [];
    const byAgent: string[] = [];
    const byType: string[] = [];
    const all: string[] = [];
    observed.subscribe((live) => void byRun.push(live.id), { runId: 'run_2' });
    observed.subscribe((live) => void byAgent.push(live.id), { agentId: 'agent-2' });
    observed.subscribe((live) => void byType.push(live.id), {
      types: ['run.completed', 'run.failed'],
    });
    observed.subscribe((live) => void all.push(live.id), {});
    const events = [
      event('run_1', 'run.started', 'agent-1'),
      event('run_2', 'run.started', 'agent-2'),
      event('run_2', 'run.completed', 'agent-2'),
      event('run_1', 'run.failed', 'agent-1'),
    ];

    for (const appended of events) await observed.append(appended.runId, appended);

    const ids = events.map((appended) => appended.id);
    expect(byRun).toEqual([ids[1], ids[2]]);
    expect(byAgent).toEqual([ids[1], ids[2]]);
    expect(byType).toEqual([ids[2], ids[3]]);
    expect(all).toEqual(ids);
  });

  it('gives each listener its own copy, so no listener can change the log or what others see', async () => {
    const store = fileStore();
    const observed = new ObservedEventStore(store);
    const seen: Event[] = [];
    const tamper: LiveEventListener = (live) => {
      seen.push(live);
      live.data.step = 'tampered';
    };
    observed.subscribe(tamper);
    observed.subscribe((live) => {
      seen.push(live);
    });
    const appended = event('run_1');
    const step = appended.data.step;

    await observed.append('run_1', appended);

    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[1]?.data.step).toBe(step);
    expect(appended.data.step).toBe(step);
    expect((await observed.getEvents('run_1'))[0]?.data.step).toBe(step);
  });

  it('refuses a listener that is not a function and a malformed filter', () => {
    const observed = new ObservedEventStore(fileStore());

    expect(() => observed.subscribe('listener' as never)).toThrow(ValidationError);
    expect(() => observed.subscribe(() => undefined, { types: 'run.completed' as never })).toThrow(
      'filter.types'
    );
    expect(() => observed.subscribe(() => undefined, { runId: 42 as never })).toThrow(
      'filter.runId'
    );
  });
});
