# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| オプション | 型 | 説明 |
| --- | --- | --- |
| `apiKey` | `string` | 主プロバイダーのキー（`llmProvider` を使う場合は不要）。キーがまったくなくてもツールと MCP サーバーは動作し、モデルを必要とする呼び出しは明確なエラーで失敗する |
| `provider` | `'openai' \| 'anthropic'` | 主プロバイダー。デフォルトは `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | 各ベンダーの `apiKey`、`defaultModel`、`baseURL`（`baseURL`：Azure OpenAI の v1 API やローカルのモデルサーバーなどの互換エンドポイント、またはプロキシ）。主プロバイダーは自分のベンダーの項目を使い、別のベンダーのフォールバックはそのベンダーの項目を使う |
| `fallbackProviders` | `Array<{ provider, config? }>` | 主プロバイダーが失敗したときに、順番に試される。`config` は `providerConfig` より優先される。主プロバイダーと同じベンダーのフォールバックは、主プロバイダーの設定を引き継がない（全体の `apiKey` のみ）。別のベンダーのフォールバックには独自のキーが必要 |
| `llmProvider` | `LLMProvider` | 独自のプロバイダー（ローカルモデル、ゲートウェイ、テストダブル）。`nativeToolMessages` を宣言していれば、ツール呼び出しとその結果をネイティブ形式（`LLMMessage`）で、そうでなければテキストで受け取る |
| `retry` | `Partial<RetryPolicy> \| false` | LLM のリトライポリシー。プロバイダーごとに、フォールバックの前に適用される |
| `jev` | `JevClientConfig` | 型付き決定のために TypeSafe Jev を有効にする。直接使うか、`baseUrl` と `model: 'typesafe-ai/jev'` を指定して [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) 経由で使う |
| `decisionClient` | `TypedDecisionClient` | 任意の型付き決定のバックエンド（`jev` より優先される） |
| `pricing` | `PricingTable` | 100 万トークンあたりの USD 価格。デフォルトの価格に上書きで統合される |
| `incidents` | `IncidentMonitorOptions` | 通知手段、ルール、重大度のしきい値、送信頻度の制限 |
| `eventStore` | `IEventStore` | デフォルトは `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | グローバルなポリシー |
| `goldenTracesDir`、`regressionTestSuitesDir`、`assertionsDir`、`impactAnalysesDir` | `string` | テスト成果物の保存先 |

## エージェント {#agents}

| メソッド | 戻り値 | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | ガバナンス付きエージェント：`run({ message, context?, signal? })`、`stop(runId?)`、`addTools()`、`setPolicy()`、`id`、`name`。モデルが SDK に登録されている別のツールの名前を挙げても、実行できるのは自分のツール（`tools`、`capabilities`）だけ。`signal` は実行をキャンセルする |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`、`stop(runId?)`、`learnFromFeedback(runId, feedback)`、`getProfile()`、`setProfile()` |
| `defineTool(definition)` | `Tool` | ツールを登録する。ハンドラーの型は、その Zod スキーマから決まる |
| `defineCapability(definition)` | `Capability` | ツールをグループにまとめる |
| `listTools()` | `Tool[]` | 登録されているすべてのツール |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | エージェントの外でのガバナンス付き実行（MCP サーバーが使う）：引数、ポリシー、承認、予算（呼び出しの開始時に数えられる）の順にチェックし、それからツールを実行する。`signal` は承認待ちをキャンセルし、ハンドラーにも届く。`approvalTimeoutMs` は、誰も判断しなかった承認をキャンセルする |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | `read()` を独立した 1 つの実行として行う：`run.started`、`resource.read`（URI、サイズ、SHA-256）、`run.completed` または `run.failed` |
| `stopRun(runId)` | `Promise<void>` | ガバナンス付きエージェントまたは認知エージェントの実行を停止する |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| オプション | デフォルト | |
| --- | --- | --- |
| `name`、`model` | — | 必須 |
| `profile` | `DEFAULT_THINKER_PROFILE` | エージェントがどのように推論するか |
| `tools`、`policies` | `[]` | ほかの場所と同じようにガバナンスされる |
| `systemPrompt` | — | すべてのプロンプトに加える追加の指示 |
| `limits` | [認知エージェント](../guide/cognitive-agents#limits) を参照 | `maxSteps`、`timeoutMs`、`maxHypotheses`、`maxToolCalls`、`decisionThreshold`、`maxConsecutiveFailures`、`maxPredictionTests`、`preferenceWeight`、`minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`、`'typed'`、または `CognitiveController` |
| `controllerOptions` | — | `minConfidence`（0.35）、`readinessThreshold`（0.8）、`fallback`、`model` |
| `assessment` | `'auto'` | `compare` オペレーションに使う `'llm'`、`'typed'`、または独自の `HypothesisAssessor` |
| `knowledge` | — | 実行をまたぐ記憶：`{ store, scope, recallLimit? (10), record? (true) }`。[実行をまたぐ記憶](../guide/memory) を参照 |
| `evaluator` | — | 予測をテストする `OutcomeEvaluator`。`test_prediction` を有効にする |
| `generator` | `model` を使う LLM ジェネレーター | 独自の `ThoughtGenerator`（観測の比較も含む）。その思考も、エンジンの受け入れ規則を通る |
| `temperature`、`maxTokens` | `0.4`、— | 思考の生成の設定 |
| `providerSettings` | — | ツール選択の設定（ネイティブの推論エンジン） |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` は `completed`、`failed`、`cancelled` のいずれかです。`decision.status` は `committed`、`provisional`、`abstain` のいずれかで、まだ確立されていないことが `decision.missing` に列挙されます。`state` は最終的な `MentalState` です。

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

詳しくは [証拠と検証](../guide/evidence-and-verification) を参照してください。

## 推論とプロファイル {#reasoning-profiles}

| メソッド | 戻り値 |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — イベントから再構築される |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines 形式 |

## 型付き決定 — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

バックエンドが設定されていない場合は、`ValidationError` を投げます。

| メソッド | 戻り値 |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — 回答の型は質問から決まる |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

質問を組み立てるヘルパー：`noul(instructions, criteria?)`、`choice(instructions, options)`、`score(instructions, levels)`。

## 運用 {#operations}

| メソッド | 戻り値 |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`、`rejectAction(...)`、`getPendingApprovals(runId?)` | 人による承認 |
| `getBudgetUsage(limit)`、`getPolicyAuditTrail(runId)` | 予算とポリシーの監査 |

## トレース、リプレイ、テスト {#traces-replay-and-testing}

| メソッド | |
| --- | --- |
| `getTrace(runId)`、`exportTrace(runId, 'json' \| 'text')`、`getEvents(runId, filters?)` | 実行を読む |
| `replay(runId, modifications?)` | LLM を使わずに再実行する |
| `getReasoningGraph`、`exportReasoningGraph`、`getAlternatives`、`getDecisionPatterns`、`getTraceVisualization` | 決定を理解する |
| `createGoldenTrace`、`getGoldenTraces`、`validateAgainstGoldenTrace`、`replayAndValidate`、`detectRegressions` | エージェントをコードのようにテストする |

## ツール：`ToolDefinition` {#tools-tooldefinition}

| フィールド | |
| --- | --- |
| `name`、`description` | モデルが目にするもの |
| `schema` | 引数の Zod スキーマ。一致しない呼び出しは拒否される |
| `handler(params, context?)` | 検証済みの引数と `{ runId, agentId, signal? }` を受け取る。呼び出し元が待つのをやめると `signal` が中断される |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — 冪等なツールに限る。不正な引数がリトライされることはない |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` にすると、すべての呼び出しが `approveAction` を待つ。`readOnly` は MCP クライアントに `readOnlyHint` として示される |
| `inputJsonSchema` | `schema` から導かれる JSON Schema の代わりに示す JSON Schema |
| `capability`、`version` | グループ、バージョン |

## ツールソース {#tool-sources}

どれも、すぐに使える `ToolDefinition` を返します。`sdk.defineTool` に渡すことも、エージェントに渡すことも、MCP サーバーの `tools` に直接渡すこともできます。[なんでも MCP サーバーにする](../guide/mcp-recipes) を参照してください。

| 関数 | 戻り値 | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | OpenAPI 3 の記述のオペレーションごとに 1 つのツール。`include` に列挙しない限り `GET` のみで、それ以外のメソッドはデフォルトで承認が必要。呼び出しは `{ status, data, truncated? }` を返す |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | 1 つのフォルダーに対する `list_files`、`read_file`、`search_files`。そのフォルダーの外には決して出ない。除外したフォルダーは、その中身をすべて隠す |
| `folderResources(options)` | `ResourceProvider` | 同じファイルを、MCP リソース `folder://<name>/<path>` として提供する |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`、`describe_table`、`query`（読み取り専用のステートメント 1 つ。最大 `maxRows` 行で、デフォルトは 100） |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | `node:sqlite` の `DatabaseSync` または `better-sqlite3` 用。`PRAGMA query_only = ON` でクエリを実行する |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | `pg` 用（専用のクライアント、またはプール）。各クエリは `BEGIN READ ONLY`（すでにトランザクションの中にある接続では拒否される）… `ROLLBACK` + `pg_advisory_unlock_all()` の中で、`SET LOCAL statement_timeout`（デフォルトは 10 秒）を付けて実行される。`schemas` が制限するのは、テーブルの一覧表示と説明だけ |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`：`{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`。呼び出し元がやめるとキャンセルされる。`exposeErrors` を指定しない限り、`error` は汎用的な内容になる |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | データベースアダプターが使うステートメントのチェック（SQLite と PostgreSQL の構文のみ） |

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

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| 関数 | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `tools` に列挙したものだけを公開する MCP の `Server`。`tools` には、定義済みツールの名前と `ToolDefinition` のどちらか、または両方を指定する（`ToolDefinition` は自動的に SDK 上で定義される。同じ定義をもう一度渡すのはかまわないが、すでに使われている名前を持つ別のツールは拒否される）。`resources`：1 つまたは複数の `ResourceProvider`。すべての読み取りがトレースされる。呼び出しは `mcp:<name>`（または `agentId`）として実行される。`approvalTimeoutMs`（デフォルトは 50 000 ms）以内に誰も判断しない承認はキャンセルされる。入力の拒否はクライアントに説明され、それ以外の原因は `exposeErrorDetails` を指定した場合にだけ伝えられる |
| `serveMcpOverStdio(sdk, options)` | 同じサーバーを stdin/stdout に接続したもの。stderr に「ready」の行を 1 行書き込み、stdin が終わると閉じる（進行中の呼び出しは中断され、承認待ちはキャンセルされる）。`approvalTimeoutMs` のデフォルトは、`createMcpServer` と同じく 50 000 |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — 任意の MCP サーバーのツールを、`ToolDefinition` として返す |

`GovernedToolHost` は、サーバーが SDK に求めるもの（`listTools`、`defineTool`、`executeTool`、`traceResourceRead`）です。`createSDK()` が返すオブジェクトは、これを実装しています。

## 構成要素 {#building-blocks}

SDK の構成要素は、独自のセットアップ向けにエクスポートされています。`JevClient`、`DecisionService`、`LLMThoughtGenerator`、`HeuristicController`、`TypedDecisionController`、`TypedHypothesisAssessor`、`PredictionTester`、`applyThought`、`assembleThought`、`assessReadiness`、`rankHypotheses`、`rebuildMentalState`、`describeMentalState`、`fingerprint`、`defineThinkerProfile`、`refineProfile`、`withRetry`、`RetryingLLMProvider`、`OpenAIProvider`、`AnthropicProvider`、`FallbackProvider`、`MonitoredEventStore`、`EmailIncidentNotifier`、`WebhookIncidentNotifier`、`ResendEmailTransport`、`computeRunCost`、`FileEventStore`、`SQLiteEventStore`、`PostgreSQLEventStore`、そしてそれらの主な型です。
