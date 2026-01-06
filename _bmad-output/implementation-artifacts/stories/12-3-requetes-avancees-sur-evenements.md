# Story 12.3: Requêtes Avancées sur Événements

**Story ID:** 12.3  
**Epic:** 12 - Event Store SQL-Based  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** développeur,
**I want** faire des requêtes avancées sur les événements,
**So that** je peux analyser les patterns et comportements des agents.

## Acceptance Criteria

**Given** un Event Store SQL configuré
**When** je fais des requêtes avancées
**Then** je peux filtrer par agentId, userId, sessionId
**And** je peux faire des agrégations (count, groupBy)
**And** je peux rechercher dans data/metadata (JSON queries)
**And** les performances sont acceptables

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

