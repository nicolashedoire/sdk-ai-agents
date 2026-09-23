# Story 4.8: Consulting the policies applied to an execution

**Story ID:** 4.8  
**Epic:** 4 - Policies & Governance  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to consult the policies applied to an execution,
**So that** I can understand why certain actions were authorized or blocked.

## Acceptance Criteria

**Given** an execution has taken place
**When** I query the applied policies with `sdk.getRunPolicies(runId)`
**Then** I receive the full list of policies active during the execution
**And** each policy includes its source (global or specific)
**And** the policy checks are associated with the corresponding actions

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
