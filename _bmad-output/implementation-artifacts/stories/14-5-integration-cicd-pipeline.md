# Story 14.5: Test Integration into CI/CD Pipeline

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR68

## Description

Allow trace-based tests to be integrated into a CI/CD pipeline to automatically validate agent behavior on every change.

## Context

CI/CD integration makes it possible to automate the validation of agent behavior, ensuring that changes do not break the expected behavior.

## Acceptance Criteria

### AC1: Export Results for CI/CD
**Given** regression tests are executed  
**When** a developer calls `sdk.exportTestResults(format, options)`  
**Then** the results are exported in a CI/CD-compatible format (JUnit XML, JSON, etc.)

### AC2: Appropriate Exit Code
**Given** tests are executed  
**When** the process ends  
**Then** the exit code reflects the result:
- 0 if all tests pass
- 1 if regressions are detected
- 2 if errors occurred

### AC3: JUnit XML Format
**Given** tests are executed  
**When** the JUnit format is requested  
**Then** a JUnit-compatible XML file is generated with:
- Information about each test
- Execution duration
- Error messages for failures
- Global metrics

## Technical Details

### Types to Create

```typescript
interface TestResultsExportOptions {
  format: 'junit' | 'json' | 'json-summary';
  includeDetails?: boolean;
  outputPath?: string;
}

interface JUnitTestSuite {
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
    failure?: {
      message: string;
      type: string;
      details: string;
    };
  }>;
}
```

### SDK Methods

- `exportTestResults(results: RegressionTestSuiteResult, format: 'junit' | 'json' | 'json-summary', options?: TestResultsExportOptions): Promise<string>`
- `runRegressionTestsForCI(agentId: string, options?: RegressionTestOptions & { exitCode?: boolean }): Promise<{ results: RegressionTestSuiteResult; exitCode: number }>`

### JUnit XML Format

```xml
<testsuites>
  <testsuite name="Agent Regression Tests" tests="10" failures="2" errors="0" time="5.234">
    <testcase name="test-1" classname="golden-trace-1" time="0.523"/>
    <testcase name="test-2" classname="golden-trace-2" time="0.456">
      <failure message="Regression detected" type="behavioral">
        Critical regression: Result differs from expected
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

## Tests

- Export in JUnit XML format
- Export in JSON format
- Generate the correct exit code
- Integrate into an example CI/CD script

## Dependencies

- Story 14.4: Non-Regression Tests
