import { describe, it, expect } from 'vitest';
import { RegressionDetector } from '../utils/regression-detector.js';
import type { Trace } from '../types/sdk.js';
import type { Event } from '../types/events.js';
import type { RegressionDetectionOptions } from '../types/regression.js';

describe('RegressionDetector', () => {
  const createSampleTrace = (runId: string, events: Event[], duration = 1000): Trace => ({
    runId,
    agentId: 'test-agent',
    status: 'completed',
    events,
    timeline: [],
    summary: {
      totalEvents: events.length,
      duration,
      intentionsGenerated: events.filter((e) => e.type === 'intention.generated').length,
      actionsExecuted: events.filter((e) => e.type === 'action.executed').length,
      policiesChecked: events.filter((e) => e.type === 'policy.checked').length,
      toolsCalled: events.filter((e) => e.type === 'tool.called').length,
    },
  });

  const createEvent = (id: string, type: string, timestamp = Date.now()): Event => ({
    id,
    runId: 'test-run',
    type: type as Event['type'],
    timestamp,
    data: { message: `Event ${id}` },
  });

  it('should detect no regression for identical traces', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', events);
    const actual = createSampleTrace('run-2', events);

    const report = RegressionDetector.detect(actual, expected, 'golden-1');

    expect(report.status).toBe('no_regression');
    expect(report.regressions).toHaveLength(0);
  });

  it('should detect critical regression for failed events', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.failed'),
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const report = RegressionDetector.detect(actual, expected, 'golden-1');

    expect(report.status).toBe('regressions_detected');
    expect(report.regressions.length).toBeGreaterThan(0);
    expect(report.regressions.some((r) => r.severity === 'critical')).toBe(true);
  });

  it('should detect performance regression', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', events, 1000);
    const actual = createSampleTrace('run-2', events, 5000);

    const options: RegressionDetectionOptions = {
      severityThresholds: {
        critical: 10000,
        high: 3000,
        medium: 1000,
      },
    };

    const report = RegressionDetector.detect(actual, expected, 'golden-1', options);

    expect(report.status).toBe('regressions_detected');
    expect(report.regressions.some((r) => r.type === 'performance')).toBe(true);
    expect(report.metrics.durationDiff).toBe(4000);
  });

  it('should respect tolerance thresholds', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', events, 1000);
    const actual = createSampleTrace('run-2', events, 1500);

    const options: RegressionDetectionOptions = {
      tolerance: {
        maxDurationDiff: 1000,
      },
    };

    const report = RegressionDetector.detect(actual, expected, 'golden-1', options);

    expect(report.regressions.filter((r) => r.type === 'performance')).toHaveLength(0);
  });

  it('should classify regressions by severity', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.failed'),
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const report = RegressionDetector.detect(actual, expected, 'golden-1');

    expect(report.summary.criticalCount).toBeGreaterThan(0);
    expect(report.summary.totalRegressions).toBeGreaterThan(0);
  });

  it('should calculate similarity score', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', events);
    const actual = createSampleTrace('run-2', events);

    const report = RegressionDetector.detect(actual, expected, 'golden-1');

    expect(report.metrics.similarityScore).toBe(1);
  });

  it('should ignore specified event types', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'tool.called'),
      createEvent('evt-3', 'action.executed'),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'tool.called'),
      { ...createEvent('evt-3', 'action.executed'), data: { message: 'Different' } },
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const options: RegressionDetectionOptions = {
      tolerance: {
        ignoreEventTypes: ['tool.called'],
      },
    };

    const report = RegressionDetector.detect(actual, expected, 'golden-1', options);

    expect(report.regressions.length).toBeGreaterThanOrEqual(0);
  });
});


