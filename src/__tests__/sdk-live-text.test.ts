import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createSDK } from '../sdk.js';
import { FileEventStore } from '../stores/file-event-store.js';
import type { Event } from '../types/events.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { openAIChatEvents, openAIChatStream, openAIStreamError } from './support/vendor-api.js';

// A run watched with both callbacks at once, `onEvent` and `onText`, through a tool call, a
// model call that fails mid-stream and its retry: each callback gets what it documents, and
// the run records each event once, without the callbacks.

/** A store that records a copy of each event: an event holding a function cannot be copied. */
class CopyingEventStore extends FileEventStore {
  override async append(runId: string, event: Event): Promise<void> {
    await super.append(runId, structuredClone(event));
  }
}

describe('a run watched with onEvent and onText together', () => {
  let server: LocalHttpServer;
  let directory: string;
  let store: CopyingEventStore;

  beforeEach(() => {
    server = new LocalHttpServer();
    directory = mkdtempSync(join(tmpdir(), 'sdk-live-text-'));
    store = new CopyingEventStore(join(directory, 'events'));
  });

  afterEach(async () => {
    await server.stop();
    await store.destroy();
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  it('delivers every event once and in order, and the text with its restart', async () => {
    server.reply(
      openAIChatStream({
        content: 'Let me add them.',
        toolCalls: [{ name: 'add', arguments: JSON.stringify({ a: 1, b: 2 }) }],
      }),
      // The answer fails after two pieces of text: the call is tried again.
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
    const sdk = createSDK({
      apiKey: 'test-openai-key',
      provider: 'openai',
      providerConfig: { openai: { baseURL: `${await server.start()}/v1` } },
      retry: { maxRetries: 1, initialDelayMs: 1, maxDelayMs: 1, jitter: false },
      eventStore: store,
    });
    const add = sdk.defineTool({
      name: 'add',
      description: 'Adds two numbers',
      schema: z.object({ a: z.number(), b: z.number() }),
      handler: async ({ a, b }) => a + b,
    });
    const agent = sdk.createAgent({ name: 'calculator', model: 'gpt-4o', tools: [add] });
    const received: Event[] = [];
    const heard: string[] = [];

    const result = await agent.run({
      message: 'Add 1 and 2',
      onEvent: async (event) => {
        // A consumer that takes its time: the run does not wait for it, run() does.
        await new Promise((resolve) => setTimeout(resolve, 2));
        received.push(event);
      },
      onText: (delta) => heard.push(delta),
      onTextRestart: (discarded) => heard.push(`<discard ${JSON.stringify(discarded)}>`),
    });

    expect(result).toMatchObject({ status: 'completed', output: 'The sum is 3.' });
    const recorded = await sdk.getEvents(result.runId);
    // Each event recorded once, and delivered once, in the order it was recorded.
    const ids = recorded.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(received.map((event) => event.id)).toEqual(ids);
    expect(recorded.map((event) => event.type)).toEqual([
      'run.started',
      'intention.generated',
      'action.executing',
      'policy.checked',
      'tool.called',
      'action.executed',
      'provider.retry',
      'intention.generated',
      'run.completed',
    ]);
    // The text of both model calls, the failed attempt's discarded before the retry writes it.
    expect(heard).toEqual([
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
    expect(server.requests).toHaveLength(3);
    // Neither callback, nor the listener, is part of the recorded input.
    expect(recorded[0]?.data.input).toEqual({ message: 'Add 1 and 2' });
  });
});
