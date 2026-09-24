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
  /**
   * `custom` only: receives the run's events. A function cannot be written to a file: a
   * custom assertion is kept by the SDK instance that defined it, not in `assertionsDir`.
   */
  customEvaluator?: (events: Event[]) => boolean;
}

export interface AssertionOptions {
  description?: string;
  severity?: 'error' | 'warning';
  tags?: string[];
  /**
   * The assertion applies to this agent's runs only. An agent of this SDK also gives its name,
   * so the assertion keeps applying to the agent of that name in another process.
   */
  agentId?: string;
  /** The assertion applies to the runs of the governed agents with this name. */
  agentName?: string;
}

export interface Assertion {
  id: string;
  name: string;
  description?: string;
  condition: AssertionCondition;
  severity?: 'error' | 'warning';
  tags?: string[];
  /** With `agentName`: the agent whose runs it applies to. Neither: every run. */
  agentId?: string;
  agentName?: string;
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
