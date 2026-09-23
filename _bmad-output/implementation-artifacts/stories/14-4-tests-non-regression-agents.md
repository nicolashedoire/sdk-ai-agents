# Story 14.4: Non-Regression Tests on Agents

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR67

## Description

Allow a developer to run a suite of non-regression tests on an agent using golden traces and automatically detect regressions.

## Context

Non-regression tests make it possible to ensure that an agent continues to behave as expected after modifications, by systematically comparing it with golden traces.

## Acceptance Criteria

### AC1: Run a Test Suite
**Given** golden traces exist for an agent  
**When** a developer calls `sdk.runRegressionTests(agentId, options)`  
**Then** all tests are executed and a global report is returned

### AC2: Test Report
**Given** a test suite is executed  
**When** the report is generated  
**Then** it contains:
- Number of tests passed/failed
- List of detected regressions
- Global metrics (total duration, success rate)
- Details for each test

### AC3: Execution Options
**Given** a test suite is executed  
**When** options are provided  
**Then** the tests can:
- Run in parallel or sequentially
- Stop on first failure or continue
- Filter by tags or categories
- Include/exclude certain tests

## Technical Details

### Types to Create

```typescript
interface RegressionTestSuite {
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

interface RegressionTestOptions {
  parallel?: boolean;
  stopOnFirstFailure?: boolean;
  filterTags?: string[];
  excludeTags?: string[];
  timeout?: number;
}

interface RegressionTestResult {
  goldenTraceId: string;
  runId: string;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  duration: number;
  regressionReport?: RegressionReport;
  error?: string;
}

interface RegressionTestSuiteResult {
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
```

### SDK Methods

- `createRegressionTestSuite(agentId: string, config: { name: string; goldenTraces: Array<{ goldenTraceId: string; name: string; input: unknown; tags?: string[] }> }): Promise<RegressionTestSuite>`
- `runRegressionTests(agentId: string, options?: RegressionTestOptions): Promise<RegressionTestSuiteResult>`
- `runRegressionTestSuite(suiteId: string, options?: RegressionTestOptions): Promise<RegressionTestSuiteResult>`
- `getRegressionTestSuites(agentId?: string): Promise<RegressionTestSuite[]>`

## Tests

- Create a test suite
- Run a test suite where all tests pass
- Run a suite with detected regressions
- Handle timeouts and errors
- Filter by tags

## Dependencies

- Story 14.1: Golden Traces
- Story 14.3: Regression Detection
