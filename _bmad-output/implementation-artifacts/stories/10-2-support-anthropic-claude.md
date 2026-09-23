# Story 10.2: Anthropic Claude Support

**Story ID:** 10.2  
**Epic:** 10 - Multi-Providers LLM  
**Status:** review  
**Created:** 2026-01-06

## User Story

**As a** developer,  
**I want** use Anthropic Claude as an LLM provider,  
**So that** I can benefit from Claude's advantages.

## Acceptance Criteria

**Given** Anthropic is configured as provider  
**When** I create an agent with model "claude-3-opus"  
**Then** the Reasoning Engine uses the Anthropic API  
**And** intentions are generated correctly  
**And** the response format is compatible  
**And** tool calls work correctly  
**And** errors are handled cleanly

## Business Value

- **Provider choice**: Allows developers to use Claude according to their preferences
- **Claude-specific advantages**: Better context understanding, better security
- **Resilience**: Reduces dependency on a single provider
- **Performance**: Allows choosing the best provider for each use case

## Technical Requirements

### Dependency on Story 10.1

**Prerequisites:**
- Story 10.1 must be completed (LLMProvider abstraction created)
- The `LLMProvider` interface must be defined
- `ProviderFactory` must be implemented
- `AnthropicProvider` must exist as a skeleton

### Current Architecture (after Story 10.1)

**Expected state after Story 10.1:**
- `LLMProvider` interface defined in `src/providers/llm-provider.ts`
- `OpenAIProvider` implemented and tested
- `AnthropicProvider` exists as a skeleton (basic structure)
- `ProviderFactory` can create providers
- `ReasoningEngine` uses `LLMProvider` instead of a direct OpenAI client

**Files concerned:**
- `src/providers/anthropic-provider.ts` - To complete
- `src/providers/provider-factory.ts` - Verify Anthropic creation
- `src/types/sdk.ts` - Anthropic configuration
- `src/errors/index.ts` - Anthropic error handling

### Key Differences OpenAI vs Anthropic

**1. Message Format:**
- **OpenAI**: `messages[]` with `role: 'system' | 'user' | 'assistant'`
- **Anthropic**: `messages[]` with `role: 'user' | 'assistant'` (no separate system role)
  - The system prompt is passed via a separate `system` parameter

**2. Tool Calling:**
- **OpenAI**: `tools[]` with `tool_choice`, response in `message.tool_calls[]`
- **Anthropic**: `tools[]` with `tool_choice`, response in `content[]` with type `tool_use`

**3. Response Format:**
- **OpenAI**: `message.content` (string) or `message.tool_calls[]`
- **Anthropic**: `content[]` (array) with objects `{type: 'text', text: '...'}` or `{type: 'tool_use', ...}`

**4. Models:**
- **OpenAI**: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`, etc.
- **Anthropic**: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3-5-sonnet`, etc.

**5. Parameters:**
- **OpenAI**: `temperature`, `max_tokens`, `top_p`, etc.
- **Anthropic**: `temperature`, `max_tokens`, `top_p`, `top_k`, etc. (similar but names may differ)

**6. Error Handling:**
- **OpenAI**: Exceptions with HTTP codes
- **Anthropic**: Exceptions with similar HTTP codes but different messages

### AnthropicProvider Implementation

**Required structure:**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMRequest, LLMResponse } from './llm-provider.js';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-3-5-sonnet-20241022') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Convert messages from OpenAI → Anthropic format
    // Handle the system prompt
    // Call the Anthropic API
    // Convert the Anthropic response → LLMResponse
  }

  supportsModel(model: string): boolean {
    return model.startsWith('claude-');
  }

  getProviderName(): string {
    return 'anthropic';
  }
}
```

### Required Conversions

**1. Message Conversion:**
```typescript
// OpenAI format → Anthropic format
function convertMessages(messages: OpenAI.Message[]): {
  system?: string;
  messages: Anthropic.Message[];
} {
  // Extract the system message
  // Convert the other messages
  // Handle the Anthropic format (no 'system' role within messages[])
}
```

**2. Tool Conversion:**
```typescript
// OpenAI tools → Anthropic tools
function convertTools(tools: OpenAI.Tool[]): Anthropic.Tool[] {
  // Similar format but check the differences
  // Anthropic uses 'name' instead of 'function.name'
}
```

**3. Response Conversion:**
```typescript
// Anthropic response → LLMResponse
function convertResponse(response: Anthropic.Message): LLMResponse {
  // Extract the text from content[]
  // Extract tool calls from content[] with type 'tool_use'
  // Normalize the format
}
```

### Supported Anthropic Models

**Recommended models:**
- `claude-3-5-sonnet-20241022` - Best balance (recommended)
- `claude-3-opus-20240229` - Most powerful
- `claude-3-sonnet-20240229` - Balanced
- `claude-3-haiku-20240307` - Fastest

**Validation:**
- Check that the model starts with `claude-`
- Validate the exact format of the model name
- Handle errors if the model is invalid

### Configuration

**Extended SDKConfig:**
```typescript
interface SDKConfig {
  provider?: 'openai' | 'anthropic';
  providerConfig?: {
    openai?: { apiKey?: string; defaultModel?: string };
    anthropic?: { apiKey?: string; defaultModel?: string };
  };
  // ...
}
```

**Usage example:**
```typescript
const sdk = createSDK({
  provider: 'anthropic',
  providerConfig: {
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-3-5-sonnet-20241022'
    }
  }
});

const agent = sdk.createAgent({
  name: 'Claude Agent',
  model: 'claude-3-opus-20240229', // Override of the default model
  // ...
});
```

## Architecture Compliance

### Principles to Respect

1. **Normalization**: The LLMProvider interface must hide the differences between providers
2. **Type-safety**: All types must be strict
3. **Error handling**: Error handling consistent with OpenAIProvider
4. **Performance**: No unnecessary overhead in the conversions
5. **Backward compatibility**: The public API remains identical

### Patterns to Use

- **Adapter Pattern**: Adapt the Anthropic API to the LLMProvider interface
- **Normalization**: Normalize response formats
- **Error Mapping**: Map Anthropic errors to LLMProviderError

### Files to Create/Modify

**Files to modify:**
- `src/providers/anthropic-provider.ts` - Complete the implementation
- `src/providers/provider-factory.ts` - Verify AnthropicProvider creation
- `src/errors/index.ts` - Adapt LLMProviderError if necessary
- `src/types/sdk.ts` - Anthropic configuration if necessary

**Tests to create:**
- `src/__tests__/anthropic-provider.test.ts` - Complete tests
- Integration tests with the real Anthropic API

## Library & Framework Requirements

### Required Dependencies

**Already installed (Story 10.1):**
- `@anthropic-ai/sdk` - Official Anthropic SDK
  - Version: Latest stable (v0.27.x or higher)
  - Documentation: https://docs.anthropic.com/claude/reference

### Installation

```bash
npm install @anthropic-ai/sdk
```

**Note:** This dependency should already be installed from Story 10.1.

### Versions and Compatibility

- **Node.js**: 18+ (compatible with our stack)
- **TypeScript**: 5.x (compatible)
- **Anthropic SDK**: Verify the latest stable version

## File Structure Requirements

```
src/
  providers/
    anthropic-provider.ts      # Complete Anthropic implementation
    llm-provider.ts            # Interface (created in Story 10.1)
    openai-provider.ts         # OpenAI implementation (Story 10.1)
    provider-factory.ts        # Factory (Story 10.1)
    index.ts                   # Exports
  __tests__/
    anthropic-provider.test.ts # AnthropicProvider tests
  ...
```

## Testing Requirements

### Required Unit Tests

1. **AnthropicProvider - Creation**
   - Test creation with API key
   - Test default model
   - Test custom model

2. **AnthropicProvider - Message Conversion**
   - Test message conversion OpenAI → Anthropic
   - Test system message extraction
   - Test handling of multiple messages
   - Test conversation history handling

3. **AnthropicProvider - Tool Conversion**
   - Test tool conversion OpenAI → Anthropic
   - Test parameter format
   - Test tool_choice

4. **AnthropicProvider - Response Conversion**
   - Test text extraction from content[]
   - Test tool call extraction from content[]
   - Test LLMResponse format normalization
   - Test token usage handling

5. **AnthropicProvider - Tool Calls**
   - Test tool call generation
   - Test multiple tool calls
   - Test argument format

6. **AnthropicProvider - Error Handling**
   - Test Anthropic API errors
   - Test network errors
   - Test authentication errors
   - Test invalid model errors
   - Test mapping to LLMProviderError

7. **AnthropicProvider - Models**
   - Test supportsModel() with different models
   - Test validation of Claude models
   - Test invalid models

### Integration Tests

1. **SDK with Anthropic**
   - Test SDK creation with the Anthropic provider
   - Test agent creation with a Claude model
   - Test intention generation with Claude
   - Test tool calls with Claude
   - Test that the API remains identical

2. **End-to-End**
   - Test a complete agent with Anthropic
   - Test intention generation
   - Test tool call execution
   - Test final answer
   - Test generated events

3. **Tests with Real API**
   - Test with the real Anthropic API (requires API key)
   - Test different Claude models
   - Test real tool calling
   - Test real error handling

### Test Criteria

- ✅ All unit tests pass
- ✅ Integration tests pass
- ✅ Tests with the real Anthropic API (if API key available)
- ✅ Response format compatible with ReasoningEngine
- ✅ Tool calls work correctly
- ✅ Error handling consistent with OpenAIProvider

## Previous Story Intelligence

### Story 10.1: LLM Provider Abstraction

**Lessons learned:**
- The LLMProvider interface must be stable and well defined
- Format normalization is critical
- Tests must cover all conversion cases
- Error handling must be consistent

**Files created in Story 10.1:**
- `src/providers/llm-provider.ts` - Common interface
- `src/providers/openai-provider.ts` - OpenAI implementation
- `src/providers/anthropic-provider.ts` - Skeleton (to complete)
- `src/providers/provider-factory.ts` - Factory

**Established patterns:**
- Use the LLMProvider interface
- Normalize response formats
- Handle errors with LLMProviderError
- Tests with mocks and the real API

### Relevant MVP Stories

**Story 5.1: Reasoning/Action Separation**
- The ReasoningEngine already uses LLMProvider (Story 10.1)
- No change needed in ActionEngine
- Generated intentions must remain compatible

**Story 7.6: Understand why the agent made a decision**
- Events must include the provider used
- Traceability must remain complete with Anthropic

## Git Intelligence

### Existing Code Patterns

- **Imports**: Use ESM imports (`from './file.js'`)
- **Exports**: Export public classes
- **Error handling**: Use LLMProviderError
- **Testing**: Use Vitest with the same patterns
- **Type-safety**: Strict TypeScript

### Relevant Recent Commits

- Story 10.1: Creation of the LLMProvider abstraction
- Established patterns for providers

## Latest Technical Information

### Anthropic SDK (@anthropic-ai/sdk)

**Current version:** 0.27.x (check latest version)

**Documentation:**
- API Reference: https://docs.anthropic.com/claude/reference
- TypeScript SDK: https://github.com/anthropics/anthropic-sdk-typescript

**Key characteristics:**
- Full tool use support (since Claude 3)
- Message format with a separate `system` field
- Response format with a `content[]` array
- Support for `max_tokens`, `temperature`, `top_p`, `top_k`

**Tool Use:**
- Format: `content[]` with objects `{type: 'tool_use', id: '...', name: '...', input: {...}}`
- Tool choice: `'auto'`, `'any'`, or `{type: 'tool', name: '...'}`
- Response: `content[]` with `{type: 'text', text: '...'}` or `{type: 'tool_use', ...}`

**Messages:**
- Format: `messages[]` with `role: 'user' | 'assistant'`
- System prompt: Separate `system` parameter (string)
- No `role: 'system'` within `messages[]`

**Available models:**
- `claude-3-5-sonnet-20241022` - Latest Sonnet version (recommended)
- `claude-3-opus-20240229` - Most powerful
- `claude-3-sonnet-20240229` - Balanced
- `claude-3-haiku-20240307` - Fastest

### Technical Considerations

1. **Message Conversion:**
   - Extract `role: 'system'` from OpenAI messages
   - Pass it as a separate `system` parameter
   - Convert the other messages to the Anthropic format

2. **Tool Conversion:**
   - Similar format but check the exact differences
   - Anthropic uses `name` directly in the tool object
   - Check the parameter format

3. **Response Conversion:**
   - `content[]` is an array, not a string
   - Extract the text from `content[]` with `type: 'text'`
   - Extract tool calls from `content[]` with `type: 'tool_use'`
   - Normalize to `LLMResponse`

4. **Error Handling:**
   - Anthropic uses similar HTTP codes
   - Error messages may differ
   - Map to LLMProviderError with provider='anthropic'

5. **AbortSignal:**
   - Check support in the Anthropic SDK
   - Implement if necessary

## Project Context Reference

### Relevant Documents

- **PRD**: Section "Phase 2 - Production-Ready" - Multi-provider LLM
- **Architecture**: Section "Reasoning Engine" - Architecture with abstraction
- **Epics**: Epic 10 - Multi-Providers LLM, Story 10.2
- **Story 10.1**: LLM Provider Abstraction (prerequisite)

### Project Constraints

- **Backward compatibility**: The public API must not change
- **Type-safety**: Strict TypeScript required
- **Performance**: Efficient conversions
- **Tests**: Complete tests with mocks and the real API
- **Compatible format**: Generated intentions must be compatible

## Implementation Notes

### Recommended Implementation Steps

1. **Install/Validate the Anthropic SDK**
   - Verify installation of `@anthropic-ai/sdk`
   - Verify version and compatibility

2. **Implement Message Conversion**
   - `convertMessages()` function OpenAI → Anthropic
   - Extract system message
   - Convert remaining messages
   - Complete unit tests

3. **Implement Tool Conversion**
   - `convertTools()` function OpenAI → Anthropic
   - Check the exact format
   - Unit tests

4. **Implement Response Conversion**
   - `convertResponse()` function Anthropic → LLMResponse
   - Extract text from content[]
   - Extract tool calls from content[]
   - Normalize the format
   - Complete unit tests

5. **Complete AnthropicProvider**
   - Implement `generateCompletion()`
   - Use the conversion functions
   - Handle errors
   - Implement `supportsModel()`
   - Unit tests

6. **Integration Tests**
   - Tests with ReasoningEngine
   - End-to-end tests
   - Tests with the real API (if available)

7. **Documentation**
   - Document usage
   - Examples with Anthropic
   - Notes on differences from OpenAI

### Points of Attention

1. **Message Format**: Handle the system prompt extraction carefully
2. **Response Format**: `content[]` is an array, parse it carefully
3. **Tool Calls**: Different format, normalize carefully
4. **Error Handling**: Map correctly to LLMProviderError
5. **Tests**: Test with the real API if possible
6. **Performance**: Efficient conversions, no overhead

### Edge Cases to Test

1. **Empty messages**
2. **No system message**
3. **Multiple system messages** (should not happen but handle it)
4. **Multiple tool calls**
5. **Mixed response** (text + tool calls)
6. **API errors** (rate limit, auth, etc.)
7. **Invalid models**
8. **AbortSignal** during the API call

## Senior Developer Review (AI) - Final Review

**Review Date:** 2026-01-06  
**Reviewer:** AI Code Reviewer  
**Outcome:** Approved

### Review Summary

**Issues Found:** 0 issues (all fixed)  
**Files Reviewed:** 8 files modified/created  
**Tests Status:** All tests pass

### Review Notes

- ✅ AnthropicProvider implementation complete and correct after fixes
- ✅ Message/tool/response conversions well implemented
- ✅ Complete tests, all passing
- ✅ Previously identified HIGH/MEDIUM issues have been fixed
- ✅ max_tokens configurable via LLMRequest.maxTokens
- ✅ Multiple system messages concatenated correctly
- ✅ Multiple text blocks concatenated correctly
- ✅ API key validation added

## Tasks/Subtasks

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Fix hardcoded max_tokens in AnthropicProvider [src/providers/anthropic-provider.ts:27]
- [x] [AI-Review][HIGH] Handle multiple system messages in convertMessages [src/providers/anthropic-provider.ts:70-72]
- [x] [AI-Review][HIGH] Concatenate multiple text blocks in convertResponse [src/providers/anthropic-provider.ts:107-109]
- [x] [AI-Review][MEDIUM] Add API key validation in AnthropicProvider [src/providers/anthropic-provider.ts:14]
- [x] [AI-Review][MEDIUM] Add maxTokens in the LLMRequest interface [src/providers/llm-provider.ts]

- [x] Install Anthropic SDK (@anthropic-ai/sdk)

---

## Tasks/Subtasks

- [x] Install Anthropic SDK (@anthropic-ai/sdk)
- [x] Create OpenAIProvider (prerequisite from Story 10.1)
- [x] Create ProviderFactory (prerequisite from Story 10.1)
- [x] Refactor ReasoningEngine to use LLMProvider
- [x] Implement AnthropicProvider with message conversions
- [x] Implement tool conversions
- [x] Implement response conversions
- [x] Handle Anthropic errors
- [x] Update SDK to create the Anthropic provider
- [x] Create AnthropicProvider unit tests (14 tests)
- [x] Create integration tests with ReasoningEngine (6 tests)
- [x] Create end-to-end tests with SDK (5 tests)
- [x] Fix existing tests to use LLMProvider

## File List

- `src/providers/openai-provider.ts` - New
- `src/providers/anthropic-provider.ts` - New
- `src/providers/provider-factory.ts` - New
- `src/providers/index.ts` - New
- `src/engines/reasoning-engine.ts` - Modified (uses LLMProvider)
- `src/agent.ts` - Modified (passes model in ReasoningContext)
- `src/sdk.ts` - Modified (creates the appropriate provider)
- `src/types/sdk.ts` - Modified (added providerConfig)
- `src/__tests__/anthropic-provider.test.ts` - New (14 tests)
- `src/__tests__/anthropic-integration.test.ts` - New (6 tests)
- `src/__tests__/sdk-anthropic.test.ts` - New (5 tests)
- `src/__tests__/agent.test.ts` - Modified (uses OpenAIProvider)
- `package.json` - Modified (added @anthropic-ai/sdk)

## Dev Agent Record

### Implementation Plan

1. **Story 10.1 Prerequisite**: Creation of OpenAIProvider and ProviderFactory required for the LLM abstraction
2. **AnthropicProvider**: Complete implementation with message/tool/response conversions
3. **Integration**: Refactoring of ReasoningEngine to use LLMProvider
4. **SDK**: Update to create the appropriate provider according to configuration
5. **Tests**: Complete unit, integration, and end-to-end tests

### Completion Notes

✅ **Story completed successfully**

**Implementation:**
- AnthropicProvider implemented with all necessary conversions
- Full support for Claude models (claude-3-opus, claude-3-sonnet, claude-3-haiku, claude-3-5-sonnet)
- Message conversions OpenAI → Anthropic (system prompt extraction)
- Tool conversions with the Anthropic format (input_schema)
- Response conversions Anthropic → LLMResponse (content[], tool_use)
- Complete error handling with LLMProviderError
- AbortSignal support for cancellation

**Tests:**
- 14 AnthropicProvider unit tests (all passing)
- 6 ReasoningEngine integration tests (all passing)
- 5 SDK end-to-end tests (all passing)
- Existing tests fixed to use LLMProvider

**Validated acceptance criteria:**
- ✅ Anthropic configured as provider
- ✅ Agent created with a Claude model works
- ✅ Reasoning Engine uses the Anthropic API
- ✅ Intentions generated correctly
- ✅ Response format compatible
- ✅ Tool calls work correctly
- ✅ Errors handled cleanly

**Note:** This story completes the Anthropic Claude implementation. Fallback between providers will be implemented in Story 10.3.
