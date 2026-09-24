# アーキテクチャ

![SDK のアーキテクチャ](/images/architecture.svg){.illustration}

## 認知レイヤー（v0.2） {#cognitive-layer-v0-2}

バージョン 0.2 では、以下で説明するガバナンス付きランタイムの上に、推論のレイヤーが加わりました。このレイヤーは、小さく交換可能な部品で組み立てられています。

| 構成要素 | モジュール | 役割 |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | 実行ループ、キャンセル、タイムアウト、フィードバック |
| `OperationSelector` | `src/cognition/operation-selector.ts` | 利用可能なオペレーションを計算し、コントローラーに問い合わせ、最後には決定を強制する |
| コントローラー | `src/cognition/cognitive-controller.ts`、`typed-decision-controller.ts` | ヒューリスティック、または Jev による次のオペレーションの選択 |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | 思考ジェネレーター、情報探索器、予測テスター、アセッサーのいずれかに処理を振り分ける |
| パッチの受け入れ | `src/cognition/patch-admission.ts`、`thought-fields.ts`、`thought-patch.ts` | すべての思考の唯一の入り口：オペレーションごとに許可されるフィールド、エンジンだけが書き込めるフィールド、決定の裁定 |
| 証拠 | `src/cognition/observation-records.ts`、`evidence-transitions.ts`、`contradiction-transitions.ts` | 観測の出所、事実の改訂、比較、テスト結果、矛盾とその解決 |
| 状態ビュー | `src/cognition/mental-state-view.ts` | 思考のプロンプトとコントローラー用データセットのための、状態のコンパクトなビュー：準備状況、順位付け、すでに行った実験 |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | 保留中の予測に対してあなたの `OutcomeEvaluator` を実行し、そのレポートを記録する |
| 結論ガード | `src/cognition/decision-readiness.ts` | 順位付け、準備完了チェック、確定／暫定／判断保留 |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`、`thought-prompts.ts` | オペレーションごとに 1 つのプロンプト、厳密な JSON、Zod による検証、1 回の修復 |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | ネイティブの推論エンジンによるツールの選択と、アクションエンジンを通した実行 |
| リデューサー | `src/cognition/mental-state-reducer.ts`、`hypothesis-transitions.ts` | 不変条件を守りながら、思考パッチを純粋かつ決定論的に適用する。`schemaVersion` でバージョン管理される |
| リプレイ | `src/cognition/mental-state-replay.ts` | イベントからの心的状態の再構築と、コントローラー用データセットの作成 |
| プロファイル | `src/cognition/thinker-profile.ts`、`profile-distiller.ts`、`profile-learning.ts` | プロファイルのスキーマ、プロンプトへの書き出し、洗練、抽出 |
| アセッサー | `src/cognition/hypothesis-assessor.ts` | 型付き決定による `compare`：証拠については思考者のプロファイルなしで問い、適合度は提案についてだけ問う |
| レコーダーとファクトリー | `src/cognition/cognitive-run-recorder.ts`、`create-cognitive-agent.ts` | 認知エージェントの実行が記録するイベントの形。設定と SDK のサービスからエージェントを組み立てる |

その周りには、`src/decisions`（型付き決定、Jev クライアント、決定サービス）、`src/costs`（料金表と実行のコスト）、`src/resilience`（リトライポリシーと、リトライするプロバイダー）、`src/incidents`（ルール、通知手段、監視付きのイベントストア）、`src/mcp`（サーバーとクライアント。`@sdk-ai-agents/core/mcp` として公開）があります。

このページの残りの部分では、ガバナンス付きランタイム（v0.1）について説明します。

## 要約 {#executive-summary}

SDK_AI_Agents は、推論とアクションを厳密に分離した、イベントソーシングのアーキテクチャを採用しています。SDK は、内部の複雑さを、シンプルで直感的な API の裏に隠しています。

## アーキテクチャパターン {#architecture-pattern}

**主なパターン：** 関心の分離をともなうイベントソーシング

- **推論エンジン（Reasoning Engine）**：LLM から意図を生成する（副作用なし）
- **アクションエンジン（Action Engine）**：検証の後に意図を実行する
- **ポリシーエンジン（Policy Engine）**：ポリシーに照らして意図を検証する
- **イベントストア（Event Store）**：すべてのイベントについての唯一の信頼できる情報源

## コンポーネントの概要 {#component-overview}

### 1. SDK API レイヤー（ファサード） {#_1-sdk-api-layer-facade}

**役割：**
- シンプルで直感的な公開インターフェース
- API から内部イベントへの対応付け
- よく考えられたデフォルト設定
- SDK とエージェントのライフサイクル管理

**ファイル：**
- `src/sdk.ts`：メインの実装（`SDKImpl`）
- `src/agent.ts`：エージェントの実装（`AgentImpl`）
- `src/index.ts`：公開エクスポート

**主なインターフェース：**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. 推論エンジン {#_2-reasoning-engine}

**役割：**
- LLM プロバイダー（OpenAI／Anthropic）との統合
- LLM の応答からの、構造化された意図の生成
- 会話のコンテキストの管理
- 推論イベントの発行

**ファイル：** `src/engines/reasoning-engine.ts`

**制約：**
- ツールを直接実行することは決してできない
- 副作用を起こすことは決してできない
- 構造化された意図を生成するだけ

**依存関係：**
- LLM プロバイダー（Strategy パターン）
- イベントストア（イベントの発行）

### 3. アクションエンジン {#_3-action-engine}

**役割：**
- 意図の受け取りと検証
- ツールレジストリを介したツールの実行
- ポリシーエンジンを介したポリシーの適用
- アクションイベントの発行

**ファイル：** `src/engines/action-engine.ts`

**制約：**
- すべてのアクションはアクションエンジンを通らなければならない
- 実行前の検証が必須
- すべてのアクションについてイベントを発行する

**依存関係：**
- ポリシーエンジン（検証）
- ツールレジストリ（実行）
- イベントストア（イベントの発行）
- 承認マネージャー（任意）
- 予算トラッカー（任意）

### 4. ポリシーエンジン {#_4-policy-engine}

**役割：**
- 有効なポリシーに照らした意図の検証
- グローバルなポリシーと個別のポリシーの適用
- 予算、タイムアウト、許可リストのチェック
- 検証イベントの発行

**ファイル：** `src/engines/policy-engine.ts`

**制約：**
- デフォルト拒否：明示的に許可されていない限り、すべて禁止される
- すべてのアクションの前に必ずチェックする

**依存関係：**
- イベントストア（検証イベントの発行）
- 予算トラッカー（任意）
- 条件評価器（Condition Evaluator）

### 5. リプレイエンジン {#_5-replay-engine}

**役割：**
- 永続化されたイベントからの、実行のリプレイ
- LLM を呼び出さない、決定論的なリプレイ
- 新しいリプレイイベントの生成

**ファイル：** `src/engines/replay-engine.ts`

**制約：**
- リプレイは永続化されたイベントだけを使う
- リプレイ中に LLM を呼び出すことはない
- リプレイは同じ論理的な流れを再現する

**依存関係：**
- イベントストア（イベントの読み取り）
- アクションエンジン（意図の実行）

### 6. イベントストア {#_6-event-store}

**役割：**
- イベントの永続化（追記のみ）
- runId によるイベントの取得
- イベントのフィルタリングと検索
- さまざまな実装のための抽象化

**ファイル：**
- `src/stores/event-store.ts`：`IEventStore` インターフェース
- `src/stores/file-event-store.ts`：ファイルベースの実装
- `src/stores/sql-event-store.ts`：汎用の SQL 実装
- `src/stores/sqlite-event-store.ts`：SQLite による実装
- `src/stores/postgresql-event-store.ts`：PostgreSQL による実装
- `src/stores/observed-event-store.ts`：追加された各イベントをリアルタイムでリスナーに届ける（`onEvent`、`sdk.subscribe`）

**インターフェース：**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
  subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): EventSubscription
}
```

### 7. ツールレジストリ {#_7-tool-registry}

**役割：**
- 宣言されたツールの管理
- 入力スキーマの検証（Zod）
- 検証をともなうツールの実行
- 厳格な許可リスト（デフォルト拒否）

**ファイル：** `src/registry/tool-registry.ts`

**制約：**
- 宣言されていないツールは自動的に拒否される
- 実行前の検証が必須
- 厳格な許可リスト

**依存関係：**
- Zod（スキーマ検証）

### 8. ケイパビリティレジストリ {#_8-capability-registry}

**役割：**
- ケイパビリティ（ツールのグループ）の管理
- ツールとケイパビリティの関連付け（ツール ↔ ケイパビリティ）

**ファイル：** `src/registry/capability-registry.ts`

### 9. LLM プロバイダーの抽象化 {#_9-llm-provider-abstraction}

**役割：**
- LLM プロバイダー間の違いを抽象化する
- リクエストとレスポンスの形式の正規化
- 複数のプロバイダーへの対応（OpenAI、Anthropic）
- 自動フォールバック

**ファイル：**
- `src/providers/llm-provider.ts`：`LLMProvider` インターフェース
- `src/providers/openai-provider.ts`：OpenAI の実装
- `src/providers/anthropic-provider.ts`：Anthropic の実装
- `src/providers/fallback-provider.ts`：フォールバック付きのプロバイダー
- `src/providers/provider-factory.ts`：プロバイダーを作成するファクトリー

**インターフェース：**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. マネージャークラス {#_10-manager-classes}

**役割：**
- 高度な機能の管理
- コンポーネント間の調整

**ファイル：**
- `src/managers/approval-manager.ts`：人による承認の管理
- `src/managers/budget-tracker.ts`：予算と使用量の追跡
- `src/managers/golden-trace-manager.ts`：ゴールデントレースの管理
- `src/managers/regression-test-manager.ts`：テストスイートの管理
- `src/managers/assertion-manager.ts`：アサーションの管理
- `src/managers/impact-analysis-manager.ts`：影響分析の管理

## データアーキテクチャ {#data-architecture}

### イベントの種類 {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';
```

### イベントの構造 {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### イベントストアの実装 {#event-store-implementations}

1. **FileEventStore**（MVP 版）
   - ファイルベースの永続化
   - runId ごとに 1 つの JSON ファイル
   - バッチでの自動的な書き出し

2. **SQLEventStore**（本番環境向け）
   - 汎用の SQL 実装
   - SQLite と PostgreSQL に対応
   - パフォーマンスのためのインデックス

3. **PostgreSQLEventStore**（高度な本番環境向け）
   - 効率的な保存のために JSONB を使う
   - JSON クエリのための GIN インデックス
   - 高度なクエリに対応

## API の設計 {#api-design}

### SDK の初期化 {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### エージェントの作成 {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### ツールの定義 {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### エージェントの実行 {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## テスト戦略 {#testing-strategy}

### ユニットテスト {#unit-tests}

- モジュールごとのユニットテスト
- Vitest を使用
- 外部依存のモック化

### 統合テスト {#integration-tests}

- ワークフロー全体の統合テスト
- さまざまなイベントストアを使ったテスト
- リプレイのテスト

### ゴールデントレース {#golden-traces}

- リグレッションテストのための、基準となるトレース
- リプレイによる振る舞いの検証
- リグレッションの自動検出

## デプロイのアーキテクチャ {#deployment-architecture}

### パッケージの配布 {#package-distribution}

- **パッケージ名**：`@sdk-ai-agents/core`
- **配布方法**：npm
- **エントリーポイント**：`dist/index.js`
- **型定義**：`dist/index.d.ts`

### ビルドの手順 {#build-process}

1. TypeScript のコンパイル（`tsc`）
2. ソースマップを生成する
3. 型宣言ファイルを生成する
4. `dist/` に出力する

### 依存関係 {#dependencies}

**ランタイム：**
- `openai`：^4.20.0
- `@anthropic-ai/sdk`：^0.71.2
- `uuid`：^9.0.1
- `zod`：^3.22.4

**ピア依存関係：**
- `pg`：^8.11.0（PostgreSQLEventStore 用）

**開発時の依存関係：**
- `typescript`：^5.3.2
- `vitest`：^1.0.4
- `@biomejs/biome`：^1.7.0

## セキュリティに関する考慮事項 {#security-considerations}

### デフォルト拒否 {#deny-by-default}

- すべてのツールは明示的に宣言しなければならない
- すべてのアクションはポリシーエンジンを通らなければならない
- 実行前の検証が必須

### 関心の分離 {#separation-of-concerns}

- 推論エンジンはツールを実行できない
- アクションエンジンは実行前に検証する
- ポリシーエンジンはすべてのアクションをチェックする

### 監査証跡 {#audit-trail}

- すべてのイベントが永続化される
- 決定の完全なトレーサビリティ
- ポリシーの監査証跡

## パフォーマンスに関する考慮事項 {#performance-considerations}

### イベントストアのパフォーマンス {#event-store-performance}

- FileEventStore：バッチでの書き出し（10 イベントごと、または 100ms ごと）
- SQLEventStore：高速なクエリのためのインデックス
- PostgreSQLEventStore：JSONB と GIN インデックス

### SDK のオーバーヘッド {#sdk-overhead}

- 最小限のオーバーヘッド（LLM とツールを除いて 5〜10ms 未満）
- 非同期のイベント発行
- パフォーマンスのためのバッチでの書き出し

## 今後の検討事項 {#future-considerations}

### スケーラビリティ {#scalability}

- 分散型のイベントストア（Kafka のようなもの）への移行
- 複数インスタンスへの対応
- イベントストアのクラスタリング

### 機能 {#features}

- ほかの LLM プロバイダーへの対応
- クラウド上のイベントストア（S3 など）
- 監視ダッシュボード
