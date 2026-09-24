# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| 选项 | 类型 | 说明 |
| --- | --- | --- |
| `apiKey` | `string` | 主提供商的密钥（使用 `llmProvider` 时不需要）。完全没有密钥时，工具和 MCP 服务器照常工作，需要模型的调用会失败并给出清晰的错误 |
| `provider` | `'openai' \| 'anthropic'` | 主提供商，默认 `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | 各提供商的 `apiKey` 和 `defaultModel` |
| `fallbackProviders` | `Array<{ provider, config? }>` | 主提供商失败时按顺序尝试 |
| `llmProvider` | `LLMProvider` | 你自己的提供商（本地模型、网关、测试替身） |
| `retry` | `Partial<RetryPolicy> \| false` | LLM 重试策略，按提供商分别应用，在回退之前 |
| `jev` | `JevClientConfig` | 为类型化决策启用 TypeSafe Jev——直接使用，或者通过 [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) 并设置 `baseUrl` 和 `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | 任何类型化决策后端（优先于 `jev`） |
| `pricing` | `PricingTable` | 每百万 token 的美元价格，合并到默认值之上 |
| `incidents` | `IncidentMonitorOptions` | 通知器、规则、严重级别阈值、节流 |
| `eventStore` | `IEventStore` | 默认为 `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | 全局策略 |
| `goldenTracesDir`、`regressionTestSuitesDir`、`assertionsDir`、`impactAnalysesDir` | `string` | 测试产物的存储位置 |

## 智能体 {#agents}

| 方法 | 返回值 | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | 受治理智能体：`run({ message, context?, signal? })`、`stop(runId?)`、`addTools()`、`setPolicy()`、`id`、`name`。它只能运行自己的工具（`tools`、`capabilities`），即使模型点名了 SDK 中注册的另一个工具；`signal` 用于取消运行 |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`、`stop(runId?)`、`learnFromFeedback(runId, feedback)`、`getProfile()`、`setProfile()` |
| `defineTool(definition)` | `Tool` | 注册一个工具；处理函数的类型根据其 Zod schema 推导 |
| `defineCapability(definition)` | `Capability` | 对工具分组 |
| `listTools()` | `Tool[]` | 所有已注册的工具 |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | 在智能体之外进行受治理的执行（MCP 服务器会用到）：参数、策略、审批、预算（在调用开始时计数），然后是工具本身。`signal` 会取消待处理的审批并传递给处理函数；`approvalTimeoutMs` 会取消一个无人决定的审批 |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | 把 `read()` 作为一次独立的运行来执行：`run.started`、`resource.read`（URI、大小、SHA-256）、`run.completed` 或 `run.failed` |
| `stopRun(runId)` | `Promise<void>` | 停止一次受治理或认知的运行 |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| 选项 | 默认值 | |
| --- | --- | --- |
| `name`、`model` | — | 必需 |
| `profile` | `DEFAULT_THINKER_PROFILE` | 智能体如何推理 |
| `tools`、`policies` | `[]` | 与其他地方一样受治理 |
| `systemPrompt` | — | 附加到每个 prompt 的额外指令 |
| `limits` | 参见[认知智能体](../guide/cognitive-agents#limits) | `maxSteps`、`timeoutMs`、`maxHypotheses`、`maxToolCalls`、`decisionThreshold`、`maxConsecutiveFailures`、`maxPredictionTests`、`preferenceWeight`、`minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`、`'typed'` 或一个 `CognitiveController` |
| `controllerOptions` | — | `minConfidence`（0.35）、`readinessThreshold`（0.8）、`fallback`、`model` |
| `assessment` | `'auto'` | `'llm'`、`'typed'` 或你自己的 `HypothesisAssessor`，用于 `compare` 操作 |
| `knowledge` | — | 跨运行记忆：`{ store, scope, recallLimit? (10), record? (true) }`，参见[跨运行记忆](../guide/memory) |
| `evaluator` | — | 一个检验预测的 `OutcomeEvaluator`；启用 `test_prediction` |
| `generator` | 基于 `model` 的 LLM 生成器 | 你自己的 `ThoughtGenerator`（包括观测比较）；它的思维仍然要经过引擎的准入规则 |
| `temperature`、`maxTokens` | `0.4`、— | 思维生成的设置 |
| `providerSettings` | — | 工具选择（原生推理引擎）的设置 |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }`——`status` 为 `completed`、`failed` 或 `cancelled`；`decision.status` 为 `committed`、`provisional` 或 `abstain`，`decision.missing` 列出尚未确立的内容；`state` 是最终的 `MentalState`。

### `OutcomeEvaluator` {#outcomeevaluator}

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

参见[证据与验证](../guide/evidence-and-verification)。

## 推理与画像 {#reasoning-profiles}

| 方法 | 返回值 |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>`——根据事件重建 |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>`——JSON Lines |

## 类型化决策——`sdk.decisions` {#typed-decisions-—-sdk-decisions}

没有配置后端时抛出 `ValidationError`。

| 方法 | 返回值 |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }`——答案的类型根据问题推断 |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

问题辅助函数：`noul(instructions, criteria?)`、`choice(instructions, options)`、`score(instructions, levels)`。

## 运维 {#operations}

| 方法 | 返回值 |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`、`rejectAction(...)`、`getPendingApprovals(runId?)` | 人工审批 |
| `getBudgetUsage(limit)`、`getPolicyAuditTrail(runId)` | 预算与策略审计 |

## 追踪记录、回放与测试 {#traces-replay-and-testing}

| 方法 | |
| --- | --- |
| `getTrace(runId)`、`exportTrace(runId, 'json' \| 'text')`、`getEvents(runId, filters?)` | 读取运行 |
| `replay(runId, modifications?)` | 不经过 LLM 重新执行 |
| `getReasoningGraph`、`exportReasoningGraph`、`getAlternatives`、`getDecisionPatterns`、`getTraceVisualization` | 理解决策 |
| `createGoldenTrace`、`getGoldenTraces`、`validateAgainstGoldenTrace`、`replayAndValidate`、`detectRegressions` | 像测试代码一样测试智能体 |

## 工具：`ToolDefinition` {#tools-tooldefinition}

| 字段 | |
| --- | --- |
| `name`、`description` | 模型看到的内容 |
| `schema` | 参数的 Zod schema；不匹配的调用会被拒绝 |
| `handler(params, context?)` | 接收经过验证的参数和 `{ runId, agentId, signal? }`——当调用方放弃时，`signal` 会被中止 |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }`——仅适用于幂等的工具；无效参数从不重试 |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }`——`requiresApproval: true` 会让每次调用都等待 `approveAction`；`readOnly` 会以 `readOnlyHint` 的形式展示给 MCP 客户端 |
| `inputJsonSchema` | 展示出来的 JSON Schema，用于替代根据 `schema` 推导出的那一个 |
| `capability`、`version` | 分组、版本 |

## 工具源 {#tool-sources}

每个函数都返回现成的 `ToolDefinition`：可以把它们传给 `sdk.defineTool`、传给一个智能体，或者直接传给 MCP 服务器的 `tools`。参见[把任何系统变成 MCP 服务器](../guide/mcp-recipes)。

| 函数 | 返回值 | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | 为一份 OpenAPI 3 描述中的每个操作生成一个工具；除非在 `include` 中列出，否则只包含 `GET`；其他方法默认需要审批。一次调用返回 `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | 针对一个文件夹的 `list_files`、`read_file`、`search_files`，从不越出该文件夹；被排除的文件夹会隐藏其中的一切 |
| `folderResources(options)` | `ResourceProvider` | 把同样的文件作为 MCP 资源 `folder://<name>/<path>` 提供 |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`、`describe_table`、`query`（一条只读语句，最多 `maxRows` 行，默认 100） |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | 用于 `node:sqlite` 的 `DatabaseSync` 或 `better-sqlite3`；在 `PRAGMA query_only = ON` 下运行查询 |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | 用于 `pg`（一个专用客户端，或一个连接池）；每条查询都在 `BEGIN READ ONLY`（在已经处于事务中的连接上会被拒绝）……`ROLLBACK` + `pg_advisory_unlock_all()` 中执行，并带有 `SET LOCAL statement_timeout`（默认 10 秒）；`schemas` 只限制列出和描述 |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`：`{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`；随调用方一起取消；除非设置了 `exposeErrors`，否则 `error` 是通用信息 |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | 数据库适配器所用的语句检查（仅支持 SQLite 和 PostgreSQL 语法） |

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

## MCP——`@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| 函数 | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | 一个 MCP `Server`，恰好暴露 `tools` 所列出的内容：已定义工具的名称和/或 `ToolDefinition`（会替你在 SDK 上定义；同一个定义可以再次传入，名称已被占用的另一个工具会被拒绝）。`resources`：一个或多个 `ResourceProvider`；每一次读取都会被追踪。调用以 `mcp:<name>`（或 `agentId`）的身份运行；在 `approvalTimeoutMs`（默认 50 000 毫秒）内无人决定的审批会被取消；对输入的拒绝会向客户端解释，其他原因只有在设置 `exposeErrorDetails` 时才会给出 |
| `serveMcpOverStdio(sdk, options)` | 同上，但连接到 stdin/stdout；向 stderr 写入一行“ready”，并在 stdin 结束时关闭（进行中的调用会被中止，待处理的审批会被取消）。`approvalTimeoutMs` 默认为 50 000，与 `createMcpServer` 相同 |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }`——任何 MCP 服务器的工具，以 `ToolDefinition` 的形式提供 |

`GovernedToolHost` 是服务器对 SDK 的需求（`listTools`、`defineTool`、`executeTool`、`traceResourceRead`）；`createSDK()` 返回的对象实现了它。

## 构建模块 {#building-blocks}

SDK 用到的一切都已导出，供自定义配置使用：`JevClient`、`DecisionService`、`LLMThoughtGenerator`、`HeuristicController`、`TypedDecisionController`、`TypedHypothesisAssessor`、`PredictionTester`、`applyThought`、`assembleThought`、`assessReadiness`、`rankHypotheses`、`rebuildMentalState`、`describeMentalState`、`fingerprint`、`defineThinkerProfile`、`refineProfile`、`withRetry`、`RetryingLLMProvider`、`MonitoredEventStore`、`EmailIncidentNotifier`、`WebhookIncidentNotifier`、`ResendEmailTransport`、`computeRunCost`、`FileEventStore`、`SQLiteEventStore`、`PostgreSQLEventStore`，以及所有类型。
