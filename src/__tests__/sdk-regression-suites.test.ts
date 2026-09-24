import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { AgentImpl } from '../agent.js';
import type { Incident, IncidentNotifier } from '../incidents/incident.js';
import { defineTool } from '../sdk.js';
import type { RegressionTestSuiteConfig } from '../types/regression-test.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, lookupMetricDefinition, type TestSDK } from './support/test-sdk.js';

const QUESTION = { message: 'What is our churn?' };

/** One run of the analyst: it looks a metric up, then answers. */
function scriptRun(provider: ScriptedLLMProvider, metric = 'churn', answer = 'Churn is 4%'): void {
  provider.enqueue(
    'tool-selection',
    { toolCall: { name: 'lookup_metric', arguments: { metric } } },
    { content: answer }
  );
}

function createAnalyst(env: TestSDK, config: { version?: string } = {}): AgentImpl {
  return env.sdk.createAgent({
    name: 'analyst',
    model: 'test-model',
    tools: [defineTool(lookupMetricDefinition)],
    ...config,
  });
}

describe('golden traces compare what runs do, not their event ids', () => {
  let env: TestSDK;
  let analyst: AgentImpl;
  let goldenId: string;

  beforeEach(async () => {
    env = createTestSDK();
    analyst = createAnalyst(env);
    scriptRun(env.provider);
    const reference = await analyst.run(QUESTION);
    goldenId = (await env.sdk.createGoldenTrace(reference.runId, { name: 'churn' })).id;
  });

  afterEach(async () => {
    await env.dispose();
  });

  it('finds no regression in a run that does the same thing again', async () => {
    scriptRun(env.provider);
    const rerun = await analyst.run(QUESTION);

    const validation = await env.sdk.validateAgainstGoldenTrace(rerun.runId, goldenId);
    const report = await env.sdk.detectRegressions(rerun.runId, goldenId);

    // Before, every event was "removed" and "added": ids are new in every run.
    expect(validation.differences).toEqual([]);
    expect(validation.status).toBe('pass');
    expect(report.status).toBe('no_regression');
    expect(report.regressions).toEqual([]);
    expect(report.metrics.similarityScore).toBe(1);
  });

  it('reports the tool call whose arguments changed, where it happened', async () => {
    scriptRun(env.provider, 'revenue');
    const rerun = await analyst.run(QUESTION);

    const report = await env.sdk.detectRegressions(rerun.runId, goldenId);

    expect(report.status).toBe('regressions_detected');
    const called = report.regressions.find(
      (regression) => regression.location?.eventType === 'tool.called'
    );
    expect(called).toMatchObject({ type: 'behavioral', severity: 'high', impact: 'result' });
    expect(called?.description).toContain('parameters.metric: "churn" → "revenue"');
    // Only the events about the call changed: nothing was added or removed.
    expect(report.summary.totalRegressions).toBe(report.regressions.length);
    expect(
      report.regressions.filter((regression) => /added|missing/.test(regression.description))
    ).toEqual([]);
  });

  it('compares two runs by what they did', async () => {
    scriptRun(env.provider);
    const one = await analyst.run(QUESTION);
    scriptRun(env.provider);
    const two = await analyst.run(QUESTION);
    scriptRun(env.provider, 'revenue');
    const three = await analyst.run(QUESTION);

    const same = await env.sdk.compareRuns(one.runId, two.runId);
    const changed = await env.sdk.compareRuns(one.runId, three.runId);

    expect(same.differences).toEqual([]);
    expect(changed.differences.map((difference) => difference.type)).not.toContain('event_added');
    expect(changed.differences.map((difference) => difference.type)).not.toContain('event_removed');
    expect(
      changed.differences.find((difference) => difference.eventType === 'tool.called')
    ).toMatchObject({ type: 'data_changed' });
  });

  it('validates a replay on what a replay records: tools and policies', async () => {
    const [reference] = await env.sdk.getGoldenTraces(analyst.id);

    const replayed = await env.sdk.replayAndValidate(reference?.runId ?? '', goldenId, {
      validateAspects: ['tools', 'policies'],
    });
    const everything = await env.sdk.replayAndValidate(reference?.runId ?? '', goldenId);

    expect(replayed).toMatchObject({ status: 'pass', differences: [] });
    // A replay calls no model: its intentions are missing from a full comparison.
    expect(everything.status).toBe('fail');
    expect(everything.differences.map((difference) => difference.details)).toContain(
      'intention.generated (lookup_metric) was expected at position 1 but is missing'
    );
  });
});

describe('regression suites', () => {
  let env: TestSDK;
  let analyst: AgentImpl;

  beforeEach(() => {
    env = createTestSDK();
    analyst = createAnalyst(env);
  });

  afterEach(async () => {
    await env.dispose();
  });

  async function goldenRun(name: string, metric = 'churn'): Promise<string> {
    scriptRun(env.provider, metric);
    const run = await analyst.run({ message: `What is our ${metric}?` });
    return (await env.sdk.createGoldenTrace(run.runId, { name })).id;
  }

  it('passes in CI when the agent behaves as recorded', async () => {
    const goldenTraceId = await goldenRun('churn');
    await env.sdk.createRegressionTestSuite(analyst.id, {
      name: 'metrics',
      goldenTraces: [{ goldenTraceId, name: 'churn' }],
    });
    scriptRun(env.provider);

    const { results, exitCode } = await env.sdk.runRegressionTestsForCI(analyst.id);

    // Before, an identical run failed (exit code 1): its events had other ids.
    expect(exitCode).toBe(0);
    expect(results).toMatchObject({ totalTests: 1, passedTests: 1, failedTests: 0 });
    // The input defaults to the one the golden run received.
    const [test] = results.suites[0]?.results ?? [];
    const [started] = await env.sdk.getEvents(test?.runId ?? '', { type: 'run.started' });
    expect(started?.data.input).toEqual({ message: 'What is our churn?' });
  });

  it('fails in CI when the agent calls its tool differently', async () => {
    const goldenTraceId = await goldenRun('churn');
    await env.sdk.createRegressionTestSuite(analyst.id, {
      name: 'metrics',
      goldenTraces: [{ goldenTraceId, name: 'churn' }],
    });
    scriptRun(env.provider, 'revenue');

    const { results, exitCode } = await env.sdk.runRegressionTestsForCI(analyst.id);

    expect(exitCode).toBe(1);
    expect(results.suites[0]?.results[0]).toMatchObject({ name: 'churn', status: 'fail' });
  });

  it('can leave the wording of the answer out and still check the tool calls', async () => {
    const goldenTraceId = await goldenRun('churn');
    await env.sdk.createRegressionTestSuite(analyst.id, {
      name: 'metrics',
      goldenTraces: [{ goldenTraceId, name: 'churn' }],
    });
    // A real model words its answer differently from one run to the next.
    const detection = {
      tolerance: {
        ignoreEventTypes: ['intention.generated' as const],
        ignoreDataFields: ['output'],
      },
    };
    scriptRun(env.provider, 'churn', 'Our churn: 4%');
    scriptRun(env.provider, 'churn', 'Our churn: 4%');
    scriptRun(env.provider, 'revenue', 'Churn is 4%');

    const strict = await env.sdk.runRegressionTestsForCI(analyst.id);
    const reworded = await env.sdk.runRegressionTestsForCI(analyst.id, { detection });
    const otherCall = await env.sdk.runRegressionTestsForCI(analyst.id, { detection });

    expect([strict.exitCode, reworded.exitCode, otherCall.exitCode]).toEqual([1, 0, 1]);
  });

  it('runs every suite of the agent, oldest first', async () => {
    const churn = await goldenRun('churn');
    const revenue = await goldenRun('revenue', 'revenue');
    const first = await env.sdk.createRegressionTestSuite(analyst.id, {
      name: 'churn suite',
      goldenTraces: [{ goldenTraceId: churn, name: 'churn' }],
    });
    const second = await env.sdk.createRegressionTestSuite('analyst', {
      name: 'revenue suite',
      goldenTraces: [{ goldenTraceId: revenue, name: 'revenue' }],
    });
    scriptRun(env.provider, 'churn');
    scriptRun(env.provider, 'revenue');

    const results = await env.sdk.runRegressionTests(analyst.id);

    // Before, only the first suite read from the folder ran.
    expect(results.suites.map((suite) => [suite.suiteId, suite.suiteName])).toEqual([
      [first.id, 'churn suite'],
      [second.id, 'revenue suite'],
    ]);
    expect(results).toMatchObject({
      agentId: analyst.id,
      agentName: 'analyst',
      totalTests: 2,
      passedTests: 2,
      summary: { passRate: 1, criticalRegressions: 0 },
    });
    const junit = await env.sdk.exportTestResults(results, 'junit');
    expect(junit.match(/<testsuite /g)).toHaveLength(2);
    expect(junit).toContain('<testcase name="revenue"');
  });

  it('runs a suite saved by another process, with the agent of the same name', async () => {
    const goldenTraceId = await goldenRun('churn');
    const suite = await env.sdk.createRegressionTestSuite(analyst.id, {
      name: 'metrics',
      goldenTraces: [{ goldenTraceId, name: 'churn' }],
    });
    expect(suite).toMatchObject({ agentId: analyst.id, agentName: 'analyst' });
    // Another process sharing the folders: the same agent has a new id there.
    const ci = createTestSDK(env.folders);
    try {
      const analystInCi = createAnalyst(ci);
      scriptRun(ci.provider);
      scriptRun(ci.provider);

      const bySuite = await ci.sdk.runRegressionTestSuite(suite.id);
      const byName = await ci.sdk.runRegressionTests('analyst');

      // Before: "Agent <id of the other process> not found".
      expect(bySuite).toMatchObject({ agentId: analystInCi.id, passedTests: 1 });
      expect(byName).toMatchObject({ agentId: analystInCi.id, totalTests: 1, passedTests: 1 });
      expect(await ci.sdk.getRegressionTestSuites(analystInCi.id)).toHaveLength(1);
    } finally {
      await ci.dispose();
    }
  });

  it('refuses to guess between two agents of the same name', async () => {
    const goldenTraceId = await goldenRun('churn');
    createAnalyst(env);

    await expect(
      env.sdk.createRegressionTestSuite('analyst', {
        name: 'metrics',
        goldenTraces: [{ goldenTraceId, name: 'churn' }],
      })
    ).rejects.toThrow(/2 agents are named "analyst"/);
  });

  it('refuses a suite whose golden trace does not exist or whose input is not a run input', async () => {
    const goldenTraceId = await goldenRun('churn');

    await expect(
      env.sdk.createRegressionTestSuite(analyst.id, {
        name: 'metrics',
        goldenTraces: [{ goldenTraceId: 'missing', name: 'churn' }],
      })
    ).rejects.toThrow(/goldenTraces\[0\]\.goldenTraceId/);
    // A suite read from a configuration file, whose input has no message.
    const fromFile: RegressionTestSuiteConfig = JSON.parse(
      JSON.stringify({
        name: 'metrics',
        goldenTraces: [{ goldenTraceId, name: 'churn', input: { text: 'no message' } }],
      })
    );
    await expect(env.sdk.createRegressionTestSuite(analyst.id, fromFile)).rejects.toThrow(
      /goldenTraces\[0\]\.input/
    );
    expect(await env.sdk.getRegressionTestSuites()).toEqual([]);
  });

  it('cancels a test that runs past its timeout and fails CI with an error code', async () => {
    const goldenTraceId = await goldenRun('churn');
    await env.sdk.createRegressionTestSuite(analyst.id, {
      name: 'metrics',
      goldenTraces: [{ goldenTraceId, name: 'churn' }],
    });
    // Another process sharing the folders, whose model takes far longer than the test's
    // timeout (the cancellation stops the wait at once).
    const slow = createTestSDK(env.folders, new ScriptedLLMProvider({ delayMs: 10_000 }));
    try {
      const slowAnalyst = createAnalyst(slow);
      scriptRun(slow.provider);

      const { results, exitCode } = await slow.sdk.runRegressionTestsForCI(slowAnalyst.name, {
        timeout: 30,
      });

      // Before, a timeout left the exit code at 0.
      expect(exitCode).toBe(2);
      const [test] = results.suites[0]?.results ?? [];
      expect(test).toMatchObject({ status: 'timeout', error: 'Test timeout after 30 ms' });
      // The run was stopped, not left running.
      const events = await slow.sdk.getEvents(test?.runId ?? '');
      expect(events.at(-1)?.type).toBe('run.cancelled');
      const junit = await slow.sdk.exportTestResults(results, 'junit');
      expect(junit).toContain('errors="1"');
      expect(junit).toContain('<error message="Test timeout after 30 ms" type="timeout">');
      await expect(slow.sdk.runRegressionTests('analyst', { timeout: 0 })).rejects.toThrow(
        /timeout - must be a positive number/
      );
      // A Node.js timer cannot wait longer: it would fire at once.
      await expect(slow.sdk.runRegressionTests('analyst', { timeout: 2 ** 31 })).rejects.toThrow(
        /timeout - must be at most 2147483647 ms/
      );
    } finally {
      await slow.dispose();
    }
  });
});

describe('what a comparison leaves out, and what it never does', () => {
  let env: TestSDK;

  afterEach(async () => {
    await env.dispose();
  });

  const scheduleSchema = z.object({ title: z.string(), duration: z.number() });
  const schedule = defineTool({
    name: 'schedule',
    description: 'Books a meeting',
    schema: scheduleSchema,
    handler: async (params: unknown) => ({ booked: scheduleSchema.parse(params) }),
  });

  function scriptMeeting(provider: ScriptedLLMProvider, duration: number, text?: string): void {
    provider.enqueue(
      'tool-selection',
      {
        toolCall: { name: 'schedule', arguments: { title: 'Sync', duration } },
        ...(text ? { content: text } : {}),
      },
      { content: 'Booked.' }
    );
  }

  const recipe = {
    tolerance: {
      ignoreEventTypes: ['intention.generated' as const],
      ignoreDataFields: ['output'],
    },
  };

  it("reports a tool parameter named like a volatile field (a meeting's duration)", async () => {
    env = createTestSDK();
    const planner = env.sdk.createAgent({
      name: 'planner',
      model: 'test-model',
      tools: [schedule],
    });
    scriptMeeting(env.provider, 30);
    const golden = await env.sdk.createGoldenTrace((await planner.run({ message: 'Book' })).runId, {
      name: 'sync',
    });
    scriptMeeting(env.provider, 60);
    const rerun = await planner.run({ message: 'Book' });

    const report = await env.sdk.detectRegressions(rerun.runId, golden.id, recipe);
    const validation = await env.sdk.validateAgainstGoldenTrace(rerun.runId, golden.id);

    // Before, `duration` was dropped at every depth: no regression, and a `pass`.
    expect(report.status).toBe('regressions_detected');
    expect(report.regressions.map((regression) => regression.description)).toContain(
      'tool.called (schedule) data differs: parameters.duration: 30 → 60'
    );
    expect(validation.status).toBe('fail');
  });

  it('passes the same call written with another preamble, with the documented recipe', async () => {
    env = createTestSDK();
    const planner = env.sdk.createAgent({
      name: 'planner',
      model: 'test-model',
      tools: [schedule],
    });
    scriptMeeting(env.provider, 30, 'Let me book that for you.');
    const golden = await env.sdk.createGoldenTrace((await planner.run({ message: 'Book' })).runId, {
      name: 'sync',
    });
    scriptMeeting(env.provider, 30, 'Booking the meeting now.');
    const rerun = await planner.run({ message: 'Book' });

    const report = await env.sdk.detectRegressions(rerun.runId, golden.id, recipe);
    const validation = await env.sdk.validateAgainstGoldenTrace(rerun.runId, golden.id);

    // Before, the preamble copied into each event's intention made the same call a regression.
    expect(report.regressions).toEqual([]);
    expect(validation.differences.map((difference) => difference.details)).toEqual([
      'intention.generated (schedule) data differs: message: "Let me book that for you." → "Booking the meeting now."',
    ]);
  });

  it('leaves the incidents out: they depend on deliveries and throttling', async () => {
    const delivered: Incident[] = [];
    const notifier: IncidentNotifier = {
      name: 'recorder',
      notify: async (incident) => {
        delivered.push(incident);
      },
    };
    const provider = new ScriptedLLMProvider()
      .enqueue('default', { error: new Error('model unavailable') })
      .enqueue('default', { error: new Error('model unavailable') });
    env = createTestSDK({ incidents: { notifiers: [notifier] } }, provider);
    const greeter = env.sdk.createAgent({ name: 'greeter', model: 'test-model' });
    const first = await greeter.run({ message: 'Hi' });
    const golden = await env.sdk.createGoldenTrace(first.runId, { name: 'outage' });
    const second = await greeter.run({ message: 'Hi' });

    const validation = await env.sdk.validateAgainstGoldenTrace(second.runId, golden.id);

    // The second incident was throttled: another id, no delivery, `suppressed`.
    expect(delivered).toHaveLength(1);
    expect(await env.sdk.getEvents(second.runId, { type: 'incident.reported' })).toHaveLength(1);
    expect(validation).toMatchObject({ status: 'pass', differences: [] });
  });
});

describe('two agents of one SDK with the same name', () => {
  let env: TestSDK;
  let v1: AgentImpl;
  let v2: AgentImpl;

  beforeEach(() => {
    env = createTestSDK();
    v1 = createAnalyst(env, { version: '1.0.0' });
    v2 = createAnalyst(env, { version: '2.0.0' });
  });

  afterEach(async () => {
    await env.dispose();
  });

  it("keep their own suites: an agent's id never picks another agent's suite", async () => {
    scriptRun(env.provider);
    const golden = await env.sdk.createGoldenTrace((await v1.run(QUESTION)).runId, {
      name: 'churn',
    });
    const suite = await env.sdk.createRegressionTestSuite(v1.id, {
      name: 'v1 suite',
      goldenTraces: [{ goldenTraceId: golden.id, name: 'churn' }],
    });

    // Before, v2 ran v1's suite: both are named "analyst".
    await expect(env.sdk.runRegressionTests(v2.id)).rejects.toThrow(
      `No regression test suites found for agent ${v2.id}`
    );
    expect(await env.sdk.getRegressionTestSuites(v2.id)).toEqual([]);
    expect(await env.sdk.getGoldenTraces(v2.id)).toEqual([]);
    // By name, every agent of that name.
    expect((await env.sdk.getRegressionTestSuites('analyst')).map((found) => found.id)).toEqual([
      suite.id,
    ]);
    await expect(
      env.sdk.createRegressionTestSuite('analyst', { name: 'x', goldenTraces: [] })
    ).rejects.toThrow(/pass the id of the one to use, or create each agent once and reuse it/);
  });
});
