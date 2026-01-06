import type { RegressionReport } from './regression.js';

export interface RegressionTestSuite {
  id: string;
  name: string;
  agentId: string;
  goldenTraces: Array<{
    goldenTraceId: string;
    name: string;
    input: unknown;
    expectedOutput?: unknown;
    tags?: string[];
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface RegressionTestOptions {
  parallel?: boolean;
  stopOnFirstFailure?: boolean;
  filterTags?: string[];
  excludeTags?: string[];
  timeout?: number;
}

export interface RegressionTestResult {
  goldenTraceId: string;
  runId: string;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  duration: number;
  regressionReport?: RegressionReport;
  error?: string;
}

export interface RegressionTestSuiteResult {
  suiteId: string;
  agentId: string;
  executedAt: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errorTests: number;
  timeoutTests: number;
  duration: number;
  results: RegressionTestResult[];
  summary: {
    passRate: number;
    averageDuration: number;
    criticalRegressions: number;
  };
}

