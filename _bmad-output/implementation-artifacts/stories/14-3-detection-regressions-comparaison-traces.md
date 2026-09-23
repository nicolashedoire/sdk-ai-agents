# Story 14.3: Regression Detection via Trace Comparison

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR66

## Description

Allow a developer to automatically detect regressions by comparing a new trace with a golden trace or a reference trace.

## Context

Regression detection makes it possible to automatically identify when an agent's behavior changes unexpectedly, which is crucial for maintaining quality and stability.

## Acceptance Criteria

### AC1: Automatically Detect Regressions
**Given** a golden trace exists and a new trace is generated  
**When** a developer calls `sdk.detectRegressions(newRunId, goldenTraceId, options)`  
**Then** a regression report is returned with the identified differences and their severity

### AC2: Regression Classification
**Given** regressions are detected  
**When** the report is generated  
**Then** the regressions are classified by:
- Severity (critical, high, medium, low)
- Type (behavioral, performance, structural)
- Impact (affects the final result, affects only the process)

### AC3: Tolerance Thresholds
**Given** a regression detection is performed  
**When** thresholds are configured  
**Then** only regressions exceeding the thresholds are reported:
- Maximum acceptable duration difference
- Acceptable number of differing events
- Critical event types to monitor

## Technical Details

### Types to Create

```typescript
interface RegressionDetectionOptions {
  tolerance?: {
    maxDurationDiff?: number;
    maxEventCountDiff?: number;
    criticalEventTypes?: EventType[];
    ignoreEventTypes?: EventType[];
  };
  severityThresholds?: {
    critical?: number;
    high?: number;
    medium?: number;
  };
}

interface Regression {
  id: string;
  type: 'behavioral' | 'performance' | 'structural';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  expected: unknown;
  actual: unknown;
  impact: 'result' | 'process';
  location?: {
    eventId?: string;
    eventType?: EventType;
    timestamp?: number;
  };
}

interface RegressionReport {
  runId: string;
  goldenTraceId: string;
  detectedAt: number;
  status: 'no_regression' | 'regressions_detected' | 'error';
  regressions: Regression[];
  summary: {
    totalRegressions: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  metrics: {
    durationDiff: number;
    eventCountDiff: number;
    similarityScore: number; // 0-1, 1 = identical
  };
}
```

### SDK Methods

- `detectRegressions(newRunId: string, goldenTraceId: string, options?: RegressionDetectionOptions): Promise<RegressionReport>`
- `getRegressionReport(reportId: string): Promise<RegressionReport>`

## Tests

- Detect no regression (identical traces)
- Detect a critical regression (different result)
- Detect a performance regression (different duration)
- Honor tolerance thresholds
- Correctly classify regressions

## Dependencies

- Story 14.1: Golden Traces
- Story 15.1: Comparison of Two Executions
