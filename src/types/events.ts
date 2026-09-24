export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Every event type a trace can hold. Three are never recorded by the SDK and stay for events
 * appended by your own code: `intention.rejected` (a call refused by a policy, the allowlist or
 * a budget is `policy.violated`, one rejected at approval `approval.rejected`, one with invalid
 * arguments `action.failed`), `tool.failed` (a failed call is `action.failed`) and
 * `error.occurred`.
 */
export type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';

export interface EventMetadata {
  agentId?: string;
  agentVersion?: string;
  userId?: string;
  sessionId?: string;
  [key: string]: unknown;
}

export interface Event {
  id: string;
  runId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: EventMetadata;
}

/**
 * Receives live events (`RunInput.onEvent`, `ThinkInput.onEvent`, `sdk.subscribe`), one at a
 * time: when it returns a promise, its next event waits until that promise settles. Any other
 * value it returns is ignored.
 */
export type LiveEventListener = (event: Event) => unknown;

/** Which live events a subscriber gets. Every field given must match; none means every event. */
export interface LiveEventFilter {
  /** Events recorded for this run. */
  runId?: string;
  /** Events whose `metadata.agentId` is this agent, as with `EventFilters.agentId`. */
  agentId?: string;
  /** Events of these types. */
  types?: EventType[];
}

/** A subscription's filter, and how far its listener may fall behind. */
export interface LiveSubscriptionOptions extends LiveEventFilter {
  /**
   * Events that may wait for a listener still busy with an earlier one (an async listener).
   * Past it, new events are dropped for this listener and reported once per burst to
   * `onListenerError` (a `LiveEventsDroppedError` saying how many). Default 10 000; `Infinity`
   * never drops.
   */
  maxQueued?: number;
}

export interface EventFilters {
  type?: EventType | EventType[];
  since?: number;
  until?: number;
  limit?: number;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  dataQuery?: {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
    value?: unknown;
  };
  metadataQuery?: {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists';
    value?: unknown;
  };
}

export interface EventAggregation {
  groupBy?: 'type' | 'agentId' | 'userId' | 'sessionId' | 'day' | 'hour';
  count?: boolean;
  sum?: {
    field: string;
    path: string; // JSON path in data/metadata
  };
  avg?: {
    field: string;
    path: string;
  };
}

export interface EventQueryResult {
  events: Event[];
  aggregation?: {
    groups?: Array<{
      key: string;
      count: number;
      [key: string]: unknown;
    }>;
    total?: number;
  };
}

export interface EventLog {
  runId: string;
  agentId: string;
  version: string;
  startedAt: number;
  completedAt?: number;
  status: RunStatus;
  events: Event[];
  summary: {
    totalEvents: number;
    intentionsGenerated: number;
    actionsExecuted: number;
    policiesChecked: number;
    toolsCalled: number;
  };
}
