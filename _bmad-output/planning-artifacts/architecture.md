---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-SDK_AI_Agents-2026-01-06.md
  - _bmad-output/planning-artifacts/research/technical-ecosysteme-sdks-frameworks-agents-ia-research-2026-01-06.md
  - _bmad-output/planning-artifacts/epics.md
workflowType: 'architecture'
project_name: 'SDK_AI_Agents'
user_name: 'Nicolashedoire'
date: '2026-01-06'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The SDK_AI_Agents project comprises 78 Functional Requirements organized into 9 MVP epics with 65 stories. The main functional domains are:

- **Agent Lifecycle & Execution Management**: Creation, start, stop, and state management of agents
- **Tool & Capability Management**: Definition, validation, and control of tools with deny-by-default security
- **Policies & Governance**: Native governance system with global and specific policies
- **Runtime Architecture**: Strict separation of reasoning/action (Reasoning Engine ≠ Action Engine)
- **Event Sourcing & Persistence**: Event log as the single source of truth for complete traceability
- **Tracing & Observability**: Complete observability of decisions, constraints, and reasoning
- **Replay & Debugging**: Deterministic replay without the LLM for debugging and audit
- **Versioning & Audit**: Traceability of agent and execution versions

**Non-Functional Requirements:**

The critical NFRs that will guide the architectural decisions:

- **Performance**: SDK overhead < 5-10ms (excluding LLM/tools), replay without an LLM call
- **Reliability**: 100% of runs replayable, no lost events, no tool without a corresponding event
- **Security**: Structural deny-by-default, security by impossibility (not by configuration)
- **Type-safety**: Strict TypeScript, fully typed and predictable API
- **Scalability**: File-based event store (MVP) → SQL (production) → distributed (scale)
- **Determinism**: Replay = same logical sequence, same tool call order

**Scale & Complexity:**

- **Primary domain**: TypeScript/Node.js SDK/package (developer tool)
- **Complexity level**: Medium to high (sophisticated underlying architecture, simple exposed API)
- **Estimated architectural components**: ~8 major components (Event Store, Reasoning Engine, Action Engine, Policy Engine, Tool Registry, Trace Engine, Replay Engine, SDK API Layer)

### Technical Constraints & Dependencies

**Non-negotiable technical constraints (PRD):**

1. **Event log = single source of truth**: No "hidden" logic, everything is traceable and replayable
2. **Deny-by-default**: Tool, action, capability - everything must be explicitly authorized
3. **Stable and minimalist API**: Few but solid concepts, type-safe, documented, predictable
4. **Reasoning/action separation**: The LLM never directly causes a side effect
5. **Replay without the LLM**: Deterministic replay from events alone

**MVP technical stack:**

- TypeScript 5.x with strict mode
- Node.js 20+ (LTS)
- ESM and CommonJS support
- npm package (@sdk-ai-agents/core)
- Event store: in-memory + file (MVP)
- 1 LLM provider (OpenAI or Anthropic)

**Identified dependencies:**

- LLM provider (OpenAI or Anthropic) for the Reasoning Engine
- Zod or equivalent for schema validation (tool inputs)
- File system for event persistence (MVP)
- Potentially SQL for the production event store (post-MVP)

### Cross-Cutting Concerns Identified

**Cross-cutting concerns that will affect several components:**

1. **Event-Sourcing**: All components must emit structured events; the event log is the source of truth
2. **Security by Design**: Deny-by-default must be guaranteed architecturally, not optionally
3. **Observability**: Every decision, action, and constraint must be traceable
4. **Testability**: Architecture must allow trace-based tests (golden traces), replay for tests
5. **Versioning & Audit**: Traceability of agent and execution versions for compliance
6. **Performance**: Minimal overhead despite complete traceability (< 5-10ms)
7. **API Simplicity**: Internal complexity hidden behind a simple, intuitive API

### Unique Architectural Challenges

**Specific challenges identified:**

1. **Invisible event-sourcing**: Internal complexity (event-sourcing) hidden behind a simple API
2. **Guaranteed reasoning/action separation**: Architecture must guarantee that the LLM never directly causes a side effect
3. **Deterministic replay without the LLM**: Replay must work solely from persisted events
4. **Native governance**: Policies built into the runtime, not an optional plugin
5. **Performance with complete traceability**: Minimal overhead despite full event-sourcing

### Architectural Implications

**Estimated architectural components:**

- Event Store (in-memory + file persistence)
- Event Bus / Event Publisher (event distribution)
- Reasoning Engine (LLM integration, intention generation)
- Action Engine (governed tool execution)
- Policy Engine (policy validation & enforcement)
- Tool Registry (capability/tool management)
- Trace/Replay Engine (tracing, deterministic replay)
- SDK API Layer (simple facade hiding complexity)

**Required architectural patterns:**

- Event Sourcing (single source of truth)
- CQRS (reasoning/action separation)
- Strategy Pattern (LLM providers, event stores)
- Facade Pattern (simple API hiding internal complexity)
- Observer Pattern (tracing, events)
- Repository Pattern (data access abstraction)

---

## Core Architectural Decisions

### ADR-001: Event-Sourcing as the Single Source of Truth

**Status:** Accepted

**Context:**
Native replay and full audit are key differentiators of the SDK. To guarantee that every execution is replayable and traceable, we must store the complete history of each action.

**Decision:**
Adopt Event-Sourcing as a foundational architectural pattern. The event log is the single source of truth for all executions. No business logic modifies state without generating a corresponding event.

**Consequences:**
- ✅ Deterministic replay possible without the LLM
- ✅ Complete audit trail guaranteed
- ✅ Complete traceability of every decision
- ⚠️ Persistence overhead (mitigated by asynchronous writing)
- ⚠️ Increased internal complexity (hidden behind a simple API)

**Implementation:**
- Event Store with an abstract interface (allowing file → SQL → distributed)
- All components emit structured events
- Immutable event log (append-only)
- Simple projection for state reconstruction

---

### ADR-002: Reasoning/Action Separation (CQRS)

**Status:** Accepted

**Context:**
The SDK's fundamental principle is that "the LLM never causes a side effect." To structurally guarantee this property, we must clearly separate reasoning from action.

**Decision:**
Adopt a CQRS architecture with two distinct engines:
- **Reasoning Engine**: Integrates the LLM, generates structured intentions (Command)
- **Action Engine**: Validates and executes governed actions (Command Handler)

The LLM can never directly call a tool. All actions go through the Action Engine, which applies the policies.

**Consequences:**
- ✅ Security guaranteed by architecture (not by configuration)
- ✅ Native governance possible
- ✅ Complete reasoning → action traceability
- ⚠️ Slightly increased latency (mitigated by fast validation)
- ⚠️ Architectural complexity (hidden behind a simple API)

**Implementation:**
- Reasoning Engine: Interfaces with the LLM, generates a structured `Intention`
- Action Engine: Receives the `Intention`, validates it via the Policy Engine, executes it via the Tool Registry
- Communication via events (no direct calls)

---

### ADR-003: Structural Deny-by-Default

**Status:** Accepted

**Context:**
Security must be a structural property, not an optional feature. To guarantee that agents cannot perform unauthorized actions, we must implement deny-by-default at the architectural level.

**Decision:**
Everything is forbidden by default. A tool must be explicitly declared AND authorized in a policy to be usable. The Tool Registry maintains a strict allowlist. The Policy Engine checks every intention before execution.

**Consequences:**
- ✅ Security by impossibility (not by configuration)
- ✅ Drastic risk reduction
- ✅ Easier compliance
- ⚠️ Explicit configuration required (acceptable for security)

**Implementation:**
- Tool Registry: Strict allowlist, automatic rejection of undeclared tools
- Policy Engine: Mandatory check before each action
- Validation at the Action Engine level (last line of defense)

---

### ADR-004: Event Store Abstraction with Progressive Migration

**Status:** Accepted

**Context:**
The MVP requires a simple (file-based) event store, but production will require horizontal scalability. We must allow progressive migration without a rewrite.

**Decision:**
Create an abstract `EventStore` interface with multiple implementations:
- MVP: `FileEventStore` (in-memory + file persistence)
- Production: `SQLEventStore` (PostgreSQL/MySQL)
- Scale: `DistributedEventStore` (Kafka-style, post-MVP)

The interface guarantees compatibility and enables transparent migration.

**Consequences:**
- ✅ Simple, fast-to-implement MVP
- ✅ Progressive migration possible
- ✅ Future scalability guaranteed
- ⚠️ Additional abstraction (justified by flexibility)

**Implementation:**
- `IEventStore` interface with methods: `append()`, `getEvents()`, `getRunIds()`
- Concrete implementations: `FileEventStore`, `SQLEventStore` (future)
- Factory pattern for creation based on configuration

---

### ADR-005: Replay Without the LLM (Deterministic)

**Status:** Accepted

**Context:**
Replay is the MVP's killer feature. To be fast, economical, and deterministic, replay must not recontact the LLM.

**Decision:**
Replay uses only persisted events. The original intentions generated by the LLM are reused as-is. Replay reproduces the same logical sequence without an LLM call.

**Consequences:**
- ✅ Fast replay (< 100ms vs. several seconds)
- ✅ Economical replay (no LLM cost)
- ✅ Deterministic replay (same sequence)
- ⚠️ Replay does not test prompt changes (acceptable, this is a feature, not a bug)

**Implementation:**
- Replay Engine loads the runId's events
- Filters LLM intention events
- Reuses the intentions for execution via the Action Engine
- Generates new events with a "replay:" prefix

---

### ADR-006: API Facade Hiding Complexity

**Status:** Accepted

**Context:**
The internal architecture is sophisticated (event-sourcing, CQRS, engine separation), but the API must remain simple and intuitive (< 10 lines for Quick Start).

**Decision:**
Implement a Facade layer (SDK API Layer) that hides the internal complexity. The API exposes simple concepts (agent, tool, run) while the implementation handles events, policies, and engines behind the scenes.

**Consequences:**
- ✅ Simple, intuitive API
- ✅ Reduced learning curve
- ✅ Internal complexity isolated
- ⚠️ Additional abstraction layer (justified by DX)

**Implementation:**
- SDK API Layer: `createSDK()`, `createAgent()`, `defineTool()`, `agent.run()`
- Automatic mapping of API → internal events
- Smart default configuration

---

## Component Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SDK API Layer (Facade)                    │
│  createSDK() | createAgent() | defineTool() | agent.run()  │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│   Reasoning  │ │   Action    │ │  Policy    │
│   Engine     │ │   Engine    │ │  Engine    │
└───────┬──────┘ └──────┬──────┘ └─────┬──────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│ Tool Registry│ │ Event Store │ │ Trace/     │
│              │ │             │ │ Replay     │
│              │ │             │ │ Engine     │
└──────────────┘ └─────────────┘ └────────────┘
```

### Component Responsibilities

#### 1. SDK API Layer (Facade)

**Responsibilities:**
- Simple, intuitive public interface
- API → internal events mapping
- Smart default configuration
- SDK and agent lifecycle management

**Main interfaces:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
  addTools(tools: Tool[]): void
  setPolicy(policy: Policy): void
}
```

**Dependencies:**
- Reasoning Engine
- Action Engine
- Policy Engine
- Event Store
- Tool Registry

---

#### 2. Reasoning Engine

**Responsibilities:**
- Integration with the LLM provider (OpenAI/Anthropic)
- Generation of structured intentions from LLM responses
- Conversational context management
- Emission of reasoning events

**Interfaces:**
```typescript
interface ReasoningEngine {
  generateIntention(context: ReasoningContext): Promise<Intention>
  getReasoningEvents(runId: string): Event[]
}

interface Intention {
  type: 'tool_call' | 'final_answer' | 'continue'
  toolName?: string
  parameters?: Record<string, unknown>
  reasoning?: string
}
```

**Dependencies:**
- LLM Provider (Strategy Pattern)
- Event Store (event emission)
- Tool Registry (knowing available tools for context)

**Constraints:**
- Can never directly execute a tool
- Can never cause a side effect
- Generates only structured intentions

---

#### 3. Action Engine

**Responsibilities:**
- Reception and validation of intentions
- Execution of tools via the Tool Registry
- Application of policies via the Policy Engine
- Emission of action events

**Interfaces:**
```typescript
interface ActionEngine {
  executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult>
  validateIntention(intention: Intention): ValidationResult
}

interface ActionResult {
  success: boolean
  result?: unknown
  error?: Error
  events: Event[]
}
```

**Dependencies:**
- Policy Engine (validation)
- Tool Registry (execution)
- Event Store (event emission)

**Constraints:**
- Every action must go through the Action Engine
- Mandatory validation before execution
- Event emission for every action

---

#### 4. Policy Engine

**Responsibilities:**
- Validation of intentions against active policies
- Application of global and specific policies
- Checking budgets, timeouts, allowlists
- Emission of validation events

**Interfaces:**
```typescript
interface PolicyEngine {
  validate(intention: Intention, context: PolicyContext): PolicyValidationResult
  getActivePolicies(agentId: string): Policy[]
  applyGlobalPolicies(policies: Policy[]): void
}

interface Policy {
  id: string
  type: 'budget' | 'timeout' | 'allowlist' | 'custom'
  rules: PolicyRule[]
  scope: 'global' | 'agent'
}

interface PolicyValidationResult {
  allowed: boolean
  reason?: string
  violatedPolicies?: string[]
}
```

**Dependencies:**
- Event Store (emission of validation events)

**Constraints:**
- Deny-by-default: everything is forbidden unless explicitly authorized
- Mandatory check before each action

---

#### 5. Tool Registry

**Responsibilities:**
- Management of declared tools
- Validation of input schemas
- Execution of tools with validation
- Strict allowlist (deny-by-default)

**Interfaces:**
```typescript
interface ToolRegistry {
  registerTool(tool: ToolDefinition): void
  getTool(name: string): Tool | null
  executeTool(name: string, parameters: unknown): Promise<ToolResult>
  isToolAllowed(name: string, allowlist?: string[]): boolean
}

interface ToolDefinition {
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
}
```

**Dependencies:**
- Zod (schema validation)
- Event Store (emission of tool events)

**Constraints:**
- Automatic rejection of undeclared tools
- Mandatory validation before execution
- Strict allowlist

---

#### 6. Event Store

**Responsibilities:**
- Persistence of events (append-only)
- Retrieval of events by runId
- Filtering and querying events
- Abstraction for different implementations

**Interfaces:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  exportEventLog(runId: string): Promise<EventLog>
}

interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: EventData
}

type EventType = 
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'intention.generated'
  | 'intention.rejected'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'tool.called'
  | 'tool.failed'
```

**MVP implementations:**
- `FileEventStore`: In-memory + JSON file persistence
- Structure: `events/{runId}.json`

**Future implementations:**
- `SQLEventStore`: PostgreSQL/MySQL
- `DistributedEventStore`: Kafka-style (post-MVP)

---

#### 7. Trace/Replay Engine

**Responsibilities:**
- Building traces from events
- Deterministic replay without the LLM
- Run comparison (post-MVP)
- Trace export

**Interfaces:**
```typescript
interface TraceEngine {
  getTrace(runId: string): Promise<Trace>
  exportTrace(runId: string, format: 'json' | 'text'): Promise<string>
}

interface ReplayEngine {
  replay(runId: string, modifications?: ReplayModifications): Promise<RunResult>
  canReplay(runId: string): boolean
}

interface Trace {
  runId: string
  agentId: string
  status: RunStatus
  events: Event[]
  timeline: TimelineEntry[]
  summary: TraceSummary
}
```

**Dependencies:**
- Event Store (event reading)
- Action Engine (replay execution)

**Constraints:**
- Replay without an LLM call
- Relative determinism (same logical sequence)

---

## Data Models & Event Schema

### Core Domain Models

#### Agent Model
```typescript
interface Agent {
  id: string
  name: string
  model: LLMModel
  tools: Tool[]
  policies: Policy[]
  config: AgentConfig
  version: string
}

interface AgentConfig {
  maxSteps?: number
  timeout?: number
  temperature?: number
  systemPrompt?: string
}
```

#### Tool Model
```typescript
interface Tool {
  id: string
  name: string
  description: string
  schema: ZodSchema
  handler: ToolHandler
  version: string
  metadata?: ToolMetadata
}

interface ToolMetadata {
  category?: string
  riskLevel?: 'low' | 'medium' | 'high'
  requiresApproval?: boolean
}
```

#### Policy Model
```typescript
interface Policy {
  id: string
  type: PolicyType
  rules: PolicyRule[]
  scope: 'global' | 'agent'
  agentId?: string
  enabled: boolean
}

type PolicyType = 
  | 'budget'      // maxTokens, maxSteps
  | 'timeout'     // maxDuration
  | 'allowlist'   // allowedTools
  | 'custom'      // custom validation function

interface PolicyRule {
  condition: string
  action: 'allow' | 'deny' | 'require_approval'
  metadata?: Record<string, unknown>
}
```

#### Run Model
```typescript
interface Run {
  id: string
  agentId: string
  status: RunStatus
  input: RunInput
  output?: RunOutput
  startedAt: number
  completedAt?: number
  events: Event[]
  version: string
}

type RunStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface RunInput {
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}
```

### Event Schema

#### Event Base Structure
```typescript
interface Event {
  id: string                    // Unique UUID
  runId: string                 // Execution ID
  type: EventType              // Event type
  timestamp: number            // Unix timestamp (ms)
  data: EventData             // Type-specific data
  metadata?: EventMetadata     // Additional metadata
}

interface EventMetadata {
  agentId?: string
  agentVersion?: string
  userId?: string
  sessionId?: string
  [key: string]: unknown
}
```

#### Event Types & Data Structures

**Run Lifecycle Events:**
```typescript
type RunLifecycleEvent = 
  | { type: 'run.started', data: { input: RunInput } }
  | { type: 'run.completed', data: { output: RunOutput, duration: number } }
  | { type: 'run.failed', data: { error: Error, reason: string } }
  | { type: 'run.cancelled', data: { reason: string } }
```

**Reasoning Events:**
```typescript
type ReasoningEvent = 
  | { 
      type: 'intention.generated', 
      data: { 
        intention: Intention
        reasoning?: string
        alternatives?: Intention[]
      } 
    }
  | { 
      type: 'intention.rejected', 
      data: { 
        intention: Intention
        reason: string
        violatedPolicies?: string[]
      } 
    }
```

**Action Events:**
```typescript
type ActionEvent = 
  | { 
      type: 'action.executed', 
      data: { 
        toolName: string
        parameters: Record<string, unknown>
        result: unknown
        duration: number
      } 
    }
  | { 
      type: 'action.failed', 
      data: { 
        toolName: string
        parameters: Record<string, unknown>
        error: Error
      } 
    }
```

**Policy Events:**
```typescript
type PolicyEvent = 
  | { 
      type: 'policy.checked', 
      data: { 
        policyId: string
        intention: Intention
        result: PolicyValidationResult
      } 
    }
  | { 
      type: 'policy.violated', 
      data: { 
        policyId: string
        intention: Intention
        reason: string
      } 
    }
```

**Tool Events:**
```typescript
type ToolEvent = 
  | { 
      type: 'tool.called', 
      data: { 
        toolName: string
        parameters: Record<string, unknown>
        validated: boolean
      } 
    }
  | { 
      type: 'tool.failed', 
      data: { 
        toolName: string
        error: Error
        validationError?: boolean
      } 
    }
```

#### Event Log Structure
```typescript
interface EventLog {
  runId: string
  agentId: string
  version: string
  startedAt: number
  completedAt?: number
  status: RunStatus
  events: Event[]
  summary: {
    totalEvents: number
    intentionsGenerated: number
    actionsExecuted: number
    policiesChecked: number
    toolsCalled: number
  }
}
```

---

## API Design

### Public API Surface (MVP)

#### SDK Initialization
```typescript
function createSDK(config: SDKConfig): SDK

interface SDKConfig {
  apiKey: string                    // LLM provider API key
  provider?: 'openai' | 'anthropic'  // Default: 'openai'
  eventStore?: IEventStore           // Optional: custom event store
  defaultPolicies?: Policy[]         // Optional: global policies
}
```

#### Agent Creation
```typescript
function createAgent(config: AgentConfig): Agent

interface AgentConfig {
  name: string
  model: string                      // e.g., 'gpt-4', 'claude-3'
  systemPrompt?: string
  maxSteps?: number                 // Default: 10
  timeout?: number                  // Default: 30000ms
  tools?: Tool[]                    // Optional: tools to add
  policies?: Policy[]               // Optional: agent-specific policies
}
```

#### Tool Definition
```typescript
function defineTool(definition: ToolDefinition): Tool

interface ToolDefinition {
  name: string
  description: string
  schema: ZodSchema                  // Input validation schema
  handler: (params: unknown) => Promise<unknown>
  metadata?: ToolMetadata
}
```

#### Agent Execution
```typescript
interface Agent {
  run(input: RunInput): Promise<RunResult>
  addTools(tools: Tool[]): void
  setPolicy(policy: Policy): void
  stop(): Promise<void>
}

interface RunInput {
  message: string
  context?: Record<string, unknown>
}

interface RunResult {
  runId: string
  status: RunStatus
  output?: string
  error?: Error
  events?: Event[]                  // Optional: include events in result
}
```

#### Replay & Tracing
```typescript
interface SDK {
  replay(runId: string, modifications?: ReplayModifications): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  exportTrace(runId: string, format?: 'json' | 'text'): Promise<string>
}

interface ReplayModifications {
  input?: RunInput
  policies?: Policy[]
  tools?: Tool[]
}
```

#### Policies
```typescript
interface SDK {
  defineGlobalPolicy(policy: Policy): void
}

interface Policy {
  id: string
  type: PolicyType
  rules: PolicyRule[]
  enabled: boolean
}
```

### Quick Start Example
```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core'
import { z } from 'zod'

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY })

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b
      case 'subtract': return a - b
      case 'multiply': return a * b
      case 'divide': return a / b
    }
  }
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool]
})

const result = await agent.run({ message: 'What is 15 * 23?' })
console.log(result.output)

const trace = await sdk.getTrace(result.runId)
console.log(trace.events)

const replay = await sdk.replay(result.runId)
console.log(replay.output)
```

---

## Security Architecture

### Security Principles

1. **Deny-by-Default**: Everything is forbidden unless explicitly authorized
2. **Security by Impossibility**: The architecture guarantees security, not the configuration
3. **Multi-Level Validation**: Tool Registry → Policy Engine → Action Engine
4. **Complete Traceability**: Every action is traced and auditable

### Security Layers

#### Layer 1: Tool Registry (Allowlist)
- Only explicitly declared tools are available
- Automatic rejection of undeclared tools
- Schema validation before execution

#### Layer 2: Policy Engine (Governance)
- Policy checks before each action
- Budgets, timeouts, allowlists applied
- Rejection if a policy is violated

#### Layer 3: Action Engine (Execution)
- Last line of defense
- Final validation before execution
- Error isolation

### Threat Model

**Threats Mitigated:**
- ✅ Tool injection (schema validation)
- ✅ Unauthorized tool execution (allowlist + policies)
- ✅ Resource exhaustion (budgets + timeouts)
- ✅ Unauthorized actions (deny-by-default)
- ✅ Lack of auditability (event-sourcing)

**Threats Not Mitigated (Post-MVP):**
- ⚠️ LLM prompt injection (mitigation post-MVP)
- ⚠️ Tool handler vulnerabilities (developer's responsibility)
- ⚠️ Event store tampering (mitigation: signatures post-MVP)

---

## Performance & Scalability

### Performance Targets (MVP)

- **SDK Overhead**: < 5-10ms per event (excluding LLM/tools)
- **Replay Latency**: < 100ms for a complete execution
- **Event Persistence**: Asynchronous, non-blocking
- **Tool Execution**: No significant SDK overhead

### Scalability Strategy

#### MVP: File-Based Event Store
- **Limit**: ~1000 concurrent runs
- **Storage**: JSON files per runId
- **Performance**: Acceptable for MVP

#### Phase 2: SQL-Based Event Store
- **Limit**: ~10,000 concurrent runs
- **Storage**: PostgreSQL/MySQL
- **Migration**: Export/import from file-based

#### Phase 3: Distributed Event Store
- **Limit**: Unlimited (horizontal scalability)
- **Storage**: Kafka-style (Kafka, EventStore, etc.)
- **Migration**: From SQL with replication

### Optimization Strategies

1. **Async Event Persistence**: Non-blocking writes
2. **Event Batching**: Grouping events for writing
3. **Lazy Loading**: On-demand event loading
4. **Caching**: In-memory cache for frequent events
5. **Compression**: Compression of old events (post-MVP)

---

## Implementation Roadmap

### Phase 1: MVP Core (Weeks 1-4)
1. Event Store interface + FileEventStore
2. Event schema & types
3. Tool Registry with Zod validation
4. Basic Policy Engine
5. Reasoning Engine (OpenAI integration)
6. Action Engine
7. SDK API Layer (Facade)
8. Basic Replay Engine

### Phase 2: MVP Polish (Weeks 5-6)
1. Tracing & observability
2. Error handling & validation
3. Documentation & examples
4. Unit & integration tests
5. Performance optimization

### Phase 3: MVP Validation (Weeks 7-8)
1. Quick Start guide
2. Complete functional example
3. Early adopter feedback
4. Bug fixes & improvements

---

## Sequence Diagrams & Flow Design

### Flow 1: Agent Execution (Normal Flow)

```
User          SDK API      Reasoning    Action      Policy      Tool      Event
              Layer        Engine       Engine      Engine      Registry  Store
  |              |             |            |           |          |         |
  |--run()------>|             |            |           |          |         |
  |              |--start()--->|           |           |          |         |
  |              |             |           |           |          |         |
  |              |             |--emit---->|           |          |--append->
  |              |             |           |           |          |         |
  |              |             |--LLM()--->|           |          |         |
  |              |             |<--intent--|           |          |         |
  |              |             |--emit---->|           |          |--append->
  |              |             |           |           |          |         |
  |              |             |           |--validate>|          |         |
  |              |             |           |<--allowed-|          |         |
  |              |             |           |--emit---->|          |--append->
  |              |             |           |           |          |         |
  |              |             |           |--execute->|          |         |
  |              |             |           |           |          |--call()>
  |              |             |           |<--result--|          |         |
  |              |             |           |--emit---->|          |--append->
  |              |             |           |           |          |         |
  |              |             |--continue>|           |          |         |
  |              |             |... (loop) |           |          |         |
  |              |             |           |           |          |         |
  |              |             |--final()--|           |          |         |
  |              |             |--emit---->|           |          |--append->
  |              |<--complete--|           |           |          |         |
  |<--result-----|             |           |           |          |         |
```

### Flow 2: Policy Violation Flow

```
User          SDK API      Reasoning    Action      Policy      Event
              Layer        Engine       Engine      Engine      Store
  |              |             |            |           |         |
  |--run()------>|             |           |           |         |
  |              |--start()--->|           |           |         |
  |              |             |--LLM()--->|           |         |
  |              |             |<--intent-|           |         |
  |              |             |--emit---->|          |--append->
  |              |             |           |           |         |
  |              |             |           |--validate>|         |
  |              |             |           |           |--check()>
  |              |             |           |<--DENIED--|         |
  |              |             |           |--emit---->|--append->
  |              |             |           |           |         |
  |              |             |--retry()--|           |         |
  |              |             |... (loop) |           |         |
  |              |             |           |           |         |
  |              |<--failed----|           |           |         |
  |<--error------|             |           |           |         |
```

### Flow 3: Replay Flow

```
User          SDK API      Replay       Action      Event      Tool
              Layer        Engine       Engine      Store      Registry
  |              |             |            |          |          |
  |--replay()--->|             |           |          |          |
  |              |--load()--->|           |          |          |
  |              |             |--getEvents>|          |          |
  |              |             |<--events--|          |          |
  |              |             |           |          |          |
  |              |             |--filter()>|          |          |
  |              |             |           |          |          |
  |              |             |--replay()>|          |          |
  |              |             |           |          |          |
  |              |             |           |--execute>|          |
  |              |             |           |          |--call()>
  |              |             |           |<--result-|          |
  |              |             |           |--emit()>|          |
  |              |             |           |          |          |
  |              |             |... (loop) |          |          |
  |              |             |           |          |          |
  |              |<--complete--|           |          |          |
  |<--result-----|             |           |          |          |
```

---

## Error Handling Strategy

### Error Classification

#### 1. Validation Errors (400-level)
**Sources:** Tool Registry, Policy Engine, Input Validation
**Handling:**
- Immediate error, no execution
- `validation.failed` event emitted
- Clear, actionable error message

```typescript
class ValidationError extends SDKError {
  constructor(
    public field: string,
    public reason: string,
    public schema?: ZodSchema
  ) {
    super(`Validation failed: ${field} - ${reason}`, 'VALIDATION_ERROR')
  }
}
```

#### 2. Policy Violation Errors (403-level)
**Sources:** Policy Engine
**Handling:**
- Action blocked, intention rejected
- `policy.violated` event emitted
- Retry possible with a new intention

```typescript
class PolicyViolationError extends SDKError {
  constructor(
    public policyId: string,
    public intention: Intention,
    public reason: string
  ) {
    super(`Policy violation: ${policyId} - ${reason}`, 'POLICY_VIOLATION')
  }
}
```

#### 3. Tool Execution Errors (500-level)
**Sources:** Tool handlers
**Handling:**
- Error captured, `tool.failed` event emitted
- Run can continue or fail depending on configuration
- Retry possible depending on error type

```typescript
class ToolExecutionError extends SDKError {
  constructor(
    public toolName: string,
    public originalError: Error,
    public parameters: unknown
  ) {
    super(`Tool execution failed: ${toolName}`, 'TOOL_ERROR', originalError)
  }
}
```

#### 4. LLM Provider Errors (500-level)
**Sources:** Reasoning Engine, LLM Provider
**Handling:**
- Retry with exponential backoff
- `llm.error` event emitted
- Run fails if retries are exhausted

```typescript
class LLMProviderError extends SDKError {
  constructor(
    public provider: string,
    public originalError: Error,
    public retryable: boolean = true
  ) {
    super(`LLM provider error: ${provider}`, 'LLM_ERROR', originalError)
  }
}
```

#### 5. Event Store Errors (500-level)
**Sources:** Event Store persistence
**Handling:**
- Retry with backoff
- Run can continue if events are in memory
- Critical failure if persistence is impossible

```typescript
class EventStoreError extends SDKError {
  constructor(
    public operation: string,
    public originalError: Error
  ) {
    super(`Event store error: ${operation}`, 'EVENT_STORE_ERROR', originalError)
  }
}
```

### Error Recovery Strategies

#### Strategy 1: Fail-Fast (Validation Errors)
- Immediate error, no execution
- Used for: Input validation, invalid configuration

#### Strategy 2: Retry with Backoff (Transient Errors)
- Automatic retry with exponential backoff
- Used for: LLM provider errors, network errors
- Max retries: 3 by default

#### Strategy 3: Continue on Error (Tool Errors)
- Run continues despite a tool error
- Error event emitted
- Used for: Non-critical tool execution errors

#### Strategy 4: Fail Run (Critical Errors)
- Run fails immediately
- All events up to the error are persisted
- Used for: Critical policy violations, event store failures

### Error Event Schema

```typescript
interface ErrorEvent extends Event {
  type: 'error.occurred'
  data: {
    errorType: string
    errorMessage: string
    errorStack?: string
    context: {
      component: string
      operation: string
      [key: string]: unknown
    }
    recoverable: boolean
    retryCount?: number
  }
}
```

---

## Testing Strategy

### Testing Pyramid

#### Level 1: Unit Tests (70%)
**Scope:** Individual, isolated components
**Coverage Target:** > 80%

**Components to Test:**
- Tool Registry (validation, allowlist)
- Policy Engine (validation, enforcement)
- Event Store (persistence, retrieval)
- Replay Engine (replay logic)
- SDK API Layer (mapping, validation)

**Example:**
```typescript
describe('ToolRegistry', () => {
  it('should reject undeclared tools', () => {
    const registry = new ToolRegistry()
    expect(() => registry.executeTool('unknown')).toThrow()
  })
  
  it('should validate tool parameters', () => {
    const tool = defineTool({...})
    registry.registerTool(tool)
    expect(() => 
      registry.executeTool('tool', { invalid: 'params' })
    ).toThrow(ValidationError)
  })
})
```

#### Level 2: Integration Tests (20%)
**Scope:** Interactions between components
**Coverage Target:** > 60%

**Flows to Test:**
- Complete Reasoning → Action flow
- End-to-end policy enforcement
- Event emission and persistence
- Complete replay flow

**Example:**
```typescript
describe('Agent Execution Flow', () => {
  it('should execute agent with policy enforcement', async () => {
    const sdk = createSDK({...})
    const agent = sdk.createAgent({...})
    agent.setPolicy({ type: 'allowlist', rules: [...] })
    
    const result = await agent.run({ message: '...' })
    
    expect(result.status).toBe('completed')
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'policy.checked' })
    )
  })
})
```

#### Level 3: End-to-End Tests (10%)
**Scope:** Complete user scenarios
**Coverage Target:** Critical scenarios

**Scenarios:**
- Complete Quick Start flow
- Replay of a complete run
- Policy violation handling
- Error recovery

**Example:**
```typescript
describe('E2E: Quick Start', () => {
  it('should create agent, run, and replay', async () => {
    const sdk = createSDK({ apiKey: 'test' })
    const tool = defineTool({...})
    const agent = sdk.createAgent({ tools: [tool] })
    
    const run = await agent.run({ message: 'test' })
    expect(run.status).toBe('completed')
    
    const replay = await sdk.replay(run.runId)
    expect(replay.status).toBe('completed')
    expect(replay.output).toBe(run.output)
  })
})
```

### Test Utilities

#### Mock LLM Provider
```typescript
class MockLLMProvider implements LLMProvider {
  responses: Intention[] = []
  
  async generateIntention(context: ReasoningContext): Promise<Intention> {
    return this.responses.shift() || { type: 'final_answer', ... }
  }
  
  setResponse(intention: Intention): void {
    this.responses.push(intention)
  }
}
```

#### Mock Event Store
```typescript
class MockEventStore implements IEventStore {
  events: Map<string, Event[]> = new Map()
  
  async append(runId: string, event: Event): Promise<void> {
    if (!this.events.has(runId)) {
      this.events.set(runId, [])
    }
    this.events.get(runId)!.push(event)
  }
  
  async getEvents(runId: string): Promise<Event[]> {
    return this.events.get(runId) || []
  }
}
```

#### Golden Traces (Post-MVP)
```typescript
describe('Agent Behavior Regression', () => {
  it('should match golden trace', async () => {
    const result = await agent.run({ message: 'test' })
    const trace = await sdk.getTrace(result.runId)
    
    expect(trace).toMatchGoldenTrace('agent-test-v1.json')
  })
})
```

### Test Coverage Goals

- **Unit Tests:** > 80% coverage
- **Integration Tests:** All critical flows
- **E2E Tests:** Complete MVP scenarios
- **Performance Tests:** Latency, throughput (post-MVP)

---

## Operational Considerations

### Logging Strategy

#### Log Levels
- **DEBUG:** Detailed events, development
- **INFO:** Normal executions, important events
- **WARN:** Policy violations, retries
- **ERROR:** Critical errors, failures

#### Log Structure
```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  timestamp: number
  runId?: string
  agentId?: string
  component: string
  message: string
  data?: Record<string, unknown>
  error?: Error
}
```

#### Logging Implementation
- Console logging for development
- Structured logging (JSON) for production
- Log rotation for files
- Integration with external systems (post-MVP)

### Monitoring & Observability

#### Metrics to Track (MVP)
- Number of runs per agent
- Success/failure rate
- Average latency per run
- Number of events per run
- Policy violation rate
- Errors by type

#### Metrics to Track (Post-MVP)
- LLM cost per run
- Throughput (runs/second)
- Average event size
- Replay usage rate
- Event store performance

#### Health Checks
```typescript
interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  components: {
    eventStore: ComponentHealth
    llmProvider: ComponentHealth
    toolRegistry: ComponentHealth
  }
  metrics: SystemMetrics
}

interface ComponentHealth {
  status: 'up' | 'down'
  latency?: number
  errorRate?: number
}
```

### Deployment Considerations

#### MVP Deployment
- Standard npm package
- Installation via `npm install`
- No external dependencies (except the LLM provider)
- File-based event store (local)

#### Production Deployment (Post-MVP)
- SQL event store (optional)
- Configuration via environment variables
- Health checks endpoint
- Metrics export (Prometheus format)

### Backup & Recovery

#### Event Store Backup (MVP)
- Event files backed up manually
- JSON export for archiving
- No automatic backup (MVP)

#### Event Store Backup (Post-MVP)
- Automatic SQL backup
- Distributed event store replication
- Point-in-time recovery
- Archiving of old events

### Security Operations

#### Secrets Management
- LLM API keys: Environment variables
- No secrets in code
- Key rotation supported

#### Audit Trail
- All events are auditable
- Event log export for compliance
- Cryptographic signatures (post-MVP)

---

## Code Patterns & Best Practices

### Pattern 1: Event Emission Pattern

**All components must emit events for their actions:**

```typescript
class ActionEngine {
  constructor(private eventStore: IEventStore) {}
  
  async executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult> {
    // Emit event before the action
    await this.eventStore.append(context.runId, {
      id: generateId(),
      runId: context.runId,
      type: 'action.executing',
      timestamp: Date.now(),
      data: { intention }
    })
    
    try {
      const result = await this.executeTool(intention)
      
      // Emit success event
      await this.eventStore.append(context.runId, {
        id: generateId(),
        runId: context.runId,
        type: 'action.executed',
        timestamp: Date.now(),
        data: { intention, result }
      })
      
      return { success: true, result }
    } catch (error) {
      // Emit failure event
      await this.eventStore.append(context.runId, {
        id: generateId(),
        runId: context.runId,
        type: 'action.failed',
        timestamp: Date.now(),
        data: { intention, error: error.message }
      })
      
      throw error
    }
  }
}
```

### Pattern 2: Policy Enforcement Pattern

**Every action must go through the Policy Engine:**

```typescript
class ActionEngine {
  constructor(
    private policyEngine: PolicyEngine,
    private toolRegistry: ToolRegistry
  ) {}
  
  async executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult> {
    // Mandatory validation
    const validation = await this.policyEngine.validate(intention, context)
    
    if (!validation.allowed) {
      throw new PolicyViolationError(
        validation.violatedPolicies![0],
        intention,
        validation.reason!
      )
    }
    
    // Execution only if authorized
    return await this.toolRegistry.executeTool(intention.toolName!, intention.parameters)
  }
}
```

### Pattern 3: Deny-by-Default Pattern

**Tool Registry automatically rejects undeclared tools:**

```typescript
class ToolRegistry {
  private tools: Map<string, Tool> = new Map()
  
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }
  
  async executeTool(name: string, parameters: unknown): Promise<unknown> {
    // Deny-by-default: reject if the tool is not declared
    const tool = this.tools.get(name)
    if (!tool) {
      throw new ToolNotFoundError(`Tool "${name}" is not declared`)
    }
    
    // Schema validation
    const validated = tool.schema.parse(parameters)
    
    // Execution
    return await tool.handler(validated)
  }
}
```

### Pattern 4: Async Event Persistence

**Asynchronous persistence so as not to block execution:**

```typescript
class FileEventStore implements IEventStore {
  private pendingEvents: Event[] = []
  private flushInterval: NodeJS.Timeout
  
  constructor() {
    // Periodic flush (every 100ms or 10 events)
    this.flushInterval = setInterval(() => this.flush(), 100)
  }
  
  async append(runId: string, event: Event): Promise<void> {
    // Immediate in-memory addition
    this.pendingEvents.push(event)
    
    // Flush if threshold reached
    if (this.pendingEvents.length >= 10) {
      await this.flush()
    }
  }
  
  private async flush(): Promise<void> {
    if (this.pendingEvents.length === 0) return
    
    const events = [...this.pendingEvents]
    this.pendingEvents = []
    
    // Asynchronous (non-blocking) write
    await Promise.all(
      events.map(event => this.writeToFile(event))
    )
  }
}
```

### Pattern 5: Replay Deterministic Pattern

**Replay uses only events, not the LLM:**

```typescript
class ReplayEngine {
  async replay(runId: string): Promise<RunResult> {
    // Load original events
    const originalEvents = await this.eventStore.getEvents(runId)
    
    // Filter LLM intentions
    const intentions = originalEvents.filter(
      e => e.type === 'intention.generated'
    )
    
    // Replay with original intentions (no LLM)
    const newRunId = generateRunId()
    for (const intentionEvent of intentions) {
      const intention = intentionEvent.data.intention
      
      // Execute via Action Engine (without Reasoning Engine)
      await this.actionEngine.executeIntention(intention, {
        runId: newRunId,
        mode: 'replay'
      })
    }
    
    return { runId: newRunId, status: 'completed' }
  }
}
```

### Best Practices

1. **Always emit an event before/after a critical action**
2. **Multi-level validation: Tool Registry → Policy Engine → Action Engine**
3. **Explicit errors with context for debugging**
4. **Async/await for I/O operations (event store, LLM)**
5. **Strict type-safety with TypeScript**
6. **Smart default configuration**
7. **Error isolation (a failing tool does not fail the whole run)**

---

## Migration & Compatibility

### Versioning Strategy

#### Semantic Versioning
- **MAJOR:** Breaking changes to the public API
- **MINOR:** New backward-compatible features
- **PATCH:** Bug fixes, improvements

#### API Stability Promise
- **MVP → v1.0:** API may change (pre-release)
- **v1.0+:** Stable API, breaking changes only in MAJOR releases
- **Deprecation:** Deprecated features get a warning 2 versions before removal

### Migration Paths

#### File Event Store → SQL Event Store
```typescript
async function migrateToSQL(fileStore: FileEventStore, sqlStore: SQLEventStore): Promise<void> {
  const runIds = await fileStore.getRunIds()
  
  for (const runId of runIds) {
    const events = await fileStore.getEvents(runId)
    for (const event of events) {
      await sqlStore.append(runId, event)
    }
  }
}
```

#### Policy Format Migration
- Support for multiple policy formats
- Automatic conversion on load
- Format validation before application

### Backward Compatibility

#### Event Schema Evolution
- New fields are optional only
- Old events remain valid
- Automatic migration on read if necessary

#### API Compatibility
- Old API methods supported with deprecation warnings
- Migration guides provided
- Automatic migration tools (post-MVP)

---

## Open Questions & Future Considerations

### Open Questions (To Resolve During Implementation)

1. **Event Store File Format**: JSON vs. Binary? Compression?
2. **Error Recovery**: How to handle crashes during execution?
3. **Concurrent Runs**: Management of multiple simultaneous runs?
4. **Event Size Limits**: Limit on individual event size?

### Future Enhancements (Post-MVP)

1. **Cognitive Observability**: Reasoning graph, alternatives considered
2. **Multi-Agent Orchestration**: Coordination between agents
3. **Human Approval**: Approval workflow for critical actions
4. **Event Signing**: Cryptographic signatures for audit
5. **Distributed Tracing**: Integration with external observability systems

---

---

## Architecture Summary

### Key Architectural Principles

1. **Event-Sourcing First**: The event log is the single source of truth
2. **Security by Design**: Structural deny-by-default, not optional
3. **Separation of Concerns**: Reasoning Engine ≠ Action Engine
4. **Simplicity Through Abstraction**: Simple API hiding internal complexity
5. **Deterministic Replay**: Replay without the LLM for debugging and audit

### Component Interaction Summary

```
SDK API Layer (Facade)
    ↓
┌─────────────────────────────────────┐
│  Reasoning Engine → Intention        │
│  Policy Engine → Validation         │
│  Action Engine → Execution          │
│  Tool Registry → Tool Execution     │
└─────────────────────────────────────┘
    ↓
Event Store (Source of Truth)
    ↓
Trace/Replay Engine
```

### MVP Deliverables

**Core Components:**
- ✅ Event Store (File-based)
- ✅ Reasoning Engine (OpenAI)
- ✅ Action Engine
- ✅ Policy Engine
- ✅ Tool Registry
- ✅ SDK API Layer
- ✅ Replay Engine

**Key Features:**
- ✅ Agent execution with event-sourcing
- ✅ Controlled tool calling (deny-by-default)
- ✅ Simple but active policies
- ✅ Structured tracing
- ✅ Deterministic replay without the LLM
- ✅ Quick Start < 30 minutes

### Success Criteria

**Technical:**
- Functional replay: 100% of runs replayable
- SDK overhead: < 10ms per event
- Active policies: > 60% of projects with policies

**User Experience:**
- Time-to-first-agent: < 30 minutes
- Understandable tracing: > 80% of users understand traces
- Intuitive API: < 10 lines for Quick Start

### Next Steps

1. **Implementation Phase 1**: Event Store + Core Components
2. **Implementation Phase 2**: SDK API Layer + Integration
3. **Implementation Phase 3**: Replay Engine + Testing
4. **Validation Phase**: Early adopter feedback
5. **Iteration**: Refinement based on feedback

---

**Document Status:** Complete - Architecture fully documented, ready for implementation.

**Last Updated:** 2026-01-06
**Version:** 1.0
