# Story 15.1: Comparaison de Deux Exécutions

**Epic:** Epic 15 - Advanced Observability & Comparison  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR49

## Description

Permettre à un développeur de comparer deux exécutions pour identifier les différences et comprendre les variations de comportement.

## Contexte

La comparaison d'exécutions permet d'analyser les différences entre deux runs, que ce soit pour comprendre des variations, détecter des régressions ou analyser l'impact de changements.

## Acceptance Criteria

### AC1: Comparer Deux Runs
**Given** deux runIds valides  
**When** un développeur appelle `sdk.compareRuns(runId1, runId2, options)`  
**Then** une comparaison détaillée est retournée avec les différences identifiées

### AC2: Rapport de Comparaison
**Given** une comparaison est effectuée  
**When** le rapport est généré  
**Then** il contient :
- Les métriques comparatives (durée, événements, intentions, actions, tools)
- Les différences d'événements (ajoutés, supprimés, modifiés)
- Les différences de séquence (ordre des événements)
- Les différences de données (valeurs dans les événements)
- Un résumé des différences principales

### AC3: Options de Comparaison
**Given** une comparaison est effectuée  
**When** des options sont fournies  
**Then** la comparaison peut :
- Ignorer certains types d'événements
- Comparer uniquement la structure
- Focus sur certains aspects (intentions, actions, tools)
- Inclure/exclure les métadonnées

## Technical Details

### Types à créer

```typescript
interface ComparisonOptions {
  ignoreEventTypes?: EventType[];
  compareStructureOnly?: boolean;
  focusAspects?: ('intentions' | 'actions' | 'tools' | 'policies')[];
  includeMetadata?: boolean;
  groupSimilarEvents?: boolean;
}

interface RunComparison {
  runId1: string;
  runId2: string;
  metrics: {
    totalEvents: { run1: number; run2: number; diff: number };
    duration: { run1: number; run2: number; diff: number };
    intentionsGenerated: { run1: number; run2: number; diff: number };
    actionsExecuted: { run1: number; run2: number; diff: number };
    toolsCalled: { run1: number; run2: number; diff: number };
  };
  differences: ComparisonDifference[];
  summary: {
    totalDifferences: number;
    criticalDifferences: number;
    mainDifferences: string[];
  };
}

interface ComparisonDifference {
  type: 'event_added' | 'event_removed' | 'event_modified' | 'sequence_changed' | 'data_changed';
  eventId?: string;
  eventType?: EventType;
  run1?: Event;
  run2?: Event;
  details: string;
  severity?: 'low' | 'medium' | 'high';
}
```

### Méthodes SDK

- `compareRuns(runId1: string, runId2: string, options?: ComparisonOptions): Promise<RunComparison>`
- `getComparisonReport(comparison: RunComparison, format?: 'json' | 'html' | 'text'): Promise<string>`

### Algorithme de Comparaison

1. Charger les deux traces
2. Comparer les métriques globales
3. Comparer les événements dans l'ordre
4. Identifier les différences (ajout, suppression, modification)
5. Analyser les différences de séquence
6. Comparer les données des événements similaires
7. Calculer la sévérité des différences
8. Générer le résumé

## Tests

- Comparer deux runs identiques (aucune différence)
- Comparer deux runs avec différences
- Comparer avec options (ignore certains types)
- Gérer les erreurs (runId invalide)

## Dependencies

- Epic 7: Tracing & Observability (récupération des traces)
- Epic 6: Event Sourcing (accès aux événements)

