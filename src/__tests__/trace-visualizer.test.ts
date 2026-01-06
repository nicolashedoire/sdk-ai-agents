import { describe, it, expect } from 'vitest';
import { TraceVisualizer } from '../utils/trace-visualizer.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

describe('TraceVisualizer', () => {
  it('should create visualization from trace events', () => {
    const trace = {
      runId: 'run-1',
      agentId: 'agent-1',
      status: 'completed',
      events: [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 2000,
          data: {
            intention: { type: 'tool_call', toolName: 'test_tool' },
          },
          metadata: { agentId: 'agent-1' },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'action.executed',
          timestamp: 3000,
          data: {
            toolName: 'test_tool',
          },
          metadata: { agentId: 'agent-1' },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'run.completed',
          timestamp: 4000,
          data: {},
          metadata: { agentId: 'agent-1' },
        },
      ],
    };

    const visualization = TraceVisualizer.visualize(trace);

    expect(visualization.runId).toBe('run-1');
    expect(visualization.agentId).toBe('agent-1');
    expect(visualization.groups.length).toBeGreaterThan(0);
    expect(visualization.flatTimeline.length).toBe(4);
    expect(visualization.summary.totalEvents).toBe(4);
  });

  it('should group events logically', () => {
    const trace = {
      runId: 'run-1',
      status: 'completed',
      events: [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 2000,
          data: {
            intention: { type: 'tool_call', toolName: 'tool_a' },
          },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'tool.called',
          timestamp: 3000,
          data: {
            toolName: 'tool_a',
          },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 4000,
          data: {
            intention: { type: 'tool_call', toolName: 'tool_b' },
          },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'tool.called',
          timestamp: 5000,
          data: {
            toolName: 'tool_b',
          },
        },
      ],
    };

    const visualization = TraceVisualizer.visualize(trace);

    expect(visualization.groups.length).toBeGreaterThan(1);
    
    const toolGroups = visualization.groups.filter((g) => g.type === 'tool_execution');
    expect(toolGroups.length).toBeGreaterThan(0);
  });

  it('should create flat timeline', () => {
    const trace = {
      runId: 'run-1',
      status: 'completed',
      events: [
        {
          id: 'event-1',
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
        },
        {
          id: 'event-2',
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 2000,
          data: {
            intention: { type: 'tool_call', toolName: 'test' },
          },
        },
      ],
    };

    const visualization = TraceVisualizer.visualize(trace);

    expect(visualization.flatTimeline.length).toBe(2);
    expect(visualization.flatTimeline[0].id).toBe('event-1');
    expect(visualization.flatTimeline[1].id).toBe('event-2');
    expect(visualization.flatTimeline[0].groupId).toBeDefined();
  });

  it('should calculate summary metrics', () => {
    const trace = {
      runId: 'run-1',
      status: 'completed',
      events: [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 1000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'action.executed',
          timestamp: 2000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'tool.called',
          timestamp: 3000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'policy.checked',
          timestamp: 4000,
          data: {},
        },
      ],
    };

    const visualization = TraceVisualizer.visualize(trace);

    expect(visualization.summary.keyMetrics.intentionsGenerated).toBe(1);
    expect(visualization.summary.keyMetrics.actionsExecuted).toBe(1);
    expect(visualization.summary.keyMetrics.toolsCalled).toBe(1);
    expect(visualization.summary.keyMetrics.policiesChecked).toBe(1);
  });

  it('should handle empty events', () => {
    const trace = {
      runId: 'run-1',
      status: 'completed',
      events: [],
    };

    const visualization = TraceVisualizer.visualize(trace);

    expect(visualization.groups.length).toBe(0);
    expect(visualization.flatTimeline.length).toBe(0);
    expect(visualization.summary.totalEvents).toBe(0);
  });

  it('should group approval workflow events', () => {
    const trace = {
      runId: 'run-1',
      status: 'completed',
      events: [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'approval.requested',
          timestamp: 1000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'approval.approved',
          timestamp: 2000,
          data: {},
        },
      ],
    };

    const visualization = TraceVisualizer.visualize(trace);

    const approvalGroups = visualization.groups.filter((g) => g.type === 'approval_workflow');
    expect(approvalGroups.length).toBeGreaterThan(0);
  });

  it('should group error events', () => {
    const trace = {
      runId: 'run-1',
      status: 'failed',
      events: [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'error.occurred',
          timestamp: 1000,
          data: { error: 'Test error' },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'action.failed',
          timestamp: 2000,
          data: {},
        },
      ],
    };

    const visualization = TraceVisualizer.visualize(trace);

    const errorGroups = visualization.groups.filter((g) => g.type === 'error');
    expect(errorGroups.length).toBeGreaterThan(0);
    expect(visualization.summary.keyMetrics.errors).toBe(2);
  });
});

