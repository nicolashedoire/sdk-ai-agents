# 基本概念

## 概要 {#overview}

SDK AI Agents は、AI エージェントのためのガバナンス基盤です。推論とアクションを分離し、リプレイと監査のためのネイティブなイベントソーシングを提供します。その上に、[認知エージェント](./cognitive-agents) が明示的な推論のレイヤーを、[型付き決定](./typed-decisions) が較正された構造化回答を加えます。

::: info このページで扱う基礎
エージェント、ツール、ケイパビリティ、ポリシー、意図、イベントストア、トレース、リプレイ。これらはガバナンス付きエージェントにも認知エージェントにも同じように当てはまります。
:::

## 基本となる概念 {#fundamental-concepts}

### 1. エージェント {#_1-agent}

**エージェント**（Agent）は、ガバナンスされた意思決定システムです。LLM を使って意図を生成しますが、すべてのアクションは制御されたアクションエンジンを通ります。

**特徴：**
- 最小限の設定（名前、LLM モデル）
- 明示的に宣言されたツール
- ガバナンスのためのポリシー
- 追跡のためのバージョン管理
- ツールを整理するためのケイパビリティ

**例：**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. ツール {#_2-tool}

**ツール**（Tool）は、エージェントが使える、明示的に宣言された機能です。すべてのツールは、使う前に登録しなければなりません（デフォルト拒否）。

**特徴：**
- 必須の Zod 検証スキーマ
- 非同期のハンドラー
- バージョン管理
- ケイパビリティとの関連付け（任意）

**例：**
```typescript
const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    // Implementation
  },
  version: '1.0.0',
  capability: 'math'
})
```

### 3. ケイパビリティ {#_3-capability}

**ケイパビリティ**（Capability）は、複数のエージェントで再利用できる、ツールの論理的なグループです。

**特徴：**
- 名前と説明
- 関連付けられたツールのリスト
- バージョン管理
- 任意のメタデータ

**例（ツール名を使う場合）：**
```typescript
const calculatorTool = sdk.defineTool({ /* ... */ });
const scientificTool = sdk.defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

**例（Tool オブジェクトを直接使う場合）：**
```typescript
const calculatorTool = defineTool({ /* ... */ });
const scientificTool = defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

### 4. ポリシー {#_4-policy}

**ポリシー**（Policy）は、各アクションの前に適用されるガバナンスのルールを定義します。

**ポリシーの種類：**
- **予算（Budget）**：ステップ数またはトークン数の上限
- **タイムアウト（Timeout）**：実行時間の上限
- **許可リスト（Allowlist）**：許可されたツールのリスト
- **カスタム（Custom）**：独自のバリデーター

**例：**
```typescript
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 }
  }],
  scope: 'global',
  enabled: true
})
```

### 5. 意図 {#_5-intention}

**意図**（Intention）は、エージェントが何をしたいかを記述した、LLM が生成する構造体です。それ自体が直接実行されることはありません。

**種類：**
- `tool_call`：特定のツールの呼び出し
- `final_answer`：ユーザーへの最終回答
- `continue`：推論を続ける

**セキュリティ：**
- すべての意図はポリシーエンジンによって検証される
- LLM が直接アクションを起こすことはない
- 完全なトレーサビリティ

### 6. イベントストア {#_6-event-store}

**イベントストア**（Event Store）は、すべての実行についての唯一の信頼できる情報源です。

**特徴：**
- 自動的な永続化（デフォルトは JSON ファイル）
- パフォーマンスのためのバッチ処理
- 完全なエクスポート
- 種類、日付などによるフィルタリング

**主なイベント：**
- `run.started`：実行の開始
- `intention.generated`：LLM が生成した意図
- `policy.checked`：ポリシーのチェック
- `action.executed`：実行されたアクション
- `tool.called`：呼び出されたツール
- `run.completed`：実行の完了
- `run.failed`：実行の失敗
- `run.cancelled`：実行のキャンセル

### 7. トレース {#_7-trace}

**トレース**（Trace）は、1 回の実行全体を、人が読める形で表したものです。

**内容：**
- イベントのタイムライン
- 統計的な要約
- 最終状態
- メタデータ

**例：**
```typescript
const trace = await sdk.getTrace(runId)
console.log(trace.summary)
// {
//   totalEvents: 15,
//   duration: 1234,
//   intentionsGenerated: 3,
//   actionsExecuted: 2,
//   policiesChecked: 2,
//   toolsCalled: 2
// }
```

### 8. リプレイ {#_8-replay}

**リプレイ**（Replay）を使うと、LLM に再び問い合わせることなく、実行全体を再現できます。

**特徴：**
- 決定論的（同じアクションの並び）
- 変更が可能（入力、ポリシー、ツール）
- インシデントのデバッグ
- 非リグレッションテスト

**例：**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## アーキテクチャの原則 {#architectural-principles}

### 1. 推論とアクションの分離 {#_1-reasoning-action-separation}

LLM が生成するのは意図であって、直接のアクションではありません。すべてのアクションはアクションエンジンを通ります。

### 2. デフォルト拒否 {#_2-deny-by-default}

デフォルトでは何も許可されていません。すべてのツールは、何かがそれを実行できるようになる前に、明示的に宣言（登録）しなければなりません。

::: warning ガバナンス付きエージェントの範囲
ガバナンス付きエージェントは、モデルが名前を挙げた **SDK に登録済みのどのツールでも** 実行できます。エージェントの `tools` リストが決めるのは、モデルに何を提示するかであって、何を呼び出してよいかではありません。`allowlist` ポリシーで制限してください。それ以外のツールは実行前に拒否されます。

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

認知エージェントと MCP サーバーは、自動的にそれぞれのツールリストに制限されます。
:::

### 3. ネイティブなイベントソーシング {#_3-native-event-sourcing}

イベントソーシングのおかげで、すべての実行はトレースでき、リプレイできます。

### 4. 組み込みのガバナンス {#_4-built-in-governance}

ポリシーはオプションとしてではなく、構造的に適用されます。

### 5. 完全なバージョン管理 {#_5-full-versioning}

エージェント、ツール、ケイパビリティは、追跡とトレーサビリティのためにバージョン管理されます。

## 典型的なワークフロー {#typical-workflow}

1. **初期化**：API キーを使って SDK を作成する
2. **定義**：ツールとケイパビリティを定義する
3. **設定**：ツールとポリシーを指定してエージェントを作成する
4. **実行**：入力を与えてエージェントを実行する
5. **観察**：実行のトレースを確認する
6. **リプレイ**：デバッグやテストのためにリプレイする

## ベストプラクティス {#best-practices}

### ツール {#tools}
- 厳密な Zod スキーマを使う
- 各ツールを明確にドキュメント化する
- 変更したらツールのバージョンを上げる

### ポリシー {#policies}
- 妥当な予算を適用する
- 厳格な許可リストを使う
- 本番環境の前にポリシーをテストする

### ケイパビリティ {#capabilities}
- ツールを論理的にグループ化する
- ケイパビリティをエージェント間で再利用する
- ケイパビリティをドキュメント化する
- **推奨ワークフロー：** `defineCapability()` には、ツール名（文字列）と Tool オブジェクトのどちらでも直接渡せます。Tool オブジェクトを渡した場合は、自動的に登録されます。

### バージョン管理 {#versioning}
- セマンティックバージョニングを使う
- バージョンの変更をドキュメント化する
- イベントでバージョンを追跡する

## セキュリティ {#security}

- **デフォルト拒否**：宣言されていないツールは実行できない
- **検証**：すべての入力は Zod で検証される
- **ポリシー**：すべてのアクションの前にチェックされる
- **トレーサビリティ**：すべてのアクションがトレースされる
- **監査**：完全な監査のためにリプレイを利用できる
