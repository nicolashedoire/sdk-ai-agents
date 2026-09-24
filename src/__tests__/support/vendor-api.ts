import type { Reply } from './local-http-server.js';

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
  text?: string[];
  toolUses?: Array<{ name: string; input: unknown }>;
  model?: string;
  usage?: { input: number; output: number };
}

export function anthropicMessage(reply: AnthropicMessageReply = {}): Reply {
  const content = [
    ...(reply.text ?? []).map((text) => ({ type: 'text', text })),
    ...(reply.toolUses ?? []).map((use, index) => ({
      type: 'tool_use',
      id: `toolu_${index + 1}`,
      name: use.name,
      input: use.input,
    })),
  ];
  return {
    status: 200,
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      model: reply.model ?? 'claude-3-5-sonnet-20241022',
      content,
      stop_reason: reply.toolUses ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: reply.usage?.input ?? 0,
        output_tokens: reply.usage?.output ?? 0,
      },
    },
  };
}

/** An error answer in the OpenAI format (`{ error: { message } }`). */
export function openAIError(
  status: number,
  message: string,
  headers?: Record<string, string>
): Reply {
  return {
    status,
    body: { error: { message, type: 'server_error', code: null } },
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
