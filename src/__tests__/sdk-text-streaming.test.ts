import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../providers/llm-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { createSDK, type SDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';
import type { SDKConfig } from '../types/sdk.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK } from './support/test-sdk.js';
import {
  anthropicError,
  anthropicMessageStream,
  openAIChat,
  openAIChatEvents,
  openAIChatStream,
  openAIStreamError,
} from './support/vendor-api.js';

// A governed run's `onText` and `onTextRestart`, through the real SDK, adapters and vendor
// clients, against local servers answering in each vendor's streaming wire format.

/** What a caller of `agent.run` hears: each piece of text, and each restart. */
class Listener {
  readonly heard: string[] = [];

  readonly callbacks = {
    onText: (delta: string) => {
      this.heard.push(delta);
    },
    onTextRestart: (discarded: string) => {
      this.heard.push(`<discard ${JSON.stringify(discarded)}>`);
    },
  };

  /** The text as the caller shows it: a restart erases the text it discards. */
  get shown(): string {
    let text = '';
    for (const entry of this.heard) {
      const discard = /^<discard (.*)>$/.exec(entry);
      if (discard?.[1]) {
        const discarded = JSON.parse(discard[1]) as string;
        expect(text.endsWith(discarded)).toBe(true);
        text = text.slice(0, text.length - discarded.length);
      } else {
        text += entry;
      }
    }
    return text;
  }
}

/**
 * A store that records a copy of each event, as any store that serializes them does: an event
 * holding a function (a callback of the run's input) cannot be copied, and fails the run.
 */
class CopyingEventStore extends FileEventStore {
  override async append(runId: string, event: Event): Promise<void> {
    await super.append(runId, structuredClone(event));
  }
}

/** Arguments of the `add` tool, as the model sends them. */
const addArguments = JSON.stringify({ a: 1, b: 2 });

describe('streaming the text of a governed run', () => {
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let openaiURL: string;
  let anthropicURL: string;
  let directory: string;
  let eventStore: FileEventStore;

  beforeEach(async () => {
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
    [openaiURL, anthropicURL] = await Promise.all([
      openai.start().then((address) => `${address}/v1`),
      anthropic.start(),
    ]);
    directory = mkdtempSync(join(tmpdir(), 'sdk-streaming-'));
    eventStore = new CopyingEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop()]);
    await eventStore.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function buildSDK(config: Partial<SDKConfig> = {}): SDK {
    return createSDK({
      apiKey: 'test-openai-key',
      provider: 'openai',
      providerConfig: { openai: { baseURL: openaiURL } },
      retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1, jitter: false },
      eventStore,
      ...config,
    });
  }

  function calculatorAgent(sdk: SDK) {
    const add = sdk.defineTool({
      name: 'add',
      description: 'Adds two numbers',
      schema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }) => a + b,
    });
    return sdk.createAgent({ name: 'calculator', model: 'gpt-4', tools: [add] });
  }

  async function eventsOf(sdk: SDK, runId: string, type: string) {
    return (await sdk.getEvents(runId)).filter((event) => event.type === type);
  }

  it('passes on the text of every model call of the run as it is written', async () => {
    openai.reply(
      openAIChatStream({
        content: 'Let me add them.',
        toolCalls: [{ name: 'add', arguments: addArguments }],
      }),
      openAIChatStream({ content: 'The sum is 3.' })
    );
    const sdk = buildSDK();
    const listener = new Listener();

    const result = await calculatorAgent(sdk).run({
      message: 'Add 1 and 2',
      ...listener.callbacks,
    });

    expect(result).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
    // A blank line separates the text of the second call from the text of the first.
    expect(listener.heard).toEqual([
      'Let ',
      'me a',
      'dd t',
      'hem.',
      '\n\n',
      'The ',
      'sum ',
      'is 3',
      '.',
    ]);
    // Both model calls were streamed.
    expect(openai.requests).toHaveLength(2);
    expect(openai.jsonBody(0)).toMatchObject({ stream: true });
    expect(openai.jsonBody(1)).toMatchObject({ stream: true });
    // The callbacks are not part of the recorded input (the store copies each event).
    const [started] = await eventsOf(sdk, result.runId, 'run.started');
    expect(started?.data.input).toEqual({ message: 'Add 1 and 2' });
  });

  it('does not ask for a stream when the run has no onText', async () => {
    openai.reply(openAIChat({ content: 'Whole answer' }));

    const result = await calculatorAgent(buildSDK()).run({ message: 'Hi' });

    expect(result.output).toBe('Whole answer');
    expect(openai.jsonBody(0)).not.toHaveProperty('stream');
  });

  it('discards the text of a failed call before the retry writes it again', async () => {
    openai.reply(
      openAIChatStream({
        content: 'Let me add them.',
        toolCalls: [{ name: 'add', arguments: addArguments }],
      }),
      {
        status: 200,
        stream: {
          events: [
            ...openAIChatEvents({ content: 'The total' }).slice(0, 3),
            openAIStreamError('The server had an error'),
          ],
        },
      },
      openAIChatStream({ content: 'The sum is 3.' })
    );
    const sdk = buildSDK();
    const listener = new Listener();

    const result = await calculatorAgent(sdk).run({
      message: 'Add 1 and 2',
      ...listener.callbacks,
    });

    expect(result).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
    // Only the text of the failed call is discarded, not the one of the step before. The blank
    // line before it belongs to the call: discarded with it, and sent again by the retry.
    expect(listener.heard).toEqual([
      'Let ',
      'me a',
      'dd t',
      'hem.',
      '\n\n',
      'The ',
      'tota',
      '<discard "\\n\\nThe tota">',
      '\n\n',
      'The ',
      'sum ',
      'is 3',
      '.',
    ]);
    expect(listener.shown).toBe('Let me add them.\n\nThe sum is 3.');
    const retries = await eventsOf(sdk, result.runId, 'provider.retry');
    expect(retries).toHaveLength(1);
    expect(retries[0]?.data).toMatchObject({ provider: 'openai', retry: 1 });
  });

  it('discards the text of a failed provider before the fallback writes it again', async () => {
    openai.reply({
      status: 200,
      stream: {
        events: [
          ...openAIChatEvents({ content: 'Hello from OpenAI' }).slice(0, 3),
          openAIStreamError('Invalid prompt', 'invalid_request_error'),
        ],
      },
    });
    anthropic.reply(anthropicMessageStream({ text: ['Hello from Anthropic'] }));
    const sdk = buildSDK({
      fallbackProviders: [
        { provider: 'anthropic', config: { apiKey: 'test-anthropic-key', baseURL: anthropicURL } },
      ],
    });
    const listener = new Listener();

    const result = await sdk
      .createAgent({ name: 'greeter', model: 'gpt-4' })
      .run({ message: 'Hello', ...listener.callbacks });

    expect(result).toMatchObject({ status: 'completed', output: 'Hello from Anthropic' });
    expect(listener.heard.slice(0, 3)).toEqual(['Hell', 'o fr', '<discard "Hello fr">']);
    expect(listener.shown).toBe('Hello from Anthropic');
    // The request error was not retried; the fallback took over, and the run says so.
    expect(openai.requests).toHaveLength(1);
    expect(await eventsOf(sdk, result.runId, 'provider.retry')).toEqual([]);
    const [fallback] = await eventsOf(sdk, result.runId, 'provider.fallback');
    expect(fallback?.data).toMatchObject({ primaryProvider: 'openai', usedProvider: 'anthropic' });
  });

  it('ignores what the callbacks throw or reject: the run goes on', async () => {
    const broken = {
      status: 200,
      stream: {
        events: [
          ...openAIChatEvents({ content: 'The total' }).slice(0, 3),
          openAIStreamError('The server had an error'),
        ],
      },
    };
    const answer = openAIChatStream({ content: 'The sum is 3.' });
    openai.reply(broken, answer, broken, answer);
    const agent = calculatorAgent(buildSDK());
    const calls: string[] = [];

    const throwing = await agent.run({
      message: 'Add 1 and 2',
      onText: (delta) => {
        calls.push(delta);
        throw new Error('the display is gone');
      },
      onTextRestart: () => {
        calls.push('<restart>');
        throw new Error('the display is gone');
      },
    });
    const rejecting = await agent.run({
      message: 'Add 1 and 2',
      onText: async (delta) => {
        calls.push(delta);
        throw new Error('the socket is closed');
      },
      onTextRestart: async () => {
        calls.push('<restart>');
        throw new Error('the socket is closed');
      },
    });

    expect(throwing).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
    expect(rejecting).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
    // Every piece was still offered, the restart included, in both runs.
    const oneRun = ['The ', 'tota', '<restart>', 'The ', 'sum ', 'is 3', '.'];
    expect(calls).toEqual([...oneRun, ...oneRun]);
  });

  it('keeps the text written before a call that fails for good', async () => {
    openai.reply({
      status: 200,
      stream: {
        events: [
          ...openAIChatEvents({ content: 'Half an answer' }).slice(0, 3),
          openAIStreamError('Invalid prompt', 'invalid_request_error'),
        ],
      },
    });
    const listener = new Listener();

    const result = await calculatorAgent(buildSDK()).run({
      message: 'Hello',
      ...listener.callbacks,
    });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Invalid prompt');
    expect(listener.heard).toEqual(['Half', ' an ']);
  });

  it('counts a streamed call without usage as unmetered, not as 0 tokens', async () => {
    const reply = { content: 'Counted or not', usage: { prompt: 40, completion: 10 } };
    // A compatible server that ignores stream_options sends no usage chunk.
    openai.reply(openAIChatStream({ content: 'Counted or not' }), openAIChatStream(reply));
    const sdk = buildSDK();
    const unmetered = sdk.createAgent({ name: 'unmetered', model: 'gpt-4' });

    const first = await unmetered.run({ message: 'Hi', onText: () => {} });
    const [intention] = await eventsOf(sdk, first.runId, 'intention.generated');

    expect(first.output).toBe('Counted or not');
    // On a compatible server (a baseURL), the usage is not asked for by default.
    expect(openai.jsonBody(0)).not.toHaveProperty('stream_options');
    expect(intention?.data).not.toHaveProperty('usage');
    expect(await sdk.getBudgetUsage({ agentId: unmetered.id, period: 'all' })).toMatchObject({
      tokensUsed: 0,
      unmeteredCalls: 1,
    });

    const told = buildSDK({
      providerConfig: { openai: { baseURL: openaiURL, includeStreamUsage: true } },
    });
    const second = await told
      .createAgent({ name: 'metered', model: 'gpt-4' })
      .run({ message: 'Hi', onText: () => {} });

    expect(second.output).toBe('Counted or not');
    expect(openai.jsonBody(1)).toMatchObject({ stream_options: { include_usage: true } });
    const [counted] = await eventsOf(told, second.runId, 'intention.generated');
    expect(counted?.data.usage).toEqual({
      promptTokens: 40,
      completionTokens: 10,
      totalTokens: 50,
    });
  });

  it('asks an OpenAI fallback for the usage when its config says so', async () => {
    anthropic.reply(anthropicError(400, 'Invalid request'));
    openai.reply(
      openAIChatStream({ content: 'From the fallback', usage: { prompt: 5, completion: 2 } })
    );
    const sdk = buildSDK({
      provider: 'anthropic',
      apiKey: 'test-anthropic-key',
      providerConfig: { anthropic: { baseURL: anthropicURL } },
      fallbackProviders: [
        {
          provider: 'openai',
          config: { apiKey: 'test-openai-key', baseURL: openaiURL, includeStreamUsage: true },
        },
      ],
    });

    const result = await sdk
      .createAgent({ name: 'greeter', model: 'claude-3-5-haiku-20241022' })
      .run({ message: 'Hello', onText: () => {} });

    expect(result.output).toBe('From the fallback');
    expect(openai.jsonBody(0)).toMatchObject({ stream_options: { include_usage: true } });
  });

  it('gives an OpenAI fallback of another vendor the includeStreamUsage of providerConfig', async () => {
    anthropic.reply(anthropicError(400, 'Invalid request'));
    openai.reply(openAIChatStream({ content: 'From the fallback' }));
    const sdk = buildSDK({
      provider: 'anthropic',
      apiKey: 'test-anthropic-key',
      providerConfig: {
        anthropic: { baseURL: anthropicURL },
        openai: { apiKey: 'test-openai-key', baseURL: openaiURL, includeStreamUsage: true },
      },
      fallbackProviders: [{ provider: 'openai' }],
    });

    const result = await sdk
      .createAgent({ name: 'greeter', model: 'claude-3-5-haiku-20241022' })
      .run({ message: 'Hello', onText: () => {} });

    expect(result.output).toBe('From the fallback');
    expect(openai.jsonBody(0)).toMatchObject({ stream_options: { include_usage: true } });
  });

  it('refuses a timeout or an includeStreamUsage that cannot be used, naming where it is set', () => {
    const failureOf = (build: () => unknown): unknown => {
      try {
        build();
      } catch (error) {
        return error;
      }
      throw new Error('expected a ValidationError');
    };
    const cases: Array<[() => unknown, string]> = [
      [
        () => buildSDK({ providerConfig: { openai: { baseURL: openaiURL, timeout: 0 } } }),
        'providerConfig.openai.timeout - must be a number of milliseconds above 0',
      ],
      [
        // As read from a JSON configuration.
        () => buildSDK({ providerConfig: { anthropic: { timeout: '30s' as unknown as number } } }),
        'providerConfig.anthropic.timeout - must be a number of milliseconds above 0 and at most 2147483647, got "30s"',
      ],
      [
        // Longer than a timer can wait: it would fire at once.
        () =>
          buildSDK({
            fallbackProviders: [
              { provider: 'anthropic', config: { apiKey: 'k', timeout: 2 ** 31 } },
            ],
          }),
        'fallbackProviders[0].config.timeout',
      ],
      [() => new OpenAIProvider('test-key', 'gpt-4', { timeout: Number.NaN }), 'options.timeout'],
      [
        () =>
          buildSDK({
            providerConfig: {
              openai: { baseURL: openaiURL, includeStreamUsage: 'yes' as unknown as boolean },
            },
          }),
        'providerConfig.openai.includeStreamUsage - must be true or false, got "yes"',
      ],
      [() => new AnthropicProvider('test-key', undefined, { timeout: -1 }), 'options.timeout'],
    ];

    for (const [build, message] of cases) {
      const error = failureOf(build);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toContain(message);
    }
  });

  it('cuts a stalled stream after the timeout of providerConfig, for the primary and a fallback', async () => {
    const stalled = { status: 200, stream: { events: [], then: 'hang' as const } };
    openai.reply(stalled);
    anthropic.reply(stalled);
    const sdk = buildSDK({
      providerConfig: {
        openai: { baseURL: openaiURL, timeout: 600 },
        // A fallback of another vendor takes its vendor's entry.
        anthropic: { apiKey: 'test-anthropic-key', baseURL: anthropicURL, timeout: 600 },
      },
      fallbackProviders: [{ provider: 'anthropic' }],
      retry: { maxRetries: 0 },
    });

    const result = await sdk
      .createAgent({ name: 'greeter', model: 'gpt-4' })
      .run({ message: 'Hello', onText: () => {} });

    expect(result.status).toBe('failed');
    expect(result.error?.message).toMatch(
      /openai: The answer stream sent nothing for 600 ms.*anthropic: The answer stream sent nothing for 600 ms/
    );
  });

  it('gives a fallback the timeout of its own config', async () => {
    const stalled = { status: 200, stream: { events: [], then: 'hang' as const } };
    openai.reply(stalled);
    anthropic.reply(stalled);
    const sdk = buildSDK({
      provider: 'anthropic',
      apiKey: 'test-anthropic-key',
      providerConfig: { anthropic: { baseURL: anthropicURL, timeout: 600 } },
      fallbackProviders: [
        {
          provider: 'openai',
          config: { apiKey: 'test-openai-key', baseURL: openaiURL, timeout: 600 },
        },
      ],
      retry: { maxRetries: 0 },
    });

    const result = await sdk
      .createAgent({ name: 'greeter', model: 'claude-3-5-haiku-20241022' })
      .run({ message: 'Hello', onText: () => {} });

    expect(result.error?.message).toMatch(
      /anthropic: The answer stream sent nothing for 600 ms.*openai: The answer stream sent nothing for 600 ms/
    );
  });

  it('records neither callbacks, listener nor signal in the input of a replay', async () => {
    openai.reply(openAIChat({ content: 'Original' }));
    const sdk = buildSDK();
    const original = await sdk
      .createAgent({ name: 'plain', model: 'gpt-4' })
      .run({ message: 'Hi' });

    const replay = await sdk.replay(original.runId, {
      input: {
        message: 'Replayed',
        // @ts-expect-error A replay does not stream: its input takes no callbacks.
        onText: () => {},
        onEvent: () => {},
        signal: new AbortController().signal,
      },
    });

    const [started] = await eventsOf(sdk, replay.runId, 'run.started');
    expect(started?.data.input).toEqual({ message: 'Replayed' });
  });
});

/** One model call of `ScriptedTextProvider`. */
interface ScriptedCall {
  content?: string;
  toolCall?: { name: string; arguments: string };
  /** Pieces passed to `onTextDelta` before answering (the provider streams). */
  stream?: string[];
  /** Restarts before writing anything, as a wrapper of its own could. */
  restartFirst?: boolean;
  /** Passed to `onTextDelta` after the call answered (a misbehaving provider). */
  late?: string;
  /** Restarts after the call answered (a misbehaving provider). */
  lateRestart?: boolean;
}

/** A custom provider whose calls are scripted, streaming or not. */
class ScriptedTextProvider implements LLMProvider {
  constructor(private readonly calls: ScriptedCall[]) {}

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    const call = this.calls.shift();
    if (!call) throw new Error('no scripted call left');
    if (call.restartFirst) request.onTextRestart?.();
    for (const piece of call.stream ?? []) request.onTextDelta?.(piece);
    if (call.late) {
      const late = call.late;
      setTimeout(() => request.onTextDelta?.(late), 0);
    }
    if (call.lateRestart) {
      setTimeout(() => request.onTextRestart?.(), 0);
    }
    return {
      content: call.content ?? null,
      ...(call.toolCall ? { toolCalls: [{ function: call.toolCall }] } : {}),
      model: 'scripted',
    };
  }

  supportsModel(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'scripted-text';
  }
}

describe('streaming with a custom provider', () => {
  async function runWith(provider: LLMProvider, callbacks: Listener['callbacks']) {
    const env = createTestSDK({ llmProvider: provider });
    try {
      const add = env.sdk.defineTool({
        name: 'add',
        description: 'Adds two numbers',
        schema: z.object({ a: z.number(), b: z.number() }),
        handler: async ({ a, b }) => a + b,
      });
      return await env.sdk
        .createAgent({ name: 'calculator', model: 'test-model', tools: [add] })
        .run({ message: 'Add 1 and 2', ...callbacks });
    } finally {
      await env.dispose();
    }
  }

  it('passes on in one piece the text of a call that did not stream, after a blank line', async () => {
    const listener = new Listener();

    const result = await runWith(
      new ScriptedTextProvider([
        { content: 'Let me add them.', toolCall: { name: 'add', arguments: addArguments } },
        { content: 'The sum is 3.' },
      ]),
      listener.callbacks
    );

    expect(result).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
    expect(listener.heard).toEqual(['Let me add them.', '\n\n', 'The sum is 3.']);
  });

  it('drops what a provider sends once its call has answered', async () => {
    const listener = new Listener();

    const result = await runWith(
      new ScriptedTextProvider([{ content: 'Answer', stream: ['Answer'], late: ' and more' }]),
      listener.callbacks
    );
    // Give the late piece its chance to arrive.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(result.output).toBe('Answer');
    expect(listener.heard).toEqual(['Answer']);
  });

  it('passes on no restart once the call is over', async () => {
    const listener = new Listener();

    await runWith(
      new ScriptedTextProvider([{ content: 'Answer', stream: ['Answer'], lateRestart: true }]),
      listener.callbacks
    );
    // Give the late restart its chance to arrive.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(listener.heard).toEqual(['Answer']);
  });

  it('passes on no restart when nothing was written yet', async () => {
    const listener = new Listener();

    await runWith(
      new ScriptedTextProvider([{ content: 'Answer', stream: ['Answer'], restartFirst: true }]),
      listener.callbacks
    );

    expect(listener.heard).toEqual(['Answer']);
  });
});

describe('streaming with a provider that cannot stream', () => {
  it('passes on the text of each model call in one piece when it ends', async () => {
    const provider = new ScriptedLLMProvider()
      .enqueue('tool-selection', { toolCall: { name: 'add', arguments: { a: 1, b: 2 } } })
      .enqueue('tool-selection', { content: 'The sum is 3.' });
    const env = createTestSDK({}, provider);
    try {
      const add = env.sdk.defineTool({
        name: 'add',
        description: 'Adds two numbers',
        schema: z.object({ a: z.number(), b: z.number() }),
        handler: async ({ a, b }) => a + b,
      });
      const heard: string[] = [];

      const result = await env.sdk
        .createAgent({ name: 'calculator', model: 'test-model', tools: [add] })
        .run({ message: 'Add 1 and 2', onText: (delta) => heard.push(delta) });

      expect(result).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
      // The tool call had no text; the answer comes whole.
      expect(heard).toEqual(['The sum is 3.']);
    } finally {
      await env.dispose();
    }
  });
});
