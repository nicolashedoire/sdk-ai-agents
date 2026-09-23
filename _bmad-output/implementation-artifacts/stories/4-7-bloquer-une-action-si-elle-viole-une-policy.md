# Story 4.7: Blocking an action if it violates a policy

**Story ID:** 4.7  
**Epic:** 4 - Policies & Governance  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** system,
**I want** to block an action if it violates a policy,
**So that** security and governance are guaranteed..

## Acceptance Criteria

**Given** a policy is defined and active
**When** an agent attempts an action that violates the policy
**Then** the action is immediately blocked
**And** a clear error indicating the violated policy is generated
**And** the blocking event is tracked with the reason
**And** no partial side effect is produced

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
