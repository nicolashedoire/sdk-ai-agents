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
  model: 'gpt-5.4',
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
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-5.4', tools: [calc] });
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
  model: 'gpt-5.4',
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
  model: 'gpt-5.4',
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

予算と時間の制限は、ガバナンス付きエージェントの実行でツールを呼び出す前に毎回、その実行の進み具合に照らして確認されます。`maxSteps` はすでに済んだステップ数（最初の呼び出しはステップ 0）、`maxTokens` はモデル呼び出しで使ったトークン数、`maxDuration` は実行開始からの経過時間です。制限はツール呼び出しを拒否し、その結果、実行は失敗します。モデル呼び出しを途中で止めることはありません。期間ごとのトークン予算と費用予算（`maxTokens` または `maxCost` を指定した `budgetLimit`）は、ガバナンス付きエージェントと認知エージェントのモデル呼び出し、および `sdk.decisions` で行った型付き決定のトークンと費用を数えます（[API コスト](./costs#budgets) を参照）。リプレイでも、元の実行と同じように `maxSteps`、`maxTokens`、`maxDuration` が適用されます（期間ごとの予算は現在の期間の使用量を見ます）。これらのポリシーは認知エージェントにも適用され、各ツール呼び出しの前だけでなく各ステップの前にも、認知エージェント独自の制限（`maxSteps`、`maxToolCalls`、`timeoutMs`）と並んで確認されます。[制限とポリシー](./cognitive-agents#limits-and-policies) を参照してください。ポリシーは適用時（`defaultPolicies`、`defineGlobalPolicy`、エージェントの `policies`、`setPolicy`）に検査されます。`maxSteps` と `maxTokens` のルールは `budget` ポリシーに、`maxDuration` のルールは `timeout` ポリシーに置き、`value` は 0 より大きい有限の数値でなければなりません。`budgetLimit`（これも `budget` ポリシーに置く）には `period`（`hour`、`day`、`week`、`month`、`all` のいずれか）、指定する場合は文字列の `agentId` と `toolName`、そして少なくとも 1 つの上限（`maxTokens`、`maxToolCalls`、`maxCost`）が必要で、上限はそれぞれ 0 以上の有限の数値です（`maxToolCalls: 0` はすべての呼び出しを拒否し、トークンまたは費用の上限が 0 の場合は何かが計上された時点で拒否します）。設定ファイルから読み込んだ文字列（`'10'`）、`NaN`、実行制限の `0`、負の数など、それ以外の値はフィールド名を示す `ValidationError` をスローします。

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

### 7. 回答のストリーミング {#_7-streaming-the-answer}

モデルが書いている途中の回答を表示します。`onText` が、そのテキストを差分ごとに受け取ります。

```typescript
let shown = '';
const result = await agent.run({
  message: 'Summarize the incident report',
  onText: (delta) => {
    shown += delta;
    render(shown);
  },
  onTextRestart: (discarded) => {
    shown = shown.slice(0, shown.length - discarded.length);
    render(shown);
  },
});
```

- `onText` を指定すると、組み込みの OpenAI と Anthropic のプロバイダーは、それぞれのベンダーのストリーミング API を呼び出します。実行の結果とイベントは、指定しない場合と変わりません。コストも同じですが、OpenAI 互換のサーバー（`baseURL` または `OPENAI_BASE_URL`）は例外です。`providerConfig.openai.includeStreamUsage` を設定しない限り、ストリーミングされた回答の使用量は OpenAI 自身の API（リージョンのホストを含む）でしか要求されず、使用量のない呼び出しは、予算では未計測として扱われます。使用量を報告する互換サーバー（Azure OpenAI の v1 API は報告します）で費用予算を使う場合は、`includeStreamUsage: true` を設定してください。
- 実行のすべてのモデル呼び出しのテキストが、呼び出しごとに順番に渡されます。ツールを呼び出す前にモデルが書くテキスト、次にその回答です。それより前の呼び出しがテキストを書いていた場合は、呼び出しのテキストの前に空行（`\n\n`）が入ります。ツールの引数と Claude の思考過程は渡されません。
- ストリーミングできないプロバイダー（独自の `llmProvider` のうち、`onTextDelta` を読まないもの）は、各モデル呼び出しのテキスト全体を、呼び出しが終わったときに一度に渡します。OpenAI がストリーミングを拒否するモデル（そのモデルについて組織が検証されていない場合）でも同じです。プロバイダーはストリーミングなしでもう一度リクエストし、以後そのモデルではストリーミングしません。`stream_options` を拒否する互換サーバーには、それを付けずにもう一度リクエストします（OpenAI 自身の API はこのフィールドを受け付けるので、拒否されたリクエストは再送しません）。
- テキストの一部を渡した後にモデル呼び出しが失敗し、もう一度試される場合（リトライ、またはフォールバックプロバイダー）、`onTextRestart` がその部分（`discarded`、つまり `onText` が受け取ったものの末尾。空行も含む）を受け取ります。それを捨ててください。次の試行が回答をもう一度書きます。実行には、これまでどおり `provider.retry` または `provider.fallback` が記録されます。最終的に失敗した呼び出しのテキストはそのまま残り、実行は失敗します。回答全体（その終わりと、要求した場合はその使用量）を受け取った後にストリームが途切れたり止まったりしても、失敗にはなりません。その回答が使われます。
- コールバックが例外をスローしても、非同期のコールバックの Promise がリジェクトされても、それは無視され、実行は続きます。実行を止めるには、その `signal` を中断してください。どちらのコールバックも実行には記録されません。

認知エージェントはストリーミングしません。各モデル呼び出しは構造化された思考（JSON）を返し、エンジンはそれを全体としてチェックして受け入れます。半分だけの思考には、まだ何の意味もありません。

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
