import type { LLMProvider, LLMRequest, LLMResponse } from '../../providers/llm-provider.js';

export type ScriptedReply =
  | { content: string }
  /** `content`: text the model writes alongside the call (Claude often does). */
  | { toolCall: { name: string; arguments: Record<string, unknown> }; content?: string }
  | { error: Error }
  /** A reply computed from the request (a guardian judging the items it is shown). */
  | { respond: (request: LLMRequest) => ScriptedReply };

/**
 * In-memory LLM provider for tests. Replies are queued per "channel": the cognitive
 * operation named in the prompt (`Operation: simulate`), a study's call (`study:observe`,
 * `study-check:observe`… see `studyChannel`), `tool-selection` for requests that offer
 * tools, or `default`. Every request is kept for assertions.
 */
export class ScriptedLLMProvider implements LLMProvider {
  readonly requests: LLMRequest[] = [];
  private readonly queues = new Map<string, ScriptedReply[]>();
  private readonly fallbacks = new Map<string, ScriptedReply>();

  constructor(private readonly options: { delayMs?: number; model?: string } = {}) {}

  /** Queues replies consumed in order for a channel. */
  enqueue(channel: string, ...replies: ScriptedReply[]): this {
    this.queues.set(channel, [...(this.queues.get(channel) ?? []), ...replies]);
    return this;
  }

  /** Reply used for a channel once its queue is empty. */
  always(channel: string, reply: ScriptedReply): this {
    this.fallbacks.set(channel, reply);
    return this;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);
    if (this.options.delayMs) {
      await waitFor(this.options.delayMs, request.abortSignal);
    }
    const channel = channelOf(request);
    const queued = this.queues.get(channel);
    let reply = queued && queued.length > 0 ? queued.shift() : this.fallbacks.get(channel);
    if (!reply) {
      throw new Error(`no scripted reply for channel "${channel}"`);
    }
    while ('respond' in reply) reply = reply.respond(request);
    if ('error' in reply) {
      throw reply.error;
    }
    const model = this.options.model ?? request.model;
    if ('toolCall' in reply) {
      return {
        content: reply.content ?? null,
        toolCalls: [
          {
            function: {
              name: reply.toolCall.name,
              arguments: JSON.stringify(reply.toolCall.arguments),
            },
          },
        ],
        model,
        usage: { promptTokens: 50, completionTokens: 10, totalTokens: 60 },
      };
    }
    return {
      content: reply.content,
      model,
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 },
    };
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'scripted';
  }

  /** Channels in the order they were requested. */
  channels(): string[] {
    return this.requests.map(channelOf);
  }
}

export function channelOf(request: LLMRequest): string {
  if (request.tools && request.tools.length > 0) {
    return 'tool-selection';
  }
  const study = studyChannel(request);
  if (study) return study;
  const last = request.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
  const operation = /Operation: ([a-z_]+)/.exec(
    request.messages.map((message) => message.content).join('\n')
  );
  if (operation?.[1] && !last.startsWith('Your reply could not be used')) {
    return operation[1];
  }
  if (last.startsWith('Your reply could not be used')) {
    return operation?.[1] ? `${operation[1]}:repair` : 'repair';
  }
  return 'default';
}

const STUDY_CALLS: Record<string, string> = {
  passage: 'study',
  queries: 'study-queries',
  check: 'study-check',
  'prior-art queries': 'study-prior-art-queries',
  'prior-art check': 'study-prior-art-check',
  amendment: 'study-amendment',
};

/**
 * The channel of a study's call, from the line that opens its task: `Study passage: observe`
 * is `study:observe`, `Study check: observe` is `study-check:observe`, `Study queries: changes`
 * is `study-queries:changes`, `Study amendment` is `study-amendment`. A repair (the prompt says
 * why the previous reply was refused) adds `:repair`.
 */
export function studyChannel(request: LLMRequest): string | undefined {
  const task = request.messages.filter((message) => message.role === 'user').at(-1)?.content ?? '';
  const match =
    /^Study (passage|queries|check|prior-art queries|prior-art check|amendment)(?:: ([A-Za-z]+))?$/m.exec(
      task
    );
  const kind = match?.[1] ? STUDY_CALLS[match[1]] : undefined;
  if (!kind) return undefined;
  const channel = match?.[2] ? `${kind}:${match[2]}` : kind;
  return task.includes('Your previous reply could not be used:') ? `${channel}:repair` : channel;
}

function waitFor(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('aborted'));
      },
      { once: true }
    );
  });
}

export const json = (value: unknown): ScriptedReply => ({ content: JSON.stringify(value) });
