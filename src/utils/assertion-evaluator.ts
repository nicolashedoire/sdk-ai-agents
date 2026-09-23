import type { Event } from '../types/events.js';
import type { Assertion, AssertionCondition, AssertionResult } from '../types/assertion.js';

export class AssertionEvaluator {
  static evaluate(assertion: Assertion, events: Event[]): AssertionResult {
    try {
      const result = AssertionEvaluator.evaluateCondition(assertion.condition, events);
      const status: AssertionResult['status'] = result.passed ? 'pass' : 'fail';

      return {
        assertionId: assertion.id,
        assertionName: assertion.name,
        status,
        message: result.message,
        details: result.details,
        evaluatedAt: Date.now(),
      };
    } catch (error) {
      return {
        assertionId: assertion.id,
        assertionName: assertion.name,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error during evaluation',
        evaluatedAt: Date.now(),
      };
    }
  }

  private static evaluateCondition(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    switch (condition.type) {
      case 'event_present':
        return AssertionEvaluator.evaluateEventPresent(condition, events);
      case 'event_absent':
        return AssertionEvaluator.evaluateEventAbsent(condition, events);
      case 'event_order':
        return AssertionEvaluator.evaluateEventOrder(condition, events);
      case 'event_count':
        return AssertionEvaluator.evaluateEventCount(condition, events);
      case 'event_value':
        return AssertionEvaluator.evaluateEventValue(condition, events);
      case 'custom':
        return AssertionEvaluator.evaluateCustom(condition, events);
      default:
        throw new Error(`Unknown assertion type: ${(condition as AssertionCondition).type}`);
    }
  }

  private static evaluateEventPresent(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    if (!condition.eventType && !condition.eventTypes) {
      throw new Error('event_present requires eventType or eventTypes');
    }

    const targetTypes = condition.eventTypes || (condition.eventType ? [condition.eventType] : []);
    const foundEvents = events.filter((e) => targetTypes.includes(e.type));

    if (foundEvents.length === 0) {
      return {
        passed: false,
        message: `Expected event type(s) ${targetTypes.join(', ')} not found`,
        details: { expectedTypes: targetTypes, foundCount: 0 },
      };
    }

    return {
      passed: true,
      message: `Event type(s) ${targetTypes.join(', ')} found`,
      details: { expectedTypes: targetTypes, foundCount: foundEvents.length },
    };
  }

  private static evaluateEventAbsent(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    if (!condition.eventType && !condition.eventTypes) {
      throw new Error('event_absent requires eventType or eventTypes');
    }

    const targetTypes = condition.eventTypes || (condition.eventType ? [condition.eventType] : []);
    const foundEvents = events.filter((e) => targetTypes.includes(e.type));

    if (foundEvents.length > 0) {
      return {
        passed: false,
        message: `Event type(s) ${targetTypes.join(', ')} should not be present but found ${foundEvents.length} occurrence(s)`,
        details: { expectedTypes: targetTypes, foundCount: foundEvents.length },
      };
    }

    return {
      passed: true,
      message: `Event type(s) ${targetTypes.join(', ')} correctly absent`,
      details: { expectedTypes: targetTypes, foundCount: 0 },
    };
  }

  private static evaluateEventOrder(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    if (!condition.beforeEventType || !condition.afterEventType) {
      throw new Error('event_order requires both beforeEventType and afterEventType');
    }

    const beforeIndex = events.findIndex((e) => e.type === condition.beforeEventType);
    const afterIndex = events.findIndex((e) => e.type === condition.afterEventType);

    if (beforeIndex === -1) {
      return {
        passed: false,
        message: `Before event type ${condition.beforeEventType} not found`,
        details: {
          beforeEventType: condition.beforeEventType,
          afterEventType: condition.afterEventType,
        },
      };
    }

    if (afterIndex === -1) {
      return {
        passed: false,
        message: `After event type ${condition.afterEventType} not found`,
        details: {
          beforeEventType: condition.beforeEventType,
          afterEventType: condition.afterEventType,
        },
      };
    }

    if (beforeIndex >= afterIndex) {
      return {
        passed: false,
        message: `Event ${condition.beforeEventType} (index ${beforeIndex}) should come before ${condition.afterEventType} (index ${afterIndex})`,
        details: {
          beforeEventType: condition.beforeEventType,
          afterEventType: condition.afterEventType,
          beforeIndex,
          afterIndex,
        },
      };
    }

    return {
      passed: true,
      message: `Event order is correct: ${condition.beforeEventType} before ${condition.afterEventType}`,
      details: {
        beforeEventType: condition.beforeEventType,
        afterEventType: condition.afterEventType,
        beforeIndex,
        afterIndex,
      },
    };
  }

  private static evaluateEventCount(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    if (!condition.eventType && !condition.eventTypes) {
      throw new Error('event_count requires eventType or eventTypes');
    }

    const targetTypes = condition.eventTypes || (condition.eventType ? [condition.eventType] : []);
    const foundCount = events.filter((e) => targetTypes.includes(e.type)).length;

    if (condition.count !== undefined) {
      if (foundCount !== condition.count) {
        return {
          passed: false,
          message: `Expected ${condition.count} occurrence(s) of ${targetTypes.join(', ')}, found ${foundCount}`,
          details: { expectedCount: condition.count, foundCount, eventTypes: targetTypes },
        };
      }
      return {
        passed: true,
        message: `Found expected count: ${condition.count} occurrence(s) of ${targetTypes.join(', ')}`,
        details: { expectedCount: condition.count, foundCount, eventTypes: targetTypes },
      };
    }

    if (condition.minCount !== undefined && foundCount < condition.minCount) {
      return {
        passed: false,
        message: `Expected at least ${condition.minCount} occurrence(s) of ${targetTypes.join(', ')}, found ${foundCount}`,
        details: { minCount: condition.minCount, foundCount, eventTypes: targetTypes },
      };
    }

    if (condition.maxCount !== undefined && foundCount > condition.maxCount) {
      return {
        passed: false,
        message: `Expected at most ${condition.maxCount} occurrence(s) of ${targetTypes.join(', ')}, found ${foundCount}`,
        details: { maxCount: condition.maxCount, foundCount, eventTypes: targetTypes },
      };
    }

    return {
      passed: true,
      message: 'Event count is within expected range',
      details: {
        foundCount,
        eventTypes: targetTypes,
        minCount: condition.minCount,
        maxCount: condition.maxCount,
      },
    };
  }

  private static evaluateEventValue(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    if (!condition.eventType || !condition.valuePath || !condition.valueMatcher) {
      throw new Error('event_value requires eventType, valuePath, and valueMatcher');
    }

    const matchingEvents = events.filter((e) => e.type === condition.eventType);
    if (matchingEvents.length === 0) {
      return {
        passed: false,
        message: `No events of type ${condition.eventType} found to evaluate value`,
        details: { eventType: condition.eventType, valuePath: condition.valuePath },
      };
    }

    const failedEvents: Array<{ eventId: string; value: unknown }> = [];

    for (const event of matchingEvents) {
      const value = AssertionEvaluator.getNestedValue(event.data, condition.valuePath);
      const matches = AssertionEvaluator.matchValue(value, condition.valueMatcher);

      if (!matches) {
        failedEvents.push({ eventId: event.id, value });
      }
    }

    if (failedEvents.length > 0) {
      return {
        passed: false,
        message: `${failedEvents.length} event(s) failed value matching`,
        details: {
          eventType: condition.eventType,
          valuePath: condition.valuePath,
          failedEvents,
          matcher: condition.valueMatcher,
        },
      };
    }

    return {
      passed: true,
      message: 'All events match value condition',
      details: {
        eventType: condition.eventType,
        valuePath: condition.valuePath,
        matchedCount: matchingEvents.length,
        matcher: condition.valueMatcher,
      },
    };
  }

  private static evaluateCustom(
    condition: AssertionCondition,
    events: Event[]
  ): { passed: boolean; message?: string; details?: Record<string, unknown> } {
    if (!condition.customEvaluator) {
      throw new Error('custom assertion requires customEvaluator function');
    }

    try {
      const result = condition.customEvaluator(events);
      return {
        passed: result,
        message: result ? 'Custom assertion passed' : 'Custom assertion failed',
        details: { customEvaluator: 'custom' },
      };
    } catch (error) {
      throw new Error(
        `Custom evaluator error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private static getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private static matchValue(value: unknown, matcher: AssertionCondition['valueMatcher']): boolean {
    if (!matcher) return false;

    switch (matcher.operator) {
      case 'eq':
        return value === matcher.value;
      case 'ne':
        return value !== matcher.value;
      case 'gt':
        return (
          typeof value === 'number' && typeof matcher.value === 'number' && value > matcher.value
        );
      case 'gte':
        return (
          typeof value === 'number' && typeof matcher.value === 'number' && value >= matcher.value
        );
      case 'lt':
        return (
          typeof value === 'number' && typeof matcher.value === 'number' && value < matcher.value
        );
      case 'lte':
        return (
          typeof value === 'number' && typeof matcher.value === 'number' && value <= matcher.value
        );
      case 'contains':
        return (
          typeof value === 'string' &&
          typeof matcher.value === 'string' &&
          value.includes(matcher.value)
        );
      case 'regex':
        if (typeof value !== 'string' || typeof matcher.value !== 'string') return false;
        try {
          const regex = new RegExp(matcher.value);
          return regex.test(value);
        } catch {
          return false;
        }
      default:
        return false;
    }
  }
}
