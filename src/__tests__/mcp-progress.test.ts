import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import { ErrorCode, type JSONRPCMessage, type Progress } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMcpServer } from '../mcp.js';
import { progressNotifier } from '../mcp/mcp-progress.js';
import { defineTool } from '../sdk.js';
import { cognitiveAgentTool, governedAgentTool } from '../tools/agent-tools.js';
import type { Event } from '../types/events.js';
import type { ToolDefinition } from '../types/tool.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import {
  createTestSDK,
  lookupMetricDefinition,
  scriptBuildOrBuy,
  type TestSDK,
} from './support/test-sdk.js';

const customerSchema = z.object({ customerId: z.string() });
const lookupCustomer = defineTool({
  name: 'lookup_customer',
  description: 'Returns the plan of a customer',
  schema: customerSchema,
  handler: async ({ customerId }) => ({ customerId, plan: 'enterprise' }),
});

/**
 * A server transport whose notifications take a few milliseconds to go out, as on a busy
 * connection; responses go out at once.
 */
class SlowNotificationsTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: Transport['onmessage'];

  constructor(
    private readonly inner: Transport,
    private readonly delayMs: number
  ) {
    inner.onclose = () => this.onclose?.();
    inner.onerror = (error) => this.onerror?.(error);
    inner.onmessage = (message, extra) => this.onmessage?.(message, extra);
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (!('id' in message)) await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    await this.inner.send(message, options);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

describe('MCP progress notifications', () => {
  const environments: TestSDK[] = [];
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers.splice(0)) await close();
    for (const env of environments.splice(0)) await env.dispose();
  });

  function environment(provider = new ScriptedLLMProvider()): TestSDK {
    const env = createTestSDK({}, provider);
    environments.push(env);
    return env;
  }

  /** A real MCP client connected to a server exposing `tools`; client errors are collected. */
  async function connect(
    env: TestSDK,
    tools: Array<string | ToolDefinition>,
    notificationDelayMs = 0
  ) {
    const server = createMcpServer(env.sdk, { name: 'crm', tools });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(
      notificationDelayMs > 0
        ? new SlowNotificationsTransport(serverTransport, notificationDelayMs)
        : serverTransport
    );
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    const errors: Error[] = [];
    client.onerror = (error) => errors.push(error);
    await client.connect(clientTransport);
    closers.push(
      () => client.close(),
      () => server.close()
    );
    return { client, errors };
  }

  /**
   * A stateless Streamable HTTP server, as in the deploy guide (a fresh MCP server per
   * request), and a real client connected to it.
   */
  async function connectOverHttp(env: TestSDK, tools: Array<string | ToolDefinition>) {
    const http = createServer((request, response) => {
      const server = createMcpServer(env.sdk, { name: 'crm', tools });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      response.on('close', () => {
        transport.close().catch(() => undefined);
        server.close().catch(() => undefined);
      });
      server
        .connect(transport)
        .then(() => transport.handleRequest(request, response))
        .catch(() => response.destroy());
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const { port } = http.address() as AddressInfo;
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`))
    );
    closers.push(
      () => client.close(),
      () =>
        new Promise<void>((resolve) => {
          http.closeAllConnections();
          http.close(() => resolve());
        })
    );
    return client;
  }

  /** Scripts one run of the support agent: `lookups` customer lookups, then the answer. */
  function scriptLookups(env: TestSDK, lookups: number): void {
    for (let index = 0; index < lookups; index++) {
      env.provider.enqueue('tool-selection', {
        toolCall: { name: 'lookup_customer', arguments: { customerId: `c-${index}` } },
      });
    }
    env.provider.enqueue('tool-selection', { content: 'c-0 is on the enterprise plan' });
  }

  /** A governed agent exposed as `ask_support`, scripted for one run of `lookups` lookups. */
  function supportAgent(env: TestSDK, lookups = 1): ToolDefinition {
    scriptLookups(env, lookups);
    return governedAgentTool(
      env.sdk.createAgent({ name: 'support', model: 'test-model', tools: [lookupCustomer] })
    );
  }

  it('sends one notification per event of the call, the agent run included, all before the result', async () => {
    const env = environment();
    // Notifications slower to send than the call itself: the result must still come last.
    const { client, errors } = await connect(env, [supportAgent(env)], 5);
    const progress: Progress[] = [];

    const result = await client.callTool(
      { name: 'ask_support', arguments: { message: 'Which plan is c-0 on?' } },
      undefined,
      {
        onprogress: (update) => progress.push(update),
      }
    );
    const receivedWithResult = progress.length;

    expect(result.isError).toBeFalsy();
    expect(progress.map((update) => update.message)).toEqual([
      'call started',
      'ask_support requested',
      'policies checked for ask_support',
      'tool ask_support called',
      'agent started',
      'step 1: model chose lookup_customer',
      'step 1: lookup_customer requested',
      'step 1: policies checked for lookup_customer',
      'step 1: tool lookup_customer called',
      'step 1: tool lookup_customer done',
      'step 2: model answered',
      'agent completed',
      'tool ask_support done',
      'call completed',
    ]);
    expect(progress.map((update) => update.progress)).toEqual(
      progress.map((_, index) => index + 1)
    );
    // Each notification is an event of the call's run or of the agent's run.
    const runIds = await env.store.getRunIds();
    const events = (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat();
    expect(events).toHaveLength(progress.length);
    // None arrives after the result, when the client no longer knows the token.
    expect(receivedWithResult).toBe(progress.length);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(progress).toHaveLength(receivedWithResult);
    expect(errors).toEqual([]);
  });

  it('streams the notifications over Streamable HTTP, every one before the result', async () => {
    const env = environment();
    const client = await connectOverHttp(env, [supportAgent(env, 2)]);
    const progress: Progress[] = [];

    const result = await client.callTool(
      { name: 'ask_support', arguments: { message: 'Plans of c-0 and c-1?' } },
      undefined,
      { onprogress: (update) => progress.push(update) }
    );

    expect(result.isError).toBeFalsy();
    const runIds = await env.store.getRunIds();
    const events = (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat();
    expect(progress).toHaveLength(events.length);
    expect(progress.at(-1)).toMatchObject({ progress: events.length, message: 'call completed' });
  });

  it('names the steps of a cognitive agent', async () => {
    const env = environment();
    scriptBuildOrBuy(env.provider);
    const analyst = env.sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [env.sdk.defineTool(lookupMetricDefinition)],
    });
    const { client } = await connect(env, [cognitiveAgentTool(analyst)]);
    const messages: string[] = [];

    await client.callTool(
      { name: 'ask_analyst', arguments: { problem: 'Build or buy?' } },
      undefined,
      {
        onprogress: (update) => messages.push(update.message ?? ''),
      }
    );

    expect(messages).toEqual(
      expect.arrayContaining([
        'reasoning started',
        'step 1: represent',
        'step 1: represent done',
        'step 2: hypothesize',
        'answer ready',
        'decision committed',
        'agent completed',
      ])
    );
    expect(messages.at(-1)).toBe('call completed');
  });

  it('tells the client that the call waits for an approval, so it can be decided meanwhile', async () => {
    const env = environment();
    env.sdk.defineTool({
      name: 'delete_customer',
      description: 'Deletes a customer',
      schema: customerSchema,
      metadata: { requiresApproval: true },
      handler: async ({ customerId }: z.infer<typeof customerSchema>) => ({ deleted: customerId }),
    });
    const { client } = await connect(env, ['delete_customer']);
    const messages: string[] = [];

    const result = await client.callTool(
      { name: 'delete_customer', arguments: { customerId: 'c-9' } },
      undefined,
      {
        onprogress: (update) => {
          messages.push(update.message ?? '');
          if (update.message === 'waiting for approval of delete_customer') {
            const [pending] = env.sdk.getPendingApprovals();
            env.sdk.approveAction(pending?.id ?? '', 'ops', 'asked by the client');
          }
        },
      }
    );

    expect(result.isError).toBeFalsy();
    expect(messages).toEqual([
      'call started',
      'delete_customer requested',
      'policies checked for delete_customer',
      'waiting for approval of delete_customer',
      'delete_customer approved',
      'tool delete_customer called',
      'tool delete_customer done',
      'call completed',
    ]);
  });

  it('keeps a client that resets its timeout on progress waiting for a call longer than that timeout', async () => {
    const env = environment(new ScriptedLLMProvider({ delayMs: 100 }));
    // Five model calls of 100 ms: the call lasts at least 500 ms, events come every 100 ms or so.
    const { client } = await connect(env, [supportAgent(env, 4)]);
    const call = { name: 'ask_support', arguments: { message: 'Plans of c-0 to c-3?' } };
    let updates = 0;

    const result = await client.callTool(call, undefined, {
      timeout: 400,
      resetTimeoutOnProgress: true,
      onprogress: () => {
        updates++;
      },
    });

    expect(result.isError).toBeFalsy();
    expect(updates).toBeGreaterThan(20);

    // Without progress, the same client gives up after 400 ms, and the run is cancelled.
    scriptLookups(env, 4);
    await expect(client.callTool(call, undefined, { timeout: 400 })).rejects.toMatchObject({
      code: ErrorCode.RequestTimeout,
    });
    const cancelled = async () => {
      const runIds = await env.store.getRunIds();
      const events = (await Promise.all(runIds.map((runId) => env.sdk.getEvents(runId)))).flat();
      return events.filter((event) => event.type === 'run.cancelled').length;
    };
    for (let attempt = 0; attempt < 100 && (await cancelled()) === 0; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(await cancelled()).toBe(1);
  });

  it('stops sending once a notification cannot be sent, without failing the call', async () => {
    const attempts: unknown[] = [];
    const notify = progressNotifier('token-1', async (notification) => {
      attempts.push(notification);
      if (attempts.length === 2) throw new Error('No connection established for request ID: 7');
    });
    const event = (type: Event['type']): Event => ({
      id: `evt_${type}`,
      runId: 'tool_1',
      type,
      timestamp: 1,
      data: { mode: 'tool' },
    });

    await notify(event('run.started'));
    await notify(event('policy.checked'));
    await notify(event('run.completed'));

    expect(attempts).toEqual([
      {
        method: 'notifications/progress',
        params: { progressToken: 'token-1', progress: 1, message: 'call started' },
      },
      {
        method: 'notifications/progress',
        params: { progressToken: 'token-1', progress: 2, message: 'policies checked' },
      },
    ]);
  });
});
