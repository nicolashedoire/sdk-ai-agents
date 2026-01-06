# Story 12.5: Backup et Restauration

**Story ID:** 12.5  
**Epic:** 12 - Event Store SQL-Based  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** pouvoir faire des backups et restaurations de l'Event Store,
**So that** les données sont protégées.

## Acceptance Criteria

**Given** un Event Store SQL
**When** je fais un backup
**Then** tous les événements sont sauvegardés
**And** la restauration fonctionne correctement
**And** l'intégrité des données est préservée

## Business Value

- **Fonctionnalité**: Feature implémentée
- **Qualité**: Testée et validée
- **Traçabilité**: Événements tracés

## Technical Requirements

### Architecture Actuelle

**État actuel:**
- Implémentation complète dans le codebase
- Fonctionnalité testée et validée
- Code dans `src/` avec tests dans `src/__tests__/`

**Fichiers concernés:**
- Code source dans `src/`
- Tests dans `src/__tests__/`
- Types dans `src/types/`

### Implémentation

Fonctionnalité implémentée et testée. Voir les fichiers sources pour les détails d'implémentation.

## Architecture Compliance

### Principes Respectés

1. **Séparation des responsabilités**: Architecture respectée
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Événements tracés
4. **Sécurité**: Deny-by-default respecté

## Testing Requirements

- ✅ Tests unitaires présents
- ✅ Tests d'intégration présents
- ✅ Fonctionnalité validée

## Story Completion Status

**Status:** review  
**Implementation:** Complète  
**Notes:** Story complétée et testée

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
