import { describe, it, expect } from 'vitest';
import { ReasoningGraphBuilder } from '../utils/reasoning-graph-builder.js';
import { ReasoningGraphExporter } from '../utils/reasoning-graph-export.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

describe('ReasoningGraphBuilder', () => {
  it('should build a graph from events', () => {
    const runId = 'run-1';
    const events: Event[] = [
      {
        id: generateEventId(),
        runId,
        type: 'run.started',
        timestamp: 1000,
        data: {},
        metadata: { agentId: 'agent-1' },
      },
      {
        id: generateEventId(),
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
        metadata: { agentId: 'agent-1' },
      },
      {
        id: generateEventId(),
        runId,
        type: 'action.executed',
        timestamp: 3000,
        data: {
          intention: {
            type: 'tool_call',
            toolName: 'test_tool',
          },
        },
        metadata: { agentId: 'agent-1' },
      },
      {
        id: generateEventId(),
        runId,
        type: 'run.completed',
        timestamp: 4000,
        data: {},
        metadata: { agentId: 'agent-1' },
      },
    ];

    const graph = ReasoningGraphBuilder.buildFromEvents(runId, events);

    expect(graph.runId).toBe(runId);
    expect(graph.agentId).toBe('agent-1');
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.metadata).toBeDefined();
    expect(graph.metadata?.startedAt).toBe(1000);
    expect(graph.metadata?.completedAt).toBe(4000);
  });

  it('should create nodes for different event types', () => {
    const runId = 'run-1';
    const events: Event[] = [
      {
        id: generateEventId(),
        runId,
        type: 'run.started',
        timestamp: 1000,
        data: {},
      },
      {
        id: generateEventId(),
        runId,
        type: 'intention.generated',
        timestamp: 2000,
        data: {
          intention: { type: 'tool_call', toolName: 'test' },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'policy.checked',
        timestamp: 2500,
        data: {
          rule: 'test_rule',
          allowed: true,
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'tool.called',
        timestamp: 3000,
        data: {
          toolName: 'test',
          parameters: { param: 'value' },
        },
      },
    ];

    const graph = ReasoningGraphBuilder.buildFromEvents(runId, events);

    const nodeTypes = graph.nodes.map((n) => n.type);
    expect(nodeTypes).toContain('start');
    expect(nodeTypes).toContain('intention');
    expect(nodeTypes).toContain('policy');
    expect(nodeTypes).toContain('tool');
  });

  it('should create edges between nodes', () => {
    const runId = 'run-1';
    const events: Event[] = [
      {
        id: generateEventId(),
        runId,
        type: 'run.started',
        timestamp: 1000,
        data: {},
      },
      {
        id: generateEventId(),
        runId,
        type: 'intention.generated',
        timestamp: 2000,
        data: {
          intention: { type: 'tool_call', toolName: 'test' },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'action.executed',
        timestamp: 3000,
        data: {
          intention: { type: 'tool_call', toolName: 'test' },
        },
      },
    ];

    const graph = ReasoningGraphBuilder.buildFromEvents(runId, events);

    expect(graph.edges.length).toBeGreaterThan(0);
    
    // Check that edges connect nodes in sequence
    const startNode = graph.nodes.find((n) => n.type === 'start');
    const intentionNode = graph.nodes.find((n) => n.type === 'intention');
    
    expect(startNode).toBeDefined();
    expect(intentionNode).toBeDefined();
    
    const edge = graph.edges.find((e) => e.source === startNode?.id && e.target === intentionNode?.id);
    expect(edge).toBeDefined();
  });

  it('should handle approval workflow events', () => {
    const runId = 'run-1';
    const events: Event[] = [
      {
        id: generateEventId(),
        runId,
        type: 'run.started',
        timestamp: 1000,
        data: {},
      },
      {
        id: generateEventId(),
        runId,
        type: 'intention.generated',
        timestamp: 2000,
        data: {
          intention: { type: 'tool_call', toolName: 'sensitive_tool' },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'policy.checked',
        timestamp: 2500,
        data: {
          rule: 'require_approval',
          requiresApproval: true,
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'approval.requested',
        timestamp: 2600,
        data: { reason: 'Sensitive operation' },
      },
      {
        id: generateEventId(),
        runId,
        type: 'approval.approved',
        timestamp: 3000,
        data: {},
      },
    ];

    const graph = ReasoningGraphBuilder.buildFromEvents(runId, events);

    const approvalNodes = graph.nodes.filter((n) => n.type === 'decision');
    expect(approvalNodes.length).toBeGreaterThanOrEqual(2); // approval.requested and approval.approved

    const approvalEdges = graph.edges.filter((e) => e.type === 'approves' || e.type === 'triggers');
    expect(approvalEdges.length).toBeGreaterThan(0);
  });
});

describe('ReasoningGraphExporter', () => {
  const mockGraph = {
    runId: 'run-1',
    agentId: 'agent-1',
    nodes: [
      {
        id: 'node-1',
        type: 'start' as const,
        label: 'Start',
        timestamp: 1000,
      },
      {
        id: 'node-2',
        type: 'intention' as const,
        label: 'Intention',
        timestamp: 2000,
      },
    ],
    edges: [
      {
        id: 'edge-1',
        source: 'node-1',
        target: 'node-2',
        type: 'leads_to' as const,
      },
    ],
    metadata: {
      startedAt: 1000,
      completedAt: 2000,
    },
  };

  it('should export to JSON format', () => {
    const json = ReasoningGraphExporter.toJSON(mockGraph);
    expect(json).toBeDefined();
    expect(() => JSON.parse(json)).not.toThrow();
    
    const parsed = JSON.parse(json);
    expect(parsed.runId).toBe('run-1');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
  });

  it('should export to pretty JSON format', () => {
    const json = ReasoningGraphExporter.toJSON(mockGraph, true);
    expect(json).toBeDefined();
    expect(json).toContain('\n'); // Pretty format has newlines
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should export to Graphviz format', () => {
    const dot = ReasoningGraphExporter.toGraphviz(mockGraph);
    
    expect(dot).toBeDefined();
    expect(dot).toContain('digraph ReasoningGraph');
    expect(dot).toContain('"node-1"');
    expect(dot).toContain('"node-2"');
    expect(dot).toContain('"node-1" -> "node-2"');
  });

  it('should export to Graphviz with custom options', () => {
    const dot = ReasoningGraphExporter.toGraphviz(mockGraph, {
      direction: 'LR',
      nodeShape: 'ellipse',
      nodeStyle: 'filled',
    });
    
    expect(dot).toContain('rankdir=LR');
    expect(dot).toContain('shape=ellipse');
  });

  it('should escape special characters in Graphviz labels', () => {
    const graphWithSpecialChars = {
      ...mockGraph,
      nodes: [
        {
          id: 'node-1',
          type: 'intention' as const,
          label: 'Label with "quotes" and\nnewlines',
          timestamp: 1000,
        },
      ],
    };

    const dot = ReasoningGraphExporter.toGraphviz(graphWithSpecialChars);
    expect(dot).toContain('\\"');
    expect(dot).toContain('\\n');
  });
});

