import type { Event } from '../types/events.js';
import type { ReasoningGraph, ReasoningNode, ReasoningEdge } from '../types/reasoning-graph.js';
import { generateEventId } from './id.js';

export class ReasoningGraphBuilder {
  /**
   * Builds a reasoning graph from a sequence of events.
   */
  static buildFromEvents(runId: string, events: Event[]): ReasoningGraph {
    const nodes: ReasoningNode[] = [];
    const edges: ReasoningEdge[] = [];
    const nodeMap = new Map<string, ReasoningNode>();
    let lastNodeId: string | null = null;

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    for (const event of sortedEvents) {
      switch (event.type) {
        case 'run.started':
          {
            const nodeId = `start-${event.id}`;
            const node: ReasoningNode = {
              id: nodeId,
              type: 'start',
              label: 'Run Started',
              timestamp: event.timestamp,
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);
            lastNodeId = nodeId;
          }
          break;

        case 'intention.generated':
          {
            const nodeId = `intention-${event.id}`;
            const intentionData = (event.data.intention as { type?: string; toolName?: string; reasoning?: string } | undefined) || this.extractIntentionFromData(event.data);
            
            const node: ReasoningNode = {
              id: nodeId,
              type: 'intention',
              label: this.getIntentionLabel(intentionData),
              timestamp: event.timestamp,
              data: {
                intention: {
                  type: intentionData?.type || 'unknown',
                  toolName: intentionData?.toolName,
                  reasoning: intentionData?.reasoning || (event.data.message as string) || undefined,
                },
              },
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: 'leads_to',
              });
            }
            lastNodeId = nodeId;
          }
          break;

        case 'policy.checked':
          {
            const nodeId = `policy-${event.id}`;
            const policyData = event.data as {
              rule?: string;
              allowed?: boolean;
              requiresApproval?: boolean;
              reason?: string;
            };

            const node: ReasoningNode = {
              id: nodeId,
              type: 'policy',
              label: `Policy Check: ${policyData.rule || 'unknown'}`,
              timestamp: event.timestamp,
              data: {
                policy: {
                  rule: policyData.rule || 'unknown',
                  result: policyData.requiresApproval
                    ? 'requires_approval'
                    : policyData.allowed
                      ? 'allowed'
                      : 'denied',
                  reason: policyData.reason,
                },
              },
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: 'validates',
                label: policyData.allowed ? 'Allowed' : policyData.requiresApproval ? 'Requires Approval' : 'Denied',
              });
            }
            lastNodeId = nodeId;
          }
          break;

        case 'approval.requested':
          {
            const nodeId = `approval-request-${event.id}`;
            const node: ReasoningNode = {
              id: nodeId,
              type: 'decision',
              label: 'Approval Requested',
              timestamp: event.timestamp,
              data: {
                decision: {
                  choice: 'request_approval',
                  reasoning: event.data.reason as string || undefined,
                },
              },
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: 'triggers',
              });
            }
            lastNodeId = nodeId;
          }
          break;

        case 'approval.approved':
        case 'approval.rejected':
          {
            const nodeId = `approval-${event.type}-${event.id}`;
            const node: ReasoningNode = {
              id: nodeId,
              type: 'decision',
              label: event.type === 'approval.approved' ? 'Approval Granted' : 'Approval Rejected',
              timestamp: event.timestamp,
              data: {
                decision: {
                  choice: event.type === 'approval.approved' ? 'approved' : 'rejected',
                },
              },
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: event.type === 'approval.approved' ? 'approves' : 'rejects',
              });
            }
            lastNodeId = nodeId;
          }
          break;

        case 'action.executing':
        case 'action.executed':
          {
            const nodeId = `action-${event.id}`;
            const intentionData = event.data.intention as {
              type?: string;
              toolName?: string;
              reasoning?: string;
            } | undefined;

            const node: ReasoningNode = {
              id: nodeId,
              type: 'action',
              label: this.getActionLabel(intentionData, event.data),
              timestamp: event.timestamp,
              data: {
                action: {
                  type: intentionData?.type || 'unknown',
                  toolName: intentionData?.toolName,
                  result: event.data.result,
                },
              },
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: 'triggers',
              });
            }
            lastNodeId = nodeId;
          }
          break;

        case 'tool.called':
          {
            const nodeId = `tool-${event.id}`;
            const toolData = event.data as {
              toolName?: string;
              parameters?: Record<string, unknown>;
              result?: unknown;
            };

            const node: ReasoningNode = {
              id: nodeId,
              type: 'tool',
              label: `Tool: ${toolData.toolName || 'unknown'}`,
              timestamp: event.timestamp,
              data: {
                tool: {
                  name: toolData.toolName || 'unknown',
                  parameters: toolData.parameters,
                  result: toolData.result,
                },
              },
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: 'triggers',
              });
            }
            lastNodeId = nodeId;
          }
          break;

        case 'run.completed':
        case 'run.failed':
        case 'run.cancelled':
          {
            const nodeId = `end-${event.id}`;
            const node: ReasoningNode = {
              id: nodeId,
              type: 'end',
              label: `Run ${event.type.split('.')[1]}`,
              timestamp: event.timestamp,
              metadata: event.metadata,
            };
            nodes.push(node);
            nodeMap.set(nodeId, node);

            if (lastNodeId) {
              edges.push({
                id: `edge-${generateEventId()}`,
                source: lastNodeId,
                target: nodeId,
                type: 'leads_to',
              });
            }
          }
          break;
      }
    }

    const startedAt = events.find((e) => e.type === 'run.started')?.timestamp;
    const completedAt = events.find((e) =>
      ['run.completed', 'run.failed', 'run.cancelled'].includes(e.type)
    )?.timestamp;

    return {
      runId,
      agentId: events[0]?.metadata?.agentId as string | undefined,
      nodes,
      edges,
      metadata: {
        startedAt,
        completedAt,
        totalSteps: nodes.filter((n) => n.type === 'intention' || n.type === 'action').length,
        totalTools: nodes.filter((n) => n.type === 'tool').length,
        totalPolicies: nodes.filter((n) => n.type === 'policy').length,
      },
    };
  }

  private static extractIntentionFromData(data: Event['data']): {
    type?: string;
    toolName?: string;
    reasoning?: string;
  } | null {
    if (data.intention) {
      return data.intention as { type?: string; toolName?: string; reasoning?: string };
    }

    if (data.toolCalls && Array.isArray(data.toolCalls) && data.toolCalls.length > 0) {
      const toolCall = data.toolCalls[0] as { function?: { name?: string } };
      return {
        type: 'tool_call',
        toolName: toolCall.function?.name,
      };
    }

    if (data.message) {
      return {
        type: 'final_answer',
        reasoning: typeof data.message === 'string' ? data.message : undefined,
      };
    }

    return null;
  }

  private static getIntentionLabel(intention: {
    type?: string;
    toolName?: string;
    reasoning?: string;
  } | null): string {
    if (!intention) return 'Intention';
    
    if (intention.type === 'tool_call' && intention.toolName) {
      return `Call Tool: ${intention.toolName}`;
    }
    
    if (intention.type === 'final_answer') {
      return 'Final Answer';
    }
    
    return `Intention: ${intention.type || 'unknown'}`;
  }

  private static getActionLabel(
    intention: { type?: string; toolName?: string } | undefined,
    _data: Event['data']
  ): string {
    if (intention?.type === 'tool_call' && intention.toolName) {
      return `Execute: ${intention.toolName}`;
    }
    
    if (intention?.type === 'final_answer') {
      return 'Return Answer';
    }
    
    return 'Action';
  }
}

