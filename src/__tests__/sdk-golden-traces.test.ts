import { describe, it, expect, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { SDK } from '../types/sdk.js';

describe('SDK Golden Traces', () => {
  let sdk: SDK;
  let eventStore: FileEventStore;
  let agentId: string;
  let runId: string;

  beforeEach(async () => {
    try {
      await fs.rm('./test-events-golden', { recursive: true, force: true });
      await fs.rm('./test-golden-traces', { recursive: true, force: true });
    } catch {
      // Ignore
    }

    eventStore = new FileEventStore('./test-events-golden');
    sdk = createSDK({
      apiKey: 'test-key',
      eventStore,
      goldenTracesDir: './test-golden-traces',
    });

    const agent = sdk.createAgent({
      id: 'test-agent-golden',
      name: 'Test Agent',
      description: 'Test agent for golden traces',
    });
    agentId = agent.id;

    const result = await agent.run({ message: 'Hello' });
    runId = result.runId;
  });

  afterEach(async () => {
    try {
      await fs.rm('./test-events-golden', { recursive: true, force: true });
      await fs.rm('./test-golden-traces', { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  it('should create a golden trace', async () => {
    const goldenTrace = await sdk.createGoldenTrace(runId, {
      name: 'Test Golden Trace',
      description: 'A test golden trace',
    });

    expect(goldenTrace.id).toBeDefined();
    expect(goldenTrace.name).toBe('Test Golden Trace');
    expect(goldenTrace.runId).toBe(runId);
    expect(goldenTrace.agentId).toBe(agentId);
    expect(goldenTrace.trace).toBeDefined();
    expect(goldenTrace.trace.runId).toBe(runId);
  });

  it('should retrieve a golden trace', async () => {
    const created = await sdk.createGoldenTrace(runId, {
      name: 'Test Trace',
    });

    const retrieved = await sdk.getGoldenTrace(created.id);

    expect(retrieved.id).toBe(created.id);
    expect(retrieved.name).toBe('Test Trace');
  });

  it('should list golden traces', async () => {
    const created = await sdk.createGoldenTrace(runId, { name: 'Trace 1' });

    const traces = await sdk.getGoldenTraces();
    expect(traces.length).toBeGreaterThan(0);
    expect(traces.some((t) => t.id === created.id)).toBe(true);

    const agentTraces = await sdk.getGoldenTraces(agentId);
    expect(agentTraces.length).toBeGreaterThan(0);
    expect(agentTraces.every((t) => t.agentId === agentId)).toBe(true);
    expect(agentTraces.some((t) => t.id === created.id)).toBe(true);
  });

  it('should delete a golden trace', async () => {
    const created = await sdk.createGoldenTrace(runId, { name: 'Trace to Delete' });

    await sdk.deleteGoldenTrace(created.id);

    await expect(sdk.getGoldenTrace(created.id)).rejects.toThrow();
  });

  it('should export golden trace as JSON', async () => {
    const created = await sdk.createGoldenTrace(runId, { name: 'Trace to Export' });

    const exported = await sdk.exportGoldenTrace(created.id, 'json');

    expect(exported).toContain('"name": "Trace to Export"');
    const parsed = JSON.parse(exported);
    expect(parsed.id).toBe(created.id);
    expect(parsed.name).toBe('Trace to Export');
  });

  it('should export golden trace as YAML', async () => {
    const created = await sdk.createGoldenTrace(runId, { name: 'Trace YAML' });

    const exported = await sdk.exportGoldenTrace(created.id, 'yaml');

    expect(exported).toMatch(/name:\s*"Trace YAML"|name:\s*Trace YAML/);
    expect(exported).toMatch(new RegExp(`id:\\s*"${created.id}"`));
  });

  it('should throw error when runId does not exist', async () => {
    await expect(
      sdk.createGoldenTrace('non-existent-run', { name: 'Test' })
    ).rejects.toThrow();
  });

  it('should throw error when golden trace does not exist', async () => {
    await expect(sdk.getGoldenTrace('non-existent-id')).rejects.toThrow();
    await expect(sdk.deleteGoldenTrace('non-existent-id')).rejects.toThrow();
    await expect(sdk.exportGoldenTrace('non-existent-id')).rejects.toThrow();
  });
});

