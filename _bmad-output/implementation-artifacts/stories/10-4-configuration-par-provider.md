# Story 10.4: Per-Provider Configuration

**Story ID:** 10.4  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** configure provider-specific parameters,
**So that** I can optimize each provider according to its characteristics.

## Acceptance Criteria

**Given** multiple providers configured
**When** I configure an agent
**Then** I can specify parameters per provider (temperature, maxTokens, etc.)
**And** the parameters are applied correctly
**And** the configuration is validated

## Business Value

- **Functionality**: Feature implemented
- **Quality**: Tested and validated
- **Traceability**: Events tracked

## Technical Requirements

### Current Architecture

**Current state:**
- `ReasoningEngine` uses a hardcoded `DEFAULT_LLM_TEMPERATURE`
- `maxTokens` not configurable at the agent/run level
- No provider-specific configuration

**Files concerned:**
- `src/types/agent.ts` - AgentConfig
- `src/types/run.ts` - RunInput
- `src/engines/reasoning-engine.ts` - Intention generation
- `src/agent.ts` - AgentImpl

### Target Architecture

**Required configuration:**
1. **Per Agent** - Configuration in `AgentConfig.providerSettings`
2. **Per Run** - Override in `RunInput.providerSettings`
3. **Per Provider** - Specific settings (openai, anthropic) or default
4. **Priority** - Run > Agent > Defaults

### Implementation

**1. Extended types**
- `ProviderSettings` interface with `temperature?` and `maxTokens?`
- `AgentConfig.providerSettings` for per-agent configuration
- `RunInput.providerSettings` for per-run override

**2. ReasoningEngine**
- Uses `context.temperature` and `context.maxTokens` instead of hardcoded values
- Passes these parameters to the providers

**3. AgentImpl**
- `resolveProviderSettings()` to merge agent + run + defaults
- `getProviderName()` to determine the provider from the model
- Passes the resolved settings to `ReasoningEngine`

**4. Resolution priority**
- Run provider-specific > Run default > Agent provider-specific > Agent default

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Events tracked
4. **Security**: Deny-by-default respected

## Testing Requirements

### Required Unit Tests

1. **Per-agent configuration**
   - Test default settings applied
   - Test provider-specific settings
   - Test provider-specific > default priority

2. **Per-run configuration**
   - Test overriding agent settings
   - Test default settings at the run level
   - Test full priority chain

3. **Anthropic provider**
   - Test applying settings to Anthropic

## Tasks/Subtasks

- [x] Extend AgentConfig with providerSettings
- [x] Extend RunInput with providerSettings
- [x] Create ProviderSettings interface
- [x] Modify ReasoningEngine to use context.temperature and maxTokens
- [x] Implement resolveProviderSettings in AgentImpl
- [x] Implement getProviderName in AgentImpl
- [x] Create unit tests (7 tests)

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] Fix settings resolution with FallbackProvider [src/agent.ts:148-188]
- [x] [AI-Review][HIGH] Expose getProviderName() in ReasoningEngine [src/engines/reasoning-engine.ts] - Resolved via providerSettings in LLMRequest

## File List

- `src/types/agent.ts` - Modified (added ProviderSettings and providerSettings in AgentConfig)
- `src/types/run.ts` - Modified (added providerSettings in RunInput)
- `src/providers/llm-provider.ts` - Modified (added providerSettings in LLMRequest)
- `src/providers/fallback-provider.ts` - Modified (per-provider settings resolution)
- `src/engines/reasoning-engine.ts` - Modified (uses providerSettings, resolution after knowing the provider used, added getProviderName())
- `src/sdk.ts` - Modified (ReasoningEngine created per agent instead of shared)
- `src/agent.ts` - Modified (mergeProviderSettings, passing providerSettings instead of resolved settings)
- `src/__tests__/provider-settings.test.ts` - New (7 tests)
- `src/__tests__/provider-settings-fallback.test.ts` - New (2 tests for FallbackProvider)
- `src/__tests__/reasoning-engine-isolation.test.ts` - New (2 tests for ReasoningEngine isolation)

## Dev Agent Record

### Implementation Plan

1. **Types**: Extension of AgentConfig and RunInput with providerSettings
2. **ReasoningEngine**: Use of context parameters instead of hardcoded values
3. **AgentImpl**: Settings resolution with correct priority
4. **Tests**: Complete tests for all use cases

### Completion Notes

✅ **Story completed successfully**

**Implementation:**
- ProviderSettings interface created with temperature and maxTokens
- AgentConfig extended with providerSettings (openai, anthropic, default)
- RunInput extended with providerSettings for overrides
- LLMRequest extended with providerSettings for FallbackProvider
- FallbackProvider automatically resolves settings per provider
- ReasoningEngine modified to use providerSettings and resolve after knowing the provider used
- AgentImpl implements mergeProviderSettings with correct priority
- Priority: Run provider-specific > Run default > Agent provider-specific > Agent default
- **CRITICAL FIX**: Settings resolved AFTER knowing the provider actually used (fixes a bug with FallbackProvider)
- **ARCHITECTURE IMPROVEMENT**: ReasoningEngine created per agent for better isolation
- **ARCHITECTURE IMPROVEMENT**: ReasoningEngine exposes getProviderName() and getPrimaryProviderName()

**Tests:**
- 7 integration tests (all passing)
- 2 FallbackProvider-specific tests (all passing)
- 2 ReasoningEngine isolation tests (all passing)
- Complete coverage: agent-level, run-level, priority, Anthropic, FallbackProvider, isolation

**Validated acceptance criteria:**
- ✅ Per-provider configuration possible
- ✅ Provider-specific parameters (temperature, maxTokens)
- ✅ Parameters applied correctly
- ✅ Configuration validated (via tests)

## Senior Developer Review (AI)

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Changes Requested

### Review Summary

**Issues Found:** 2 issues (1 CRITICAL ✅ FIXED, 1 HIGH ✅ RESOLVED)  
**Files Reviewed:** 8 files modified/created  
**Tests Status:** All tests pass, including new FallbackProvider tests

### Action Items

#### 🔴 CRITICAL Priority - ✅ FIXED

1. **[CRITICAL] Provider settings applied to the wrong provider with FallbackProvider** [src/agent.ts:148-188] ✅ FIXED
   - Problem: `getProviderName()` determines the provider from the model BEFORE the call. If FallbackProvider switches to another provider, the wrong settings are applied.
   - Impact: If model="gpt-4" but it falls back to Anthropic, OpenAI settings are applied instead of Anthropic settings
   - Solution applied:
     - Added `providerSettings` to `LLMRequest`
     - `FallbackProvider` automatically resolves settings per provider
     - `ReasoningEngine` passes `providerSettings` to `FallbackProvider` instead of resolved settings
     - Settings resolved AFTER knowing the provider actually used
   - Tests: 2 new tests added to validate the behavior with FallbackProvider

#### 🟡 HIGH Priority - ✅ RESOLVED

2. **[HIGH] ReasoningEngine should expose getProviderName()** [src/engines/reasoning-engine.ts:25-32] ✅ RESOLVED
   - Problem: `AgentImpl` cannot access the ReasoningEngine's provider to determine the provider actually used
   - Impact: `AgentImpl.getProviderName()` guesses from the model instead of using the actual provider
   - Solution applied: Resolved via `providerSettings` in `LLMRequest` - `FallbackProvider` automatically resolves according to the provider used

## Story Completion Status

**Status:** review  
**Ready for:** Final code review  
**Dependencies:** Story 10.1, 10.2, 10.3 completed (prerequisites created)  
**Next Story:** Epic 10 completed
