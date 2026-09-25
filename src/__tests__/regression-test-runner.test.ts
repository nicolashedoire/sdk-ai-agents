import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentImpl } from '../agent.js';
import type { FileEventStore } from '../stores/file-event-store.js';
import type { Regression, RegressionReport } from '../types/regression.js';
import type { RegressionTestOptions, RegressionTestSuite } from '../types/regression-test.js';
import { RegressionTestRunner } from '../utils/regression-test-runner.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

interface DetectionCall {
  runId: string;
  goldenTraceId: string;
  /** Agent runs recorded when the detector was called. */
  runsRecorded: number;
}

/**
 * Regression detector double: answers with the regressions scripted for each golden trace and
 * records every call, with the number of agent runs already recorded at that moment.
 */
class ScriptedRegressionDetector {
  readonly calls: DetectionCall[] = [];

  constructor(
    private readonly store: FileEventStore,
    private readonly regressionsByTrace: Readonly<Record<string, Regression[]>> = {}
  ) {}

  readonly detect = async (runId: string, goldenTraceId: string): Promise<RegressionReport> => {
    const runsRecorded = (await this.store.getRunIds()).length;
    this.calls.push({ runId, goldenTraceId, runsRecorded });
    return regressionReport(runId, goldenTraceId, this.regressionsByTrace[goldenTraceId] ?? []);
  };
}

function regressionReport(
  runId: string,
  goldenTraceId: string,
  regressions: Regression[]
): RegressionReport {
  const count = (severity: Regression['severity']) =>
    regressions.filter((regression) => regression.severity === severity).length;
  return {
    runId,
    goldenTraceId,
    detectedAt: 1_000,
    status: regressions.length === 0 ? 'no_regression' : 'regressions_detected',
    regressions,
    summary: {
      totalRegressions: regressions.length,
      criticalCount: count('critical'),
      highCount: count('high'),
      mediumCount: count('medium'),
      lowCount: count('low'),
    },
    metrics: { durationDiff: 0, eventCountDiff: 0, similarityScore: regressions.length ? 0.5 : 1 },
  };
}

function regression(id: string, severity: Regression['severity']): Regression {
  return {
    id,
    type: 'behavioral',
    severity,
    description: 'Final answer changed',
    expected: 'Hi',
    actual: 'Bye',
    impact: 'result',
  };
}

describe('RegressionTestRunner', () => {
  let env: TestSDK;
  let agent: AgentImpl;

  beforeEach(() => {
    // A real agent answering through a scripted model; each answer takes a moment so that
    // runs started together overlap.
    env = createTestSDK(
      {},
      new ScriptedLLMProvider({ delayMs: 20 }).always('default', { content: 'Hi' })
    );
    agent = env.sdk.createAgent({ name: 'Test Agent', model: 'test-model' });
  });

  afterEach(async () => {
    await env.dispose();
  });

  const createTestSuite = (
    goldenTraces: Array<{ goldenTraceId: string; name: string; input: unknown; tags?: string[] }>
  ): RegressionTestSuite => ({
    id: 'suite-1',
    name: 'Test Suite',
    agentId: 'test-agent',
    goldenTraces,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const twoTraces = (tags: [string[], string[]] | [] = []) =>
    createTestSuite([
      {
        goldenTraceId: 'gt-1',
        name: 'Test 1',
        input: { message: 'Hello' },
        ...(tags[0] ? { tags: tags[0] } : {}),
      },
      {
        goldenTraceId: 'gt-2',
        name: 'Test 2',
        input: { message: 'World' },
        ...(tags[1] ? { tags: tags[1] } : {}),
      },
    ]);

  /** Input the agent received for a run, as recorded in the store. */
  async function inputOf(runId: string): Promise<unknown> {
    const [started] = await env.store.getEvents(runId, { type: 'run.started' });
    return started?.data.input;
  }

  async function recordedInputs(): Promise<unknown[]> {
    const runIds = await env.store.getRunIds();
    return Promise.all(runIds.map(inputOf));
  }

  it('should run tests sequentially by default', async () => {
    const detector = new ScriptedRegressionDetector(env.store);

    const result = await RegressionTestRunner.runTestSuite(twoTraces(), agent, detector.detect, {});

    expect(result).toMatchObject({
      suiteId: 'suite-1',
      suiteName: 'Test Suite',
      // The agent that ran the tests (a suite saved by another process names another id).
      agentId: agent.id,
      agentName: 'Test Agent',
      totalTests: 2,
      passedTests: 2,
      failedTests: 0,
      errorTests: 0,
      timeoutTests: 0,
    });
    const [first, second] = result.results;
    expect(result.results.map((test) => [test.goldenTraceId, test.status])).toEqual([
      ['gt-1', 'pass'],
      ['gt-2', 'pass'],
    ]);
    // Each golden trace input ran the agent once, and its own run was checked.
    expect(await inputOf(first?.runId ?? '')).toEqual({ message: 'Hello' });
    expect(await inputOf(second?.runId ?? '')).toEqual({ message: 'World' });
    expect(await env.store.getRunIds()).toHaveLength(2);
    expect(first?.regressionReport).toEqual(regressionReport(first?.runId ?? '', 'gt-1', []));
    // The second test starts only once the first one has been checked.
    expect(detector.calls).toEqual([
      { runId: first?.runId, goldenTraceId: 'gt-1', runsRecorded: 1 },
      { runId: second?.runId, goldenTraceId: 'gt-2', runsRecorded: 2 },
    ]);
  });

  it('should run tests in parallel when option is set', async () => {
    const detector = new ScriptedRegressionDetector(env.store);
    const options: RegressionTestOptions = {
      parallel: true,
    };

    const result = await RegressionTestRunner.runTestSuite(
      twoTraces(),
      agent,
      detector.detect,
      options
    );

    expect(result.totalTests).toBe(2);
    expect(result.passedTests).toBe(2);
    expect(result.results.map((test) => [test.goldenTraceId, test.status])).toEqual([
      ['gt-1', 'pass'],
      ['gt-2', 'pass'],
    ]);
    expect(await inputOf(result.results[0]?.runId ?? '')).toEqual({ message: 'Hello' });
    expect(await inputOf(result.results[1]?.runId ?? '')).toEqual({ message: 'World' });
    // Both runs had started before the first check.
    expect(detector.calls.map((call) => call.runsRecorded)).toEqual([2, 2]);
    expect(detector.calls.map((call) => call.goldenTraceId).sort()).toEqual(['gt-1', 'gt-2']);
  });

  it('should stop on first failure when option is set', async () => {
    const detector = new ScriptedRegressionDetector(env.store, {
      'gt-1': [regression('reg-1', 'high')],
    });
    const options: RegressionTestOptions = {
      stopOnFirstFailure: true,
    };

    const result = await RegressionTestRunner.runTestSuite(
      twoTraces(),
      agent,
      detector.detect,
      options
    );

    expect(result).toMatchObject({ totalTests: 1, passedTests: 0, failedTests: 1 });
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ goldenTraceId: 'gt-1', status: 'fail' });
    expect(result.results[0]?.regressionReport?.regressions).toEqual([regression('reg-1', 'high')]);
    // The second golden trace never ran.
    expect(detector.calls.map((call) => call.goldenTraceId)).toEqual(['gt-1']);
    expect(await recordedInputs()).toEqual([{ message: 'Hello' }]);
  });

  it('should stop on a test that could not run, not only on a failing one', async () => {
    const detector = new ScriptedRegressionDetector(env.store);
    const suite = createTestSuite([
      // An input without `message` (a suite file edited by hand): the test is an error.
      { goldenTraceId: 'gt-1', name: 'Test 1', input: { text: 'Hello' } },
      { goldenTraceId: 'gt-2', name: 'Test 2', input: { message: 'World' } },
    ]);

    const result = await RegressionTestRunner.runTestSuite(suite, agent, detector.detect, {
      stopOnFirstFailure: true,
    });

    // Before, only a `fail` stopped the suite: the second test ran after the error.
    expect(result.results.map((test) => [test.goldenTraceId, test.status])).toEqual([
      ['gt-1', 'error'],
    ]);
    expect(await recordedInputs()).toEqual([]);
  });

  it('should filter tests by tags', async () => {
    const detector = new ScriptedRegressionDetector(env.store);
    const options: RegressionTestOptions = {
      filterTags: ['smoke'],
    };

    const result = await RegressionTestRunner.runTestSuite(
      twoTraces([['smoke'], ['integration']]),
      agent,
      detector.detect,
      options
    );

    expect(result.totalTests).toBe(1);
    expect(result.results.map((test) => [test.goldenTraceId, test.status])).toEqual([
      ['gt-1', 'pass'],
    ]);
    expect(detector.calls.map((call) => call.goldenTraceId)).toEqual(['gt-1']);
    expect(await recordedInputs()).toEqual([{ message: 'Hello' }]);
  });

  it('should calculate summary correctly', async () => {
    const detector = new ScriptedRegressionDetector(env.store, {
      'gt-2': [regression('reg-1', 'critical'), regression('reg-2', 'critical')],
    });

    const result = await RegressionTestRunner.runTestSuite(twoTraces(), agent, detector.detect, {});

    const durations = result.results.map((test) => test.duration);
    expect(durations).toHaveLength(2);
    expect(durations.every((duration) => duration >= 0)).toBe(true);
    expect(result.summary).toEqual({
      passRate: 0.5,
      averageDuration: ((durations[0] ?? 0) + (durations[1] ?? 0)) / 2,
      criticalRegressions: 2,
    });
    expect(result.summary.averageDuration).toBeGreaterThanOrEqual(0);
    expect(result).toMatchObject({ totalTests: 2, passedTests: 1, failedTests: 1 });
  });

  it('should report a summary without regressions when every test passes', async () => {
    const detector = new ScriptedRegressionDetector(env.store);

    const result = await RegressionTestRunner.runTestSuite(
      createTestSuite([{ goldenTraceId: 'gt-1', name: 'Test 1', input: { message: 'Hello' } }]),
      agent,
      detector.detect,
      {}
    );

    expect(result.summary.passRate).toBe(1);
    expect(result.summary.averageDuration).toBe(result.results[0]?.duration);
    expect(result.summary.averageDuration).toBeGreaterThanOrEqual(0);
    expect(result.summary.criticalRegressions).toBe(0);
  });
});
