export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected'
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed'
  | 'provider.fallback'
  | 'error.occurred';

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
