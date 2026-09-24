# プロジェクト概要

**種類：** ライブラリ（TypeScript SDK）
**アーキテクチャ：** 関心の分離をともなうイベントソーシング

## 要約 {#executive-summary}

SDK_AI_Agents は、ネイティブなイベントソーシング、リプレイ、設計段階から組み込まれたセキュリティを備えた、AI エージェントのためのガバナンス基盤です。この SDK は、AI エージェントを実験的なツールから、ガバナンスでき、説明でき、本番環境で使える意思決定システムへと変えます。

## プロジェクトの分類 {#project-classification}

- **リポジトリの種類：** モノリス（まとまりのある単一のコードベース）
- **プロジェクトの種類：** ライブラリ（TypeScript SDK）
- **主な言語：** TypeScript 5.x
- **アーキテクチャパターン：** 関心の分離をともなうイベントソーシング（推論エンジン ≠ アクションエンジン）

## 技術スタックの概要 {#technology-stack-summary}

| カテゴリー | 技術 | バージョン | 選んだ理由 |
|----------|-----------|---------|---------------|
| 言語 | TypeScript | 5.3.2+ | 厳密な型安全性、ESM への対応 |
| ランタイム | Node.js | 20.0.0+ | LTS のサポート、最新の機能 |
| パッケージマネージャー | npm | - | Node.js の標準のパッケージマネージャー |
| ビルドツール | TypeScript コンパイラー | 5.3.2 | TypeScript のネイティブなコンパイル |
| テスト | Vitest | 1.0.4 | Vite をベースにした高速なテストランナー |
| リント／フォーマット | Biome | 1.7.0 | 高速なオールインワンのツール |
| LLM プロバイダー | OpenAI SDK | 4.20.0 | OpenAI API との統合 |
| LLM プロバイダー | Anthropic SDK | 0.71.2 | Claude API との統合 |
| 検証 | Zod | 3.22.4 | ツールの入力のスキーマ検証 |
| UUID | uuid | 9.0.1 | 一意な ID の生成 |
| データベース（任意） | PostgreSQL | 8.11.0+ | 本番環境用のイベントストア（ピア依存関係） |

## 主な機能 {#key-features}

### 中核となる機能 {#core-capabilities}

1. **ネイティブなイベントソーシング**
   - すべてのイベントがイベントストアに永続化される
   - LLM を呼び出さない、決定論的なリプレイ
   - すべての決定の完全なトレーサビリティ

2. **推論とアクションの分離**
   - 推論エンジン：意図を生成する（副作用なし）
   - アクションエンジン：検証の後に意図を実行する
   - 設計によるセキュリティ：LLM が直接副作用を起こすことは決してない

3. **組み込みのガバナンス**
   - ポリシーエンジン：実行前に意図を検証する
   - 予算トラッカー：エージェント、ツール、期間ごとにコストと使用量を追跡する
   - 承認マネージャー：重要なアクションのための、人による承認のワークフロー
   - 監査証跡：ポリシーの判断の完全なトレーサビリティ

4. **複数の LLM プロバイダー**
   - OpenAI と Anthropic のための LLMProvider による抽象化
   - プロバイダー間の自動フォールバック
   - プロバイダーごとの設定（temperature、maxTokens）

5. **認知の可観測性**
   - 推論グラフ：推論の過程の可視化
   - 代替案の分析：エージェントが検討したほかの選択肢
   - 決定パターン：複数の実行にわたる決定のパターン
   - トレースの可視化：可視化のためのトレースの準備

6. **テストと品質保証**
   - ゴールデントレース：テストのための、基準となるトレース
   - リグレッション検出：リグレッションの自動検出
   - アサーション：トレースに対する振る舞いのアサーション
   - CI/CD との統合：テスト結果のエクスポート（JUnit XML、JSON）

7. **高度な可観測性**
   - 実行の比較：2 つの実行を比べる
   - 影響分析：デプロイ前後の影響の分析
   - 高度なイベントフィルタリング：JSON パスを使った、イベントの高度なフィルタリング

## アーキテクチャの要点 {#architecture-highlights}

### イベントストアの抽象化 {#event-store-abstraction}

- **IEventStore**：すべてのイベントストアに共通のインターフェース
- **FileEventStore**：ファイルベースの実装（MVP 版）
- **SQLEventStore**：汎用の SQL 実装
- **SQLiteEventStore**：SQLite による実装
- **PostgreSQLEventStore**：JSONB を使った、PostgreSQL による実装

### エンジンの構成 {#engine-architecture}

- **ReasoningEngine**：LLM から意図を生成する
- **ActionEngine**：検証の後に意図を実行する
- **PolicyEngine**：ポリシーに照らして意図を検証する
- **ReplayEngine**：イベントから実行をリプレイする

### レジストリの仕組み {#registry-system}

- **ToolRegistry**：利用可能なツールを管理する
- **CapabilityRegistry**：ケイパビリティ（ツールのグループ）を管理する

### マネージャーの仕組み {#manager-system}

- **ApprovalManager**：人による承認の管理
- **BudgetTracker**：予算と使用量の追跡
- **GoldenTraceManager**：ゴールデントレースの管理
- **RegressionTestManager**：リグレッションテストスイートの管理
- **AssertionManager**：振る舞いのアサーションの管理
- **ImpactAnalysisManager**：影響分析の管理

## 開発の概要 {#development-overview}

### 前提条件 {#prerequisites}

- Node.js 20.0.0 以上（LTS）
- npm または同等のツール
- TypeScript 5.3.2 以上（ローカルにインストール）

### はじめよう {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### 主なコマンド {#key-commands}

- **インストール：** `npm install`
- **ビルド：** `npm run build`
- **開発：** `npm run dev`（ウォッチモード）
- **テスト：** `npm test`
- **テスト（ウォッチ）：** `npm run test:watch`
- **テストカバレッジ：** `npm run test:coverage`
- **リント：** `npm run lint`
- **フォーマット：** `npm run format`
- **チェック：** `npm run check`（リントとフォーマット）

## リポジトリの構成 {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

`src/` の詳細は [ソースツリー](../contributing/source-tree) を参照してください。

## ドキュメントマップ {#documentation-map}

詳しい情報は、次のページを参照してください。

- [イントロダクション](../guide/introduction)：この SDK が何のためにあるか
- [ソースツリー](../contributing/source-tree)：ディレクトリの構成
- [アーキテクチャ](./architecture)：アーキテクチャの詳細
- [開発ガイド](../contributing/development)：開発のワークフロー
