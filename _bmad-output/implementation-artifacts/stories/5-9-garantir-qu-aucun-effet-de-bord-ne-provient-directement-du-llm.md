# Story 5.9: Guaranteeing that no side effect originates directly from the LLM

**Story ID:** 5.9  
**Epic:** 5 - Runtime Architecture - Reasoning/Action Separation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** system,
**I want** to guarantee that no side effect originates directly from the LLM,
So that security is structural and not optional.

**Acceptance Criteria:**

**Given** an agent is configured
**When** the LLM generates a response
**Then** no action is executed directly by the LLM
**And** all actions go through the Action Engine
**And** this separation is guaranteed by the architecture, not by configuration
**And** any attempt to bypass it is blocked

### Story 5.10: Inspecting the reasoning → validation → action sequence

As a developer,
I want to inspect the reasoning → validation → action sequence,
**So that** I can understand the agent's complete decision flow..

## Acceptance Criteria

**Given** an execution has taken place
**When** I consult the traces of an action
**Then** I see the complete sequence: LLM intention → validation → execution
**And** each step is tracked with its details
**And** the timestamps show the chronological order
**And** the links between the events are clear

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
