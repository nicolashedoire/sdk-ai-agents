# Story 11.3: Policies Conditionnelles

**Story ID:** 11.3  
**Epic:** 11 - Policies Avancées  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** définir des policies conditionnelles,
**So that** les règles peuvent s'adapter au contexte.

## Acceptance Criteria

**Given** une policy conditionnelle configurée
**When** une action est tentée
**Then** les conditions sont évaluées
**And** la policy s'applique seulement si les conditions sont remplies
**And** les conditions sont tracées dans les événements

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

1. **ConditionEvaluator** (`src/evaluators/condition-evaluator.ts`)
   - Evaluates condition expressions against policy context
   - Supports operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `matches`, `exists`
   - Supports complex expressions: `and`, `or`, `not`
   - Supports time-based conditions: `time.hour`, `time.day`, `time.date`, `time.month`, `time.year`
   - Backward compatible with string conditions

2. **PolicyEngine Updates** (`src/engines/policy-engine.ts`)
   - Integrated `ConditionEvaluator` to evaluate conditions before applying rules
   - Modified `validatePolicy()` to filter rules based on conditions
   - Updated `ruleMatches()` to use condition evaluator

3. **Types** (`src/types/policy.ts`)
   - Extended `PolicyRule.condition` to support `ConditionExpression` objects
   - Added `ConditionExpression` interface with support for nested expressions

### Tests

- **Unit Tests**: `src/__tests__/condition-evaluator.test.ts` (multiple test cases)

### Usage Example

```typescript
const sdk = createSDK({ apiKey: 'your-api-key' });

// Define a conditional policy
const conditionalPolicy: Policy = {
  id: 'conditional-policy',
  type: 'allowlist',
  scope: 'agent',
  enabled: true,
  rules: [{
    condition: {
      type: 'and',
      expressions: [
        {
          type: 'condition',
          conditions: [{
            field: 'time.hour',
            operator: 'gte',
            value: 9
          }]
        },
        {
          type: 'condition',
          conditions: [{
            field: 'time.hour',
            operator: 'lt',
            value: 18
          }]
        }
      ]
    },
    action: 'allow',
    metadata: {
      tools: ['business-hours-tool']
    }
  }]
};

// Or use simple string conditions
const simpleConditionalPolicy: Policy = {
  id: 'simple-conditional',
  type: 'custom',
  scope: 'agent',
  enabled: true,
  rules: [{
    condition: "context.currentStep < 10",
    action: 'allow'
  }]
};
```
