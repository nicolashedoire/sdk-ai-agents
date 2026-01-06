# Story 14.4: Tests de Non-Régression sur Agents

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** High  
**FRs:** FR67

## Description

Permettre à un développeur d'exécuter une suite de tests de non-régression sur un agent en utilisant des golden traces et de détecter automatiquement les régressions.

## Contexte

Les tests de non-régression permettent de s'assurer qu'un agent continue de se comporter comme attendu après des modifications, en comparant systématiquement avec des golden traces.

## Acceptance Criteria

### AC1: Exécuter Suite de Tests
**Given** des golden traces existent pour un agent  
**When** un développeur appelle `sdk.runRegressionTests(agentId, options)`  
**Then** tous les tests sont exécutés et un rapport global est retourné

### AC2: Rapport de Tests
**Given** une suite de tests est exécutée  
**When** le rapport est généré  
**Then** il contient :
- Nombre de tests passés/échoués
- Liste des régressions détectées
- Métriques globales (durée totale, taux de succès)
- Détails pour chaque test

### AC3: Options d'Exécution
**Given** une suite de tests est exécutée  
**When** des options sont fournies  
**Then** les tests peuvent :
- S'exécuter en parallèle ou séquentiellement
- S'arrêter au premier échec ou continuer
- Filtrer par tags ou catégories
- Inclure/exclure certains tests

## Technical Details

### Types à créer

```typescript
interface RegressionTestSuite {
  id: string;
  name: string;
  agentId: string;
  goldenTraces: Array<{
    goldenTraceId: string;
    name: string;
    input: unknown;
    expectedOutput?: unknown;
    tags?: string[];
  }>;
  createdAt: number;
  updatedAt: number;
}

interface RegressionTestOptions {
  parallel?: boolean;
  stopOnFirstFailure?: boolean;
  filterTags?: string[];
  excludeTags?: string[];
  timeout?: number;
}

interface RegressionTestResult {
  goldenTraceId: string;
  runId: string;
  status: 'pass' | 'fail' | 'error' | 'timeout';
  duration: number;
  regressionReport?: RegressionReport;
  error?: string;
}

interface RegressionTestSuiteResult {
  suiteId: string;
  agentId: string;
  executedAt: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  errorTests: number;
  timeoutTests: number;
  duration: number;
  results: RegressionTestResult[];
  summary: {
    passRate: number;
    averageDuration: number;
    criticalRegressions: number;
  };
}
```

### Méthodes SDK

- `createRegressionTestSuite(agentId: string, config: { name: string; goldenTraces: Array<{ goldenTraceId: string; name: string; input: unknown; tags?: string[] }> }): Promise<RegressionTestSuite>`
- `runRegressionTests(agentId: string, options?: RegressionTestOptions): Promise<RegressionTestSuiteResult>`
- `runRegressionTestSuite(suiteId: string, options?: RegressionTestOptions): Promise<RegressionTestSuiteResult>`
- `getRegressionTestSuites(agentId?: string): Promise<RegressionTestSuite[]>`

## Tests

- Créer une suite de tests
- Exécuter une suite de tests avec tous les tests qui passent
- Exécuter une suite avec des régressions détectées
- Gérer les timeouts et erreurs
- Filtrer par tags

## Dependencies

- Story 14.1: Golden Traces
- Story 14.3: Détection de Régressions

