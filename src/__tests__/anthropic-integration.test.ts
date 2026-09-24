import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type ReasoningContext, ReasoningEngine } from '../engines/reasoning-engine.js';
import { LLMProviderError } from '../errors/index.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Tool } from '../types/tool.js';
import { DEFAULT_LLM_TEMPERATURE } from '../utils/constants.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { anthropicError, anthropicMessage } from './support/vendor-api.js';

const ENGINE_MODEL = 'claude-3-5-haiku-20241022';
const RUN_ID = 'test-run-id';

const calculatorSchema = z.object({
  operation: z.enum(['add', 'subtract']),
  a: z.number(),
  b: z.number(),
});

const calculator: Tool = {
  id: 'calc-1',
  name: 'calculator',
  description: 'Performs calculations',
  schema: calculatorSchema,
  handler: async (params) => {
    const { operation, a, b } = calculatorSchema.parse(params);
    return { result: operation === 'add' ? a + b : a - b };
  },
  version: '1.0.0',
};

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

// The ReasoningEngine drives the real AnthropicProvider and Anthropic client against a local
// server answering in the Anthropic wire format; events go to a throwaway directory.
describe('AnthropicProvider Integration', () => {
  let server: LocalHttpServer;
  let directory: string;
  let eventStore: FileEventStore;
  let reasoningEngine: ReasoningEngine;

  const context = (overrides: Partial<ReasoningContext> = {}): ReasoningContext => ({
    runId: RUN_ID,
    agentId: 'test-agent-id',
    input: 'Hello',
    conversationHistory: [],
    availableTools: [],
    ...overrides,
  });

  beforeEach(async () => {
    server = new LocalHttpServer();
    const provider = new AnthropicProvider('test-api-key', undefined, {
      baseURL: await server.start(),
      maxRetries: 0,
    });
    reasoningEngine = new ReasoningEngine(provider, ENGINE_MODEL);
    directory = mkdtempSync(join(tmpdir(), 'sdk-ai-agents-anthropic-'));
    eventStore = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await server.stop();
    await eventStore.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  describe('ReasoningEngine with AnthropicProvider', () => {
    it('should generate intention with text response', async () => {
      server.reply(
        anthropicMessage({ text: ['I will help you with that.'], usage: { input: 10, output: 5 } })
      );

      const intention = await reasoningEngine.generateIntention(
        context({
          input: 'Hello, can you help me?',
          systemPrompt: 'You are a helpful assistant.',
          model: ENGINE_MODEL,
        }),
        eventStore
      );

      expect(intention).toEqual({ type: 'final_answer', reasoning: 'I will help you with that.' });
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]?.url).toBe('/v1/messages');
      expect(server.jsonBody(0)).toMatchObject({
        model: ENGINE_MODEL,
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: 'Hello, can you help me?' }],
        temperature: DEFAULT_LLM_TEMPERATURE,
        max_tokens: 4096,
      });
      expect(await eventStore.getEvents(RUN_ID)).toMatchObject([
        {
          type: 'intention.generated',
          data: {
            message: 'I will help you with that.',
            requestedModel: ENGINE_MODEL,
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          },
          metadata: { agentId: 'test-agent-id', provider: 'anthropic' },
        },
      ]);
    });

    it('should generate intention with tool call', async () => {
      server.reply(
        anthropicMessage({
          toolUses: [{ name: 'calculator', input: { operation: 'add', a: 1, b: 2 } }],
          usage: { input: 20, output: 10 },
        })
      );

      const intention = await reasoningEngine.generateIntention(
        context({ input: 'Calculate 1 + 2', availableTools: [calculator] }),
        eventStore
      );

      expect(intention).toEqual({
        type: 'tool_call',
        toolName: 'calculator',
        parameters: { operation: 'add', a: 1, b: 2 },
        reasoning: undefined,
      });
      // The tool's Zod schema reaches Anthropic as a JSON Schema in `input_schema`.
      expect(server.jsonBody(0)).toMatchObject({
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
    });

    it('should handle conversation history correctly', async () => {
      server.reply(
        anthropicMessage({
          text: ['Yes, I remember. The answer is 3.'],
          usage: { input: 15, output: 8 },
        })
      );

      await reasoningEngine.generateIntention(
        context({
          input: 'What was the result?',
          conversationHistory: [
            { role: 'user', content: 'Calculate 1 + 2' },
            { role: 'assistant', content: 'I calculated 1 + 2 = 3' },
          ],
        }),
        eventStore
      );

      const body = server.jsonBody(0);
      expect(body).toMatchObject({
        messages: [
          { role: 'user', content: 'Calculate 1 + 2' },
          { role: 'assistant', content: 'I calculated 1 + 2 = 3' },
          { role: 'user', content: 'What was the result?' },
        ],
      });
      expect(body).not.toHaveProperty('system');
    });

    it('should handle system prompt correctly', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await reasoningEngine.generateIntention(
        context({ systemPrompt: 'You are a math expert.' }),
        eventStore
      );

      expect(server.jsonBody(0)).toMatchObject({
        system: 'You are a math expert.',
        messages: [{ role: 'user', content: 'Hello' }],
      });
    });

    it('should send the model named by the context, or the engine model otherwise', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await reasoningEngine.generateIntention(
        context({ model: 'claude-3-5-sonnet-20241022' }),
        eventStore
      );
      await reasoningEngine.generateIntention(context(), eventStore);

      expect(server.jsonBody(0)).toMatchObject({ model: 'claude-3-5-sonnet-20241022' });
      expect(server.jsonBody(1)).toMatchObject({ model: ENGINE_MODEL });
    });

    it('should send the Anthropic settings of the run', async () => {
      server.reply(anthropicMessage({ text: ['OK'] }));

      await reasoningEngine.generateIntention(
        context({
          providerSettings: {
            default: { temperature: 0.9, maxTokens: 2000 },
            openai: { temperature: 0.1, maxTokens: 100 },
            anthropic: { temperature: 0.2, maxTokens: 512 },
          },
        }),
        eventStore
      );

      expect(server.jsonBody(0)).toMatchObject({ temperature: 0.2, max_tokens: 512 });
    });

    it('should handle errors and wrap them correctly', async () => {
      server.reply(anthropicError(500, 'Internal server error'));

      const failure = await reasoningEngine
        .generateIntention(context(), eventStore)
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(LLMProviderError);
      expect(failure).toMatchObject({ provider: 'anthropic', connectionFailure: false });
      expect(failure).toHaveProperty('message', expect.stringContaining('Internal server error'));
      // No intention was generated, so none is recorded.
      expect(await eventStore.getEvents(RUN_ID)).toEqual([]);
    });

    it('should handle abort signal', async () => {
      server.reply(anthropicMessage({ text: ['too late'] }));
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        reasoningEngine.generateIntention(context(), eventStore, abortController.signal)
      ).rejects.toThrow('Run cancelled');
      // A run cancelled beforehand never reaches Anthropic.
      expect(server.requests).toHaveLength(0);
    });

    it('should honour a signal given in the reasoning context', async () => {
      server.reply(anthropicMessage({ text: ['too late'] }));
      const abortController = new AbortController();
      abortController.abort();

      await expect(
        reasoningEngine.generateIntention(
          { ...context(), abortSignal: abortController.signal },
          eventStore
        )
      ).rejects.toThrow('Run cancelled');
      expect(server.requests).toHaveLength(0);
    });

    it('should cancel a run aborted while Anthropic is answering', async () => {
      server.reply({ ...anthropicMessage({ text: ['too late'] }), delayMs: 5_000 });
      const abortController = new AbortController();

      const outcome = reasoningEngine
        .generateIntention(context(), eventStore, abortController.signal)
        .then(
          () => 'answered',
          (error: unknown) => error
        );
      await until(() => server.requests.length === 1);
      const abortedAt = Date.now();
      abortController.abort();

      const failure = await outcome;
      expect(failure).toBeInstanceOf(Error);
      expect(failure).toHaveProperty('message', 'Run cancelled');
      expect(Date.now() - abortedAt).toBeLessThan(1_000);
      expect(await eventStore.getEvents(RUN_ID)).toEqual([]);
    });
  });
});
