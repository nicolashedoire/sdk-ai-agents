import { describe, it, expect } from 'vitest';
import { TraceValidator } from '../utils/trace-validator.js';
import type { Trace } from '../types/sdk.js';
import type { Event } from '../types/events.js';
import type { ValidationOptions } from '../types/validation.js';

describe('TraceValidator', () => {
  const createSampleTrace = (runId: string, events: Event[]): Trace => ({
    runId,
    agentId: 'test-agent',
    status: 'completed',
    events,
    timeline: [],
    summary: {
      totalEvents: events.length,
      duration: 1000,
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

  it('should validate identical traces as pass', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', events);
    const actual = createSampleTrace('run-2', events);

    const result = TraceValidator.validate(actual, expected, 'golden-1');

    expect(result.status).toBe('pass');
    expect(result.differences).toHaveLength(0);
  });

  it('should detect missing events', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const result = TraceValidator.validate(actual, expected, 'golden-1');

    expect(result.status).toBe('fail');
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.differences.some((d) => d.type === 'event_removed')).toBe(true);
  });

  it('should detect added events', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const result = TraceValidator.validate(actual, expected, 'golden-1');

    expect(result.status).toBe('fail');
    expect(result.differences.some((d) => d.type === 'event_added')).toBe(true);
  });

  it('should detect modified events', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      {
        ...createEvent('evt-2', 'intention.generated'),
        data: { message: 'Different message' },
      },
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const result = TraceValidator.validate(actual, expected, 'golden-1');

    expect(result.status).toBe('fail');
    expect(result.differences.some((d) => d.type === 'event_modified')).toBe(true);
  });

  it('should ignore specified event types', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'tool.called'),
    ];

    const expected = createSampleTrace('run-1', events);
    const actual = createSampleTrace('run-2', [
      events[0],
      events[1],
      { ...events[2], data: { message: 'Different' } },
    ]);

    const options: ValidationOptions = {
      ignoreEventTypes: ['tool.called'],
    };

    const result = TraceValidator.validate(actual, expected, 'golden-1', options);

    expect(result.status).toBe('pass');
  });

  it('should ignore timestamp differences when option is set', () => {
    const baseTime = Date.now();
    const expectedEvents = [
      createEvent('evt-1', 'run.started', baseTime),
      createEvent('evt-2', 'intention.generated', baseTime + 100),
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started', baseTime + 5000),
      createEvent('evt-2', 'intention.generated', baseTime + 5100),
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const options: ValidationOptions = {
      ignoreTimestampDiff: true,
    };

    const result = TraceValidator.validate(actual, expected, 'golden-1', options);

    expect(result.status).toBe('pass');
  });

  it('should compare structure only when option is set', () => {
    const expectedEvents = [
      createEvent('evt-1', 'run.started'),
      { ...createEvent('evt-2', 'intention.generated'), data: { message: 'Expected' } },
    ];
    const actualEvents = [
      createEvent('evt-1', 'run.started'),
      { ...createEvent('evt-2', 'intention.generated'), data: { message: 'Actual' } },
    ];

    const expected = createSampleTrace('run-1', expectedEvents);
    const actual = createSampleTrace('run-2', actualEvents);

    const options: ValidationOptions = {
      compareStructureOnly: true,
    };

    const result = TraceValidator.validate(actual, expected, 'golden-1', options);

    expect(result.status).toBe('partial');
  });

  it('should validate only specified aspects', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'tool.called'),
      createEvent('evt-4', 'policy.checked'),
    ];

    const expected = createSampleTrace('run-1', events);
    const actual = createSampleTrace('run-2', [
      events[0],
      events[1],
      { ...events[2], data: { message: 'Different' } },
      events[3],
    ]);

    const options: ValidationOptions = {
      validateAspects: ['intentions'],
    };

    const result = TraceValidator.validate(actual, expected, 'golden-1', options);

    expect(result.status).toBe('pass');
  });

  it('should calculate metrics correctly', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const expected = createSampleTrace('run-1', events);
    const actual = createSampleTrace('run-2', events);

    const result = TraceValidator.validate(actual, expected, 'golden-1');

    expect(result.metrics.totalEvents.expected).toBe(3);
    expect(result.metrics.totalEvents.actual).toBe(3);
    expect(result.metrics.intentionsGenerated.expected).toBe(1);
    expect(result.metrics.intentionsGenerated.actual).toBe(1);
  });
});


