# Story 14.5: Intégration Tests dans Pipeline CI/CD

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR68

## Description

Permettre d'intégrer les tests basés sur traces dans un pipeline CI/CD pour valider automatiquement le comportement des agents à chaque changement.

## Contexte

L'intégration CI/CD permet d'automatiser la validation du comportement des agents, garantissant que les modifications ne cassent pas le comportement attendu.

## Acceptance Criteria

### AC1: Exporter Résultats pour CI/CD
**Given** des tests de régression sont exécutés  
**When** un développeur appelle `sdk.exportTestResults(format, options)`  
**Then** les résultats sont exportés dans un format compatible CI/CD (JUnit XML, JSON, etc.)

### AC2: Code de Sortie Approprié
**Given** des tests sont exécutés  
**When** le processus se termine  
**Then** le code de sortie reflète le résultat :
- 0 si tous les tests passent
- 1 si des régressions sont détectées
- 2 si des erreurs sont survenues

### AC3: Format JUnit XML
**Given** des tests sont exécutés  
**When** le format JUnit est demandé  
**Then** un fichier XML compatible JUnit est généré avec :
- Informations sur chaque test
- Durée d'exécution
- Messages d'erreur pour les échecs
- Métriques globales

## Technical Details

### Types à créer

```typescript
interface TestResultsExportOptions {
  format: 'junit' | 'json' | 'json-summary';
  includeDetails?: boolean;
  outputPath?: string;
}

interface JUnitTestSuite {
  name: string;
  tests: number;
  failures: number;
  errors: number;
  skipped: number;
  time: number;
  testCases: Array<{
    name: string;
    classname: string;
    time: number;
    status: 'pass' | 'fail' | 'error' | 'skipped';
    failure?: {
      message: string;
      type: string;
      details: string;
    };
  }>;
}
```

### Méthodes SDK

- `exportTestResults(results: RegressionTestSuiteResult, format: 'junit' | 'json' | 'json-summary', options?: TestResultsExportOptions): Promise<string>`
- `runRegressionTestsForCI(agentId: string, options?: RegressionTestOptions & { exitCode?: boolean }): Promise<{ results: RegressionTestSuiteResult; exitCode: number }>`

### Format JUnit XML

```xml
<testsuites>
  <testsuite name="Agent Regression Tests" tests="10" failures="2" errors="0" time="5.234">
    <testcase name="test-1" classname="golden-trace-1" time="0.523"/>
    <testcase name="test-2" classname="golden-trace-2" time="0.456">
      <failure message="Regression detected" type="behavioral">
        Critical regression: Result differs from expected
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

## Tests

- Exporter en format JUnit XML
- Exporter en format JSON
- Générer code de sortie correct
- Intégrer dans un script CI/CD exemple

## Dependencies

- Story 14.4: Tests de Non-Régression

