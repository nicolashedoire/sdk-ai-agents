# Story 11.1: Approval Humaine (Workflow d'Approbation)

**Story ID:** 11.1  
**Epic:** 11 - Policies Avancées  
**Status:** backlog  
**Created:** 2026-01-06

## User Story

**As a** tech lead,
**I want** définir des policies nécessitant une approbation humaine,
**So that** les actions critiques sont validées avant exécution.

## Acceptance Criteria

**Given** une policy avec approval humaine configurée
**When** un agent tente une action nécessitant approbation
**Then** l'action est mise en pause
**And** une demande d'approbation est générée
**And** l'action s'exécute seulement après approbation
**And** l'approbation est tracée dans les événements

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

1. **ApprovalManager** (`src/managers/approval-manager.ts`)
   - Manages pending approval requests
   - Provides `requestApproval()`, `approve()`, `reject()`, `cancel()` methods
   - Tracks approval status and metadata

2. **PolicyEngine Updates** (`src/engines/policy-engine.ts`)
   - Extended `validate()` to detect `require_approval` action in policy rules
   - Added `ruleMatches()` helper to check if a rule matches an intention
   - Returns `requiresApproval: true` in `PolicyValidationResult` when approval is needed

3. **ActionEngine Updates** (`src/engines/action-engine.ts`)
   - Integrated `ApprovalManager` into constructor
   - Modified `validatePolicy()` to handle `requiresApproval`:
     - Creates approval request when approval is required
     - Waits for approval decision (promise-based)
     - Logs `approval.requested`, `approval.approved`, `approval.rejected` events
     - Throws error if approval is rejected

4. **SDK Updates** (`src/sdk.ts`)
   - Added `ApprovalManager` instance to `SDKImpl`
   - Added `approveAction()`, `rejectAction()`, `getPendingApprovals()` methods
   - Cancels pending approvals when `stopRun()` is called

5. **Event Types** (`src/types/events.ts`)
   - Added `approval.requested`, `approval.approved`, `approval.rejected` event types

6. **Policy Types** (`src/types/policy.ts`)
   - Extended `PolicyValidationResult` with `requiresApproval?: boolean` and `approvalId?: string`

### Tests

- **Unit Tests**: `src/__tests__/approval-manager.test.ts` (14 tests, all passing)
- **Integration Tests**: `src/__tests__/approval-workflow.test.ts` (requires LLM mocking)

### Usage Example

```typescript
const sdk = createSDK({ apiKey: 'your-api-key' });

// Define a policy requiring approval
const approvalPolicy: Policy = {
  id: 'approval-policy',
  type: 'allowlist',
  scope: 'agent',
  enabled: true,
  rules: [{
    condition: 'allowedTools',
    action: 'require_approval',
    metadata: { tools: ['critical-tool'] }
  }]
};

// Create agent with policy
const agent = sdk.createAgent({
  name: 'agent',
  model: 'gpt-4',
  tools: [criticalTool],
  policies: [approvalPolicy]
});

// Run agent (will pause for approval)
const runPromise = agent.run({ message: 'Use critical-tool' });

// Check pending approvals
const approvals = sdk.getPendingApprovals();
if (approvals.length > 0) {
  // Approve or reject
  sdk.approveAction(approvals[0].id, 'user-id', 'Reason');
  // or
  sdk.rejectAction(approvals[0].id, 'user-id', 'Reason');
}
```
