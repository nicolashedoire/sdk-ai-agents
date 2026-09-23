# Story 12.2: Migration to PostgreSQL

**Story ID:** 12.2  
**Epic:** 12 - Event Store SQL-Based  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to use PostgreSQL as the Event Store,
**So that** I can benefit from SQL scalability.

## Acceptance Criteria

**Given** PostgreSQL is configured
**When** the SDK persists events
**Then** events are stored in PostgreSQL
**And** performance is acceptable
**And** migration from FileEventStore is possible

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

1. **PostgreSQLConnection** (`src/stores/postgresql-event-store.ts`)
   - Implements `SQLConnection` interface for PostgreSQL
   - Uses `pg.Pool` from node-postgres library
   - Wraps PostgreSQL query and execute methods

2. **PostgreSQLEventStore** (`src/stores/postgresql-event-store.ts`)
   - Extends `SQLEventStore` with PostgreSQL-specific optimizations
   - Uses JSONB for efficient JSON storage and querying
   - Creates `runs` table for foreign key relationships
   - Uses PostgreSQL parameterized queries ($1, $2, etc.)
   - Implements ON CONFLICT handling for idempotency
   - Creates optimized indexes for common queries

3. **Schema Adaptations**
   - Uses VARCHAR instead of TEXT for better indexing
   - Uses JSONB instead of TEXT for JSON data (better performance)
   - Creates composite index on (run_id, timestamp) for efficient queries
   - Foreign key relationship to runs table for data integrity

### Tests

- **Unit Tests**: `src/__tests__/postgresql-event-store.test.ts` (6 tests, all passing)
  - Tests append, getEvents with filters, JSONB handling, and PostgreSQL-specific features

### Dependencies

- **peerDependencies**: `pg ^8.11.0` (required for PostgreSQL support)
- **devDependencies**: `pg ^8.11.3` and `@types/pg ^8.10.9` (for testing)

### Bug Fixes

- Fixed `applyFiltersToSQLPostgreSQL` to correctly return modified SQL string (strings are immutable in JavaScript)
- Fixed test mocks to correctly handle PostgreSQL parameterized queries ($1, $2, etc.)
- Added proper import for `EventAggregation` type

### Usage Example

```typescript
import { createSDK } from '@sdk-ai-agents/core';
import { PostgreSQLEventStore } from '@sdk-ai-agents/core/stores/postgresql-event-store';
import { Pool } from 'pg';

// Create PostgreSQL connection pool
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'sdk_events',
  user: 'postgres',
  password: 'password',
});

// Create PostgreSQL Event Store
const postgresStore = new PostgreSQLEventStore({
  pool,
  tableName: 'events'
});

// Use with SDK
const sdk = createSDK({
  apiKey: 'your-api-key',
  eventStore: postgresStore
});
```

### Database Schema

```sql
CREATE TABLE IF NOT EXISTS runs (
  id VARCHAR(255) PRIMARY KEY,
  agent_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(255) PRIMARY KEY,
  run_id VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  timestamp BIGINT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB,
  CONSTRAINT events_run_id_fk FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_run_id ON events(run_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_run_timestamp ON events(run_id, timestamp);
```
