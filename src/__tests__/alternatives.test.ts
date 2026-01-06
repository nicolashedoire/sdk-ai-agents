import { describe, it, expect } from 'vitest';
import { AlternativesExtractor } from '../utils/alternatives-extractor.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

describe('AlternativesExtractor', () => {
  it('should extract alternatives from events with multiple tool calls', () => {
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
          toolCalls: [
            { function: { name: 'tool_a', arguments: '{}' } },
            { function: { name: 'tool_b', arguments: '{}' } },
          ],
        },
        metadata: { agentId: 'agent-1' },
      },
      {
        id: generateEventId(),
        runId,
        type: 'tool.called',
        timestamp: 3000,
        data: {
          toolName: 'tool_a',
          parameters: {},
        },
        metadata: { agentId: 'agent-1' },
      },
    ];

    const analysis = AlternativesExtractor.extractFromEvents(runId, events);

    expect(analysis.runId).toBe(runId);
    expect(analysis.decisionPoints.length).toBeGreaterThan(0);
    expect(analysis.summary.totalAlternatives).toBeGreaterThan(0);
    expect(analysis.summary.selectedCount).toBeGreaterThan(0);
  });

  it('should identify rejected intentions as alternatives', () => {
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
      },
      {
        id: generateEventId(),
        runId,
        type: 'intention.rejected',
        timestamp: 2500,
        data: {
          rejectedIntentionId: 'intention-1',
          reason: 'Tool not allowed',
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'intention.generated',
        timestamp: 3000,
        data: {
          intention: {
            type: 'tool_call',
            toolName: 'allowed_tool',
          },
        },
      },
    ];

    const analysis = AlternativesExtractor.extractFromEvents(runId, events);

    const rejectedAlternatives = analysis.decisionPoints.flatMap((dp) =>
      dp.alternatives.filter((a) => a.status === 'rejected')
    );
    expect(rejectedAlternatives.length).toBeGreaterThan(0);
    expect(rejectedAlternatives[0].reason).toBeDefined();
  });

  it('should identify policy rejections as alternatives', () => {
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
        id: 'intention-1',
        runId,
        type: 'intention.generated',
        timestamp: 2000,
        data: {
          intention: {
            type: 'tool_call',
            toolName: 'sensitive_tool',
          },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'policy.checked',
        timestamp: 2500,
        data: {
          rule: 'block_sensitive_tools',
          allowed: false,
          reason: 'Sensitive tool blocked by policy',
        },
      },
    ];

    const analysis = AlternativesExtractor.extractFromEvents(runId, events);

    const rejectedAlternatives = analysis.decisionPoints.flatMap((dp) =>
      dp.alternatives.filter((a) => a.status === 'rejected')
    );
    expect(rejectedAlternatives.length).toBeGreaterThan(0);
    expect(rejectedAlternatives.some((a) => a.type === 'decision')).toBe(true);
  });

  it('should calculate summary statistics correctly', () => {
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
          intention: { type: 'tool_call', toolName: 'tool_1' },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'action.executed',
        timestamp: 3000,
        data: {
          intention: { type: 'tool_call', toolName: 'tool_1' },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'intention.generated',
        timestamp: 4000,
        data: {
          intention: { type: 'tool_call', toolName: 'tool_2' },
        },
      },
      {
        id: generateEventId(),
        runId,
        type: 'policy.checked',
        timestamp: 4500,
        data: {
          rule: 'block_tool_2',
          allowed: false,
        },
      },
    ];

    const analysis = AlternativesExtractor.extractFromEvents(runId, events);

    expect(analysis.summary.totalAlternatives).toBeGreaterThan(0);
    expect(analysis.summary.decisionPointsCount).toBeGreaterThan(0);
    expect(analysis.summary.selectedCount + analysis.summary.rejectedCount + analysis.summary.consideredCount).toBe(analysis.summary.totalAlternatives);
  });

  it('should handle approval workflow alternatives', () => {
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
        type: 'approval.requested',
        timestamp: 2500,
        data: { reason: 'Requires approval' },
      },
      {
        id: generateEventId(),
        runId,
        type: 'approval.rejected',
        timestamp: 3000,
        data: { reason: 'Approval rejected by user' },
      },
    ];

    const analysis = AlternativesExtractor.extractFromEvents(runId, events);

    const rejectedAlternatives = analysis.decisionPoints.flatMap((dp) =>
      dp.alternatives.filter((a) => a.status === 'rejected' && a.type === 'decision')
    );
    expect(rejectedAlternatives.length).toBeGreaterThan(0);
    expect(rejectedAlternatives[0].description).toContain('Approval');
  });
});

