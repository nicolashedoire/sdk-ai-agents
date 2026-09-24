# ガバナンス付きエージェント

ガバナンス付きエージェントは、従来のツール呼び出しループを実行します。ただし、ひとひねりあります。**LLM は意図を提案するだけ** なのです。何かが起きる前に、アクションエンジンがすべての意図をスキーマとポリシーに照らして検証し、すべてのステップを記録します。このページでは、ツール、ケイパビリティ、ポリシー、トレース、リプレイ、実行の停止を順に説明します。

::: tip 行動する前に推論する
答えが一つに定まらない決定には、[認知エージェント](./cognitive-agents) を選んでください。同じツール、ポリシー、トレースを共有しています。
:::

## 前提条件 {#prerequisites}

- Node.js 20 以上がインストールされていること
- OpenAI の API キー（または別の LLM プロバイダー）
- TypeScript／JavaScript の基本的な知識

## インストール {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 5 分で最初のエージェント {#first-agent-in-5-minutes}

### ステップ 1：SDK を初期化する {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### ステップ 2：ツールを定義する {#step-2-define-a-tool}

ツールは、エージェントが使える機能です。明示的に宣言しなければなりません。

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### ステップ 3：エージェントを作成する {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
});
```

### ステップ 4：エージェントを実行する {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### ステップ 5：トレースを見る {#step-5-view-the-trace}

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## 完全な例（10 行） {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## 主要な概念 {#key-concepts}

### 1. ツール {#_1-tools}

エージェントが実行できるアクションは、ツールだけです。**デフォルトでは何も許可されていません**（デフォルト拒否）。ツールは、何かがそれを実行できるようになる前に登録しなければなりません。

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

**特徴：**
- Zod スキーマによる明示的な定義
- 入力の自動検証
- バージョン管理に対応
- 完全なトレーサビリティ

**例：**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. ケイパビリティ {#_2-capabilities}

ケイパビリティを使うと、ツールを論理的にグループ化して再利用できます。

**例：**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  capabilities: ['math'],
});
```

### 3. ポリシー {#_3-policies}

ポリシーは、エージェントが何をできるかを制御します。

**ポリシーの種類：**
- **予算（Budget）**：ステップ数またはトークン数の上限
- **タイムアウト（Timeout）**：実行時間の上限
- **許可リスト（Allowlist）**：許可されたツールのリスト
- **カスタム（Custom）**：独自のバリデーター

**例：**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

予算と時間の制限は、ガバナンス付きエージェントの実行でツールを呼び出す前に毎回、その実行の進み具合に照らして確認されます。`maxSteps` はすでに済んだステップ数（最初の呼び出しはステップ 0）、`maxTokens` はモデル呼び出しで使ったトークン数、`maxDuration` は実行開始からの経過時間です。制限はツール呼び出しを拒否し、その結果、実行は失敗します。モデル呼び出しを途中で止めることはありません。期間ごとのトークン予算と費用予算（`maxTokens` または `maxCost` を指定した `budgetLimit`）は、ガバナンス付きエージェントのモデル呼び出しのトークンと費用を数えます。リプレイでも、元の実行と同じように `maxSteps`、`maxTokens`、`maxDuration` が適用されます（期間ごとの予算は現在の期間の使用量を見ます）。認知エージェントには独自の制限（`maxSteps`、`maxToolCalls`、`timeoutMs`）があります。

### 4. トレース {#_4-traces}

すべての実行は、リプレイ可能な完全なトレースを生成します。

**トレースを取得する：**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**トレースをエクスポートする：**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. リプレイ {#_5-replay}

LLM に再び問い合わせることなく、実行をリプレイします。

**シンプルなリプレイ：**
```typescript
const replayResult = await sdk.replay(runId);
```

**変更を加えたリプレイ：**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. 実行の停止 {#_6-stopping-execution}

進行中の実行を停止します。

**エージェントから：**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**SDK から：**
```typescript
await sdk.stopRun(runId);
```

## 典型的なワークフロー {#typical-workflow}

1. API キーを使って **SDK を初期化する**
2. ユースケースに必要な **ツールを定義する**
3. **ケイパビリティを作成する**（任意。整理のため）
4. ガバナンスのために **ポリシーを設定する**
5. ツールとポリシーを指定して **エージェントを作成する**
6. 入力を与えて **エージェントを実行する**
7. 何が起きたかを理解するために **トレースを分析する**
8. デバッグのために **必要に応じてリプレイする**

## ベストプラクティス {#best-practices}

### ツール {#tools}
- ✅ 厳密な Zod スキーマを使う
- ✅ 各ツールを明確にドキュメント化する
- ✅ エラーを適切に処理する
- ✅ 変更したらツールのバージョンを上げる

### ポリシー {#policies}
- ✅ 妥当な予算を適用する
- ✅ 厳格な許可リストを使う
- ✅ 本番環境の前にポリシーをテストする
- ✅ ポリシーをドキュメント化する

### ケイパビリティ {#capabilities}
- ✅ ツールを論理的にグループ化する
- ✅ ケイパビリティをエージェント間で再利用する
- ✅ ケイパビリティをドキュメント化する

### セキュリティ {#security}
- ✅ **デフォルト拒否**：宣言されていないツールは実行できない
- ✅ 検証：すべての入力は Zod で検証される
- ✅ ポリシー：すべてのアクションの前にチェックされる
- ✅ トレーサビリティ：すべてのアクションがトレースされる

## 例 {#examples}

### 最小の例 {#minimal-example}
[`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts) を参照してください。

### 完全な例 {#complete-example}
すべての機能については [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) を参照してください。

## 次のステップ {#next-steps}

- 📚 [基本概念](./concepts)：アーキテクチャを理解する
- 🏗️ [アーキテクチャ](../reference/architecture)：技術的な詳細
- 📖 [SDK API](../reference/sdk-api)：すべてのオプションとメソッド

## サポート {#support}

- ドキュメント：`docs/`
- 例：`examples/`
- Issue：GitHub Issues

## トラブルシューティング {#troubleshooting}

### エラー："Tool not found" {#error-tool-not-found}
→ エージェントで使う前に、`defineTool()` でツールを登録したことを確認してください。

### エラー："Policy violation" {#error-policy-violation}
→ ポリシー（予算、タイムアウト、許可リスト）を確認してください。

### エラー："Run cancelled" {#error-run-cancelled}
→ 実行が停止されました。理由は `getTrace()` で確認してください。

### トレースが空になる {#empty-traces}
→ イベントストアが正しく動作していて、イベントが永続化されていることを確認してください。

## 最初のエージェントまでの時間 {#time-to-first-agent}

**MVP の目標：** 30 分未満

**所要時間の目安：**
- インストール：2 分
- 最初のツール：5 分
- 最初のエージェント：3 分
- 最初の実行：5 分
- トレースの理解：10 分
- **合計：約 25 分** ✅
