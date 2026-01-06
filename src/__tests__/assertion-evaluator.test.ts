import { describe, it, expect } from 'vitest';
import { AssertionEvaluator } from '../utils/assertion-evaluator.js';
import type { Assertion, AssertionCondition } from '../types/assertion.js';
import type { Event } from '../types/events.js';

describe('AssertionEvaluator', () => {
  const createEvent = (id: string, type: Event['type'], data: unknown = {}): Event => ({
    id,
    runId: 'test-run',
    type,
    timestamp: Date.now(),
    data,
  });

  const createAssertion = (condition: AssertionCondition): Assertion => ({
    id: 'assertion-1',
    name: 'Test Assertion',
    condition,
    createdAt: Date.now(),
  });

  it('should evaluate event_present assertion - pass', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const assertion = createAssertion({
      type: 'event_present',
      eventType: 'intention.generated',
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
    expect(result.message).toContain('intention.generated');
  });

  it('should evaluate event_present assertion - fail', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
    ];

    const assertion = createAssertion({
      type: 'event_present',
      eventType: 'intention.generated',
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('fail');
    expect(result.message).toContain('not found');
  });

  it('should evaluate event_absent assertion - pass', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
    ];

    const assertion = createAssertion({
      type: 'event_absent',
      eventType: 'intention.generated',
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
  });

  it('should evaluate event_absent assertion - fail', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
    ];

    const assertion = createAssertion({
      type: 'event_absent',
      eventType: 'intention.generated',
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('fail');
  });

  it('should evaluate event_order assertion - pass', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const assertion = createAssertion({
      type: 'event_order',
      beforeEventType: 'intention.generated',
      afterEventType: 'action.executed',
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
  });

  it('should evaluate event_order assertion - fail', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'action.executed'),
      createEvent('evt-3', 'intention.generated'),
    ];

    const assertion = createAssertion({
      type: 'event_order',
      beforeEventType: 'intention.generated',
      afterEventType: 'action.executed',
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('fail');
  });

  it('should evaluate event_count assertion - exact count', () => {
    const events = [
      createEvent('evt-1', 'intention.generated'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'action.executed'),
    ];

    const assertion = createAssertion({
      type: 'event_count',
      eventType: 'intention.generated',
      count: 2,
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
  });

  it('should evaluate event_count assertion - min/max', () => {
    const events = [
      createEvent('evt-1', 'intention.generated'),
      createEvent('evt-2', 'intention.generated'),
      createEvent('evt-3', 'intention.generated'),
    ];

    const assertion = createAssertion({
      type: 'event_count',
      eventType: 'intention.generated',
      minCount: 2,
      maxCount: 5,
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
  });

  it('should evaluate event_value assertion - pass', () => {
    const events = [
      createEvent('evt-1', 'action.executed', { status: 'success', duration: 100 }),
    ];

    const assertion = createAssertion({
      type: 'event_value',
      eventType: 'action.executed',
      valuePath: 'status',
      valueMatcher: {
        operator: 'eq',
        value: 'success',
      },
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
  });

  it('should evaluate event_value assertion - fail', () => {
    const events = [
      createEvent('evt-1', 'action.executed', { status: 'failed', duration: 100 }),
    ];

    const assertion = createAssertion({
      type: 'event_value',
      eventType: 'action.executed',
      valuePath: 'status',
      valueMatcher: {
        operator: 'eq',
        value: 'success',
      },
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('fail');
  });

  it('should evaluate custom assertion', () => {
    const events = [
      createEvent('evt-1', 'run.started'),
      createEvent('evt-2', 'intention.generated'),
    ];

    const assertion = createAssertion({
      type: 'custom',
      customEvaluator: (evts) => evts.length >= 2,
    });

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('pass');
  });

  it('should handle evaluation errors', () => {
    const events: Event[] = [];

    const assertion = createAssertion({
      type: 'event_present',
      // Missing required eventType
    } as AssertionCondition);

    const result = AssertionEvaluator.evaluate(assertion, events);

    expect(result.status).toBe('error');
    expect(result.message).toBeDefined();
  });
});


