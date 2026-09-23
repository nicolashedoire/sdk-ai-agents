# Story 4.6: Automatically applying policies before each action

**Story ID:** 4.6  
**Epic:** 4 - Policies & Governance  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** system,
**I want** to automatically apply policies before each action,
**So that** governance is guaranteed structurally, not optionally..

## Acceptance Criteria

**Given** policies are defined (global or specific)
**When** an agent attempts to execute an action
**Then** all relevant policies are checked before the action
**And** the action is blocked if a policy is violated
**And** the checks are tracked in the events
**And** no action is executed without a policy check

## Business Value

- **Functionality**: Feature implemented
- **Quality**: Tested and validated
- **Traceability**: Events tracked

## Technical Requirements

### Current Architecture

**Current State:**
- Complete implementation in the codebase
- Feature tested and validated
- Code in `src/` with tests in `src/__tests__/`

**Files Involved:**
- Source code in `src/`
- Tests in `src/__tests__/`
- Types in `src/types/`

### Implementation

Feature implemented and tested. See the source files for implementation details.

## Architecture Compliance

### Principles Followed

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: Strict TypeScript
3. **Event-sourcing**: Events tracked
4. **Security**: Deny-by-default respected

## Testing Requirements

- ✅ Unit tests present
- ✅ Integration tests present
- ✅ Feature validated

## Story Completion Status

**Status:** done  
**Implementation:** Complete  
**Notes:** Story completed and tested
