# Story 14.1: Golden Traces - Tests Basés sur Traces

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR64

## Description

Permettre à un développeur de créer des tests basés sur des traces (golden traces) pour valider le comportement attendu d'un agent.

## Contexte

Les golden traces sont des traces d'exécution "référence" qui représentent le comportement attendu d'un agent. Elles permettent de détecter les régressions en comparant de nouvelles exécutions avec ces traces de référence.

## Acceptance Criteria

### AC1: Créer une Golden Trace
**Given** un développeur a une trace d'exécution valide  
**When** il appelle `sdk.createGoldenTrace(runId, name, description)`  
**Then** une golden trace est créée et stockée avec le runId, le nom, la description et la trace complète

### AC2: Lister les Golden Traces
**Given** des golden traces existent  
**When** un développeur appelle `sdk.getGoldenTraces(agentId?)`  
**Then** la liste des golden traces est retournée, optionnellement filtrée par agentId

### AC3: Supprimer une Golden Trace
**Given** une golden trace existe  
**When** un développeur appelle `sdk.deleteGoldenTrace(goldenTraceId)`  
**Then** la golden trace est supprimée

### AC4: Exporter une Golden Trace
**Given** une golden trace existe  
**When** un développeur appelle `sdk.exportGoldenTrace(goldenTraceId, format)`  
**Then** la golden trace est exportée au format JSON ou YAML

## Technical Details

### Types à créer

```typescript
interface GoldenTrace {
  id: string;
  name: string;
  description?: string;
  runId: string;
  agentId: string;
  createdAt: number;
  trace: Trace;
  metadata?: Record<string, unknown>;
}

interface GoldenTraceConfig {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
}
```

### Méthodes SDK

- `createGoldenTrace(runId: string, config: GoldenTraceConfig): Promise<GoldenTrace>`
- `getGoldenTraces(agentId?: string): Promise<GoldenTrace[]>`
- `getGoldenTrace(goldenTraceId: string): Promise<GoldenTrace>`
- `deleteGoldenTrace(goldenTraceId: string): Promise<void>`
- `exportGoldenTrace(goldenTraceId: string, format?: 'json' | 'yaml'): Promise<string>`

### Stockage

Les golden traces peuvent être stockées dans :
- Un fichier JSON dans un dossier `golden-traces/`
- L'Event Store (si SQL) dans une table dédiée
- Un système de fichiers avec métadonnées

## Tests

- Créer une golden trace à partir d'une trace existante
- Lister les golden traces
- Supprimer une golden trace
- Exporter une golden trace
- Gérer les erreurs (runId invalide, golden trace inexistante)

## Dependencies

- Epic 7: Tracing & Observability (traces disponibles)
- Epic 6: Event Sourcing (récupération des traces)

