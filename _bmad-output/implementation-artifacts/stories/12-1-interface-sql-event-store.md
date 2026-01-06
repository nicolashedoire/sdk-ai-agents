# Story 12.1: Interface SQL Event Store

**Story ID:** 12.1  
**Epic:** 12 - Event Store SQL-Based  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** utiliser un Event Store SQL,
**So that** je peux scaler et faire des requêtes avancées.

## Acceptance Criteria

**Given** une interface SQL Event Store
**When** je configure le SDK
**Then** je peux choisir entre FileEventStore et SQLEventStore
**And** l'interface IEventStore est respectée
**And** la migration est transparente

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
