# Project overview

**Type:** Library (TypeScript SDK)
**Architecture:** Event-Sourcing with Separation of Concerns

## Executive Summary

SDK_AI_Agents is an AI agent governance infrastructure with native event-sourcing, replay, and security by design. The SDK turns AI agents from experimental tools into governable, explainable, production-ready decision-making systems.

## Project Classification

- **Repository Type:** Monolith (single cohesive codebase)
- **Project Type:** Library (TypeScript SDK)
- **Primary Language:** TypeScript 5.x
- **Architecture Pattern:** Event-Sourcing with Separation of Concerns (Reasoning Engine ≠ Action Engine)

## Technology Stack Summary

| Category | Technology | Version | Justification |
|----------|-----------|---------|---------------|
| Language | TypeScript | 5.3.2+ | Type-safety strict, ESM support |
| Runtime | Node.js | 20.0.0+ | LTS support, modern features |
| Package Manager | npm | - | Standard Node.js package manager |
| Build Tool | TypeScript Compiler | 5.3.2 | Native TypeScript compilation |
| Testing | Vitest | 1.0.4 | Fast, Vite-based test runner |
| Linting/Formatting | Biome | 1.7.0 | Fast, all-in-one tool |
| LLM Providers | OpenAI SDK | 4.20.0 | OpenAI API integration |
| LLM Providers | Anthropic SDK | 0.71.2 | Claude API integration |
| Validation | Zod | 3.22.4 | Schema validation for tool inputs |
| UUID | uuid | 9.0.1 | Unique ID generation |
| Database (optional) | PostgreSQL | 8.11.0+ | Production event store (peer dependency) |

## Key Features

### Core Capabilities

1. **Native Event-Sourcing**
   - All events are persisted in an event store
   - Deterministic replay without an LLM call
   - Full traceability of every decision

2. **Reasoning/Action Separation**
   - Reasoning Engine: generates intentions (no side effects)
   - Action Engine: executes intentions after validation
   - Security by design: the LLM never causes a direct side effect

3. **Built-in Governance**
   - Policy Engine: validates intentions before execution
   - Budget Tracker: tracks costs and usage per agent/tool/period
   - Approval Manager: human approval workflow for critical actions
   - Audit Trail: full traceability of policy decisions

4. **Multi-Provider LLM**
   - LLMProvider abstraction for OpenAI and Anthropic
   - Automatic fallback between providers
   - Per-provider configuration (temperature, maxTokens)

5. **Cognitive Observability**
   - Reasoning Graph: visualization of the reasoning process
   - Alternatives Analysis: alternatives considered by the agent
   - Decision Patterns: decision patterns across multiple runs
   - Trace Visualization: trace preparation for visualization

6. **Testing & Quality Assurance**
   - Golden Traces: reference traces for testing
   - Regression Detection: automatic regression detection
   - Assertions: behavioral assertions on traces
   - CI/CD Integration: test result export (JUnit XML, JSON)

7. **Advanced Observability**
   - Run Comparison: comparing two executions
   - Impact Analysis: before/after deployment impact analysis
   - Advanced Event Filtering: advanced event filtering with JSON paths

## Architecture Highlights

### Event Store Abstraction

- **IEventStore**: Common interface for all event stores
- **FileEventStore**: File-based implementation (MVP)
- **SQLEventStore**: Generic SQL implementation
- **SQLiteEventStore**: SQLite implementation
- **PostgreSQLEventStore**: PostgreSQL implementation with JSONB

### Engine Architecture

- **ReasoningEngine**: Generates intentions from the LLM
- **ActionEngine**: Executes intentions after validation
- **PolicyEngine**: Validates intentions against policies
- **ReplayEngine**: Replays executions from events

### Registry System

- **ToolRegistry**: Manages available tools
- **CapabilityRegistry**: Manages capabilities (tool groups)

### Manager System

- **ApprovalManager**: Human approval management
- **BudgetTracker**: Budget and usage tracking
- **GoldenTraceManager**: Golden trace management
- **RegressionTestManager**: Regression test suite management
- **AssertionManager**: Behavioral assertion management
- **ImpactAnalysisManager**: Impact analysis management

## Development Overview

### Prerequisites

- Node.js 20.0.0+ (LTS)
- npm or equivalent
- TypeScript 5.3.2+ (installed locally)

### Getting Started

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### Key Commands

- **Install:** `npm install`
- **Build:** `npm run build`
- **Dev:** `npm run dev` (watch mode)
- **Test:** `npm test`
- **Test Watch:** `npm run test:watch`
- **Test Coverage:** `npm run test:coverage`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Check:** `npm run check` (lint + format)

## Repository Structure

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

See [Source tree](../contributing/source-tree) for the detail of `src/`.

## Documentation Map

For detailed information, see:

- [Introduction](../guide/introduction) - What the SDK is for
- [Source tree](../contributing/source-tree) - Directory structure
- [Architecture](./architecture) - Detailed architecture
- [Development guide](../contributing/development) - Development workflow

