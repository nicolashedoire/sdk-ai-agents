# Story 14.2: Behavior Validation via Replay

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR65

## Description

Allow a developer to validate that an agent behaves as expected by replaying an execution and comparing it with a golden trace.

## Context

Replay allows an execution to be replayed without calling the LLM, using the stored events. This makes it possible to validate that behavior remains consistent.

## Acceptance Criteria

### AC1: Replay with Validation
**Given** a golden trace exists and a runId to validate  
**When** a developer calls `sdk.validateAgainstGoldenTrace(runId, goldenTraceId, options)`  
**Then** the trace of the runId is compared with the golden trace and a validation report is returned

### AC2: Detailed Validation Report
**Given** a validation is performed  
**When** the report is generated  
**Then** it contains:
- The status (pass/fail)
- The identified differences (added/removed/modified events)
- The comparative metrics (duration, number of events, etc.)
- The details of the divergences

### AC3: Validation Options
**Given** a validation is performed  
**When** options are provided  
**Then** the validation can:
- Ignore certain event types
- Tolerate differences in timestamps
- Compare only the structure (not the exact values)
- Validate only certain aspects (intentions, actions, tools)

## Technical Details

### Types to Create

```typescript
interface ValidationOptions {
  ignoreEventTypes?: EventType[];
  ignoreTimestampDiff?: boolean;
  compareStructureOnly?: boolean;
  validateAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  tolerance?: {
    timestampMs?: number;
    dataFields?: string[];
  };
}

interface ValidationResult {
  status: 'pass' | 'fail' | 'partial';
  goldenTraceId: string;
  runId: string;
  differences: ValidationDifference[];
  metrics: {
    totalEvents: { expected: number; actual: number };
    duration: { expected: number; actual: number };
    intentionsGenerated: { expected: number; actual: number };
    actionsExecuted: { expected: number; actual: number };
  };
  summary: string;
}

interface ValidationDifference {
  type: 'event_added' | 'event_removed' | 'event_modified' | 'event_order_changed';
  eventId?: string;
  eventType?: EventType;
  expected?: Event;
  actual?: Event;
  details: string;
}
```

### SDK Methods

- `validateAgainstGoldenTrace(runId: string, goldenTraceId: string, options?: ValidationOptions): Promise<ValidationResult>`
- `replayAndValidate(runId: string, goldenTraceId: string, options?: ValidationOptions): Promise<ValidationResult>`

### Comparison Algorithm

1. Load the golden trace
2. Load the trace of the runId
3. Compare the events in order
4. Identify the differences
5. Calculate the metrics
6. Generate the report

## Tests

- Validate a trace identical to the golden trace (pass)
- Validate a trace with differences (fail)
- Validate with options (ignore certain types)
- Handle errors (nonexistent golden trace, invalid runId)

## Dependencies

- Story 14.1: Golden Traces
- Epic 8: Replay & Debugging (functional replay)
