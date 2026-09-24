import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/index.js';
import { AssertionManager } from '../managers/assertion-manager.js';
import { GoldenTraceManager } from '../managers/golden-trace-manager.js';
import { ImpactAnalysisManager } from '../managers/impact-analysis-manager.js';
import { RegressionTestManager } from '../managers/regression-test-manager.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';

// Ids given by callers become file names. An id that could name a file outside the folder
// (or a hidden one) is refused, so a crafted run or trace id cannot read, write or delete
// files next to the SDK's folders. A victim file sits right beside each folder.
const ESCAPES = ['../victim', '../../victim', '/tmp/victim', 'nested/victim', '.hidden', '..', ''];

describe('ids used as file names', () => {
  let root: string;
  let victim: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'file-ids-'));
    victim = join(root, 'victim.json');
    writeFileSync(victim, '[{"secret":true}]');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function event(runId: string): Event {
    return { id: 'evt_1', runId, type: 'run.started', timestamp: 1, data: {} };
  }

  describe('FileEventStore', () => {
    let store: FileEventStore;

    beforeEach(() => {
      store = new FileEventStore(join(root, 'events'));
    });

    afterEach(async () => {
      await store.destroy();
    });

    it('refuses to read a run whose id leaves the folder', async () => {
      for (const runId of ESCAPES) {
        await expect(store.getEvents(runId)).rejects.toThrow(ValidationError);
      }
    });

    it('refuses to record events under such an id, and writes nothing', async () => {
      for (const runId of ESCAPES) {
        await expect(store.append(runId, event(runId))).rejects.toThrow(ValidationError);
      }
      await store.destroy(); // writes what is pending

      expect(existsSync(join(root, 'escaped.json'))).toBe(false);
      expect(readFileSync(victim, 'utf8')).toBe('[{"secret":true}]');
    });

    it('keeps accepting the ids the SDK and its users write', async () => {
      for (const runId of ['run_3f2a-9c', 'test-run.1', 'Original_Run-2']) {
        await store.append(runId, event(runId));
      }
      await store.destroy(); // writes what is pending

      expect(await store.getEvents('test-run.1')).toHaveLength(1);
    });
  });

  describe('file-backed managers', () => {
    it('never read or delete a file outside their folder', async () => {
      const golden = new GoldenTraceManager(join(root, 'golden'));
      const suites = new RegressionTestManager(join(root, 'suites'));
      const analyses = new ImpactAnalysisManager(join(root, 'impact'));
      const assertions = new AssertionManager(join(root, 'assertions'));
      const reads = [
        (id: string) => golden.getGoldenTrace(id),
        (id: string) => suites.getTestSuite(id),
        (id: string) => analyses.getAnalysis(id),
        (id: string) => assertions.getAssertion(id),
      ];
      const deletes = [
        (id: string) => golden.deleteGoldenTrace(id),
        (id: string) => suites.deleteTestSuite(id),
        (id: string) => analyses.deleteAnalysis(id),
        (id: string) => assertions.deleteAssertion(id),
      ];

      for (const read of reads) {
        expect(await read('../victim')).toBeNull();
      }
      for (const remove of deletes) {
        expect(await remove('../victim')).toBe(false);
      }

      // Before the check, deleteGoldenTrace('../victim') deleted this very file.
      expect(readFileSync(victim, 'utf8')).toBe('[{"secret":true}]');
    });
  });
});
