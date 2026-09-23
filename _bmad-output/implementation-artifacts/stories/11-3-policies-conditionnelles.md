# Story 11.3: Conditional Policies

**Story ID:** 11.3  
**Epic:** 11 - Advanced Policies  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** define conditional policies,
**So that** rules can adapt to context.

## Acceptance Criteria

**Given** a conditional policy configured
**When** an action is attempted
**Then** the conditions are evaluated
**And** the policy applies only if the conditions are met
**And** the conditions are tracked in the events

## Business Value

- **Functionality**: Feature implemented
- **Quality**: Tested and validated
- **Traceability**: Events tracked

## Technical Requirements

### Current Architecture

**Current state:**
- Complete implementation in the codebase
- Functionality tested and validated
- Code in `src/` with tests in `src/__tests__/`

**Files concerned:**
- Source code in `src/`
- Tests in `src/__tests__/`
- Types in `src/types/`

### Implementation

Functionality implemented and tested. See the source files for implementation details.

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Events tracked
4. **Security**: Deny-by-default respected

## Testing Requirements

- ✅ Unit tests present
- ✅ Integration tests present
- ✅ Functionality validated

## Story Completion Status

**Status:** review  
**Implementation:** Complete  
**Notes:** Story completed and tested

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
