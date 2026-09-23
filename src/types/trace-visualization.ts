import type { Event } from './events.js';

export type EventGroupType =
  | 'run_lifecycle'
  | 'reasoning_cycle'
  | 'tool_execution'
  | 'policy_check'
  | 'approval_workflow'
  | 'error';

export interface EventGroup {
  id: string;
  type: EventGroupType;
  label: string;
  startTime: number;
  endTime: number;
  duration: number;
  events: Event[];
  metadata?: {
    toolName?: string;
    policyId?: string;
    intentionType?: string;
    status?: string;
  };
}

export interface TraceVisualization {
  runId: string;
  agentId?: string;
  status: string;
  timeRange: {
    start: number;
    end: number;
    duration: number;
  };
  groups: EventGroup[];
  flatTimeline: Array<{
    id: string;
    timestamp: number;
    type: string;
    description: string;
    groupId?: string;
    event?: Event;
  }>;
  summary: {
    totalEvents: number;
    totalGroups: number;
    groupsByType: Record<EventGroupType, number>;
    keyMetrics: {
      intentionsGenerated: number;
      actionsExecuted: number;
      toolsCalled: number;
      policiesChecked: number;
      approvalsRequested: number;
      errors: number;
    };
  };
}
