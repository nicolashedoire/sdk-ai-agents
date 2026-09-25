# 事件目录

每个事件都有相同的外层结构：

```ts
interface Event {
  id: string;
  runId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: { agentId?: string; agentVersion?: string; profileId?: string; profileVersion?: string; … };
}
```

## 运行生命周期 {#run-lifecycle}

| 类型 | 数据 |
| --- | --- |
| `run.started` | `input`、`mode`（`cognitive`；`study` 表示研究的运行；`study-amendment` 表示对修正案进行分类的运行；`tool` 表示在智能体之外的调用，例如 MCP 调用；`resource` 表示 MCP 资源读取；受治理的运行则没有这个字段）、`replayOf?` |
| `run.completed` | `output`、`decision?`（认知运行） |
| `run.failed` | `error`、`steps?`、`uri?`（失败的资源读取） |
| `run.cancelled` / `run.stopped` | `reason` |

## 推理与动作 {#reasoning-and-actions}

| 类型 | 数据 |
| --- | --- |
| `intention.generated` | `message`、`toolCalls`、`model`、`requestedModel`、`usage`——对于认知的最终答案则是 `intention` |
| `policy.checked` | `intention`、`validation`：动作引擎对一次工具调用的判定。策略引擎还会为它检查的每条策略记录一个事件——`policyId`、`policyType`、`intention`、`conditionEvaluated?`、`validationResult`、`applied`（策略生效并拒绝时为 `true`）和 `reason`——在工具调用之前记录，也会在认知运行的每一步之前为可能适用于步骤的预算和超时策略记录（此时 `intention` 为 `{ type: 'continue' }`） |
| `policy.violated` | `intention`、`reason`、`violatedPolicies`（当调用方使用了没有交给它的工具时为 `allowed-tools`；当调用预算耗尽时为该预算策略的 id），以及预算或超时策略拒绝了认知运行的某一步时的 `step`，或拒绝了研究的某个环节时的 `passage`（此时 `intention` 为 `{ type: 'continue' }`） |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`、`intention`、`policyId`（当审批是由工具自己的 `metadata.requiresApproval` 要求的时为 `tool-requires-approval`）、`reason?`（当调用方放弃或运行停止时为 `cancelled before a decision`，超过 `approvalTimeoutMs` 后为 `no decision within N ms`） |
| `action.executing` / `action.executed` / `action.failed` | `toolName`、`parameters`、`result` / `error`、`duration`——`action.failed` 还会记录因参数无效而被拒绝的调用（在任何策略之前），或者因调用方在审批之后离开而被拒绝的调用 |
| `tool.called` | `toolName`、`parameters` |
| `tool.retry` | `toolName`、`retry`、`delayMs`、`error` |
| `provider.fallback` | `primaryProvider`、`usedProvider`、`attemptedProviders` |
| `provider.retry` | `provider`、`model`、`retry`、`delayMs`、`error` |
| `provider.answer_discarded` | `provider`、`model`、`requestedModel?`、`usage`、`reason`——厂商已计费并报告了用量、但提供商无法使用的应答（不含任何选项的 OpenAI 应答）；计入成本和按周期的预算 |
| `resource.read` | `uri`、`mimeType?`、`bytes`、所提供内容的 `sha256`（内容本身不会被保存） |

`tool.failed`、`intention.rejected` 和 `error.occurred` 属于 `EventType` 类型，但 SDK 从不记录它们：失败的工具调用记录为 `action.failed` 事件，被策略拒绝的调用记录为 `policy.violated` 事件，在审批中被驳回的调用记录为 `approval.rejected` 事件。

## 认知 {#cognition}

| 类型 | 数据 |
| --- | --- |
| `cognition.started` | `schemaVersion`（2；较早的运行中没有）、`goal`、`context?`、`observations`（随问题提供的）、`commitRules`、`knowledge?`（`scope`、从之前运行中召回的 `items`，存储出错时为 `error?`）、`profile`、`controller`、`assessor`、`evaluator?`、`allowedTools`、`limits` |
| `cognition.operation_selected` | `step`、`operation`、`controller`、`available`、`stepsRemaining`、`forced?`（引擎强制要求决策）、`confidence?`、`probabilities?`、`rationale?`、`fallbackFrom?` |
| `cognition.thought` | `step`、`operation`、`patch`、`issues`、`failed`、`ignoredFields?`、`model?`、`requestedModel?`、`usage?`（`promptTokens`、`completionTokens`、`calls`、`unmeteredCalls?`——没有同时报告输入和输出 token 数的调用，`unmeteredTokens?`——这些调用的 token 数） |
| `cognition.operation_failed` | `step`、`operation`、`error`、`recovery?`——对于在已计费的尝试之后被停止或超时打断的操作，还有 `model?`、`requestedModel?`、`usage?` |
| `cognition.evaluated` | `step`、`predictionId`、`hypothesisId`、`evaluator`（`id`、`version`）、`verdict`、`observed?`、`summary?`、`context?`、`metrics?`、`causeCandidates?`、`reason?`、`durationMs`——一次预测检验的完整报告 |
| `cognition.concluded` | `decision`、`status`（`committed`、`provisional`、`abstain`）、`confidence`、`steps`、`evidenceRevision`、`hypotheses`、`predictions` |
| `cognition.knowledge_recorded` | `scope`、`findings`（陈述、类别、作用域、`revises?`、`difference?`、`evidence`：每一次检验，带有 `runId`、`predictionId`、`verdict`、`expected`、`observed`、评估器），存储出错时为 `error?`。在 `run.completed`、`run.failed` 或 `run.cancelled` 之后追加，并且只在这次运行检验过某些东西时才追加 |
| `cognition.feedback` | `feedback`（`verdict`、`agreement?`、`wrongAbout?`……）、`profileId`、`profileVersionBefore`、`profileVersionAfter` |
| `decision.evaluated` | `client`、`purpose`（`operation_selection`、`hypothesis_assessment`、`direct`）、`model`、`state`、`questions`、`answers`（答案被拒绝时为空）、`usage?`（后端没有报告 token 数时不存在）、`error?`（已计费的答案被拒绝的原因）、`step?` |

## 研究 {#studies}

研究的运行（`mode: 'study'`）以及对其修正案进行分类的运行（`mode: 'study-amendment'`）会记录以下事件。每个事件都以研究的 `id` 作为 `metadata.agentId`，以研究的名称作为 `metadata.studyName`。搜索还会在研究的运行中记录其受治理工具调用的事件（`action.executing`、`policy.checked`、`tool.called`、`action.executed`）。参见[研究](../guide/studies)。

| 类型 | 数据 |
| --- | --- |
| `study.started` | `name`、`charter`（`object`、`question`、`objective`、`needs`、`leads`、`scope`、`capability?`、`analogues`）、`charterHash`（SHA-256）、`language`、`model?`、`sources`（工具名称）、`limits`、`driftThreshold`、`amendments`（已接受的修正案：`number`、`text`）、`resumeAt?`（运行恢复时：第一个还有工作要做的环节） |
| `study.passage_started` | `passage`、`number`（1 到 7）、`amendments`（生效中的已接受修正案的编号）、当后面的环节重开它时的 `reopenedBy?`、`focus?`、`reason?`，恢复的运行补上它应有的重做时的 `redo?` 和 `resumed?`，以及它为守护者迟来评判的条目再次运行时的 `outdated?` |
| `study.passage_completed` | `passage`、`attempts`（守护者让它重做时为 2）、`keptAttempt?`（第一次尝试比重做更好并被保留时为 1）、`discarded?`（`attempt`、`items`：随后被舍弃的重做）、`items`（每一项都带有它的 `collection`、`id`、`statement`、`status`、`sources`、`servesObjective`、论断的其他字段以及它自己的字段）、`reopenedBy?`、`reopen?`（`passage`、`focus`、`reason`：它要求重开的较早环节；在它再次运行之前，它尚未完成）、`resumed?`（某次运行恢复了它，只为让它收尾）、`duplicates?`（对已经评判过的线索再次给出的判定：被丢弃，不算偏离） |
| `study.search` | `passage`、`purpose`（`research`，或者针对创新点现有技术的 `priorArt`）、`tool`、`query`、`servesObjective`、`claims?`（它要查找的创新点）、`resultIds`、`results`（`id`、`title`、`locator`、`date?`）、`error?`（搜索失败）、`throttled?`（因限流而失败）、`retry?`（被限流的现有技术搜索的第二次尝试）、`skipped?`（`maxSearches`：未执行） |
| `study.model_called` | `purpose`（`passage`、`queries`、`check`、`priorArtQueries`、`priorArtCheck`、`amendment`）、`passage?`、`model?`、`requestedModel?`、`usage`（`promptTokens`、`completionTokens`、`calls`、`unmeteredCalls?`、`unmeteredTokens?`：一次调用及其修复记为一个事件）、`failed?`（回复无法使用的原因）、`usedAttempt?`（修复无法使用、转而宽松地读取并使用了第一次回复时为 1）——计入成本和按周期的预算 |
| `study.drift_rejected` | `passage`、`collection`、`item`（`id?`、`statement?`、`servesObjective?`）、`reason`（`code`、`params?`、`message`）、`by`（`guardian`：被判定偏离目标；`schema`：在此之前就被拒绝，例如缺少 `servesObjective`）、`attempt`（重做时为 2） |
| `study.capability_demoted` | `passage`、`item`（架构的 id）、`name`、`reason`（`code`、`params?`、`message`）：守护者判定只是更快或更便宜的能力，现在成为改进 |
| `study.amendment_accepted` / `study.amendment_refused` | `number?`（仅限已接受的）、`text`、`verdict`（`refines`、`conflicts`、`changesObjective`、`unclassified`）、`accepted`、`reason`（`code`、`params?`、`message`；对于 `unclassified`：`amendmentUnclassified`、`amendmentTimedOut`、`amendmentCancelled` 或 `amendmentPolicy`）、`charterHash`——记录在修正案自己的运行中 |
| `study.result_recorded` | `card`、`resultAndError`（`result`、`error?`）、`conclusionAndMemory?`——在写出这张卡片的那次运行结束之后追加到该运行中 |
| `study.completed` | `status`、`passages`（`passage`、`state`）、这次运行的 `stats`（提供商作出应答的 `modelCalls`、`searches`、`searchesSkipped`、`redos`、`loops`、`steps`） |
| `study.failed` | `status`（`stopped`、`failed` 或 `cancelled`）、`stoppedBy?`、`error`、`passages`、这次运行的 `stats`、`partial: true`——随后是 `run.failed` 或 `run.cancelled` |

对于研究，`getRunCost` 和预算读取的就是 `study.model_called`。比较两次运行时，研究事件按环节配对（`study.model_called` 按用途和环节配对），`study.model_called` 的 `usage` 不参与比较。修正案的运行包含 `run.started`、预算策略拒绝分类时的 `policy.violated`、提供商作出应答时的 `study.model_called`、修正案的事件以及 `run.completed`。

## 运维 {#operations}

| 类型 | 数据 |
| --- | --- |
| `incident.reported` | `incident`、`deliveries`、`suppressed?`（`throttled`、`below minimum severity`） |

认知运行的心智状态，就是从 `cognition.started` 的目标和观测出发，按 `step` 顺序折叠其 `cognition.thought` 补丁得到的结果。运行期间产生的观测由思维补丁携带，其 `sourceEventId` 指向保存完整内容的 `action.executed` 或 `cognition.evaluated` 事件。没有 `schemaVersion` 的运行会用它们被记录时所依据的规则来重建。
