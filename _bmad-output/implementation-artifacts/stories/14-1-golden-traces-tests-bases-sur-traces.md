# Story 14.1: Golden Traces - Trace-Based Tests

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR64

## Description

Allow a developer to create trace-based tests (golden traces) to validate an agent's expected behavior.

## Context

Golden traces are "reference" execution traces that represent an agent's expected behavior. They make it possible to detect regressions by comparing new executions with these reference traces.

## Acceptance Criteria

### AC1: Create a Golden Trace
**Given** a developer has a valid execution trace  
**When** they call `sdk.createGoldenTrace(runId, name, description)`  
**Then** a golden trace is created and stored with the runId, the name, the description and the complete trace

### AC2: List Golden Traces
**Given** golden traces exist  
**When** a developer calls `sdk.getGoldenTraces(agentId?)`  
**Then** the list of golden traces is returned, optionally filtered by agentId

### AC3: Delete a Golden Trace
**Given** a golden trace exists  
**When** a developer calls `sdk.deleteGoldenTrace(goldenTraceId)`  
**Then** the golden trace is deleted

### AC4: Export a Golden Trace
**Given** a golden trace exists  
**When** a developer calls `sdk.exportGoldenTrace(goldenTraceId, format)`  
**Then** the golden trace is exported in JSON or YAML format

## Technical Details

### Types to Create

```typescript
interface GoldenTrace {
  id: string;
  name: string;
  description?: string;
  runId: string;
  agentId: string;
  createdAt: number;
  trace: Trace;
  metadata?: Record<string, unknown>;
}

interface GoldenTraceConfig {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
```

### SDK Methods

- `createGoldenTrace(runId: string, config: GoldenTraceConfig): Promise<GoldenTrace>`
- `getGoldenTraces(agentId?: string): Promise<GoldenTrace[]>`
- `getGoldenTrace(goldenTraceId: string): Promise<GoldenTrace>`
- `deleteGoldenTrace(goldenTraceId: string): Promise<void>`
- `exportGoldenTrace(goldenTraceId: string, format?: 'json' | 'yaml'): Promise<string>`

### Storage

Golden traces can be stored in:
- A JSON file in a `golden-traces/` folder
- The Event Store (if SQL) in a dedicated table
- A file system with metadata

## Tests

- Create a golden trace from an existing trace
- List golden traces
- Delete a golden trace
- Export a golden trace
- Handle errors (invalid runId, nonexistent golden trace)

## Dependencies

- Epic 7: Tracing & Observability (traces available)
- Epic 6: Event Sourcing (trace retrieval)
