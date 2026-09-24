# イベントカタログ

すべてのイベントは、同じ外枠（エンベロープ）を持ちます。

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

## 実行のライフサイクル {#run-lifecycle}

| 種類 | データ |
| --- | --- |
| `run.started` | `input`、`mode`（認知エージェントなら `cognitive`、MCP の呼び出しのようにエージェントの外で行われる呼び出しなら `tool`、MCP リソースの読み取りなら `resource`、ガバナンス付きエージェントの実行では省略される）、`replayOf?` |
| `run.completed` | `output`、`decision?`（認知エージェント） |
| `run.failed` | `error`、`steps?`、`uri?`（リソースの読み取りが失敗した場合） |
| `run.cancelled` / `run.stopped` | `reason` |

## 推論とアクション {#reasoning-and-actions}

| 種類 | データ |
| --- | --- |
| `intention.generated` | `message`、`toolCalls`、`model`、`requestedModel`、`usage`。認知エージェントの最終回答では、代わりに `intention` |
| `policy.checked` / `policy.violated` | `intention`、`validation` / `reason`、`violatedPolicies`（呼び出し元が渡されていないツールを使った場合は `allowed-tools`、予算ポリシーの呼び出し予算を使い切った場合はそのポリシーの ID） |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`、`intention`、`policyId`（ツール自身の `metadata.requiresApproval` が承認を求めた場合は `tool-requires-approval`）、`reason?`（呼び出し元が待つのをやめたか、実行が停止した場合は `cancelled before a decision`、`approvalTimeoutMs` を過ぎた場合は `no decision within N ms`） |
| `action.executing` / `action.executed` / `action.failed` | `toolName`、`parameters`、`result` / `error`、`duration`。`action.failed` は、不正な引数のために（どのポリシーよりも前に）拒否された呼び出しや、承認の後に呼び出し元が去ったために拒否された呼び出しも記録する |
| `tool.called` | `toolName`、`parameters` |
| `tool.retry` | `toolName`、`retry`、`delayMs`、`error` |
| `provider.fallback` | `primaryProvider`、`usedProvider`、`attemptedProviders` |
| `provider.retry` | `provider`、`model`、`retry`、`delayMs`、`error` |
| `provider.answer_discarded` | `provider`、`model`、`usage`、`reason`。ベンダーが課金し、使用量を報告したにもかかわらず、プロバイダーが使えなかった応答（選択肢を一つも含まない OpenAI の応答）。コストに数えられ、ガバナンス付きエージェントでは期間ごとの予算にも数えられる |
| `resource.read` | `uri`、`mimeType?`、`bytes`、提供した内容の `sha256`（内容そのものは保存されない） |

`tool.failed`、`intention.rejected`、`error.occurred` は `EventType` 型に含まれますが、SDK がこれらを記録することはありません。失敗したツール呼び出しは `action.failed` イベントに、ポリシーに拒否された呼び出しは `policy.violated` イベントに、承認で却下された呼び出しは `approval.rejected` イベントになります。

## 認知 {#cognition}

| 種類 | データ |
| --- | --- |
| `cognition.started` | `schemaVersion`（2。古い実行にはない）、`goal`、`context?`、`observations`（問題と一緒に渡されたもの）、`commitRules`、`knowledge?`（`scope`、以前の実行から呼び出された `items`、ストアが失敗した場合は `error?`）、`profile`、`controller`、`assessor`、`evaluator?`、`allowedTools`、`limits` |
| `cognition.operation_selected` | `step`、`operation`、`controller`、`available`、`stepsRemaining`、`forced?`（エンジンが決定を強制した）、`confidence?`、`probabilities?`、`rationale?`、`fallbackFrom?` |
| `cognition.thought` | `step`、`operation`、`patch`、`issues`、`failed`、`ignoredFields?`、`model?`、`requestedModel?`、`usage?`（`promptTokens`、`completionTokens`、`calls`、`unmeteredCalls?`。`unmeteredCalls` はトークン数を報告しなかった呼び出しの数） |
| `cognition.operation_failed` | `step`、`operation`、`error`、`recovery?`。課金された試行の後、停止やタイムアウトで打ち切られたオペレーションでは、さらに `model?`、`requestedModel?`、`usage?` |
| `cognition.evaluated` | `step`、`predictionId`、`hypothesisId`、`evaluator`（`id`、`version`）、`verdict`、`observed?`、`summary?`、`context?`、`metrics?`、`causeCandidates?`、`reason?`、`durationMs`。予測のテストの完全なレポート |
| `cognition.concluded` | `decision`、`status`（`committed`、`provisional`、`abstain`）、`confidence`、`steps`、`evidenceRevision`、`hypotheses`、`predictions` |
| `cognition.knowledge_recorded` | `scope`、`findings`（言明、種類、スコープ、`revises?`、`difference?`、`evidence`：各テストについて `runId`、`predictionId`、`verdict`、`expected`、`observed`、評価器）、ストアが失敗した場合は `error?`。`run.completed`、`run.failed`、`run.cancelled` の後に追記され、実行が何かをテストした場合にだけ記録される |
| `cognition.feedback` | `feedback`（`verdict`、`agreement?`、`wrongAbout?`、…）、`profileId`、`profileVersionBefore`、`profileVersionAfter` |
| `decision.evaluated` | `client`、`purpose`（`operation_selection`、`hypothesis_assessment`、`direct`）、`model`、`state`、`questions`、`answers`（回答が拒否された場合は空）、`usage?`（バックエンドがトークン数を報告しなかった場合はなし）、`error?`（課金された回答が拒否された理由）、`step?` |

## 運用 {#operations}

| 種類 | データ |
| --- | --- |
| `incident.reported` | `incident`、`deliveries`、`suppressed?`（`throttled`、`below minimum severity`） |

認知エージェントの実行の心的状態は、`cognition.started` の目標と観測から始めて、その実行の `cognition.thought` のパッチを `step` の順に畳み込んだものです。実行中に得られた観測は思考パッチによって運ばれ、その `sourceEventId` は、完全なペイロードを保持する `action.executed` または `cognition.evaluated` イベントを指します。`schemaVersion` のない実行は、記録されたときのルールで再構築されます。
