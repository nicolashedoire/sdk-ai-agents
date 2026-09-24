import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMProviderError } from '../errors/index.js';
import {
  AnthropicProvider,
  DEFAULT_ANTHROPIC_MODEL,
  acceptsSampling,
} from '../providers/anthropic-provider.js';
import { isTransientError } from '../resilience/retry.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { anthropicError, anthropicMessage } from './support/vendor-api.js';

const BUILT_IN_DEFAULT_MODEL = 'claude-opus-5';
const REQUESTED_MODEL = 'claude-3-5-haiku-20241022';

/** Settles with the LLMProviderError a call fails with, and fails the test otherwise. */
async function providerFailure(call: Promise<unknown>): Promise<LLMProviderError> {
  const failure = await call.then(
    () => undefined,
    (error: unknown) => error
  );
  if (!(failure instanceof LLMProviderError)) {
    throw new Error(`expected an LLMProviderError, got ${String(failure)}`);
  }
  return failure;
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

// The real Anthropic client talks to a local server that answers in the Anthropic wire format.
describe('AnthropicProvider', () => {
  let server: LocalHttpServer;
  let baseURL: string;
  let provider: AnthropicProvider;

  /** A provider whose client calls the local server, without the client's own retries. */
  const connect = (defaultModel?: string) =>
    new AnthropicProvider('test-api-key', defaultModel, { baseURL, maxRetries: 0 });

  beforeEach(async () => {
    server = new LocalHttpServer();
    // The bare address: the Anthropic client appends `/v1/messages` itself.
    baseURL = await server.start();
    provider = connect();
  });

  afterEach(async () => {
    await server.stop();
  });

  const calculator = {
    type: 'function' as const,
    function: {
      name: 'calculator',
      description: 'Performs calculations',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string' },
          a: { type: 'number' },
          b: { type: 'number' },
        },
      },
    },
  };

  describe('constructor', () => {
    it('should create provider with API key', () => {
      expect(new AnthropicProvider('test-key').getProviderName()).toBe('anthropic');
    });

    it('should throw error if API key is empty', () => {
      expect(() => new AnthropicProvider('')).toThrow('Anthropic API key is required');
      expect(() => new AnthropicProvider('   ')).toThrow('Anthropic API key is required');
    });

    it('should send the API key and call the configured address', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(server.requests).toHaveLength(1);
      const request = server.requests[0];
      expect(request?.method).toBe('POST');
      expect(request?.url).toBe('/v1/messages');
      expect(request?.headers['x-api-key']).toBe('test-api-key');
      expect(request?.headers['anthropic-version']).toBe('2023-06-01');
      expect(request?.headers.authorization).toBeUndefined();
    });

    it('should use default model if not specified', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      expect(provider.supportsModel(BUILT_IN_DEFAULT_MODEL)).toBe(true);
      await provider.generateCompletion({
        model: '',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(DEFAULT_ANTHROPIC_MODEL).toBe(BUILT_IN_DEFAULT_MODEL);
      expect(server.jsonBody(0)).toMatchObject({ model: BUILT_IN_DEFAULT_MODEL });
    });

    it('should use custom default model if specified', async () => {
      const custom = connect(REQUESTED_MODEL);
      server.reply(anthropicMessage({ text: ['OK'] }));

      expect(custom.supportsModel(REQUESTED_MODEL)).toBe(true);
      await custom.generateCompletion({
        model: '',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(server.jsonBody(0)).toMatchObject({ model: REQUESTED_MODEL });
    });
  });

  describe('supportsModel', () => {
    it('should return true for Claude models', () => {
      expect(provider.supportsModel('claude-3-opus-20240229')).toBe(true);
      expect(provider.supportsModel('claude-3-sonnet-20240229')).toBe(true);
      expect(provider.supportsModel('claude-3-haiku-20240307')).toBe(true);
      expect(provider.supportsModel('claude-3-5-sonnet-20241022')).toBe(true);
    });

    it('should return false for non-Claude models', () => {
      expect(provider.supportsModel('gpt-4')).toBe(false);
      expect(provider.supportsModel('o1-preview')).toBe(false);
      expect(provider.supportsModel('unknown')).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return "anthropic"', () => {
      expect(provider.getProviderName()).toBe('anthropic');
    });
  });

  describe('tool turns in the Anthropic format', () => {
    it('rebuilds a tool call it did not produce as a tool_use block', async () => {
      // After a failover, the call may come from another vendor: there is no raw turn to echo.
      server.reply(anthropicMessage({ text: ['It is 5.'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [
          { role: 'user', content: 'What is 2 + 3?' },
          {
            role: 'assistant',
            content: 'Let me add.',
            toolCalls: [{ id: 'call_9', function: { name: 'add', arguments: '{"a":2,"b":3}' } }],
          },
          { role: 'tool', toolCallId: 'call_9', toolName: 'add', content: '{"sum":5}' },
        ],
      });

      expect(server.jsonBody(0)).toMatchObject({
        messages: [
          { role: 'user', content: 'What is 2 + 3?' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Let me add.' },
              { type: 'tool_use', id: 'call_9', name: 'add', input: { a: 2, b: 3 } },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'call_9', content: '{"sum":5}' }],
          },
        ],
      });
    });

    it('puts the results of one turn in a single user message', async () => {
      server.reply(anthropicMessage({ text: ['Done'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [
          { role: 'user', content: 'Two lookups' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              { id: 't1', function: { name: 'lookup', arguments: '{"key":"a"}' } },
              { id: 't2', function: { name: 'lookup', arguments: '{"key":"b"}' } },
            ],
          },
          { role: 'tool', toolCallId: 't1', toolName: 'lookup', content: '"A"' },
          { role: 'tool', toolCallId: 't2', toolName: 'lookup', content: '"B"' },
        ],
      });

      const { messages } = server.jsonBody(0) as { messages: Array<{ role: string }> };
      expect(messages.map((message) => message.role)).toEqual(['user', 'assistant', 'user']);
      expect(messages[2]).toEqual({
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 't1', content: '"A"' },
          { type: 'tool_result', tool_use_id: 't2', content: '"B"' },
        ],
      });
    });

    it('returns the call ids, and the raw turn only when the model called a tool', async () => {
      server.reply(
        anthropicMessage({ toolUses: [{ name: 'add', input: { a: 1, b: 1 } }] }),
        anthropicMessage({ text: ['Two'] })
      );
      const ask = () =>
        provider.generateCompletion({
          model: REQUESTED_MODEL,
          messages: [{ role: 'user', content: '1 + 1?' }],
        });

      const call = await ask();
      const answer = await ask();

      expect(call.toolCalls?.[0]?.id).toBe('toolu_1');
      expect(call.vendorContent).toEqual({
        provider: 'anthropic',
        content: [{ type: 'tool_use', id: 'toolu_1', name: 'add', input: { a: 1, b: 1 } }],
      });
      expect(answer.vendorContent).toBeUndefined();
    });
  });

  describe('parameters that depend on the model', () => {
    const ask = (model: string, extra: { temperature?: number; maxTokens?: number } = {}) =>
      provider.generateCompletion({ model, messages: [{ role: 'user', content: 'Hi' }], ...extra });

    it('should not send a temperature to models that refuse sampling parameters', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await ask('claude-opus-5', { temperature: 0.7 });

      // Opus 5 answers a 400 to a request carrying `temperature`.
      expect(server.jsonBody(0)).not.toHaveProperty('temperature');
    });

    it('should still send a temperature to models that take it', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await ask('claude-sonnet-4-6', { temperature: 0.7 });

      expect(server.jsonBody(0)).toMatchObject({ temperature: 0.7 });
    });

    it('should know which models take sampling parameters', () => {
      const takes = [
        'claude-3-5-sonnet-20241022',
        'claude-opus-4-20250514',
        'claude-opus-4-1-20250805',
        'claude-opus-4-6',
        'claude-sonnet-4-5-20250929',
        'claude-sonnet-4-6',
        'claude-haiku-4-5',
      ];
      const refuses = [
        'claude-opus-4-7',
        'claude-opus-4-8',
        'claude-opus-5',
        'claude-opus-5-5',
        'claude-sonnet-5',
        'claude-fable-5-1',
        'claude-mythos-5-1',
      ];
      expect(takes.filter((model) => !acceptsSampling(model))).toEqual([]);
      expect(refuses.filter((model) => acceptsSampling(model))).toEqual([]);
    });

    it('should give recent models room to think when no max_tokens is set', async () => {
      server.reply(
        anthropicMessage({ text: ['OK'] }),
        anthropicMessage({ text: ['OK'] }),
        anthropicMessage({ text: ['OK'] })
      );

      await ask('claude-opus-5');
      await ask('claude-opus-4-1-20250805');
      await ask('claude-3-5-haiku-20241022');

      expect(server.jsonBody(0)).toMatchObject({ max_tokens: 16000 });
      // The vendor client refuses more than 8 192 without streaming for Opus 4 and 4.1.
      expect(server.jsonBody(1)).toMatchObject({ max_tokens: 8192 });
      expect(server.jsonBody(2)).toMatchObject({ max_tokens: 4096 });
    });
  });

  describe('generateCompletion', () => {
    it('should convert messages correctly', async () => {
      server.reply(anthropicMessage({ text: ['Hello!'], model: REQUESTED_MODEL }));

      const result = await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });

      // The system prompt travels in its own field, never as a message.
      expect(server.jsonBody(0)).toMatchObject({
        model: REQUESTED_MODEL,
        system: 'You are helpful',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      expect(result.content).toBe('Hello!');
      expect(result.toolCalls).toBeUndefined();
      expect(result.model).toBe(REQUESTED_MODEL);
    });

    it('should report the model the API answered with, not the requested one', async () => {
      // An alias resolves to a dated model; costs are priced from the reported model.
      server.reply(anthropicMessage({ text: ['Hi'], model: 'claude-served-20260101' }));

      const result = await provider.generateCompletion({
        model: 'claude-served-latest',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(server.jsonBody(0)).toMatchObject({ model: 'claude-served-latest' });
      expect(result.model).toBe('claude-served-20260101');
    });

    it('should join several system messages and keep the conversation order', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Calculate 1 + 2' },
          { role: 'system', content: 'Answer briefly' },
          { role: 'assistant', content: '3' },
          { role: 'user', content: 'And times 2?' },
        ],
      });

      expect(server.jsonBody(0)).toMatchObject({
        system: 'You are helpful\n\nAnswer briefly',
        messages: [
          { role: 'user', content: 'Calculate 1 + 2' },
          { role: 'assistant', content: '3' },
          { role: 'user', content: 'And times 2?' },
        ],
      });
    });

    it('should send no system field when there is no system message', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(server.jsonBody(0)).not.toHaveProperty('system');
    });

    it('should convert tool calls correctly', async () => {
      server.reply(
        anthropicMessage({
          toolUses: [{ name: 'calculator', input: { operation: 'add', a: 1, b: 2 } }],
          usage: { input: 20, output: 10 },
        })
      );

      const result = await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Calculate 1+2' }],
        tools: [calculator],
      });

      expect(result.content).toBeNull();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0]?.function.name).toBe('calculator');
      expect(JSON.parse(result.toolCalls?.[0]?.function.arguments ?? '')).toEqual({
        operation: 'add',
        a: 1,
        b: 2,
      });
    });

    it('should handle mixed content (text + tool calls)', async () => {
      server.reply(
        anthropicMessage({
          text: ['I will calculate that.'],
          toolUses: [{ name: 'calculator', input: { operation: 'add', a: 1, b: 2 } }],
          usage: { input: 20, output: 15 },
        })
      );

      const result = await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Calculate 1+2' }],
      });

      expect(result.content).toBe('I will calculate that.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls?.[0]?.function.name).toBe('calculator');
    });

    it('should join several text blocks', async () => {
      server.reply(anthropicMessage({ text: ['First part.', 'Second part.'] }));

      const result = await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('First part.\n\nSecond part.');
    });

    it('should convert tools correctly and let the model choose', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
        tools: [calculator],
      });

      expect(server.jsonBody(0)).toMatchObject({
        tools: [
          {
            name: 'calculator',
            description: 'Performs calculations',
            input_schema: {
              type: 'object',
              properties: {
                operation: { type: 'string' },
                a: { type: 'number' },
                b: { type: 'number' },
              },
            },
          },
        ],
        tool_choice: { type: 'auto' },
      });
    });

    it('should send neither tools nor tool_choice when there are no tools', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [],
      });

      const body = server.jsonBody(0);
      expect(body).not.toHaveProperty('tools');
      expect(body).not.toHaveProperty('tool_choice');
    });

    it('should ask for 4096 tokens at most when maxTokens is not set', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      const body = server.jsonBody(0);
      expect(body).toMatchObject({ max_tokens: 4096 });
      expect(body).not.toHaveProperty('temperature');
    });

    it('should send maxTokens and temperature', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100,
        temperature: 0.3,
      });

      expect(server.jsonBody(0)).toMatchObject({ max_tokens: 100, temperature: 0.3 });
    });

    it('should prefer the requested model over the default one', async () => {
      server.reply(anthropicMessage({ text: ['Hello'] }));

      await connect(REQUESTED_MODEL).generateCompletion({
        model: BUILT_IN_DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(server.jsonBody(0)).toMatchObject({ model: BUILT_IN_DEFAULT_MODEL });
    });

    it('should convert usage tokens correctly', async () => {
      server.reply(anthropicMessage({ text: ['Hello'], usage: { input: 100, output: 50 } }));

      const result = await provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should wrap an API error with the vendor message', async () => {
      server.reply(anthropicError(500, 'Internal server error'));

      const error = await providerFailure(
        provider.generateCompletion({
          model: REQUESTED_MODEL,
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );

      expect(error.provider).toBe('anthropic');
      expect(error.retryable).toBe(true);
      expect(error.connectionFailure).toBe(false);
      expect(error.message).toContain('Internal server error');
      expect(isTransientError(error)).toBe(true);
    });

    it('should keep the vendor status visible to the retry policy', async () => {
      server.reply(anthropicError(401, 'invalid x-api-key'), anthropicError(529, 'Overloaded'));
      const request = {
        model: REQUESTED_MODEL,
        messages: [{ role: 'user' as const, content: 'Hello' }],
      };

      const rejected = await providerFailure(provider.generateCompletion(request));
      const overloaded = await providerFailure(provider.generateCompletion(request));

      expect(rejected.message).toContain('invalid x-api-key');
      expect(isTransientError(rejected)).toBe(false);
      expect(overloaded.message).toContain('Overloaded');
      expect(isTransientError(overloaded)).toBe(true);
    });

    it('should mask an API key echoed back in an error message', async () => {
      server.reply(anthropicError(401, 'Invalid API key: sk-ant-api03-abcdef123456'));

      const error = await providerFailure(
        provider.generateCompletion({
          model: REQUESTED_MODEL,
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );

      expect(error.message).toContain('sk-***');
      expect(error.message).not.toContain('abcdef123456');
    });

    it('should mark a connection failure as such', async () => {
      await server.stop();

      const error = await providerFailure(
        provider.generateCompletion({
          model: REQUESTED_MODEL,
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );

      expect(error.provider).toBe('anthropic');
      expect(error.connectionFailure).toBe(true);
      expect(isTransientError(error)).toBe(true);
    });

    it('should handle abort signal', async () => {
      server.reply(anthropicMessage({ text: ['too late'] }));
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        provider.generateCompletion({
          model: REQUESTED_MODEL,
          messages: [{ role: 'user', content: 'Hello' }],
          abortSignal: abortController.signal,
        })
      ).rejects.toThrow('Request aborted');
      // An already cancelled request is never sent, so never billed.
      expect(server.requests).toHaveLength(0);
    });

    it('should cancel a request aborted while in flight, without waiting for the answer', async () => {
      server.reply({ ...anthropicMessage({ text: ['too late'] }), delayMs: 5_000 });
      const abortController = new AbortController();

      const completion = provider.generateCompletion({
        model: REQUESTED_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
        abortSignal: abortController.signal,
      });
      const outcome = completion.then(
        () => 'answered',
        (error: unknown) => error
      );
      await until(() => server.requests.length === 1);
      const abortedAt = Date.now();
      abortController.abort();

      const failure = await outcome;
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', 'Request aborted');
      // The HTTP request is cut: the 5 s answer is not waited for.
      expect(Date.now() - abortedAt).toBeLessThan(1_000);
    });
  });
});
