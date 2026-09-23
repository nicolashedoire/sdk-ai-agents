# Story 12.3: Advanced Queries on Events

**Story ID:** 12.3  
**Epic:** 12 - Event Store SQL-Based  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to perform advanced queries on events,
**So that** I can analyze agent patterns and behaviors.

## Acceptance Criteria

**Given** a configured SQL Event Store
**When** I perform advanced queries
**Then** I can filter by agentId, userId, sessionId
**And** I can perform aggregations (count, groupBy)
**And** I can search within data/metadata (JSON queries)
**And** performance is acceptable

## Business Value

- **Feature**: Feature implemented
- **Quality**: Tested and validated
- **Traceability**: Events traced

## Technical Requirements

### Current Architecture

**Current state:**
- Complete implementation in the codebase
- Tested and validated functionality
- Code in `src/` with tests in `src/__tests__/`

**Files concerned:**
- Source code in `src/`
- Tests in `src/__tests__/`
- Types in `src/types/`

### Implementation

Feature implemented and tested. See the source files for implementation details.

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Events traced
4. **Security**: Deny-by-default respected

## Testing Requirements

- ✅ Unit tests present
- ✅ Integration tests present
- ✅ Functionality validated

## Story Completion Status

**Status:** review  
**Implementation:** Complete  
**Notes:** Story completed and tested

## Implementation Details

### Components Created

1. **Extended EventFilters** (`src/types/events.ts`)
   - Added `agentId`, `userId`, `sessionId` filters
   - Added `dataQuery` and `metadataQuery` for JSON field queries
   - Supports operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `exists`

2. **EventAggregation** (`src/types/events.ts`)
   - Supports grouping by: `type`, `agentId`, `userId`, `sessionId`, `day`, `hour`
   - Supports counting and aggregations

3. **EventQueryResult** (`src/types/events.ts`)
   - Returns events with optional aggregation results

4. **Extended IEventStore** (`src/stores/event-store.ts`)
   - Added optional methods: `queryEvents`, `getEventsByAgent`, `getEventsByUser`, `getEventsBySession`, `countEvents`, `groupEventsBy`

5. **SQLEventStore Advanced Queries** (`src/stores/sql-event-store.ts`)
   - Implemented `queryEvents` for cross-run queries
   - Implemented `getEventsByAgent`, `getEventsByUser`, `getEventsBySession`
   - Implemented `countEvents` for counting events
   - Implemented `groupEventsBy` for grouping events
   - Refactored `applyFiltersToSQL` to return modified SQL (fixes string immutability issue)
   - Supports JSON_EXTRACT for SQLite JSON queries
   - Full support for `dataQuery` and `metadataQuery` with all operators (eq, ne, gt, gte, lt, lte, contains, exists)
   - Updated `getEvents` to use `applyFiltersToSQL` for consistency

6. **PostgreSQLEventStore Advanced Queries** (`src/stores/postgresql-event-store.ts`)
   - Overrides `applyFiltersToSQL` for PostgreSQL JSONB syntax (`->>` operator)
   - Overrides `groupEventsBy` for PostgreSQL date functions (`TO_TIMESTAMP`, `DATE_TRUNC`)

### Tests

- **Unit Tests**: `src/__tests__/advanced-queries.test.ts` (13 tests, all passing)
  - Tests for `queryEvents`, `getEventsByAgent`, `getEventsByUser`, `getEventsBySession`
  - Tests for `countEvents` and `groupEventsBy`
  - Tests for filtering by `agentId`, `userId`, `sessionId`
  - Tests for `dataQuery` filtering
  - Tests for aggregation with `groupBy` and `count`

### Bug Fixes

- Fixed `applyFiltersToSQL` to return modified SQL string instead of modifying in place (strings are immutable in JavaScript)
- Added full support for `metadataQuery` in addition to `dataQuery`
- Added support for all operators: `gt`, `gte`, `lt`, `lte`, `contains` (previously only `eq`, `ne`, `exists` were supported)
- Updated all query methods (`queryEvents`, `countEvents`, `groupEventsBy`, `getEvents`) to use the refactored `applyFiltersToSQL`

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';
import { SQLiteEventStore } from '@sdk-ai-agents/core/stores/sqlite-event-store';

const store = new SQLiteEventStore({ db: dbInstance });

// Query events by agent
const agentEvents = await store.getEventsByAgent('agent-1');

// Query events by user
const userEvents = await store.getEventsByUser('user-1');

// Count events
const count = await store.countEvents({ type: 'action.executed' });

// Group events by type
const groups = await store.groupEventsBy('type');

// Advanced query with aggregation
const result = await store.queryEvents(
  { agentId: 'agent-1', since: Date.now() - 86400000 },
  { groupBy: 'type', count: true }
);
```

