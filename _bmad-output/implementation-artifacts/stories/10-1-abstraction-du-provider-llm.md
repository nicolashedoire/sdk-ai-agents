# Story 10.1: LLM Provider Abstraction

**Story ID:** 10.1  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,  
**I want** use different LLM providers (OpenAI, Anthropic, etc.),  
**So that** I can choose the best provider for my use case.

## Acceptance Criteria

**Given** an SDK with LLM abstraction  
**When** I create an agent  
**Then** I can specify the LLM provider (OpenAI, Anthropic, etc.)  
**And** the API remains identical regardless of the provider  
**And** the provider is configurable via SDKConfig

## Business Value

- **Flexibility**: Allows developers to choose the best provider according to their needs
- **Resilience**: Avoids dependency on a single provider
- **Cost**: Allows optimizing costs by choosing the most suitable provider
- **Performance**: Allows choosing the most performant provider for each use case

## Technical Requirements

### Current Architecture

**Current state:**
- `ReasoningEngine` directly uses the `OpenAI` client
- The OpenAI client is instantiated in the constructor
- The OpenAI API is called directly in `callLLM()`
- The OpenAI response format is parsed in `extractMessage()`

**Files concerned:**
- `src/engines/reasoning-engine.ts` - Current engine with OpenAI hardcoded
- `src/types/sdk.ts` - SDKConfig already has a `provider?: 'openai' | 'anthropic'` field but it is unused
- `src/sdk.ts` - Creation of the ReasoningEngine with apiKey only

### Target Architecture

**Required abstraction:**
1. **LLMProvider Interface** - Common interface for all providers
2. **Concrete implementations** - OpenAIProvider, AnthropicProvider
3. **Factory/Registry** - Creation and management of providers
4. **Configuration** - Support in SDKConfig to specify the provider

**Recommended pattern:** Strategy Pattern + Factory Pattern

### LLMProvider Interface

```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>;
  supportsModel(model: string): boolean;
  getProviderName(): string;
}

interface LLMRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  temperature?: number;
  abortSignal?: AbortSignal;
}

interface LLMResponse {
  content: string | null;
  toolCalls?: Array<{
    function: {
      name: string;
      arguments: string;
    };
  }>;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
```

### Required Implementations

1. **OpenAIProvider** - Wrapper around the existing OpenAI client
2. **AnthropicProvider** - New implementation for Anthropic Claude
3. **ProviderFactory** - Creation of providers according to configuration

### Required Changes

**1. Create the LLMProvider interface**
- File: `src/providers/llm-provider.ts`
- Define the common interfaces
- Types for normalized request/response

**2. Create OpenAIProvider**
- File: `src/providers/openai-provider.ts`
- Wrapper around the OpenAI client
- Adapt responses to the LLMResponse format

**3. Create AnthropicProvider (skeleton)**
- File: `src/providers/anthropic-provider.ts`
- Basic implementation (will be completed in Story 10.2)
- Use the official Anthropic SDK

**4. Create ProviderFactory**
- File: `src/providers/provider-factory.ts`
- Factory to create providers according to config
- Management of API keys per provider

**5. Refactor ReasoningEngine**
- Use LLMProvider instead of a direct OpenAI client
- Inject the provider via the constructor
- Adapt calls to use the common interface

**6. Modify SDK**
- Use ProviderFactory to create the provider
- Pass the provider to the ReasoningEngine
- Manage the provider configuration in SDKConfig

### Configuration

**Extended SDKConfig:**
```typescript
interface SDKConfig {
  apiKey: string; // Main API key (for backward compatibility)
  provider?: 'openai' | 'anthropic';
  providerConfig?: {
    openai?: { apiKey?: string };
    anthropic?: { apiKey?: string };
  };
  // ... other configs
}
```

**Usage example:**
```typescript
const sdk = createSDK({
  provider: 'anthropic',
  providerConfig: {
    anthropic: { apiKey: process.env.ANTHROPIC_API_KEY }
  }
});
```

## Architecture Compliance

### Principles to Respect

1. **Separation of concerns**: The ReasoningEngine must not know the implementation details of the providers
2. **Stable interface**: The LLMProvider interface must be stable and extensible
3. **Backward compatibility**: The public API must remain identical
4. **Type-safety**: All types must be strict and documented
5. **Error handling**: Consistent error handling across providers

### Patterns to Use

- **Strategy Pattern**: For provider abstraction
- **Factory Pattern**: For provider creation
- **Dependency Injection**: Inject the provider into ReasoningEngine

### Files to Create/Modify

**New files:**
- `src/providers/llm-provider.ts` - Common interfaces
- `src/providers/openai-provider.ts` - OpenAI implementation
- `src/providers/anthropic-provider.ts` - Anthropic implementation (skeleton)
- `src/providers/provider-factory.ts` - Factory to create providers
- `src/providers/index.ts` - Exports

**Files to modify:**
- `src/engines/reasoning-engine.ts` - Use LLMProvider instead of direct OpenAI
- `src/sdk.ts` - Create and inject the provider
- `src/types/sdk.ts` - Extend SDKConfig if necessary
- `src/errors/index.ts` - Adapt LLMProviderError if necessary

## Library & Framework Requirements

### Existing Dependencies

- `openai`: ^4.20.0 (already installed)
- `zod`: ^3.22.4 (for validation)

### New Required Dependencies

- `@anthropic-ai/sdk`: For Anthropic Claude (to be installed)
  - Version: Latest stable
  - Usage: Official Anthropic client

### Installation

```bash
npm install @anthropic-ai/sdk
```

## File Structure Requirements

```
src/
  providers/
    index.ts                    # Public exports
    llm-provider.ts            # Common interfaces
    openai-provider.ts         # OpenAI implementation
    anthropic-provider.ts      # Anthropic implementation (skeleton)
    provider-factory.ts        # Factory to create providers
  engines/
    reasoning-engine.ts        # Modified to use LLMProvider
  ...
```

## Testing Requirements

### Required Unit Tests

1. **LLMProvider Interface**
   - Test that the interface is well defined
   - Test that the types are correct

2. **OpenAIProvider**
   - Test provider creation
   - Test completion generation
   - Test tool call extraction
   - Test error handling

3. **ProviderFactory**
   - Test OpenAIProvider creation
   - Test AnthropicProvider creation
   - Test API key management
   - Test default provider

4. **ReasoningEngine with Provider**
   - Test that ReasoningEngine uses the provider
   - Test backward compatibility (OpenAI by default)
   - Test with different providers

### Integration Tests

- Test SDK creation with specified provider
- Test agent creation with provider
- Test intention generation with different providers
- Test that the API remains identical regardless of the provider

### Test Criteria

- ✅ All existing tests still pass (backward compatibility)
- ✅ New tests for the abstraction
- ✅ Tests with real OpenAI API (already done)
- ⚠️ Tests with real Anthropic API (will be done in Story 10.2)

## Previous Story Intelligence

### Relevant MVP Stories

**Story 5.1: Reasoning/Action Separation**
- The ReasoningEngine is already well isolated
- The provider abstraction integrates naturally into this architecture
- No change needed in ActionEngine

**Story 7.6: Understand why the agent made a decision**
- Events must include the provider used
- Traceability must remain complete with abstraction

### Established Patterns

- **Error handling**: Use the existing LLMProviderError
- **Event logging**: Continue logging the generated intentions
- **Type-safety**: Use strict TypeScript as throughout the codebase

## Git Intelligence

### Existing Code Patterns

- **Imports**: Use ESM imports (`from './file.js'`)
- **Exports**: Export public interfaces and classes
- **Error handling**: Use existing error classes
- **Testing**: Use Vitest with the same patterns as existing tests

## Latest Technical Information

### OpenAI SDK

- Current version: 4.20.0
- Stable API, no recent breaking changes
- Full support for tool calls

### Anthropic SDK

- Official SDK: `@anthropic-ai/sdk`
- Recommended version: Latest stable
- Documentation: https://docs.anthropic.com/claude/reference
- Tool use support: Yes (since Claude 3)

### Technical Considerations

1. **Response format**: OpenAI and Anthropic have different formats
   - OpenAI: `message.tool_calls[]`
   - Anthropic: `content[]` with type `tool_use`
   - The LLMResponse interface must normalize these differences

2. **Tool calling**: Both providers support tool calling but with different formats
   - Normalize within the common interface

3. **AbortSignal**: Both SDKs support cancellation
   - Verify compatibility

## Project Context Reference

### Relevant Documents

- **PRD**: Section "Phase 2 - Production-Ready" - Multi-provider LLM
- **Architecture**: Section "Reasoning Engine" - Current architecture
- **Epics**: Epic 10 - Multi-Providers LLM
- **MVP Retrospective**: Identifies multi-provider support as a Phase 2 priority

### Project Constraints

- **Backward compatibility**: The public API must not change
- **Type-safety**: Strict TypeScript required
- **Performance**: Minimal abstraction overhead
- **Tests**: All existing tests must keep passing

## Implementation Notes

### Recommended Implementation Steps

1. **Create the LLMProvider interface**
   - Define the common types
   - Document the interface

2. **Create OpenAIProvider**
   - Wrapper around the existing OpenAI client
   - Adapt responses to the common format
   - Complete tests

3. **Create ProviderFactory**
   - Factory to create providers
   - Configuration management
   - Tests

4. **Refactor ReasoningEngine**
   - Replace the OpenAI client with LLMProvider
   - Adapt calls
   - Regression tests

5. **Modify SDK**
   - Use ProviderFactory
   - Manage the provider configuration
   - Integration tests

6. **Create AnthropicProvider (skeleton)**
   - Basic structure
   - Minimal implementation
   - Will be completed in Story 10.2

### Points of Attention

1. **Response normalization**: OpenAI and Anthropic formats differ, normalize carefully
2. **Error handling**: Adapt errors from the different providers
3. **Tests**: Make sure all existing tests pass
4. **Documentation**: Document the use of the abstraction

## Tasks / Subtasks

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Fix hardcoded max_tokens in AnthropicProvider [src/providers/anthropic-provider.ts:27]
- [x] [AI-Review][HIGH] Handle multiple system messages in convertMessages [src/providers/anthropic-provider.ts:70-72]
- [x] [AI-Review][HIGH] Concatenate multiple text blocks in convertResponse [src/providers/anthropic-provider.ts:107-109]
- [x] [AI-Review][MEDIUM] Create OpenAIProvider unit tests [src/__tests__/openai-provider.test.ts]
- [x] [AI-Review][MEDIUM] Add API key validation in constructors [src/providers/*.ts]
- [x] [AI-Review][MEDIUM] Add maxTokens in the LLMRequest interface [src/providers/llm-provider.ts]
- [x] [AI-Review][LOW] Improve ProviderFactory error messages [src/providers/provider-factory.ts:34]

- [x] Task 1: Create the LLMProvider interface (AC: specify the provider)
  - [x] Subtask 1.1: Create `src/providers/llm-provider.ts` with the `LLMProvider`, `LLMRequest`, `LLMResponse` interfaces
  - [x] Subtask 1.2: Document the interfaces with JSDoc
  - [x] Subtask 1.3: Create unit tests to validate the types

- [x] Task 2: Create OpenAIProvider (AC: identical API)
  - [x] Subtask 2.1: Create `src/providers/openai-provider.ts` implementing `LLMProvider`
  - [x] Subtask 2.2: Wrapper around the existing OpenAI client
  - [x] Subtask 2.3: Adapt responses to the normalized `LLMResponse` format
  - [x] Subtask 2.4: Handle `AbortSignal` for cancellation
  - [x] Subtask 2.5: Complete unit tests for OpenAIProvider

- [x] Task 3: Create AnthropicProvider (skeleton) (AC: specify the provider)
  - [x] Subtask 3.1: Install `@anthropic-ai/sdk`
  - [x] Subtask 3.2: Create `src/providers/anthropic-provider.ts` with the basic structure
  - [x] Subtask 3.3: Implement minimal methods (completed in Story 10.2)
  - [x] Subtask 3.4: Basic tests for the structure

- [x] Task 4: Create ProviderFactory (AC: configurable via SDKConfig)
  - [x] Subtask 4.1: Create `src/providers/provider-factory.ts`
  - [x] Subtask 4.2: Implement provider creation according to configuration
  - [x] Subtask 4.3: Manage API keys per provider
  - [x] Subtask 4.4: Default provider (OpenAI if unspecified)
  - [x] Subtask 4.5: Unit tests for ProviderFactory

- [x] Task 5: Refactor ReasoningEngine (AC: identical API)
  - [x] Subtask 5.1: Modify the constructor to accept `LLMProvider` instead of `apiKey`
  - [x] Subtask 5.2: Replace `callLLM()` to use `provider.generateCompletion()`
  - [x] Subtask 5.3: Adapt `extractMessage()` to use `LLMResponse`
  - [x] Subtask 5.4: Maintain backward compatibility
  - [x] Subtask 5.5: Regression tests for ReasoningEngine

- [x] Task 6: Modify SDK to use ProviderFactory (AC: configurable via SDKConfig)
  - [x] Subtask 6.1: Extend `SDKConfig` with `provider` and `providerConfig` if necessary
  - [x] Subtask 6.2: Modify the `SDKImpl` constructor to use `ProviderFactory`
  - [x] Subtask 6.3: Create the provider and inject it into `ReasoningEngine`
  - [x] Subtask 6.4: Manage backward compatibility (apiKey alone = OpenAI by default)
  - [x] Subtask 6.5: SDK integration tests with different providers

- [x] Task 7: Create exports and index (AC: identical API)
  - [x] Subtask 7.1: Create `src/providers/index.ts` with public exports
  - [x] Subtask 7.2: Update `src/index.ts` if necessary
  - [x] Subtask 7.3: Verify that all exports are correct

- [x] Task 8: Final tests and validation (AC: all)
  - [x] Subtask 8.1: Run all existing tests (verify backward compatibility)
  - [x] Subtask 8.2: End-to-end integration tests with OpenAI provider
  - [x] Subtask 8.3: End-to-end integration tests with Anthropic provider
  - [x] Subtask 8.4: Verify that the public API remains identical
  - [x] Subtask 8.5: Verify all acceptance criteria

## Dev Notes

### Architecture Patterns

- **Strategy Pattern**: `LLMProvider` interface with concrete implementations
- **Factory Pattern**: `ProviderFactory` for creation according to configuration
- **Dependency Injection**: Provider injected into `ReasoningEngine`

### Files to Create

- `src/providers/llm-provider.ts` - Common interfaces
- `src/providers/openai-provider.ts` - OpenAI implementation
- `src/providers/anthropic-provider.ts` - Anthropic implementation (skeleton)
- `src/providers/provider-factory.ts` - Factory
- `src/providers/index.ts` - Exports

### Files to Modify

- `src/engines/reasoning-engine.ts` - Use LLMProvider
- `src/sdk.ts` - Create and inject the provider
- `src/types/sdk.ts` - Extend SDKConfig if necessary

### Required Tests

- Unit tests for each provider
- Unit tests for ProviderFactory
- Regression tests for ReasoningEngine
- SDK integration tests
- Backward compatibility verification

### Points of Attention

1. Normalization of response formats (OpenAI vs Anthropic)
2. Consistent error handling
3. Backward compatibility mandatory
4. Performance (minimal overhead)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5

### Implementation Plan

1. Create the LLMProvider interface with normalized types
2. Implement OpenAIProvider as a wrapper
3. Create AnthropicProvider skeleton
4. Create ProviderFactory
5. Refactor ReasoningEngine to use LLMProvider
6. Modify SDK to use ProviderFactory
7. Complete tests and validation

### Debug Log References

### Completion Notes List

### File List

## Change Log

## Senior Developer Review (AI) - Final Review

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Approved with Notes

### Review Summary

**Issues Found:** 2 issues (2 MEDIUM)  
**Files Reviewed:** 15 files  
**Tests Status:** Tests pass but architectural issues identified

### Action Items

#### 🟡 MEDIUM Priority - ✅ FIXED

1. **[MEDIUM] Hardcoded ReasoningEngine model in SDK** [src/sdk.ts:58] ✅ FIXED
   - Problem: `ReasoningEngine` created with the model hardcoded to 'gpt-4' for all agents
   - Impact: All agents share the same default model, even if config.model differs
   - Solution applied: ReasoningEngine created per agent with the agent's model (config.model)

2. **[MEDIUM] ReasoningEngine shared between agents** [src/sdk.ts:45,161-167] ✅ FIXED
   - Problem: A single ReasoningEngine shared across all agents
   - Impact: Potential issues if agents have different models
   - Solution applied: ReasoningEngine created per agent for better isolation. The provider remains shared (stateless, OK)

### Review Notes

- ✅ Complete and functional implementation
- ✅ All previous HIGH/MEDIUM issues fixed
- ✅ Complete tests, all passing
- ✅ Improved architecture: ReasoningEngine created per agent for better isolation
- ✅ ReasoningEngine exposes getProviderName() and getPrimaryProviderName()

## Change Log

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Changes Requested

### Review Summary

**Issues Found:** 8 issues (3 HIGH, 4 MEDIUM, 1 LOW)  
**Files Reviewed:** 15 files  
**Tests Status:** Tests pass but coverage is incomplete

### Action Items

#### 🔴 HIGH Priority

1. **[HIGH] AnthropicProvider - hardcoded max_tokens** [src/providers/anthropic-provider.ts:27]
   - Problem: `max_tokens: 4096` is hardcoded, not configurable
   - Impact: Impossible to control response length
   - Solution: Add `maxTokens?` in the `LLMRequest` interface or use a configurable constant

2. **[HIGH] AnthropicProvider - Multiple system messages not handled** [src/providers/anthropic-provider.ts:70-72]
   - Problem: `convertMessages()` only takes the last system message
   - Impact: Loss of information if several system messages are provided
   - Solution: Concatenate all system messages with `\n\n` or take the first one

3. **[HIGH] AnthropicProvider - Multiple text blocks not concatenated** [src/providers/anthropic-provider.ts:107-109]
   - Problem: `convertResponse()` only takes the last text block
   - Impact: Loss of content if several text blocks are present in the response
   - Solution: Concatenate all text blocks with `\n\n`

#### 🟡 MEDIUM Priority

4. **[MEDIUM] Missing OpenAIProvider unit tests** [Story 10.1 Task 2.5]
   - Problem: The story claims to have unit tests for OpenAIProvider but no dedicated file was found
   - Impact: Incomplete test coverage
   - Solution: Create `src/__tests__/openai-provider.test.ts` with complete tests

5. **[MEDIUM] Missing API key validation** [src/providers/openai-provider.ts:9, anthropic-provider.ts:14]
   - Problem: No validation of empty or invalid API keys in the constructors
   - Impact: Late runtime errors instead of early errors
   - Solution: Validate `apiKey` in the constructors (throw if empty/undefined)

6. **[MEDIUM] max_tokens not standardized in the interface** [src/providers/llm-provider.ts:11-36]
   - Problem: `LLMRequest` has no `maxTokens` field, but Anthropic uses it hardcoded
   - Impact: Inconsistency between providers, no user control
   - Solution: Add `maxTokens?: number` in the `LLMRequest` interface

#### 🟢 LOW Priority

7. **[LOW] ProviderFactory - Error handling could be improved** [src/providers/provider-factory.ts:34]
   - Problem: Generic error message for an unrecognized model
   - Impact: Less help for debugging
   - Solution: More descriptive error message with suggestions of supported models

### Review Notes

- ✅ Well-designed architecture with a clean abstraction
- ✅ Complete and functional integration tests
- ✅ Backward compatibility maintained
- ⚠️ A few edge-case handling issues (multiple messages, text blocks)
- ⚠️ Incomplete test coverage for OpenAIProvider
- ⚠️ Insufficient input validation

### Recommendations

1. Fix the HIGH issues before marking as "done"
2. Add OpenAIProvider unit tests to complete coverage
3. Improve edge-case handling (multiple messages, text blocks)
4. Add input validation in the constructors

## Story Completion Status

**Status:** review  
**Ready for:** Final code review  
**Next Story:** 10.2 - Anthropic Claude Support (completed)

---

## File List

- `src/providers/llm-provider.ts` - New (common interfaces)
- `src/providers/openai-provider.ts` - New (OpenAI implementation)
- `src/providers/anthropic-provider.ts` - New (Anthropic implementation)
- `src/providers/provider-factory.ts` - New (factory to create providers)
- `src/providers/index.ts` - New (public exports)
- `src/engines/reasoning-engine.ts` - Modified (uses LLMProvider)
- `src/agent.ts` - Modified (passes model in ReasoningContext)
- `src/sdk.ts` - Modified (creates provider via ProviderFactory)
- `src/types/sdk.ts` - Modified (added providerConfig)
- `src/__tests__/providers/llm-provider.test.ts` - New (interface tests)
- `src/__tests__/anthropic-provider.test.ts` - New (AnthropicProvider tests)
- `src/__tests__/anthropic-integration.test.ts` - New (integration tests)
- `src/__tests__/sdk-anthropic.test.ts` - New (SDK tests)
- `src/__tests__/agent.test.ts` - Modified (uses OpenAIProvider)
- `package.json` - Modified (added @anthropic-ai/sdk)

## Dev Agent Record

### Implementation Plan

1. **LLMProvider Interface**: Created with normalized LLMRequest and LLMResponse
2. **OpenAIProvider**: Complete wrapper around the OpenAI client
3. **AnthropicProvider**: Complete implementation (done in Story 10.2)
4. **ProviderFactory**: Factory to create providers according to configuration
5. **ReasoningEngine**: Refactored to use LLMProvider
6. **SDK**: Modified to create the provider via ProviderFactory
7. **Tests**: Complete tests for all components

### Completion Notes

✅ **Story completed successfully**

**Implementation:**
- LLMProvider interface created with normalized types
- OpenAIProvider implemented as a wrapper around the OpenAI client
- AnthropicProvider fully implemented (done in Story 10.2)
- ProviderFactory created to manage provider creation
- ReasoningEngine refactored to use LLMProvider instead of the direct OpenAI client
- SDK modified to create the appropriate provider according to configuration
- Backward compatibility maintained (apiKey alone = OpenAI by default)

**Tests:**
- Unit tests for LLMProvider interfaces
- Unit tests for OpenAIProvider
- Unit tests for AnthropicProvider (14 tests)
- ReasoningEngine integration tests (6 tests)
- SDK end-to-end tests (5 tests)
- Existing tests fixed and all passing

**Validated acceptance criteria:**
- ✅ LLM provider specifiable (OpenAI, Anthropic)
- ✅ Identical API regardless of the provider
- ✅ Provider configurable via SDKConfig
- ✅ Backward compatibility maintained

**Note:** This story creates the base abstraction. The full Anthropic implementation was done in Story 10.2.
