# ソースツリー

## 概要 {#overview}

SDK は、責務をはっきり分けた、わかりやすいモジュール構造になっています。メインのソースコードは `src/` にあり、機能の領域ごとにサブフォルダーが分かれています。

## ディレクトリ構成の全体 {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## 重要なディレクトリ {#critical-directories}

### `src/engines/` {#src-engines}

**目的：** エージェントのライフサイクルを取りまとめる、SDK の主要なエンジンが入っています。

**内容：**
- `reasoning-engine.ts`：LLM から意図を生成します（副作用はありません）
- `action-engine.ts`：ポリシーエンジンによる検証の後で、意図を実行します
- `policy-engine.ts`：設定されたポリシーに照らして、意図を検証します
- `replay-engine.ts`：永続化されたイベントから、実行をリプレイします

**エントリーポイント：** `AgentImpl` と `SDKImpl` から使われます

**統合：** エンジンは、コンストラクターを通じて `AgentImpl` と `SDKImpl` に注入されます

### `src/stores/` {#src-stores}

**目的：** イベントを永続化するための、`IEventStore` インターフェースの実装です。

**内容：**
- `event-store.ts`：共通の `IEventStore` インターフェース
- `file-event-store.ts`：ファイルを使う実装（MVP）
- `sql-event-store.ts`：汎用の SQL 実装
- `sqlite-event-store.ts`：SQLite の実装
- `postgresql-event-store.ts`：JSONB を使う PostgreSQL の実装
- `observed-event-store.ts`：追加された各イベントをリアルタイムでリスナーに届ける（`onEvent`、`sdk.subscribe`）

**エントリーポイント：** `SDKImpl` と `ReplayEngine` から使われます

**統合：** 設定を通じて `SDKImpl` に注入されます

### `src/providers/` {#src-providers}

**目的：** さまざまな LLM プロバイダーに対応する、`LLMProvider` インターフェースの実装です。

**内容：**
- `llm-provider.ts`：共通の `LLMProvider` インターフェース
- `openai-provider.ts`：OpenAI の実装
- `anthropic-provider.ts`：Anthropic の実装
- `fallback-provider.ts`：自動フォールバック付きのプロバイダー
- `provider-factory.ts`：プロバイダーを作成するためのファクトリー

**エントリーポイント：** `ReasoningEngine` から使われます

**統合：** コンストラクターを通じて `ReasoningEngine` に注入されます

### `src/managers/` {#src-managers}

**目的：** 高度な機能（承認、予算、テストなど）を管理するクラスです。

**内容：**
- `approval-manager.ts`：人による承認の管理
- `budget-tracker.ts`：予算と使用量の追跡
- `golden-trace-manager.ts`：ゴールデントレースの管理
- `regression-test-manager.ts`：リグレッションテストスイートの管理
- `assertion-manager.ts`：振る舞いについてのアサーションの管理
- `impact-analysis-manager.ts`：影響分析の管理

**エントリーポイント：** `SDKImpl` と `PolicyEngine` から使われます

**統合：** コンストラクターを通じて `SDKImpl` と `PolicyEngine` に注入されます

### `src/registry/` {#src-registry}

**目的：** 利用できるツールとケイパビリティを管理するためのレジストリです。

**内容：**
- `tool-registry.ts`：利用できるツールの管理（デフォルト拒否）
- `capability-registry.ts`：ケイパビリティの管理（ツールのグループ）

**エントリーポイント：** `SDKImpl` と `ActionEngine` から使われます

**統合：** コンストラクターを通じて `SDKImpl` と `ActionEngine` に注入されます

### `src/types/` {#src-types}

**目的：** SDK のすべての型の TypeScript 定義です。

**内容：**
- エージェント（Agent）、ツール（Tool）、ポリシー（Policy）、イベント（Event）、実行（Run）、SDK の型
- 高度な機能（推論グラフ、代替案など）のための型
- テストのための型（ゴールデントレース、リグレッション、アサーションなど）

**エントリーポイント：** すべてのモジュールからインポートされます

**統合：** 型安全性のために、コードベース全体で使われます

### `src/utils/` {#src-utils}

**目的：** ユーティリティ関数とヘルパーです。

**内容：**
- `constants.ts`：グローバルな定数
- `id.ts`：一意な ID の生成
- `zod-to-json-schema.ts`：Zod から JSON Schema への変換
- 推論グラフ、代替案、パターンなどのためのユーティリティ
- テストのためのユーティリティ（検証、リグレッション、アサーションなど）

**エントリーポイント：** それを必要とするモジュールからインポートされます

**統合：** エンジン、マネージャー、その他のモジュールから使われます

### `src/cognition/`（v0.2） {#src-cognition-v0-2}

**目的：** 認知エージェントです。明示的な心的状態、認知オペレーション、コントローラー、思考者プロファイルを扱います。

**内容：** `cognitive-agent.ts`（実行ループ）、`operation-selector.ts`、`operation-performer.ts`、`cognitive-controller.ts`（ヒューリスティック）、`typed-decision-controller.ts`（Jev）、`hypothesis-assessor.ts`、`information-seeker.ts`、`llm-thought-generator.ts` と `thought-prompts.ts`、`mental-state.ts`（スキーマと型）、`mental-state-reducer.ts` と `hypothesis-transitions.ts`、`mental-state-replay.ts`、`thinker-profile.ts`、`profile-distiller.ts`、`create-cognitive-agent.ts`。

### `src/decisions/`（v0.2） {#src-decisions-v0-2}

**目的：** 型付き決定です。Noul／Choice／Score の契約、TypeSafe Jev の HTTP クライアント、そして `sdk.decisions` の裏で動く `DecisionService` が入っています。

### `src/costs/`、`src/resilience/`、`src/incidents/`（v0.2） {#src-costs-src-resilience-src-incidents-v0-2}

**目的：** 料金表と、実行ごとのコストレポート。リトライポリシーと、リトライを行う LLM プロバイダー。インシデントのルール、通知手段（メール、Webhook、Resend）、そして監視付きのイベントストアです。

### `src/mcp/` と `src/mcp.ts`（v0.2） {#src-mcp-and-src-mcp-ts-v0-2}

**目的：** ガバナンス付きのツールとリソースを公開する MCP サーバー（`mcp-server.ts`、`mcp-resources.ts`、`governed-tool-host.ts`）と、ツールを取り込む MCP クライアント（`mcp-client.ts`）です。`@sdk-ai-agents/core/mcp` という別のエントリーポイントとして公開されるので、コアパッケージが `@modelcontextprotocol/sdk` に依存することはありません。

### `src/tools/` {#src-tools}

**目的：** あるシステムから `ToolDefinition` を組み立てるツールソースで、MCP には依存しません。`openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts`（Web API）、`folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts`（フォルダーとリソース）、`sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts`（読み取り専用のデータベース）、`agent-tools.ts`（ツールとしてのエージェント）、さらに `tool-names.ts` と `bounded-text.ts` があります。

### `src/__tests__/support/` {#src-tests-support}

**目的：** SDK のポートを実装するテストダブルです（台本どおりに応答する LLM プロバイダー、メモリ上で動く決定クライアント、ローカルの HTTP サーバー、受け取った呼び出しを記録する PostgreSQL クライアント、`node:sqlite` のローダー）。モジュールのモックは使いません。

## エントリーポイント {#entry-points}

### メインのエントリーポイント {#main-entry}

- **`src/index.ts`**：SDK の公開エントリーポイントで、すべての公開 API をエクスポートします

### アプリケーションのエントリーポイント {#application-entry-points}

- **`src/sdk.ts`**：SDK のメインの実装（`SDKImpl`）
- **`src/agent.ts`**：エージェントの実装（`AgentImpl`）

## ファイル構成のパターン {#file-organization-patterns}

### 命名規則 {#naming-conventions}

- **ファイル**：ファイル名はケバブケース（kebab-case）（例：`reasoning-engine.ts`）
- **クラス**：パスカルケース（PascalCase）（例：`ReasoningEngine`）
- **インターフェース**：パスカルケースで、必要に応じて接頭辞 `I` を付けます（例：`IEventStore`）
- **型**：パスカルケース（例：`EventType`、`RunStatus`）
- **関数**：キャメルケース（camelCase）（例：`generateCompletion`）

### モジュールの構成 {#module-organization}

- **1 ファイルに 1 つのクラス／インターフェース**：各ファイルには、メインとなるクラスかインターフェースを 1 つだけ置きます
- **型を近くに置く**：関連する型は、同じファイルか `types/` に置きます
- **バレルエクスポート**：公開 API は `index.ts` からエクスポートします

## 設定ファイル {#configuration-files}

- **`package.json`**：依存関係と npm スクリプト
- **`tsconfig.json`**：TypeScript の設定（strict モード、ESM）
- **`biome.json`**：Biome の設定（リントとフォーマット）
- **`vitest.config.ts`**：Vitest の設定（テスト）

## 開発のためのメモ {#notes-for-development}

### 新しい機能を追加する {#adding-new-features}

1. **新しいエンジン**：`src/engines/` に作成し、`SDKImpl` か `AgentImpl` に注入します
2. **新しいストア**：`src/stores/` で `IEventStore` を実装します
3. **新しいプロバイダー**：`src/providers/` で `LLMProvider` を実装します
4. **新しいマネージャー**：`src/managers/` に作成し、`SDKImpl` に注入します
5. **新しい型**：`src/types/` に追加し、`types/index.ts` からエクスポートします

### テスト {#testing}

- ユニットテストは `src/__tests__/` に置きます
- ソースのモジュールごとに、テストファイルを 1 つ用意します
- テストには Vitest を使います

### ビルド {#build}

- TypeScript が `src/` を `dist/` にコンパイルします
- デバッグ用に、ソースマップが生成されます
- TypeScript の型宣言（`.d.ts`）が生成されます
