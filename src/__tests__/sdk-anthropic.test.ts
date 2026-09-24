import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineTool } from '../index.js';
import { type SDK, createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { SDKConfig } from '../types/sdk.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { anthropicError, anthropicMessage } from './support/vendor-api.js';

// The SDK's built-in Anthropic provider and the real Anthropic client talk to a local server
// that answers in the Anthropic wire format.

/** The part of a Messages API request these tests read, validated from the recorded body. */
const messagesRequest = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});

const calculatorSchema = z.object({
  operation: z.enum(['add', 'subtract']),
  a: z.number(),
  b: z.number(),
});

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Performs calculations',
  schema: calculatorSchema,
  handler: async ({ operation, a, b }) => ({ result: operation === 'add' ? a + b : a - b }),
});

describe('SDK with Anthropic Provider', () => {
  let server: LocalHttpServer;
  let address: string;
  let directory: string;
  let store: FileEventStore;

  beforeEach(async () => {
    server = new LocalHttpServer();
    address = await server.start();
    directory = mkdtempSync(join(tmpdir(), 'sdk-anthropic-'));
    store = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await server.stop();
    await store.destroy();
    // Let directory creations started in constructors settle before deleting the folder.
    await new Promise((resolve) => setTimeout(resolve, 20));
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  /** SDK whose primary provider is Anthropic, pointed at the local server. */
  function anthropicSDK(
    anthropic: { defaultModel?: string } = {},
    overrides: Partial<SDKConfig> = {}
  ): SDK {
    return createSDK({
      apiKey: 'test-key',
      provider: 'anthropic',
      providerConfig: { anthropic: { apiKey: 'anthropic-key', baseURL: address, ...anthropic } },
      eventStore: store,
      goldenTracesDir: join(directory, 'golden'),
      regressionTestSuitesDir: join(directory, 'suites'),
      assertionsDir: join(directory, 'assertions'),
      impactAnalysesDir: join(directory, 'impact'),
      ...overrides,
    });
  }

  function sentRequest(index: number) {
    return messagesRequest.parse(server.jsonBody(index));
  }

  describe('createSDK with Anthropic', () => {
    it('should create SDK with Anthropic provider without calling the API', () => {
      const sdk = anthropicSDK({ defaultModel: 'claude-sonnet-4-5-20250929' });

      const agent = sdk.createAgent({ name: 'claude-agent', model: 'claude-opus-4-1-20250805' });

      expect(agent.name).toBe('claude-agent');
      expect(server.requests).toHaveLength(0);
    });

    it('should create agent with Claude model', async () => {
      server.reply(
        anthropicMessage({
          text: ['Hello! I can help you.'],
          model: 'claude-opus-4-1-20250805',
          usage: { input: 10, output: 5 },
        })
      );
      const sdk = anthropicSDK();
      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-opus-4-1-20250805',
        systemPrompt: 'You are a calculator assistant',
        tools: [calculatorTool],
        maxSteps: 5,
      });

      const result = await agent.run({ message: 'Hello, can you help me?' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Hello! I can help you.');

      expect(server.requests).toHaveLength(1);
      const request = server.requests[0];
      expect(request?.method).toBe('POST');
      expect(request?.url).toBe('/v1/messages');
      // The Anthropic key of `providerConfig` wins over the SDK-wide one.
      expect(request?.headers['x-api-key']).toBe('anthropic-key');
      expect(request?.headers['anthropic-version']).toBeDefined();
      expect(server.jsonBody(0)).toMatchObject({
        model: 'claude-opus-4-1-20250805',
        max_tokens: 4096,
        temperature: 0.7,
        // Anthropic takes the system prompt apart from the conversation.
        system: 'You are a calculator assistant',
        messages: [{ role: 'user', content: 'Hello, can you help me?' }],
        tools: [
          {
            name: 'calculator',
            description: 'Performs calculations',
            input_schema: {
              type: 'object',
              properties: {
                operation: { type: 'string', enum: ['add', 'subtract'] },
                a: { type: 'number' },
                b: { type: 'number' },
              },
              required: ['operation', 'a', 'b'],
            },
          },
        ],
        tool_choice: { type: 'auto' },
      });

      const intentions = await sdk.getEvents(result.runId, { type: 'intention.generated' });
      expect(intentions).toHaveLength(1);
      expect(intentions[0]).toMatchObject({
        data: {
          message: 'Hello! I can help you.',
          requestedModel: 'claude-opus-4-1-20250805',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        },
        metadata: { agentId: agent.id, provider: 'anthropic' },
      });
    });

    it('should handle tool calls with Claude', async () => {
      server.reply(
        anthropicMessage({
          toolUses: [{ name: 'calculator', input: { operation: 'add', a: 15, b: 23 } }],
          model: 'claude-opus-4-1-20250805',
          usage: { input: 20, output: 10 },
        }),
        anthropicMessage({
          text: ['The result is 38.'],
          model: 'claude-opus-4-1-20250805',
          usage: { input: 30, output: 8 },
        })
      );
      const sdk = anthropicSDK();
      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-opus-4-1-20250805',
        tools: [calculatorTool],
        maxSteps: 5,
      });

      const result = await agent.run({ message: 'What is 15 + 23?' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('The result is 38.');

      // The tool ran with the arguments Claude chose.
      const called = await sdk.getEvents(result.runId, { type: 'tool.called' });
      expect(called).toHaveLength(1);
      expect(called[0]?.data).toMatchObject({
        toolName: 'calculator',
        parameters: { operation: 'add', a: 15, b: 23 },
      });
      const executed = await sdk.getEvents(result.runId, { type: 'action.executed' });
      expect(executed[0]?.data).toMatchObject({ toolName: 'calculator', result: { result: 38 } });

      // Its result went back to Claude in a second request.
      expect(server.requests).toHaveLength(2);
      const followUp = sentRequest(1);
      expect(followUp.model).toBe('claude-opus-4-1-20250805');
      expect(followUp.messages[0]).toEqual({ role: 'user', content: 'What is 15 + 23?' });
      // The Messages API requires turns that alternate, starting with the user.
      expect(followUp.messages.map((message) => message.role)).toEqual([
        'user',
        'assistant',
        'user',
      ]);
      expect(followUp.messages.at(-1)?.content).toContain('{"result":38}');
    });
  });

  describe('model selection', () => {
    it("should send the agent's model rather than the configured default", async () => {
      server.reply(anthropicMessage({ text: ['OK'], model: 'claude-opus-4-1-20250805' }));
      const sdk = anthropicSDK({ defaultModel: 'claude-haiku-4-5-20251001' });
      const agent = sdk.createAgent({ name: 'claude-agent', model: 'claude-opus-4-1-20250805' });

      await agent.run({ message: 'Hello' });

      expect(sentRequest(0).model).toBe('claude-opus-4-1-20250805');
    });

    it('should use default Anthropic model if not specified', async () => {
      server.reply(anthropicMessage({ text: ['OK'], model: 'claude-haiku-4-5-20251001' }));
      const sdk = anthropicSDK({ defaultModel: 'claude-haiku-4-5-20251001' });
      const agent = sdk.createAgent({ name: 'claude-agent', model: '', maxSteps: 5 });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      expect(sentRequest(0).model).toBe('claude-haiku-4-5-20251001');
    });

    it('should fall back to the built-in Anthropic model when none is configured', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));
      const sdk = anthropicSDK();
      const agent = sdk.createAgent({ name: 'claude-agent', model: '' });

      await agent.run({ message: 'Hello' });

      // Which Claude model is the built-in default is deliberately not pinned here.
      expect(sentRequest(0).model).toMatch(/^claude-./);
    });
  });

  describe('errors', () => {
    it('should handle errors from Anthropic API', async () => {
      server.reply(anthropicError(400, 'Anthropic API Error'));
      const sdk = anthropicSDK();
      const agent = sdk.createAgent({
        name: 'claude-agent',
        model: 'claude-opus-4-1-20250805',
        maxSteps: 5,
      });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('failed');
      expect(result.error?.message).toContain('anthropic');
      expect(result.error?.message).toContain('Anthropic API Error');
      // A rejected request is permanent: neither the SDK nor the client retries it.
      expect(server.requests).toHaveLength(1);
      const failed = await sdk.getEvents(result.runId, { type: 'run.failed' });
      expect(failed).toHaveLength(1);
      expect(failed[0]?.data.error).toEqual(expect.stringContaining('Anthropic API Error'));
    });

    it('should retry an overloaded Anthropic API with the SDK policy, not the client', async () => {
      server.reply(
        anthropicError(529, 'Overloaded'),
        anthropicMessage({ text: ['Recovered'], model: 'claude-opus-4-1-20250805' })
      );
      const sdk = anthropicSDK(
        {},
        { retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1, jitter: false } }
      );
      const agent = sdk.createAgent({ name: 'claude-agent', model: 'claude-opus-4-1-20250805' });

      const result = await agent.run({ message: 'Hello' });

      expect(result.status).toBe('completed');
      expect(result.output).toBe('Recovered');
      expect(server.requests).toHaveLength(2);
      // The SDK saw the failure, so the client did not retry it on its own.
      const retries = await sdk.getEvents(result.runId, { type: 'provider.retry' });
      expect(retries).toHaveLength(1);
      expect(retries[0]?.data).toMatchObject({
        provider: 'anthropic',
        model: 'claude-opus-4-1-20250805',
        retry: 1,
      });
      expect(retries[0]?.data.error).toEqual(expect.stringContaining('Overloaded'));
    });
  });
});
