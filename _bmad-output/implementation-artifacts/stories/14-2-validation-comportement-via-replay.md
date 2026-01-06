# Story 14.2: Validation Comportement via Replay

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR65

## Description

Permettre à un développeur de valider qu'un agent se comporte de manière attendue en rejouant une exécution et en comparant avec une golden trace.

## Contexte

Le replay permet de rejouer une exécution sans appeler le LLM, en utilisant les événements stockés. Cela permet de valider que le comportement reste cohérent.

## Acceptance Criteria

### AC1: Rejouer avec Validation
**Given** une golden trace existe et un runId à valider  
**When** un développeur appelle `sdk.validateAgainstGoldenTrace(runId, goldenTraceId, options)`  
**Then** la trace du runId est comparée avec la golden trace et un rapport de validation est retourné

### AC2: Rapport de Validation Détaillé
**Given** une validation est effectuée  
**When** le rapport est généré  
**Then** il contient :
- Le statut (pass/fail)
- Les différences identifiées (événements ajoutés/supprimés/modifiés)
- Les métriques comparatives (durée, nombre d'événements, etc.)
- Les détails des divergences

### AC3: Options de Validation
**Given** une validation est effectuée  
**When** des options sont fournies  
**Then** la validation peut :
- Ignorer certains types d'événements
- Tolérer des différences dans les timestamps
- Comparer uniquement la structure (pas les valeurs exactes)
- Valider uniquement certains aspects (intentions, actions, tools)

## Technical Details

### Types à créer

```typescript
interface ValidationOptions {
  ignoreEventTypes?: EventType[];
  ignoreTimestampDiff?: boolean;
  compareStructureOnly?: boolean;
  validateAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  tolerance?: {
    timestampMs?: number;
    dataFields?: string[];
  };
}

interface ValidationResult {
  status: 'pass' | 'fail' | 'partial';
  goldenTraceId: string;
  runId: string;
  differences: ValidationDifference[];
  metrics: {
    totalEvents: { expected: number; actual: number };
    duration: { expected: number; actual: number };
    intentionsGenerated: { expected: number; actual: number };
    actionsExecuted: { expected: number; actual: number };
  };
  summary: string;
}

interface ValidationDifference {
  type: 'event_added' | 'event_removed' | 'event_modified' | 'event_order_changed';
  eventId?: string;
  eventType?: EventType;
  expected?: Event;
  actual?: Event;
  details: string;
}
```

### Méthodes SDK

- `validateAgainstGoldenTrace(runId: string, goldenTraceId: string, options?: ValidationOptions): Promise<ValidationResult>`
- `replayAndValidate(runId: string, goldenTraceId: string, options?: ValidationOptions): Promise<ValidationResult>`

### Algorithme de Comparaison

1. Charger la golden trace
2. Charger la trace du runId
3. Comparer les événements dans l'ordre
4. Identifier les différences
5. Calculer les métriques
6. Générer le rapport

## Tests

- Valider une trace identique à la golden trace (pass)
- Valider une trace avec différences (fail)
- Valider avec options (ignore certains types)
- Gérer les erreurs (golden trace inexistante, runId invalide)

## Dependencies

- Story 14.1: Golden Traces
- Epic 8: Replay & Debugging (replay fonctionnel)

