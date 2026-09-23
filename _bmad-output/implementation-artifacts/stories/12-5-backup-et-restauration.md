# Story 12.5: Backup and Restore

**Story ID:** 12.5  
**Epic:** 12 - Event Store SQL-Based  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** to be able to back up and restore the Event Store,
**So that** the data is protected.

## Acceptance Criteria

**Given** a SQL Event Store
**When** I perform a backup
**Then** all events are saved
**And** the restoration works correctly
**And** data integrity is preserved

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

1. **BackupData Interface** (`src/stores/event-store.ts`)
   - Defines the structure of backup data
   - Includes version, timestamp, events array, and optional runs array
   - Events are stored with their runId for proper restoration

2. **backup() Method** (`src/stores/sql-event-store.ts`)
   - Exports all events from the store
   - Includes runs information if available
   - Returns a BackupData object with all events sorted by timestamp
   - Works for both SQLite and PostgreSQL

3. **restore() Method** (`src/stores/sql-event-store.ts`)
   - Restores events from a BackupData object
   - Validates backup data structure
   - Restores runs information if provided
   - Processes events in batches for better performance
   - Uses idempotent inserts (ON CONFLICT DO NOTHING / INSERT OR IGNORE)

4. **PostgreSQL-specific restore()** (`src/stores/postgresql-event-store.ts`)
   - Overrides restore() to use PostgreSQL-specific syntax
   - Uses parameterized queries with $1, $2, etc.
   - Handles JSONB data correctly

### Backup Format

```typescript
interface BackupData {
  version: string;           // Backup format version
  timestamp: number;          // When backup was created
  events: Array<{            // All events with their runIds
    runId: string;
    event: Event;
  }>;
  runs?: Array<{             // Optional runs information
    id: string;
    agentId?: string;
    createdAt?: number;
  }>;
}
```

### Usage Example

```typescript
import { SQLEventStore } from '@sdk-ai-agents/core/stores/sql-event-store';
import type { BackupData } from '@sdk-ai-agents/core/stores/event-store';

const store = new SQLEventStore({ connection, tableName: 'events' });

// Create a backup
const backup: BackupData = await store.backup();

// Save backup to file
await fs.writeFile('backup.json', JSON.stringify(backup, null, 2));

// Restore from backup
const backupData: BackupData = JSON.parse(await fs.readFile('backup.json', 'utf-8'));
await store.restore(backupData);
```

### Data Integrity

- **Idempotent Inserts**: Uses `ON CONFLICT DO NOTHING` (PostgreSQL) or `INSERT OR IGNORE` (SQLite) to prevent duplicate events
- **Validation**: Validates backup data structure before restoration
- **Batch Processing**: Processes events in batches of 100 for better performance
- **Preserves Metadata**: All event metadata and data are preserved during backup/restore

### Tests

- **Unit Tests**: `src/__tests__/backup-restore.test.ts` (7 tests, all passing)
  - Tests backup creation with all events
  - Tests restore from backup
  - Tests runs information restoration
  - Tests data integrity after backup/restore
  - Tests error handling for invalid backup data
  - Tests for both SQLEventStore and PostgreSQLEventStore
