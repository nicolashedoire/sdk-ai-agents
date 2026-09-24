/**
 * Started by `file-event-store-exit.test.ts`: appends one event, then a second one from a
 * timer scheduled when the process is about to exit. Argument: the events folder.
 */
import { FileEventStore } from '../../stores/file-event-store.js';

const [directory] = process.argv.slice(2);
if (!directory) throw new Error('usage: late-event-store <events folder>');

const store = new FileEventStore(directory);
const event = (id: string, timestamp: number) => ({
  id,
  runId: 'run_1',
  type: 'run.started' as const,
  timestamp,
  data: {},
});
await store.append('run_1', event('evt_1', 1));
process.once('beforeExit', () => {
  setTimeout(() => {
    void store.append('run_1', event('evt_2', 2));
  }, 10);
});
