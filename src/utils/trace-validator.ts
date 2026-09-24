import type { Trace } from '../types/sdk.js';
import type { Event, EventType } from '../types/events.js';
import type {
  ValidationOptions,
  ValidationResult,
  ValidationDifference,
} from '../types/validation.js';
import { alignEvents, comparedEvents, eventSubject } from './event-alignment.js';

/** What a comparison found, before it is turned into a verdict. */
export interface TraceComparison {
  differences: ValidationDifference[];
  /** Compared events of each run (after `ignoreEventTypes` and `validateAspects`). */
  expectedCount: number;
  actualCount: number;
  /** Golden events found unchanged, at their place. */
  unchanged: number;
  /** Differences in the data of paired events, the only ones a structure-only check lowers. */
  dataChanges: number;
}

/**
 * Compares a run with a golden trace by what the events mean (see `alignEvents`): event ids,
 * new in every run, are never compared, nor are clock readings and token counts.
 */
export class TraceValidator {
  static validate(
    actualTrace: Trace,
    expectedTrace: Trace,
    goldenTraceId: string,
    options: ValidationOptions = {}
  ): ValidationResult {
    const comparison = TraceValidator.compare(actualTrace, expectedTrace, options);
    const { differences } = comparison;
    const metrics = TraceValidator.calculateMetrics(expectedTrace, actualTrace);
    const status = TraceValidator.determineStatus(comparison, options);
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

  static compare(
    actualTrace: Trace,
    expectedTrace: Trace,
    options: ValidationOptions = {}
  ): TraceComparison {
    const expectedEvents = TraceValidator.filterEvents(expectedTrace.events, options);
    const actualEvents = TraceValidator.filterEvents(actualTrace.events, options);
    const aligned = alignEvents(expectedEvents, actualEvents, {
      ignoredFields: options.tolerance?.dataFields ?? [],
    });
    const timing = TraceValidator.timing(expectedTrace, actualTrace, options);
    const differences: ValidationDifference[] = [];
    let unchanged = 0;
    let dataChanges = 0;

    for (const step of aligned) {
      switch (step.kind) {
        case 'removed':
          differences.push({
            type: 'event_removed',
            eventId: step.expected.id,
            eventType: step.expected.type,
            expected: step.expected,
            expectedIndex: step.expectedIndex,
            details: `${describeEvent(step.expected)} was expected at position ${step.expectedIndex} but is missing`,
          });
          break;
        case 'added':
          differences.push({
            type: 'event_added',
            eventId: step.actual.id,
            eventType: step.actual.type,
            actual: step.actual,
            actualIndex: step.actualIndex,
            details: `${describeEvent(step.actual)} was added at position ${step.actualIndex}`,
          });
          break;
        case 'moved':
          differences.push({
            type: 'event_order_changed',
            eventId: step.expected.id,
            eventType: step.expected.type,
            expected: step.expected,
            actual: step.actual,
            expectedIndex: step.expectedIndex,
            actualIndex: step.actualIndex,
            details: `${describeEvent(step.expected)} moved from position ${step.expectedIndex} to ${step.actualIndex}`,
          });
          break;
        case 'changed':
          if (!step.typeChanged) dataChanges++;
          differences.push({
            type: 'event_modified',
            eventId: step.expected.id,
            eventType: step.expected.type,
            expected: step.expected,
            actual: step.actual,
            expectedIndex: step.expectedIndex,
            actualIndex: step.actualIndex,
            details: step.typeChanged
              ? `Event type changed at position ${step.expectedIndex}: ${step.detail}`
              : options.compareStructureOnly
                ? `${describeEvent(step.expected)} data differs (structure-only comparison): ${step.detail}`
                : `${describeEvent(step.expected)} data differs: ${step.detail}`,
          });
          break;
        case 'same': {
          const late = timing?.(step.expected, step.actual);
          if (late) {
            differences.push({
              type: 'event_modified',
              eventId: step.expected.id,
              eventType: step.expected.type,
              expected: step.expected,
              actual: step.actual,
              expectedIndex: step.expectedIndex,
              actualIndex: step.actualIndex,
              details: `${describeEvent(step.expected)} ${late}`,
            });
          } else {
            unchanged++;
          }
          break;
        }
      }
    }

    return {
      differences,
      expectedCount: expectedEvents.length,
      actualCount: actualEvents.length,
      unchanged,
      dataChanges,
    };
  }

  /**
   * With `tolerance.timestampMs`, compares when two events happened relative to the start of
   * their runs (absolute times always differ between runs). Returns what is wrong, if anything.
   */
  private static timing(
    expectedTrace: Trace,
    actualTrace: Trace,
    options: ValidationOptions
  ): ((expected: Event, actual: Event) => string | undefined) | undefined {
    const tolerance = options.tolerance?.timestampMs;
    if (options.ignoreTimestampDiff || tolerance === undefined) return undefined;
    const expectedStart = expectedTrace.events[0]?.timestamp ?? 0;
    const actualStart = actualTrace.events[0]?.timestamp ?? 0;
    return (expected, actual) => {
      const expectedOffset = expected.timestamp - expectedStart;
      const actualOffset = actual.timestamp - actualStart;
      const gap = Math.abs(actualOffset - expectedOffset);
      return gap > tolerance
        ? `happened ${actualOffset} ms after the start instead of ${expectedOffset} ms (tolerance: ${tolerance} ms)`
        : undefined;
    };
  }

  private static filterEvents(events: Event[], options: ValidationOptions): Event[] {
    let filtered = comparedEvents(events);

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

  /**
   * `pass` without differences; `partial` when a structure-only comparison found nothing but
   * data differences; `fail` otherwise (events added, removed, moved or of another type, data
   * differences, timing beyond its tolerance).
   */
  private static determineStatus(
    comparison: TraceComparison,
    options: ValidationOptions
  ): 'pass' | 'fail' | 'partial' {
    if (comparison.differences.length === 0) return 'pass';
    return options.compareStructureOnly && comparison.dataChanges === comparison.differences.length
      ? 'partial'
      : 'fail';
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

/** `tool.called (lookup_metric)`: the type and, when it has one, what the event is about. */
export function describeEvent(event: Event): string {
  const subject = eventSubject(event);
  return subject ? `${event.type} (${subject})` : event.type;
}
