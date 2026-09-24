import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DecisionService } from '../decisions/decision-service.js';
import { ValidationError } from '../errors/index.js';
import { AssertionManager } from '../managers/assertion-manager.js';
import { GoldenTraceManager } from '../managers/golden-trace-manager.js';
import { ImpactAnalysisManager } from '../managers/impact-analysis-manager.js';
import { RegressionTestManager } from '../managers/regression-test-manager.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';
import { InMemoryDecisionClient } from './support/in-memory-decision-client.js';
import { createTestSDK } from './support/test-sdk.js';

// Ids given by callers become file names. An id that could name a file outside the folder
// (or a hidden one) is refused, so a crafted run or trace id cannot read, write or delete
// files next to the SDK's folders. A victim file sits right beside each folder.
const ESCAPES = [
  '../victim',
  '../../victim',
  '..\\victim',
  'nested/victim',
  '.hidden',
  '..',
  '',
  'run\u0000.json',
  'run\n',
  'relevé',
  'x'.repeat(201),
];
const UUID = '3f2a9c1e-7b4d-4e8a-9f0c-1d2e3f4a5b6c';

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

      expect(readFileSync(victim, 'utf8')).toBe('[{"secret":true}]');
    });

    it('keeps accepting the ids the SDK and its users write', async () => {
      const ids = ['test-run.1', 'Original_Run-2', 'x'.repeat(200)];
      for (const prefix of ['run_', 'tool_', 'resource_', 'decision_']) ids.push(prefix + UUID);
      for (const runId of ids) {
        await store.append(runId, event(runId));
      }
      await store.destroy(); // writes what is pending

      expect(await store.getEvents('test-run.1')).toHaveLength(1);
      expect(await store.getEvents(`run_${UUID}`)).toHaveLength(1);
    });

    it('lists the runs even when a file in the folder is not named after a run id', async () => {
      await store.append('run_ok', event('run_ok'));
      await store.destroy();
      // A Finder copy, or a run recorded under an id with a space by an older version.
      writeFileSync(join(root, 'events', 'run_ok copy.json'), '[]');
      writeFileSync(join(root, 'events', 'legacy run.json'), JSON.stringify([event('legacy run')]));

      expect(await new FileEventStore(join(root, 'events')).getRunIds()).toEqual(['run_ok']);
    });
  });

  it('refuses a decision run id before the paid call, not after it', async () => {
    const client = new InMemoryDecisionClient(() => ({ type: 'noul', noul: 0.9 }));
    const store = new FileEventStore(join(root, 'events'));
    const decisions = new DecisionService(client, store);

    await expect(
      decisions.ask({
        runId: '../victim',
        context: {},
        questions: { ok: { type: 'noul', instructions: 'Is it ok?' } },
      })
    ).rejects.toThrow(ValidationError);
    expect(client.requests).toHaveLength(0);
    await store.destroy();
  });

  it('skips a refused run id when exporting a dataset, instead of stopping', async () => {
    const env = createTestSDK();
    await expect(env.sdk.exportControllerDataset(['../victim'])).resolves.toBe('');
    await env.dispose();
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

      // The one write a caller controls: an impact analysis carries its own id.
      await expect(
        analyses.saveAnalysis({ id: '../victim' } as Parameters<typeof analyses.saveAnalysis>[0])
      ).rejects.toThrow(ValidationError);

      // Before the check, deleteGoldenTrace('../victim') deleted this very file.
      expect(readFileSync(victim, 'utf8')).toBe('[{"secret":true}]');
    });
  });
});
