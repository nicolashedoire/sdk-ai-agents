# Story 15.3: Advanced Event Filtering

**Epic:** Epic 15 - Advanced Observability & Comparison  
**Status:** completed  
**Priority:** Low  
**FRs:** FR63

## Description

Allow a developer to filter events by advanced criteria in order to analyze specific aspects of an agent's behavior.

## Context

Advanced filtering makes it possible to extract subsets of events according to complex criteria, facilitating targeted analysis of behavior.

## Acceptance Criteria

### AC1: Filtering by Complex Criteria
**Given** events exist  
**When** a developer calls `sdk.queryEvents(filters)` with advanced criteria  
**Then** the matching events are returned

### AC2: Filtering Operators
**Given** filtering is performed  
**When** operators are used  
**Then** the following operators are supported:
- Comparisons (eq, ne, gt, gte, lt, lte)
- Search (contains, startsWith, endsWith)
- Logic (and, or, not)
- Existence (exists, notExists)
- Regex (matches)

### AC3: Filtering on Data and Metadata
**Given** events with data and metadata exist  
**When** filtering is performed  
**Then** filtering can apply to:
- Fields in `data` (JSON paths)
- Fields in `metadata` (agentId, userId, sessionId, etc.)
- Combinations of fields

## Technical Details

### Types to Create

```typescript
interface AdvancedEventFilter {
  // Existing filters (already in EventFilters)
  type?: EventType | EventType[];
  since?: number;
  until?: number;
  limit?: number;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  
  // New advanced filters
  dataFilters?: Array<{
    path: string; // JSON path, e.g., "tool.name" or "intention.type"
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'exists' | 'notExists' | 'matches';
    value?: unknown;
    regex?: string;
  }>;
  metadataFilters?: Array<{
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists' | 'notExists';
    value?: unknown;
  }>;
  logic?: 'and' | 'or'; // How to combine the filters
  not?: boolean; // Invert the result
}

interface EventQueryResult {
  events: Event[];
  total: number;
  filtered: number;
  filters: AdvancedEventFilter;
  executionTime: number;
}
```

### SDK Methods

- `queryEvents(filters: AdvancedEventFilter): Promise<EventQueryResult>`
- `countEvents(filters: AdvancedEventFilter): Promise<number>`
- `getEventStatistics(filters: AdvancedEventFilter): Promise<{ total: number; byType: Record<EventType, number>; byAgent: Record<string, number> }>`

### Usage Examples

```typescript
// Find all tool calls that failed
const failedTools = await sdk.queryEvents({
  type: 'tool.failed',
  dataFilters: [{
    path: 'tool.name',
    operator: 'eq',
    value: 'calculator'
  }]
});

// Find intentions generated for a specific tool
const intentions = await sdk.queryEvents({
  type: 'intention.generated',
  dataFilters: [{
    path: 'intention.toolName',
    operator: 'exists'
  }]
});
```

## Tests

- Filter by JSON path in data
- Filter by metadata
- Combine several filters with AND/OR
- Use complex operators (regex, contains)
- Count filtered events
- Obtain statistics

## Dependencies

- Epic 12: Event Store SQL-Based (advanced queries already implemented)
- Story 12.3: Advanced Event Queries
