# Story 15.3: Filtrage Avancé d'Événements

**Epic:** Epic 15 - Advanced Observability & Comparison  
**Status:** completed  
**Priority:** Low  
**FRs:** FR63

## Description

Permettre à un développeur de filtrer les événements par critères avancés pour analyser des aspects spécifiques du comportement d'un agent.

## Contexte

Le filtrage avancé permet d'extraire des sous-ensembles d'événements selon des critères complexes, facilitant l'analyse ciblée du comportement.

## Acceptance Criteria

### AC1: Filtrage par Critères Complexes
**Given** des événements existent  
**When** un développeur appelle `sdk.queryEvents(filters)` avec des critères avancés  
**Then** les événements correspondants sont retournés

### AC2: Opérateurs de Filtrage
**Given** un filtrage est effectué  
**When** des opérateurs sont utilisés  
**Then** les opérateurs suivants sont supportés :
- Comparaisons (eq, ne, gt, gte, lt, lte)
- Recherche (contains, startsWith, endsWith)
- Logique (and, or, not)
- Existence (exists, notExists)
- Regex (matches)

### AC3: Filtrage sur Données et Métadonnées
**Given** des événements avec données et métadonnées existent  
**When** un filtrage est effectué  
**Then** le filtrage peut porter sur :
- Champs dans `data` (chemins JSON)
- Champs dans `metadata` (agentId, userId, sessionId, etc.)
- Combinaisons de champs

## Technical Details

### Types à créer

```typescript
interface AdvancedEventFilter {
  // Filtres existants (déjà dans EventFilters)
  type?: EventType | EventType[];
  since?: number;
  until?: number;
  limit?: number;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  
  // Nouveaux filtres avancés
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
  logic?: 'and' | 'or'; // Comment combiner les filtres
  not?: boolean; // Inverser le résultat
}

interface EventQueryResult {
  events: Event[];
  total: number;
  filtered: number;
  filters: AdvancedEventFilter;
  executionTime: number;
}
```

### Méthodes SDK

- `queryEvents(filters: AdvancedEventFilter): Promise<EventQueryResult>`
- `countEvents(filters: AdvancedEventFilter): Promise<number>`
- `getEventStatistics(filters: AdvancedEventFilter): Promise<{ total: number; byType: Record<EventType, number>; byAgent: Record<string, number> }>`

### Exemples d'utilisation

```typescript
// Trouver tous les tool calls qui ont échoué
const failedTools = await sdk.queryEvents({
  type: 'tool.failed',
  dataFilters: [{
    path: 'tool.name',
    operator: 'eq',
    value: 'calculator'
  }]
});

// Trouver les intentions générées pour un outil spécifique
const intentions = await sdk.queryEvents({
  type: 'intention.generated',
  dataFilters: [{
    path: 'intention.toolName',
    operator: 'exists'
  }]
});
```

## Tests

- Filtrer par chemin JSON dans data
- Filtrer par métadonnées
- Combiner plusieurs filtres avec AND/OR
- Utiliser des opérateurs complexes (regex, contains)
- Compter les événements filtrés
- Obtenir des statistiques

## Dependencies

- Epic 12: Event Store SQL-Based (requêtes avancées déjà implémentées)
- Story 12.3: Requêtes Avancées sur Événements

