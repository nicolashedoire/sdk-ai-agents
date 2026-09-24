import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LLMProviderError } from '../errors/index.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { openAIChat, openAIError } from './support/vendor-api.js';

// The real OpenAI client talks to a local server that answers in the OpenAI wire format.
describe('OpenAIProvider', () => {
  let server: LocalHttpServer;
  let baseURL: string;
  let provider: OpenAIProvider;

  beforeEach(async () => {
    server = new LocalHttpServer();
    baseURL = `${await server.start()}/v1`;
    provider = new OpenAIProvider('test-api-key', 'gpt-4', { baseURL, maxRetries: 0 });
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
      expect(new OpenAIProvider('test-key')).toBeDefined();
    });

    it('should throw error if API key is empty', () => {
      expect(() => new OpenAIProvider('')).toThrow('OpenAI API key is required');
      expect(() => new OpenAIProvider('   ')).toThrow('OpenAI API key is required');
    });

    it('should send the API key and call the configured address', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      await provider.generateCompletion({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]?.method).toBe('POST');
      expect(server.requests[0]?.url).toBe('/v1/chat/completions');
      expect(server.requests[0]?.headers.authorization).toBe('Bearer test-api-key');
    });
  });

  describe('supportsModel', () => {
    it('should return true for GPT models', () => {
      expect(provider.supportsModel('gpt-4')).toBe(true);
      expect(provider.supportsModel('gpt-3.5-turbo')).toBe(true);
      expect(provider.supportsModel('gpt-4-turbo')).toBe(true);
      expect(provider.supportsModel('o1-preview')).toBe(true);
      expect(provider.supportsModel('o1-mini')).toBe(true);
    });

    it('should return false for non-GPT models', () => {
      expect(provider.supportsModel('claude-3-opus')).toBe(false);
      expect(provider.supportsModel('unknown')).toBe(false);
    });
  });

  describe('getProviderName', () => {
    it('should return "openai"', () => {
      expect(provider.getProviderName()).toBe('openai');
    });
  });

  describe('generateCompletion', () => {
    it('should generate completion with text response', async () => {
      server.reply(
        openAIChat({
          content: 'Hello! How can I help you?',
          model: 'gpt-4-0613',
          usage: { prompt: 10, completion: 5 },
        })
      );

      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.content).toBe('Hello! How can I help you?');
      expect(result.toolCalls).toBeUndefined();
      // The model the API answered with, which may be a dated version of the requested one.
      expect(result.model).toBe('gpt-4-0613');
      expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    });

    it('should generate completion with tool calls', async () => {
      server.reply(
        openAIChat({
          content: null,
          toolCalls: [
            { name: 'calculator', arguments: JSON.stringify({ operation: 'add', a: 1, b: 2 }) },
          ],
        })
      );

      const result = await provider.generateCompletion({
        model: 'gpt-4',
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

    it('should send tools in the OpenAI format and let the model choose', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      await provider.generateCompletion({
        messages: [{ role: 'user', content: 'Calculate 1+2' }],
        tools: [calculator],
      });

      expect(server.jsonBody(0)).toMatchObject({
        tools: [
          {
            type: 'function',
            function: {
              name: 'calculator',
              description: 'Performs calculations',
              parameters: calculator.function.parameters,
            },
          },
        ],
        tool_choice: 'auto',
      });
    });

    it('should send neither tools nor tool_choice when there are no tools', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      await provider.generateCompletion({ messages: [{ role: 'user', content: 'Hi' }], tools: [] });

      const body = server.jsonBody(0) as Record<string, unknown>;
      expect(body).not.toHaveProperty('tools');
      expect(body).not.toHaveProperty('tool_choice');
    });

    it('should handle system messages', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      await provider.generateCompletion({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });

      expect(server.jsonBody(0)).toMatchObject({
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      });
    });

    it('should handle maxTokens parameter', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 100,
      });

      expect(server.jsonBody(0)).toMatchObject({ max_tokens: 100 });
    });

    it('should handle temperature parameter', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      });

      expect(server.jsonBody(0)).toMatchObject({ temperature: 0.7 });
    });

    it('should use default model if not specified', async () => {
      const custom = new OpenAIProvider('test-key', 'gpt-3.5-turbo', { baseURL, maxRetries: 0 });
      server.reply(openAIChat({ content: 'OK' }));

      await custom.generateCompletion({ messages: [{ role: 'user', content: 'Hello' }] });

      expect(server.jsonBody(0)).toMatchObject({ model: 'gpt-3.5-turbo' });
    });

    it('should wrap an API error with the vendor message', async () => {
      server.reply(openAIError(500, 'The server had an error'));

      const failure = await provider
        .generateCompletion({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LLMProviderError);
      const error = failure as LLMProviderError;
      expect(error.provider).toBe('openai');
      expect(error.retryable).toBe(true);
      expect(error.connectionFailure).toBe(false);
      expect(error.message).toContain('The server had an error');
    });

    it('should mask an API key echoed back in an error message', async () => {
      server.reply(openAIError(401, 'Incorrect API key provided: sk-proj-abcdef123456'));

      await expect(
        provider.generateCompletion({ messages: [{ role: 'user', content: 'Hello' }] })
      ).rejects.toThrow('sk-***');
    });

    it('should mark a connection failure as such', async () => {
      await server.stop();

      const failure = await provider
        .generateCompletion({ messages: [{ role: 'user', content: 'Hello' }] })
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LLMProviderError);
      expect((failure as LLMProviderError).connectionFailure).toBe(true);
    });

    it('should handle abort signal', async () => {
      server.reply(openAIChat({ content: 'too late' }));
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        provider.generateCompletion({
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }],
          abortSignal: abortController.signal,
        })
      ).rejects.toThrow('Request aborted');
    });

    it('should handle empty response', async () => {
      server.reply(openAIChat({ choices: [], usage: { prompt: 10, completion: 0 } }));

      await expect(
        provider.generateCompletion({ model: 'gpt-4', messages: [{ role: 'user', content: 'Hello' }] })
      ).rejects.toThrow(LLMProviderError);
    });

    it('should handle tool calls with empty arguments', async () => {
      server.reply(openAIChat({ content: null, toolCalls: [{ name: 'test_tool', arguments: '' }] }));

      const result = await provider.generateCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Test' }],
      });

      expect(result.toolCalls?.[0]?.function.arguments).toBe('{}');
    });

    it('should leave usage undefined when the API reports none', async () => {
      server.reply(openAIChat({ content: 'OK' }));

      const result = await provider.generateCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result.usage).toBeUndefined();
    });
  });
});
