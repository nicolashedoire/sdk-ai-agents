# Story 10.3: Fallback between Providers

**Story ID:** 10.3  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,
**I want** configure a fallback between providers,
**So that** my agent continues to function if a provider fails.

## Acceptance Criteria

**Given** multiple providers configured with fallback
**When** the primary provider fails
**Then** the system automatically switches to the fallback provider
**And** execution continues without interruption
**And** the fallback event is tracked

## Business Value

- **Functionality**: Feature implemented
- **Quality**: Tested and validated
- **Traceability**: Events tracked

## Technical Requirements

### Current Architecture

**Current state:**
- `ReasoningEngine` uses a single `LLMProvider`
- No fallback mechanism in case the provider fails
- Provider errors propagated directly

**Files concerned:**
- `src/engines/reasoning-engine.ts` - Intention generation
- `src/providers/` - LLM providers
- `src/types/sdk.ts` - SDK configuration
- `src/types/events.ts` - Event types

### Target Architecture

**Required fallback:**
1. **FallbackProvider** - Wrapper that manages multiple providers with fallback
2. **Configuration** - Support in `SDKConfig` to specify fallback providers
3. **Logging** - Fallback events tracked in EventStore
4. **Transparency** - Execution continues without interruption for the user

### Implementation

**1. FallbackProvider**
- Wrapper around multiple `LLMProvider` instances
- Tries the primary provider, then the fallbacks in order
- Returns metadata on which provider was used

**2. Extended SDKConfig**
- Added `fallbackProviders?: Array<{provider, config}>`
- Allows configuring multiple fallback providers

**3. ReasoningEngine**
- Detects if the provider is a `FallbackProvider`
- Logs a `provider.fallback` event when a fallback is used
- Continues execution normally

**4. Events**
- New `provider.fallback` type in `EventType`
- Contains: primaryProvider, usedProvider, attemptedProviders

## Architecture Compliance

### Principles Respected

1. **Separation of concerns**: Architecture respected
2. **Type-safety**: TypeScript strict
3. **Event-sourcing**: Events tracked
4. **Security**: Deny-by-default respected

## Testing Requirements

### Required Unit Tests

1. **FallbackProvider**
   - Test creation with primary only
   - Test creation with primary + fallback
   - Test using primary when it succeeds
   - Test fallback when primary fails
   - Test trying all providers in order
   - Test failure when all providers fail
   - Test fallback metadata

### Integration Tests

- Test SDK with fallback configured
- Test using the primary provider when it succeeds
- Test automatic fallback when primary fails
- Test fallback event logging
- Test trying all fallbacks in order
- Test failure when all providers fail

## Tasks/Subtasks

- [x] Create FallbackProvider wrapper
- [x] Extend SDKConfig with fallbackProviders
- [x] Modify SDK.createProvider to create FallbackProvider if configured
- [x] Add 'provider.fallback' event type
- [x] Modify ReasoningEngine to detect FallbackProvider
- [x] Implement fallback event logging
- [x] Create FallbackProvider unit tests (16 tests)
- [x] Create SDK integration tests with fallback (6 tests)

## File List

- `src/providers/fallback-provider.ts` - New (fallback wrapper)
- `src/providers/index.ts` - Modified (export FallbackProvider)
- `src/types/sdk.ts` - Modified (added fallbackProviders)
- `src/types/events.ts` - Modified (added 'provider.fallback')
- `src/engines/reasoning-engine.ts` - Modified (fallback detection + logging)
- `src/sdk.ts` - Modified (creation of FallbackProvider if configured)
- `src/__tests__/fallback-provider.test.ts` - New (16 unit tests)
- `src/__tests__/sdk-fallback.test.ts` - New (6 integration tests)

## Dev Agent Record

### Implementation Plan

1. **FallbackProvider**: Wrapper that manages multiple providers with fallback logic
2. **SDKConfig**: Extension to support fallbackProviders
3. **SDK**: Modification to create FallbackProvider if fallbackProviders are configured
4. **ReasoningEngine**: FallbackProvider detection and fallback event logging
5. **Tests**: Complete unit and integration tests

### Completion Notes

✅ **Story completed successfully**

**Implementation:**
- FallbackProvider created with complete fallback logic
- SDKConfig extended to support fallbackProviders
- SDK modified to automatically create FallbackProvider if configured
- ReasoningEngine modified to detect FallbackProvider and log events
- New 'provider.fallback' event type added
- Fallback metadata available (usedProvider, wasFallback, attemptedProviders)

**Tests:**
- 16 FallbackProvider unit tests (all passing)
- 6 SDK integration tests with fallback (all passing)
- Complete coverage of use cases

**Validated acceptance criteria:**
- ✅ Multiple providers configured with fallback
- ✅ Automatic switch to fallback if primary fails
- ✅ Execution continues without interruption
- ✅ Fallback events tracked

## Senior Developer Review (AI)

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Approved with Notes

### Review Summary

**Issues Found:** 0 issues  
**Files Reviewed:** 8 files modified/created  
**Tests Status:** All tests pass

### Review Notes

- ✅ Complete and correct implementation
- ✅ FallbackProvider well designed with metadata
- ✅ Fallback events correctly logged
- ✅ Complete tests, all passing
- ⚠️ Note: Issue identified in Story 10.4 regarding settings resolution with FallbackProvider

## Story Completion Status

**Status:** review  
**Ready for:** Code review  
**Dependencies:** Story 10.1 and 10.2 completed (prerequisites created)  
**Next Story:** 10.4 - Per-Provider Configuration
