import type { Event, EventType } from './events.js';

export type AssertionType =
  | 'event_present'
  | 'event_absent'
  | 'event_order'
  | 'event_count'
  | 'event_value'
  | 'custom';

export interface AssertionCondition {
  type: AssertionType;
  eventType?: EventType;
  eventTypes?: EventType[];
  count?: number;
  minCount?: number;
  maxCount?: number;
  beforeEventType?: EventType;
  afterEventType?: EventType;
  valuePath?: string;
  valueMatcher?: {
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
    value: unknown;
  };
  customEvaluator?: (events: Event[]) => boolean;
}

export interface Assertion {
  id: string;
  name: string;
  description?: string;
  condition: AssertionCondition;
  severity?: 'error' | 'warning';
  tags?: string[];
  agentId?: string;
  createdAt: number;
}

export interface AssertionResult {
  assertionId: string;
  assertionName: string;
  status: 'pass' | 'fail' | 'error';
  message?: string;
  details?: Record<string, unknown>;
  evaluatedAt: number;
}

export interface AssertionEvaluationReport {
  runId: string;
  evaluatedAt: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  errorAssertions: number;
  results: AssertionResult[];
}


