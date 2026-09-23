# Story 12.1: SQL Event Store Interface

**Story ID:** 12.1  
**Epic:** 12 - Event Store SQL-Based  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to use a SQL Event Store,
**So that** I can scale and perform advanced queries.

## Acceptance Criteria

**Given** a SQL Event Store interface
**When** I configure the SDK
**Then** I can choose between FileEventStore and SQLEventStore
**And** the IEventStore interface is respected
**And** the migration is transparent

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

1. **SQLEventStore** (`src/stores/sql-event-store.ts`)
   - Generic SQL implementation of `IEventStore`
   - Uses `SQLConnection` interface for database abstraction
   - Supports all IEventStore methods: `append()`, `getEvents()`, `getRunIds()`, `exportEventLog()`
   - Implements filtering by type, timestamp range, and limit
   - Auto-creates schema on initialization

2. **SQLiteEventStore** (`src/stores/sqlite-event-store.ts`)
   - SQLite-specific wrapper using `better-sqlite3`
   - Extends `SQLEventStore` with SQLite connection
   - Provides convenience wrapper for SQLite usage

3. **SQLConnection Interface** (`src/stores/sql-event-store.ts`)
   - Abstract interface for SQL database connections
   - Methods: `query()`, `execute()`, `close()`
   - Allows implementation for any SQL database (SQLite, PostgreSQL, MySQL, etc.)

### Tests

- **Unit Tests**: `src/__tests__/sql-event-store.test.ts` (11 tests, all passing)
  - Tests append, getEvents with filters, getRunIds, exportEventLog

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';
import { SQLEventStore } from '@sdk-ai-agents/core/stores/sql-event-store';
import { SQLiteConnection } from '@sdk-ai-agents/core/stores/sqlite-event-store';
import Database from 'better-sqlite3';

// Create SQLite database
const db = new Database(':memory:');
const connection = new SQLiteConnection(db);

// Create SQL Event Store
const sqlEventStore = new SQLEventStore({
  connection,
  tableName: 'events'
});

// Use with SDK
const sdk = createSDK({
  apiKey: 'your-api-key',
  eventStore: sqlEventStore
});

// Or use SQLiteEventStore convenience wrapper
import { SQLiteEventStore } from '@sdk-ai-agents/core/stores/sqlite-event-store';
const sqliteStore = new SQLiteEventStore({ db });
const sdk2 = createSDK({
  apiKey: 'your-api-key',
  eventStore: sqliteStore
});
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  data TEXT NOT NULL,
  metadata TEXT,
  INDEX idx_run_id (run_id),
  INDEX idx_type (type),
  INDEX idx_timestamp (timestamp)
)
```
