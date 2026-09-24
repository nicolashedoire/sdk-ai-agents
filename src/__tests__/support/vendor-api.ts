import type { Reply, ServerSentEvent } from './local-http-server.js';

/**
 * Replies in the wire format of the OpenAI and Anthropic APIs, served by a LocalHttpServer so
 * the real vendor clients (and the SDK's adapters around them) run end to end.
 */

export interface ToolCallReply {
  name: string;
  /** Raw JSON text, as the OpenAI API sends it. */
  arguments: string;
}

export interface OpenAIChatReply {
  content?: string | null;
  toolCalls?: ToolCallReply[];
  model?: string;
  usage?: { prompt: number; completion: number };
  /** Replaces the whole `choices` array, e.g. `[]` for an empty answer. */
  choices?: unknown[];
}

export function openAIChat(reply: OpenAIChatReply = {}): Reply {
  const { usage } = reply;
  return {
    status: 200,
    body: {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1_700_000_000,
      model: reply.model ?? 'gpt-4',
      choices: reply.choices ?? [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: reply.content === undefined ? null : reply.content,
            ...(reply.toolCalls
              ? {
                  tool_calls: reply.toolCalls.map((call, index) => ({
                    id: `call_${index + 1}`,
                    type: 'function',
                    function: { name: call.name, arguments: call.arguments },
                  })),
                }
              : {}),
          },
          finish_reason: reply.toolCalls ? 'tool_calls' : 'stop',
        },
      ],
      ...(usage
        ? {
            usage: {
              prompt_tokens: usage.prompt,
              completion_tokens: usage.completion,
              total_tokens: usage.prompt + usage.completion,
            },
          }
        : {}),
    },
  };
}

export interface AnthropicMessageReply {
  /** Thinking blocks (or redacted ones, `{ redacted: data }`), which come first in the answer. */
  thinking?: Array<{ thinking: string; signature: string } | { redacted: string }>;
  text?: string[];
  /** Calls of the vendor's own tools (web search…), before the tool calls. */
  serverToolUses?: Array<{ name: string; input: unknown }>;
  toolUses?: Array<{ name: string; input: unknown }>;
  model?: string;
  usage?: { input: number; output: number };
}

type AnthropicBlock =
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'text'; text: string }
  | { type: 'server_tool_use' | 'tool_use'; id: string; name: string; input: unknown };

function anthropicContent(reply: AnthropicMessageReply): AnthropicBlock[] {
  return [
    ...(reply.thinking ?? []).map((block) =>
      'redacted' in block
        ? { type: 'redacted_thinking' as const, data: block.redacted }
        : { type: 'thinking' as const, ...block }
    ),
    ...(reply.text ?? []).map((text) => ({ type: 'text' as const, text })),
    ...(reply.serverToolUses ?? []).map((use, index) => ({
      type: 'server_tool_use' as const,
      id: `srvtoolu_${index + 1}`,
      name: use.name,
      input: use.input,
    })),
    ...(reply.toolUses ?? []).map((use, index) => ({
      type: 'tool_use' as const,
      id: `toolu_${index + 1}`,
      name: use.name,
      input: use.input,
    })),
  ];
}

export function anthropicMessage(reply: AnthropicMessageReply = {}): Reply {
  return {
    status: 200,
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: reply.model ?? 'claude-3-5-sonnet-20241022',
      content: anthropicContent(reply),
      stop_reason: reply.toolUses ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: reply.usage?.input ?? 0,
        output_tokens: reply.usage?.output ?? 0,
      },
    },
  };
}

/** An error answer in the OpenAI format (`{ error: { message } }`), with more `fields` if given. */
export function openAIError(
  status: number,
  message: string,
  headers?: Record<string, string>,
  fields: { type?: string; param?: string | null; code?: string | null } = {}
): Reply {
  return {
    status,
    body: { error: { message, type: 'server_error', code: null, ...fields } },
    ...(headers ? { headers } : {}),
  };
}

/** An error answer in the Anthropic format (`{ type: 'error', error: { message } }`). */
export function anthropicError(
  status: number,
  message: string,
  headers?: Record<string, string>
): Reply {
  return {
    status,
    body: { type: 'error', error: { type: 'api_error', message } },
    ...(headers ? { headers } : {}),
  };
}

/** A text cut into pieces of `size` characters, as a stream sends it. */
function pieces(text: string, size: number): string[] {
  const characters = Array.from(text);
  const result: string[] = [];
  for (let start = 0; start < characters.length; start += size) {
    result.push(characters.slice(start, start + size).join(''));
  }
  return result;
}

const sse = (data: unknown, event?: string): ServerSentEvent => ({
  ...(event ? { event } : {}),
  data: JSON.stringify(data),
});

/**
 * The answer `openAIChat(reply)` gives, as the chat completions API streams it
 * (`stream: true`): a first chunk with the role (and the first tool call when there is no
 * text), the text and each tool call's arguments in pieces of `size` characters, a chunk with
 * the finish reason, then `[DONE]`. With `usage`, as with `stream_options.include_usage`, every
 * chunk has `usage: null` and a last chunk without choices carries the usage.
 */
export function openAIChatEvents(reply: OpenAIChatReply = {}, size = 4): ServerSentEvent[] {
  const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) =>
    sse({
      id: 'chatcmpl-test',
      object: 'chat.completion.chunk',
      created: 1_700_000_000,
      model: reply.model ?? 'gpt-4',
      choices,
      ...(reply.usage ? { usage: null } : {}),
      ...extra,
    });
  const delta = (value: Record<string, unknown>, finishReason: string | null = null) =>
    chunk([{ index: 0, delta: value, logprobs: null, finish_reason: finishReason }]);
  const callStart = (call: ToolCallReply, index: number) => ({
    index,
    id: `call_${index + 1}`,
    type: 'function',
    function: { name: call.name, arguments: '' },
  });

  const events: ServerSentEvent[] = [];
  if (!reply.choices || reply.choices.length > 0) {
    const [firstCall] = reply.toolCalls ?? [];
    // Like the API, an answer that opens with a tool call names it in its first chunk.
    const opensWithCall = firstCall !== undefined && !reply.content;
    events.push(
      delta({
        role: 'assistant',
        content: reply.toolCalls ? null : '',
        refusal: null,
        ...(opensWithCall ? { tool_calls: [callStart(firstCall, 0)] } : {}),
      })
    );
    for (const text of pieces(reply.content ?? '', size)) {
      events.push(delta({ content: text }));
    }
    for (const [index, call] of (reply.toolCalls ?? []).entries()) {
      if (index > 0 || !opensWithCall) {
        events.push(delta({ tool_calls: [callStart(call, index)] }));
      }
      for (const text of pieces(call.arguments, size)) {
        events.push(delta({ tool_calls: [{ index, function: { arguments: text } }] }));
      }
    }
    events.push(delta({}, reply.toolCalls ? 'tool_calls' : 'stop'));
  }
  if (reply.usage) {
    events.push(
      chunk([], {
        usage: {
          prompt_tokens: reply.usage.prompt,
          completion_tokens: reply.usage.completion,
          total_tokens: reply.usage.prompt + reply.usage.completion,
        },
      })
    );
  }
  events.push({ data: '[DONE]' });
  return events;
}

/** `openAIChat(reply)` streamed: see `openAIChatEvents`. */
export function openAIChatStream(reply: OpenAIChatReply = {}, size = 4): Reply {
  return { status: 200, stream: { events: openAIChatEvents(reply, size) } };
}

/** The error the chat completions API sends in the middle of a stream. */
export function openAIStreamError(message: string, type = 'server_error'): ServerSentEvent {
  return sse({ error: { message, type, param: null, code: null } });
}

/**
 * The answer `anthropicMessage(reply)` gives, as the Messages API streams it: `message_start`
 * (with the input tokens), then each block between `content_block_start` and
 * `content_block_stop` (text, thinking and tool input in pieces of `size` characters, the
 * thinking's signature apart, a redacted thinking whole in its start event), a `ping`, then
 * `message_delta` (with the output tokens) and `message_stop`.
 */
export function anthropicMessageEvents(
  reply: AnthropicMessageReply = {},
  size = 4
): ServerSentEvent[] {
  const events: ServerSentEvent[] = [
    sse(
      {
        type: 'message_start',
        message: {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          model: reply.model ?? 'claude-3-5-sonnet-20241022',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: reply.usage?.input ?? 0, output_tokens: 1 },
        },
      },
      'message_start'
    ),
  ];
  const delta = (index: number, value: Record<string, unknown>) =>
    sse({ type: 'content_block_delta', index, delta: value }, 'content_block_delta');

  for (const [index, block] of anthropicContent(reply).entries()) {
    const start =
      block.type === 'text'
        ? { type: 'text', text: '' }
        : block.type === 'thinking'
          ? { type: 'thinking', thinking: '', signature: '' }
          : block.type === 'redacted_thinking'
            ? block
            : { type: block.type, id: block.id, name: block.name, input: {} };
    events.push(
      sse({ type: 'content_block_start', index, content_block: start }, 'content_block_start')
    );
    if (index === 0) {
      events.push(sse({ type: 'ping' }, 'ping'));
    }
    if (block.type === 'text') {
      for (const text of pieces(block.text, size)) {
        events.push(delta(index, { type: 'text_delta', text }));
      }
    } else if (block.type === 'thinking') {
      for (const thinking of pieces(block.thinking, size)) {
        events.push(delta(index, { type: 'thinking_delta', thinking }));
      }
      events.push(delta(index, { type: 'signature_delta', signature: block.signature }));
    } else if (block.type === 'tool_use' || block.type === 'server_tool_use') {
      for (const json of pieces(JSON.stringify(block.input), size)) {
        events.push(delta(index, { type: 'input_json_delta', partial_json: json }));
      }
    }
    events.push(sse({ type: 'content_block_stop', index }, 'content_block_stop'));
  }

  events.push(
    sse(
      {
        type: 'message_delta',
        delta: { stop_reason: reply.toolUses ? 'tool_use' : 'end_turn', stop_sequence: null },
        usage: { output_tokens: reply.usage?.output ?? 0 },
      },
      'message_delta'
    ),
    sse({ type: 'message_stop' }, 'message_stop')
  );
  return events;
}

/** `anthropicMessage(reply)` streamed: see `anthropicMessageEvents`. */
export function anthropicMessageStream(reply: AnthropicMessageReply = {}, size = 4): Reply {
  return { status: 200, stream: { events: anthropicMessageEvents(reply, size) } };
}

/** The error the Messages API sends in the middle of a stream (`event: error`). */
export function anthropicStreamError(message: string, type = 'overloaded_error'): ServerSentEvent {
  return sse({ type: 'error', error: { type, message } }, 'error');
}
