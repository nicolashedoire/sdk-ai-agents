# Story 14.6: Assertions on Agent Behavior

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR69

## Description

Allow a developer to define assertions about an agent's behavior in order to validate specific aspects of its operation.

## Context

Assertions make it possible to validate specific aspects of an agent's behavior beyond a simple comparison with a golden trace, such as the presence of certain events, the order of actions, or constraints on values.

## Acceptance Criteria

### AC1: Define Assertions
**Given** a developer wants to validate the behavior  
**When** they call `sdk.defineAssertion(name, condition, options)`  
**Then** an assertion is created and can be used in tests

### AC2: Supported Assertion Types
**Given** assertions are defined  
**When** they are evaluated  
**Then** the following types are supported:
- Presence of events (a given type must appear)
- Order of events (event A must precede B)
- Values within events (value must be within a range)
- Number of occurrences (event must appear N times)
- Absence of events (a given type must not appear)

### AC3: Evaluate Assertions
**Given** assertions exist and a trace is available  
**When** a developer calls `sdk.evaluateAssertions(runId, assertionIds)`  
**Then** each assertion is evaluated and a report is returned

## Technical Details

### Types to Create

```typescript
type AssertionType = 
  | 'event_present'
  | 'event_absent'
  | 'event_order'
  | 'event_count'
  | 'event_value'
  | 'custom';

interface AssertionCondition {
  type: AssertionType;
  eventType?: EventType;
  eventTypes?: EventType[];
  count?: number;
  minCount?: number;
  maxCount?: number;
  beforeEventType?: EventType;
  afterEventType?: EventType;
  valuePath?: string;
  valueMatcher?: {
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
    value: unknown;
  };
  customEvaluator?: (events: Event[]) => boolean;
}

interface Assertion {
  id: string;
  name: string;
  description?: string;
  condition: AssertionCondition;
  severity?: 'error' | 'warning';
  tags?: string[];
  createdAt: number;
}

interface AssertionResult {
  assertionId: string;
  assertionName: string;
  status: 'pass' | 'fail' | 'error';
  message?: string;
  details?: Record<string, unknown>;
  evaluatedAt: number;
}

interface AssertionEvaluationReport {
  runId: string;
  evaluatedAt: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  errorAssertions: number;
  results: AssertionResult[];
}
```

### SDK Methods

- `defineAssertion(name: string, condition: AssertionCondition, options?: { description?: string; severity?: 'error' | 'warning'; tags?: string[] }): Promise<Assertion>`
- `getAssertions(agentId?: string, tags?: string[]): Promise<Assertion[]>`
- `evaluateAssertions(runId: string, assertionIds?: string[]): Promise<AssertionEvaluationReport>`
- `deleteAssertion(assertionId: string): Promise<void>`

## Tests

- Create an event-presence assertion
- Create an event-order assertion
- Create a value assertion
- Evaluate assertions on a valid trace
- Evaluate assertions on an invalid trace
- Handle evaluation errors

## Dependencies

- Epic 7: Tracing & Observability (access to events)
