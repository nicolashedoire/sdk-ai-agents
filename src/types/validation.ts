import type { Event, EventType } from './events.js';

export interface ValidationOptions {
  /** Event types left out of the comparison. */
  ignoreEventTypes?: EventType[];
  /** Never compares timing, even with `tolerance.timestampMs`. */
  ignoreTimestampDiff?: boolean;
  /** Data differences still count, but only as `partial`, not `fail`. */
  compareStructureOnly?: boolean;
  /** Compares only these kinds of events. */
  validateAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  tolerance?: {
    /**
     * Compares when each event happened, relative to the start of its run: a gap larger than
     * this many ms is a difference. Without it, timing is not compared.
     */
    timestampMs?: number;
    /** Keys of event data left out of the comparison, at any depth. */
    dataFields?: string[];
  };
}

export interface ValidationResult {
  status: 'pass' | 'fail' | 'partial';
  goldenTraceId: string;
  runId: string;
  differences: ValidationDifference[];
  metrics: {
    totalEvents: { expected: number; actual: number };
    duration: { expected: number; actual: number };
    intentionsGenerated: { expected: number; actual: number };
    actionsExecuted: { expected: number; actual: number };
  };
  summary: string;
}

export interface ValidationDifference {
  type: 'event_added' | 'event_removed' | 'event_modified' | 'event_order_changed';
  /** Id of the golden event (of the new one for `event_added`). */
  eventId?: string;
  eventType?: EventType;
  expected?: Event;
  actual?: Event;
  /** Position of the event among the compared events of each run. */
  expectedIndex?: number;
  actualIndex?: number;
  details: string;
}
