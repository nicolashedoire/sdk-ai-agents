import { describe, it, expect } from 'vitest';
import { ImpactAnalyzer } from '../utils/impact-analyzer.js';
import type { Trace } from '../types/sdk.js';
import type { Event } from '../types/events.js';
import type { ImpactAnalysisOptions } from '../types/impact-analysis.js';

describe('ImpactAnalyzer', () => {
  const createEvent = (id: string, type: Event['type'], timestamp = Date.now()): Event => ({
    id,
    runId: 'test-run',
    type,
    timestamp,
    data: {},
  });

  const createTrace = (runId: string, events: Event[], status: Trace['status'] = 'completed'): Trace => ({
    runId,
    agentId: 'test-agent',
    status,
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

  it('should analyze impact with improvement', () => {
    const beforeTraces = [
      createTrace('run-1', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'intention.generated', 2000),
        createEvent('evt-3', 'action.executed', 3000),
      ]),
    ];

    const afterTraces = [
      createTrace('run-2', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'intention.generated', 1500),
        createEvent('evt-3', 'action.executed', 2000),
      ]),
    ];

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces);

    expect(analysis.beforeRunIds).toContain('run-1');
    expect(analysis.afterRunIds).toContain('run-2');
    expect(analysis.metrics.length).toBeGreaterThan(0);
    expect(analysis.impact.overall).toBeDefined();
  });

  it('should calculate duration metric', () => {
    const beforeTraces = [
      createTrace('run-1', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'action.executed', 3000),
      ]),
    ];

    const afterTraces = [
      createTrace('run-2', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'action.executed', 2000),
      ]),
    ];

    const options: ImpactAnalysisOptions = {
      metrics: ['duration'],
    };

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces, options);

    const durationMetric = analysis.metrics.find((m) => m.name.includes('duration'));
    expect(durationMetric).toBeDefined();
    expect(durationMetric?.change.direction).toBe('improvement');
  });

  it('should identify behavior changes', () => {
    const beforeTraces = [
      createTrace('run-1', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'intention.generated', 2000),
      ]),
    ];

    const afterTraces = [
      createTrace('run-2', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'intention.generated', 2000),
        createEvent('evt-3', 'intention.generated', 2500),
        createEvent('evt-4', 'intention.generated', 3000),
      ]),
    ];

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces);

    expect(analysis.behaviorChanges.length).toBeGreaterThan(0);
  });

  it('should generate recommendations when requested', () => {
    const beforeTraces = [
      createTrace('run-1', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'action.executed', 2000),
      ]),
    ];

    const afterTraces = [
      createTrace('run-2', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'action.failed', 2000),
      ], 'failed'),
    ];

    const options: ImpactAnalysisOptions = {
      includeRecommendations: true,
    };

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces, options);

    expect(analysis.recommendations).toBeDefined();
    expect(analysis.recommendations!.length).toBeGreaterThan(0);
  });

  it('should assess impact as neutral when no significant changes', () => {
    const beforeTraces = [
      createTrace('run-1', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'action.executed', 2000),
      ]),
    ];

    const afterTraces = [
      createTrace('run-2', [
        createEvent('evt-1', 'run.started', 1000),
        createEvent('evt-2', 'action.executed', 2001),
      ]),
    ];

    const analysis = ImpactAnalyzer.analyze(beforeTraces, afterTraces);

    expect(analysis.impact.overall).toBe('neutral');
  });
});

