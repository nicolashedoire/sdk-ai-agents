# Story 7.7: View the constraints that weighed on a decision

**Story ID:** 7.7  
**Epic:** 7 - Tracing & Observability  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** view the constraints that weighed on a decision,
**So that** I can understand the limitations that influenced the behavior.

## Acceptance Criteria

**Given** an execution has been performed
**When** I consult a decision in the traces
**Then** I see all active constraints (policies, budgets, timeouts)
**And** the constraints are clearly associated with the decision
**And** the impact of each constraint is explicit
**And** the constraints are tracked with their values

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
