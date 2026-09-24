import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';

function event(runId: string, index: number): Event {
  return {
    id: `evt_${index}`,
    runId,
    type: 'cognition.thought',
    timestamp: index,
    data: { step: index },
  };
}

describe('FileEventStore concurrent flushes', () => {
  let directory: string;
  let store: FileEventStore;

  afterEach(async () => {
    await store.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  it('keeps every event exactly once while flushes overlap', async () => {
    directory = mkdtempSync(join(tmpdir(), 'file-store-'));
    store = new FileEventStore(join(directory, 'events'));

    // Start a flush, let its file I/O begin, then append while it is in flight.
    const listings: Array<Promise<unknown>> = [];
    for (let index = 1; index <= 25; index++) {
      listings.push(store.getRunIds());
      await new Promise((resolve) => setImmediate(resolve));
      await store.append('run_a', event('run_a', index));
    }
    await Promise.all(listings);

    const stored = await store.getEvents('run_a');
    expect(stored.map((stored) => stored.id)).toEqual(
      Array.from({ length: 25 }, (_, index) => `evt_${index + 1}`)
    );
    expect(readdirSync(join(directory, 'events')).filter((file) => file.endsWith('.tmp'))).toEqual(
      []
    );
  });

  it('writes the first run only once its folder exists, however deep', async () => {
    directory = mkdtempSync(join(tmpdir(), 'file-store-'));
    // Created level by level in the background, while the first events are written.
    const deep = join(directory, ...Array.from({ length: 40 }, (_, index) => `level-${index}`));
    store = new FileEventStore(deep);

    for (let index = 1; index <= 10; index++) {
      await store.append('run_a', event('run_a', index));
    }

    expect((await store.getEvents('run_a')).map((stored) => stored.id)).toHaveLength(10);
  });

  it('finishes creating its directory before destroy() resolves', async () => {
    directory = mkdtempSync(join(tmpdir(), 'file-store-'));
    const eventsDir = join(directory, 'nested', 'events');
    store = new FileEventStore(eventsDir);

    // Nothing is pending, so destroy() has no write to wait for: it must still wait for the
    // directory creation started by the constructor, or a caller deleting the folder next
    // races with it.
    await store.destroy();

    expect(existsSync(eventsDir)).toBe(true);
  });
});
