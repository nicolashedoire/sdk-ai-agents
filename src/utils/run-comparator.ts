import type { Trace } from '../types/sdk.js';
import type { Event, EventType } from '../types/events.js';
import type {
  ComparisonOptions,
  RunComparison,
  ComparisonDifference,
} from '../types/comparison.js';
import { alignEvents, firstDifference, VOLATILE_EVENT_FIELDS } from './event-alignment.js';
import { describeEvent } from './trace-validator.js';

export class RunComparator {
  static compare(trace1: Trace, trace2: Trace, options: ComparisonOptions = {}): RunComparison {
    const filteredEvents1 = RunComparator.filterEvents(trace1.events, options);
    const filteredEvents2 = RunComparator.filterEvents(trace2.events, options);

    const metrics = RunComparator.calculateMetrics(trace1, trace2);
    const differences = RunComparator.findDifferences(filteredEvents1, filteredEvents2, options);
    const summary = RunComparator.generateSummary(differences);

    return {
      runId1: trace1.runId,
      runId2: trace2.runId,
      metrics,
      differences,
      summary,
    };
  }

  private static filterEvents(events: Event[], options: ComparisonOptions): Event[] {
    let filtered = [...events];

    const ignored = options.ignoreEventTypes;
    if (ignored && ignored.length > 0) {
      filtered = filtered.filter((e) => !ignored.includes(e.type));
    }

    if (options.focusAspects && options.focusAspects.length > 0) {
      const aspectTypes: EventType[] = [];
      if (options.focusAspects.includes('intentions')) {
        aspectTypes.push('intention.generated', 'intention.rejected');
      }
      if (options.focusAspects.includes('actions')) {
        aspectTypes.push('action.executing', 'action.executed', 'action.failed');
      }
      if (options.focusAspects.includes('tools')) {
        aspectTypes.push('tool.called', 'tool.failed');
      }
      if (options.focusAspects.includes('policies')) {
        aspectTypes.push('policy.checked', 'policy.violated');
      }
      filtered = filtered.filter((e) => aspectTypes.includes(e.type));
    }

    return filtered;
  }

  private static calculateMetrics(trace1: Trace, trace2: Trace): RunComparison['metrics'] {
    return {
      totalEvents: {
        run1: trace1.summary.totalEvents,
        run2: trace2.summary.totalEvents,
        diff: trace1.summary.totalEvents - trace2.summary.totalEvents,
      },
      duration: {
        run1: trace1.summary.duration,
        run2: trace2.summary.duration,
        diff: trace1.summary.duration - trace2.summary.duration,
      },
      intentionsGenerated: {
        run1: trace1.summary.intentionsGenerated,
        run2: trace2.summary.intentionsGenerated,
        diff: trace1.summary.intentionsGenerated - trace2.summary.intentionsGenerated,
      },
      actionsExecuted: {
        run1: trace1.summary.actionsExecuted,
        run2: trace2.summary.actionsExecuted,
        diff: trace1.summary.actionsExecuted - trace2.summary.actionsExecuted,
      },
      toolsCalled: {
        run1: trace1.summary.toolsCalled,
        run2: trace2.summary.toolsCalled,
        diff: trace1.summary.toolsCalled - trace2.summary.toolsCalled,
      },
    };
  }

  /** Aligns the two runs by what their events mean (see `alignEvents`), never by event id. */
  private static findDifferences(
    events1: Event[],
    events2: Event[],
    options: ComparisonOptions
  ): ComparisonDifference[] {
    const differences: ComparisonDifference[] = [];
    const ignored = new Set(VOLATILE_EVENT_FIELDS);

    for (const step of alignEvents(events1, events2)) {
      switch (step.kind) {
        case 'removed':
          differences.push({
            type: 'event_removed',
            eventId: step.expected.id,
            eventType: step.expected.type,
            run1: step.expected,
            details: `${describeEvent(step.expected)} present in run1 (position ${step.expectedIndex}) but not in run2`,
            severity: RunComparator.determineSeverity(step.expected.type, 'removed'),
          });
          break;
        case 'added':
          differences.push({
            type: 'event_added',
            eventId: step.actual.id,
            eventType: step.actual.type,
            run2: step.actual,
            details: `${describeEvent(step.actual)} present in run2 (position ${step.actualIndex}) but not in run1`,
            severity: RunComparator.determineSeverity(step.actual.type, 'added'),
          });
          break;
        case 'moved':
          differences.push({
            type: 'sequence_changed',
            eventId: step.expected.id,
            eventType: step.expected.type,
            run1: step.expected,
            run2: step.actual,
            details: `${describeEvent(step.expected)} moved from position ${step.expectedIndex} to ${step.actualIndex}`,
            severity: 'medium',
          });
          break;
        case 'changed':
          if (step.typeChanged) {
            differences.push({
              type: 'event_modified',
              eventId: step.expected.id,
              eventType: step.expected.type,
              run1: step.expected,
              run2: step.actual,
              details: `Event type changed at position ${step.expectedIndex}: ${step.detail}`,
              severity: 'high',
            });
          } else if (!options.compareStructureOnly) {
            differences.push({
              type: 'data_changed',
              eventId: step.expected.id,
              eventType: step.expected.type,
              run1: step.expected,
              run2: step.actual,
              details: `${describeEvent(step.expected)} data differs: ${step.detail}`,
              severity: RunComparator.determineSeverity(step.expected.type, 'modified'),
            });
          }
          break;
        case 'same': {
          const metadataDiff = options.includeMetadata
            ? firstDifference(
                withoutVolatile(step.expected.metadata, ignored),
                withoutVolatile(step.actual.metadata, ignored)
              )
            : null;
          if (metadataDiff) {
            differences.push({
              type: 'data_changed',
              eventId: step.expected.id,
              eventType: step.expected.type,
              run1: step.expected,
              run2: step.actual,
              details: `${describeEvent(step.expected)} metadata differs: ${metadataDiff}`,
              severity: 'low',
            });
          }
          break;
        }
      }
    }

    return differences;
  }

  private static determineSeverity(
    eventType: EventType,
    changeType: 'added' | 'removed' | 'modified'
  ): 'low' | 'medium' | 'high' {
    const criticalTypes: EventType[] = [
      'run.failed',
      'action.failed',
      'tool.failed',
      'policy.violated',
      'error.occurred',
    ];

    if (criticalTypes.includes(eventType)) {
      return 'high';
    }

    if (changeType === 'removed' && eventType.startsWith('action.')) {
      return 'high';
    }

    if (eventType.startsWith('intention.') || eventType.startsWith('action.')) {
      return 'medium';
    }

    return 'low';
  }

  private static generateSummary(differences: ComparisonDifference[]): RunComparison['summary'] {
    const criticalDifferences = differences.filter((d) => d.severity === 'high').length;
    const mainDifferences = differences
      .slice(0, 5)
      .map((d) => d.details)
      .filter((d) => d.length < 100);

    return {
      totalDifferences: differences.length,
      criticalDifferences,
      mainDifferences,
    };
  }
}

/** Metadata without its volatile fields (the agent id is new in every process). */
function withoutVolatile(
  metadata: Event['metadata'],
  ignored: ReadonlySet<string>
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter(([key]) => !ignored.has(key)));
}
