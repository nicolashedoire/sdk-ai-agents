/**
 * Started by `file-event-store-exit.test.ts`: a store whose folder cannot be created (its
 * parent is a file) receives one event, then the script ends. Argument: the file to use.
 */
import { join } from 'node:path';
import { FileEventStore } from '../../stores/file-event-store.js';

const [parentFile] = process.argv.slice(2);
if (!parentFile) throw new Error('usage: unwritable-event-store <existing file>');

const store = new FileEventStore(join(parentFile, 'events'));
await store.append('run_1', {
  id: 'evt_1',
  runId: 'run_1',
  type: 'run.started',
  timestamp: 1,
  data: {},
});
