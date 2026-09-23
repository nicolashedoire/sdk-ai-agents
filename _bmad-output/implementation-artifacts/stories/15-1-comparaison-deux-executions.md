# Story 15.1: Comparison of Two Executions

**Epic:** Epic 15 - Advanced Observability & Comparison  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR49

## Description

Allow a developer to compare two executions in order to identify differences and understand behavioral variations.

## Context

Comparing executions makes it possible to analyze the differences between two runs, whether to understand variations, detect regressions, or analyze the impact of changes.

## Acceptance Criteria

### AC1: Compare Two Runs
**Given** two valid runIds  
**When** a developer calls `sdk.compareRuns(runId1, runId2, options)`  
**Then** a detailed comparison is returned with the identified differences

### AC2: Comparison Report
**Given** a comparison is performed  
**When** the report is generated  
**Then** it contains:
- The comparative metrics (duration, events, intentions, actions, tools)
- The event differences (added, removed, modified)
- The sequence differences (event order)
- The data differences (values within events)
- A summary of the main differences

### AC3: Comparison Options
**Given** a comparison is performed  
**When** options are provided  
**Then** the comparison can:
- Ignore certain event types
- Compare only the structure
- Focus on certain aspects (intentions, actions, tools)
- Include/exclude metadata

## Technical Details

### Types to Create

```typescript
interface ComparisonOptions {
  ignoreEventTypes?: EventType[];
  compareStructureOnly?: boolean;
  focusAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  includeMetadata?: boolean;
  groupSimilarEvents?: boolean;
}

interface RunComparison {
  runId1: string;
  runId2: string;
  metrics: {
    totalEvents: { run1: number; run2: number; diff: number };
    duration: { run1: number; run2: number; diff: number };
    intentionsGenerated: { run1: number; run2: number; diff: number };
    actionsExecuted: { run1: number; run2: number; diff: number };
    toolsCalled: { run1: number; run2: number; diff: number };
  };
  differences: ComparisonDifference[];
  summary: {
    totalDifferences: number;
    criticalDifferences: number;
    mainDifferences: string[];
  };
}

interface ComparisonDifference {
  type: 'event_added' | 'event_removed' | 'event_modified' | 'sequence_changed' | 'data_changed';
  eventId?: string;
  eventType?: EventType;
  run1?: Event;
  run2?: Event;
  details: string;
  severity?: 'low' | 'medium' | 'high';
}
```

### SDK Methods

- `compareRuns(runId1: string, runId2: string, options?: ComparisonOptions): Promise<RunComparison>`
- `getComparisonReport(comparison: RunComparison, format?: 'json' | 'html' | 'text'): Promise<string>`

### Comparison Algorithm

1. Load the two traces
2. Compare the global metrics
3. Compare the events in order
4. Identify the differences (addition, removal, modification)
5. Analyze the sequence differences
6. Compare the data of similar events
7. Calculate the severity of the differences
8. Generate the summary

## Tests

- Compare two identical runs (no difference)
- Compare two runs with differences
- Compare with options (ignore certain types)
- Handle errors (invalid runId)

## Dependencies

- Epic 7: Tracing & Observability (trace retrieval)
- Epic 6: Event Sourcing (access to events)
