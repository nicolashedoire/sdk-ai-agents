# Story 5.2: The LLM generates structured intentions, never direct actions

**Story ID:** 5.2  
**Epic:** 5 - Runtime Architecture - Reasoning/Action Separation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** system,
**I want** the LLM to generate structured intentions, never direct actions,
**So that** no side effect can originate directly from the LLM..

## Acceptance Criteria

**Given** an agent executes a task
**When** the LLM is called
**Then** the LLM returns only structured intentions (JSON)
**And** the intentions contain the desired action and its parameters
**And** no action is executed directly by the LLM
**And** all intentions are tracked before being processed

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
