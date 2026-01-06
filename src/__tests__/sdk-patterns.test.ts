import { describe, it, expect, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';

describe('SDK Decision Patterns', () => {
  let sdk: ReturnType<typeof createSDK>;

  beforeEach(() => {
    sdk = createSDK({
      apiKey: 'test-api-key',
    });
  });

  it('should analyze patterns across multiple runs', async () => {
    const eventStore = (sdk as any).eventStore;
    
    // Create multiple runs with similar patterns
    for (let i = 1; i <= 3; i++) {
      const runId = `test-run-${i}`;
      
      await eventStore.append(runId, {
        id: `event-${i}-1`,
        runId,
        type: 'run.started',
        timestamp: i * 1000,
        data: {},
        metadata: { agentId: 'test-agent' },
      });

      await eventStore.append(runId, {
        id: `event-${i}-2`,
        runId,
        type: 'tool.called',
        timestamp: i * 1000 + 100,
        data: {
          toolName: 'search_tool',
        },
        metadata: { agentId: 'test-agent' },
      });
    }

    const analysis = await sdk.getDecisionPatterns({ agentId: 'test-agent' });

    expect(analysis).toBeDefined();
    expect(analysis.runsAnalyzed).toBeGreaterThan(0);
    expect(analysis.patterns.length).toBeGreaterThan(0);
    
    const toolPattern = analysis.patterns.find(
      (p) => p.type === 'tool_choice' && p.metadata?.toolName === 'search_tool'
    );
    expect(toolPattern).toBeDefined();
    expect(toolPattern?.frequency).toBeGreaterThanOrEqual(3);
  });

  it('should filter patterns by minimum frequency', async () => {
    const eventStore = (sdk as any).eventStore;
    const uniqueRunId = `test-run-filter-${Date.now()}`;
    
    // Create runs with the same tool to create a pattern with frequency >= 2
    for (let i = 1; i <= 3; i++) {
      const runId = `${uniqueRunId}-${i}`;
      
      await eventStore.append(runId, {
        id: `event-${i}`,
        runId,
        type: 'run.started',
        timestamp: i * 1000,
        data: {},
        metadata: { agentId: 'test-agent-filter' },
      });
      
      await eventStore.append(runId, {
        id: `event-${i}-tool`,
        runId,
        type: 'tool.called',
        timestamp: i * 1000 + 100,
        data: {
          toolName: 'common_tool',
        },
        metadata: { agentId: 'test-agent-filter' },
      });
    }

    // Get analysis with minFrequency filter
    const analysisFiltered = await sdk.getDecisionPatterns({ 
      agentId: 'test-agent-filter', 
      minFrequency: 2 
    });
    
    // Verify that all patterns in filtered analysis have frequency >= 2
    const lowFrequencyPatterns = analysisFiltered.patterns.filter((p) => p.frequency < 2);
    expect(lowFrequencyPatterns.length).toBe(0);
    
    // Verify that the analysis respects minFrequency
    expect(analysisFiltered.runsAnalyzed).toBeGreaterThan(0);
  });

  it('should filter by time range', async () => {
    const eventStore = (sdk as any).eventStore;
    const now = Date.now();
    
    await eventStore.append('run-1', {
      id: 'event-1',
      runId: 'run-1',
      type: 'tool.called',
      timestamp: now - 10000,
      data: { toolName: 'old_tool' },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append('run-2', {
      id: 'event-2',
      runId: 'run-2',
      type: 'tool.called',
      timestamp: now - 1000,
      data: { toolName: 'recent_tool' },
      metadata: { agentId: 'test-agent' },
    });

    const analysis = await sdk.getDecisionPatterns({
      agentId: 'test-agent',
      since: now - 5000,
    });

    const oldToolPattern = analysis.patterns.find(
      (p) => p.metadata?.toolName === 'old_tool'
    );
    expect(oldToolPattern).toBeUndefined();
  });

  it('should return empty analysis for no runs', async () => {
    // Use a very specific agent ID that doesn't exist and a time range that excludes everything
    const futureTime = Date.now() + 1000000;
    const analysis = await sdk.getDecisionPatterns({ 
      agentId: 'non-existent-agent-xyz-123',
      since: futureTime,
    });

    expect(analysis.runsAnalyzed).toBe(0);
    expect(analysis.patterns.length).toBe(0);
    expect(analysis.insights.length).toBe(0);
  });
});
