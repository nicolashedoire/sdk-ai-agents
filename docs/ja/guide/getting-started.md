# はじめよう

## インストール {#install}

このパッケージはまだ npm に公開されていません。GitHub からインストールしてください。インストール時に自動でビルドされます。

::: code-group

```sh [npm]
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

```sh [pnpm]
pnpm add github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

```sh [yarn]
yarn add github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

:::

必要な環境：**Node.js 20 以上**、TypeScript 5 以上、**v3 系の zod 3.25.28 以降**。zod 4 のスキーマにはまだ対応していません。MCP コネクターを使うには、さらに公式の MCP SDK が必要です。

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

## 1. SDK を作成する {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

エージェントには LLM に接続する手段が必要です。組み込みの OpenAI と Anthropic のプロバイダーには `apiKey` を渡すか、独自の `llmProvider` を渡します。それ以外はすべて任意です。キーがなくても、SDK はツールや [MCP サーバー](./mcp-first-server) を実行できます。失敗するのはモデルを必要とする呼び出しだけで、その旨を伝えるメッセージが表示されます。

## 2. ガバナンス付きツールを定義する {#_2-define-a-governed-tool}

```ts
import { z } from 'zod';

const lookupMetric = sdk.defineTool({
  name: 'lookup_metric',
  description: 'Reads a business metric from the warehouse',
  schema: z.object({ metric: z.enum(['churn', 'mrr', 'nps']) }),
  retry: { maxRetries: 2 }, // idempotent: safe to retry
  handler: async ({ metric }) => warehouse.read(metric),
});
```

ツールはデフォルト拒否（deny-by-default）です。登録されたツールだけが実行でき、すべての呼び出しは Zod スキーマで検証され、ポリシーと照合されます。そして **認知エージェントは、渡されたツールしか使えません**。それ以外のツールは、たとえモデルが名前を挙げても、実行前に拒否されます。

## 3. エージェントに考えさせる {#_3-let-an-agent-think}

```ts
const analyst = sdk.createCognitiveAgent({
  name: 'analyst',
  model: 'gpt-4o',
  tools: [lookupMetric],
});

const result = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
  context: { budget: '10k EUR', deadline: 'before Q4' },
});

console.log(result.status);        // 'completed'
console.log(result.answer);        // the answer in plain words
console.log(result.decision);      // { hypothesisId, answer, rationale, confidence, nextActions, status, missing }
console.log(result.decision?.status); // 'committed', 'provisional' (see `missing`) or 'abstain'
console.log(result.state.hypotheses.map((h) => [h.id, h.status, h.support]));
```

## 4. 何が起きたかを見る {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. 型付き決定を追加する（任意） {#_5-add-typed-decisions-optional}

[TypeSafe](https://docs.typesafe.ai) のキー（または Vercel AI Gateway のキー。[AI Gateway 経由の Jev](./typed-decisions#through-vercel-ai-gateway) を参照）があれば、エージェントのコントローラーと仮説の比較に Jev が使われ、`sdk.decisions` も使えるようになります。

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: { apiKey: process.env.TYPESAFE_API_KEY },
});

const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle this ticket?',
  options: { billing: 'Payments, refunds', technical: 'Bugs, outages', sales: 'Pricing' },
});
if (!route.confident) escalateToHuman(ticket);
```

## 次に読むもの {#where-next}

- [認知エージェント](./cognitive-agents)：推論ループの詳細
- [思考者プロファイル](./thinker-profiles)：エージェントにあなたのように推論させる
- [型付き決定](./typed-decisions)：コンテキストの注入、単一選択と複数選択
- [MCP コネクター](./mcp)：社内のシステムをつなぐ
- [インシデントアラート](./incidents)：実行が失敗したときにメールを受け取る
