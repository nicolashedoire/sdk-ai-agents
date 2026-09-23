# Story 4.3: Defining a maximum budget (tokens or steps) for an agent

**Story ID:** 4.3  
**Epic:** 4 - Policies & Governance  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to define a maximum budget (tokens or steps) for an agent,
**So that** I can control costs and execution duration..

## Acceptance Criteria

**Given** an agent is configured
**When** I define a maximum budget (maxTokens: 1000 or maxSteps: 10)
**Then** the execution stops automatically if the budget is reached
**And** the state changes to "failed" with a clear reason
**And** the budget is checked before each step
**And** budget-overage events are tracked

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
