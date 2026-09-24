import type { AgentImpl } from '../agent.js';
import type {
  RegressionTestSuite,
  RegressionTestOptions,
  RegressionTestResult,
  RegressionTestRunResult,
  RegressionTestSuiteResult,
} from '../types/regression-test.js';
import type { RegressionReport } from '../types/regression.js';
import type { RunInput } from '../types/run.js';

const DEFAULT_TIMEOUT_MS = 60_000;
/** How long a timed-out run has, once cancelled, to record its cancellation. */
const CANCELLATION_GRACE_MS = 1_000;

type SuiteTest = RegressionTestSuite['goldenTraces'][number];

export class RegressionTestRunner {
  /** Runs each golden trace's input through `agent` and compares the run with the trace. */
  static async runTestSuite(
    suite: RegressionTestSuite,
    agent: AgentImpl,
    detectRegressions: (runId: string, goldenTraceId: string) => Promise<RegressionReport>,
    options: RegressionTestOptions = {}
  ): Promise<RegressionTestSuiteResult> {
    const startTime = Date.now();
    const results: RegressionTestResult[] = [];

    let tests = suite.goldenTraces;

    const filterTags = options.filterTags;
    if (filterTags && filterTags.length > 0) {
      tests = tests.filter((gt) => gt.tags?.some((tag) => filterTags.includes(tag)));
    }

    const excludeTags = options.excludeTags;
    if (excludeTags && excludeTags.length > 0) {
      tests = tests.filter((gt) => !gt.tags?.some((tag) => excludeTags.includes(tag)));
    }

    if (options.parallel) {
      // All tests start at once: every result is kept, in the suite's order.
      results.push(
        ...(await Promise.all(
          tests.map((test) =>
            RegressionTestRunner.runSingleTest(test, agent, detectRegressions, options)
          )
        ))
      );
    } else {
      for (const test of tests) {
        const result = await RegressionTestRunner.runSingleTest(
          test,
          agent,
          detectRegressions,
          options
        );
        results.push(result);

        // A failure, an error or a timeout: the first test that does not pass.
        if (options.stopOnFirstFailure && result.status !== 'pass') {
          break;
        }
      }
    }

    return {
      suiteId: suite.id,
      suiteName: suite.name,
      agentId: agent.id,
      agentName: agent.name,
      executedAt: startTime,
      ...RegressionTestRunner.count(results),
      duration: Date.now() - startTime,
      results,
      summary: RegressionTestRunner.calculateSummary(results),
    };
  }

  /** The result of every suite of one agent, as one report. */
  static combine(
    agent: { id: string; name: string },
    suites: RegressionTestSuiteResult[],
    startTime: number
  ): RegressionTestRunResult {
    const results = suites.flatMap((suite) => suite.results);
    return {
      agentId: agent.id,
      agentName: agent.name,
      executedAt: startTime,
      duration: Date.now() - startTime,
      ...RegressionTestRunner.count(results),
      suites,
      summary: RegressionTestRunner.calculateSummary(results),
    };
  }

  private static count(results: RegressionTestResult[]) {
    return {
      totalTests: results.length,
      passedTests: results.filter((r) => r.status === 'pass').length,
      failedTests: results.filter((r) => r.status === 'fail').length,
      errorTests: results.filter((r) => r.status === 'error').length,
      timeoutTests: results.filter((r) => r.status === 'timeout').length,
    };
  }

  private static async runSingleTest(
    test: SuiteTest,
    agent: AgentImpl,
    detectRegressions: (runId: string, goldenTraceId: string) => Promise<RegressionReport>,
    options: RegressionTestOptions
  ): Promise<RegressionTestResult> {
    const startTime = Date.now();
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const base = { goldenTraceId: test.goldenTraceId, name: test.name };

    if (!isRunInput(test.input)) {
      return {
        ...base,
        runId: 'unknown',
        status: 'error',
        duration: 0,
        error: 'The test input is not a run input: it needs a string `message`',
      };
    }

    const controller = new AbortController();
    const timer = settleAfter(timeout);
    try {
      const run = agent.run({ ...test.input, signal: controller.signal });
      const outcome = await Promise.race([run, timer.promise]);
      if (outcome === 'elapsed') {
        // The run is cancelled, not left running; the result waits (a little) for the run to
        // record its cancellation, so it can name the run.
        controller.abort();
        const grace = settleAfter(CANCELLATION_GRACE_MS);
        const stopped = await Promise.race([run, grace.promise]);
        grace.cancel();
        return {
          ...base,
          runId: stopped === 'elapsed' ? 'unknown' : stopped.runId,
          status: 'timeout',
          duration: Date.now() - startTime,
          error: `Test timeout after ${timeout} ms`,
        };
      }
      timer.cancel();

      const regressionReport = await detectRegressions(outcome.runId, test.goldenTraceId);
      return {
        ...base,
        runId: outcome.runId,
        status: regressionReport.status === 'no_regression' ? 'pass' : 'fail',
        duration: Date.now() - startTime,
        regressionReport,
      };
    } catch (error) {
      return {
        ...base,
        runId: 'unknown',
        status: 'error',
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      timer.cancel();
    }
  }

  private static calculateSummary(results: RegressionTestResult[]) {
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const passedCount = results.filter((r) => r.status === 'pass').length;
    const totalRegressions = results.reduce((sum, r) => {
      if (r.regressionReport) {
        return sum + r.regressionReport.summary.criticalCount;
      }
      return sum;
    }, 0);

    return {
      passRate: results.length > 0 ? passedCount / results.length : 0,
      averageDuration: results.length > 0 ? totalDuration / results.length : 0,
      criticalRegressions: totalRegressions,
    };
  }
}

/** A promise settled with 'elapsed' after `ms`, whose timer can be cleared. */
function settleAfter(ms: number): { promise: Promise<'elapsed'>; cancel(): void } {
  let timer: NodeJS.Timeout | undefined;
  const promise = new Promise<'elapsed'>((resolve) => {
    timer = setTimeout(() => resolve('elapsed'), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** A run input as `agent.run` needs it; a suite file edited by hand may hold anything. */
export function isRunInput(value: unknown): value is Omit<RunInput, 'signal'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { message?: unknown }).message === 'string'
  );
}
