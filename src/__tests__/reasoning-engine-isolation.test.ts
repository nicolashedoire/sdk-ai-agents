import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { type SDK, createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { openAIChat } from './support/vendor-api.js';

// Two agents share the SDK's OpenAI provider; the real OpenAI client talks to a local server
// that answers in the OpenAI wire format, so each request shows which model an agent used.

/** The part of a Chat Completions request these tests read, validated from the recorded body. */
const chatRequest = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
});

describe('ReasoningEngine Isolation', () => {
  let server: LocalHttpServer;
  let directory: string;
  let eventStore: FileEventStore;
  let sdk: SDK;

  beforeEach(async () => {
    server = new LocalHttpServer();
    const address = await server.start();
    directory = mkdtempSync(join(tmpdir(), 'reasoning-isolation-'));
    eventStore = new FileEventStore(join(directory, 'events'));
    sdk = createSDK({
      apiKey: 'test-key',
      provider: 'openai',
      providerConfig: { openai: { baseURL: `${address}/v1` } },
      eventStore,
      goldenTracesDir: join(directory, 'golden'),
      regressionTestSuitesDir: join(directory, 'suites'),
      assertionsDir: join(directory, 'assertions'),
      impactAnalysesDir: join(directory, 'impact'),
    });
  });

  afterEach(async () => {
    await server.stop();
    await eventStore.destroy();
    // Let directory creations started in constructors settle before deleting the folder.
    await new Promise((resolve) => setTimeout(resolve, 20));
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function sentRequests() {
    return server.requests.map((_, index) => chatRequest.parse(server.jsonBody(index)));
  }

  function createAgents() {
    const agent1 = sdk.createAgent({ name: 'agent-1', model: 'gpt-4', maxSteps: 1 });
    const agent2 = sdk.createAgent({ name: 'agent-2', model: 'gpt-3.5-turbo', maxSteps: 1 });
    return { agent1, agent2 };
  }

  it('should create separate ReasoningEngine for each agent', () => {
    const { agent1, agent2 } = createAgents();

    expect(agent1).not.toBe(agent2);
    expect(agent1.id).not.toBe(agent2.id);
    expect(agent1.name).toBe('agent-1');
    expect(agent2.name).toBe('agent-2');
    // Creating agents does not call the model.
    expect(server.requests).toHaveLength(0);
  });

  it('should use agent-specific model in ReasoningEngine', async () => {
    server.reply(
      openAIChat({ content: 'Response from gpt-4', model: 'gpt-4' }),
      openAIChat({ content: 'Response from gpt-3.5-turbo', model: 'gpt-3.5-turbo' })
    );
    // Both agents exist before either runs: the second one must not change the first's model.
    const { agent1, agent2 } = createAgents();

    const result1 = await agent1.run({ message: 'Hello from agent 1' });
    const result2 = await agent2.run({ message: 'Hello from agent 2' });

    expect(result1).toMatchObject({ status: 'completed', output: 'Response from gpt-4' });
    expect(result2).toMatchObject({ status: 'completed', output: 'Response from gpt-3.5-turbo' });

    // Each agent's own model reached the API.
    expect(server.requests.map((request) => request.url)).toEqual([
      '/v1/chat/completions',
      '/v1/chat/completions',
    ]);
    expect(sentRequests()).toEqual([
      { model: 'gpt-4', messages: [{ role: 'user', content: 'Hello from agent 1' }] },
      { model: 'gpt-3.5-turbo', messages: [{ role: 'user', content: 'Hello from agent 2' }] },
    ]);

    // And each run's trace names its agent and the model it asked for.
    const intention1 = await sdk.getEvents(result1.runId, { type: 'intention.generated' });
    const intention2 = await sdk.getEvents(result2.runId, { type: 'intention.generated' });
    expect(intention1).toHaveLength(1);
    expect(intention1[0]).toMatchObject({
      data: { requestedModel: 'gpt-4', model: 'gpt-4' },
      metadata: { agentId: agent1.id, provider: 'openai' },
    });
    expect(intention2).toHaveLength(1);
    expect(intention2[0]).toMatchObject({
      data: { requestedModel: 'gpt-3.5-turbo', model: 'gpt-3.5-turbo' },
      metadata: { agentId: agent2.id, provider: 'openai' },
    });
  });

  it('should keep each agent on its own model when their runs overlap', async () => {
    // A held answer (repeated for every request) lets the two runs overlap.
    server.reply({ ...openAIChat({ content: 'OK' }), delayMs: 30 });
    const { agent1, agent2 } = createAgents();

    const [result1, result2] = await Promise.all([
      agent1.run({ message: 'Hello from agent 1' }),
      agent2.run({ message: 'Hello from agent 2' }),
    ]);

    expect(result1.status).toBe('completed');
    expect(result2.status).toBe('completed');
    const modelByMessage = Object.fromEntries(
      sentRequests().map((request) => [request.messages.at(-1)?.content, request.model])
    );
    expect(modelByMessage).toEqual({
      'Hello from agent 1': 'gpt-4',
      'Hello from agent 2': 'gpt-3.5-turbo',
    });
  });
});
