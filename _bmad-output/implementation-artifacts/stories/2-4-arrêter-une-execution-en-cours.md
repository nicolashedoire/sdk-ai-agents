# Story 2.4: Stopping an execution in progress

**Story ID:** 2.4  
**Epic:** 2 - Agent Lifecycle & Execution Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to stop an execution in progress,
**So that** I can interrupt an agent that is taking too long or going off track.

## Acceptance Criteria

**Given** an execution is in progress (state "running")
**When** I call `agent.stop()` or `sdk.stopRun(runId)`
**Then** the execution stops cleanly
**And** the state changes to "cancelled"
**And** all events up to the stop are persisted
**And** no tool call is executed after the stop

## Business Value

- **Control**: Clean and immediate stop
- **Security**: No side effects after stopping
- **Traceability**: Events persisted

## Technical Requirements

### Current Architecture

**Current State:**
- Complete implementation in the MVP codebase
- Feature tested and validated
- Code in `src/` with tests in `src/__tests__/`

**Files Involved:**
- Source code in `src/`
- Tests in `src/__tests__/`
- Types in `src/types/`

### Implementation

Feature implemented and tested in the MVP. See the source files for implementation details.

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
**Implementation:** Complete in the MVP  
**Notes:** MVP story completed and tested
