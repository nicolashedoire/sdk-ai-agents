import { describe, it, expect } from 'vitest';
import { RunComparator } from '../utils/run-comparator.js';
import type { Trace } from '../types/sdk.js';
import type { Event } from '../types/events.js';
import type { ComparisonOptions } from '../types/comparison.js';

describe('RunComparator', () => {
  const createEvent = (id: string, type: Event['type'], timestamp = Date.now(), data: unknown = {}): Event => ({
    id,
    runId: 'test-run',
    type,
    timestamp,
    data,
  });

  const createTrace = (runId: string, events: Event[]): Trace => ({
    runId,
    agentId: 'test-agent',
    status: 'completed',
    events,
    timeline: [],
    summary: {
      totalEvents: events.length,
      duration: events.length > 0 ? events[events.length - 1].timestamp - events[0].timestamp : 0,
      intentionsGenerated: events.filter((e) => e.type === 'intention.generated').length,
      actionsExecuted: events.filter((e) => e.type === 'action.executed').length,
      policiesChecked: events.filter((e) => e.type === 'policy.checked').length,
      toolsCalled: events.filter((e) => e.type === 'tool.called').length,
    },
  });

  it('should compare identical runs with no differences', () => {
    const events = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
      createEvent('evt-3', 'action.executed', 3000),
    ];

    const trace1 = createTrace('run-1', events);
    const trace2 = createTrace('run-2', events);

    const comparison = RunComparator.compare(trace1, trace2);

    expect(comparison.runId1).toBe('run-1');
    expect(comparison.runId2).toBe('run-2');
    expect(comparison.summary.totalDifferences).toBe(0);
    expect(comparison.metrics.totalEvents.diff).toBe(0);
  });

  it('should detect added events', () => {
    const events1 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
    ];

    const events2 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
      createEvent('evt-3', 'action.executed', 3000),
    ];

    const trace1 = createTrace('run-1', events1);
    const trace2 = createTrace('run-2', events2);

    const comparison = RunComparator.compare(trace1, trace2);

    expect(comparison.summary.totalDifferences).toBeGreaterThan(0);
    expect(comparison.differences.some((d) => d.type === 'event_added')).toBe(true);
  });

  it('should detect removed events', () => {
    const events1 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
      createEvent('evt-3', 'action.executed', 3000),
    ];

    const events2 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
    ];

    const trace1 = createTrace('run-1', events1);
    const trace2 = createTrace('run-2', events2);

    const comparison = RunComparator.compare(trace1, trace2);

    expect(comparison.summary.totalDifferences).toBeGreaterThan(0);
    expect(comparison.differences.some((d) => d.type === 'event_removed')).toBe(true);
  });

  it('should detect data changes', () => {
    const events1 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'action.executed', 2000, { status: 'success' }),
    ];

    const events2 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'action.executed', 2000, { status: 'failed' }),
    ];

    const trace1 = createTrace('run-1', events1);
    const trace2 = createTrace('run-2', events2);

    const comparison = RunComparator.compare(trace1, trace2);

    expect(comparison.differences.some((d) => d.type === 'data_changed')).toBe(true);
  });

  it('should detect sequence changes', () => {
    const events1 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
      createEvent('evt-3', 'action.executed', 3000),
    ];

    const events2 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-3', 'action.executed', 2000),
      createEvent('evt-2', 'intention.generated', 3000),
    ];

    const trace1 = createTrace('run-1', events1);
    const trace2 = createTrace('run-2', events2);

    const comparison = RunComparator.compare(trace1, trace2);

    expect(comparison.differences.some((d) => d.type === 'sequence_changed')).toBe(true);
  });

  it('should ignore specified event types', () => {
    const events1 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'policy.checked', 2000),
    ];

    const events2 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-3', 'policy.checked', 2000),
    ];

    const trace1 = createTrace('run-1', events1);
    const trace2 = createTrace('run-2', events2);

    const options: ComparisonOptions = {
      ignoreEventTypes: ['policy.checked'],
    };

    const comparison = RunComparator.compare(trace1, trace2, options);

    expect(comparison.summary.totalDifferences).toBe(0);
  });

  it('should calculate metrics correctly', () => {
    const events1 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
      createEvent('evt-3', 'action.executed', 3000),
    ];

    const events2 = [
      createEvent('evt-1', 'run.started', 1000),
      createEvent('evt-2', 'intention.generated', 2000),
    ];

    const trace1 = createTrace('run-1', events1);
    const trace2 = createTrace('run-2', events2);

    const comparison = RunComparator.compare(trace1, trace2);

    expect(comparison.metrics.totalEvents.run1).toBe(3);
    expect(comparison.metrics.totalEvents.run2).toBe(2);
    expect(comparison.metrics.totalEvents.diff).toBe(1);
    expect(comparison.metrics.intentionsGenerated.run1).toBe(1);
    expect(comparison.metrics.intentionsGenerated.run2).toBe(1);
    expect(comparison.metrics.intentionsGenerated.diff).toBe(0);
  });
});


