# Story 1.5: Documentation of key concepts

**Story ID:** 1.5  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,  
**I want** to understand the key concepts through the documentation,  
**So that** I can use the SDK effectively and understand the paradigm.

## Acceptance Criteria

**Given** I am new to the SDK  
**When** I read the documentation  
**Then** the key concepts are explained clearly (agent ≠ LLM, event-sourcing, replay)  
**And** each concept explains the problem it solves  
**And** the documentation is oriented toward a "mental model", not a "magic how-to"  
**And** examples illustrate each concept

## Business Value

- **Understanding**: Clear paradigm from the start
- **Adoption**: Better understanding = better adoption
- **Efficiency**: Correct use of the SDK
- **Mental Model**: Deep understanding rather than surface-level

## Technical Requirements

### Current Architecture

**Current State:**
- Concepts documentation in `docs/CONCEPTS.md`
- Explanation of the agent ≠ LLM paradigm
- Event-sourcing explained
- Replay explained

**Files Involved:**
- `docs/CONCEPTS.md` - Complete concepts documentation
- `README.md` - Overview

### Key Concepts Documented

1. **Agent ≠ LLM**: Conceptual separation
2. **Event-Sourcing**: Single source of truth
3. **Replay**: Replayability without the LLM
4. **Reasoning/Action Separation**: Security by design
5. **Policies**: Native governance
6. **Tools**: Control and security

## Architecture Compliance

### Principles Followed

1. **Mental Model**: Focus on understanding
2. **Problems Solved**: Each concept explains why
3. **Examples**: Concrete illustrations
4. **Clarity**: Accessible language

## Testing Requirements

- ✅ Concepts explained clearly
- ✅ Problems solved identified
- ✅ Examples provided
- ✅ Mental model established

## Story Completion Status

**Status:** done  
**Implementation:** Complete in `docs/CONCEPTS.md`


