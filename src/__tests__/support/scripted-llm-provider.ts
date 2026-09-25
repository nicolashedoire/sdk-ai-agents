import type { LLMProvider, LLMRequest, LLMResponse } from '../../providers/llm-provider.js';

export type ScriptedReply =
  | { content: string }
  /** `content`: text the model writes alongside the call (Claude often does). */
  | { toolCall: { name: string; arguments: Record<string, unknown> }; content?: string }
  | { error: Error };

/**
 * In-memory LLM provider for tests. Replies are queued per "channel": the cognitive
 * operation named in the prompt (`Operation: simulate`), `tool-selection` for requests
 * that offer tools, or `default`. Every request is kept for assertions.
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
    const reply = queued && queued.length > 0 ? queued.shift() : this.fallbacks.get(channel);
    if (!reply) {
      throw new Error(`no scripted reply for channel "${channel}"`);
    }
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
