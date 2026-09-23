import type { Trace } from '../types/sdk.js';
import type { Event, EventType } from '../types/events.js';
import type {
  ComparisonOptions,
  RunComparison,
  ComparisonDifference,
} from '../types/comparison.js';

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

  private static findDifferences(
    events1: Event[],
    events2: Event[],
    options: ComparisonOptions
  ): ComparisonDifference[] {
    const differences: ComparisonDifference[] = [];

    const eventMap1 = new Map<string, Event>();
    events1.forEach((e) => eventMap1.set(e.id, e));

    const eventMap2 = new Map<string, Event>();
    events2.forEach((e) => eventMap2.set(e.id, e));

    for (const event1 of events1) {
      const event2 = eventMap2.get(event1.id);
      if (!event2) {
        differences.push({
          type: 'event_removed',
          eventId: event1.id,
          eventType: event1.type,
          run1: event1,
          details: `Event ${event1.id} (${event1.type}) present in run1 but not in run2`,
          severity: RunComparator.determineSeverity(event1.type, 'removed'),
        });
      } else {
        const diff = RunComparator.compareEventData(event1, event2, options);
        if (diff) {
          differences.push(diff);
        }
        eventMap2.delete(event1.id);
      }
    }

    for (const event2 of eventMap2.values()) {
      differences.push({
        type: 'event_added',
        eventId: event2.id,
        eventType: event2.type,
        run2: event2,
        details: `Event ${event2.id} (${event2.type}) present in run2 but not in run1`,
        severity: RunComparator.determineSeverity(event2.type, 'added'),
      });
    }

    const sequenceDiff = RunComparator.checkSequence(events1, events2);
    if (sequenceDiff) {
      differences.push(sequenceDiff);
    }

    return differences;
  }

  private static compareEventData(
    event1: Event,
    event2: Event,
    options: ComparisonOptions
  ): ComparisonDifference | null {
    if (options.compareStructureOnly) {
      if (event1.type !== event2.type) {
        return {
          type: 'event_modified',
          eventId: event1.id,
          eventType: event1.type,
          run1: event1,
          run2: event2,
          details: `Event ${event1.id} type changed from ${event1.type} to ${event2.type}`,
          severity: 'high',
        };
      }
      return null;
    }

    const dataDiff = RunComparator.compareData(event1.data, event2.data);
    if (dataDiff) {
      return {
        type: 'data_changed',
        eventId: event1.id,
        eventType: event1.type,
        run1: event1,
        run2: event2,
        details: `Event ${event1.id} data differs: ${dataDiff}`,
        severity: RunComparator.determineSeverity(event1.type, 'modified'),
      };
    }

    if (options.includeMetadata) {
      const metadataDiff = RunComparator.compareData(event1.metadata, event2.metadata);
      if (metadataDiff) {
        return {
          type: 'data_changed',
          eventId: event1.id,
          eventType: event1.type,
          run1: event1,
          run2: event2,
          details: `Event ${event1.id} metadata differs: ${metadataDiff}`,
          severity: 'low',
        };
      }
    }

    return null;
  }

  private static compareData(data1: unknown, data2: unknown): string | null {
    if (data1 === data2) return null;
    if (data1 === null || data2 === null) {
      return `null vs ${data2 === null ? 'null' : 'value'}`;
    }
    if (typeof data1 !== typeof data2) {
      return `type mismatch: ${typeof data1} vs ${typeof data2}`;
    }
    if (typeof data1 === 'object') {
      const str1 = JSON.stringify(data1);
      const str2 = JSON.stringify(data2);
      if (str1 !== str2) {
        return 'object content differs';
      }
    }
    return null;
  }

  private static checkSequence(events1: Event[], events2: Event[]): ComparisonDifference | null {
    const order1 = events1.map((e) => e.id);
    const order2 = events2.map((e) => e.id);

    const commonIds = order1.filter((id) => order2.includes(id));
    if (commonIds.length === 0) return null;

    const order1Filtered = order1.filter((id) => commonIds.includes(id));
    const order2Filtered = order2.filter((id) => commonIds.includes(id));

    if (JSON.stringify(order1Filtered) !== JSON.stringify(order2Filtered)) {
      return {
        type: 'sequence_changed',
        details: 'Event sequence differs between runs',
        severity: 'medium',
      };
    }

    return null;
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
