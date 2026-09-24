import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

describe('SDK Trace Visualization', () => {
  let env: TestSDK;
  let sdk: TestSDK['sdk'];

  beforeEach(() => {
    // A throwaway event store per test, not the shared ./events folder of the working tree.
    env = createTestSDK({ apiKey: 'test-api-key' });
    sdk = env.sdk;
  });

  afterEach(async () => {
    await env.dispose();
  });

  it('should create visualization from trace', async () => {
    const eventStore = (sdk as any).eventStore;
    const runId = `test-run-viz-1-${Date.now()}`;
    
    await eventStore.append(runId, {
      id: `event-1-${runId}`,
      runId,
      type: 'run.started',
      timestamp: 1000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-2-${runId}`,
      runId,
      type: 'intention.generated',
      timestamp: 2000,
      data: {
        intention: { type: 'tool_call', toolName: 'search_tool' },
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-3-${runId}`,
      runId,
      type: 'tool.called',
      timestamp: 3000,
      data: {
        toolName: 'search_tool',
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-4-${runId}`,
      runId,
      type: 'run.completed',
      timestamp: 4000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    const visualization = await sdk.getTraceVisualization(runId);

    expect(visualization).toBeDefined();
    expect(visualization.runId).toBe(runId);
    expect(visualization.groups.length).toBeGreaterThan(0);
    expect(visualization.flatTimeline.length).toBe(4);
    expect(visualization.summary.totalEvents).toBe(4);
    expect(visualization.timeRange.start).toBe(1000);
    expect(visualization.timeRange.end).toBe(4000);
  });

  it('should group events logically', async () => {
    const eventStore = (sdk as any).eventStore;
    const runId = `test-run-viz-2-${Date.now()}`;
    
    await eventStore.append(runId, {
      id: `event-1-${runId}`,
      runId,
      type: 'run.started',
      timestamp: 1000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-2-${runId}`,
      runId,
      type: 'intention.generated',
      timestamp: 2000,
      data: {
        intention: { type: 'tool_call', toolName: 'tool_a' },
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-3-${runId}`,
      runId,
      type: 'tool.called',
      timestamp: 3000,
      data: { toolName: 'tool_a' },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-4-${runId}`,
      runId,
      type: 'intention.generated',
      timestamp: 4000,
      data: {
        intention: { type: 'tool_call', toolName: 'tool_b' },
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-5-${runId}`,
      runId,
      type: 'tool.called',
      timestamp: 5000,
      data: { toolName: 'tool_b' },
      metadata: { agentId: 'test-agent' },
    });

    const visualization = await sdk.getTraceVisualization(runId);

    const toolGroups = visualization.groups.filter((g) => g.type === 'tool_execution');
    expect(toolGroups.length).toBeGreaterThan(0);
    
    // Verify groups have correct metadata
    // Note: Groups may be merged or split, so we check that tool_a or tool_b groups exist
    const toolGroupsWithMetadata = toolGroups.filter((g) => 
      g.metadata?.toolName === 'tool_a' || g.metadata?.toolName === 'tool_b'
    );
    expect(toolGroupsWithMetadata.length).toBeGreaterThan(0);
  });

  it('should calculate summary metrics correctly', async () => {
    const eventStore = (sdk as any).eventStore;
    const runId = `test-run-viz-3-${Date.now()}`;
    
    await eventStore.append(runId, {
      id: `event-1-${runId}`,
      runId,
      type: 'intention.generated',
      timestamp: 1000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-2-${runId}`,
      runId,
      type: 'action.executed',
      timestamp: 2000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-3-${runId}`,
      runId,
      type: 'tool.called',
      timestamp: 3000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-4-${runId}`,
      runId,
      type: 'policy.checked',
      timestamp: 4000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: `event-5-${runId}`,
      runId,
      type: 'approval.requested',
      timestamp: 5000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    const visualization = await sdk.getTraceVisualization(runId);

    expect(visualization.summary.keyMetrics.intentionsGenerated).toBe(1);
    expect(visualization.summary.keyMetrics.actionsExecuted).toBe(1);
    expect(visualization.summary.keyMetrics.toolsCalled).toBe(1);
    expect(visualization.summary.keyMetrics.policiesChecked).toBe(1);
    expect(visualization.summary.keyMetrics.approvalsRequested).toBe(1);
  });

  it('should throw error for non-existent run', async () => {
    await expect(sdk.getTraceVisualization('non-existent-run-xyz-123')).rejects.toThrow('No trace found');
  });
});
