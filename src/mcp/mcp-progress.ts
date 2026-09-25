import type { ProgressToken, ServerNotification } from '@modelcontextprotocol/sdk/types.js';
import type { Event, LiveEventListener } from '../types/events.js';

/**
 * Turns the live events of an MCP tool call into `notifications/progress` for the token the
 * client sent: `progress` counts the events (1, 2, 3…), `message` says in a few words what
 * happened. There is no `total`: how many events a run records is not known in advance.
 */
export function progressNotifier(
  progressToken: ProgressToken,
  send: (notification: ServerNotification) => Promise<void>
): LiveEventListener {
  const describe = progressDescriber();
  let progress = 0;
  let stopped = false;
  return async (event) => {
    if (stopped) return;
    progress += 1;
    try {
      await send({
        method: 'notifications/progress',
        params: { progressToken, progress, message: describe(event) },
      });
    } catch (error) {
      // The response stream is gone (an HTTP connection closed): later ones would fail too.
      stopped = true;
      console.error(
        'MCP progress notifications stopped:',
        error instanceof Error ? error.message : String(error)
      );
    }
  };
}

/**
 * Describes the events of one call for a person waiting for it: the step, the tool or the
 * cognitive operation, never arguments, results or error texts (they may hold internal
 * details). Remembers the kind and the current step of each run it has seen.
 */
export function progressDescriber(): (event: Event) => string {
  const kinds = new Map<string, string>();
  const steps = new Map<string, number>();
  return (event) => {
    const data = event.data ?? {};
    const step = currentStep(event, steps);
    const at = (text: string) => (step === undefined ? text : `step ${step}: ${text}`);
    const tool = toolNameOf(data);
    const operation = typeof data.operation === 'string' ? data.operation : 'operation';
    const kind = kinds.get(event.runId) ?? 'run';
    switch (event.type) {
      case 'run.started': {
        const started = runKind(data);
        kinds.set(event.runId, started);
        return `${started} started`;
      }
      case 'run.completed':
        return `${kind} completed`;
      case 'run.failed':
        return `${kind} failed`;
      case 'run.cancelled':
        return `${kind} cancelled`;
      case 'run.stopped':
        return `${kind} stopped`;
      case 'intention.generated':
        if (data.source === 'cognition') return 'answer ready';
        return at(firstToolCall(data) ? `model chose ${firstToolCall(data)}` : 'model answered');
      case 'action.executing':
        return at(tool ? `${tool} requested` : 'action requested');
      case 'policy.checked':
        return at(tool ? `policies checked for ${tool}` : 'policies checked');
      case 'policy.violated':
        return at(tool ? `${tool} refused by a policy` : 'refused by a policy');
      case 'approval.requested':
        return at(tool ? `waiting for approval of ${tool}` : 'waiting for approval');
      case 'approval.approved':
        return at(tool ? `${tool} approved` : 'approved');
      case 'approval.rejected':
        return at(tool ? `${tool} not approved` : 'not approved');
      case 'tool.called':
        return at(`tool ${tool ?? 'unknown'} called`);
      case 'action.executed':
        return at(tool ? `tool ${tool} done` : 'action done');
      case 'action.failed':
        return at(tool ? `tool ${tool} failed` : 'action failed');
      case 'tool.retry':
        return at(`tool ${tool ?? 'unknown'} retried`);
      case 'provider.retry':
        return at('model call retried');
      case 'provider.fallback':
        return at('switched to a fallback model provider');
      case 'resource.read':
        return 'resource read';
      case 'cognition.started':
        return 'reasoning started';
      case 'cognition.operation_selected':
        return at(operation);
      case 'cognition.thought':
        return at(data.failed === true ? `${operation} recorded as failed` : `${operation} done`);
      case 'cognition.operation_failed':
        return at(`${operation} failed`);
      case 'decision.evaluated':
        return at('typed decision evaluated');
      case 'cognition.concluded':
        return typeof data.status === 'string' ? `decision ${data.status}` : 'decision reached';
      case 'cognition.knowledge_recorded':
        return 'findings remembered';
      case 'incident.reported':
        return 'incident reported';
      case 'study.started':
        return 'study started';
      case 'study.passage_started':
        return `passage ${passageOf(data)} started`;
      case 'study.passage_completed':
        return `passage ${passageOf(data)} done`;
      case 'study.model_called':
        return data.passage ? `model answered for passage ${passageOf(data)}` : 'model answered';
      case 'study.search':
        return `search in ${passageOf(data)}`;
      case 'study.drift_rejected':
        return `item removed from ${passageOf(data)}`;
      case 'study.capability_demoted':
        return 'capability judged an improvement';
      case 'study.amendment_accepted':
        return 'amendment accepted';
      case 'study.amendment_refused':
        return 'amendment refused';
      case 'study.result_recorded':
        return 'result recorded';
      // The run's own end says "study completed": these say the report, once each.
      case 'study.completed':
        return 'report ready';
      case 'study.failed':
        return 'partial report ready';
      default:
        return event.type;
    }
  };
}

/** The step an event belongs to: its own `step` (cognitive runs), else the model calls so far. */
function currentStep(event: Event, steps: Map<string, number>): number | undefined {
  const declared = event.data?.step;
  if (typeof declared === 'number') {
    steps.set(event.runId, declared);
    return declared;
  }
  if (event.type === 'intention.generated' && event.data?.source !== 'cognition') {
    const next = (steps.get(event.runId) ?? 0) + 1;
    steps.set(event.runId, next);
    return next;
  }
  return steps.get(event.runId);
}

function runKind(data: Record<string, unknown>): string {
  if (data.replayOf !== undefined) return 'replay';
  if (data.mode === 'tool') return 'call';
  if (data.mode === 'resource') return 'read';
  if (data.mode === 'study') return 'study';
  if (data.mode === 'study-amendment') return 'amendment';
  return 'agent';
}

/** The passage a study event is about (a word of the method, never a text of the study). */
function passageOf(data: Record<string, unknown>): string {
  return typeof data.passage === 'string' ? data.passage : 'the study';
}

function toolNameOf(data: Record<string, unknown>): string | undefined {
  if (typeof data.toolName === 'string') return data.toolName;
  const intention = data.intention;
  if (typeof intention === 'object' && intention !== null) {
    const name: unknown = Reflect.get(intention, 'toolName');
    if (typeof name === 'string') return name;
  }
  return undefined;
}

function firstToolCall(data: Record<string, unknown>): string | undefined {
  const calls = data.toolCalls;
  const first: unknown = Array.isArray(calls) ? calls[0] : undefined;
  if (typeof first !== 'object' || first === null) return undefined;
  const fn: unknown = Reflect.get(first, 'function');
  if (typeof fn !== 'object' || fn === null) return undefined;
  const name: unknown = Reflect.get(fn, 'name');
  return typeof name === 'string' ? name : undefined;
}
