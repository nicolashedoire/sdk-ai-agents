import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ReasoningEngine } from '../engines/reasoning-engine.js';
import { ValidationError } from '../errors/index.js';
import { DEFAULT_OPENAI_MODEL, OpenAIProvider, type OpenAIProviderOptions } from '../index.js';
import type { LLMRequest } from '../providers/llm-provider.js';
import { createSDK, type SDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { SDKConfig } from '../types/sdk.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  createTestSDK,
  lookupMetricDefinition,
  scriptBuildOrBuy,
  type TestSDK,
} from './support/test-sdk.js';
import { anthropicError, openAIChat, openAIError } from './support/vendor-api.js';

// The real OpenAI client talks to local servers answering in the OpenAI wire format: each test
// reads the exact JSON body the vendor would receive. Reasoning models (o-series, GPT-5 and
// later) refuse `max_tokens`, and `temperature` unless their effort is `none`; as the default
// effort varies by model, the SDK never sends them a temperature, and sends
// `max_completion_tokens` and `reasoning_effort`. Other models, and OpenAI-compatible servers,
// keep `temperature` and `max_tokens`.
describe('OpenAI request parameters', () => {
  let server: LocalHttpServer;
  let baseURL: string;

  beforeEach(async () => {
    server = new LocalHttpServer().reply(openAIChat({ content: 'OK' }));
    baseURL = `${await server.start()}/v1`;
  });

  afterEach(async () => {
    await server.stop();
  });

  const hello = [{ role: 'user' as const, content: 'Hello' }];

  function provider(options: OpenAIProviderOptions = {}, defaultModel?: string) {
    return new OpenAIProvider('test-key', defaultModel, { baseURL, maxRetries: 0, ...options });
  }

  /** The body of the only request the server received. */
  function sentBody(): unknown {
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.url).toBe('/v1/chat/completions');
    return server.jsonBody(0);
  }

  /** Sends one request per model and returns the bodies, in order. */
  async function bodiesFor(
    models: string[],
    request: Omit<LLMRequest, 'model' | 'messages'>,
    options: OpenAIProviderOptions = {}
  ): Promise<unknown[]> {
    const openai = provider(options);
    for (const model of models) {
      await openai.generateCompletion({ model, messages: hello, ...request });
    }
    return models.map((_, index) => server.jsonBody(index));
  }

  // o-series and GPT-5 and later, also dated or fine-tuned.
  const reasoningModels = [
    'o1',
    'o3',
    'o3-mini',
    'o4-mini',
    'o3-2025-04-16',
    'gpt-5',
    'gpt-5-mini',
    'gpt-5.4',
    'gpt-5.4-mini-2026-03-17',
    'gpt-5.6-terra',
    'gpt-6-sol',
    'ft:o4-mini-2025-04-16:acme::abc123',
    'ft:gpt-5-mini-2025-08-07:acme::abc123',
  ];
  // Earlier GPT models, Azure's name for GPT-3.5, open-weight models served by compatible
  // servers and models of those servers.
  const classicModels = [
    'gpt-4',
    'gpt-4o',
    'gpt-4.1-mini',
    'gpt-3.5-turbo',
    'gpt-35-turbo',
    'gpt-oss-20b',
    'chatgpt-4o-latest',
    'ft:gpt-4o-mini-2024-07-18:acme::abc123',
    'llama3.1',
  ];

  describe('parameters by kind of model', () => {
    it('gives reasoning models max_completion_tokens, and the others temperature and max_tokens', async () => {
      const bodies = await bodiesFor([...reasoningModels, ...classicModels], {
        temperature: 0.2,
        maxTokens: 300,
      });

      expect(bodies).toEqual([
        ...reasoningModels.map((model) => ({ model, messages: hello, max_completion_tokens: 300 })),
        ...classicModels.map((model) => ({
          model,
          messages: hello,
          temperature: 0.2,
          max_tokens: 300,
        })),
      ]);
    });

    it('recognizes later generations and names in any case', async () => {
      const later = ['gpt-10', 'gpt-12.1-mini', 'GPT-5.4', 'O3', 'FT:o4-mini:acme::abc123'];
      // Azure's GPT-3.5 names (35 is 3.5, not a generation), in any case, stay classic.
      const classic = ['gpt-35-turbo-16k', 'GPT-35-TURBO', 'GPT-4O'];

      const bodies = await bodiesFor([...later, ...classic], { temperature: 0.2, maxTokens: 300 });

      expect(bodies).toEqual([
        ...later.map((model) => ({ model, messages: hello, max_completion_tokens: 300 })),
        ...classic.map((model) => ({ model, messages: hello, temperature: 0.2, max_tokens: 300 })),
      ]);
    });

    it('sends tools to a reasoning model as to any model', async () => {
      const lookup = {
        type: 'function' as const,
        function: {
          name: 'lookup',
          description: 'Looks a metric up',
          parameters: { type: 'object', properties: { metric: { type: 'string' } } },
        },
      };

      await provider().generateCompletion({
        model: 'gpt-5.4',
        messages: hello,
        tools: [lookup],
        temperature: 0.7,
        maxTokens: 1_000,
      });

      expect(sentBody()).toEqual({
        model: 'gpt-5.4',
        messages: hello,
        tools: [lookup],
        tool_choice: 'auto',
        max_completion_tokens: 1_000,
      });
    });
  });

  describe('reasoning effort', () => {
    it("sends the provider's effort to reasoning models only", async () => {
      const bodies = await bodiesFor(
        ['o4-mini', 'gpt-4o'],
        { temperature: 0.7 },
        { reasoningEffort: 'low' }
      );

      expect(bodies).toEqual([
        { model: 'o4-mini', messages: hello, reasoning_effort: 'low' },
        { model: 'gpt-4o', messages: hello, temperature: 0.7 },
      ]);
    });

    it("lets the request's effort win over the provider's, for reasoning models only", async () => {
      const bodies = await bodiesFor(
        ['gpt-5.4', 'gpt-4.1'],
        { reasoningEffort: 'xhigh' },
        { reasoningEffort: 'low' }
      );

      expect(bodies).toEqual([
        { model: 'gpt-5.4', messages: hello, reasoning_effort: 'xhigh' },
        { model: 'gpt-4.1', messages: hello },
      ]);
    });
  });

  describe('explicit reasoningModels', () => {
    it('`true` makes every model a reasoning model (an Azure deployment name)', async () => {
      const bodies = await bodiesFor(
        ['prod-reasoner', 'gpt-4o'],
        { temperature: 0.2, maxTokens: 300 },
        { reasoningModels: true, reasoningEffort: 'medium' }
      );

      expect(bodies).toEqual([
        {
          model: 'prod-reasoner',
          messages: hello,
          max_completion_tokens: 300,
          reasoning_effort: 'medium',
        },
        {
          model: 'gpt-4o',
          messages: hello,
          max_completion_tokens: 300,
          reasoning_effort: 'medium',
        },
      ]);
    });

    it('`false` turns detection off: the classic parameters for every model', async () => {
      const request = { model: 'o4-mini', messages: hello, temperature: 0.2, maxTokens: 300 };
      const options = { reasoningEffort: 'medium' as const };

      await provider(options).generateCompletion(request);
      await provider({ ...options, reasoningModels: false }).generateCompletion(request);

      expect([server.jsonBody(0), server.jsonBody(1)]).toEqual([
        {
          model: 'o4-mini',
          messages: hello,
          max_completion_tokens: 300,
          reasoning_effort: 'medium',
        },
        // A compatible server that serves a model under this name, with the classic parameters.
        { model: 'o4-mini', messages: hello, temperature: 0.2, max_tokens: 300 },
      ]);
    });

    it('a list names the reasoning models, the others being detected', async () => {
      const bodies = await bodiesFor(
        ['prod-reasoner', 'prod-chat', 'o4-mini'],
        { temperature: 0.2, maxTokens: 300 },
        { reasoningModels: ['prod-reasoner'] }
      );

      expect(bodies).toEqual([
        { model: 'prod-reasoner', messages: hello, max_completion_tokens: 300 },
        { model: 'prod-chat', messages: hello, temperature: 0.2, max_tokens: 300 },
        { model: 'o4-mini', messages: hello, max_completion_tokens: 300 },
      ]);
    });
  });

  describe('default model', () => {
    it('is gpt-5.4, a reasoning model', async () => {
      expect(DEFAULT_OPENAI_MODEL).toBe('gpt-5.4');

      await provider().generateCompletion({
        model: '',
        messages: hello,
        temperature: 0.7,
        maxTokens: 300,
      });

      expect(sentBody()).toEqual({
        model: 'gpt-5.4',
        messages: hello,
        max_completion_tokens: 300,
      });
    });

    it("is the provider's own for a reasoning engine created without a model", async () => {
      const directory = mkdtempSync(join(tmpdir(), 'openai-default-model-'));
      const store = new FileEventStore(join(directory, 'events'));
      try {
        const engine = new ReasoningEngine(provider({}, 'gpt-4.1'));

        await engine.generateStep(
          {
            runId: 'run-1',
            agentId: 'agent-1',
            input: 'Hello',
            conversationHistory: [],
            availableTools: [],
          },
          store
        );

        expect(sentBody()).toMatchObject({ model: 'gpt-4.1' });
      } finally {
        await store.destroy();
        rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
      }
    });
  });
});

// The same parameters, set in the SDK configuration and on agents, runs and fallbacks.
describe('OpenAI settings through the SDK', () => {
  let openai: LocalHttpServer;
  let anthropic: LocalHttpServer;
  let openaiURL: string;
  let anthropicURL: string;
  let directory: string;
  let store: FileEventStore;

  beforeEach(async () => {
    openai = new LocalHttpServer();
    anthropic = new LocalHttpServer();
    [openaiURL, anthropicURL] = await Promise.all([
      openai.start().then((address) => `${address}/v1`),
      anthropic.start(),
    ]);
    directory = mkdtempSync(join(tmpdir(), 'openai-settings-'));
    store = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await Promise.all([openai.stop(), anthropic.stop()]);
    await store.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  /** One attempt per provider: a failing primary fails over at once. */
  function sdkWith(config: Partial<SDKConfig>): SDK {
    return createSDK({ retry: { maxRetries: 0 }, eventStore: store, ...config });
  }

  const hello = [{ role: 'user', content: 'Hello' }];

  it('sends a deployment named in reasoningModels the reasoning parameters and effort', async () => {
    openai.reply(openAIChat({ content: 'Hi' }));
    const sdk = sdkWith({
      apiKey: 'k',
      providerConfig: {
        openai: {
          baseURL: openaiURL,
          reasoningModels: ['prod-reasoner'],
          reasoningEffort: 'medium',
        },
      },
    });

    const agent = sdk.createAgent({ name: 'a', model: 'prod-reasoner', maxSteps: 1 });
    const result = await agent.run({ message: 'Hello' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hi' });
    // The engine's default temperature (0.7) is not sent to a reasoning model.
    expect(openai.jsonBody(0)).toEqual({
      model: 'prod-reasoner',
      messages: hello,
      reasoning_effort: 'medium',
    });
  });

  it('takes the effort of the run, then of the agent, then of the provider', async () => {
    openai.reply(openAIChat({ content: 'Hi' }));
    const sdk = sdkWith({
      apiKey: 'k',
      providerConfig: { openai: { baseURL: openaiURL, reasoningEffort: 'medium' } },
    });
    const agent = sdk.createAgent({
      name: 'a',
      model: 'o4-mini',
      maxSteps: 1,
      providerSettings: {
        default: { maxTokens: 800 },
        openai: { reasoningEffort: 'low' },
      },
    });

    await agent.run({ message: 'Hello' });
    await agent.run({
      message: 'Hello',
      providerSettings: { openai: { reasoningEffort: 'high' } },
    });
    // A run that only sets a common field keeps the agent's effort.
    await agent.run({ message: 'Hello', providerSettings: { default: { maxTokens: 900 } } });
    const plain = sdk.createAgent({ name: 'b', model: 'o4-mini', maxSteps: 1 });
    await plain.run({ message: 'Hello' });

    const sent = [0, 1, 2, 3].map((index) => openai.jsonBody(index));
    expect(sent).toEqual([
      { model: 'o4-mini', messages: hello, max_completion_tokens: 800, reasoning_effort: 'low' },
      { model: 'o4-mini', messages: hello, max_completion_tokens: 800, reasoning_effort: 'high' },
      { model: 'o4-mini', messages: hello, max_completion_tokens: 900, reasoning_effort: 'low' },
      { model: 'o4-mini', messages: hello, reasoning_effort: 'medium' },
    ]);
  });

  it('gives an OpenAI fallback its effort and the default model; Claude gets no effort', async () => {
    anthropic.reply(anthropicError(500, 'Anthropic is down'));
    openai.reply(openAIChat({ content: 'Hi from OpenAI' }));
    const sdk = sdkWith({
      provider: 'anthropic',
      providerConfig: { anthropic: { apiKey: 'a', baseURL: anthropicURL } },
      fallbackProviders: [{ provider: 'openai', config: { apiKey: 'o', baseURL: openaiURL } }],
    });
    const agent = sdk.createAgent({
      name: 'a',
      model: 'claude-opus-5',
      maxSteps: 1,
      providerSettings: {
        openai: { reasoningEffort: 'low', maxTokens: 700 },
        anthropic: { maxTokens: 600 },
      },
    });

    const result = await agent.run({ message: 'Hello' });

    expect(result).toMatchObject({ status: 'completed', output: 'Hi from OpenAI' });
    expect(anthropic.jsonBody(0)).toMatchObject({ model: 'claude-opus-5', max_tokens: 600 });
    expect(anthropic.jsonBody(0)).not.toHaveProperty('reasoning_effort');
    expect(anthropic.jsonBody(0)).not.toHaveProperty('reasoningEffort');
    // OpenAI does not serve claude-opus-5: its default model, a reasoning model.
    expect(openai.jsonBody(0)).toEqual({
      model: 'gpt-5.4',
      messages: hello,
      max_completion_tokens: 700,
      reasoning_effort: 'low',
    });
  });

  it("gives a fallback of another vendor providerConfig.openai's options, under its own", async () => {
    anthropic.reply(anthropicError(500, 'Anthropic is down'));
    openai.reply(openAIChat({ content: 'Hi' }));
    const sdk = sdkWith({
      provider: 'anthropic',
      providerConfig: {
        anthropic: { apiKey: 'a', baseURL: anthropicURL },
        openai: {
          apiKey: 'o',
          baseURL: openaiURL,
          defaultModel: 'backup-deployment',
          reasoningModels: true,
          reasoningEffort: 'high',
        },
      },
      fallbackProviders: [{ provider: 'openai', config: { reasoningEffort: 'low' } }],
    });

    await sdk
      .createAgent({ name: 'a', model: 'claude-opus-5', maxSteps: 1 })
      .run({ message: 'Hello' });

    // Field by field: its own effort, then the vendor entry's model and reasoningModels.
    expect(openai.jsonBody(0)).toEqual({
      model: 'backup-deployment',
      messages: hello,
      reasoning_effort: 'low',
    });
  });

  it("does not give a fallback of the primary's vendor the primary's options", async () => {
    const backup = new LocalHttpServer().reply(openAIChat({ content: 'Hi from the backup' }));
    const backupURL = `${await backup.start()}/v1`;
    try {
      openai.reply(openAIError(500, 'The primary is down'));
      const sdk = sdkWith({
        apiKey: 'k',
        providerConfig: {
          openai: { baseURL: openaiURL, reasoningModels: true, reasoningEffort: 'high' },
        },
        fallbackProviders: [
          {
            provider: 'openai',
            config: { apiKey: 'b', baseURL: backupURL, defaultModel: 'backup-deployment' },
          },
        ],
      });

      const result = await sdk
        .createAgent({
          name: 'a',
          model: 'my-deployment',
          maxSteps: 1,
          providerSettings: { default: { temperature: 0.3, maxTokens: 400 } },
        })
        .run({ message: 'Hello' });

      expect(result).toMatchObject({ status: 'completed', output: 'Hi from the backup' });
      expect(openai.jsonBody(0)).toEqual({
        model: 'my-deployment',
        messages: hello,
        max_completion_tokens: 400,
        reasoning_effort: 'high',
      });
      // It does not serve my-deployment, so it gets its own model, and neither the primary's
      // reasoningModels nor its effort.
      expect(backup.jsonBody(0)).toEqual({
        model: 'backup-deployment',
        messages: hello,
        temperature: 0.3,
        max_tokens: 400,
      });
    } finally {
      await backup.stop();
    }
  });
});

// Some OpenAI-compatible servers do not support assistant `tool_calls` and `tool` messages:
// with `nativeToolMessages: false`, the conversation carries tool calls and results as text.
describe('OpenAI nativeToolMessages', () => {
  let server: LocalHttpServer;
  let address: string;
  let directory: string;
  let store: FileEventStore;

  beforeEach(async () => {
    server = new LocalHttpServer();
    address = `${await server.start()}/v1`;
    directory = mkdtempSync(join(tmpdir(), 'openai-native-tools-'));
    store = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await server.stop();
    await store.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function calculatorOf(config: Partial<SDKConfig>) {
    const sdk = createSDK({ apiKey: 'k', retry: { maxRetries: 0 }, eventStore: store, ...config });
    const add = sdk.defineTool({
      name: 'add',
      description: 'Adds two numbers',
      schema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }) => ({ sum: a + b }),
    });
    return sdk.createAgent({ name: 'calculator', model: 'gpt-4o', tools: [add], maxSteps: 3 });
  }

  /** A tool call, then the answer; the second request carries the tool's result. */
  async function secondRequestOf(config: Partial<SDKConfig>) {
    server.reply(
      openAIChat({ content: null, toolCalls: [{ name: 'add', arguments: '{"a":2,"b":3}' }] }),
      openAIChat({ content: 'It is 5.' })
    );
    const result = await calculatorOf(config).run({ message: 'What is 2 + 3?' });
    expect(result).toMatchObject({ status: 'completed', output: 'It is 5.' });
    return server.jsonBody(1) as { messages: unknown[]; tools: unknown[] };
  }

  const asText = [
    { role: 'user', content: 'What is 2 + 3?' },
    { role: 'assistant', content: 'Tool add executed with result: {"sum":5}' },
    { role: 'user', content: 'Previous tool result: {"sum":5}. Continue.' },
  ];

  it('is on unless turned off', () => {
    expect(new OpenAIProvider('k').nativeToolMessages).toBe(true);
    expect(
      new OpenAIProvider('k', undefined, { nativeToolMessages: false }).nativeToolMessages
    ).toBe(false);
  });

  it('sends tool calls and results as text when turned off, tools still offered', async () => {
    const second = await secondRequestOf({
      providerConfig: { openai: { baseURL: address, nativeToolMessages: false } },
    });

    expect(second.messages).toEqual(asText);
    expect(second.tools).toHaveLength(1);
  });

  it('sends them as text to the whole chain when a fallback turns them off', async () => {
    // Any provider of the chain may receive the conversation, so it must understand it.
    const second = await secondRequestOf({
      providerConfig: { openai: { baseURL: address } },
      fallbackProviders: [
        {
          provider: 'openai',
          config: { apiKey: 'b', baseURL: address, nativeToolMessages: false },
        },
      ],
    });

    expect(second.messages).toEqual(asText);
  });
});

// The options are often read from a JSON file or given from JavaScript: a value of the wrong
// type is refused when the SDK or the provider is created, with the path of the option.
describe('OpenAI options validation', () => {
  let directory: string;
  let store: FileEventStore;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'openai-options-'));
    store = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await store.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function sdkWith(config: Partial<SDKConfig>) {
    return () => createSDK({ apiKey: 'k', retry: false, eventStore: store, ...config });
  }

  /** The option, typed as the configuration would receive it from plain data. */
  const plain = (value: unknown) => value as never;

  it('refuses a reasoningModels that is neither a boolean nor a list of names', () => {
    // A string would have matched every model name it contains.
    expect(
      sdkWith({ providerConfig: { openai: { reasoningModels: plain('prod-reasoner') } } })
    ).toThrow(
      new ValidationError(
        'providerConfig.openai.reasoningModels',
        'must be true, false or a list of model names, got "prod-reasoner"'
      )
    );
    expect(() => new OpenAIProvider('k', undefined, { reasoningModels: plain(['o3', 3]) })).toThrow(
      new ValidationError(
        'options.reasoningModels',
        'must be true, false or a list of model names, got a list with a value that is not a string'
      )
    );
  });

  it('refuses an empty or non-string reasoningEffort, and a non-boolean nativeToolMessages', () => {
    expect(
      sdkWith({
        provider: 'anthropic',
        fallbackProviders: [
          { provider: 'anthropic', config: { apiKey: 'a' } },
          { provider: 'openai', config: { apiKey: 'o', reasoningEffort: plain(' ') } },
        ],
      })
    ).toThrow(
      new ValidationError(
        'fallbackProviders[1].config.reasoningEffort',
        'must be a reasoning effort such as \'low\', got " "'
      )
    );
    expect(() => new OpenAIProvider('k', undefined, { reasoningEffort: plain(2) })).toThrow(
      "Validation failed: options.reasoningEffort - must be a reasoning effort such as 'low', got 2"
    );
    expect(sdkWith({ providerConfig: { openai: { nativeToolMessages: plain('false') } } })).toThrow(
      new ValidationError(
        'providerConfig.openai.nativeToolMessages',
        'must be true or false, got "false"'
      )
    );
  });

  it('accepts every valid form', () => {
    for (const reasoningModels of [true, false, [], ['prod-reasoner']]) {
      expect(() => new OpenAIProvider('k', undefined, { reasoningModels })).not.toThrow();
    }
    expect(
      () =>
        new OpenAIProvider('k', undefined, { reasoningEffort: 'none', nativeToolMessages: false })
    ).not.toThrow();
  });
});

// A cognitive agent's thoughts offer no tools and can reason at their own effort, while tool
// selection, on GPT-5.4 and later, needs the effort `none` to call tools on Chat Completions.
describe('reasoning effort of a cognitive agent', () => {
  let env: TestSDK | undefined;

  afterEach(async () => {
    await env?.dispose();
    env = undefined;
  });

  /** A scripted provider that the SDK treats as OpenAI, to resolve the OpenAI settings. */
  class ScriptedOpenAI extends ScriptedLLMProvider {
    getProviderName(): string {
      return 'openai';
    }
  }

  it('sends its reasoningEffort with the thoughts and providerSettings.openai with tool selection', async () => {
    env = createTestSDK({}, new ScriptedOpenAI());
    scriptBuildOrBuy(env.provider);
    const agent = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'gpt-5.5',
      tools: [env.sdk.defineTool(lookupMetricDefinition)],
      reasoningEffort: 'high',
      providerSettings: { openai: { reasoningEffort: 'none' } },
    });

    const result = await agent.think({ problem: 'Should we build or buy our analytics module?' });

    expect(result.status).toBe('completed');
    const efforts = env.provider.requests.map((request) => [
      request.tools && request.tools.length > 0 ? 'tool-selection' : 'thought',
      request.reasoningEffort,
    ]);
    expect(efforts).toContainEqual(['tool-selection', 'none']);
    expect(efforts.filter(([kind]) => kind === 'thought').length).toBeGreaterThan(3);
    for (const [kind, effort] of efforts) {
      expect(effort).toBe(kind === 'thought' ? 'high' : 'none');
    }
  });
});
