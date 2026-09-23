# Story 3.8: Preventing the execution of an undeclared tool (deny by default)

**Story ID:** 3.8  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** the system to prevent the execution of an undeclared tool,
**So that** security is guaranteed by design, not by configuration.

## Acceptance Criteria

**Given** an agent is configured with specific tools
**When** the agent attempts to call an undeclared tool
**Then** the call is blocked immediately
**And** a clear error is generated
**And** the blocking event is tracked
**And** no side effect is produced

## Business Value

- **Security**: Automatic blocking
- **Design**: Structural security
- **Traceability**: Blocks tracked

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
