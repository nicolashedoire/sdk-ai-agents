import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMProviderError } from '../errors/index.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { FallbackProvider } from '../providers/fallback-provider.js';
import type {
  DiscardedAnswer,
  LLMProvider,
  LLMRequest,
  LLMResponse,
} from '../providers/llm-provider.js';
import { OpenAIProvider, asksForStreamUsage } from '../providers/openai-provider.js';
import { isTransientError } from '../resilience/retry.js';
import { RetryingLLMProvider } from '../resilience/retrying-provider.js';
import { LocalHttpServer, type ServerSentEvent } from './support/local-http-server.js';
import {
  anthropicMessage,
  anthropicMessageEvents,
  anthropicMessageStream,
  anthropicStreamError,
  openAIChat,
  openAIChatEvents,
  openAIChatStream,
  openAIError,
  openAIStreamError,
} from './support/vendor-api.js';

// The real OpenAI and Anthropic clients read Server-Sent Events from local servers that answer
// in each vendor's streaming wire format.

/** What a caller of a streamed request hears: each piece of text, and each restart. */
class Listener {
  readonly heard: string[] = [];

  readonly callbacks = {
    onTextDelta: (delta: string) => {
      this.heard.push(delta);
    },
    onTextRestart: () => {
      this.heard.push('<restart>');
    },
  };

  get deltas(): string[] {
    return this.heard.filter((entry) => entry !== '<restart>');
  }

  /** The text as the caller shows it: each restart erases what came before it. */
  get shown(): string {
    return this.heard.reduce((text, entry) => (entry === '<restart>' ? '' : text + entry), '');
  }
}

/** Settles with the error a call fails with, and fails the test otherwise. */
async function failure(call: Promise<unknown>): Promise<unknown> {
  return call.then(
    () => {
      throw new Error('expected the call to fail');
    },
    (error: unknown) => error
  );
}

/** Waits (briefly) until a condition observed through real I/O holds. */
async function until(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('condition not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The body the client sent, without the fields that ask for a stream. */
function withoutStreaming(body: unknown): Record<string, unknown> {
  const { stream: _stream, stream_options: _options, ...rest } = body as Record<string, unknown>;
  return rest;
}

const calculator = {
  type: 'function' as const,
  function: {
    name: 'calculator',
    description: 'Performs calculations',
    parameters: {
      type: 'object',
      properties: { operation: { type: 'string' }, a: { type: 'number' }, b: { type: 'number' } },
    },
  },
};

const hello = [{ role: 'user' as const, content: 'Hello' }];

/** Client timeout of the idle-stream tests, well above the 100 ms between steady events. */
const IDLE_MS = 600;

describe('OpenAIProvider streaming', () => {
  let server: LocalHttpServer;
  let baseURL: string;
  let provider: OpenAIProvider;

  beforeEach(async () => {
    server = new LocalHttpServer();
    baseURL = `${await server.start()}/v1`;
    // Asks for the usage of streamed answers, as it does by default on OpenAI's own API.
    provider = new OpenAIProvider('test-api-key', 'gpt-4', {
      baseURL,
      maxRetries: 0,
      includeStreamUsage: true,
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('streams the text and returns the response the non-streaming API gives', async () => {
    const reply = {
      content: 'Hello! Here is a streamed answer.',
      model: 'gpt-4-0613',
      usage: { prompt: 12, completion: 8 },
    };
    server.reply(openAIChat(reply), openAIChatStream(reply));
    const request: LLMRequest = {
      model: 'gpt-4',
      messages: hello,
      tools: [calculator],
      temperature: 0.3,
      maxTokens: 200,
    };
    const listener = new Listener();

    const whole = await provider.generateCompletion(request);
    const streamed = await provider.generateCompletion({ ...request, ...listener.callbacks });

    expect(streamed).toEqual(whole);
    expect(streamed).toEqual({
      content: 'Hello! Here is a streamed answer.',
      model: 'gpt-4-0613',
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
    });
    // Piece by piece, and the pieces make the content.
    expect(listener.deltas.length).toBeGreaterThan(5);
    expect(listener.deltas.join('')).toBe(streamed.content);
    // The same request, with the stream (and its usage) asked for.
    expect(server.jsonBody(0)).not.toHaveProperty('stream');
    expect(server.jsonBody(1)).toMatchObject({
      stream: true,
      stream_options: { include_usage: true },
    });
    expect(withoutStreaming(server.jsonBody(1))).toEqual(server.jsonBody(0));
  });

  it('assembles the tool calls sent in pieces, with their ids', async () => {
    const reply = {
      content: 'Let me compute both.',
      toolCalls: [
        { name: 'calculator', arguments: JSON.stringify({ operation: 'add', a: 1, b: 2 }) },
        { name: 'calculator', arguments: JSON.stringify({ operation: 'multiply', a: 3, b: 4 }) },
      ],
      usage: { prompt: 30, completion: 25 },
    };
    server.reply(openAIChat(reply), openAIChatStream(reply, 3));
    const request: LLMRequest = { model: 'gpt-4', messages: hello, tools: [calculator] };
    const listener = new Listener();

    const whole = await provider.generateCompletion(request);
    const streamed = await provider.generateCompletion({ ...request, ...listener.callbacks });

    expect(streamed).toEqual(whole);
    expect(streamed.toolCalls).toEqual([
      {
        id: 'call_1',
        function: { name: 'calculator', arguments: '{"operation":"add","a":1,"b":2}' },
      },
      {
        id: 'call_2',
        function: { name: 'calculator', arguments: '{"operation":"multiply","a":3,"b":4}' },
      },
    ]);
    // Only the text is streamed, not the arguments.
    expect(listener.deltas.join('')).toBe('Let me compute both.');
  });

  it('joins the pieces of each tool call by index, even when the calls interleave', async () => {
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
      data: JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1_700_000_000,
        model: 'gpt-4',
        choices: [{ index: 0, delta, logprobs: null, finish_reason: finish }],
      }),
    });
    const piece = (index: number, value: Record<string, unknown>) =>
      chunk({ tool_calls: [{ index, ...value }] });
    server.reply({
      status: 200,
      stream: {
        events: [
          chunk({ role: 'assistant', content: null }),
          piece(1, { id: 'call_b', type: 'function', function: { name: 'second', arguments: '' } }),
          piece(0, { id: 'call_a', type: 'function', function: { name: 'first', arguments: '' } }),
          piece(0, { function: { arguments: '{"x"' } }),
          piece(1, { function: { arguments: '{"y":' } }),
          piece(0, { function: { arguments: ':1}' } }),
          piece(1, { function: { arguments: '2}' } }),
          chunk({}, 'tool_calls'),
          { data: '[DONE]' },
        ],
      },
    });

    const response = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => undefined,
    });

    expect(response.content).toBeNull();
    expect(response.toolCalls).toEqual([
      { id: 'call_a', function: { name: 'first', arguments: '{"x":1}' } },
      { id: 'call_b', function: { name: 'second', arguments: '{"y":2}' } },
    ]);
    // No usage chunk in this stream: none is made up.
    expect(response.usage).toBeUndefined();
  });

  it('fails with the vendor message, key masked, when an error breaks off the stream', async () => {
    const events = openAIChatEvents({ content: 'This answer will not end' });
    server.reply({
      status: 200,
      stream: {
        events: [
          ...events.slice(0, 3),
          openAIStreamError('The server had an error. Key sk-proj-abcdef123456 was used.'),
        ],
      },
    });
    const listener = new Listener();

    const error = await failure(
      provider.generateCompletion({ model: 'gpt-4', messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    const providerError = error as LLMProviderError;
    expect(providerError.provider).toBe('openai');
    expect(providerError.message).toContain('The server had an error');
    expect(providerError.message).toContain('sk-***');
    expect(providerError.message).not.toContain('abcdef123456');
    // Like its HTTP counterpart (a 500), the error is worth a retry.
    expect(isTransientError(providerError)).toBe(true);
    // What came before the error was passed on.
    expect(listener.deltas.join('')).toBe('This ans');
  });

  it("reads an error type only on the vendors' API errors", () => {
    // Any other error without a status, even with a vendor-like type, is not transient.
    const lookalike = Object.assign(new Error('not from a vendor'), { type: 'server_error' });
    expect(isTransientError(lookalike)).toBe(false);
    expect(isTransientError(new LLMProviderError('openai', lookalike))).toBe(false);
  });

  it('keeps a request error that is no server failure from being retried', async () => {
    server.reply({
      status: 200,
      stream: { events: [openAIStreamError('Invalid prompt', 'invalid_request_error')] },
    });

    const error = await failure(
      provider.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} })
    );

    expect((error as Error).message).toContain('Invalid prompt');
    expect(isTransientError(error)).toBe(false);
  });

  it('fails as a connection failure when the stream ends before the answer is complete', async () => {
    const events = openAIChatEvents({ content: 'Cut short by a proxy' });
    // The answer ends cleanly, yet without its finish reason (nor `[DONE]`).
    server.reply({ status: 200, stream: { events: events.slice(0, 4) } });

    const error = await failure(
      provider.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect((error as Error).message).toContain('ended before the answer was complete');
    // Like a dropped connection, it is worth a retry or a fallback.
    expect((error as LLMProviderError).connectionFailure).toBe(true);
    expect(isTransientError(error)).toBe(true);
  });

  it('fails as a connection failure when the connection drops mid-stream', async () => {
    const events = openAIChatEvents({ content: 'Dropped halfway' });
    server.reply({ status: 200, stream: { events: events.slice(0, 3), then: 'cut' } });
    const listener = new Listener();

    const error = await failure(
      provider.generateCompletion({ model: 'gpt-4', messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect(isTransientError(error)).toBe(true);
    expect(listener.deltas.join('')).toBe('Dropped ');
  });

  it('passes each piece on as it arrives, and stops reading when aborted', async () => {
    const events = openAIChatEvents({ content: 'First words, then silence' });
    // Two pieces of text, then the answer stays open: nothing would come without streaming.
    server.reply({ status: 200, stream: { events: events.slice(0, 3), then: 'hang' } });
    const controller = new AbortController();
    const listener = new Listener();

    const outcome = failure(
      provider.generateCompletion({
        model: 'gpt-4',
        messages: hello,
        abortSignal: controller.signal,
        ...listener.callbacks,
      })
    );
    await until(() => listener.deltas.length === 2);
    controller.abort();

    expect(await outcome).toHaveProperty('message', 'Request aborted');
    // The HTTP request is cut: the server sees the client leave the open answer.
    await until(() => server.requests[0]?.clientClosed === true);
    expect(listener.deltas).toEqual(['Firs', 't wo']);
  });

  it('cuts a stream that sends nothing for the client timeout, as a connection failure', async () => {
    const patient = new OpenAIProvider('test-api-key', 'gpt-4', {
      baseURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    const events = openAIChatEvents({ content: 'First words, then silence' });
    server.reply({ status: 200, stream: { events: events.slice(0, 3), then: 'hang' } });
    const listener = new Listener();

    const error = await failure(
      patient.generateCompletion({ model: 'gpt-4', messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect((error as Error).message).toContain(`The answer stream sent nothing for ${IDLE_MS} ms`);
    expect((error as LLMProviderError).connectionFailure).toBe(true);
    expect(isTransientError(error)).toBe(true);
    expect(listener.deltas).toEqual(['Firs', 't wo']);
    await until(() => server.requests[0]?.clientClosed === true);
  });

  it('cuts a stream that sends nothing at all after its headers', async () => {
    const patient = new OpenAIProvider('test-api-key', 'gpt-4', {
      baseURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    server.reply({ status: 200, stream: { events: [], then: 'hang' } });

    const error = await failure(
      patient.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} })
    );

    expect((error as Error).message).toContain(`The answer stream sent nothing for ${IDLE_MS} ms`);
    expect((error as LLMProviderError).connectionFailure).toBe(true);
  });

  it('does not cut a stream whose events keep coming, however long it lasts', async () => {
    const patient = new OpenAIProvider('test-api-key', 'gpt-4', {
      baseURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    // Events 100 ms apart: longer than the timeout in all, never silent for as long.
    const events = openAIChatEvents({ content: 'Slow but steady answer' });
    server.reply({ status: 200, stream: { events, intervalMs: 100 } });

    const response = await patient.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => {},
    });

    // Longer in all than the timeout, so it would be cut if the timer did not restart.
    expect(events.length * 100).toBeGreaterThan(IDLE_MS);
    expect(response.content).toBe('Slow but steady answer');
  });

  it('reads a first chunk that names both the role and the first tool call', async () => {
    const reply = {
      toolCalls: [{ name: 'calculator', arguments: JSON.stringify({ a: 1, b: 2 }) }],
      usage: { prompt: 20, completion: 9 },
    };
    server.reply(openAIChat(reply), openAIChatStream(reply));
    const request: LLMRequest = { model: 'gpt-4', messages: hello, tools: [calculator] };

    const whole = await provider.generateCompletion(request);
    const streamed = await provider.generateCompletion({ ...request, onTextDelta: () => {} });

    expect(streamed).toEqual(whole);
    expect(streamed.toolCalls).toEqual([
      { id: 'call_1', function: { name: 'calculator', arguments: '{"a":1,"b":2}' } },
    ]);
    expect(streamed.usage).toEqual({ promptTokens: 20, completionTokens: 9, totalTokens: 29 });
  });

  it('keeps tool calls apart when a compatible server leaves out their index', async () => {
    const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({
      data: JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1_700_000_000,
        model: 'local-model',
        choices: [{ index: 0, delta, finish_reason: finish }],
      }),
    });
    const piece = (value: Record<string, unknown>) => chunk({ tool_calls: [value] });
    server.reply({
      status: 200,
      stream: {
        events: [
          chunk({ role: 'assistant' }),
          piece({ id: 'call_a', type: 'function', function: { name: 'first', arguments: '' } }),
          piece({ function: { arguments: '{"x":' } }),
          piece({ function: { arguments: '1}' } }),
          piece({
            id: 'call_b',
            type: 'function',
            function: { name: 'second', arguments: '{"y"' },
          }),
          piece({ function: { arguments: ':2}' } }),
          chunk({}, 'tool_calls'),
          { data: '[DONE]' },
        ],
      },
    });

    const response = await provider.generateCompletion({
      model: 'local-model',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response.toolCalls).toEqual([
      { id: 'call_a', function: { name: 'first', arguments: '{"x":1}' } },
      { id: 'call_b', function: { name: 'second', arguments: '{"y":2}' } },
    ]);
  });

  it('reads the choice of index 0 only, wherever it is in a chunk', async () => {
    const chunk = (choices: unknown[]) => ({
      data: JSON.stringify({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 1_700_000_000,
        model: 'gpt-4',
        choices,
      }),
    });
    const choice = (index: number, content: string | null, finish: string | null = null) => ({
      index,
      delta: content === null ? {} : { content },
      finish_reason: finish,
    });
    server.reply({
      status: 200,
      stream: {
        events: [
          chunk([choice(1, 'Other '), choice(0, 'Mine ')]),
          chunk([choice(1, 'answer'), choice(0, 'answer')]),
          chunk([choice(1, null, 'stop'), choice(0, null, 'stop')]),
          { data: '[DONE]' },
        ],
      },
    });
    const listener = new Listener();

    const response = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      ...listener.callbacks,
    });

    expect(response.content).toBe('Mine answer');
    expect(listener.deltas).toEqual(['Mine ', 'answer']);
  });

  it("asks for the usage only on OpenAI's own API, unless told otherwise", async () => {
    expect(asksForStreamUsage('https://api.openai.com/v1')).toBe(true);
    expect(asksForStreamUsage('https://api.openai.com/v1/')).toBe(true);
    // Regional hosts are OpenAI's own API too.
    expect(asksForStreamUsage('https://eu.api.openai.com/v1')).toBe(true);
    expect(asksForStreamUsage('https://us.api.openai.com/v1/')).toBe(true);
    expect(asksForStreamUsage('https://api.openai.com.example.net/v1')).toBe(false);
    expect(asksForStreamUsage('https://proxy.example.net/api.openai.com/v1')).toBe(false);
    expect(asksForStreamUsage('https://api.openai.com/v1', false)).toBe(false);
    expect(asksForStreamUsage('http://127.0.0.1:8080/v1')).toBe(false);
    expect(asksForStreamUsage('http://127.0.0.1:8080/v1', true)).toBe(true);
    // A compatible server by default: no stream_options, so no usage, and none made up.
    const compatible = new OpenAIProvider('test-api-key', 'gpt-4', { baseURL, maxRetries: 0 });
    server.reply(openAIChatStream({ content: 'Answer without usage' }));

    const response = await compatible.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response.content).toBe('Answer without usage');
    expect(response.usage).toBeUndefined();
    expect(server.jsonBody(0)).toMatchObject({ stream: true });
    expect(server.jsonBody(0)).not.toHaveProperty('stream_options');
  });

  it('asks again without stream_options when a server refuses it, and stops sending it', async () => {
    server.reply(
      openAIError(400, 'Unrecognized request argument supplied: stream_options', undefined, {
        type: 'invalid_request_error',
        param: 'stream_options',
      }),
      openAIChatStream({ content: 'First answer' }),
      openAIChatStream({ content: 'Second answer' })
    );
    const listener = new Listener();

    const first = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      ...listener.callbacks,
    });
    const second = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(first.content).toBe('First answer');
    expect(second.content).toBe('Second answer');
    expect(first.usage).toBeUndefined();
    expect(listener.heard.join('')).toBe('First answer');
    expect(server.requests).toHaveLength(3);
    expect(server.jsonBody(0)).toHaveProperty('stream_options');
    expect(server.jsonBody(1)).not.toHaveProperty('stream_options');
    expect(server.jsonBody(2)).not.toHaveProperty('stream_options');
  });

  it('also takes a 422 whose message names stream_options as a refusal of the field', async () => {
    server.reply(
      openAIError(422, 'Extra inputs are not permitted: body.stream_options'),
      openAIChatStream({ content: 'Answer' })
    );

    const response = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response.content).toBe('Answer');
    expect(server.jsonBody(1)).toMatchObject({ stream: true });
    expect(server.jsonBody(1)).not.toHaveProperty('stream_options');
  });

  it('answers in one piece, without streaming, a model the API refuses to stream', async () => {
    const unverified = openAIError(
      400,
      'Your organization must be verified to stream this model. Please go to: https://platform.openai.com/settings/organization/general and click on Verify Organization.',
      undefined,
      { type: 'invalid_request_error', param: 'stream', code: 'unsupported_value' }
    );
    server.reply(
      // Refused with stream_options, then again without it: streaming is what is refused.
      unverified,
      unverified,
      openAIChat({ content: 'Whole answer', usage: { prompt: 10, completion: 3 } }),
      openAIChat({ content: 'Whole again' }),
      openAIChatStream({ content: 'Streamed' })
    );
    const first = new Listener();
    const second = new Listener();
    const other = new Listener();

    const refused = await provider.generateCompletion({
      model: 'o3',
      messages: hello,
      ...first.callbacks,
    });
    const again = await provider.generateCompletion({
      model: 'o3',
      messages: hello,
      ...second.callbacks,
    });
    const streamed = await provider.generateCompletion({
      model: 'gpt-4o',
      messages: hello,
      ...other.callbacks,
    });

    expect(refused).toMatchObject({
      content: 'Whole answer',
      usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 },
    });
    expect(first.heard).toEqual(['Whole answer']);
    // The model is no longer asked to stream; another model still is.
    expect(again.content).toBe('Whole again');
    expect(second.heard).toEqual(['Whole again']);
    expect(streamed.content).toBe('Streamed');
    expect(other.heard.length).toBeGreaterThan(1);
    expect(
      server.requests.map((request) => (JSON.parse(request.body) as { stream?: boolean }).stream)
    ).toEqual([true, true, undefined, undefined, true]);
    // The refusal was not about stream_options: the usage is still asked for.
    expect(server.jsonBody(1)).not.toHaveProperty('stream_options');
    expect(server.jsonBody(4)).toHaveProperty('stream_options');
  });

  it('recognizes a refusal to stream by its message, whatever its param', async () => {
    const compatible = new OpenAIProvider('test-api-key', 'gpt-4', { baseURL, maxRetries: 0 });
    server.reply(
      openAIError(400, 'Your organization must be verified to stream this model.', undefined, {
        type: 'invalid_request_error',
        param: null,
      }),
      openAIChat({ content: 'Whole answer' })
    );
    const listener = new Listener();

    const response = await compatible.generateCompletion({
      model: 'o3',
      messages: hello,
      ...listener.callbacks,
    });

    expect(response.content).toBe('Whole answer');
    expect(listener.heard).toEqual(['Whole answer']);
  });

  /** A server that refuses stream_options with `refusal`, then streams. */
  async function refusedThenAnswered(refusal: { status: number; body: unknown }) {
    server.reply(refusal, openAIChatStream({ content: 'Answer' }), openAIChatStream({}));

    const response = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => {},
    });
    await provider.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} });

    expect(response.content).toBe('Answer');
    expect(server.jsonBody(0)).toHaveProperty('stream_options');
    expect(server.jsonBody(1)).not.toHaveProperty('stream_options');
    expect(server.jsonBody(2)).not.toHaveProperty('stream_options');
  }

  it('asks again without stream_options after a 422 that is not in the OpenAI format', async () => {
    // A FastAPI server's validation error: the client reads no OpenAI error in it.
    await refusedThenAnswered({
      status: 422,
      body: {
        detail: [
          {
            loc: ['body', 'stream_options'],
            msg: 'Extra inputs are not permitted',
            type: 'extra_forbidden',
          },
        ],
      },
    });
  });

  it('asks again without stream_options after a 400 with its error at the top level', async () => {
    // As some compatible servers answer: no `error` object for the client to read.
    await refusedThenAnswered({
      status: 400,
      body: { object: 'error', message: 'Unknown field', type: 'BadRequestError', code: 400 },
    });
  });

  it('keeps asking for the usage when the request was refused for another reason', async () => {
    const tooLong = openAIError(
      400,
      "This model's maximum context length is 128000 tokens.",
      undefined,
      {
        type: 'invalid_request_error',
        param: 'messages',
        code: 'context_length_exceeded',
      }
    );
    server.reply(tooLong, tooLong, openAIChatStream({ content: 'Shorter' }));

    const error = await failure(
      provider.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} })
    );
    const next = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      onTextDelta: () => {},
    });

    expect((error as Error).message).toContain('maximum context length');
    expect(next.content).toBe('Shorter');
    // Refused without the field too: the field was not the problem, and is still sent.
    expect(server.jsonBody(1)).not.toHaveProperty('stream_options');
    expect(server.jsonBody(2)).toHaveProperty('stream_options');
  });

  it('asks again without stream_options even when a concurrent call turned it off first', async () => {
    const refusal = openAIError(400, 'Unknown field', undefined, { param: 'stream_options' });
    // The second refusal arrives once the first call has been answered without the field.
    server.reply(
      refusal,
      { ...refusal, delayMs: 300 },
      openAIChatStream({ content: 'First' }),
      openAIChatStream({ content: 'Second' })
    );

    const answers = await Promise.all([
      provider.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} }),
      provider.generateCompletion({ model: 'gpt-4', messages: hello, onTextDelta: () => {} }),
    ]);

    expect(answers.map((answer) => answer.content).sort()).toEqual(['First', 'Second']);
    expect(server.requests).toHaveLength(4);
  });

  it('answers without streaming when nobody listens to the text', async () => {
    server.reply(openAIChat({ content: 'Whole' }));

    const response = await provider.generateCompletion({ model: 'gpt-4', messages: hello });

    expect(response.content).toBe('Whole');
    expect(server.jsonBody(0)).not.toHaveProperty('stream');
    expect(server.jsonBody(0)).not.toHaveProperty('stream_options');
  });

  it('fails like the non-streaming API when the answer has no choice, reporting its usage once', async () => {
    server.reply(openAIChatStream({ choices: [], usage: { prompt: 10, completion: 0 } }));
    const discarded: DiscardedAnswer[] = [];

    const error = await failure(
      provider.generateCompletion({
        model: 'gpt-4',
        messages: hello,
        onTextDelta: () => {},
        onDiscardedAnswer: (answer) => discarded.push(answer),
      })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect((error as Error).message).toContain('No response from LLM');
    expect(discarded).toEqual([
      {
        provider: 'openai',
        model: 'gpt-4',
        requestedModel: 'gpt-4',
        usage: { promptTokens: 10, completionTokens: 0, totalTokens: 10 },
        reason: 'No response from LLM',
      },
    ]);
  });

  it('reports once the usage of an empty answer given without streaming', async () => {
    const compatible = new OpenAIProvider('test-api-key', 'gpt-4', { baseURL, maxRetries: 0 });
    server.reply(
      openAIError(400, 'Streaming is not supported for this model', undefined, { param: 'stream' }),
      openAIChat({ choices: [], usage: { prompt: 7, completion: 0 } })
    );
    const discarded: DiscardedAnswer[] = [];

    const error = await failure(
      compatible.generateCompletion({
        model: 'o3',
        messages: hello,
        onTextDelta: () => {},
        onDiscardedAnswer: (answer) => discarded.push(answer),
      })
    );

    expect((error as Error).message).toContain('No response from LLM');
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.usage).toEqual({ promptTokens: 7, completionTokens: 0, totalTokens: 7 });
  });
});

describe('AnthropicProvider streaming', () => {
  const MODEL = 'claude-3-5-haiku-20241022';
  let server: LocalHttpServer;
  let baseURL: string;
  let provider: AnthropicProvider;

  beforeEach(async () => {
    server = new LocalHttpServer();
    baseURL = await server.start();
    provider = new AnthropicProvider('test-api-key', MODEL, { baseURL, maxRetries: 0 });
  });

  afterEach(async () => {
    await server.stop();
  });

  it('streams the text and returns the response the non-streaming API gives', async () => {
    const reply = {
      text: ['Hello! Here is a streamed answer.', 'And a second block.'],
      model: 'claude-3-5-haiku-20241022',
      usage: { input: 25, output: 14 },
    };
    server.reply(anthropicMessage(reply), anthropicMessageStream(reply));
    const request: LLMRequest = { model: MODEL, messages: hello, maxTokens: 300 };
    const listener = new Listener();

    const whole = await provider.generateCompletion(request);
    const streamed = await provider.generateCompletion({ ...request, ...listener.callbacks });

    expect(streamed).toEqual(whole);
    expect(streamed).toEqual({
      content: 'Hello! Here is a streamed answer.\n\nAnd a second block.',
      model: 'claude-3-5-haiku-20241022',
      // Input tokens from message_start, output tokens from message_delta.
      usage: { promptTokens: 25, completionTokens: 14, totalTokens: 39 },
    });
    // The pieces make the content, blank line between the blocks included.
    expect(listener.deltas.length).toBeGreaterThan(5);
    expect(listener.deltas.join('')).toBe(streamed.content);
    expect(server.jsonBody(0)).not.toHaveProperty('stream');
    expect(server.jsonBody(1)).toMatchObject({ stream: true });
    expect(withoutStreaming(server.jsonBody(1))).toEqual(server.jsonBody(0));
  });

  it('assembles the tool input sent in JSON pieces and keeps the thinking blocks', async () => {
    const reply = {
      thinking: [
        { thinking: 'The user wants a sum of two numbers.', signature: 'sig-abc123' },
        { redacted: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds' },
      ],
      text: ['I will add them.'],
      toolUses: [{ name: 'calculator', input: { operation: 'add', a: 1, b: 2 } }],
      usage: { input: 40, output: 30 },
    };
    server.reply(anthropicMessage(reply), anthropicMessageStream(reply, 5));
    const request: LLMRequest = { model: MODEL, messages: hello, tools: [calculator] };
    const listener = new Listener();

    const whole = await provider.generateCompletion(request);
    const streamed = await provider.generateCompletion({ ...request, ...listener.callbacks });

    expect(streamed).toEqual(whole);
    expect(streamed.toolCalls).toEqual([
      {
        id: 'toolu_1',
        function: { name: 'calculator', arguments: '{"operation":"add","a":1,"b":2}' },
      },
    ]);
    // The turn is kept as the vendor sent it, thinking and signature included.
    expect(streamed.vendorContent).toEqual({
      provider: 'anthropic',
      content: [
        {
          type: 'thinking',
          thinking: 'The user wants a sum of two numbers.',
          signature: 'sig-abc123',
        },
        {
          type: 'redacted_thinking',
          data: 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds',
        },
        { type: 'text', text: 'I will add them.' },
        {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'calculator',
          input: { operation: 'add', a: 1, b: 2 },
        },
      ],
    });
    // Only the text is streamed: neither the thinking nor the tool input.
    expect(listener.deltas.join('')).toBe('I will add them.');
  });

  it('fails with the vendor message when an error breaks off the stream', async () => {
    const events = anthropicMessageEvents({ text: ['This answer will not end'] });
    server.reply({
      status: 200,
      stream: { events: [...events.slice(0, 5), anthropicStreamError('Overloaded')] },
    });
    const listener = new Listener();

    const error = await failure(
      provider.generateCompletion({ model: MODEL, messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    const providerError = error as LLMProviderError;
    expect(providerError.provider).toBe('anthropic');
    expect(providerError.message).toContain('Overloaded');
    // Like its HTTP counterpart (a 529), the error is worth a retry.
    expect(isTransientError(providerError)).toBe(true);
    expect(listener.deltas.join('')).toBe('This ans');
  });

  it('masks an API key the vendor echoes in a stream error, and does not retry a bad request', async () => {
    server.reply({
      status: 200,
      stream: {
        events: [
          anthropicStreamError(
            'Invalid request for key sk-ant-api03-abcdef123456',
            'invalid_request_error'
          ),
        ],
      },
    });

    const error = await failure(
      provider.generateCompletion({ model: MODEL, messages: hello, onTextDelta: () => {} })
    );

    expect((error as Error).message).toContain('sk-***');
    expect((error as Error).message).not.toContain('abcdef123456');
    expect(isTransientError(error)).toBe(false);
  });

  it('fails as a connection failure when the connection drops mid-stream', async () => {
    const events = anthropicMessageEvents({ text: ['Dropped halfway'] });
    server.reply({ status: 200, stream: { events: events.slice(0, 5), then: 'cut' } });
    const listener = new Listener();

    const error = await failure(
      provider.generateCompletion({ model: MODEL, messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect(isTransientError(error)).toBe(true);
    expect(listener.deltas.join('')).toBe('Dropped ');
  });

  it('passes each piece on as it arrives, and stops reading when aborted', async () => {
    const events = anthropicMessageEvents({ text: ['First words, then silence'] });
    server.reply({ status: 200, stream: { events: events.slice(0, 5), then: 'hang' } });
    const controller = new AbortController();
    const listener = new Listener();

    const outcome = failure(
      provider.generateCompletion({
        model: MODEL,
        messages: hello,
        abortSignal: controller.signal,
        ...listener.callbacks,
      })
    );
    await until(() => listener.deltas.length === 2);
    controller.abort();

    expect(await outcome).toHaveProperty('message', 'Request aborted');
    // The HTTP request is cut: the server sees the client leave the open answer.
    await until(() => server.requests[0]?.clientClosed === true);
    expect(listener.deltas).toEqual(['Firs', 't wo']);
  });

  it('gives tool inputs with numbers in exponent notation exactly as sent', async () => {
    // JSON.stringify writes these as 1e-7 and 2.5e+21, which the vendor client's partial JSON
    // parser misreads (as 17 and 2.521).
    const input = { a: 1e-7, b: 2.5e21, note: 'small and large' };
    const reply = {
      serverToolUses: [{ name: 'web_search', input: { query: 'avogadro', limit: 6.02e23 } }],
      toolUses: [{ name: 'calculator', input }],
    };
    server.reply(anthropicMessage(reply), anthropicMessageStream(reply, 3));
    const request: LLMRequest = { model: MODEL, messages: hello, tools: [calculator] };

    const whole = await provider.generateCompletion(request);
    const streamed = await provider.generateCompletion({ ...request, onTextDelta: () => {} });

    expect(streamed).toEqual(whole);
    expect(JSON.parse(streamed.toolCalls?.[0]?.function.arguments ?? '')).toEqual(input);
    expect(streamed.vendorContent?.content).toEqual([
      {
        type: 'server_tool_use',
        id: 'srvtoolu_1',
        name: 'web_search',
        input: { query: 'avogadro', limit: 6.02e23 },
      },
      { type: 'tool_use', id: 'toolu_1', name: 'calculator', input },
    ]);
  });

  it('keeps the input {} of a tool called without arguments', async () => {
    const reply = { toolUses: [{ name: 'now', input: {} }] };
    server.reply(anthropicMessageStream(reply));

    const response = await provider.generateCompletion({
      model: MODEL,
      messages: hello,
      onTextDelta: () => {},
    });

    expect(response.toolCalls).toEqual([
      { id: 'toolu_1', function: { name: 'now', arguments: '{}' } },
    ]);
  });

  it('fails as a connection failure when the stream ends before the message is complete', async () => {
    const events = anthropicMessageEvents({ text: ['Cut short by a proxy'] });
    // The answer ends cleanly after a few pieces, without message_stop.
    server.reply({ status: 200, stream: { events: events.slice(0, 5) } });
    const listener = new Listener();

    const error = await failure(
      provider.generateCompletion({ model: MODEL, messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect((error as Error).message).toContain('ended before the answer was complete');
    expect((error as LLMProviderError).connectionFailure).toBe(true);
    expect(isTransientError(error)).toBe(true);
    expect(listener.deltas.join('')).toBe('Cut shor');
  });

  it('cuts a stream that sends nothing for the client timeout, as a connection failure', async () => {
    const patient = new AnthropicProvider('test-api-key', MODEL, {
      baseURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    const events = anthropicMessageEvents({ text: ['First words, then silence'] });
    server.reply({ status: 200, stream: { events: events.slice(0, 5), then: 'hang' } });
    const listener = new Listener();

    const error = await failure(
      patient.generateCompletion({ model: MODEL, messages: hello, ...listener.callbacks })
    );

    expect(error).toBeInstanceOf(LLMProviderError);
    expect((error as Error).message).toContain(`The answer stream sent nothing for ${IDLE_MS} ms`);
    expect((error as LLMProviderError).connectionFailure).toBe(true);
    expect(isTransientError(error)).toBe(true);
    expect(listener.deltas).toEqual(['Firs', 't wo']);
    await until(() => server.requests[0]?.clientClosed === true);
  });

  it('cuts a stream that sends nothing but pings after its headers', async () => {
    const patient = new AnthropicProvider('test-api-key', MODEL, {
      baseURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    server.reply({
      status: 200,
      stream: { events: [{ event: 'ping', data: '{"type": "ping"}' }], then: 'hang' },
    });

    const error = await failure(
      patient.generateCompletion({ model: MODEL, messages: hello, onTextDelta: () => {} })
    );

    expect((error as Error).message).toContain(`The answer stream sent nothing for ${IDLE_MS} ms`);
    expect((error as LLMProviderError).connectionFailure).toBe(true);
  });

  it('does not cut a stream whose events keep coming, however long it lasts', async () => {
    const patient = new AnthropicProvider('test-api-key', MODEL, {
      baseURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    const events = anthropicMessageEvents({ text: ['Slow but steady answer'] });
    server.reply({ status: 200, stream: { events, intervalMs: 100 } });

    const response = await patient.generateCompletion({
      model: MODEL,
      messages: hello,
      onTextDelta: () => {},
    });

    // Longer in all than the timeout, so it would be cut if the timer did not restart.
    expect(events.length * 100).toBeGreaterThan(IDLE_MS);
    expect(response.content).toBe('Slow but steady answer');
  });
});

/**
 * Provider double that streams a text, fails, then sends one more piece once it has failed
 * (a late delta that must not reach the caller), or answers when given a text to answer. With
 * `restartFirst`, it restarts before writing anything, as a wrapper of its own could.
 */
class StreamingDouble implements LLMProvider {
  readonly requests: LLMRequest[] = [];

  constructor(
    private readonly name: string,
    private readonly outcomes: Array<{ stream: string[]; fail?: Error; restartFirst?: boolean }>
  ) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);
    const outcome = this.outcomes.shift();
    if (!outcome) throw new Error('no outcome left');
    if (outcome.restartFirst) request.onTextRestart?.();
    for (const piece of outcome.stream) {
      request.onTextDelta?.(piece);
    }
    if (outcome.fail) {
      setTimeout(() => request.onTextDelta?.('<late>'), 0);
      throw outcome.fail;
    }
    return { content: outcome.stream.join('') || null, model: 'double' };
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return this.name;
  }
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

const noWait = { maxRetries: 2, initialDelayMs: 0, maxDelayMs: 0, jitter: false };

describe('retries and fallbacks of a streamed answer', () => {
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let openaiURL: string;
  let openaiProvider: OpenAIProvider;
  let anthropicProvider: AnthropicProvider;

  beforeEach(async () => {
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
    let anthropicURL: string;
    [openaiURL, anthropicURL] = await Promise.all([
      openai.start().then((address) => `${address}/v1`),
      anthropic.start(),
    ]);
    openaiProvider = new OpenAIProvider('test-openai-key', 'gpt-4', {
      baseURL: openaiURL,
      maxRetries: 0,
    });
    anthropicProvider = new AnthropicProvider('test-anthropic-key', 'claude-3-5-haiku-20241022', {
      baseURL: anthropicURL,
      maxRetries: 0,
    });
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop()]);
  });

  /** A stream that sends `sent` of the answer's pieces, then breaks off. */
  const brokenOpenAI = (content: string, sent: number, end: ServerSentEvent | 'cut') => ({
    status: 200,
    stream:
      end === 'cut'
        ? { events: openAIChatEvents({ content }).slice(0, sent + 1), then: 'cut' as const }
        : { events: [...openAIChatEvents({ content }).slice(0, sent + 1), end] },
  });

  it('tells the caller to discard the text of an attempt that failed, before the retry', async () => {
    openai.reply(
      brokenOpenAI('Hello from the first try', 2, 'cut'),
      openAIChatStream({ content: 'Hello from the retry' })
    );
    const retries: number[] = [];
    const provider = new RetryingLLMProvider(openaiProvider, noWait, (info) => {
      retries.push(info.retry);
    });
    const listener = new Listener();

    const response = await provider.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      ...listener.callbacks,
    });

    expect(response.content).toBe('Hello from the retry');
    expect(retries).toEqual([1]);
    expect(listener.heard).toEqual([
      'Hell',
      'o fr',
      '<restart>',
      'Hell',
      'o fr',
      'om t',
      'he r',
      'etry',
    ]);
    expect(listener.shown).toBe('Hello from the retry');
  });

  it('does not restart when the failed attempt streamed nothing', async () => {
    openai.reply(openAIError(503, 'Unavailable'), openAIChatStream({ content: 'Fine now' }));
    const provider = new RetryingLLMProvider(openaiProvider, noWait);
    const listener = new Listener();

    await provider.generateCompletion({ model: 'gpt-4', messages: hello, ...listener.callbacks });

    expect(listener.heard.join('')).toBe('Fine now');
    expect(listener.heard).not.toContain('<restart>');
  });

  it('tells the caller to discard the text of a provider that failed, before the fallback', async () => {
    openai.reply(
      brokenOpenAI('Hello from OpenAI', 2, openAIStreamError('The server had an error'))
    );
    anthropic.reply(anthropicMessageStream({ text: ['Hello from Anthropic'] }));
    const chain = new FallbackProvider(openaiProvider, [anthropicProvider]);
    const listener = new Listener();

    const result = await chain.generateCompletionWithFallback({
      model: 'gpt-4',
      messages: hello,
      ...listener.callbacks,
    });

    expect(result).toMatchObject({ usedProvider: 'anthropic', wasFallback: true });
    expect(result.response.content).toBe('Hello from Anthropic');
    expect(listener.heard.slice(0, 3)).toEqual(['Hell', 'o fr', '<restart>']);
    expect(listener.shown).toBe('Hello from Anthropic');
    // The fallback streams too.
    expect(anthropic.jsonBody(0)).toMatchObject({ stream: true });
  });

  it('restarts once per failed attempt through retries inside a fallback chain', async () => {
    openai.reply(
      brokenOpenAI('First attempt', 1, 'cut'),
      brokenOpenAI('Second attempt', 2, openAIStreamError('The server had an error'))
    );
    anthropic.reply(anthropicMessageStream({ text: ['Answer'] }));
    const chain = new FallbackProvider(
      new RetryingLLMProvider(openaiProvider, { ...noWait, maxRetries: 1 }),
      [new RetryingLLMProvider(anthropicProvider, noWait)]
    );
    const listener = new Listener();

    const response = await chain.generateCompletion({
      model: 'gpt-4',
      messages: hello,
      ...listener.callbacks,
    });

    expect(response.content).toBe('Answer');
    expect(listener.heard).toEqual([
      'Firs',
      '<restart>',
      'Seco',
      'nd a',
      '<restart>',
      'Answ',
      'er',
    ]);
  });

  it('retries a stream that stalled, after telling the caller to discard its text', async () => {
    const patient = new OpenAIProvider('test-openai-key', 'gpt-4', {
      baseURL: openaiURL,
      maxRetries: 0,
      timeout: IDLE_MS,
    });
    openai.reply(
      {
        status: 200,
        stream: {
          events: openAIChatEvents({ content: 'Stalled answer' }).slice(0, 3),
          then: 'hang',
        },
      },
      openAIChatStream({ content: 'Fresh answer' })
    );
    const listener = new Listener();

    const response = await new RetryingLLMProvider(patient, noWait).generateCompletion({
      model: 'gpt-4',
      messages: hello,
      ...listener.callbacks,
    });

    expect(response.content).toBe('Fresh answer');
    expect(listener.heard.slice(0, 3)).toEqual(['Stal', 'led ', '<restart>']);
    expect(listener.shown).toBe('Fresh answer');
    expect(openai.requests).toHaveLength(2);
  });

  it('passes a restart on only when the attempt had streamed text', async () => {
    const quiet = new StreamingDouble('quiet', [{ stream: ['answer'], restartFirst: true }]);
    const listener = new Listener();

    const response = await new FallbackProvider(quiet).generateCompletion({
      model: 'm',
      messages: hello,
      ...listener.callbacks,
    });

    expect(response.content).toBe('answer');
    expect(listener.heard).toEqual(['answer']);
  });

  it('drops what a failed attempt still sends once it has failed', async () => {
    const primary = new StreamingDouble('primary', [
      { stream: ['par', 'tial'], fail: new HttpError(503) },
      { stream: ['whole ', 'answer'] },
    ]);
    const provider = new RetryingLLMProvider(primary, noWait);
    const listener = new Listener();

    const response = await provider.generateCompletion({
      model: 'm',
      messages: hello,
      ...listener.callbacks,
    });
    // Give the late delta of the failed attempt its chance to arrive.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(response.content).toBe('whole answer');
    expect(listener.heard).toEqual(['par', 'tial', '<restart>', 'whole ', 'answer']);
  });

  it('leaves a request without text callbacks untouched', async () => {
    const primary = new StreamingDouble('primary', [{ stream: ['quiet'] }]);
    const failing = new StreamingDouble('failing', [{ stream: [], fail: new HttpError(400) }]);
    const request: LLMRequest = { model: 'm', messages: hello };

    await new FallbackProvider(new RetryingLLMProvider(failing, noWait), [primary])
      .generateCompletion(request)
      .catch(() => undefined);

    expect(primary.requests[0]).not.toHaveProperty('onTextDelta');
    expect(primary.requests[0]).not.toHaveProperty('onTextRestart');
  });
});
