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
