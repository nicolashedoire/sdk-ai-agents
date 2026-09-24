import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSDK, type SDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { SDKConfig } from '../types/sdk.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { anthropicMessage, openAIChat } from './support/vendor-api.js';

// A tool's result goes back to the model in the vendor's own tool format (OpenAI `tool`
// messages, Anthropic `tool_result` blocks), tied to the call by its id. A provider that does
// not declare that format gets the plain-text lines it always got.
describe('tool results sent back to the model', () => {
  let server: LocalHttpServer;
  let address: string;
  let directory: string;
  let store: FileEventStore;

  beforeEach(async () => {
    server = new LocalHttpServer();
    address = await server.start();
    directory = mkdtempSync(join(tmpdir(), 'native-tool-messages-'));
    store = new FileEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await server.stop();
    await store.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function sdkWith(config: Partial<SDKConfig>): SDK {
    return createSDK({ retry: { maxRetries: 0 }, eventStore: store, ...config });
  }

  function agentOf(sdk: SDK, model: string) {
    const add = sdk.defineTool({
      name: 'add',
      description: 'Adds two numbers',
      schema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }) => ({ sum: a + b }),
    });
    return sdk.createAgent({ name: 'calculator', model, tools: [add], maxSteps: 3 });
  }

  const body = (index: number) => server.jsonBody(index) as { messages: unknown[] };

  it('uses OpenAI tool calls and tool messages', async () => {
    server.reply(
      openAIChat({ content: null, toolCalls: [{ name: 'add', arguments: '{"a":2,"b":3}' }] }),
      openAIChat({ content: 'It is 5.' })
    );
    const sdk = sdkWith({ apiKey: 'k', providerConfig: { openai: { baseURL: `${address}/v1` } } });

    const result = await agentOf(sdk, 'gpt-4o').run({ message: 'What is 2 + 3?' });

    expect(result).toMatchObject({ status: 'completed', output: 'It is 5.' });
    expect(body(1).messages).toEqual([
      { role: 'user', content: 'What is 2 + 3?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'add', arguments: '{"a":2,"b":3}' } },
        ],
      },
      { role: 'tool', tool_call_id: 'call_1', content: '{"sum":5}' },
    ]);
  });

  it("sends Claude's turn back unchanged, thinking block included", async () => {
    // Recent Claude models think before calling a tool; the API requires that turn, with its
    // signed thinking block, to come back exactly as it was returned.
    const toolTurn = anthropicMessage({ toolUses: [{ name: 'add', input: { a: 2, b: 3 } }] });
    const content = [
      { type: 'thinking', thinking: '', signature: 'sig-abc' },
      ...(toolTurn.body as { content: unknown[] }).content,
    ];
    server.reply(
      { status: 200, body: { ...(toolTurn.body as object), content } },
      anthropicMessage({ text: ['It is 5.'] })
    );
    const sdk = sdkWith({
      provider: 'anthropic',
      providerConfig: { anthropic: { apiKey: 'k', baseURL: address } },
    });

    const result = await agentOf(sdk, 'claude-opus-5').run({ message: 'What is 2 + 3?' });

    expect(result).toMatchObject({ status: 'completed', output: 'It is 5.' });
    expect(body(1).messages).toEqual([
      { role: 'user', content: 'What is 2 + 3?' },
      { role: 'assistant', content },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"sum":5}' }],
      },
    ]);
  });

  it('keeps the plain-text lines for a provider without native tool messages', async () => {
    const provider = new ScriptedLLMProvider().enqueue(
      'tool-selection',
      { toolCall: { name: 'add', arguments: { a: 2, b: 3 } } },
      { content: 'It is 5.' }
    );
    const sdk = sdkWith({ llmProvider: provider });

    const result = await agentOf(sdk, 'any-model').run({ message: 'What is 2 + 3?' });

    expect(result).toMatchObject({ status: 'completed', output: 'It is 5.' });
    expect(provider.requests[1]?.messages).toEqual([
      { role: 'user', content: 'What is 2 + 3?' },
      { role: 'assistant', content: 'Tool add executed with result: {"sum":5}' },
      { role: 'user', content: 'Previous tool result: {"sum":5}. Continue.' },
    ]);
  });
});
