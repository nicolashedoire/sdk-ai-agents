import type { Event } from '../types/events.js';
import type { TraceVisualization, EventGroup, EventGroupType } from '../types/trace-visualization.js';
import { generateEventId } from './id.js';

export class TraceVisualizer {
  /**
   * Creates a visualization-ready structure from trace events.
   * Groups events logically and prepares data for interactive visualization.
   */
  static visualize(trace: {
    runId: string;
    agentId?: string;
    status: string;
    events: Event[];
  }): TraceVisualization {
    const sortedEvents = [...trace.events].sort((a, b) => a.timestamp - b.timestamp);
    
    if (sortedEvents.length === 0) {
      return this.createEmptyVisualization(trace);
    }

    const groups = this.groupEvents(sortedEvents);
    const flatTimeline = this.buildFlatTimeline(sortedEvents, groups);
    const summary = this.buildSummary(sortedEvents, groups);

    const timeRange = {
      start: sortedEvents[0].timestamp,
      end: sortedEvents[sortedEvents.length - 1].timestamp,
      duration: sortedEvents[sortedEvents.length - 1].timestamp - sortedEvents[0].timestamp,
    };

    return {
      runId: trace.runId,
      agentId: trace.agentId,
      status: trace.status,
      timeRange,
      groups,
      flatTimeline,
      summary,
    };
  }

  private static groupEvents(events: Event[]): EventGroup[] {
    const groups: EventGroup[] = [];
    let currentGroup: EventGroup | null = null;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const groupType = this.determineGroupType(event, events, i);

      if (!currentGroup || currentGroup.type !== groupType || this.shouldStartNewGroup(event, currentGroup, events, i)) {
        // Finalize current group
        if (currentGroup) {
          currentGroup.endTime = events[i - 1].timestamp;
          currentGroup.duration = currentGroup.endTime - currentGroup.startTime;
          groups.push(currentGroup);
        }

        // Start new group
        currentGroup = {
          id: `group-${generateEventId()}`,
          type: groupType,
          label: this.getGroupLabel(groupType, event),
          startTime: event.timestamp,
          endTime: event.timestamp,
          duration: 0,
          events: [event],
          metadata: this.extractGroupMetadata(groupType, event),
        };
      } else {
        // Add event to current group
        currentGroup.events.push(event);
      }
    }

    // Finalize last group
    if (currentGroup) {
      currentGroup.endTime = events[events.length - 1].timestamp;
      currentGroup.duration = currentGroup.endTime - currentGroup.startTime;
      groups.push(currentGroup);
    }

    return groups;
  }

  private static determineGroupType(event: Event, _allEvents: Event[], _index: number): EventGroupType {
    // Run lifecycle events
    if (['run.started', 'run.completed', 'run.failed', 'run.cancelled', 'run.stopped'].includes(event.type)) {
      return 'run_lifecycle';
    }

    // Error events
    if (event.type === 'error.occurred' || event.type === 'action.failed' || event.type === 'tool.failed') {
      return 'error';
    }

    // Approval workflow
    if (['approval.requested', 'approval.approved', 'approval.rejected'].includes(event.type)) {
      return 'approval_workflow';
    }

    // Policy checks
    if (event.type === 'policy.checked' || event.type === 'policy.violated') {
      return 'policy_check';
    }

    // Tool execution cycle
    if (event.type === 'tool.called' || event.type === 'action.executing') {
      return 'tool_execution';
    }

    // Reasoning cycle (intention generation and execution)
    if (event.type === 'intention.generated' || event.type === 'intention.rejected' || event.type === 'action.executed') {
      return 'reasoning_cycle';
    }

    // Default to reasoning cycle
    return 'reasoning_cycle';
  }

  private static shouldStartNewGroup(
    event: Event,
    currentGroup: EventGroup,
    allEvents: Event[],
    index: number
  ): boolean {
    // Start new group if switching to a different type
    const newGroupType = this.determineGroupType(event, allEvents, index);
    if (newGroupType !== currentGroup.type) {
      return true;
    }

    // Start new tool execution group for each new tool call
    if (currentGroup.type === 'tool_execution' && event.type === 'tool.called') {
      return currentGroup.metadata?.toolName !== (event.data.toolName as string);
    }

    // Start new reasoning cycle if there's a gap in time (> 5 seconds)
    if (currentGroup.type === 'reasoning_cycle') {
      const lastEvent = currentGroup.events[currentGroup.events.length - 1];
      if (event.timestamp - lastEvent.timestamp > 5000) {
        return true;
      }
    }

    return false;
  }

  private static getGroupLabel(type: EventGroupType, event: Event): string {
    switch (type) {
      case 'run_lifecycle':
        return `Run ${event.type.split('.')[1]}`;
      case 'tool_execution':
        return `Tool: ${(event.data.toolName as string) || 'unknown'}`;
      case 'policy_check':
        return `Policy Check: ${(event.data.rule as string) || 'unknown'}`;
      case 'approval_workflow':
        return 'Approval Workflow';
      case 'error':
        return 'Error';
      case 'reasoning_cycle':
        return 'Reasoning Cycle';
      default:
        return 'Event Group';
    }
  }

  private static extractGroupMetadata(type: EventGroupType, event: Event): EventGroup['metadata'] {
    switch (type) {
      case 'tool_execution':
        return {
          toolName: (event.data.toolName as string) || undefined,
        };
      case 'policy_check':
        return {
          policyId: (event.data.rule as string) || (event.data.policyId as string) || undefined,
        };
      case 'reasoning_cycle':
        return {
          intentionType: (event.data.intention as { type?: string })?.type || undefined,
        };
      case 'run_lifecycle':
        return {
          status: event.type.split('.')[1],
        };
      default:
        return undefined;
    }
  }

  private static buildFlatTimeline(
    events: Event[],
    groups: EventGroup[]
  ): TraceVisualization['flatTimeline'] {
    const groupMap = new Map<string, EventGroup>();
    for (const group of groups) {
      for (const event of group.events) {
        groupMap.set(event.id, group);
      }
    }

    return events.map((event) => {
      const group = groupMap.get(event.id);
      return {
        id: event.id,
        timestamp: event.timestamp,
        type: event.type,
        description: this.getEventDescription(event),
        groupId: group?.id,
        event,
      };
    });
  }

  private static getEventDescription(event: Event): string {
    switch (event.type) {
      case 'intention.generated':
        const intention = (event.data.intention as { type?: string; toolName?: string }) || {};
        if (intention.type === 'tool_call' && intention.toolName) {
          return `Generate intention: Call tool ${intention.toolName}`;
        }
        return 'Generate intention';
      case 'action.executed':
        return `Action executed: ${(event.data.toolName as string) || 'unknown'}`;
      case 'tool.called':
        return `Call tool: ${(event.data.toolName as string) || 'unknown'}`;
      case 'policy.checked':
        return `Policy check: ${(event.data.rule as string) || 'unknown'}`;
      case 'approval.requested':
        return 'Approval requested';
      case 'approval.approved':
        return 'Approval granted';
      case 'approval.rejected':
        return 'Approval rejected';
      case 'error.occurred':
        return `Error: ${(event.data.error as string) || 'unknown'}`;
      default:
        return event.type;
    }
  }

  private static buildSummary(events: Event[], groups: EventGroup[]): TraceVisualization['summary'] {
    const groupsByType: Record<EventGroupType, number> = {
      run_lifecycle: 0,
      reasoning_cycle: 0,
      tool_execution: 0,
      policy_check: 0,
      approval_workflow: 0,
      error: 0,
    };

    for (const group of groups) {
      groupsByType[group.type] = (groupsByType[group.type] || 0) + 1;
    }

    return {
      totalEvents: events.length,
      totalGroups: groups.length,
      groupsByType,
      keyMetrics: {
        intentionsGenerated: events.filter((e) => e.type === 'intention.generated').length,
        actionsExecuted: events.filter((e) => e.type === 'action.executed').length,
        toolsCalled: events.filter((e) => e.type === 'tool.called').length,
        policiesChecked: events.filter((e) => e.type === 'policy.checked').length,
        approvalsRequested: events.filter((e) => e.type === 'approval.requested').length,
        errors: events.filter((e) => ['error.occurred', 'action.failed', 'tool.failed'].includes(e.type)).length,
      },
    };
  }

  private static createEmptyVisualization(trace: {
    runId: string;
    agentId?: string;
    status: string;
  }): TraceVisualization {
    return {
      runId: trace.runId,
      agentId: trace.agentId,
      status: trace.status,
      timeRange: {
        start: Date.now(),
        end: Date.now(),
        duration: 0,
      },
      groups: [],
      flatTimeline: [],
      summary: {
        totalEvents: 0,
        totalGroups: 0,
        groupsByType: {
          run_lifecycle: 0,
          reasoning_cycle: 0,
          tool_execution: 0,
          policy_check: 0,
          approval_workflow: 0,
          error: 0,
        },
        keyMetrics: {
          intentionsGenerated: 0,
          actionsExecuted: 0,
          toolsCalled: 0,
          policiesChecked: 0,
          approvalsRequested: 0,
          errors: 0,
        },
      },
    };
  }
}

