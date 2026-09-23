# Story 8.7: Use replay to debug an incident

**Story ID:** 8.7  
**Epic:** 8 - Replay & Debugging  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** use replay to debug an incident,
**So that** I can quickly understand what caused a problem.

## Acceptance Criteria

**Given** an incident occurred (runId with "failed" state)
**When** I replay the execution
**Then** I can see exactly where and why the failure occurred
**And** I can inspect the state at each step
**And** I can identify the root cause quickly
**And** the replay lets me test fixes

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
