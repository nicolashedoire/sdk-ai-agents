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
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel` and `baseURL` of each vendor (`baseURL`: a compatible endpoint, such as the Azure OpenAI v1 API or a local model server, or a proxy). The primary uses its vendor's entry, and a fallback of another vendor uses its own vendor's entry. Default models: `gpt-5.4` and `claude-opus-5`. The OpenAI entry also takes `reasoningModels`, `reasoningEffort` and `nativeToolMessages`: see [OpenAI models](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Tried in order when the primary fails; a `config` overrides `providerConfig`. A fallback of the primary's vendor inherits none of the primary's settings (only the SDK-wide `apiKey`); one of another vendor needs its own key |
| `llmProvider` | `LLMProvider` | Your own provider (local model, gateway, test double). It gets tool calls and results in the native format (`LLMMessage`) if it declares `nativeToolMessages`, as plain text otherwise |
| `retry` | `Partial<RetryPolicy> \| false` | LLM retry policy, per provider, before fallback. Its `maxRetries` and `initialDelayMs` are also the defaults of `jev.maxRetries` and `jev.retryBaseDelayMs`; its other fields do not reach the Jev client, which keeps its own 2 retries and 500 ms with `retry: false`. Applied to an injected `llmProvider` only when set explicitly, and never to a `FallbackProvider` given as `llmProvider` or to its providers |
| `jev` | `JevClientConfig` | Enables TypeSafe Jev for typed decisions — directly, or through [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) with `baseUrl` and `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Any typed-decision backend (takes precedence over `jev`) |
| `pricing` | `PricingTable` | USD per million tokens, merged over defaults |
| `incidents` | `IncidentMonitorOptions` | Notifiers, rules, severity threshold, throttling |
| `eventStore` | `IEventStore` | Defaults to `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Global policies |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Storage of testing artifacts |

### OpenAI models

OpenAI reasoning models — the o-series (`o1`, `o3`, `o4-mini`…) and GPT-5 and later (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), also dated or fine-tuned (`ft:o4-mini-…`) — refuse `max_tokens`, and `temperature` unless their reasoning effort is `none`. The OpenAI provider recognizes them by name, whatever the letter case: it sends them `maxTokens` as `max_completion_tokens`, which also counts their reasoning tokens, and the reasoning effort. As the default effort varies by model, it never sends them a temperature: the temperature of the agent or of the engine is ignored for them. Other models get `temperature` and `max_tokens`, which every OpenAI-compatible server knows.

::: warning Tools and the reasoning effort
The SDK calls OpenAI through Chat Completions, where GPT-5.4 and later models call tools only with the effort `none`. The default model, `gpt-5.4`, uses `none` unless you set another effort. GPT-5.5, GPT-5.6 and GPT-6 Sol and Luna default to `medium`: an agent with tools fails on them (`Function tools with reasoning_effort are not supported`) unless you set `reasoningEffort: 'none'`. GPT-6 Astra cannot call tools through Chat Completions at all. The SDK sends the effort you set unchanged.
:::

| Option | Default | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Model of a request that names none, and of a fallback that does not serve the agent's model |
| `reasoningModels` | Detected from the name | `true` or `false`: every model of this provider is, or is not, a reasoning model. A list: these names are (Azure deployments, gateway aliases), the others are detected |
| `reasoningEffort` | The model's | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, sent as given to reasoning models only. Each model accepts some of these values, and the API refuses the others |
| `nativeToolMessages` | `true` | `false` for a compatible server that does not accept assistant `tool_calls` and `tool` messages in the conversation: earlier tool calls and results are then sent as plain text, while tools are still offered and the tool calls of replies still read. `false` on the primary or on any fallback applies to the whole chain |

These options go in `providerConfig.openai` or in the `config` of an OpenAI fallback. A fallback of another vendor takes each option its `config` does not set from `providerConfig.openai`; a fallback of the primary's vendor takes none. An agent or a run sets its own effort in `providerSettings.openai.reasoningEffort`: the run's wins, then the agent's, then the provider's. A cognitive agent applies it to tool selection only; its thoughts, which offer no tools, take its `reasoningEffort` option.

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

## Agents

| Method | Returns | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Governed agent: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. It can only run its own tools (`tools`, `capabilities`), even if the model names another tool registered in the SDK; `signal` cancels the run |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Registers a tool; the handler is typed from its Zod schema |
| `defineCapability(definition)` | `Capability` | Groups tools |
| `listTools()` | `Tool[]` | Every registered tool |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Governed execution outside an agent (used by the MCP server): arguments, policies, approval, budget (counted when the call starts), then the tool. `signal` cancels a pending approval and reaches the handler; `approvalTimeoutMs` cancels an approval nobody decided |
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
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Thought generation settings (`reasoningEffort`: OpenAI reasoning models only) |
| `providerSettings` | — | Settings for tool selection (native reasoning engine), `openai.reasoningEffort` included |

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
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — answers typed from the questions; no `usage` when the backend reported no token counts |
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

### `RunCostReport`

What `getRunCost(runId)` returns: the model calls of the run, failed steps included — see [API costs](../guide/costs).

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}
```

| Field | |
| --- | --- |
| `totalUsd` | Cost of the calls whose cost is known; only a lower bound when `complete` is `false` |
| `complete` | `false` when the cost of some calls is unknown: `unpricedCalls` or `unmeteredCalls` above 0 |
| `unpricedModels`, `unpricedCalls` | Models without a price in `pricing`, and their calls that reported their tokens |
| `unmeteredModels`, `unmeteredCalls` | Models of the calls that reported no input or output token counts, and those calls |
| `lines` | One per model and source: calls, tokens of the calls that reported them, `unmeteredCalls` when there are any, `costUsd` when the model has a price and some of the line's calls reported their tokens; `model` is `(unknown)` for a call that recorded no model name |

## Traces, replay and testing

| Method | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Read runs |
| `replay(runId, modifications?, { onEvent? })` | Re-execute without the LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Understand decisions |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Test agents like code |

## Live events

A listener is `(event: Event) => unknown`. It gets one event at a time, in the order of each run, once the store has accepted it; a promise it returns is awaited before its next event. Runs never wait for it, and its errors are reported, never thrown into the run. At most `maxQueued` events (10 000 by default) wait for it; past that, new ones are dropped for it and reported with a `LiveEventsDroppedError`. See [Live progress](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Every event of the run; `run()` resolves once the listener has settled on each of them, or earlier when the run was stopped or cancelled or `signal` aborts (the listener is then unsubscribed). The listener is not recorded |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | The same for a cognitive run, whose `limits.timeoutMs` also ends the wait |
| `replay(runId, modifications?, { onEvent })` | The same for a replay, which cannot be cancelled: it always waits |
| `executeTool(name, params, { onEvent })` | The events of the call, and of the runs its tool starts, one level deep: the handler gets the listener as `context.onEvent`, which `governedAgentTool` and `cognitiveAgentTool` pass to their agent (an agent built by hand on a store without live events runs without it). `signal` ends the wait |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: every event of every run that matches the filter (`agentId` is `metadata.agentId`), until you call the returned function, which drops the events not yet delivered |
| `new ObservedEventStore(store, { onListenerError? })` | The layer that delivers them; the SDK wraps its store in one, or uses the one you give as `eventStore`, also inside a `MonitoredEventStore` (whose incident reports are then delivered too). Its `subscribe(listener, options?)` returns `{ unsubscribe(), close() }`: `close()` waits until the listener has settled on the events it already took. `onListenerError` gets listener errors and drops |

## Tools: `ToolDefinition`

| Field | |
| --- | --- |
| `name`, `description` | What the model sees |
| `schema` | Zod schema of the arguments; calls that do not match are refused |
| `handler(params, context?)` | Receives the validated arguments and `{ runId, agentId, signal?, onEvent? }` — `signal` is aborted when the caller gives up; `onEvent` is set when the caller watches the call live: pass it as the `onEvent` of the runs the tool starts |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — idempotent tools only; invalid arguments are never retried |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` makes every call wait for `approveAction`; `readOnly` is shown to MCP clients as `readOnlyHint` |
| `inputJsonSchema` | JSON Schema shown instead of the one derived from `schema` |
| `capability`, `version` | Grouping, version |

## Tool sources

Each returns ready-made `ToolDefinition`s: pass them to `sdk.defineTool`, to an agent, or directly to an MCP server's `tools`. See [An MCP server for anything](../guide/mcp-recipes).

| Function | Returns | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | One tool per operation of an OpenAPI 3 description; only `GET` unless listed in `include`; other methods require approval by default. A call returns `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` over one folder, never outside it; an excluded folder hides all it holds |
| `folderResources(options)` | `ResourceProvider` | The same files as MCP resources `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (one read-only statement, at most `maxRows` rows, default 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | For `node:sqlite` `DatabaseSync` or `better-sqlite3`; runs queries with `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | For `pg` (a dedicated client, or a pool); each query in `BEGIN READ ONLY` (refused on a connection already inside a transaction) … `ROLLBACK` + `pg_advisory_unlock_all()`, with `SET LOCAL statement_timeout` (default 10 s); `schemas` limits listing and describing only |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; cancelled with the caller; `error` is generic unless `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | The statement check used by the database adapters (SQLite and PostgreSQL syntax only) |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | MCP `Server` exposing exactly what `tools` lists: names of defined tools and/or `ToolDefinition`s (defined on the SDK for you; the same definition may be passed again, another tool with a taken name is refused). `resources`: one or several `ResourceProvider`s; every read is traced. Calls run as `mcp:<name>` (or `agentId`); an approval nobody decides within `approvalTimeoutMs` (default 50 000 ms) is cancelled; input refusals are explained to the client, other causes only with `exposeErrorDetails`. A call with a `progressToken` gets a `notifications/progress` per event, all sent before the result ([progress notifications](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | Same, connected to stdin/stdout; writes one "ready" line to stderr, and closes when stdin ends (calls in progress are aborted, pending approvals cancelled). `approvalTimeoutMs` defaults to 50 000, as for `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — the tools of any MCP server, as `ToolDefinition`s |

`GovernedToolHost` is what the server needs from the SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` returns an object that implements it.

## Building blocks

The SDK's building blocks are exported for custom setups: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, and their main types.
