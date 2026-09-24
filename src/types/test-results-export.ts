export interface TestResultsExportOptions {
  format: 'junit' | 'json' | 'json-summary';
  includeDetails?: boolean;
  outputPath?: string;
}

export interface JUnitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  testCases: Array<{
    name: string;
    classname: string;
    time: number;
    status: 'pass' | 'fail' | 'error' | 'skipped';
    /** A test that found a regression. */
    failure?: {
      message: string;
      type: string;
      details: string;
    };
    /** A test that could not run (an error, or its timeout). */
    error?: {
      message: string;
      type: string;
      details: string;
    };
  }>;
}

/** One suite in the `json` export (`runRegressionTests` results hold one per suite in `suites`). */
export interface TestResultsJSON {
  suiteId: string;
  suiteName?: string;
  agentId: string;
  agentName?: string;
  executedAt: number;
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    errorTests: number;
    timeoutTests: number;
    passRate: number;
    duration: number;
    criticalRegressions: number;
  };
  results: Array<{
    goldenTraceId: string;
    name?: string;
    runId: string;
    status: 'pass' | 'fail' | 'error' | 'timeout';
    duration: number;
    regressionReport?: {
      status: string;
      regressions: Array<{
        type: string;
        severity: string;
        impact: string;
        description: string;
      }>;
    };
    error?: string;
  }>;
}
