# Story 5.5: Rejecting an intention if it violates a policy

**Story ID:** 5.5  
**Epic:** 5 - Runtime Architecture - Reasoning/Action Separation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** system,
**I want** to reject an intention if it violates a policy,
**So that** governance is applied automatically..

## Acceptance Criteria

**Given** an intention is generated and policies are active
**When** the intention violates a policy
**Then** the intention is rejected immediately
**And** a clear error indicating the violated policy is generated
**And** the rejection event is tracked
**And** no partial action is executed

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
