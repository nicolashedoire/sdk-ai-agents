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
| `run.started` | `input`、`mode`（`cognitive`；`tool` 表示在智能体之外的调用，例如 MCP 调用；`resource` 表示 MCP 资源读取；受治理的运行则没有这个字段）、`replayOf?` |
| `run.completed` | `output`、`decision?`（认知运行） |
| `run.failed` | `error`、`steps?`、`uri?`（失败的资源读取） |
| `run.cancelled` / `run.stopped` | `reason` |

## 推理与动作 {#reasoning-and-actions}

| 类型 | 数据 |
| --- | --- |
| `intention.generated` | `message`、`toolCalls`、`model`、`requestedModel`、`usage`——对于认知的最终答案则是 `intention` |
| `policy.checked` / `policy.violated` | `intention`、`validation` / `reason`、`violatedPolicies`（当调用方使用了没有交给它的工具时为 `allowed-tools`；当调用预算耗尽时为该预算策略的 id） |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`、`intention`、`policyId`（当审批是由工具自己的 `metadata.requiresApproval` 要求的时为 `tool-requires-approval`）、`reason?`（当调用方放弃或运行停止时为 `cancelled before a decision`，超过 `approvalTimeoutMs` 后为 `no decision within N ms`） |
| `action.executing` / `action.executed` / `action.failed` | `toolName`、`parameters`、`result` / `error`、`duration`——`action.failed` 还会记录因参数无效而被拒绝的调用（在任何策略之前），或者因调用方在审批之后离开而被拒绝的调用 |
| `tool.called` | `toolName`、`parameters` |
| `tool.retry` | `toolName`、`retry`、`delayMs`、`error` |
| `provider.fallback` | `primaryProvider`、`usedProvider`、`attemptedProviders` |
| `provider.retry` | `provider`、`model`、`retry`、`delayMs`、`error` |
| `provider.answer_discarded` | `provider`、`model`、`usage`、`reason`——厂商已计费并报告了用量、但提供商无法使用的应答（不含任何选项的 OpenAI 应答）；计入成本和预算 |
| `resource.read` | `uri`、`mimeType?`、`bytes`、所提供内容的 `sha256`（内容本身不会被保存） |

`tool.failed`、`intention.rejected` 和 `error.occurred` 属于 `EventType` 类型，但 SDK 从不记录它们：失败的工具调用记录为 `action.failed` 事件，被策略拒绝的调用记录为 `policy.violated` 事件，在审批中被驳回的调用记录为 `approval.rejected` 事件。

## 认知 {#cognition}

| 类型 | 数据 |
| --- | --- |
| `cognition.started` | `schemaVersion`（2；较早的运行中没有）、`goal`、`context?`、`observations`（随问题提供的）、`commitRules`、`knowledge?`（`scope`、从之前运行中召回的 `items`，存储出错时为 `error?`）、`profile`、`controller`、`assessor`、`evaluator?`、`allowedTools`、`limits` |
| `cognition.operation_selected` | `step`、`operation`、`controller`、`available`、`stepsRemaining`、`forced?`（引擎强制要求决策）、`confidence?`、`probabilities?`、`rationale?`、`fallbackFrom?` |
| `cognition.thought` | `step`、`operation`、`patch`、`issues`、`failed`、`ignoredFields?`、`model?`、`requestedModel?`、`usage?`（`promptTokens`、`completionTokens`、`calls`、`unmeteredCalls?`——没有报告 token 数的调用） |
| `cognition.operation_failed` | `step`、`operation`、`error`、`recovery?`——对于在已计费的尝试之后被停止或超时打断的操作，还有 `model?`、`requestedModel?`、`usage?` |
| `cognition.evaluated` | `step`、`predictionId`、`hypothesisId`、`evaluator`（`id`、`version`）、`verdict`、`observed?`、`summary?`、`context?`、`metrics?`、`causeCandidates?`、`reason?`、`durationMs`——一次预测检验的完整报告 |
| `cognition.concluded` | `decision`、`status`（`committed`、`provisional`、`abstain`）、`confidence`、`steps`、`evidenceRevision`、`hypotheses`、`predictions` |
| `cognition.knowledge_recorded` | `scope`、`findings`（陈述、类别、作用域、`revises?`、`difference?`、`evidence`：每一次检验，带有 `runId`、`predictionId`、`verdict`、`expected`、`observed`、评估器），存储出错时为 `error?`。在 `run.completed`、`run.failed` 或 `run.cancelled` 之后追加，并且只在这次运行检验过某些东西时才追加 |
| `cognition.feedback` | `feedback`（`verdict`、`agreement?`、`wrongAbout?`……）、`profileId`、`profileVersionBefore`、`profileVersionAfter` |
| `decision.evaluated` | `client`、`purpose`（`operation_selection`、`hypothesis_assessment`、`direct`）、`model`、`state`、`questions`、`answers`（答案被拒绝时为空）、`usage?`（后端没有报告 token 数时不存在）、`error?`（已计费的答案被拒绝的原因）、`step?` |

## 运维 {#operations}

| 类型 | 数据 |
| --- | --- |
| `incident.reported` | `incident`、`deliveries`、`suppressed?`（`throttled`、`below minimum severity`） |

认知运行的心智状态，就是从 `cognition.started` 的目标和观测出发，按 `step` 顺序折叠其 `cognition.thought` 补丁得到的结果。运行期间产生的观测由思维补丁携带，其 `sourceEventId` 指向保存完整内容的 `action.executed` 或 `cognition.evaluated` 事件。没有 `schemaVersion` 的运行会用它们被记录时所依据的规则来重建。
