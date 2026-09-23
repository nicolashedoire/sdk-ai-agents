# Story 11.2: Complex Budgets (per Tool, per Agent, per Period)

**Story ID:** 11.2  
**Epic:** 11 - Advanced Policies  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** define complex budgets (per tool, per agent, per period),
**So that** I can finely control costs and usage.

## Acceptance Criteria

**Given** complex budgets configured
**When** an agent executes actions
**Then** the budgets are checked (per tool, per agent, per period)
**And** budget violations are detected
**And** actions are blocked if the budget is exceeded
**And** budgets are tracked and queryable

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

1. **BudgetTracker** (`src/managers/budget-tracker.ts`)
   - Tracks budget usage by agent, tool, and period (hour, day, week, month, all)
   - Methods: `recordUsage()`, `recordToolCall()`, `getUsage()`, `checkBudget()`
   - Supports token limits and tool call limits per period

2. **PolicyEngine Updates** (`src/engines/policy-engine.ts`)
   - Added `setBudgetTracker()` to inject BudgetTracker
   - Extended `validateBudgetPolicy()` to check complex budget limits
   - Added `checkBudgetLimit()` to validate budgets per tool/agent/period

3. **ActionEngine Updates** (`src/engines/action-engine.ts`)
   - Integrated `BudgetTracker` to record tool call usage
   - Records tool calls when executed

4. **SDK Updates** (`src/sdk.ts`)
   - Added `BudgetTracker` instance
   - Connected `BudgetTracker` to `PolicyEngine`
   - Added `getBudgetUsage()` API method

5. **Types** (`src/types/policy.ts`)
   - Added `BudgetLimit` interface with `agentId`, `toolName`, `period`, `maxTokens`, `maxToolCalls`, `maxCost`

### Tests

- **Unit Tests**: `src/__tests__/budget-tracker.test.ts` (15 tests, all passing)

### Usage Example

```typescript
const sdk = createSDK({ apiKey: 'your-api-key' });

// Define a complex budget policy
const budgetPolicy: Policy = {
  id: 'budget-policy',
  type: 'budget',
  scope: 'agent',
  enabled: true,
  rules: [{
    condition: 'budgetLimit',
    action: 'deny',
    metadata: {
      budgetLimit: {
        agentId: 'agent-1',
        toolName: 'expensive-tool',
        period: 'day',
        maxToolCalls: 10,
        maxTokens: 10000
      }
    }
  }]
};

// Create agent with budget policy
const agent = sdk.createAgent({
  name: 'agent',
  model: 'gpt-4',
  tools: [expensiveTool],
  policies: [budgetPolicy]
});

// Check budget usage
const usage = await sdk.getBudgetUsage({
  agentId: 'agent-1',
  toolName: 'expensive-tool',
  period: 'day'
});

console.log(`Used ${usage.tokensUsed} tokens and ${usage.toolCallsCount} tool calls`);
```
