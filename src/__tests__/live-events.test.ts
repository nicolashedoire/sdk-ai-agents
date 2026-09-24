import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ActionEngine } from '../engines/action-engine.js';
import { PolicyEngine } from '../engines/policy-engine.js';
import { assembleCognitiveAgent } from '../cognition/create-cognitive-agent.js';
import { LiveEventsDroppedError, ValidationError } from '../errors/index.js';
import type { Incident, IncidentNotifier } from '../incidents/incident.js';
import { MonitoredEventStore } from '../incidents/monitored-event-store.js';
import { ToolRegistry } from '../registry/tool-registry.js';
import { createSDK, defineTool, type SDK } from '../sdk.js';
import type { IEventStore } from '../stores/event-store.js';
import { FileEventStore } from '../stores/file-event-store.js';
import {
  ObservedEventStore,
  type ObservedEventStoreOptions,
} from '../stores/observed-event-store.js';
import { cognitiveAgentTool, governedAgentTool } from '../tools/agent-tools.js';
import type { Event, EventLog } from '../types/events.js';
import type { SDKConfig } from '../types/sdk.js';
import { InMemoryDecisionClient, pick } from './support/in-memory-decision-client.js';
import { handBuiltAgent } from './support/hand-built-agent.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { lookupMetricDefinition, scriptBuildOrBuy } from './support/test-sdk.js';

const customerSchema = z.object({ customerId: z.string() });
const lookupCustomer = defineTool({
  name: 'lookup_customer',
  description: 'Returns the plan of a customer',
  schema: customerSchema,
  handler: async ({ customerId }) => ({ customerId, plan: 'enterprise' }),
});

const ids = (events: Event[]) => events.map((event) => event.id);

/** A listener that takes each event and never finishes with it. */
function neverSettles(received: Event[]): (event: Event) => Promise<void> {
  return (event) => {
    received.push(event);
    return new Promise<void>(() => undefined);
  };
}

/** `settled` once `promise` settles, `pending` if it has not within `ms`. */
async function stateAfter(promise: Promise<unknown>, ms: number): Promise<'settled' | 'pending'> {
  let timer: NodeJS.Timeout | undefined;
  const pending = new Promise<'pending'>((resolve) => {
    timer = setTimeout(() => resolve('pending'), ms);
  });
  const state = await Promise.race([
    promise.then(
      () => 'settled' as const,
      () => 'settled' as const
    ),
    pending,
  ]);
  clearTimeout(timer);
  return state;
}

/** Waits until `condition` holds, for at most two seconds. */
async function until(condition: () => boolean): Promise<void> {
  for (let waited = 0; !condition() && waited < 2_000; waited += 10) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

/** A consumer that takes a few milliseconds per event (a database, a dashboard). */
function slowConsumer(received: Event[]): (event: Event) => Promise<void> {
  return async (event) => {
    await new Promise((resolve) => setTimeout(resolve, 3));
    received.push(event);
  };
}

/** Keeps the events themselves in memory, as appended (nothing goes through JSON). */
class MemoryEventStore implements IEventStore {
  readonly events: Event[] = [];

  async append(_runId: string, event: Event): Promise<void> {
    this.events.push(event);
  }

  async getEvents(runId: string): Promise<Event[]> {
    return this.events.filter((event) => event.runId === runId);
  }

  async getRunIds(): Promise<string[]> {
    return [...new Set(this.events.map((event) => event.runId))];
  }

  async exportEventLog(): Promise<EventLog> {
    throw new Error('not used');
  }
}

describe('live events', () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup();
  });

  /** A file store in a throwaway folder, closed and removed after the test. */
  function fileStore(): FileEventStore {
    const directory = mkdtempSync(join(tmpdir(), 'live-events-'));
    const store = new FileEventStore(join(directory, 'events'));
    cleanups.push(async () => {
      await store.destroy();
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    });
    return store;
  }

  /**
   * An SDK on a file store; listener errors go to `onListenerError` when `observe` is given,
   * and `wrap` builds the store given to the SDK.
   */
  function environment(
    options: {
      observe?: ObservedEventStoreOptions;
      wrap?: (store: FileEventStore) => IEventStore;
      config?: Partial<SDKConfig>;
      provider?: ScriptedLLMProvider;
    } = {}
  ): { sdk: SDK; store: FileEventStore; provider: ScriptedLLMProvider } {
    const store = fileStore();
    const provider = options.provider ?? new ScriptedLLMProvider();
    const sdk = createSDK({
      llmProvider: provider,
      eventStore: options.wrap
        ? options.wrap(store)
        : options.observe
          ? new ObservedEventStore(store, options.observe)
          : store,
      ...options.config,
    });
    return { sdk, store, provider };
  }

  function scriptLookup(provider: ScriptedLLMProvider): void {
    provider.enqueue(
      'tool-selection',
      { toolCall: { name: 'lookup_customer', arguments: { customerId: 'c-42' } } },
      { content: 'c-42 is on the enterprise plan' }
    );
  }

  it('gives a governed run every one of its events, in order, before run() resolves', async () => {
    const { sdk, provider } = environment();
    scriptLookup(provider);
    const agent = sdk.createAgent({
      name: 'support',
      model: 'test-model',
      tools: [lookupCustomer],
    });
    const received: Event[] = [];

    const result = await agent.run({
      message: 'Which plan is c-42 on?',
      onEvent: slowConsumer(received),
    });

    expect(result).toMatchObject({ status: 'completed', output: 'c-42 is on the enterprise plan' });
    expect(ids(received)).toEqual(ids(await sdk.getEvents(result.runId)));
    expect(received.map((event) => event.type)).toEqual([
      'run.started',
      'intention.generated',
      'action.executing',
      'policy.checked',
      'tool.called',
      'action.executed',
      'intention.generated',
      'run.completed',
    ]);
  });

  it('never lets a failing onEvent break the run, and reports each failure with its event', async () => {
    const failures: Array<{ error: string; eventId: string }> = [];
    const { sdk, provider } = environment({
      observe: {
        onListenerError: (error, event) => {
          failures.push({
            error: error instanceof Error ? error.message : String(error),
            eventId: event.id,
          });
        },
      },
    });
    scriptLookup(provider);
    const agent = sdk.createAgent({
      name: 'support',
      model: 'test-model',
      tools: [lookupCustomer],
    });
    let calls = 0;

    const result = await agent.run({
      message: 'Which plan is c-42 on?',
      onEvent: () => {
        calls++;
        if (calls % 2 === 1) throw new Error('dashboard down');
        return Promise.reject(new Error('still down'));
      },
    });

    expect(result.status).toBe('completed');
    const recorded = await sdk.getEvents(result.runId);
    expect(recorded).toHaveLength(8);
    expect(failures.map((failure) => failure.eventId)).toEqual(ids(recorded));
    expect(failures.slice(0, 2).map((failure) => failure.error)).toEqual([
      'dashboard down',
      'still down',
    ]);
  });

  it('gives a cognitive run every one of its events, in order, before think() resolves', async () => {
    const { sdk, provider } = environment();
    scriptBuildOrBuy(provider);
    const agent = sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [sdk.defineTool(lookupMetricDefinition)],
    });
    const received: Event[] = [];

    const result = await agent.think({
      problem: 'Should we build or buy?',
      onEvent: slowConsumer(received),
    });

    expect(result.status).toBe('completed');
    expect(ids(received)).toEqual(ids(await sdk.getEvents(result.runId)));
    expect(received.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'cognition.started',
        'cognition.operation_selected',
        'tool.called',
        'cognition.concluded',
      ])
    );
    expect(received.at(-1)?.type).toBe('run.completed');
  });

  it('gives a replay every one of its events through its onEvent option', async () => {
    const { sdk, provider } = environment();
    scriptLookup(provider);
    const agent = sdk.createAgent({
      name: 'support',
      model: 'test-model',
      tools: [lookupCustomer],
    });
    const original = await agent.run({ message: 'Which plan is c-42 on?' });
    const received: Event[] = [];

    const replay = await sdk.replay(original.runId, undefined, { onEvent: slowConsumer(received) });

    expect(replay.status).toBe('completed');
    expect(ids(received)).toEqual(ids(await sdk.getEvents(replay.runId)));
    expect(received.map((event) => event.type)).toContain('tool.called');
  });

  it('gives the caller of executeTool the events of the call and of the agent run it starts', async () => {
    const { sdk, provider } = environment();
    scriptLookup(provider);
    const agent = sdk.createAgent({
      name: 'support',
      model: 'test-model',
      tools: [lookupCustomer],
    });
    sdk.defineTool(governedAgentTool(agent));
    const received: Event[] = [];

    const result = await sdk.executeTool(
      'ask_support',
      { message: 'Which plan is c-42 on?' },
      { agentId: 'mcp:crm', onEvent: slowConsumer(received) }
    );

    const agentRunId = String(Reflect.get(Object(result), 'runId'));
    const callRunId = received[0]?.runId ?? '';
    expect(callRunId).toMatch(/^tool_/);
    const callEvents = await sdk.getEvents(callRunId);
    const agentEvents = await sdk.getEvents(agentRunId);
    expect(received).toHaveLength(callEvents.length + agentEvents.length);
    expect(ids(received.filter((event) => event.runId === callRunId))).toEqual(ids(callEvents));
    expect(ids(received.filter((event) => event.runId === agentRunId))).toEqual(ids(agentEvents));
    // The agent's run happens while the tool runs: between its call and its result.
    const runs = received.map((event) => (event.runId === callRunId ? event.type : 'agent'));
    expect(runs.indexOf('agent')).toBe(runs.indexOf('tool.called') + 1);
    expect(runs.lastIndexOf('agent')).toBe(runs.indexOf('action.executed') - 1);
    expect(received.at(-1)).toMatchObject({ runId: callRunId, type: 'run.completed' });
  });

  it('lets sdk.subscribe watch every run live, with filters, until it unsubscribes', async () => {
    const decisionClient = new InMemoryDecisionClient((_, question) => pick(question, 'billing'));
    const { sdk, provider } = environment({ config: { decisionClient } });
    scriptLookup(provider);
    sdk.defineTool(lookupCustomer);
    const agent = sdk.createAgent({
      name: 'support',
      model: 'test-model',
      tools: [lookupCustomer],
    });
    const all: Event[] = [];
    const completed: Event[] = [];
    const fromMcp: Event[] = [];
    const stopAll = sdk.subscribe((event) => {
      all.push(event);
    });
    const stopCompleted = sdk.subscribe(slowConsumer(completed), { types: ['run.completed'] });
    const stopMcp = sdk.subscribe((event) => fromMcp.push(event), { agentId: 'mcp:crm' });

    const run = await agent.run({ message: 'Which plan is c-42 on?' });
    await sdk.executeTool('lookup_customer', { customerId: 'c-7' }, { agentId: 'mcp:crm' });
    await sdk.traceResourceRead(
      'doc://handbook',
      async () => ({ uri: 'doc://handbook', text: 'Refunds: 30 days' }),
      {
        agentId: 'mcp:crm',
      }
    );
    const decision = await sdk.decisions.choose({
      context: { ticket: 'charged twice' },
      question: 'Which team?',
      options: ['billing', 'technical'],
    });
    // The slow consumer of `run.completed` may still be catching up.
    await until(() => completed.length === 3);

    const runIds = [...new Set(all.map((event) => event.runId))];
    expect(runIds).toHaveLength(4);
    expect(runIds).toEqual(expect.arrayContaining([run.runId, decision.runId]));
    for (const runId of runIds) {
      expect(ids(all.filter((event) => event.runId === runId))).toEqual(
        ids(await sdk.getEvents(runId))
      );
    }
    expect(completed.map((event) => event.runId)).toEqual([run.runId, runIds[1], runIds[2]]);
    expect(new Set(fromMcp.map((event) => event.runId))).toEqual(new Set([runIds[1], runIds[2]]));

    stopAll();
    stopCompleted();
    stopMcp();
    await sdk.executeTool('lookup_customer', { customerId: 'c-8' }, { agentId: 'mcp:crm' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(new Set(all.map((event) => event.runId)).size).toBe(4);
    expect(completed).toHaveLength(3);
  });

  it('delivers the incident reports the SDK appends, to the run and to subscribers', async () => {
    const reported: Incident[] = [];
    const notifier: IncidentNotifier = {
      name: 'memory',
      notify: async (incident) => {
        reported.push(incident);
      },
    };
    const { sdk, provider } = environment({ config: { incidents: { notifiers: [notifier] } } });
    provider.enqueue('default', { error: new Error('model unavailable') });
    const types: string[] = [];
    sdk.subscribe((event) => types.push(event.type));
    const received: Event[] = [];

    const result = await sdk
      .createAgent({ name: 'support', model: 'test-model' })
      .run({ message: 'Hi', onEvent: slowConsumer(received) });

    expect(result.status).toBe('failed');
    expect(reported).toHaveLength(1);
    expect(types.slice(-2)).toEqual(['run.failed', 'incident.reported']);
    expect(ids(received)).toEqual(ids(await sdk.getEvents(result.runId)));
    expect(received.at(-1)?.type).toBe('incident.reported');
  });

  it('refuses an onEvent that is not a function before anything is recorded', async () => {
    const { sdk, store } = environment();
    const agent = sdk.createAgent({ name: 'support', model: 'test-model' });
    const thinker = sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model' });
    const notAFunction = 'log it' as never;

    await expect(agent.run({ message: 'Hi', onEvent: notAFunction })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(thinker.think({ problem: 'Why?', onEvent: notAFunction })).rejects.toBeInstanceOf(
      ValidationError
    );
    await expect(
      sdk.executeTool('lookup_customer', {}, { onEvent: notAFunction })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(() => sdk.subscribe(notAFunction)).toThrow(ValidationError);
    expect(await store.getRunIds()).toEqual([]);
  });

  it('needs a store that delivers live events, and never records the listener', async () => {
    const memory = new MemoryEventStore();
    const provider = new ScriptedLLMProvider().always('default', { content: 'Hello' });
    const received: Event[] = [];

    await expect(
      handBuiltAgent(memory, provider).run({ message: 'Hi', onEvent: () => undefined })
    ).rejects.toThrow('wrap it in an ObservedEventStore');
    expect(memory.events).toEqual([]);

    const result = await handBuiltAgent(new ObservedEventStore(memory), provider).run({
      message: 'Hi',
      onEvent: (event) => received.push(event),
    });

    expect(result.status).toBe('completed');
    expect(ids(received)).toEqual(ids(memory.events));
    expect(memory.events[0]?.data.input).toEqual({ message: 'Hi' });
  });

  it('runs an agent built by hand on a plain store behind a tool whose caller watches the call', async () => {
    const { sdk, provider } = environment();
    scriptLookup(provider);
    const plain = fileStore();
    const agent = handBuiltAgent(plain, provider, [lookupCustomer]);
    sdk.defineTool(governedAgentTool(agent));
    const received: Event[] = [];

    const result = await sdk.executeTool(
      'ask_support',
      { message: 'Which plan is c-42 on?' },
      { onEvent: (event) => received.push(event) }
    );

    // The agent's own store cannot deliver its events: the caller gets those of the call only.
    expect(result).toMatchObject({ status: 'completed', output: 'c-42 is on the enterprise plan' });
    const callRunId = received[0]?.runId ?? '';
    expect(ids(received)).toEqual(ids(await sdk.getEvents(callRunId)));
    expect(received.at(-1)?.type).toBe('run.completed');
    const agentRunId = String(Reflect.get(Object(result), 'runId'));
    expect((await plain.getEvents(agentRunId)).at(-1)?.type).toBe('run.completed');
    // A listener given to that agent directly is still refused.
    await expect(agent.run({ message: 'Hi', onEvent: () => undefined })).rejects.toThrow(
      ValidationError
    );
  });

  it('runs a cognitive agent built by hand on a plain store behind a watched tool call', async () => {
    const { sdk, provider } = environment();
    scriptBuildOrBuy(provider);
    const plain = fileStore();
    const registry = new ToolRegistry();
    const tools = [registry.registerTool(lookupMetricDefinition)];
    const thinker = assembleCognitiveAgent(
      { name: 'analyst', model: 'test-model', tools },
      {
        agentId: 'analyst-1',
        provider,
        eventStore: plain,
        actionEngine: new ActionEngine(new PolicyEngine(), registry, plain),
      }
    );
    sdk.defineTool(cognitiveAgentTool(thinker));
    const received: Event[] = [];

    const result = await sdk.executeTool(
      'ask_analyst',
      { problem: 'Should we build or buy?' },
      { onEvent: (event) => received.push(event) }
    );

    expect(result).toMatchObject({ status: 'completed', decisionStatus: 'committed' });
    expect(received.at(-1)?.type).toBe('run.completed');
    expect(new Set(received.map((event) => event.runId)).size).toBe(1);
  });

  it('stops waiting for its listener when the caller gives up during the run', async () => {
    const { provider, sdk } = environment({ provider: new ScriptedLLMProvider({ delayMs: 200 }) });
    provider.always('default', { content: 'Hello' });
    const agent = sdk.createAgent({ name: 'support', model: 'test-model' });
    const caller = new AbortController();
    const received: Event[] = [];

    const running = agent.run({
      message: 'Hi',
      signal: caller.signal,
      onEvent: neverSettles(received),
    });
    await until(() => provider.requests.length > 0);
    caller.abort();

    expect(await stateAfter(running, 1_000)).toBe('settled');
    expect(await running).toMatchObject({ status: 'cancelled' });
    // The listener is still busy with the first event: the others were dropped for it.
    expect(received.map((event) => event.type)).toEqual(['run.started']);
  });

  it('stops waiting for its listener when the run is stopped', async () => {
    const { provider, sdk } = environment({ provider: new ScriptedLLMProvider({ delayMs: 200 }) });
    provider.always('default', { content: 'Hello' });
    const agent = sdk.createAgent({ name: 'support', model: 'test-model' });
    const received: Event[] = [];

    const running = agent.run({ message: 'Hi', onEvent: neverSettles(received) });
    await until(() => provider.requests.length > 0);
    await sdk.stopRun(received[0]?.runId ?? '');

    expect(await stateAfter(running, 1_000)).toBe('settled');
    expect(await running).toMatchObject({ status: 'cancelled' });
  });

  it('waits for the listener after a finished run until the caller gives up', async () => {
    const { provider, sdk } = environment();
    provider.always('default', { content: 'Hello' });
    const agent = sdk.createAgent({ name: 'support', model: 'test-model' });
    const caller = new AbortController();

    const running = agent.run({ message: 'Hi', signal: caller.signal, onEvent: neverSettles([]) });

    expect(await stateAfter(running, 100)).toBe('pending');
    caller.abort();
    expect(await stateAfter(running, 1_000)).toBe('settled');
    expect(await running).toMatchObject({ status: 'completed', output: 'Hello' });
  });

  it('counts the wait for the listener in the timeout of a cognitive run', async () => {
    const { provider, sdk } = environment();
    scriptBuildOrBuy(provider);
    const agent = sdk.createCognitiveAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [sdk.defineTool(lookupMetricDefinition)],
      limits: { timeoutMs: 400 },
    });

    const thinking = agent.think({ problem: 'Should we build or buy?', onEvent: neverSettles([]) });

    expect(await stateAfter(thinking, 1_500)).toBe('settled');
    expect(await thinking).toMatchObject({ status: 'completed' });
  });

  it('stops waiting for the listener of a tool call when its caller gives up', async () => {
    const { sdk } = environment();
    sdk.defineTool(lookupCustomer);
    const caller = new AbortController();

    const calling = sdk.executeTool(
      'lookup_customer',
      { customerId: 'c-1' },
      { signal: caller.signal, onEvent: neverSettles([]) }
    );

    expect(await stateAfter(calling, 100)).toBe('pending');
    caller.abort();
    expect(await stateAfter(calling, 1_000)).toBe('settled');
    await expect(calling).resolves.toEqual({ customerId: 'c-1', plan: 'enterprise' });
  });

  it('drops the events a subscriber is too far behind to take, and says how many', async () => {
    const failures: Array<{ error: unknown; eventId: string }> = [];
    const { sdk, provider } = environment({
      observe: { onListenerError: (error, event) => failures.push({ error, eventId: event.id }) },
    });
    scriptLookup(provider);
    let release: () => void = () => undefined;
    const busy = new Promise<void>((resolve) => {
      release = resolve;
    });
    const received: Event[] = [];
    sdk.subscribe(
      async (event) => {
        received.push(event);
        await busy;
      },
      { maxQueued: 2 }
    );

    const result = await sdk
      .createAgent({ name: 'support', model: 'test-model', tools: [lookupCustomer] })
      .run({ message: 'Which plan is c-42 on?' });
    release();
    await until(() => failures.length > 0);

    // One event in the listener's hands, two waiting, the other ones dropped.
    const recorded = await sdk.getEvents(result.runId);
    expect(ids(received)).toEqual(ids(recorded.slice(0, 3)));
    expect(failures).toHaveLength(1);
    expect(failures[0]?.error).toBeInstanceOf(LiveEventsDroppedError);
    expect(failures[0]?.error).toMatchObject({ dropped: recorded.length - 3, maxQueued: 2 });
    expect(failures[0]?.eventId).toBe(recorded[3]?.id);
  });

  it('delivers the incident reports of a MonitoredEventStore built on an ObservedEventStore', async () => {
    const notifier: IncidentNotifier = { name: 'memory', notify: async () => undefined };
    const { sdk, provider } = environment({
      wrap: (store) =>
        new MonitoredEventStore(new ObservedEventStore(store), { notifiers: [notifier] }),
    });
    provider.enqueue('default', { error: new Error('model unavailable') });
    const types: string[] = [];
    sdk.subscribe((event) => types.push(event.type));
    const received: Event[] = [];

    const result = await sdk
      .createAgent({ name: 'support', model: 'test-model' })
      .run({ message: 'Hi', onEvent: (event) => received.push(event) });

    expect(result.status).toBe('failed');
    expect(types.slice(-2)).toEqual(['run.failed', 'incident.reported']);
    expect(received.at(-1)?.type).toBe('incident.reported');
  });
});
