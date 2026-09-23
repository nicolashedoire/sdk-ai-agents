# Story 3.4: Restricting authorized tools via an allowlist

**Story ID:** 3.4  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to restrict authorized tools via an allowlist,
**So that** I can explicitly limit an agent's capabilities.

## Acceptance Criteria

**Given** several tools are defined
**When** I configure an agent with a tool allowlist
**Then** only the tools in the allowlist are accessible
**And** any tool not in the allowlist is blocked even if it is declared
**And** attempts to use unauthorized tools are tracked

## Business Value

- **Control**: Explicit allowlist
- **Security**: Automatic blocking
- **Traceability**: Attempts tracked

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
