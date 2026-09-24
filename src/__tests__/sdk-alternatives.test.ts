import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

describe('SDK Alternatives', () => {
  let env: TestSDK;
  let sdk: TestSDK['sdk'];

  beforeEach(() => {
    // A throwaway event store per test: in the shared ./events folder, events appended to
    // the same run ids by other suites and earlier runs would pile up.
    env = createTestSDK({ apiKey: 'test-api-key' });
    sdk = env.sdk;
  });

  afterEach(async () => {
    await env.dispose();
  });

  it('should extract alternatives from events', async () => {
    const eventStore = (sdk as any).eventStore;
    const runId = 'test-run-1';
    
    // Create events with multiple tool calls (alternatives)
    await eventStore.append(runId, {
      id: 'event-1',
      runId,
      type: 'run.started',
      timestamp: 1000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: 'event-2',
      runId,
      type: 'intention.generated',
      timestamp: 2000,
      data: {
        toolCalls: [
          { function: { name: 'tool_a', arguments: '{}' } },
          { function: { name: 'tool_b', arguments: '{}' } },
        ],
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: 'event-3',
      runId,
      type: 'tool.called',
      timestamp: 3000,
      data: {
        toolName: 'tool_a',
        parameters: {},
      },
      metadata: { agentId: 'test-agent' },
    });

    const analysis = await sdk.getAlternatives(runId);

    expect(analysis).toBeDefined();
    expect(analysis.runId).toBe(runId);
    expect(analysis.decisionPoints.length).toBeGreaterThan(0);
    expect(analysis.summary.totalAlternatives).toBeGreaterThan(0);
    expect(analysis.summary.selectedCount).toBeGreaterThan(0);
  });

  it('should identify rejected intentions as alternatives', async () => {
    const eventStore = (sdk as any).eventStore;
    const runId = 'test-run-2';
    
    await eventStore.append(runId, {
      id: 'event-1',
      runId,
      type: 'run.started',
      timestamp: 1000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: 'intention-1',
      runId,
      type: 'intention.generated',
      timestamp: 2000,
      data: {
        intention: {
          type: 'tool_call',
          toolName: 'forbidden_tool',
        },
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: 'event-2',
      runId,
      type: 'intention.rejected',
      timestamp: 2500,
      data: {
        rejectedIntentionId: 'intention-1',
        reason: 'Tool not allowed',
      },
      metadata: { agentId: 'test-agent' },
    });

    const analysis = await sdk.getAlternatives(runId);

    expect(analysis.summary.rejectedCount).toBeGreaterThan(0);
    const rejectedAlternatives = analysis.decisionPoints.flatMap((dp) =>
      dp.alternatives.filter((a) => a.status === 'rejected')
    );
    expect(rejectedAlternatives.length).toBeGreaterThan(0);
  });

  it('should throw error for non-existent run', async () => {
    await expect(sdk.getAlternatives('non-existent-run')).rejects.toThrow('No events found');
  });
});


