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

/**
 * The text without the characters XML 1.0 cannot hold (outside its `Char` production: control
 * characters other than tab, line feed and carriage return, U+FFFE, U+FFFF) nor surrogates
 * without their pair.
 */
function withoutXmlForbidden(text: string): string {
  let kept = '';
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        kept += text[index] + text[index + 1];
        index++;
      }
      continue;
    }
    const allowed =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code < 0xdc00) ||
      (code > 0xdfff && code < 0xfffe);
    if (allowed) kept += text[index];
  }
  return kept;
}

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
          // Counted in `errors`: written as <error>, which JUnit readers report as such.
          const message = result.error ?? (result.status === 'timeout' ? 'Test timeout' : 'Error');
          testCase.error = { message, type: result.status, details: message };
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
    const element = tc.failure ? 'failure' : tc.error ? 'error' : undefined;
    const problem = tc.failure ?? tc.error;
    if (element && problem) {
      return `${testCaseXML}
      <${element} message="${xml(problem.message)}" type="${xml(problem.type)}">
${xml(problem.details)}
      </${element}>
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

  /**
   * Text or attribute value for XML 1.0. Characters XML cannot hold at all (control characters
   * such as the ANSI escape of colored logs, U+FFFE, U+FFFF, unpaired surrogates) are removed:
   * a single one makes the whole report unreadable for a CI server.
   */
  private static escapeXML(str: string): string {
    return withoutXmlForbidden(str)
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
