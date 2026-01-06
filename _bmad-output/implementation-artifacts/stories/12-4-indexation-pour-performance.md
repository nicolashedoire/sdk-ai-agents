# Story 12.4: Indexation pour Performance

**Story ID:** 12.4  
**Epic:** 12 - Event Store SQL-Based  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** que l'Event Store SQL soit indexé,
**So that** les requêtes sont rapides même avec beaucoup de données.

## Acceptance Criteria

**Given** un Event Store SQL avec indexation
**When** je fais des requêtes
**Then** les index sont utilisés efficacement
**And** les performances sont acceptables
**And** les index sont maintenus automatiquement

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

### Indexes Created

#### SQLEventStore (SQLite and generic SQL)
- **Basic Indexes:**
  - `idx_events_run_id` on `run_id` - for filtering by run
  - `idx_events_type` on `type` - for filtering by event type
  - `idx_events_timestamp` on `timestamp` - for time-based queries
  
- **Composite Indexes:**
  - `idx_events_run_timestamp` on `(run_id, timestamp)` - for efficient run queries with time filters
  - `idx_events_type_timestamp` on `(type, timestamp)` - for efficient type queries with time filters

#### PostgreSQLEventStore (PostgreSQL-specific)
- **Basic Indexes:** Same as SQLEventStore
- **Composite Indexes:** Same as SQLEventStore
  
- **GIN Indexes (JSONB):**
  - `idx_events_metadata_gin` using GIN on `metadata` - for efficient JSONB queries on metadata
  - `idx_events_data_gin` using GIN on `data` - for efficient JSONB queries on data
  
- **Partial Indexes on JSONB Fields:**
  - `idx_events_metadata_agent_id` on `(metadata->>'agentId')` WHERE `metadata->>'agentId' IS NOT NULL`
  - `idx_events_metadata_user_id` on `(metadata->>'userId')` WHERE `metadata->>'userId' IS NOT NULL`
  - `idx_events_metadata_session_id` on `(metadata->>'sessionId')` WHERE `metadata->>'sessionId' IS NOT NULL`

### Performance Benefits

1. **Run Queries:** Index on `run_id` enables fast lookups of events for a specific run
2. **Type Filtering:** Index on `type` speeds up filtering by event type
3. **Time-based Queries:** Index on `timestamp` enables efficient range queries
4. **Composite Queries:** Composite indexes optimize queries that filter by multiple columns
5. **JSON Queries:** GIN indexes on JSONB columns enable fast JSON field queries in PostgreSQL
6. **Metadata Queries:** Partial indexes on common metadata fields optimize `getEventsByAgent`, `getEventsByUser`, `getEventsBySession`

### Tests

- **Unit Tests**: `src/__tests__/indexing.test.ts` (5 tests, all passing)
  - Tests for basic index creation in SQLEventStore
  - Tests for composite index creation
  - Tests for GIN index creation in PostgreSQLEventStore
  - Tests for partial indexes on JSONB fields

### Maintenance

- Indexes are created automatically during schema initialization
- Indexes use `IF NOT EXISTS` to prevent errors on re-initialization
- Indexes are maintained automatically by the database engine
- No manual maintenance required
