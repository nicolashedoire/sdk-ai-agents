# Story 6.8: Query events by runId

**Story ID:** 6.8  
**Epic:** 6 - Event Sourcing & Persistence  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** query events by runId,
**So that** I can retrieve the complete history of a specific execution.

## Acceptance Criteria

**Given** a runId exists
**When** I call `sdk.getEvents(runId)`
**Then** I receive all events for this runId
**And** the events are in chronological order
**And** a clear error is returned if the runId does not exist
**And** the query is performant even with a large number of events

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
