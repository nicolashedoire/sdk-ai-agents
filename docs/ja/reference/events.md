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
| `run.started` | `input`、`mode`（認知エージェントなら `cognitive`、研究の実行なら `study`、追加指示を分類する実行なら `study-amendment`、MCP の呼び出しのようにエージェントの外で行われる呼び出しなら `tool`、MCP リソースの読み取りなら `resource`、ガバナンス付きエージェントの実行では省略される）、`replayOf?` |
| `run.completed` | `output`、`decision?`（認知エージェント） |
| `run.failed` | `error`、`steps?`、`uri?`（リソースの読み取りが失敗した場合） |
| `run.cancelled` / `run.stopped` | `reason` |

## 推論とアクション {#reasoning-and-actions}

| 種類 | データ |
| --- | --- |
| `intention.generated` | `message`、`toolCalls`、`model`、`requestedModel`、`usage`。認知エージェントの最終回答では、代わりに `intention` |
| `policy.checked` | `intention`、`validation`：ツール呼び出しに対するアクションエンジンの判定。ポリシーエンジンも、確認したポリシーごとに 1 つのイベント（`policyId`、`policyType`、`intention`、`conditionEvaluated?`、`validationResult`、`applied`（ポリシーが適用されて拒否した場合は `true`）、`reason`）を記録します。記録されるのはツール呼び出しの前と、認知エージェントの実行の各ステップの前（ステップに適用されうる予算とタイムアウトのポリシーのみで、`intention` は `{ type: 'continue' }`）です |
| `policy.violated` | `intention`、`reason`、`violatedPolicies`（呼び出し元が渡されていないツールを使った場合は `allowed-tools`、予算ポリシーの呼び出し予算を使い切った場合はそのポリシーの ID）、および予算またはタイムアウトのポリシーが認知エージェントの実行のステップを拒否した場合は `step`、研究の工程を拒否した場合は `passage`（このとき `intention` は `{ type: 'continue' }`） |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`、`intention`、`policyId`（ツール自身の `metadata.requiresApproval` が承認を求めた場合は `tool-requires-approval`）、`reason?`（呼び出し元が待つのをやめたか、実行が停止した場合は `cancelled before a decision`、`approvalTimeoutMs` を過ぎた場合は `no decision within N ms`） |
| `action.executing` / `action.executed` / `action.failed` | `toolName`、`parameters`、`result` / `error`、`duration`。`action.failed` は、不正な引数のために（どのポリシーよりも前に）拒否された呼び出しや、承認の後に呼び出し元が去ったために拒否された呼び出しも記録する |
| `tool.called` | `toolName`、`parameters` |
| `tool.retry` | `toolName`、`retry`、`delayMs`、`error` |
| `provider.fallback` | `primaryProvider`、`usedProvider`、`attemptedProviders` |
| `provider.retry` | `provider`、`model`、`retry`、`delayMs`、`error` |
| `provider.answer_discarded` | `provider`、`model`、`requestedModel?`、`usage`、`reason`。ベンダーが課金し、使用量を報告したにもかかわらず、プロバイダーが使えなかった応答（選択肢を一つも含まない OpenAI の応答）。コストと期間ごとの予算に数えられる |
| `resource.read` | `uri`、`mimeType?`、`bytes`、提供した内容の `sha256`（内容そのものは保存されない） |

`tool.failed`、`intention.rejected`、`error.occurred` は `EventType` 型に含まれますが、SDK がこれらを記録することはありません。失敗したツール呼び出しは `action.failed` イベントに、ポリシーに拒否された呼び出しは `policy.violated` イベントに、承認で却下された呼び出しは `approval.rejected` イベントになります。

## 認知 {#cognition}

| 種類 | データ |
| --- | --- |
| `cognition.started` | `schemaVersion`（2。古い実行にはない）、`goal`、`context?`、`observations`（問題と一緒に渡されたもの）、`commitRules`、`knowledge?`（`scope`、以前の実行から呼び出された `items`、ストアが失敗した場合は `error?`）、`profile`、`controller`、`assessor`、`evaluator?`、`allowedTools`、`limits` |
| `cognition.operation_selected` | `step`、`operation`、`controller`、`available`、`stepsRemaining`、`forced?`（エンジンが決定を強制した）、`confidence?`、`probabilities?`、`rationale?`、`fallbackFrom?` |
| `cognition.thought` | `step`、`operation`、`patch`、`issues`、`failed`、`ignoredFields?`、`model?`、`requestedModel?`、`usage?`（`promptTokens`、`completionTokens`、`calls`、`unmeteredCalls?`、`unmeteredTokens?`。`unmeteredCalls` は入力トークン数と出力トークン数の両方は報告しなかった呼び出しの数、`unmeteredTokens` はそれらの呼び出しのトークン数） |
| `cognition.operation_failed` | `step`、`operation`、`error`、`recovery?`。課金された試行の後、停止やタイムアウトで打ち切られたオペレーションでは、さらに `model?`、`requestedModel?`、`usage?` |
| `cognition.evaluated` | `step`、`predictionId`、`hypothesisId`、`evaluator`（`id`、`version`）、`verdict`、`observed?`、`summary?`、`context?`、`metrics?`、`causeCandidates?`、`reason?`、`durationMs`。予測のテストの完全なレポート |
| `cognition.concluded` | `decision`、`status`（`committed`、`provisional`、`abstain`）、`confidence`、`steps`、`evidenceRevision`、`hypotheses`、`predictions` |
| `cognition.knowledge_recorded` | `scope`、`findings`（言明、種類、スコープ、`revises?`、`difference?`、`evidence`：各テストについて `runId`、`predictionId`、`verdict`、`expected`、`observed`、評価器）、ストアが失敗した場合は `error?`。`run.completed`、`run.failed`、`run.cancelled` の後に追記され、実行が何かをテストした場合にだけ記録される |
| `cognition.feedback` | `feedback`（`verdict`、`agreement?`、`wrongAbout?`、…）、`profileId`、`profileVersionBefore`、`profileVersionAfter` |
| `decision.evaluated` | `client`、`purpose`（`operation_selection`、`hypothesis_assessment`、`direct`）、`model`、`state`、`questions`、`answers`（回答が拒否された場合は空）、`usage?`（バックエンドがトークン数を報告しなかった場合はなし）、`error?`（課金された回答が拒否された理由）、`step?` |

## 研究 {#studies}

研究の実行（`mode: 'study'`）と、その追加指示を分類する実行（`mode: 'study-amendment'`）は、次のイベントを記録します。各イベントは、研究の `id` を `metadata.agentId` として、その名前を `metadata.studyName` として持ちます。検索も、ガバナンス付きのツール呼び出しのイベント（`action.executing`、`policy.checked`、`tool.called`、`action.executed`）を研究の実行に記録します。[研究](../guide/studies) を参照してください。

| 種類 | データ |
| --- | --- |
| `study.started` | `name`、`charter`（`object`、`question`、`objective`、`needs`、`leads`、`scope`、`capability?`、`analogues`）、`charterHash`（SHA-256）、`language`、`model?`、`sources`（ツール名）、`limits`、`driftThreshold`、`amendments`（受け入れられたもの：`number`、`text`）、`resumeAt?`（再開された実行が始まる工程） |
| `study.passage_started` | `passage`、`number`（1 から 7）、`amendments`（有効な、受け入れられた追加指示の番号）、そして後の工程から差し戻された場合は `reopenedBy?`、`focus?`、`reason?` |
| `study.passage_completed` | `passage`、`attempts`（監視役がやり直させた場合は 2）、`items`（それぞれに `collection`、`id`、`statement`、`status`、`sources`、`servesObjective`、主張のそのほかのフィールドと独自のフィールド）、`reopenedBy?`、`reopen?`（`passage`、`focus`、`reason`：差し戻しを求める前の工程） |
| `study.search` | `passage`、`purpose`（`research`、または新規性の先行技術なら `priorArt`）、`tool`、`query`、`servesObjective`、`claims?`（探している新規性）、`resultIds`、`results`（`id`、`title`、`locator`、`date?`）、`error?`（検索が失敗した）、`skipped?`（`maxSearches`：実行されなかった） |
| `study.model_called` | `purpose`（`passage`、`queries`、`check`、`priorArtQueries`、`priorArtCheck`、`amendment`）、`passage?`、`model?`、`requestedModel?`、`usage`（`promptTokens`、`completionTokens`、`calls`、`unmeteredCalls?`、`unmeteredTokens?`：呼び出しとその修復で 1 つのイベント）、`failed?`（応答が使えなかった理由）。コストと期間ごとの予算に数えられる |
| `study.drift_rejected` | `passage`、`collection`、`item`（`id?`、`statement?`、`servesObjective?`）、`reason`、`by`（`guardian`：目的から外れていると判定された。`schema`：その前に拒否された。たとえば `servesObjective` がない）、`attempt`（やり直しでは 2） |
| `study.amendment_accepted` / `study.amendment_refused` | `number?`（受け入れられた場合のみ）、`text`、`verdict`（`refines`、`conflicts`、`changesObjective`、`unclassified`）、`accepted`、`reason`、`charterHash`。追加指示専用の実行に記録される |
| `study.result_recorded` | `card`、`resultAndError`（`result`、`error?`）、`conclusionAndMemory?`。カードを書いた実行に、その終了後に追記される |
| `study.completed` | `status`、`passages`（`passage`、`state`）、`stats` |
| `study.failed` | `status`（`stopped`、`failed`、`cancelled` のいずれか）、`stoppedBy?`、`error`、`passages`、`stats`、`partial: true`。その後に `run.failed` または `run.cancelled` |

`study.model_called` は、`getRunCost` と予算が研究について読むイベントです。2 つの実行を比較するとき、研究のイベントは工程ごとに対応づけられ（`study.model_called` は用途と工程ごと）、`study.model_called` の `usage` は比較されません。

## 運用 {#operations}

| 種類 | データ |
| --- | --- |
| `incident.reported` | `incident`、`deliveries`、`suppressed?`（`throttled`、`below minimum severity`） |

認知エージェントの実行の心的状態は、`cognition.started` の目標と観測から始めて、その実行の `cognition.thought` のパッチを `step` の順に畳み込んだものです。実行中に得られた観測は思考パッチによって運ばれ、その `sourceEventId` は、完全なペイロードを保持する `action.executed` または `cognition.evaluated` イベントを指します。`schemaVersion` のない実行は、記録されたときのルールで再構築されます。
