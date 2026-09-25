import { readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentImpl } from '../agent.js';
import { ValidationError } from '../errors/index.js';
import { defineTool } from '../sdk.js';
import { createTestSDK, lookupMetricDefinition, type TestSDK } from './support/test-sdk.js';

/** Two agents of one application: only the analyst has a tool. */
function createAgents(env: TestSDK): { analyst: AgentImpl; greeter: AgentImpl } {
  return {
    analyst: env.sdk.createAgent({
      name: 'analyst',
      model: 'test-model',
      tools: [defineTool(lookupMetricDefinition)],
    }),
    greeter: env.sdk.createAgent({ name: 'greeter', model: 'test-model' }),
  };
}

async function analystRun(env: TestSDK, analyst: AgentImpl): Promise<string> {
  env.provider.enqueue(
    'tool-selection',
    { toolCall: { name: 'lookup_metric', arguments: { metric: 'churn' } } },
    { content: 'Churn is 4%' }
  );
  return (await analyst.run({ message: 'What is our churn?' })).runId;
}

async function greeterRun(env: TestSDK, greeter: AgentImpl): Promise<string> {
  env.provider.enqueue('default', { content: 'Hello!' });
  return (await greeter.run({ message: 'Hi' })).runId;
}

describe('assertions', () => {
  let env: TestSDK;
  let analyst: AgentImpl;
  let greeter: AgentImpl;

  beforeEach(() => {
    env = createTestSDK();
    ({ analyst, greeter } = createAgents(env));
  });

  afterEach(async () => {
    await env.dispose();
  });

  it("evaluates a run against its own agent's assertions and the global ones", async () => {
    await env.sdk.defineAssertion(
      'looks the metric up',
      { type: 'event_present', eventType: 'tool.called' },
      { agentId: analyst.id }
    );
    await env.sdk.defineAssertion(
      'never calls a tool',
      { type: 'event_absent', eventType: 'tool.called' },
      { agentId: greeter.id }
    );
    await env.sdk.defineAssertion('completes', {
      type: 'event_present',
      eventType: 'run.completed',
    });
    const analystRunId = await analystRun(env, analyst);
    const greeterRunId = await greeterRun(env, greeter);

    const forAnalyst = await env.sdk.evaluateAssertions(analystRunId);
    const forGreeter = await env.sdk.evaluateAssertions(greeterRunId);

    // Before, the greeter's "never calls a tool" was evaluated on the analyst's run, and failed.
    expect(
      forAnalyst.results.map((result) => [result.assertionName, result.status]).sort()
    ).toEqual([
      ['completes', 'pass'],
      ['looks the metric up', 'pass'],
    ]);
    expect(forAnalyst).toMatchObject({
      totalAssertions: 2,
      passedAssertions: 2,
      failedAssertions: 0,
    });
    expect(forGreeter.results.map((result) => result.assertionName).sort()).toEqual([
      'completes',
      'never calls a tool',
    ]);
  });

  it("applies an agent's assertions to the agent of the same name in another process", async () => {
    await env.sdk.defineAssertion(
      'never calls a tool',
      { type: 'event_absent', eventType: 'tool.called' },
      { agentId: greeter.id }
    );
    const other = createTestSDK(env.folders);
    try {
      const agents = createAgents(other);

      const forGreeter = await other.sdk.evaluateAssertions(
        await greeterRun(other, agents.greeter)
      );
      const forAnalyst = await other.sdk.evaluateAssertions(
        await analystRun(other, agents.analyst)
      );

      expect(forGreeter.results.map((result) => [result.assertionName, result.status])).toEqual([
        ['never calls a tool', 'pass'],
      ]);
      expect(forAnalyst.totalAssertions).toBe(0);
      expect(await other.sdk.getAssertions('greeter')).toHaveLength(1);
      expect(await other.sdk.getAssertions(agents.greeter.id)).toHaveLength(1);
      expect(await other.sdk.getAssertions(agents.analyst.id)).toHaveLength(0);
    } finally {
      await other.dispose();
    }
  });

  it('keeps a custom assertion working after the assertions are listed', async () => {
    const custom = await env.sdk.defineAssertion('answers', {
      type: 'custom',
      customEvaluator: (events) => events.some((event) => event.type === 'run.completed'),
    });
    const runId = await greeterRun(env, greeter);

    const listed = await env.sdk.getAssertions();
    const report = await env.sdk.evaluateAssertions(runId);

    expect(listed.map((assertion) => assertion.id)).toEqual([custom.id]);
    // Before, listing reloaded it from disk without its function: "requires customEvaluator".
    expect(report.results).toMatchObject([{ assertionId: custom.id, status: 'pass' }]);
  });

  it('keeps a custom assertion in this SDK only: its function cannot be saved', async () => {
    const custom = await env.sdk.defineAssertion('answers', {
      type: 'custom',
      customEvaluator: () => true,
    });
    const saved = await env.sdk.defineAssertion('completes', {
      type: 'event_present',
      eventType: 'run.completed',
    });
    const other = createTestSDK(env.folders);
    try {
      const listedElsewhere = await other.sdk.getAssertions();

      expect(listedElsewhere.map((assertion) => assertion.id)).toEqual([saved.id]);
      expect(readdirSync(env.folders.assertionsDir ?? '')).toEqual([`${saved.id}.json`]);
      await expect(other.sdk.evaluateAssertions('run_x', [custom.id])).rejects.toThrow(
        /Unknown assertion/
      );
      await env.sdk.deleteAssertion(custom.id);
      expect(await env.sdk.getAssertions()).toEqual([saved]);
    } finally {
      await other.dispose();
    }
  });

  it('evaluates only the assertions asked for, and refuses an unknown id', async () => {
    const completes = await env.sdk.defineAssertion('completes', {
      type: 'event_present',
      eventType: 'run.completed',
    });
    await env.sdk.defineAssertion('fails', { type: 'event_present', eventType: 'run.failed' });
    const runId = await greeterRun(env, greeter);

    const report = await env.sdk.evaluateAssertions(runId, [completes.id]);

    expect(report.results.map((result) => result.assertionId)).toEqual([completes.id]);
    // Before, an unknown id was skipped: a typo gave a report where everything passed.
    await expect(env.sdk.evaluateAssertions(runId, [completes.id, 'typo'])).rejects.toThrow(
      /Unknown assertion id\(s\): typo/
    );
  });

  it('refuses a run with no events instead of failing every assertion on it', async () => {
    await env.sdk.defineAssertion('completes', {
      type: 'event_present',
      eventType: 'run.completed',
    });

    await expect(env.sdk.evaluateAssertions('run_that_never_ran')).rejects.toThrow(
      /No events found for runId: run_that_never_ran/
    );
  });

  it('refuses an assertion that could never be evaluated when it is defined', async () => {
    await expect(env.sdk.defineAssertion('no type', { type: 'event_present' })).rejects.toThrow(
      ValidationError
    );
    await expect(env.sdk.defineAssertion('no function', { type: 'custom' })).rejects.toThrow(
      /customEvaluator must be a function/
    );
    await expect(
      env.sdk.defineAssertion('bad order', { type: 'event_order', beforeEventType: 'run.started' })
    ).rejects.toThrow(/afterEventType/);
    // Before, both were accepted: a count without a bound always passed, an empty list of types
    // (which wins over eventType) matched no event.
    await expect(
      env.sdk.defineAssertion('no bound', { type: 'event_count', eventType: 'tool.called' })
    ).rejects.toThrow(/event_count requires count, minCount or maxCount/);
    await expect(
      env.sdk.defineAssertion('empty list', {
        type: 'event_present',
        eventType: 'tool.called',
        eventTypes: [],
      })
    ).rejects.toThrow(/eventTypes must list at least one event type/);
    expect(await env.sdk.getAssertions()).toEqual([]);
  });
});

describe('assertions of two agents of one SDK with the same name', () => {
  let env: TestSDK;

  afterEach(async () => {
    await env.dispose();
  });

  it("apply to their own agent's runs only", async () => {
    env = createTestSDK();
    const v1 = env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '1.0.0' });
    const v2 = env.sdk.createAgent({ name: 'greeter', model: 'test-model', version: '2.0.0' });
    await env.sdk.defineAssertion(
      'v1 never fails',
      { type: 'event_absent', eventType: 'run.failed' },
      { agentId: v1.id }
    );

    const forV1 = await env.sdk.evaluateAssertions(await greeterRun(env, v1));
    const forV2 = await env.sdk.evaluateAssertions(await greeterRun(env, v2));

    expect(forV1.totalAssertions).toBe(1);
    // Before, v2 had v1's assertion: both are named "greeter".
    expect(forV2.totalAssertions).toBe(0);
    expect(await env.sdk.getAssertions(v2.id)).toEqual([]);
    expect(await env.sdk.getAssertions('greeter')).toHaveLength(1);
  });
});
