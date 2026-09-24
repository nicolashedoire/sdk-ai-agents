import type { Event, EventType } from './events.js';

export interface ComparisonOptions {
  /** Event types left out of the comparison. */
  ignoreEventTypes?: EventType[];
  /** Only events added, removed, moved or whose type changed: data changes are not reported. */
  compareStructureOnly?: boolean;
  /** Compares only these kinds of events. */
  focusAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  /** Also compares event metadata (ids and other volatile fields excepted). */
  includeMetadata?: boolean;
  /** @deprecated Has no effect. */
  groupSimilarEvents?: boolean;
}

export interface RunComparison {
  runId1: string;
  runId2: string;
  metrics: {
    totalEvents: { run1: number; run2: number; diff: number };
    duration: { run1: number; run2: number; diff: number };
    intentionsGenerated: { run1: number; run2: number; diff: number };
    actionsExecuted: { run1: number; run2: number; diff: number };
    toolsCalled: { run1: number; run2: number; diff: number };
  };
  differences: ComparisonDifference[];
  summary: {
    totalDifferences: number;
    criticalDifferences: number;
    mainDifferences: string[];
  };
}

export interface ComparisonDifference {
  type: 'event_added' | 'event_removed' | 'event_modified' | 'sequence_changed' | 'data_changed';
  eventId?: string;
  eventType?: EventType;
  run1?: Event;
  run2?: Event;
  details: string;
  severity?: 'low' | 'medium' | 'high';
}
