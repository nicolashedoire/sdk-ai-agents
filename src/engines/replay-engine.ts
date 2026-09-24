import { PolicyViolationError, ToolExecutionError } from '../errors/index.js';
import type { IEventStore } from '../stores/event-store.js';
import { finishWatch, watchRun } from '../stores/observed-event-store.js';
import type { Event } from '../types/events.js';
import type {
  Intention,
  ReplayModifications,
  ReplayOptions,
  RunInput,
  RunProgress,
  RunResult,
} from '../types/run.js';
import { generateEventId, generateRunId } from '../utils/id.js';
import { type ActionEngine, TOOL_APPROVAL_POLICY } from './action-engine.js';

export class ReplayEngine {
  constructor(
    private eventStore: IEventStore,
    private actionEngine: ActionEngine
  ) {}

  async replay(
    runId: string,
    modifications?: ReplayModifications,
    options: ReplayOptions = {}
  ): Promise<RunResult> {
    const originalEvents = await this.eventStore.getEvents(runId);
    this.validateEvents(originalEvents, runId);

    const newRunId = generateRunId();
    // Watched before anything is recorded, so the listener gets every event of the replay.
    const watch = watchRun(this.eventStore, newRunId, options.onEvent);
    try {
      return await this.replayAs(newRunId, runId, originalEvents, modifications);
    } finally {
      // A replay cannot be cancelled: it waits until the listener has settled on every event.
      await finishWatch(watch, []);
    }
  }

  private async replayAs(
    newRunId: string,
    runId: string,
    originalEvents: Event[],
    modifications?: ReplayModifications
  ): Promise<RunResult> {
    const intentions = this.extractIntentions(originalEvents);
    const approved = approvedIntentions(originalEvents);
    await this.logReplayStart(newRunId, originalEvents, runId, modifications);

    const allowedTools = recordedAllowedTools(originalEvents);
    const result = await this.executeIntentions(
      newRunId,
      intentions,
      approved,
      allowedTools,
      // Cognitive runs gave no run progress to their calls: their replay gives none either.
      allowedTools ? undefined : recordedProgress(originalEvents)
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
    // Callbacks and a signal given anyway (from JavaScript) are not recorded.
    const { signal, onEvent, onText, onTextRestart, ...input } = (modifications?.input ??
      {}) as RunInput;
    await this.eventStore.append(newRunId, {
      id: generateEventId(),
      runId: newRunId,
      type: 'run.started',
      timestamp: Date.now(),
      data: {
        input: modifications?.input ? input : originalStartEvent?.data.input || {},
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
    approved: ReadonlySet<number>,
    allowedTools?: string[],
    progress?: Array<{ step: number; tokensUsed: number; elapsedMs: number }>
  ): Promise<{ hasError: boolean; finalResult: unknown; error?: string }> {
    let finalResult: unknown = null;

    for (const [index, intentionEvent] of intentions.entries()) {
      const intention = intentionEvent.data.intention as Intention;
      const recorded = progress?.[index];
      // The original run's progress at this call, with its elapsed time replayed from now.
      const run: RunProgress | undefined = recorded && {
        step: recorded.step,
        tokensUsed: recorded.tokensUsed,
        startedAt: Date.now() - recorded.elapsedMs,
      };

      try {
        const result = await this.actionEngine.executeIntention(intention, {
          runId: newRunId,
          agentId: (intentionEvent.metadata?.agentId as string) || '',
          mode: 'replay',
          ...(approved.has(index) ? { preApproved: true } : {}),
          ...(allowedTools ? { allowedTools } : {}),
          ...(run ? { run } : {}),
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

/**
 * Positions (among the `intention.generated` events) of the tool calls a human approved
 * in the original run: an `approval.approved` for the tool's own approval, recorded after
 * that intention and before the next one, for the same tool and the same parameters.
 */
function approvedIntentions(events: Event[]): Set<number> {
  const approved = new Set<number>();
  let position = -1;
  let current: unknown;
  for (const event of events) {
    if (event.type === 'intention.generated') {
      position++;
      current = event.data;
      continue;
    }
    if (
      event.type === 'approval.approved' &&
      position >= 0 &&
      event.data.policyId === TOOL_APPROVAL_POLICY &&
      sameCall(event.data.intention, current)
    ) {
      approved.add(position);
    }
  }
  return approved;
}

/** The approved intention names the tool call recorded by the intention event. */
function sameCall(approvedIntention: unknown, intentionData: unknown): boolean {
  const approvedCall = toolCallOf(approvedIntention);
  const recorded = toolCallOfEvent(intentionData);
  return (
    approvedCall !== undefined &&
    recorded !== undefined &&
    approvedCall.toolName === recorded.toolName &&
    stableJson(approvedCall.parameters) === stableJson(recorded.parameters)
  );
}

function toolCallOf(value: unknown): { toolName: string; parameters: unknown } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const toolName: unknown = Reflect.get(value, 'toolName');
  return typeof toolName === 'string'
    ? { toolName, parameters: Reflect.get(value, 'parameters') ?? {} }
    : undefined;
}

/** The tool call of an `intention.generated` event: its `intention`, or its first tool call. */
function toolCallOfEvent(data: unknown): { toolName: string; parameters: unknown } | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const intention = toolCallOf(Reflect.get(data, 'intention'));
  if (intention) return intention;
  const toolCalls: unknown = Reflect.get(data, 'toolCalls');
  const first: unknown = Array.isArray(toolCalls) ? toolCalls[0] : undefined;
  const fn: unknown =
    typeof first === 'object' && first !== null ? Reflect.get(first, 'function') : undefined;
  if (typeof fn !== 'object' || fn === null) return undefined;
  const name: unknown = Reflect.get(fn, 'name');
  const args: unknown = Reflect.get(fn, 'arguments');
  if (typeof name !== 'string') return undefined;
  try {
    const parameters: unknown = typeof args === 'string' ? JSON.parse(args || '{}') : {};
    return { toolName: name, parameters };
  } catch {
    return undefined;
  }
}

/** JSON with sorted keys, to compare parameters whatever their key order. */
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) =>
    typeof item === 'object' && item !== null && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item
  );
}

/** Tools a cognitive run was restricted to, as recorded in its `cognition.started` event. */
function recordedAllowedTools(events: Event[]): string[] | undefined {
  const started = events.find((event) => event.type === 'cognition.started');
  const tools = started?.data.allowedTools;
  return Array.isArray(tools) && tools.every((tool) => typeof tool === 'string')
    ? tools
    : undefined;
}

/**
 * The progress of the original run when each of its intentions was generated: the step, the
 * tokens used so far (answers a provider discarded included, as the run counted them) and the
 * time elapsed. Budget and timeout policies then decide in the replay as they did in the
 * original run, so a call they refused is refused again.
 */
function recordedProgress(
  events: Event[]
): Array<{ step: number; tokensUsed: number; elapsedMs: number }> {
  const startedAt = events.find((event) => event.type === 'run.started')?.timestamp;
  let tokensUsed = 0;
  const progress: Array<{ step: number; tokensUsed: number; elapsedMs: number }> = [];
  for (const event of events) {
    if (event.type !== 'intention.generated' && event.type !== 'provider.answer_discarded') {
      continue;
    }
    tokensUsed += tokensOf(event.data.usage);
    if (event.type === 'intention.generated') {
      progress.push({
        step: progress.length,
        tokensUsed,
        elapsedMs: startedAt === undefined ? 0 : Math.max(0, event.timestamp - startedAt),
      });
    }
  }
  return progress;
}

function tokensOf(usage: unknown): number {
  if (!usage || typeof usage !== 'object') return 0;
  const { totalTokens, promptTokens, completionTokens } = usage as Record<string, unknown>;
  if (typeof totalTokens === 'number') return totalTokens;
  return (
    (typeof promptTokens === 'number' ? promptTokens : 0) +
    (typeof completionTokens === 'number' ? completionTokens : 0)
  );
}
