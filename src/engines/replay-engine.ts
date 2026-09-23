import { PolicyViolationError, ToolExecutionError } from '../errors/index.js';
import type { IEventStore } from '../stores/event-store.js';
import type { Event } from '../types/events.js';
import type { Intention, ReplayModifications, RunResult } from '../types/run.js';
import { generateEventId, generateRunId } from '../utils/id.js';
import type { ActionEngine } from './action-engine.js';

export class ReplayEngine {
  constructor(
    private eventStore: IEventStore,
    private actionEngine: ActionEngine
  ) {}

  async replay(runId: string, modifications?: ReplayModifications): Promise<RunResult> {
    const originalEvents = await this.eventStore.getEvents(runId);
    this.validateEvents(originalEvents, runId);

    const newRunId = generateRunId();
    const intentions = this.extractIntentions(originalEvents);
    await this.logReplayStart(newRunId, originalEvents, runId, modifications);

    const result = await this.executeIntentions(
      newRunId,
      intentions,
      recordedAllowedTools(originalEvents)
    );

    if (result.hasError && result.error) {
      await this.logReplayFailure(newRunId, result.error, runId);
      return this.createFailedResult(newRunId, result.error);
    }

    await this.logReplayCompletion(newRunId, result.finalResult, runId);
    return this.createCompletedResult(newRunId, result.finalResult);
  }

  canReplay(runId: string): Promise<boolean> {
    return this.eventStore.getEvents(runId).then((events) => events.length > 0);
  }

  private validateEvents(events: Event[], runId: string): void {
    if (events.length === 0) {
      throw new Error(`No events found for runId: ${runId}`);
    }
  }

  private async logReplayStart(
    newRunId: string,
    originalEvents: Event[],
    originalRunId: string,
    modifications?: ReplayModifications
  ): Promise<void> {
    const originalStartEvent = originalEvents.find((e) => e.type === 'run.started');
    await this.eventStore.append(newRunId, {
      id: generateEventId(),
      runId: newRunId,
      type: 'run.started',
      timestamp: Date.now(),
      data: {
        input: modifications?.input || originalStartEvent?.data.input || {},
        replayOf: originalRunId,
      },
      metadata: originalStartEvent?.metadata,
    });
  }

  private async executeIntentions(
    newRunId: string,
    intentions: Array<{
      type: string;
      data: { intention: Intention };
      metadata?: Record<string, unknown>;
    }>,
    allowedTools?: string[]
  ): Promise<{ hasError: boolean; finalResult: unknown; error?: string }> {
    let finalResult: unknown = null;

    for (const intentionEvent of intentions) {
      const intention = intentionEvent.data.intention as Intention;

      try {
        const result = await this.actionEngine.executeIntention(intention, {
          runId: newRunId,
          agentId: (intentionEvent.metadata?.agentId as string) || '',
          mode: 'replay',
          ...(allowedTools ? { allowedTools } : {}),
        });

        if (result.result) {
          finalResult = result.result;
        }
      } catch (error) {
        // Cognitive runs record tool denials and failures and keep reasoning: their replay
        // records them again and goes on, like the original run did.
        if (
          allowedTools &&
          (error instanceof PolicyViolationError || error instanceof ToolExecutionError)
        ) {
          continue;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { hasError: true, finalResult, error: errorMessage };
      }
    }

    return { hasError: false, finalResult };
  }

  private async logReplayFailure(
    newRunId: string,
    error: string,
    originalRunId: string
  ): Promise<void> {
    await this.eventStore.append(newRunId, {
      id: generateEventId(),
      runId: newRunId,
      type: 'run.failed',
      timestamp: Date.now(),
      data: {
        error,
        replayOf: originalRunId,
      },
    });
  }

  private async logReplayCompletion(
    newRunId: string,
    finalResult: unknown,
    originalRunId: string
  ): Promise<void> {
    await this.eventStore.append(newRunId, {
      id: generateEventId(),
      runId: newRunId,
      type: 'run.completed',
      timestamp: Date.now(),
      data: {
        output: finalResult,
        replayOf: originalRunId,
      },
    });
  }

  private createFailedResult(newRunId: string, error: string): RunResult {
    return {
      runId: newRunId,
      status: 'failed',
      output: error,
    };
  }

  private createCompletedResult(newRunId: string, finalResult: unknown): RunResult {
    return {
      runId: newRunId,
      status: 'completed',
      output: typeof finalResult === 'string' ? finalResult : JSON.stringify(finalResult),
    };
  }

  private extractIntentions(events: Event[]): Array<{
    type: string;
    data: { intention: Intention };
    metadata?: Record<string, unknown>;
  }> {
    return events
      .filter((e) => e.type === 'intention.generated')
      .map((e) => {
        // Intentions are stored differently depending on how they were generated
        // so the intention is rebuilt from the event data
        let intention: Intention;

        if (e.data?.intention) {
          // The intention is already in data.intention
          intention = e.data.intention as Intention;
        } else if (
          e.data?.toolCalls &&
          Array.isArray(e.data.toolCalls) &&
          e.data.toolCalls.length > 0
        ) {
          // Tool calls: build a tool_call intention
          const toolCall = e.data.toolCalls[0];
          try {
            const params = JSON.parse(toolCall.function?.arguments || '{}');
            intention = {
              type: 'tool_call',
              toolName: toolCall.function?.name,
              parameters: params,
            };
          } catch {
            intention = {
              type: 'tool_call',
              toolName: toolCall.function?.name,
              parameters: {},
            };
          }
        } else if (e.data?.message) {
          // A message: build a final_answer intention
          intention = {
            type: 'final_answer',
            reasoning: typeof e.data.message === 'string' ? e.data.message : undefined,
          };
        } else {
          // Fallback: intention continue
          intention = {
            type: 'continue',
          };
        }

        return {
          type: e.type,
          data: {
            intention,
          },
          metadata: e.metadata,
        };
      });
  }
}

/** Tools a cognitive run was restricted to, as recorded in its `cognition.started` event. */
function recordedAllowedTools(events: Event[]): string[] | undefined {
  const started = events.find((event) => event.type === 'cognition.started');
  const tools = started?.data.allowedTools;
  return Array.isArray(tools) && tools.every((tool) => typeof tool === 'string')
    ? tools
    : undefined;
}
