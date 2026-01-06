# Story 14.3: Détection de Régressions par Comparaison de Traces

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR66

## Description

Permettre à un développeur de détecter automatiquement des régressions en comparant une nouvelle trace avec une golden trace ou une trace de référence.

## Contexte

La détection de régressions permet d'identifier automatiquement quand le comportement d'un agent change de manière inattendue, ce qui est crucial pour maintenir la qualité et la stabilité.

## Acceptance Criteria

### AC1: Détecter Régressions Automatiquement
**Given** une golden trace existe et une nouvelle trace est générée  
**When** un développeur appelle `sdk.detectRegressions(newRunId, goldenTraceId, options)`  
**Then** un rapport de régression est retourné avec les différences identifiées et leur sévérité

### AC2: Classification des Régressions
**Given** des régressions sont détectées  
**When** le rapport est généré  
**Then** les régressions sont classifiées par :
- Sévérité (critical, high, medium, low)
- Type (comportemental, performance, structurel)
- Impact (affecte le résultat final, affecte seulement le processus)

### AC3: Seuils de Tolérance
**Given** une détection de régression est effectuée  
**When** des seuils sont configurés  
**Then** seules les régressions dépassant les seuils sont signalées :
- Différence de durée maximale acceptable
- Nombre d'événements différents acceptable
- Types d'événements critiques à surveiller

## Technical Details

### Types à créer

```typescript
interface RegressionDetectionOptions {
  tolerance?: {
    maxDurationDiff?: number;
    maxEventCountDiff?: number;
    criticalEventTypes?: EventType[];
    ignoreEventTypes?: EventType[];
  };
  severityThresholds?: {
    critical?: number;
    high?: number;
    medium?: number;
  };
}

interface Regression {
  id: string;
  type: 'behavioral' | 'performance' | 'structural';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  expected: unknown;
  actual: unknown;
  impact: 'result' | 'process';
  location?: {
    eventId?: string;
    eventType?: EventType;
    timestamp?: number;
  };
}

interface RegressionReport {
  runId: string;
  goldenTraceId: string;
  detectedAt: number;
  status: 'no_regression' | 'regressions_detected' | 'error';
  regressions: Regression[];
  summary: {
    totalRegressions: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  metrics: {
    durationDiff: number;
    eventCountDiff: number;
    similarityScore: number; // 0-1, 1 = identique
  };
}
```

### Méthodes SDK

- `detectRegressions(newRunId: string, goldenTraceId: string, options?: RegressionDetectionOptions): Promise<RegressionReport>`
- `getRegressionReport(reportId: string): Promise<RegressionReport>`

## Tests

- Détecter aucune régression (traces identiques)
- Détecter régression critique (résultat différent)
- Détecter régression de performance (durée différente)
- Respecter les seuils de tolérance
- Classifier correctement les régressions

## Dependencies

- Story 14.1: Golden Traces
- Story 15.1: Comparaison de Deux Exécutions

