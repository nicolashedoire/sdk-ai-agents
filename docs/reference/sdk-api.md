# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig`

| Option | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | Key of the primary provider (not needed with `llmProvider`). Without any key, tools and MCP servers work and calls that need a model fail with a clear error |
| `provider` | `'openai' \| 'anthropic'` | Primary provider, default `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | Per-provider `apiKey` and `defaultModel` |
| `fallbackProviders` | `Array<{ provider, config? }>` | Tried in order when the primary fails |
| `llmProvider` | `LLMProvider` | Your own provider (local model, gateway, test double) |
| `retry` | `Partial<RetryPolicy> \| false` | LLM retry policy, per provider, before fallback |
| `jev` | `JevClientConfig` | Enables TypeSafe Jev for typed decisions — directly, or through [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) with `baseUrl` and `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Any typed-decision backend (takes precedence over `jev`) |
| `pricing` | `PricingTable` | USD per million tokens, merged over defaults |
| `incidents` | `IncidentMonitorOptions` | Notifiers, rules, severity threshold, throttling |
| `eventStore` | `IEventStore` | Defaults to `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Global policies |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Storage of testing artifacts |

## Agents

| Method | Returns | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Governed agent: `run(input)`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name` |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Registers a tool; the handler is typed from its Zod schema |
| `defineCapability(definition)` | `Capability` | Groups tools |
| `listTools()` | `Tool[]` | Every registered tool |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal? })` | `Promise<unknown>` | Governed execution outside an agent (used by the MCP server). `signal` cancels a pending approval and reaches the handler |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Runs `read()` as its own run: `run.started`, `resource.read` (URI, size, SHA-256), `run.completed` or `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Stops a governed or cognitive run |

### `CognitiveAgentConfig`

| Option | Default | |
| --- | --- | --- |
| `name`, `model` | — | Required |
| `profile` | `DEFAULT_THINKER_PROFILE` | How the agent reasons |
| `tools`, `policies` | `[]` | Governed like everywhere else |
| `systemPrompt` | — | Extra instructions for every prompt |
| `limits` | see [Cognitive agents](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` or a `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` or your own `HypothesisAssessor` for the `compare` operation |
| `knowledge` | — | Memory across runs: `{ store, scope, recallLimit? (10), record? (true) }`, see [Memory across runs](../guide/memory) |
| `evaluator` | — | An `OutcomeEvaluator` that tests predictions; enables `test_prediction` |
| `generator` | LLM generator on `model` | Your own `ThoughtGenerator` (observation comparisons included); its thoughts still go through the engine's admission rules |
| `temperature`, `maxTokens` | `0.4`, — | Thought generation settings |
| `providerSettings` | — | Settings for tool selection (native reasoning engine) |

### `CognitiveRunResult`

`{ runId, status, answer?, decision?, state, error? }` — `status` is `completed`, `failed` or `cancelled`; `decision.status` is `committed`, `provisional` or `abstain`, with `decision.missing` listing what is not established; `state` is the final `MentalState`.

### `OutcomeEvaluator`

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

See [Evidence & verification](../guide/evidence-and-verification).

## Reasoning & profiles

| Method | Returns |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — rebuilt from events |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Typed decisions — `sdk.decisions`

Throws a `ValidationError` when no backend is configured.

| Method | Returns |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — answers typed from the questions |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Question helpers: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Operations

| Method | Returns |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Human approvals |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets and policy audit |

## Traces, replay and testing

| Method | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Read runs |
| `replay(runId, modifications?)` | Re-execute without the LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Understand decisions |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Test agents like code |

## Tools: `ToolDefinition`

| Field | |
| --- | --- |
| `name`, `description` | What the model sees |
| `schema` | Zod schema of the arguments; calls that do not match are refused |
| `handler(params, context?)` | Receives the validated arguments and `{ runId, agentId, signal? }` — `signal` is aborted when the caller gives up |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` makes every call wait for `approveAction`; `readOnly` is shown to MCP clients as `readOnlyHint` |
| `inputJsonSchema` | JSON Schema shown instead of the one derived from `schema` |
| `retry`, `capability`, `version` | Retries (idempotent tools only), grouping, version |

## Tool sources

Each returns ready-made `ToolDefinition`s: pass them to `sdk.defineTool`, to an agent, or directly to an MCP server's `tools`. See [An MCP server for anything](../guide/mcp-recipes).

| Function | Returns | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | One tool per operation of an OpenAPI 3 description; only `GET` unless listed in `include`; other methods require approval by default. A call returns `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` over one folder, never outside it |
| `folderResources(options)` | `ResourceProvider` | The same files as MCP resources `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (one read-only statement, at most `maxRows` rows, default 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | For `node:sqlite` `DatabaseSync` or `better-sqlite3`; runs queries with `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | For `pg`; each query in `BEGIN READ ONLY` … `ROLLBACK` with `SET LOCAL statement_timeout` (default 10 s) |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; cancelled with the caller |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | The statement check used by the database adapters, for your own `ReadOnlyDatabase` |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself. */
  query(sql: string, options: { maxRows: number }): Promise<{ columns: string[]; rows: unknown[]; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

## MCP — `@sdk-ai-agents/core/mcp`

| Function | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, exposeErrorDetails? })` | MCP `Server` exposing exactly what `tools` lists: names of defined tools and/or `ToolDefinition`s (defined on the SDK for you; the same definition may be passed again, another tool with a taken name is refused). `resources`: one or several `ResourceProvider`s; every read is traced. Calls run as `mcp:<name>` (or `agentId`); input refusals are explained to the client, other causes only with `exposeErrorDetails` |
| `serveMcpOverStdio(sdk, options)` | Same, connected to stdin/stdout; writes one "ready" line to stderr |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — the tools of any MCP server, as `ToolDefinition`s |

`GovernedToolHost` is what the server needs from the SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` returns an object that implements it.

## Building blocks

Everything the SDK uses is exported for custom setups: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, and all the types.
