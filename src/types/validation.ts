import type { Event, EventType } from './events.js';

export interface ValidationOptions {
  ignoreEventTypes?: EventType[];
  ignoreTimestampDiff?: boolean;
  compareStructureOnly?: boolean;
  validateAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  tolerance?: {
    timestampMs?: number;
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
  eventId?: string;
  eventType?: EventType;
  expected?: Event;
  actual?: Event;
  details: string;
}

