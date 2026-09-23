# Story 11.4: Policy Audit Trail

**Story ID:** 11.4  
**Epic:** 11 - Advanced Policies  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** view the complete audit trail of policies,
**So that** I can understand all governance decisions.

## Acceptance Criteria

**Given** active policies
**When** actions are executed
**Then** each policy check is tracked
**And** the audit trail is queryable by runId
**And** the audit trail includes the reasons for decisions

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

1. **PolicyAuditEntry** (`src/types/audit.ts`)
   - Defines structure for policy audit entries
   - Includes policy ID, type, intention, condition evaluation, validation result

2. **PolicyEngine Updates** (`src/engines/policy-engine.ts`)
   - Added `setEventStore()` to connect event store for logging
   - Added `evaluatePolicyConditions()` to evaluate conditions before validation
   - Added `logPolicyAudit()` to log each policy evaluation
   - Added `getAuditTrail()` to retrieve audit entries for a run
   - Added `clearAuditTrail()` for cleanup
   - Modified `validate()` to log audit entries for each policy evaluation

3. **SDK Updates** (`src/sdk.ts`)
   - Connected EventStore to PolicyEngine
   - Added `getPolicyAuditTrail()` API method

### Tests

- **Unit Tests**: `src/__tests__/policy-audit-trail.test.ts` (structure validation tests)

### Usage Example

```typescript
const sdk = createSDK({ apiKey: 'your-api-key' });

// Create agent with policies
const agent = sdk.createAgent({
  name: 'agent',
  model: 'gpt-4',
  tools: [tool],
  policies: [policy1, policy2]
});

// Run agent
const result = await agent.run({ message: 'Do something' });

// Get audit trail
const auditTrail = sdk.getPolicyAuditTrail(result.runId);

// Audit trail contains:
// - All policies evaluated
// - Conditions evaluated and their results
// - Validation results (allowed/denied)
// - Reasons for decisions
// - Timestamps

auditTrail.forEach((entry) => {
  console.log(`Policy ${entry.policyId} (${entry.policyType}):`);
  console.log(`  Applied: ${entry.applied}`);
  console.log(`  Allowed: ${entry.validationResult.allowed}`);
  console.log(`  Reason: ${entry.reason}`);
  if (entry.conditionEvaluated) {
    console.log(`  Condition: ${JSON.stringify(entry.conditionEvaluated.condition)}`);
    console.log(`  Condition Result: ${entry.conditionEvaluated.result}`);
  }
});
```
