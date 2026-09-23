# Story 8.5: Test "what if" scenarios by replaying with different parameters

**Story ID:** 8.5  
**Epic:** 8 - Replay & Debugging  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** test "what if" scenarios by replaying with different parameters,
**So that** I can explore different possibilities without fully re-executing.

## Acceptance Criteria

**Given** a runId exists
**When** I replay with different parameters (inputs, policies, etc.)
**Then** the replay uses the new parameters
**And** I can compare the results with the original
**And** the differences are clearly visible
**And** the replay is fast because it reuses the events

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

**Status:** done  
**Implementation:** Complete  
**Notes:** Story completed and tested
