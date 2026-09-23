# Story 1.2: Initializing the SDK with a minimal configuration

**Story ID:** 1.2  
**Epic:** 1 - Quick Start & SDK Foundation  
**Status:** done  
**Created:** 2026-01-06

## User Story

**As a** developer,  
**I want** to initialize the SDK with basic parameters,  
**So that** I can start using the SDK immediately.

## Acceptance Criteria

**Given** the SDK is installed  
**When** I call `createSDK({ apiKey: '...' })`  
**Then** an SDK instance is created  
**And** the API is fully typed (complete type-safety)  
**And** the minimal configuration is validated  
**And** configuration errors are clear and explicit

## Business Value

- **Simplicity**: Minimal configuration required (only apiKey)
- **Type-safety**: Fully typed API for a better DX
- **Validation**: Clear errors if configuration is invalid
- **Speed**: Immediate startup without complex configuration

## Technical Requirements

### Current Architecture

**Current State:**
- `createSDK()` function in `src/index.ts`
- `SDKImpl` class in `src/sdk.ts`
- `SDKConfig` interface in `src/types/sdk.ts`
- Configuration validation in the constructor

**Files Involved:**
- `src/index.ts` - Exports the `createSDK()` function
- `src/sdk.ts` - SDK implementation
- `src/types/sdk.ts` - Types and interfaces

### Implementation

**Minimal Configuration:**
```typescript
interface SDKConfig {
  apiKey: string;  // Required
  provider?: 'openai' | 'anthropic';  // Optional
  eventStore?: IEventStore;  // Optional
  defaultPolicies?: Policy[];  // Optional
}
```

**Validation:**
- `apiKey` required
- Clear errors if missing
- Sensible default configuration

## Architecture Compliance

### Principles Followed

1. **Simplicity**: Minimal configuration
2. **Type-safety**: Strict TypeScript
3. **Validation**: Clear errors
4. **Defaults**: Sensible default values

## Testing Requirements

- ✅ SDK created with apiKey only
- ✅ Correct types
- ✅ Error if apiKey is missing
- ✅ Default configuration applied

## Story Completion Status

**Status:** done  
**Implementation:** Complete in `src/sdk.ts`


