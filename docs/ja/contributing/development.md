# 開発ガイド

## 前提条件 {#prerequisites}

### 必須 {#required}

- **Node.js**：20.0.0 以上（LTS）
- **npm**：Node.js に付属しています
- **TypeScript**：5.3.2 以上（npm でローカルにインストールされます）

### 任意 {#optional}

- **PostgreSQL**：8.11.0 以上（PostgreSQLEventStore を使う場合。ピア依存関係です）
- **Git**：バージョン管理のため

## 環境のセットアップ {#environment-setup}

### 1. リポジトリをクローンする {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. 依存関係をインストールする {#_2-install-dependencies}

```bash
npm install
```

### 3. 環境変数を設定する {#_3-configure-environment-variables}

リポジトリのルートに `.env` ファイルを作成します（任意です。サンプルを動かすときに使います）。

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## ローカルでの開発 {#local-development}

### ビルド {#build}

TypeScript をコンパイルします。

```bash
npm run build
```

コンパイルされたコードは `dist/` に出力されます。

### ウォッチモード {#watch-mode}

ウォッチモードでコンパイルします（ファイルを変更すると、自動で再コンパイルされます）。

```bash
npm run dev
```

### サンプルを実行する {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## テスト {#testing}

### すべてのテストを実行する {#run-all-tests}

```bash
npm test
```

### ウォッチモード {#watch-mode-1}

```bash
npm run test:watch
```

### カバレッジ {#coverage}

```bash
npm run test:coverage
```

### 特定のテストファイルを実行する {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## コードの品質 {#code-quality}

### リント {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### フォーマット {#formatting}

```bash
# Format code
npm run format
```

### まとめてチェックする（リント＋フォーマット） {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## よくある開発作業 {#common-development-tasks}

### 新しいツールを追加する {#adding-a-new-tool}

1. `sdk.defineTool()` でツールを定義します。

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. そのツールをエージェントに追加します。

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### 新しいポリシーを追加する {#adding-a-new-policy}

1. ポリシーを定義します。

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. そのポリシーを適用します。

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### 新しいイベントストアを追加する {#adding-a-new-event-store}

1. `IEventStore` を実装します。

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. SDK でそれを使います。

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### 新しい LLM プロバイダーを追加する {#adding-a-new-llm-provider}

1. `LLMProvider` を実装します。

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

テキストをストリーミングするには（`onText` を指定した実行）、モデルが書くそばから各断片を渡して `request.onTextDelta` を呼び出し、それでも応答全体を返します。ストリーミングできないプロバイダーはこれを無視します。その場合、SDK がテキストを一度に渡します。

```typescript
async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
  let content = '';
  for await (const piece of myModel.stream(request.messages, { signal: request.abortSignal })) {
    content += piece;
    request.onTextDelta?.(piece);
  }
  return { content, model: 'my-model' };
}
```

2. それを `ProviderFactory` に追加します。

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## ビルドの流れ {#build-process}

### TypeScript のコンパイル {#typescript-compilation}

ビルドには、TypeScript コンパイラーをそのまま使います。

```bash
tsc
```

`tsconfig.json` の設定は次のとおりです。
- **ターゲット（Target）**：ES2022
- **モジュール（Module）**：ESNext
- **モジュール解決（Module Resolution）**：node
- **strict モード**：有効
- **ソースマップ**：有効
- **型宣言ファイル**：有効

### 出力の構成 {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## テストの方針 {#testing-strategy}

### ユニットテスト {#unit-tests}

- モジュールごとのユニットテスト
- Vitest を使用
- 実際の有料サービスを呼び出すテストはなく、モジュールのモックやスパイを使うテストもありません。SDK のポートは `src/__tests__/support/` のテストダブルが実装し、HTTP アダプター（OpenAI と Anthropic のプロバイダーを含む）はローカルのサーバーに対して動きます。`no-mocks.test.ts` は `vi.mock`、`vi.fn`、`vi.spyOn` を拒否します

### 統合テスト {#integration-tests}

- 一連のワークフロー全体を通す統合テスト
- モデルは台本どおりに応答するプロバイダーか、ベンダーの形式で応答するローカルのサーバーと通信する本物の OpenAI または Anthropic のクライアントで、実際の API を呼び出すテストはありません
- さまざまなイベントストアでのテスト

### テストの構成例 {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## デバッグ {#debugging}

### ソースマップ {#source-maps}

ソースマップは、ビルドのときに自動で生成されます。これを使うと、TypeScript のコードを直接デバッグできます。

### VS Code でのデバッグ {#vs-code-debugging}

`.vscode/launch.json` の設定は次のとおりです。

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## コードスタイル {#code-style}

### TypeScript のベストプラクティス {#typescript-best-practices}

- **strict モード**：常に有効にします
- **型安全性**：明示的な型を使います
- **`any` は使わない**：`any` は避け、必要なら `unknown` を使います
- **インターフェースか型か**：オブジェクトにはインターフェースを、ユニオン型や交差型には型エイリアスを優先して使います

### 命名規則 {#naming-conventions}

- **ファイル**：ケバブケース（`my-file.ts`）
- **クラス**：パスカルケース（`MyClass`）
- **関数**：キャメルケース（`myFunction`）
- **定数**：大文字のスネークケース（`MY_CONSTANT`）
- **型／インターフェース**：パスカルケース（`MyType`）

### コードの構成 {#code-organization}

- **1 ファイルに 1 つのクラス／インターフェース**
- **型を近くに置く**：型は同じファイルか `types/` に置きます
- **バレルエクスポート**：公開するものは `index.ts` からエクスポートします

## よくある問題 {#common-issues}

### TypeScript のエラー {#typescript-errors}

TypeScript のエラーが出る場合は、次の手順を試してください。

1. `tsconfig.json` が正しいかを確認する
2. すべての依存関係がインストールされているかを確認する
3. クリーンしてから再ビルドする：`npm run clean && npm run build`

### テストの失敗 {#test-failures}

テストが失敗する場合は、次の手順を試してください。

1. `src/__tests__/support/` のテストダブルが、置き換えているインターフェースと今も一致しているかを確認する
2. 依存関係が最新かを確認する
3. ウォッチモードでテストを実行して、エラーをリアルタイムで見る

### ビルドのエラー {#build-errors}

ビルドが失敗する場合は、次の手順を試してください。

1. TypeScript のエラーを確認する：`npm run build`
2. リントのエラーを確認する：`npm run lint`
3. `dist/` フォルダーをクリーンする：`npm run clean`

## リリースの手順 {#release-process}

バージョンは、バージョンタグがプッシュされると `Release` ワークフローによって npm に公開されます。手順は[リリースの手順](./releasing)のページにあります。

### バージョニング {#versioning}

このプロジェクトは、セマンティックバージョニング（SemVer）を使います。
- **MAJOR**：互換性を壊す変更
- **MINOR**：後方互換性のある新機能
- **PATCH**：後方互換性のあるバグ修正

バージョンが `0.` で始まる間は、互換性を壊す変更では代わりに MINOR を上げ（`0.2.0` → `0.3.0`）、それ以外では PATCH を上げます。[リリースの手順](./releasing#release-a-version)を参照してください。

### リリース前のチェックリスト {#pre-release-checklist}

- [ ] すべてのテストが通っている
- [ ] コードがリントされ、フォーマットされている
- [ ] ドキュメントが最新になっている
- [ ] CHANGELOG.md が更新されている
- [ ] `package.json` のバージョンが更新されている
- [ ] ドキュメントに表示されるバージョンが更新されている（`docs/.vitepress/config.mts` の `const version`）

### リリース用のビルド {#build-for-release}

```bash
# The checks of the CI but coverage and the docs build, on a fresh dist/
# (what prepublishOnly runs before npm publish)
npm run clean && npm run verify

# The files that would be published
npm pack --dry-run
```

## リソース {#resources}

- **ドキュメント**：`docs/`
- **サンプル**：`examples/`
- **型定義**：`src/types/`
- **テスト**：`src/__tests__/`

## ドキュメントサイト {#documentation-site}

ドキュメントは `docs/` にある VitePress のサイトで、図には `docs/public/images/` にある SVG を使っています。

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

`Docs` という GitHub Actions のワークフローが、`main` にプッシュされるたびに、サイトを GitHub Pages に公開します。
