# Story 14.6: Assertions sur le Comportement d'un Agent

**Epic:** Epic 14 - Testing & Quality Assurance  
**Status:** completed  
**Priority:** Medium  
**FRs:** FR69

## Description

Permettre à un développeur de définir des assertions sur le comportement d'un agent pour valider des aspects spécifiques de son fonctionnement.

## Contexte

Les assertions permettent de valider des aspects spécifiques du comportement d'un agent au-delà de la simple comparaison avec une golden trace, comme la présence de certains événements, l'ordre des actions, ou des contraintes sur les valeurs.

## Acceptance Criteria

### AC1: Définir des Assertions
**Given** un développeur veut valider le comportement  
**When** il appelle `sdk.defineAssertion(name, condition, options)`  
**Then** une assertion est créée et peut être utilisée dans les tests

### AC2: Types d'Assertions Supportés
**Given** des assertions sont définies  
**When** elles sont évaluées  
**Then** les types suivants sont supportés :
- Présence d'événements (certain type doit apparaître)
- Ordre des événements (événement A doit précéder B)
- Valeurs dans les événements (valeur doit être dans une plage)
- Nombre d'occurrences (événement doit apparaître N fois)
- Absence d'événements (certain type ne doit pas apparaître)

### AC3: Évaluer des Assertions
**Given** des assertions existent et une trace est disponible  
**When** un développeur appelle `sdk.evaluateAssertions(runId, assertionIds)`  
**Then** chaque assertion est évaluée et un rapport est retourné

## Technical Details

### Types à créer

```typescript
type AssertionType = 
  | 'event_present'
  | 'event_absent'
  | 'event_order'
  | 'event_count'
  | 'event_value'
  | 'custom';

interface AssertionCondition {
  type: AssertionType;
  eventType?: EventType;
  eventTypes?: EventType[];
  count?: number;
  minCount?: number;
  maxCount?: number;
  beforeEventType?: EventType;
  afterEventType?: EventType;
  valuePath?: string;
  valueMatcher?: {
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'regex';
    value: unknown;
  };
  customEvaluator?: (events: Event[]) => boolean;
}

interface Assertion {
  id: string;
  name: string;
  description?: string;
  condition: AssertionCondition;
  severity?: 'error' | 'warning';
  tags?: string[];
  createdAt: number;
}

interface AssertionResult {
  assertionId: string;
  assertionName: string;
  status: 'pass' | 'fail' | 'error';
  message?: string;
  details?: Record<string, unknown>;
  evaluatedAt: number;
}

interface AssertionEvaluationReport {
  runId: string;
  evaluatedAt: number;
  totalAssertions: number;
  passedAssertions: number;
  failedAssertions: number;
  errorAssertions: number;
  results: AssertionResult[];
}
```

### Méthodes SDK

- `defineAssertion(name: string, condition: AssertionCondition, options?: { description?: string; severity?: 'error' | 'warning'; tags?: string[] }): Promise<Assertion>`
- `getAssertions(agentId?: string, tags?: string[]): Promise<Assertion[]>`
- `evaluateAssertions(runId: string, assertionIds?: string[]): Promise<AssertionEvaluationReport>`
- `deleteAssertion(assertionId: string): Promise<void>`

## Tests

- Créer une assertion de présence d'événement
- Créer une assertion d'ordre d'événements
- Créer une assertion de valeur
- Évaluer des assertions sur une trace valide
- Évaluer des assertions sur une trace invalide
- Gérer les erreurs d'évaluation

## Dependencies

- Epic 7: Tracing & Observability (accès aux événements)

