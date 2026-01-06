import { describe, it, expect } from 'vitest';
import { AdvancedEventFilterEvaluator } from '../utils/advanced-event-filter.js';
import type { Event } from '../types/events.js';
import type { AdvancedEventFilter } from '../types/advanced-event-filter.js';

describe('AdvancedEventFilterEvaluator', () => {
  const createEvent = (
    id: string,
    type: Event['type'],
    data: unknown = {},
    metadata: Record<string, unknown> = {}
  ): Event => ({
    id,
    runId: 'test-run',
    type,
    timestamp: Date.now(),
    data,
    metadata,
  });

  it('should filter by event type', () => {
    const event = createEvent('evt-1', 'intention.generated');
    const filter: AdvancedEventFilter = {
      type: 'intention.generated',
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by multiple event types', () => {
    const event = createEvent('evt-1', 'intention.generated');
    const filter: AdvancedEventFilter = {
      type: ['intention.generated', 'action.executed'],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with eq operator', () => {
    const event = createEvent('evt-1', 'tool.called', {
      tool: { name: 'calculator' },
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'tool.name',
          operator: 'eq',
          value: 'calculator',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with contains operator', () => {
    const event = createEvent('evt-1', 'action.executed', {
      message: 'Hello world',
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'message',
          operator: 'contains',
          value: 'world',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with startsWith operator', () => {
    const event = createEvent('evt-1', 'action.executed', {
      message: 'Hello world',
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'message',
          operator: 'startsWith',
          value: 'Hello',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with endsWith operator', () => {
    const event = createEvent('evt-1', 'action.executed', {
      message: 'Hello world',
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'message',
          operator: 'endsWith',
          value: 'world',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with exists operator', () => {
    const event = createEvent('evt-1', 'intention.generated', {
      intention: { type: 'action' },
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'intention.type',
          operator: 'exists',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with notExists operator', () => {
    const event = createEvent('evt-1', 'intention.generated', {
      intention: {},
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'intention.type',
          operator: 'notExists',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by data path with matches operator', () => {
    const event = createEvent('evt-1', 'action.executed', {
      message: 'Hello123',
    });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'message',
          operator: 'matches',
          regex: '^Hello\\d+$',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by metadata field', () => {
    const event = createEvent('evt-1', 'run.started', {}, { agentId: 'agent-1' });
    const filter: AdvancedEventFilter = {
      metadataFilters: [
        {
          field: 'agentId',
          operator: 'eq',
          value: 'agent-1',
        },
      ],
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should combine multiple filters with AND logic', () => {
    const event = createEvent('evt-1', 'tool.called', { tool: { name: 'calculator' } }, { agentId: 'agent-1' });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'tool.name',
          operator: 'eq',
          value: 'calculator',
        },
      ],
      metadataFilters: [
        {
          field: 'agentId',
          operator: 'eq',
          value: 'agent-1',
        },
      ],
      logic: 'and',
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should combine multiple filters with OR logic', () => {
    const event = createEvent('evt-1', 'tool.called', { tool: { name: 'calculator' } });
    const filter: AdvancedEventFilter = {
      dataFilters: [
        {
          path: 'tool.name',
          operator: 'eq',
          value: 'calculator',
        },
        {
          path: 'tool.name',
          operator: 'eq',
          value: 'other',
        },
      ],
      logic: 'or',
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should invert result with not operator', () => {
    const event = createEvent('evt-1', 'intention.generated');
    const filter: AdvancedEventFilter = {
      type: 'action.executed',
      not: true,
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });

  it('should filter by timestamp range', () => {
    const now = Date.now();
    const event = createEvent('evt-1', 'run.started');
    event.timestamp = now;

    const filter: AdvancedEventFilter = {
      since: now - 1000,
      until: now + 1000,
    };

    expect(AdvancedEventFilterEvaluator.evaluate(event, filter)).toBe(true);
  });
});


