import type { AgentImpl } from '../agent.js';
import type {
  RegressionTestSuite,
  RegressionTestOptions,
  RegressionTestResult,
  RegressionTestSuiteResult,
} from '../types/regression-test.js';
import type { RegressionReport } from '../types/regression.js';

export class RegressionTestRunner {
  static async runTestSuite(
    suite: RegressionTestSuite,
    agent: AgentImpl,
    detectRegressions: (runId: string, goldenTraceId: string) => Promise<RegressionReport>,
    options: RegressionTestOptions = {}
  ): Promise<RegressionTestSuiteResult> {
    const startTime = Date.now();
    const results: RegressionTestResult[] = [];

    let goldenTraces = suite.goldenTraces;

    const filterTags = options.filterTags;
    if (filterTags && filterTags.length > 0) {
      goldenTraces = goldenTraces.filter((gt) => gt.tags?.some((tag) => filterTags.includes(tag)));
    }

    const excludeTags = options.excludeTags;
    if (excludeTags && excludeTags.length > 0) {
      goldenTraces = goldenTraces.filter(
        (gt) => !gt.tags?.some((tag) => excludeTags.includes(tag))
      );
    }

    if (options.parallel) {
      const testPromises = goldenTraces.map((gt) =>
        RegressionTestRunner.runSingleTest(
          gt.goldenTraceId,
          gt.input,
          agent,
          detectRegressions,
          options
        )
      );

      const testResults = await Promise.allSettled(testPromises);
      for (const result of testResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          if (options.stopOnFirstFailure && result.value.status === 'fail') {
            break;
          }
        } else {
          results.push({
            goldenTraceId: 'unknown',
            runId: 'unknown',
            status: 'error',
            duration: 0,
            error: result.reason?.message || 'Unknown error',
          });
        }
      }
    } else {
      for (const gt of goldenTraces) {
        const result = await RegressionTestRunner.runSingleTest(
          gt.goldenTraceId,
          gt.input,
          agent,
          detectRegressions,
          options
        );
        results.push(result);

        if (options.stopOnFirstFailure && result.status === 'fail') {
          break;
        }
      }
    }

    const duration = Date.now() - startTime;
    const summary = RegressionTestRunner.calculateSummary(results);

    return {
      suiteId: suite.id,
      agentId: suite.agentId,
      executedAt: startTime,
      totalTests: results.length,
      passedTests: results.filter((r) => r.status === 'pass').length,
      failedTests: results.filter((r) => r.status === 'fail').length,
      errorTests: results.filter((r) => r.status === 'error').length,
      timeoutTests: results.filter((r) => r.status === 'timeout').length,
      duration,
      results,
      summary,
    };
  }

  private static async runSingleTest(
    goldenTraceId: string,
    input: unknown,
    agent: AgentImpl,
    detectRegressions: (runId: string, goldenTraceId: string) => Promise<RegressionReport>,
    options: RegressionTestOptions
  ): Promise<RegressionTestResult> {
    const startTime = Date.now();
    const timeout = options.timeout || 60000;

    try {
      const timeoutPromise = new Promise<RegressionTestResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Test timeout'));
        }, timeout);
      });

      const testPromise = (async () => {
        const runResult = await agent.run(input as { message: string });
        const regressionReport = await detectRegressions(runResult.runId, goldenTraceId);

        const status: RegressionTestResult['status'] =
          regressionReport.status === 'no_regression' ? 'pass' : 'fail';

        return {
          goldenTraceId,
          runId: runResult.runId,
          status,
          duration: Date.now() - startTime,
          regressionReport,
        };
      })();

      return await Promise.race([testPromise, timeoutPromise]);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const isTimeout = errorMessage.includes('timeout');

      return {
        goldenTraceId,
        runId: 'unknown',
        status: isTimeout ? 'timeout' : 'error',
        duration: Date.now() - startTime,
        error: errorMessage,
      };
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
