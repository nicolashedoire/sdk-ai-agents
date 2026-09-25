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
| `providerConfig` | `{ openai?, anthropic? }` | 各厂商的 `apiKey`、`defaultModel`、`baseURL` 和 `timeout`（`baseURL`：兼容的端点，例如 Azure OpenAI 的 v1 API 或本地模型服务器，或代理；`timeout`：等待回答的最长时间，单位为毫秒，默认 10 分钟；对于流式输出的回答，则是它的两个事件之间的最长等待时间）。主提供商使用其厂商的条目，其他厂商的回退使用它自己厂商的条目。默认模型：`gpt-5.4` 和 `claude-opus-5`。OpenAI 条目还接受 `reasoningModels`、`reasoningEffort`、`nativeToolMessages` 和 `includeStreamUsage`，参见 [OpenAI 模型](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | 主提供商失败时按顺序尝试；`config` 优先于 `providerConfig`。与主提供商同一厂商的回退不继承主提供商的任何设置（只继承全局 `apiKey`）；其他厂商的回退需要自己的密钥 |
| `llmProvider` | `LLMProvider` | 你自己的提供商（本地模型、网关、测试替身）。如果它声明了 `nativeToolMessages`，就以原生格式（`LLMMessage`）接收工具调用及其结果，否则以文本形式接收，并且可以流式输出它的文本（参见 [`LLMProvider`](#llmprovider)） |
| `retry` | `Partial<RetryPolicy> \| false` | LLM 重试策略，按提供商分别应用，在回退之前。其 `maxRetries` 和 `initialDelayMs` 也是 `jev.maxRetries` 和 `jev.retryBaseDelayMs` 的默认值；其他字段不会传给 Jev 客户端，设为 `retry: false` 时，Jev 客户端保留自己的 2 次重试和 500 ms。仅在显式设置时才应用于注入的 `llmProvider`，且从不应用于作为 `llmProvider` 传入的 `FallbackProvider` 及其内部的提供商 |
| `jev` | `JevClientConfig` | 为类型化决策启用 TypeSafe Jev——直接使用，或者通过 [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) 并设置 `baseUrl` 和 `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | 任何类型化决策后端（优先于 `jev`） |
| `pricing` | `PricingTable` | 每百万 token 的美元价格，合并到默认值之上 |
| `incidents` | `IncidentMonitorOptions` | 通知器、规则、严重级别阈值、节流 |
| `eventStore` | `IEventStore` | 默认为 `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | 全局策略 |
| `goldenTracesDir`、`regressionTestSuitesDir`、`assertionsDir`、`impactAnalysesDir` | `string` | 测试产物的存储位置 |

### OpenAI 模型 {#openai-models}

OpenAI 的推理模型——o 系列（`o1`、`o3`、`o4-mini`…）以及 GPT-5 及之后的模型（`gpt-5`、`gpt-5.4-mini`、`gpt-6-sol`…），包括带日期或经过微调的版本（`ft:o4-mini-…`）——会拒绝 `max_tokens`，并且除非推理强度为 `none`，也会拒绝 `temperature`。OpenAI 提供商按名称识别它们，不区分大小写：把 `maxTokens` 作为 `max_completion_tokens` 发送（其中也计入推理 token），并发送推理强度。由于默认推理强度因模型而异，它从不向这些模型发送温度：智能体或引擎的温度对它们无效。其他模型收到的是 `temperature` 和 `max_tokens`，所有兼容 OpenAI 的服务器都认识它们。

::: warning 工具与推理强度
SDK 通过 Chat Completions 调用 OpenAI，而在 Chat Completions 中，GPT-5.4 及之后的模型只有在推理强度为 `none` 时才会调用工具。默认模型 `gpt-5.4` 在你不设置其他推理强度时使用 `none`。GPT-5.5、GPT-5.6 以及 GPT-6 Sol 和 Luna 默认为 `medium`：除非设置 `reasoningEffort: 'none'`，带工具的智能体在这些模型上会失败（`Function tools with reasoning_effort are not supported`）。GPT-6 Astra 完全无法通过 Chat Completions 调用工具。SDK 会原样发送你设置的推理强度。
:::

| 选项 | 默认值 | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | 未指定模型的请求所用的模型，以及不支持智能体模型的回退所用的模型 |
| `reasoningModels` | 按名称识别 | `true` 或 `false`：此提供商的所有模型都是（或都不是）推理模型。列表：列出的名称是推理模型（Azure 部署、网关别名），其他名称按名称识别 |
| `reasoningEffort` | 模型自身的默认值 | `none`、`minimal`、`low`、`medium`、`high`、`xhigh` 或 `max`，只原样发送给推理模型。每个模型只接受其中部分值，API 会拒绝其余的值 |
| `includeStreamUsage` | 在 OpenAI 自己的 API 上启用 | `true`：为流式输出的回答请求其用量（`stream_options`），从而计入它的成本；`false`：不请求。默认在 `https://api.openai.com/v1` 以及 `https://eu.api.openai.com/v1` 等区域主机上启用（根据 `baseURL` 或 `OPENAI_BASE_URL` 判断），因为兼容的服务器可能会拒绝该字段（此时请求会去掉它重新发送，但 OpenAI 自己的 API 接受该字段，不会重新发送）或忽略它，而没有用量的流式调用按未计量处理。在会报告用量的兼容服务器（Azure OpenAI 的 v1 API 就会报告）上使用费用预算时，应设为 `true` |
| `nativeToolMessages` | `true` | 对于不接受对话中的助手 `tool_calls` 和 `tool` 消息的兼容服务器，设为 `false`：之前的工具调用及其结果将以文本形式发送，而工具仍会提供，回复中的工具调用也仍会读取。在主提供商或任一回退上设为 `false`，都会作用于整条链 |

这些选项写在 `providerConfig.openai` 中，或写在 OpenAI 回退的 `config` 中。其他厂商的回退会从 `providerConfig.openai` 获取其 `config` 未设置的每个选项；与主提供商同一厂商的回退则一个也不获取。智能体或运行可以在 `providerSettings.openai.reasoningEffort` 中设置自己的推理强度：运行的设置优先，其次是智能体的，最后是提供商的。认知智能体只把它用于工具选择；它的思维不提供工具，使用它的 `reasoningEffort` 选项。

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

### `LLMProvider` {#llmprovider}

你自己的提供商需要实现 `generateCompletion(request)`、`supportsModel(model)` 和 `getProviderName()`，并且可以声明 `nativeToolMessages`。请求中有两个字段与流式输出有关：

| `LLMRequest` 字段 | |
| --- | --- |
| `onTextDelta?(delta)` | 当调用方希望在文本写出的同时就收到它（使用 `onText` 的运行）时设置。每收到一段文本，就用这段文本调用它，然后照常返回完整的 `LLMResponse`：各段拼接起来必须正好是它的 `content`。无法流式输出的提供商会忽略它，由 SDK 把整个 `content` 一次性传递出去。它不得抛出异常（SDK 自己设置的从不抛出） |
| `onTextRestart?()` | 在一次已经流式输出过文本的尝试之后再次尝试时（你自己的重试）调用它：那段文本作废，接下来的各段会从头开始写出回答。`RetryingLLMProvider` 和 `FallbackProvider` 会为它们包装的提供商调用它 |

## 智能体 {#agents}

| 方法 | 返回值 | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | 受治理智能体：`run({ message, context?, signal?, onText?, onTextRestart? })`、`stop(runId?)`、`addTools()`、`setPolicy()`、`id`、`name`、`version`、`configHash`。它只能运行自己的工具（`tools`、`capabilities`），即使模型点名了 SDK 中注册的另一个工具；`signal` 用于取消运行；`onText` 在模型写出文本的同时接收这些文本，`onTextRestart` 则在失败的模型调用被再次尝试时接收需要丢弃的部分（参见[流式输出回答](../guide/governed-agents#_7-streaming-the-answer)） |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`、`stop(runId?)`、`learnFromFeedback(runId, feedback)`、`getProfile()`、`setProfile()`。它的思维是结构化的，不进行流式输出 |
| `defineTool(definition)` | `Tool` | 注册一个工具；处理函数的类型根据其 Zod schema 推导 |
| `defineCapability(definition)` | `Capability` | 对工具分组 |
| `listTools()` | `Tool[]` | 所有已注册的工具 |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | 在智能体之外进行受治理的执行（MCP 服务器会用到）：参数、策略、审批、预算（在调用开始时计数），然后是工具本身。`signal` 会取消待处理的审批并传递给处理函数；`approvalTimeoutMs` 会取消一个无人决定的审批 |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | 把 `read()` 作为一次独立的运行来执行：`run.started`、`resource.read`（URI、大小、SHA-256）、`run.completed` 或 `run.failed` |
| `stopRun(runId)` | `Promise<void>` | 停止一次受治理或认知的运行 |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| 选项 | 默认值 | |
| --- | --- | --- |
| `name`、`model` | — | 必需 |
| `profile` | `DEFAULT_THINKER_PROFILE` | 智能体如何推理 |
| `tools`、`policies` | `[]` | 与其他地方一样受治理；预算和超时策略还会在每一步之前检查，参见[限制与策略](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | 附加到每个 prompt 的额外指令 |
| `limits` | 参见[认知智能体](../guide/cognitive-agents#limits) | `maxSteps`、`timeoutMs`、`maxHypotheses`、`maxToolCalls`、`decisionThreshold`、`maxConsecutiveFailures`、`maxPredictionTests`、`preferenceWeight`、`minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`、`'typed'` 或一个 `CognitiveController` |
| `controllerOptions` | — | `minConfidence`（0.35）、`readinessThreshold`（0.8）、`fallback`、`model` |
| `assessment` | `'auto'` | `'llm'`、`'typed'` 或你自己的 `HypothesisAssessor`，用于 `compare` 操作 |
| `knowledge` | — | 跨运行记忆：`{ store, scope, recallLimit? (10), record? (true) }`，参见[跨运行记忆](../guide/memory) |
| `evaluator` | — | 一个检验预测的 `OutcomeEvaluator`；启用 `test_prediction` |
| `generator` | 基于 `model` 的 LLM 生成器 | 你自己的 `ThoughtGenerator`（包括观测比较）；它的思维仍然要经过引擎的准入规则 |
| `temperature`、`maxTokens`、`reasoningEffort` | `0.4`、—、— | 思维生成的设置（`reasoningEffort`：仅限 OpenAI 推理模型） |
| `providerSettings` | — | 工具选择（原生推理引擎）的设置，包括 `openai.reasoningEffort` |

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
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }`——答案的类型根据问题推断；后端没有报告 token 数时没有 `usage` |
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

### `RunCostReport` {#runcostreport}

`getRunCost(runId)` 的返回值：运行中的模型调用，包括失败的步骤——参见 [API 成本](../guide/costs)。

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
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| 字段 | |
| --- | --- |
| `totalUsd` | 成本已知的调用的成本；当 `complete` 为 `false` 时只是一个下限 |
| `complete` | 当部分调用的成本未知，即 `unpricedCalls` 或 `unmeteredCalls` 大于 0 时为 `false` |
| `unpricedModels`、`unpricedCalls` | 在 `pricing` 中没有价格的模型，以及它们报告了 token 数的调用 |
| `unmeteredModels`、`unmeteredCalls` | 没有同时报告输入和输出 token 数的调用所用的模型，以及这些调用 |
| `lines` | 每个模型、所请求的模型和来源一行：调用次数、已计量调用的 token 数、存在时的 `unmeteredCalls`、这些调用的 token 数 `unmeteredTokens`、模型有价格且该行有已计量调用时的 `costUsd`；没有记录模型名的调用，其 `model` 为 `(unknown)` |

## 追踪记录、回放与测试 {#traces-replay-and-testing}

| 方法 | |
| --- | --- |
| `getTrace(runId)`、`exportTrace(runId, 'json' \| 'text')`、`getEvents(runId, filters?)` | 读取运行 |
| `replay(runId, modifications?, { onEvent? })` | 不经过 LLM 重新执行 |
| `getReasoningGraph`、`exportReasoningGraph`、`getAlternatives`、`getDecisionPatterns`、`getTraceVisualization` | 理解决策 |

### 黄金追踪记录 {#golden-traces}

| 方法 | 返回值 | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | 把一次运行保存为参照，并记下完成这次运行的受治理智能体的名称（`agentName`） |
| `getGoldenTraces(agent?)`、`getGoldenTrace(id)`、`deleteGoldenTrace(id)`、`exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`：智能体的 id 或名称 |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`、`fail` 或 `partial`，并给出每处差异（`event_added`、`event_removed`、`event_modified`、`event_order_changed`）及其位置 |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | 把同样的差异作为回归返回，每个回归带有严重程度和影响：`no_regression` 或 `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | 回放这次运行，再验证回放。回放不调用任何模型：请用 `validateAspects: ['tools', 'policies']` 来比较 |

运行按照**事件的含义**来比较，从不按事件 id 比较（每次运行的 id 都是新的）。事件依次配对：先是完全相同的事件，然后是类型和对象（工具、操作、回答）相同但数据改变的事件，最后是对象相同但类型改变的事件。从不比较的内容：事件 id、时间、元数据、`incident.reported` 事件（它们记录通知的发送和限流；引发事故的那个事件本身会被比较），以及由 SDK 写入、每次运行都会变化的值：工具调用的耗时、token 用量、重试前的等待时间、审批 id、回放所来自的运行、观察的时间和来源事件。模型在工具调用旁边写下的文字只在 `intention.generated` 中比较。工具的参数、结果和输入总是会被比较，无论其键名是什么：从 30 变成 60 的 `duration` 参数就是一处改变。再次做同样事情的运行会通过；用别的参数调用的工具会在调用发生的位置被报告（`parameters.metric: "churn" → "revenue"`）；插在一次相同调用之前的调用算作一次新增的调用；从 `action.executed` 变成 `action.failed` 算作一处改变，而不是一次丢失加一次新增。

| 选项 | 用于 | |
| --- | --- | --- |
| `ignoreEventTypes`、`validateAspects`（`intentions`、`actions`、`tools`、`policies`） | 验证 | 比较更少的事件 |
| `tolerance.dataFields` | 验证 | 在任意层级再排除一些数据字段 |
| `tolerance.timestampMs`、`ignoreTimestampDiff` | 验证 | 只有设置了 `timestampMs` 才比较时间，且以每次运行的开始为基准 |
| `compareStructureOnly` | 验证 | 数据差异得到 `partial`，而不是 `fail`；新增、删除、移动或类型改变的事件仍然失败 |
| `tolerance.ignoreEventTypes`、`tolerance.ignoreDataFields` | 回归 | 比较更少的事件，排除一些数据字段 |
| `tolerance.criticalEventTypes` | 回归 | 出现、丢失或改变即为严重的类型（默认：`run.failed`、`action.failed`、`tool.failed`、`policy.violated`） |
| `tolerance.maxEventCountDiff` | 回归 | 最多容忍这么多新增或删除的流程事件（策略检查、重试、审批）；结果的改变从不被容忍 |
| `tolerance.maxDurationDiff`、`severityThresholds` | 回归 | 只有设置了其中之一才检查耗时：比参照慢了超过 `maxDurationDiff` 毫秒的运行算作回归，严重程度取所达到的最高阈值；更快的运行从不算回归 |

### 回归测试套件 {#regression-suites}

| 方法 | 返回值 | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | 保存在 `regressionTestSuitesDir` 中。`agent`：本 SDK 中某个智能体的 id 或名称。每条黄金追踪记录都必须存在；`input` 默认为参照运行收到的输入；套件不保存输入的 `signal` 和回调（`onEvent`、`onText`、`onTextRestart`） |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | 最新的在前 |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | 按从旧到新的顺序运行该智能体的所有套件：每个测试把输入发给智能体，并把这次运行与其黄金追踪记录比较；`suites` 中每个套件对应一个结果 |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | 只运行一个套件 |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`：0 表示所有测试通过，1 表示有测试发现回归，2 表示有测试无法运行（出错或超时）；在选项中设置 `exitCode: false` 则得到 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML：每个套件一个 `<testsuite>`；无法运行的测试（出错或超时）写作 `<error>`；XML 无法容纳的字符会被删除 |

智能体的 id 在每个进程中都是新的：套件还会记下其智能体的**名称**，另一个进程会用该名称的智能体来运行它（如果套件记录的智能体 id 就在 SDK 中，则优先用它）。在同一个 SDK 中，智能体的 id 只属于它自己：同名的两个智能体（例如两个版本）各自保留自己的套件、断言和黄金追踪记录，而名称指向它们全部。用 `createAgent` 创建的每个智能体都会一直留在它的 SDK 中，因此每个请求都创建一个智能体的应用会让名称变得有歧义：请传入 id，或者每个智能体只创建一次并重复使用。旧版本保存的套件没有名称：只能在创建它们的进程中运行。选项：`parallel`（同时运行一个套件的所有测试）、`stopOnFirstFailure`（仅限顺序运行：第一个未通过的测试之后，包括后续套件在内都不再运行）、`filterTags`、`excludeTags`、`timeout`（每个测试的毫秒数，默认 60 000，最多 2 147 483 647；超过后运行会被取消，测试结果为 `timeout`）以及 `detection`（上面的回归选项）。

### 断言 {#assertions}

| 方法 | 返回值 | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | 适用于所有运行，或某个智能体的运行；通过 `agentId` 指定的本 SDK 智能体还会记下其名称。无法求值的条件会以 `ValidationError` 被拒绝 |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | 最新的在前 |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | 求值指定的断言（未知 id 会抛出错误）；否则求值适用于所有运行的断言，加上这次运行所属智能体的断言 |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | 需要 | 通过条件 |
| --- | --- | --- |
| `event_present`、`event_absent` | `eventType` 或 `eventTypes` | 出现其中某个类型／一个都不出现 |
| `event_count` | `eventType` 或 `eventTypes`，再加上 `count`，或 `minCount` 与 `maxCount` | 这些事件的数量符合要求 |
| `event_order` | `beforeEventType`、`afterEventType` | 一种事件的第一次出现早于另一种事件的第一次出现 |
| `event_value` | `eventType`、`valuePath`、`valueMatcher`（`eq`、`ne`、`gt`、`gte`、`lt`、`lte`、`contains`、`regex`） | 该类型的每个事件都匹配 |
| `custom` | `customEvaluator(events) => boolean` | 函数返回 `true` |

`custom` 断言包含一个函数，而函数无法写入文件：它**不会被保存**，只在定义它的 SDK 实例存在期间有效，因此请在启动时重新定义。其他类型保存在 `assertionsDir` 中。

### 比较与影响 {#comparisons-and-impact}

| 方法 | 返回值 | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | 与上文一样按含义对齐的差异：`event_added`、`event_removed`、`event_modified`（类型改变）、`data_changed`、`sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | 变更前后的平均值：`duration`（毫秒）、`cost`（有价格的模型调用的美元花费，与 `getRunCost` 一致）、`quality`（不是失败动作的事件所占比例）和 `success_rate`，并附带行为变化；保存在 `impactAnalysesDir` 中 |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | 对某个受治理智能体（其名称，或本 SDK 中某个智能体的 id）在各个版本（其 `version` 或 `configHash`）下记录的运行执行 `analyzeImpact`。所有同名智能体都计入。回放不计入；两个版本必须不同，并选出不同的运行；未知版本会抛出错误，并列出已记录的版本 |

受治理智能体运行的生命周期事件（`run.started`、`run.completed` 等）会记录其 `agentName`、`agentVersion` 和 `configHash`：同名的两个智能体，就是同一个智能体的两个版本，或处在两个进程中。该哈希涵盖模型、系统提示、`maxSteps` 与 `timeout`、提供商设置、`version`、能力、工具（名称、描述、版本、参数模式、元数据、重试设置）以及智能体自己的策略及其规则；它会随 `setPolicy` 和 `addTools` 改变，每次运行记录的是它开始时的哈希。旧版本记录的运行只有 id 和版本。

### 跨所有运行的查询 {#queries-across-runs}

| 方法 | 返回值 |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`：按时间顺序排列的匹配事件（最多 `limit` 条）、范围内的事件数、匹配的事件数 |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

过滤器有一个**范围**：`runId`（没有它则为所有运行）、`since`、`until`；还有一些**条件**：`type`、`agentId`、`userId`、`sessionId`、`dataFilters`（`{ path, operator, value?, regex? }`）和 `metadataFilters`（`{ field, operator, value? }`）。条件用 `logic` 组合（默认为 `and`；`or` 表示至少满足一个），再由 `not` 取反；范围从不取反。所有内置存储都能回答：文件存储每次查询时对每个运行文件只读一次，SQL 存储则查询数据库。当所有条件都必须满足时，数据库会自己按类型和 id 筛选事件；使用 `or` 或 `not` 时，存储会返回范围内的所有事件，条件在内存中检查，这在大型数据库上开销更大。同一毫秒内的事件保持其在运行中的顺序：运行按 id 排序，每次运行内部按记录的先后排列。

## 实时事件 {#live-events}

监听器是一个 `(event: Event) => unknown`。它一次收到一个事件，按每次运行内的顺序，在存储接受该事件之后送达；如果它返回一个 promise，它的下一个事件会等到这个 promise 完成之后才送达。运行从不等待它，它的错误会被报告，绝不会被抛进运行中。最多有 `maxQueued` 个事件（默认 10 000 个）排队等待它；超过之后，发给它的新事件会被丢弃，并以一个 `LiveEventsDroppedError` 报告出来。参见[实时进度](../guide/observability#live-progress)。

| API | |
| --- | --- |
| `RunInput.onEvent`：`agent.run({ message, onEvent })` | 这次运行的每一个事件；`run()` 会等到监听器处理完其中每一个事件之后才返回结果，而当运行被停止或被取消、或 `signal` 被中止时，会更早返回（此时监听器会被取消订阅）。监听器本身不会被记录 |
| `ThinkInput.onEvent`：`agent.think({ problem, onEvent })` | 对认知运行同样如此，它的 `limits.timeoutMs` 也会结束这段等待 |
| `replay(runId, modifications?, { onEvent })` | 对回放同样如此，回放无法被取消：它总是会等待 |
| `executeTool(name, params, { onEvent })` | 这次调用的事件，以及它的工具所启动的运行的事件，只跟随一层：处理函数以 `context.onEvent` 的形式得到监听器，`governedAgentTool` 和 `cognitiveAgentTool` 会把它传给它们的智能体（在没有实时事件的存储上手动构建的智能体会在没有它的情况下运行）。`signal` 会结束这段等待 |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`：与过滤条件匹配的每一次运行的每一个事件（`agentId` 即 `metadata.agentId`），直到你调用返回的函数为止；调用它时，尚未送达的事件会被丢弃。回归测试套件的运行和回放也是真实的运行，监听器同样会收到它们的事件（套件不会保存其输入中的 `onEvent` 和 `onText`） |
| `new ObservedEventStore(store, { onListenerError? })` | 负责送达这些事件的那一层；SDK 会用它包装自己的存储，或者使用你作为 `eventStore` 传入的那一个，即使它位于一个 `MonitoredEventStore` 内部也是如此（这时后者的事故报告也会被送达）。它的 `subscribe(listener, options?)` 返回 `{ unsubscribe(), close() }`：`close()` 会等到监听器处理完它已经取走的事件。`onListenerError` 会收到监听器的错误以及事件被丢弃的情况 |

## 工具：`ToolDefinition` {#tools-tooldefinition}

| 字段 | |
| --- | --- |
| `name`、`description` | 模型看到的内容 |
| `schema` | 参数的 Zod schema；不匹配的调用会被拒绝 |
| `handler(params, context?)` | 接收经过验证的参数和 `{ runId, agentId, signal?, onEvent? }`——当调用方放弃时，`signal` 会被中止；当调用方实时观察这次调用时，`onEvent` 会被设置：请把它作为该工具所启动的运行的 `onEvent` 传入 |
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | 一个 MCP `Server`，恰好暴露 `tools` 所列出的内容：已定义工具的名称和/或 `ToolDefinition`（会替你在 SDK 上定义；同一个定义可以再次传入，名称已被占用的另一个工具会被拒绝）。`resources`：一个或多个 `ResourceProvider`；每一次读取都会被追踪。调用以 `mcp:<name>`（或 `agentId`）的身份运行；在 `approvalTimeoutMs`（默认 50 000 毫秒）内无人决定的审批会被取消；对输入的拒绝会向客户端解释，其他原因只有在设置 `exposeErrorDetails` 时才会给出。带有 `progressToken` 的调用会为每个事件收到一条 `notifications/progress`，全部在结果之前发送（[进度通知](../guide/mcp-deploy#progress-notifications)） |
| `serveMcpOverStdio(sdk, options)` | 同上，但连接到 stdin/stdout；向 stderr 写入一行“ready”，并在 stdin 结束时关闭（进行中的调用会被中止，待处理的审批会被取消）。`approvalTimeoutMs` 默认为 50 000，与 `createMcpServer` 相同 |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }`——任何 MCP 服务器的工具，以 `ToolDefinition` 的形式提供 |

`GovernedToolHost` 是服务器对 SDK 的需求（`listTools`、`defineTool`、`executeTool`、`traceResourceRead`）；`createSDK()` 返回的对象实现了它。

## 构建模块 {#building-blocks}

SDK 的构建模块已导出，供自定义配置使用：`JevClient`、`DecisionService`、`LLMThoughtGenerator`、`HeuristicController`、`TypedDecisionController`、`TypedHypothesisAssessor`、`PredictionTester`、`applyThought`、`assembleThought`、`assessReadiness`、`rankHypotheses`、`rebuildMentalState`、`describeMentalState`、`fingerprint`、`defineThinkerProfile`、`refineProfile`、`withRetry`、`RetryingLLMProvider`、`OpenAIProvider`、`AnthropicProvider`、`FallbackProvider`、`MonitoredEventStore`、`ObservedEventStore`、`EmailIncidentNotifier`、`WebhookIncidentNotifier`、`ResendEmailTransport`、`computeRunCost`、`FileEventStore`、`SQLiteEventStore`、`PostgreSQLEventStore`，以及它们的主要类型。
