import type { Trace } from '../types/sdk.js';
import type { Event, EventType } from '../types/events.js';
import type {
  ValidationOptions,
  ValidationResult,
  ValidationDifference,
} from '../types/validation.js';

export class TraceValidator {
  static validate(
    actualTrace: Trace,
    expectedTrace: Trace,
    goldenTraceId: string,
    options: ValidationOptions = {}
  ): ValidationResult {
    const differences: ValidationDifference[] = [];

    const expectedEvents = TraceValidator.filterEvents(expectedTrace.events, options);
    const actualEvents = TraceValidator.filterEvents(actualTrace.events, options);

    const eventMap = new Map<string, Event>();
    expectedEvents.forEach((event) => {
      eventMap.set(event.id, event);
    });

    const actualMap = new Map<string, Event>();
    actualEvents.forEach((event) => {
      actualMap.set(event.id, event);
    });

    for (const expectedEvent of expectedEvents) {
      const actualEvent = actualMap.get(expectedEvent.id);
      if (!actualEvent) {
        differences.push({
          type: 'event_removed',
          eventId: expectedEvent.id,
          eventType: expectedEvent.type,
          expected: expectedEvent,
          details: `Event ${expectedEvent.id} (${expectedEvent.type}) was expected but not found in actual trace`,
        });
      } else {
        const diff = TraceValidator.compareEvents(expectedEvent, actualEvent, options);
        if (diff) {
          differences.push(diff);
        }
        actualMap.delete(expectedEvent.id);
      }
    }

    for (const actualEvent of actualMap.values()) {
      differences.push({
        type: 'event_added',
        eventId: actualEvent.id,
        eventType: actualEvent.type,
        actual: actualEvent,
        details: `Event ${actualEvent.id} (${actualEvent.type}) was found in actual trace but not expected`,
      });
    }

    const orderDiff = TraceValidator.checkEventOrder(expectedEvents, actualEvents, options);
    if (orderDiff) {
      differences.push(orderDiff);
    }

    const metrics = TraceValidator.calculateMetrics(expectedTrace, actualTrace);
    const status = TraceValidator.determineStatus(differences, options);
    const summary = TraceValidator.generateSummary(status, differences, metrics);

    return {
      status,
      goldenTraceId,
      runId: actualTrace.runId,
      differences,
      metrics,
      summary,
    };
  }

  private static filterEvents(events: Event[], options: ValidationOptions): Event[] {
    let filtered = [...events];

    const ignored = options.ignoreEventTypes;
    if (ignored && ignored.length > 0) {
      filtered = filtered.filter((e) => !ignored.includes(e.type));
    }

    if (options.validateAspects && options.validateAspects.length > 0) {
      const aspectTypes: EventType[] = [];
      if (options.validateAspects.includes('intentions')) {
        aspectTypes.push('intention.generated', 'intention.rejected');
      }
      if (options.validateAspects.includes('actions')) {
        aspectTypes.push('action.executed');
      }
      if (options.validateAspects.includes('tools')) {
        aspectTypes.push('tool.called', 'tool.failed');
      }
      if (options.validateAspects.includes('policies')) {
        aspectTypes.push('policy.checked', 'policy.violated');
      }
      filtered = filtered.filter((e) => aspectTypes.includes(e.type));
    }

    return filtered;
  }

  private static compareEvents(
    expected: Event,
    actual: Event,
    options: ValidationOptions
  ): ValidationDifference | null {
    if (expected.type !== actual.type) {
      return {
        type: 'event_modified',
        eventId: expected.id,
        eventType: expected.type,
        expected,
        actual,
        details: `Event type mismatch: expected ${expected.type}, got ${actual.type}`,
      };
    }

    if (!options.ignoreTimestampDiff) {
      const tolerance = options.tolerance?.timestampMs || 0;
      const timeDiff = Math.abs(expected.timestamp - actual.timestamp);
      if (timeDiff > tolerance) {
        return {
          type: 'event_modified',
          eventId: expected.id,
          eventType: expected.type,
          expected,
          actual,
          details: `Timestamp difference: ${timeDiff}ms (tolerance: ${tolerance}ms)`,
        };
      }
    }

    // In structure-only mode, value differences are still reported (and yield a `partial`
    // status) so that a run whose values changed never passes as identical.
    const dataDiff = TraceValidator.compareData(expected.data, actual.data, options);
    if (dataDiff) {
      return {
        type: 'event_modified',
        eventId: expected.id,
        eventType: expected.type,
        expected,
        actual,
        details: options.compareStructureOnly
          ? `Data differs (structure-only comparison): ${dataDiff}`
          : `Data mismatch: ${dataDiff}`,
      };
    }

    return null;
  }

  private static compareData(
    expected: unknown,
    actual: unknown,
    options: ValidationOptions
  ): string | null {
    if (expected === actual) {
      return null;
    }

    if (typeof expected !== typeof actual) {
      return `Type mismatch: expected ${typeof expected}, got ${typeof actual}`;
    }

    if (
      expected === null ||
      actual === null ||
      typeof expected !== 'object' ||
      typeof actual !== 'object'
    ) {
      return expected !== actual ? 'Value mismatch' : null;
    }

    if (Array.isArray(expected) !== Array.isArray(actual)) {
      return 'Array/Object type mismatch';
    }

    if (Array.isArray(expected) && Array.isArray(actual)) {
      if (expected.length !== actual.length) {
        return `Array length mismatch: expected ${expected.length}, got ${actual.length}`;
      }
      for (let i = 0; i < expected.length; i++) {
        const diff = TraceValidator.compareData(expected[i], actual[i], options);
        if (diff) {
          return `Array[${i}]: ${diff}`;
        }
      }
      return null;
    }

    const expectedObj = expected as Record<string, unknown>;
    const actualObj = actual as Record<string, unknown>;
    const ignoredFields = options.tolerance?.dataFields || [];

    const expectedKeys = Object.keys(expectedObj).filter((k) => !ignoredFields.includes(k));
    const actualKeys = Object.keys(actualObj).filter((k) => !ignoredFields.includes(k));

    if (expectedKeys.length !== actualKeys.length) {
      return `Object key count mismatch: expected ${expectedKeys.length}, got ${actualKeys.length}`;
    }

    for (const key of expectedKeys) {
      if (!(key in actualObj)) {
        return `Missing key: ${key}`;
      }
      const diff = TraceValidator.compareData(expectedObj[key], actualObj[key], options);
      if (diff) {
        return `${key}: ${diff}`;
      }
    }

    return null;
  }

  private static checkEventOrder(
    expected: Event[],
    actual: Event[],
    _options: ValidationOptions
  ): ValidationDifference | null {
    if (expected.length !== actual.length) {
      return null;
    }

    for (let i = 0; i < expected.length; i++) {
      if (expected[i].id !== actual[i].id) {
        return {
          type: 'event_order_changed',
          eventId: expected[i].id,
          eventType: expected[i].type,
          expected: expected[i],
          actual: actual[i],
          details: `Event order mismatch at position ${i}: expected ${expected[i].id} (${expected[i].type}), got ${actual[i].id} (${actual[i].type})`,
        };
      }
    }

    return null;
  }

  private static calculateMetrics(expectedTrace: Trace, actualTrace: Trace) {
    return {
      totalEvents: {
        expected: expectedTrace.summary.totalEvents,
        actual: actualTrace.summary.totalEvents,
      },
      duration: {
        expected: expectedTrace.summary.duration,
        actual: actualTrace.summary.duration,
      },
      intentionsGenerated: {
        expected: expectedTrace.summary.intentionsGenerated,
        actual: actualTrace.summary.intentionsGenerated,
      },
      actionsExecuted: {
        expected: expectedTrace.summary.actionsExecuted,
        actual: actualTrace.summary.actionsExecuted,
      },
    };
  }

  private static determineStatus(
    differences: ValidationDifference[],
    options: ValidationOptions
  ): 'pass' | 'fail' | 'partial' {
    if (differences.length === 0) {
      return 'pass';
    }

    const criticalDifferences = differences.filter(
      (d) => d.type === 'event_removed' || d.type === 'event_added'
    );

    if (criticalDifferences.length > 0) {
      return 'fail';
    }

    if (options.compareStructureOnly || options.ignoreTimestampDiff) {
      return 'partial';
    }

    return 'fail';
  }

  private static generateSummary(
    status: 'pass' | 'fail' | 'partial',
    differences: ValidationDifference[],
    metrics: ValidationResult['metrics']
  ): string {
    const parts: string[] = [];
    parts.push(`Validation ${status.toUpperCase()}`);

    if (differences.length > 0) {
      parts.push(`Found ${differences.length} difference(s)`);
      const byType = differences.reduce(
        (acc, d) => {
          acc[d.type] = (acc[d.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
      parts.push(
        Object.entries(byType)
          .map(([type, count]) => `${count} ${type}`)
          .join(', ')
      );
    }

    const metricDiffs: string[] = [];
    if (metrics.totalEvents.expected !== metrics.totalEvents.actual) {
      metricDiffs.push(`events: ${metrics.totalEvents.expected} → ${metrics.totalEvents.actual}`);
    }
    if (metrics.duration.expected !== metrics.duration.actual) {
      metricDiffs.push(`duration: ${metrics.duration.expected}ms → ${metrics.duration.actual}ms`);
    }
    if (metrics.intentionsGenerated.expected !== metrics.intentionsGenerated.actual) {
      metricDiffs.push(
        `intentions: ${metrics.intentionsGenerated.expected} → ${metrics.intentionsGenerated.actual}`
      );
    }
    if (metrics.actionsExecuted.expected !== metrics.actionsExecuted.actual) {
      metricDiffs.push(
        `actions: ${metrics.actionsExecuted.expected} → ${metrics.actionsExecuted.actual}`
      );
    }

    if (metricDiffs.length > 0) {
      parts.push(`Metrics: ${metricDiffs.join(', ')}`);
    }

    return parts.join('. ');
  }
}
