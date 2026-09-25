# Architecture

![Architecture of the SDK](/images/architecture.svg){.illustration}

## Cognitive layer (v0.2)

Version 0.2 adds a reasoning layer on top of the governed runtime described below. It is built from small, replaceable parts:

| Part | Module | Responsibility |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | Run loop, cancellation, timeout, feedback |
| `OperationSelector` | `src/cognition/operation-selector.ts` | Computes available operations, asks the controller, forces the final decision |
| Controllers | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | Heuristic and Jev-backed choice of the next operation |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | Dispatches to the thought generator, the information seeker, the prediction tester or the assessor |
| Patch admission | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | Single entry of every thought: fields allowed per operation, engine-only fields, decision settlement |
| Evidence | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | Observation provenance, fact revisions, comparisons, test results, contradictions and their resolutions |
| State view | `src/cognition/mental-state-view.ts` | Compact view of the state for thought prompts and controller datasets: readiness, ranking, experiments already run |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | Runs your `OutcomeEvaluator` on a pending prediction and records the report |
| Conclusion guard | `src/cognition/decision-readiness.ts` | Ranking, readiness check, committed / provisional / abstain |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | One prompt per operation, strict JSON, Zod validation, one repair |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | Tool selection with the native reasoning engine, execution through the action engine |
| Reducer | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | Pure, deterministic application of thought patches with invariants, versioned by `schemaVersion` |
| Replay | `src/cognition/mental-state-replay.ts` | Mental state rebuild and controller dataset from events |
| Profiles | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | Profile schema, rendering, refinement, distillation |
| Assessors | `src/cognition/hypothesis-assessor.ts` | `compare` with typed decisions: evidence asked without the thinker, fit asked for proposals only |
| Recorder & factory | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | Event shapes of a cognitive run; assembly of an agent from its configuration and the SDK services |

Around it: `src/decisions` (typed decisions, Jev client, decision service), `src/costs` (pricing and run costs), `src/resilience` (retry policy and retrying provider), `src/incidents` (rules, notifiers, monitored event store), `src/mcp` (server and client, published as `@sdk-ai-agents/core/mcp`) and `src/study` (studies, which reuse the providers, the event store, governed tool execution and costs, but not the cognitive engine).

The rest of this page documents the governed runtime (v0.1).

## Executive Summary

SDK_AI_Agents follows an event-sourcing architecture with strict separation between reasoning and action. The SDK hides internal complexity behind a simple, intuitive API.

## Architecture Pattern

**Main Pattern:** Event-Sourcing with Separation of Concerns

- **Reasoning Engine**: Generates intentions from the LLM (no side effects)
- **Action Engine**: Executes intentions after validation
- **Policy Engine**: Validates intentions against policies
- **Event Store**: Single source of truth for all events

## Component Overview

### 1. SDK API Layer (Facade)

**Responsibilities:**
- Simple, intuitive public interface
- API → internal events mapping
- Smart default configuration
- SDK and agent lifecycle management

**Files:**
- `src/sdk.ts`: Main implementation (`SDKImpl`)
- `src/agent.ts`: Agent implementation (`AgentImpl`)
- `src/index.ts`: Public exports

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
}
```

### 2. Reasoning Engine

**Responsibilities:**
- Integration with the LLM provider (OpenAI/Anthropic)
- Generation of structured intentions from LLM responses
- Conversational context management
- Emission of reasoning events

**File:** `src/engines/reasoning-engine.ts`

**Constraints:**
- Can never directly execute a tool
- Can never cause a side effect
- Only generates structured intentions

**Dependencies:**
- LLM Provider (Strategy Pattern)
- Event Store (event emission)

### 3. Action Engine

**Responsibilities:**
- Receiving and validating intentions
- Executing tools via the Tool Registry
- Applying policies via the Policy Engine
- Emission of action events

**File:** `src/engines/action-engine.ts`

**Constraints:**
- Every action must go through the Action Engine
- Validation required before execution
- Event emitted for every action

**Dependencies:**
- Policy Engine (validation)
- Tool Registry (execution)
- Event Store (event emission)
- Approval Manager (optional)
- Budget Tracker (optional)

### 4. Policy Engine

**Responsibilities:**
- Validating intentions against active policies
- Applying global and specific policies
- Checking budgets, timeouts, allowlists
- Emission of validation events

**File:** `src/engines/policy-engine.ts`

**Constraints:**
- Deny-by-default: everything is forbidden unless explicitly authorized
- Mandatory check before every action

**Dependencies:**
- Event Store (validation event emission)
- Budget Tracker (optional)
- Condition Evaluator

### 5. Replay Engine

**Responsibilities:**
- Replaying executions from persisted events
- Deterministic replay without an LLM call
- Generation of new replay events

**File:** `src/engines/replay-engine.ts`

**Constraints:**
- Replay only uses persisted events
- No LLM call during replay
- Replay reproduces the same logical sequence

**Dependencies:**
- Event Store (event reading)
- Action Engine (intention execution)

### 6. Event Store

**Responsibilities:**
- Persisting events (append-only)
- Retrieving events by runId
- Filtering and querying events
- Abstraction for different implementations

**Files:**
- `src/stores/event-store.ts`: `IEventStore` interface
- `src/stores/file-event-store.ts`: File-based implementation
- `src/stores/sql-event-store.ts`: Generic SQL implementation
- `src/stores/sqlite-event-store.ts`: SQLite implementation
- `src/stores/postgresql-event-store.ts`: PostgreSQL implementation
- `src/stores/observed-event-store.ts`: delivers each appended event live to its listeners (`onEvent`, `sdk.subscribe`)

**Interface:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
  subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): EventSubscription
}
```

### 7. Tool Registry

**Responsibilities:**
- Managing declared tools
- Input schema validation (Zod)
- Executing tools with validation
- Strict allowlist (deny-by-default)

**File:** `src/registry/tool-registry.ts`

**Constraints:**
- Automatic rejection of undeclared tools
- Mandatory validation before execution
- Strict allowlist

**Dependencies:**
- Zod (schema validation)

### 8. Capability Registry

**Responsibilities:**
- Managing capabilities (tool groups)
- Tool ↔ capability association

**File:** `src/registry/capability-registry.ts`

### 9. LLM Provider Abstraction

**Responsibilities:**
- Abstracting differences between LLM providers
- Normalizing request/response formats
- Multi-provider support (OpenAI, Anthropic)
- Automatic fallback

**Files:**
- `src/providers/llm-provider.ts`: `LLMProvider` interface
- `src/providers/openai-provider.ts`: OpenAI implementation
- `src/providers/anthropic-provider.ts`: Anthropic implementation
- `src/providers/fallback-provider.ts`: Provider with fallback
- `src/providers/provider-factory.ts`: Factory for creating providers

**Interface:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. Manager Classes

**Responsibilities:**
- Managing advanced features
- Coordination between components

**Files:**
- `src/managers/approval-manager.ts`: Human approval management
- `src/managers/budget-tracker.ts`: Budget and usage tracking
- `src/managers/golden-trace-manager.ts`: Golden trace management
- `src/managers/regression-test-manager.ts`: Test suite management
- `src/managers/assertion-manager.ts`: Assertion management
- `src/managers/impact-analysis-manager.ts`: Impact analysis management

## Data Architecture

### Event Types

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated'
  | 'study.started'
  | 'study.passage_started'
  | 'study.passage_completed'
  | 'study.search'
  | 'study.model_called'
  | 'study.drift_rejected'
  | 'study.capability_demoted'
  | 'study.amendment_accepted'
  | 'study.amendment_refused'
  | 'study.result_recorded'
  | 'study.completed'
  | 'study.failed';
```

### Event Structure

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### Event Store Implementations

1. **FileEventStore** (MVP)
   - File-based persistence
   - One JSON file per runId
   - Automatic batch flushing

2. **SQLEventStore** (Production)
   - Generic SQL implementation
   - SQLite and PostgreSQL support
   - Indexes for performance

3. **PostgreSQLEventStore** (Advanced Production)
   - Uses JSONB for efficient storage
   - GIN indexes for JSON queries
   - Advanced query support

## API Design

### SDK Initialization

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Agent Creation

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Tool Definition

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Agent Execution

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Testing Strategy

### Unit Tests

- Unit tests for each module
- Uses Vitest
- Mocking of external dependencies

### Integration Tests

- Integration tests for complete workflows
- Tests with different event stores
- Replay tests

### Golden Traces

- Reference traces for regression tests
- Behavioral validation via replay
- Automatic regression detection

## Deployment Architecture

### Package Distribution

- **Package Name**: `@sdk-ai-agents/core`
- **Distribution**: npm
- **Entry Point**: `dist/index.js`
- **Type Definitions**: `dist/index.d.ts`

### Build Process

1. TypeScript compilation (`tsc`)
2. Source maps generated
3. Declaration files generated
4. Output in `dist/`

### Dependencies

**Runtime:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Peer Dependencies:**
- `pg`: ^8.11.0 (for PostgreSQLEventStore)

**Dev Dependencies:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Security Considerations

### Deny-by-Default

- All tools must be explicitly declared
- All actions must go through the Policy Engine
- Mandatory validation before execution

### Separation of Concerns

- Reasoning Engine cannot execute tools
- Action Engine validates before execution
- Policy Engine checks all actions

### Audit Trail

- All events are persisted
- Full traceability of decisions
- Policy audit trail

## Performance Considerations

### Event Store Performance

- FileEventStore: Batch flushing (10 events or 100ms)
- SQLEventStore: Indexes for fast queries
- PostgreSQLEventStore: JSONB + GIN indexes

### SDK Overhead

- Minimal overhead (< 5-10ms excluding LLM/tools)
- Asynchronous event emission
- Batch flushing for performance

## Future Considerations

### Scalability

- Migration to a distributed event store (Kafka-style)
- Multi-instance support
- Event store clustering

### Features

- Support for additional LLM providers
- Cloud event store (S3, etc.)
- Monitoring dashboard

