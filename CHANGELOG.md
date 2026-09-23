# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-23

### Added
- **Cognitive agents** (`sdk.createCognitiveAgent`, `agent.think`): explicit mental state (facts, assumptions, constraints, unknowns, hypotheses, contradictions, failures, confidence) improved by seven operations — represent, hypothesize, simulate, critique, seek information, compare, decide. Event-sourced thought patches, deterministic reducer with invariants, forced decision on the last step, timeout and cancellation.
- **Controllers**: deterministic heuristic controller and a typed-decision controller (Jev) with confidence gating and fallback; custom controllers through `CognitiveController`.
- **Thinker profiles**: versioned reasoning profiles rendered into every prompt, `distillThinkerProfile` from explained topics, `learnFromFeedback` with `match` / `partial` / `mismatch` verdicts, `exportControllerDataset` (JSON Lines).
- **Typed decisions**: `JevClient` for TypeSafe Jev (`POST /v1/systemone`) or any compatible backend, with question validation, answer validation, timeout, retries honoring `retry-after`; `sdk.decisions` with `ask`, `choose`, `selectMany`, `check`, `rate`.
- **MCP connectors** (`@sdk-ai-agents/core/mcp`): `createMcpServer` / `serveMcpOverStdio` expose governed tools, `connectMcpServer` imports tools from stdio, Streamable HTTP or custom transports.
- **API costs**: token usage recorded on LLM and typed-decision events, `sdk.getRunCost(runId)`, configurable pricing (Jev price included).
- **Retry policy**: `retry` option applied per provider before fallback (vendor client retries disabled to avoid stacking), OpenAI/Anthropic connection errors and timeouts recognized, `retry-after` / `retry-after-ms` honored up to `maxRetryAfterMs` (60 s, or `maxDelayMs` when a fallback provider can take over), per-tool `retry`, `provider.retry` and `tool.retry` events, exported `withRetry`.
- **Incident alerts**: `incidents` option, `MonitoredEventStore`, default rules, throttling, severity threshold, `EmailIncidentNotifier`, `ResendEmailTransport`, `WebhookIncidentNotifier` (JSON or Slack), `incident.reported` events, `sdk.getIncidents(runId)`.
- `llmProvider` option to inject any `LLMProvider`; `sdk.listTools()` and `sdk.executeTool()` for governed execution outside agents; `AgentImpl.id` and `AgentImpl.name`; `sdk.stopRun()` also stops cognitive runs.
- `ActionContext.allowedTools`: cognitive agents and the MCP server can only run the tools they were given, denied as `allowed-tools` policy violations before execution; replay applies the restriction recorded in `cognition.started` and, like the cognitive run itself, continues past denied or failing tools. Governed agents keep their existing behavior (documented). `createMcpServer` sends error causes to clients only with `exposeErrorDetails`.
- Guards in the cognitive loop: `maxHypotheses` enforced in code, reframing capped, failed operations not counted as done, limits validated, profile snapshotted per run, custom controllers that throw fall back to the heuristic.
- Documentation site (VitePress) with illustrations, published by the `Docs` workflow; README rewritten.

### Changed
- `defineTool` infers the handler parameters from the Zod schema; typed Choice answers are typed with the offered options.
- Costs include failed thought attempts and model calls per repair, and prices are looked up by the returned model id and by the requested model name.
- The run status is the last lifecycle event, so events appended after the end of a run do not reopen it.
- `FileEventStore` serializes flushes per run, takes the buffer before writing and writes atomically (temporary file + rename): overlapping flushes no longer duplicate or drop events. `getRunIds()` flushes buffered events first; `destroy()` returns a promise that resolves after the final flush. Mental-state rebuild, costs and datasets ignore events repeated with the same id.
- SQLite and PostgreSQL event stores are exported from the package entry.
- `apiKey` is optional when `llmProvider` is given; `pg` and `@modelcontextprotocol/sdk` are optional peer dependencies; `zod` (^3.25, zod 4 not supported yet) is a peer dependency. `createMcpServer` requires the explicit list of tools to expose. The Jev API key is kept in a private field.
- All documentation, planning artifacts and code comments are in English.

### Fixed
- Policy engine: built-in rules (`maxSteps`, `maxTokens`, `budgetLimit`, `maxDuration`, `allowedTools`) were read as missing fields by the generic condition evaluator and never applied — budget, timeout and allowlist policies now deny as documented.
- Regression detector: an event that became a failure (e.g. `action.executed` → `action.failed`) is now a critical regression.
- Trace validator: with `compareStructureOnly`, value differences are reported and give a `partial` status instead of a silent `pass`.
- Golden trace YAML export always quotes strings, so values like `true`, `null` or `123` keep their type.
- The package-level `defineTool` builds a tool without registering it in a hidden module-wide SDK (which also opened an event store on `./events`); the SDK registers it when an agent uses it.
- Approval workflow tests now drive a real agent run through an injected LLM provider instead of calling the OpenAI API with a fake key.
- Lint: 177 Biome errors in older modules fixed (`noStaticOnlyClass` turned off: the static utility classes are part of the tested API); sources formatted; CI uses a valid `npm run format:check`.

### Known issues
- The built-in OpenAI and Anthropic providers do not cancel a request already in flight: timeouts and stops apply between model calls.

## [0.1.0] - 2026-01-06

### Added
- **MVP Core Features**
  - Native event-sourcing with file persistence
  - Reasoning Engine with OpenAI integration
  - Action Engine with reasoning/action separation
  - Policy Engine with validation before every action
  - Tool Registry with deny-by-default
  - Replay Engine to replay executions without an LLM
  - SDK API Layer with a simple, intuitive interface

- **Agent Lifecycle**
  - Agent creation with minimal configuration
  - Agent execution with a controlled loop
  - Execution stop with AbortController
  - Active run management

- **Tool Management**
  - Tool definition with Zod validation
  - Tool Registry with allowlist
  - Tool versioning
  - Validation error handling

- **Capabilities System**
  - Capability creation to group tools
  - Auto-registration of tools in capabilities
  - Support in AgentConfig

- **Policies & Governance**
  - Global and per-agent policies
  - Budget (maxSteps, maxTokens)
  - Timeout
  - Tool allowlist
  - Custom policies

- **Tracing & Observability**
  - Structured traces with timeline
  - JSON and text export
  - Event filtering
  - Trace retrieval by runId

- **Replay**
  - Deterministic replay without an LLM
  - Replay with modifications (input, policies, tools)
  - Reproduction of the same action sequence

- **Versioning**
  - Agent versioning
  - Tool versioning
  - Capability versioning
  - Configuration hash (configHash)

- **Documentation**
  - Complete Quick Start guide
  - Key concepts documentation
  - Complete examples
  - README with installation and usage

- **Testing**
  - 74 passing unit tests
  - Integration tests
  - Performance tests (benchmarks)

### Security
- Deny-by-default for all tools
- Mandatory Zod validation for all inputs
- Policies applied structurally
- Full traceability of all actions

### Performance
- Optimized SDK overhead (< 10ms per event)
- Automatic event batching
- Fast SDK initialization

## [Unreleased]

### Planned
- Multi-provider LLM (Anthropic, etc.)
- SQL-based Event Store
- Advanced policies (human approval)
- Cognitive observability (reasoning graph)
- Performance optimizations
