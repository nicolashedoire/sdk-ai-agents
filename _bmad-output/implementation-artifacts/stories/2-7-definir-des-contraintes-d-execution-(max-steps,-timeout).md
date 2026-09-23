# Story 2.7: Defining execution constraints (max steps, timeout)

**Story ID:** 2.7  
**Epic:** 2 - Agent Lifecycle & Execution Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to define execution constraints (max steps, timeout),
**So that** I can limit the duration and complexity of an execution.

## Acceptance Criteria

**Given** an agent is created
**When** I define constraints (maxSteps: 10, timeout: 30000)
**Then** the execution stops automatically if the limits are reached
**And** the state changes to "failed" with a clear reason
**And** the constraints are applied before each step
**And** the overage events are tracked

## Business Value

- **Control**: Explicit limits
- **Security**: Automatic stop
- **Traceability**: Overage events

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
