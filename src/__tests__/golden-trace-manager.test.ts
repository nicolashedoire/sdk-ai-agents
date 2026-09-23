import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoldenTraceManager } from '../managers/golden-trace-manager.js';
import type { Trace } from '../types/sdk.js';

describe('GoldenTraceManager', () => {
  // A private directory per test: test files run in parallel and must not share folders.
  let testDir: string;
  let manager: GoldenTraceManager;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'golden-traces-'));
    manager = new GoldenTraceManager(testDir);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  const createSampleTrace = (runId: string, agentId: string): Trace => ({
    runId,
    agentId,
    status: 'completed',
    events: [
      {
        id: 'evt-1',
        runId,
        type: 'run.started',
        timestamp: Date.now(),
        data: { message: 'Started' },
      },
      {
        id: 'evt-2',
        runId,
        type: 'run.completed',
        timestamp: Date.now() + 1000,
        data: { message: 'Completed' },
      },
    ],
    timeline: [],
    summary: {
      totalEvents: 2,
      duration: 1000,
      intentionsGenerated: 0,
      actionsExecuted: 0,
      policiesChecked: 0,
      toolsCalled: 0,
    },
  });

  it('should create a golden trace', async () => {
    const runId = 'test-run-1';
    const trace = createSampleTrace(runId, 'test-agent');
    const config = {
      name: 'Test Golden Trace',
      description: 'A test golden trace',
    };

    const goldenTrace = await manager.createGoldenTrace(runId, trace, config);

    expect(goldenTrace.id).toBeDefined();
    expect(goldenTrace.name).toBe('Test Golden Trace');
    expect(goldenTrace.description).toBe('A test golden trace');
    expect(goldenTrace.runId).toBe(runId);
    expect(goldenTrace.agentId).toBe('test-agent');
    expect(goldenTrace.trace).toEqual(trace);
  });

  it('should retrieve a golden trace', async () => {
    const runId = 'test-run-2';
    const trace = createSampleTrace(runId, 'test-agent');
    const config = { name: 'Test Trace 2' };

    const created = await manager.createGoldenTrace(runId, trace, config);
    const retrieved = await manager.getGoldenTrace(created.id);

    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe(created.id);
    expect(retrieved!.name).toBe('Test Trace 2');
  });

  it('should return null for non-existent golden trace', async () => {
    const retrieved = await manager.getGoldenTrace('non-existent-id');
    expect(retrieved).toBeNull();
  });

  it('should list all golden traces', async () => {
    const trace1 = createSampleTrace('run-1', 'agent-1');
    const trace2 = createSampleTrace('run-2', 'agent-1');
    const trace3 = createSampleTrace('run-3', 'agent-2');

    await manager.createGoldenTrace('run-1', trace1, { name: 'Trace 1' });
    await manager.createGoldenTrace('run-2', trace2, { name: 'Trace 2' });
    await manager.createGoldenTrace('run-3', trace3, { name: 'Trace 3' });

    const allTraces = await manager.getGoldenTraces();
    expect(allTraces.length).toBe(3);

    const agent1Traces = await manager.getGoldenTraces('agent-1');
    expect(agent1Traces.length).toBe(2);
    expect(agent1Traces.every((t) => t.agentId === 'agent-1')).toBe(true);
  });

  it('should delete a golden trace', async () => {
    const runId = 'test-run-3';
    const trace = createSampleTrace(runId, 'test-agent');
    const config = { name: 'Test Trace 3' };

    const created = await manager.createGoldenTrace(runId, trace, config);
    const deleted = await manager.deleteGoldenTrace(created.id);

    expect(deleted).toBe(true);

    const retrieved = await manager.getGoldenTrace(created.id);
    expect(retrieved).toBeNull();
  });

  it('should return false when deleting non-existent golden trace', async () => {
    const deleted = await manager.deleteGoldenTrace('non-existent-id');
    expect(deleted).toBe(false);
  });

  it('should export golden trace as JSON', async () => {
    const runId = 'test-run-4';
    const trace = createSampleTrace(runId, 'test-agent');
    const config = { name: 'Test Trace 4' };

    const created = await manager.createGoldenTrace(runId, trace, config);
    const exported = await manager.exportGoldenTrace(created.id, 'json');

    expect(exported).toContain('"name": "Test Trace 4"');
    expect(exported).toContain('"runId": "test-run-4"');

    const parsed = JSON.parse(exported);
    expect(parsed.id).toBe(created.id);
  });

  it('should export golden trace as YAML', async () => {
    const runId = 'test-run-5';
    const trace = createSampleTrace(runId, 'test-agent');
    const config = { name: 'Test Trace 5' };

    const created = await manager.createGoldenTrace(runId, trace, config);
    const exported = await manager.exportGoldenTrace(created.id, 'yaml');

    expect(exported).toContain('name: "Test Trace 5"');
    expect(exported).toContain('runId: "test-run-5"');
  });

  it('should throw error when exporting non-existent golden trace', async () => {
    await expect(manager.exportGoldenTrace('non-existent-id')).rejects.toThrow(
      'Golden trace non-existent-id not found'
    );
  });
});

