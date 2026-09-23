# Story 3.2: Explicitly declaring the tools available to an agent

**Story ID:** 3.2  
**Epic:** 3 - Tool & Capability Management  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** to explicitly declare the tools available to an agent,
**So that** I precisely control what the agent can use.

## Acceptance Criteria

**Given** tools are defined
**When** I configure an agent with `agent.addTools([tool1, tool2])`
**Then** only these tools are available to the agent
**And** any undeclared tool is inaccessible (deny by default)
**And** the configuration is validated before execution

## Business Value

- **Control**: Explicit tools
- **Security**: Deny-by-default
- **Validation**: Configuration checked

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
