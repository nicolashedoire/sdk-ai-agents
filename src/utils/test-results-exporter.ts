import { promises as fs } from 'node:fs';
import type { RegressionTestSuiteResult } from '../types/regression-test.js';
import type {
  TestResultsExportOptions,
  JUnitTestSuite,
  TestResultsJSON,
} from '../types/test-results-export.js';

export class TestResultsExporter {
  static async export(
    results: RegressionTestSuiteResult,
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

  private static exportJUnit(results: RegressionTestSuiteResult): string {
    const suite: JUnitTestSuite = {
      name: `Agent Regression Tests - ${results.agentId}`,
      tests: results.totalTests,
      failures: results.failedTests,
      errors: results.errorTests,
      skipped: 0,
      time: results.duration / 1000,
      testCases: results.results.map((result) => {
        const status: 'pass' | 'fail' | 'error' | 'skipped' =
          result.status === 'timeout'
            ? 'error'
            : result.status === 'pass'
              ? 'pass'
              : result.status === 'fail'
                ? 'fail'
                : 'error';

        const testCase: JUnitTestSuite['testCases'][0] = {
          name: result.goldenTraceId,
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
        } else if (result.status === 'error' && result.error) {
          testCase.failure = {
            message: result.error,
            type: 'error',
            details: result.error,
          };
        }

        return testCase;
      }),
    };

    return TestResultsExporter.generateJUnitXML(suite);
  }

  private static generateJUnitXML(suite: JUnitTestSuite): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="${TestResultsExporter.escapeXML(suite.name)}" tests="${suite.tests}" failures="${suite.failures}" errors="${suite.errors}" skipped="${suite.skipped}" time="${suite.time.toFixed(3)}">
${suite.testCases
  .map((tc) => {
    const testCaseXML = `    <testcase name="${TestResultsExporter.escapeXML(tc.name)}" classname="${TestResultsExporter.escapeXML(tc.classname)}" time="${tc.time.toFixed(3)}">`;
    if (tc.failure) {
      return `${testCaseXML}
      <failure message="${TestResultsExporter.escapeXML(tc.failure.message)}" type="${TestResultsExporter.escapeXML(tc.failure.type)}">
${TestResultsExporter.escapeXML(tc.failure.details)}
      </failure>
    </testcase>`;
    }
    return `${testCaseXML}
    </testcase>`;
  })
  .join('\n')}
  </testsuite>
</testsuites>`;

    return xml;
  }

  private static exportJSON(results: RegressionTestSuiteResult, includeDetails: boolean): string {
    const json: TestResultsJSON = {
      suiteId: results.suiteId,
      agentId: results.agentId,
      executedAt: results.executedAt,
      summary: {
        totalTests: results.totalTests,
        passedTests: results.passedTests,
        failedTests: results.failedTests,
        errorTests: results.errorTests,
        timeoutTests: results.timeoutTests,
        passRate: results.summary.passRate,
        duration: results.duration,
        criticalRegressions: results.summary.criticalRegressions,
      },
      results: results.results.map((result) => ({
        goldenTraceId: result.goldenTraceId,
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

    return JSON.stringify(json, null, 2);
  }

  private static exportJSONSummary(results: RegressionTestSuiteResult): string {
    const summary = {
      suiteId: results.suiteId,
      agentId: results.agentId,
      executedAt: results.executedAt,
      summary: {
        totalTests: results.totalTests,
        passedTests: results.passedTests,
        failedTests: results.failedTests,
        errorTests: results.errorTests,
        timeoutTests: results.timeoutTests,
        passRate: results.summary.passRate,
        duration: results.duration,
        criticalRegressions: results.summary.criticalRegressions,
      },
    };

    return JSON.stringify(summary, null, 2);
  }

  private static formatRegressionDetails(
    regressionReport: RegressionTestSuiteResult['results'][0]['regressionReport']
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

  static calculateExitCode(results: RegressionTestSuiteResult): number {
    if (results.errorTests > 0) {
      return 2;
    }
    if (results.failedTests > 0) {
      return 1;
    }
    return 0;
  }
}
