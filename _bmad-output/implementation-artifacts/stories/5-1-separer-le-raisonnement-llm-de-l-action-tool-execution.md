# Story 5.1: Separating reasoning (LLM) from action (tool execution)

**Story ID:** 5.1  
**Epic:** 5 - Runtime Architecture - Reasoning/Action Separation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** system,
**I want** to separate reasoning (LLM) from action (tool execution),
**So that** security is guaranteed by architecture, not by configuration..

## Acceptance Criteria

**Given** an agent is configured
**When** the agent executes a task
**Then** the LLM generates only structured intentions
**And** the intentions are processed by a separate Action Engine
**And** the LLM never has direct access to the tools
**And** all actions go through the Action Engine

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
