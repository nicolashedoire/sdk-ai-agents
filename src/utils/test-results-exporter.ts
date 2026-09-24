import { promises as fs } from 'node:fs';
import type {
  RegressionTestRunResult,
  RegressionTestSuiteResult,
} from '../types/regression-test.js';
import type {
  TestResultsExportOptions,
  JUnitTestSuite,
  TestResultsJSON,
} from '../types/test-results-export.js';

/** One suite's results, or every suite of an agent (`runRegressionTests`). */
export type ExportableTestResults = RegressionTestSuiteResult | RegressionTestRunResult;

function suitesOf(results: ExportableTestResults): RegressionTestSuiteResult[] {
  return 'suites' in results ? results.suites : [results];
}

export class TestResultsExporter {
  static async export(
    results: ExportableTestResults,
    format: 'junit' | 'json' | 'json-summary',
    options: Omit<TestResultsExportOptions, 'format'> = {}
  ): Promise<string> {
    let content: string;

    switch (format) {
      case 'junit':
        content = TestResultsExporter.exportJUnit(results);
        break;
      case 'json':
        content = TestResultsExporter.exportJSON(results, options.includeDetails ?? true);
        break;
      case 'json-summary':
        content = TestResultsExporter.exportJSONSummary(results);
        break;
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }

    if (options.outputPath) {
      await fs.writeFile(options.outputPath, content, 'utf-8');
    }

    return content;
  }

  private static exportJUnit(results: ExportableTestResults): string {
    return TestResultsExporter.generateJUnitXML(
      suitesOf(results).map((suite) => TestResultsExporter.junitSuite(suite))
    );
  }

  private static junitSuite(results: RegressionTestSuiteResult): JUnitTestSuite {
    const agent = results.agentName ?? results.agentId;
    return {
      name: `Agent Regression Tests - ${agent}${results.suiteName ? ` - ${results.suiteName}` : ''}`,
      tests: results.totalTests,
      failures: results.failedTests,
      // A test that timed out did not finish: an error, as for JUnit readers.
      errors: results.errorTests + results.timeoutTests,
      skipped: 0,
      time: results.duration / 1000,
      testCases: results.results.map((result) => {
        const status: 'pass' | 'fail' | 'error' | 'skipped' =
          result.status === 'pass' ? 'pass' : result.status === 'fail' ? 'fail' : 'error';

        const testCase: JUnitTestSuite['testCases'][0] = {
          name: result.name ?? result.goldenTraceId,
          classname: `golden-trace-${result.goldenTraceId}`,
          time: result.duration / 1000,
          status,
        };

        if (result.status === 'fail' && result.regressionReport) {
          const criticalRegressions = result.regressionReport.regressions.filter(
            (r) => r.severity === 'critical'
          );
          const message =
            criticalRegressions.length > 0
              ? `${criticalRegressions.length} critical regression(s) detected`
              : 'Regression detected';

          testCase.failure = {
            message,
            type: 'behavioral',
            details: TestResultsExporter.formatRegressionDetails(result.regressionReport),
          };
        } else if (result.status === 'error' || result.status === 'timeout') {
          const message = result.error ?? (result.status === 'timeout' ? 'Test timeout' : 'Error');
          testCase.failure = { message, type: result.status, details: message };
        }

        return testCase;
      }),
    };
  }

  private static generateJUnitXML(suites: JUnitTestSuite[]): string {
    const xml = TestResultsExporter.escapeXML;
    const testSuites = suites.map(
      (
        suite
      ) => `  <testsuite name="${xml(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" errors="${suite.errors}" skipped="${suite.skipped}" time="${suite.time.toFixed(3)}">
${suite.testCases
  .map((tc) => {
    const testCaseXML = `    <testcase name="${xml(tc.name)}" classname="${xml(tc.classname)}" time="${tc.time.toFixed(3)}">`;
    if (tc.failure) {
      return `${testCaseXML}
      <failure message="${xml(tc.failure.message)}" type="${xml(tc.failure.type)}">
${xml(tc.failure.details)}
      </failure>
    </testcase>`;
    }
    return `${testCaseXML}
    </testcase>`;
  })
  .join('\n')}
  </testsuite>`
    );

    return `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
${testSuites.join('\n')}
</testsuites>`;
  }

  private static exportJSON(results: ExportableTestResults, includeDetails: boolean): string {
    if (!('suites' in results)) {
      return JSON.stringify(TestResultsExporter.suiteJSON(results, includeDetails), null, 2);
    }
    return JSON.stringify(
      {
        ...TestResultsExporter.runSummary(results),
        suites: results.suites.map((suite) => TestResultsExporter.suiteJSON(suite, includeDetails)),
      },
      null,
      2
    );
  }

  private static suiteJSON(
    results: RegressionTestSuiteResult,
    includeDetails: boolean
  ): TestResultsJSON {
    return {
      ...TestResultsExporter.suiteSummary(results),
      results: results.results.map((result) => ({
        goldenTraceId: result.goldenTraceId,
        ...(result.name !== undefined ? { name: result.name } : {}),
        runId: result.runId,
        status: result.status,
        duration: result.duration,
        regressionReport:
          includeDetails && result.regressionReport
            ? {
                status: result.regressionReport.status,
                regressions: result.regressionReport.regressions.map((r) => ({
                  type: r.type,
                  severity: r.severity,
                  impact: r.impact,
                  description: r.description,
                })),
              }
            : undefined,
        error: result.error,
      })),
    };
  }

  private static exportJSONSummary(results: ExportableTestResults): string {
    if (!('suites' in results)) {
      return JSON.stringify(TestResultsExporter.suiteSummary(results), null, 2);
    }
    return JSON.stringify(
      {
        ...TestResultsExporter.runSummary(results),
        suites: results.suites.map((suite) => TestResultsExporter.suiteSummary(suite)),
      },
      null,
      2
    );
  }

  private static suiteSummary(results: RegressionTestSuiteResult) {
    return {
      suiteId: results.suiteId,
      ...(results.suiteName !== undefined ? { suiteName: results.suiteName } : {}),
      agentId: results.agentId,
      ...(results.agentName !== undefined ? { agentName: results.agentName } : {}),
      executedAt: results.executedAt,
      summary: TestResultsExporter.totals(results),
    };
  }

  private static runSummary(results: RegressionTestRunResult) {
    return {
      agentId: results.agentId,
      agentName: results.agentName,
      executedAt: results.executedAt,
      summary: TestResultsExporter.totals(results),
    };
  }

  private static totals(results: ExportableTestResults): TestResultsJSON['summary'] {
    return {
      totalTests: results.totalTests,
      passedTests: results.passedTests,
      failedTests: results.failedTests,
      errorTests: results.errorTests,
      timeoutTests: results.timeoutTests,
      passRate: results.summary.passRate,
      duration: results.duration,
      criticalRegressions: results.summary.criticalRegressions,
    };
  }

  private static formatRegressionDetails(
    regressionReport: RegressionTestSuiteResult['results'][number]['regressionReport']
  ): string {
    if (!regressionReport) return '';

    const lines: string[] = [];
    lines.push(`Status: ${regressionReport.status}`);
    lines.push(`Total Regressions: ${regressionReport.summary.totalRegressions}`);
    lines.push(`Critical: ${regressionReport.summary.criticalCount}`);
    lines.push(`High: ${regressionReport.summary.highCount}`);
    lines.push(`Medium: ${regressionReport.summary.mediumCount}`);
    lines.push(`Low: ${regressionReport.summary.lowCount}`);

    if (regressionReport.regressions.length > 0) {
      lines.push('\nRegressions:');
      regressionReport.regressions.forEach((r, idx) => {
        lines.push(`  ${idx + 1}. [${r.severity.toUpperCase()}] ${r.type}: ${r.description}`);
        lines.push(`     Impact: ${r.impact}`);
      });
    }

    return lines.join('\n');
  }

  private static escapeXML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /** 0: every test passed; 1: a test failed; 2: a test could not run (error or timeout). */
  static calculateExitCode(results: ExportableTestResults): number {
    if (results.errorTests > 0 || results.timeoutTests > 0) {
      return 2;
    }
    if (results.failedTests > 0) {
      return 1;
    }
    return 0;
  }
}
