# Source tree

**Date:** 2026-01-06

## Overview

SDK_AI_Agents is organized into a clear modular structure with separation of responsibilities. The main source code is located in `src/` with subfolders for each functional domain.

## Complete Directory Structure

```
SDK_AI_Agents/
├── src/                          # Main source code
│   ├── agent.ts                 # Agent implementation (AgentImpl)
│   ├── sdk.ts                   # SDK main implementation (SDKImpl)
│   ├── index.ts                 # Public API exports
│   ├── engines/                 # Core engines
│   │   ├── reasoning-engine.ts  # Generates intentions from the LLM
│   │   ├── action-engine.ts     # Executes intentions after validation
│   │   ├── policy-engine.ts    # Validates intentions against policies
│   │   └── replay-engine.ts    # Replays executions from events
│   ├── stores/                  # Event store implementations
│   │   ├── event-store.ts      # IEventStore interface
│   │   ├── file-event-store.ts # File-based implementation
│   │   ├── sql-event-store.ts  # Generic SQL implementation
│   │   ├── sqlite-event-store.ts # SQLite implementation
│   │   └── postgresql-event-store.ts # PostgreSQL implementation
│   ├── providers/               # LLM provider implementations
│   │   ├── llm-provider.ts     # LLMProvider interface
│   │   ├── openai-provider.ts  # OpenAI implementation
│   │   ├── anthropic-provider.ts # Anthropic implementation
│   │   ├── fallback-provider.ts # Provider with automatic fallback
│   │   ├── provider-factory.ts # Factory for creating providers
│   │   └── index.ts            # Provider exports
│   ├── managers/                # Manager classes
│   │   ├── approval-manager.ts # Human approval management
│   │   ├── budget-tracker.ts   # Budget and usage tracking
│   │   ├── golden-trace-manager.ts # Golden trace management
│   │   ├── regression-test-manager.ts # Regression test suite management
│   │   ├── assertion-manager.ts # Assertion management
│   │   └── impact-analysis-manager.ts # Impact analysis management
│   ├── registry/                # Registry classes
│   │   ├── tool-registry.ts    # Available tool management
│   │   └── capability-registry.ts # Capability management
│   ├── types/                   # TypeScript type definitions
│   │   ├── index.ts            # Type exports
│   │   ├── agent.ts            # Agent types
│   │   ├── tool.ts             # Tool types
│   │   ├── policy.ts           # Policy types
│   │   ├── events.ts           # Event types
│   │   ├── run.ts              # Run types
│   │   ├── sdk.ts              # SDK types
│   │   ├── reasoning-graph.ts  # Reasoning Graph types
│   │   ├── alternatives.ts     # Alternatives types
│   │   ├── decision-patterns.ts # Decision Patterns types
│   │   ├── trace-visualization.ts # Trace Visualization types
│   │   ├── golden-trace.ts     # Golden Trace types
│   │   ├── validation.ts      # Validation types
│   │   ├── regression.ts      # Regression types
│   │   ├── regression-test.ts # Regression Test types
│   │   ├── assertion.ts       # Assertion types
│   │   ├── comparison.ts      # Comparison types
│   │   ├── impact-analysis.ts # Impact Analysis types
│   │   ├── advanced-event-filter.ts # Advanced Filtering types
│   │   ├── test-results-export.ts # Test Results Export types
│   │   └── audit.ts            # Audit types
│   ├── utils/                   # Utility functions
│   │   ├── constants.ts        # Constants
│   │   ├── id.ts              # ID generation
│   │   ├── zod-to-json-schema.ts # Zod → JSON Schema conversion
│   │   ├── reasoning-graph-builder.ts # Reasoning graph construction
│   │   ├── reasoning-graph-export.ts # Reasoning graph export
│   │   ├── alternatives-extractor.ts # Alternatives extraction
│   │   ├── pattern-analyzer.ts # Decision pattern analysis
│   │   ├── trace-visualizer.ts # Trace visualization
│   │   ├── trace-validator.ts  # Trace validation
│   │   ├── regression-detector.ts # Regression detection
│   │   ├── regression-test-runner.ts # Regression test execution
│   │   ├── test-results-exporter.ts # Test result export
│   │   ├── assertion-evaluator.ts # Assertion evaluation
│   │   ├── run-comparator.ts   # Run comparison
│   │   ├── comparison-report-generator.ts # Comparison report generation
│   │   ├── impact-analyzer.ts  # Impact analysis
│   │   └── advanced-event-filter.ts # Advanced event filtering
│   ├── evaluators/              # Evaluator classes
│   │   └── condition-evaluator.ts # Policy condition evaluation
│   ├── errors/                  # Error classes
│   │   └── index.ts            # Error exports
│   └── __tests__/               # Unit tests
│       ├── *.test.ts           # Tests per module
│       └── providers/          # Provider tests
├── dist/                        # Compiled output (TypeScript → JavaScript)
├── docs/                        # Documentation
│   ├── CONCEPTS.md             # Key concepts
│   ├── QUICKSTART.md           # Quick start guide
│   └── ...                     # Generated documentation
├── examples/                    # Example code
│   ├── quick-start.ts          # Minimal example
│   ├── complete-example.ts     # Complete example
│   └── test-api.ts            # API tests
├── demo/                        # Next.js demo application
│   ├── app/                    # Next.js app directory
│   ├── components/             # React components
│   └── lib/                    # SDK client
├── _bmad-output/                # BMAD workflow outputs
│   ├── planning-artifacts/     # Planning artifacts
│   └── implementation-artifacts/ # Implementation artifacts
└── templates/                   # Templates
    └── starter-template/       # Starter template
```

## Critical Directories

### `src/engines/`

**Purpose:** Contains the main engines of the SDK that orchestrate an agent's lifecycle.

**Contains:**
- `reasoning-engine.ts`: Generates intentions from the LLM (no side effects)
- `action-engine.ts`: Executes intentions after validation by the Policy Engine
- `policy-engine.ts`: Validates intentions against configured policies
- `replay-engine.ts`: Replays executions from persisted events

**Entry Points:** Used by `AgentImpl` and `SDKImpl`

**Integration:** The engines are injected into `AgentImpl` and `SDKImpl` via the constructor

### `src/stores/`

**Purpose:** Implementations of the `IEventStore` interface for event persistence.

**Contains:**
- `event-store.ts`: Common `IEventStore` interface
- `file-event-store.ts`: File-based implementation (MVP)
- `sql-event-store.ts`: Generic SQL implementation
- `sqlite-event-store.ts`: SQLite implementation
- `postgresql-event-store.ts`: PostgreSQL implementation with JSONB

**Entry Points:** Used by `SDKImpl` and `ReplayEngine`

**Integration:** Injected into `SDKImpl` via configuration

### `src/providers/`

**Purpose:** Implementations of the `LLMProvider` interface for different LLM providers.

**Contains:**
- `llm-provider.ts`: Common `LLMProvider` interface
- `openai-provider.ts`: OpenAI implementation
- `anthropic-provider.ts`: Anthropic implementation
- `fallback-provider.ts`: Provider with automatic fallback
- `provider-factory.ts`: Factory for creating providers

**Entry Points:** Used by `ReasoningEngine`

**Integration:** Injected into `ReasoningEngine` via the constructor

### `src/managers/`

**Purpose:** Management classes for advanced features (approvals, budgets, tests, etc.).

**Contains:**
- `approval-manager.ts`: Human approval management
- `budget-tracker.ts`: Budget and usage tracking
- `golden-trace-manager.ts`: Golden trace management
- `regression-test-manager.ts`: Regression test suite management
- `assertion-manager.ts`: Behavioral assertion management
- `impact-analysis-manager.ts`: Impact analysis management

**Entry Points:** Used by `SDKImpl` and `PolicyEngine`

**Integration:** Injected into `SDKImpl` and `PolicyEngine` via the constructor

### `src/registry/`

**Purpose:** Registries for managing available tools and capabilities.

**Contains:**
- `tool-registry.ts`: Available tool management (deny-by-default)
- `capability-registry.ts`: Capability management (tool groups)

**Entry Points:** Used by `SDKImpl` and `ActionEngine`

**Integration:** Injected into `SDKImpl` and `ActionEngine` via the constructor

### `src/types/`

**Purpose:** TypeScript definitions for all SDK types.

**Contains:**
- Types for Agent, Tool, Policy, Event, Run, SDK
- Types for advanced features (Reasoning Graph, Alternatives, etc.)
- Types for testing (Golden Trace, Regression, Assertion, etc.)

**Entry Points:** Imported by all modules

**Integration:** Used throughout the codebase for type-safety

### `src/utils/`

**Purpose:** Utility functions and helpers.

**Contains:**
- `constants.ts`: Global constants
- `id.ts`: Unique ID generation
- `zod-to-json-schema.ts`: Zod → JSON Schema conversion
- Utilities for Reasoning Graph, Alternatives, Patterns, etc.
- Utilities for testing (Validation, Regression, Assertion, etc.)

**Entry Points:** Imported by the modules that need them

**Integration:** Used by the engines, managers, and other modules

### `src/cognition/` (v0.2)

**Purpose:** Cognitive agents — explicit mental state, cognitive operations, controllers, thinker profiles.

**Contains:** `cognitive-agent.ts` (run loop), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (heuristic), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` and `thought-prompts.ts`, `mental-state.ts` (schemas and types), `mental-state-reducer.ts` and `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/decisions/` (v0.2)

**Purpose:** Typed decisions — the Noul/Choice/Score contract, the TypeSafe Jev HTTP client and the `DecisionService` behind `sdk.decisions`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2)

**Purpose:** Pricing and per-run cost reports; retry policy and retrying LLM provider; incident rules, notifiers (email, webhook, Resend) and the monitored event store.

### `src/mcp/` and `src/mcp.ts` (v0.2)

**Purpose:** MCP server exposing governed tools and MCP client importing tools. Published as the `@sdk-ai-agents/core/mcp` entry point so the core does not depend on `@modelcontextprotocol/sdk`.

### `src/__tests__/support/`

**Purpose:** Test doubles implementing the SDK ports (scripted LLM provider, in-memory decision client, local HTTP server) — no module mocks.

## Entry Points

### Main Entry

- **`src/index.ts`**: Public entry point of the SDK, exports all public APIs

### Application Entry Points

- **`src/sdk.ts`**: Main SDK implementation (`SDKImpl`)
- **`src/agent.ts`**: Agent implementation (`AgentImpl`)

## File Organization Patterns

### Naming Conventions

- **Files**: kebab-case for files (e.g., `reasoning-engine.ts`)
- **Classes**: PascalCase (e.g., `ReasoningEngine`)
- **Interfaces**: PascalCase with `I` prefix when needed (e.g., `IEventStore`)
- **Types**: PascalCase (e.g., `EventType`, `RunStatus`)
- **Functions**: camelCase (e.g., `generateCompletion`)

### Module Organization

- **One class/interface per file**: Each file contains one main class or interface
- **Co-located types**: Associated types in the same file or `types/`
- **Barrel exports**: `index.ts` to export public APIs

## Configuration Files

- **`package.json`**: Dependencies and npm scripts
- **`tsconfig.json`**: TypeScript configuration (strict mode, ESM)
- **`biome.json`**: Biome configuration (linting/formatting)
- **`vitest.config.ts`**: Vitest configuration (testing)

## Notes for Development

### Adding New Features

1. **New Engine**: Create in `src/engines/`, inject into `SDKImpl` or `AgentImpl`
2. **New Store**: Implement `IEventStore` in `src/stores/`
3. **New Provider**: Implement `LLMProvider` in `src/providers/`
4. **New Manager**: Create in `src/managers/`, inject into `SDKImpl`
5. **New Types**: Add to `src/types/`, export from `types/index.ts`

### Testing

- Unit tests in `src/__tests__/`
- One test file per source module
- Use Vitest for tests

### Build

- TypeScript compiles `src/` → `dist/`
- Source maps generated for debugging
- TypeScript declarations (`.d.ts`) generated

---

_Generated using BMAD Method `document-project` workflow_
