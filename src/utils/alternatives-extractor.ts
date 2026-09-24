import type { Event } from '../types/events.js';
import type { AlternativesAnalysis, Alternative } from '../types/alternatives.js';
import { readPolicyCheck } from './policy-check.js';

export class AlternativesExtractor {
  /**
   * Extracts alternatives from a sequence of events.
   * Analyzes intentions, tool calls, and decisions to identify alternatives considered.
   */
  static extractFromEvents(runId: string, events: Event[]): AlternativesAnalysis {
    const decisionPoints: AlternativesAnalysis['decisionPoints'] = [];
    const alternatives: Alternative[] = [];

    // Sort events by timestamp
    const sortedEvents = [...events].sort((a, b) => a.timestamp - b.timestamp);

    // Track intentions and their outcomes
    const intentionMap = new Map<
      string,
      {
        intention: Event;
        executed?: Event;
        rejected?: Event;
        alternatives?: Event[];
      }
    >();

    // First pass: collect all intentions and their outcomes
    for (const event of sortedEvents) {
      if (event.type === 'intention.generated') {
        intentionMap.set(event.id, { intention: event });
      } else if (event.type === 'intention.rejected') {
        const intentionId = (event.data.rejectedIntentionId as string) || event.id;
        const entry = intentionMap.get(intentionId);
        if (entry) {
          entry.rejected = event;
        }
      } else if (event.type === 'action.executed' || event.type === 'action.executing') {
        const intentionId =
          (event.data.intentionId as string) ||
          (event.data.intention as { id?: string })?.id ||
          AlternativesExtractor.findRelatedIntentionId(event, sortedEvents);
        if (intentionId) {
          const entry = intentionMap.get(intentionId);
          if (entry) {
            entry.executed = event;
          }
        }
      }
    }

    // Second pass: identify decision points and alternatives
    let currentDecisionPoint: AlternativesAnalysis['decisionPoints'][0] | null = null;

    for (const event of sortedEvents) {
      // Check for multiple tool calls in a single intention (alternatives)
      if (event.type === 'intention.generated') {
        const toolCalls = event.data.toolCalls as
          | Array<{ function?: { name?: string; arguments?: string } }>
          | undefined;

        if (toolCalls && toolCalls.length > 1) {
          // Multiple tool calls = alternatives
          const altAlternatives: Alternative[] = toolCalls.map((tc, index) => ({
            id: `alt-${event.id}-${index}`,
            type: 'tool_call',
            description: `Call tool: ${tc.function?.name || 'unknown'}`,
            timestamp: event.timestamp,
            data: {
              toolCall: {
                name: tc.function?.name || 'unknown',
                parameters: AlternativesExtractor.parseToolCallArguments(tc.function?.arguments),
              },
            },
            status: 'considered',
            metadata: event.metadata,
          }));

          // Find which one was actually executed
          const executedTool = AlternativesExtractor.findExecutedTool(event, sortedEvents);
          if (executedTool) {
            const selectedIndex = toolCalls.findIndex(
              (tc) => tc.function?.name === executedTool.toolName
            );
            if (selectedIndex >= 0) {
              altAlternatives[selectedIndex].status = 'selected';
              altAlternatives.forEach((alt, idx) => {
                if (idx !== selectedIndex) {
                  alt.status = 'not_executed';
                  alt.reason = 'Another alternative was selected';
                }
              });
            }
          }

          currentDecisionPoint = {
            id: `decision-${event.id}`,
            timestamp: event.timestamp,
            context: AlternativesExtractor.getEventContext(event, sortedEvents),
            alternatives: altAlternatives,
            selectedAlternative: altAlternatives.find((a) => a.status === 'selected'),
            reasoning:
              (event.data.message as string) || (event.data.reasoning as string) || undefined,
          };
          decisionPoints.push(currentDecisionPoint);
          alternatives.push(...altAlternatives);
        } else {
          // Single intention - check if it was executed or rejected
          const entry = intentionMap.get(event.id);
          const intentionData =
            (event.data.intention as {
              type?: string;
              toolName?: string;
              reasoning?: string;
            }) || AlternativesExtractor.extractIntentionFromData(event.data);

          const alt: Alternative = {
            id: `alt-${event.id}`,
            type: 'intention',
            description: AlternativesExtractor.getIntentionDescription(intentionData),
            timestamp: event.timestamp,
            data: {
              intention: {
                type: intentionData?.type || 'unknown',
                toolName: intentionData?.toolName,
                reasoning: intentionData?.reasoning || (event.data.message as string) || undefined,
              },
            },
            status: entry?.rejected ? 'rejected' : entry?.executed ? 'selected' : 'considered',
            reason: entry?.rejected ? (entry.rejected.data.reason as string) : undefined,
            metadata: event.metadata,
          };

          alternatives.push(alt);

          if (entry?.rejected || !entry?.executed) {
            // This is a decision point - an alternative that wasn't chosen
            currentDecisionPoint = {
              id: `decision-${event.id}`,
              timestamp: event.timestamp,
              context: AlternativesExtractor.getEventContext(event, sortedEvents),
              alternatives: [alt],
              selectedAlternative: entry?.executed ? alt : undefined,
              reasoning: alt.data?.intention?.reasoning,
            };
            decisionPoints.push(currentDecisionPoint);
          }
        }
      }

      // Check for policy rejections (alternatives that were blocked)
      if (event.type === 'policy.checked') {
        const policyData = readPolicyCheck(event.data);
        // A refused tool call is one rejected alternative: the action engine's verdict. The
        // policy engine's event for each policy it checked stands alone only for a step.
        const verdict = policyData.source !== 'policy' || policyData.intentionType !== 'tool_call';

        if (policyData.result === 'denied' && verdict) {
          // Policy rejected - this represents a rejected alternative
          const relatedIntention = AlternativesExtractor.findRelatedIntention(event, sortedEvents);
          if (relatedIntention) {
            const alt: Alternative = {
              id: `alt-policy-${event.id}`,
              type: 'decision',
              description: `Policy check: ${policyData.rule}`,
              timestamp: event.timestamp,
              data: {
                decision: {
                  choice: 'rejected',
                  reasoning: policyData.reason,
                },
              },
              status: 'rejected',
              reason: policyData.reason,
              metadata: event.metadata,
            };

            alternatives.push(alt);

            // Add to current decision point or create new one
            if (currentDecisionPoint && currentDecisionPoint.timestamp === event.timestamp) {
              currentDecisionPoint.alternatives.push(alt);
            } else {
              currentDecisionPoint = {
                id: `decision-policy-${event.id}`,
                timestamp: event.timestamp,
                context: AlternativesExtractor.getEventContext(event, sortedEvents),
                alternatives: [alt],
                reasoning: policyData.reason,
              };
              decisionPoints.push(currentDecisionPoint);
            }
          }
        }
      }

      // Check for approval rejections
      if (event.type === 'approval.rejected') {
        const alt: Alternative = {
          id: `alt-approval-${event.id}`,
          type: 'decision',
          description: 'Approval rejected',
          timestamp: event.timestamp,
          data: {
            decision: {
              choice: 'rejected',
              reasoning: event.data.reason as string,
            },
          },
          status: 'rejected',
          reason: event.data.reason as string,
          metadata: event.metadata,
        };

        alternatives.push(alt);

        // Find or create decision point for this approval
        const relatedDecisionPoint = decisionPoints.find(
          (dp) => Math.abs(dp.timestamp - event.timestamp) < 1000
        );

        if (relatedDecisionPoint) {
          relatedDecisionPoint.alternatives.push(alt);
        } else {
          // Create new decision point for approval rejection
          currentDecisionPoint = {
            id: `decision-approval-${event.id}`,
            timestamp: event.timestamp,
            context: AlternativesExtractor.getEventContext(event, sortedEvents),
            alternatives: [alt],
            reasoning: event.data.reason as string,
          };
          decisionPoints.push(currentDecisionPoint);
        }
      }
    }

    // Calculate summary
    const selectedCount = alternatives.filter((a) => a.status === 'selected').length;
    const rejectedCount = alternatives.filter((a) => a.status === 'rejected').length;
    const consideredCount = alternatives.filter((a) => a.status === 'considered').length;

    return {
      runId,
      agentId: events[0]?.metadata?.agentId as string | undefined,
      decisionPoints,
      summary: {
        totalAlternatives: alternatives.length,
        selectedCount,
        rejectedCount,
        consideredCount,
        decisionPointsCount: decisionPoints.length,
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

  private static getIntentionDescription(
    intention: {
      type?: string;
      toolName?: string;
      reasoning?: string;
    } | null
  ): string {
    if (!intention) return 'Unknown intention';

    if (intention.type === 'tool_call' && intention.toolName) {
      return `Call tool: ${intention.toolName}`;
    }

    if (intention.type === 'final_answer') {
      return 'Final answer';
    }

    return `Intention: ${intention.type || 'unknown'}`;
  }

  private static parseToolCallArguments(args?: string): Record<string, unknown> {
    if (!args) return {};
    try {
      return JSON.parse(args);
    } catch {
      return {};
    }
  }

  private static findExecutedTool(
    intentionEvent: Event,
    events: Event[]
  ): {
    toolName?: string;
  } | null {
    // Find the action.executed event that corresponds to this intention
    const intentionTimestamp = intentionEvent.timestamp;

    for (const event of events) {
      if (
        (event.type === 'action.executed' || event.type === 'tool.called') &&
        event.timestamp > intentionTimestamp &&
        event.timestamp < intentionTimestamp + 5000 // Within 5 seconds
      ) {
        const toolName =
          (event.data.toolName as string) ||
          (event.data.intention as { toolName?: string })?.toolName;
        if (toolName) {
          return { toolName };
        }
      }
    }

    return null;
  }

  private static findRelatedIntention(policyEvent: Event, events: Event[]): Event | null {
    // Find the intention that was checked by this policy
    const policyTimestamp = policyEvent.timestamp;

    // Look for intention.generated events just before this policy check
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (
        event.type === 'intention.generated' &&
        event.timestamp < policyTimestamp &&
        event.timestamp > policyTimestamp - 2000 // Within 2 seconds
      ) {
        return event;
      }
    }

    return null;
  }

  private static findRelatedIntentionId(actionEvent: Event, events: Event[]): string | null {
    const relatedIntention = AlternativesExtractor.findRelatedIntention(actionEvent, events);
    return relatedIntention?.id || null;
  }

  private static getEventContext(event: Event, events: Event[]): string {
    // Get context from previous events (last user message or system prompt)
    for (let i = events.length - 1; i >= 0; i--) {
      const prevEvent = events[i];
      if (prevEvent.timestamp < event.timestamp) {
        if (prevEvent.type === 'run.started') {
          return 'Run started';
        }
        if (prevEvent.type === 'intention.generated' && prevEvent.data.message) {
          return `Previous: ${String(prevEvent.data.message).substring(0, 100)}`;
        }
      }
    }
    return 'Unknown context';
  }
}
