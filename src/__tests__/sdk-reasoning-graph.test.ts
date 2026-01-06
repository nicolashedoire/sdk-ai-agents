import { describe, it, expect, beforeEach } from 'vitest';
import { createSDK } from '../sdk.js';
import type { ReasoningGraph } from '../types/reasoning-graph.js';

describe('SDK Reasoning Graph', () => {
  let sdk: ReturnType<typeof createSDK>;

  beforeEach(() => {
    sdk = createSDK({
      apiKey: 'test-api-key',
    });
  });

  it('should generate reasoning graph from events', async () => {
    const agent = sdk.createAgent({
      id: 'test-agent',
      model: 'gpt-3.5-turbo',
      systemPrompt: 'You are a helpful assistant',
    });

    // Mock the reasoning engine to generate predictable events
    // For now, we'll create events manually to test the graph generation
    const eventStore = (sdk as any).eventStore;
    
    const runId = 'test-run-1';
    
    // Create a sequence of events manually
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
        intention: {
          type: 'tool_call',
          toolName: 'test_tool',
          reasoning: 'Need to call test tool',
        },
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: 'event-3',
      runId,
      type: 'action.executed',
      timestamp: 3000,
      data: {
        intention: {
          type: 'tool_call',
          toolName: 'test_tool',
        },
      },
      metadata: { agentId: 'test-agent' },
    });

    await eventStore.append(runId, {
      id: 'event-4',
      runId,
      type: 'run.completed',
      timestamp: 4000,
      data: {},
      metadata: { agentId: 'test-agent' },
    });

    const graph = await sdk.getReasoningGraph(runId);

    expect(graph).toBeDefined();
    expect(graph.runId).toBe(runId);
    expect(graph.agentId).toBe('test-agent');
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.metadata).toBeDefined();
  });

  it('should export reasoning graph to JSON', async () => {
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
      id: 'event-2',
      runId,
      type: 'intention.generated',
      timestamp: 2000,
      data: {
        intention: { type: 'final_answer', reasoning: 'Answer' },
      },
      metadata: { agentId: 'test-agent' },
    });

    const json = await sdk.exportReasoningGraph(runId, 'json');
    
    expect(json).toBeDefined();
    expect(() => JSON.parse(json)).not.toThrow();
    
    const parsed = JSON.parse(json) as ReasoningGraph;
    expect(parsed.runId).toBe(runId);
    expect(parsed.nodes.length).toBeGreaterThan(0);
  });

  it('should export reasoning graph to Graphviz', async () => {
    const eventStore = (sdk as any).eventStore;
    const runId = 'test-run-3';
    
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
        intention: { type: 'tool_call', toolName: 'test' },
      },
      metadata: { agentId: 'test-agent' },
    });

    const dot = await sdk.exportReasoningGraph(runId, 'graphviz');
    
    expect(dot).toBeDefined();
    expect(dot).toContain('digraph ReasoningGraph');
    expect(dot).toContain('rankdir');
  });

  it('should throw error for non-existent run', async () => {
    await expect(sdk.getReasoningGraph('non-existent-run')).rejects.toThrow('No events found');
  });
});

