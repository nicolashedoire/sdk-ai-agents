import type { RegressionDetectionOptions, RegressionReport } from './regression.js';
import type { RunInput } from './run.js';

/** What a regression test sends to the agent: a run input, without its abort signal. */
export type RegressionTestInput = Omit<RunInput, 'signal'>;

export interface RegressionTestSuiteConfig {
  name: string;
  goldenTraces: Array<{
    goldenTraceId: string;
    name: string;
    /** Sent to the agent. Defaults to the input the golden run received. */
    input?: RegressionTestInput;
    tags?: string[];
  }>;
}

export interface RegressionTestSuite {
  id: string;
  name: string;
  /** Id of the agent in the process that created the suite. */
  agentId: string;
  /**
   * Name of that agent. Agent ids are new in every process: another process runs the suite
   * with its agent of this name. Suites saved before it was recorded only have `agentId`.
   */
  agentName?: string;
  goldenTraces: Array<{
    goldenTraceId: string;
    name: string;
    /**
     * The run input sent to the agent (`{ message, context? }`, see `RegressionTestInput`).
     * Checked when the suite is created; a suite file edited by hand is checked when it runs.
     */
    input: unknown;
    /** @deprecated Never set nor read by the SDK. */
    expectedOutput?: unknown;
    tags?: string[];
  }>;
  createdAt: number;
  updatedAt: number;
}

export interface RegressionTestOptions {
  /** Runs the tests of a suite at the same time. `stopOnFirstFailure` then has no effect. */
  parallel?: boolean;
  /** Sequential runs only: the tests after the first failing one are not run. */
  stopOnFirstFailure?: boolean;
  /** Only the golden traces with one of these tags. */
  filterTags?: string[];
  /** Not the golden traces with one of these tags. */
  excludeTags?: string[];
  /** Longest run of one test, in ms (default 60 000). Past it, the run is cancelled. */
  timeout?: number;
  /** How each run is compared with its golden trace (see `detectRegressions`). */
  detection?: RegressionDetectionOptions;
}

export interface RegressionTestResult {
  goldenTraceId: string;
  /** Name of the test in its suite. */
  name?: string;
  runId: string;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  duration: number;
  regressionReport?: RegressionReport;
  error?: string;
}

export interface RegressionTestSuiteResult {
  suiteId: string;
  suiteName?: string;
  /** Id of the agent that ran the tests. */
  agentId: string;
  agentName?: string;
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

/** Every suite of an agent, run one after the other (`runRegressionTests`). */
export interface RegressionTestRunResult {
  /** Id of the agent that ran the tests. */
  agentId: string;
  agentName: string;
  executedAt: number;
  duration: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errorTests: number;
  timeoutTests: number;
  /** One result per suite, oldest suite first. */
  suites: RegressionTestSuiteResult[];
  summary: {
    passRate: number;
    averageDuration: number;
    criticalRegressions: number;
  };
}
