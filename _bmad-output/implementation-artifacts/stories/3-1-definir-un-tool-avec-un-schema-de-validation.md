# Story 3.1: Defining a tool with a validation schema

**Story ID:** 3.1  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to define a tool with a validation schema,
**So that** I can create typed and secure tools for my agents.

## Acceptance Criteria

**Given** I want to create a new tool
**When** I call `defineTool({ name: '...', schema: {...}, handler: ... })`
**Then** a tool is created successfully
**And** the validation schema is applied to the inputs
**And** validation errors are clear and specific
**And** the tool is typed with TypeScript

## Business Value

- **Security**: Input validation
- **Type-safety**: Strict TypeScript
- **Clarity**: Explicit errors

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
