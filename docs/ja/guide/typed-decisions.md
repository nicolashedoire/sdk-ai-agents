# 型付き決定（Jev）

文章で答える必要のない質問もあります。「これは緊急か？」「どのチームが担当するか？」「どれくらいリスクがあるか？」。**型付き決定** は、あるコンテキストについてモデルに範囲の限られた質問をし、コードでそのまま扱える、構造化され較正された回答を返します。

この SDK は、最初の「System One」モデルである [TypeSafe Jev](https://docs.typesafe.ai) と、同じ契約（`POST /v1/systemone`）を公開する任意のバックエンドを統合しています。セルフホストのオープンソースのクローンも含まれます。

![型付き決定](/images/typed-decisions.svg){.illustration}

## 設定する {#configure}

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: 'jev-latest',        // pin 'jev-1.13.0' once you tune thresholds
    // baseUrl: 'http://localhost:8080', // a compatible self-hosted clone (no key needed)
  },
});
```

| オプション | デフォルト | |
| --- | --- | --- |
| `apiKey` | — | `api.typesafe.ai` 用の TypeSafe のキー、またはゲートウェイ用の AI Gateway のキー（下記参照）。キー不要のセルフホストのクローンでは省略可 |
| `baseUrl` | `https://api.typesafe.ai` | `POST /v1/systemone` を公開する任意のサーバー |
| `model` | `jev-latest` | バージョン付きの ID に固定すると、振る舞いを凍結できる |
| `timeoutMs` | `30000` | 1 回の試行ごと |
| `maxRetries` | `2` | 408、429、5xx、529、ネットワークエラーのとき。`retry-after` に従う |
| `fetch` | グローバルな `fetch` | プロキシに対応したトランスポートを注入する |

### Vercel AI Gateway 経由 {#through-vercel-ai-gateway}

Jev は [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) からも、`typesafe-ai/jev` という名前で、TypeSafe 互換の API として提供されています。TypeSafe のキーの代わりに AI Gateway のキーを使います。リクエストは同じ価格（入力 100 万トークンあたり 0.042 ドル、出力は無料）で Vercel のアカウントに請求されます。AI Gateway には、一部のモデルについて毎月のクレジットが付く無料枠もあります。Jev が含まれるかどうかは [料金ページ](https://vercel.com/docs/ai-gateway/pricing) で確認してください。

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseUrl: 'https://ai-gateway.vercel.sh/typesafe',
    model: 'typesafe-ai/jev',
  },
});
```

ほかには何も変わりません。`sdk.decisions`、型付きコントローラー、型付きアセッサーは同じように動作し、コストは `typesafe-ai/jev` の名前で報告されます。

あるいは、`TypedDecisionClient` を実装した任意のバックエンドを `decisionClient` で渡すこともできます。

## コンテキストを注入する {#inject-your-context}

`context` は、モデルが評価する対象です。プレーンなテキストでも、構造化データ（チケット、チャットのログ、レコード、アプリの状態など）でもかまいません。質問の中では、そのフィールドをバッククォートで囲んだ名前で参照してください。

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## 単一選択 {#single-choice}

```ts
const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle `messages`?',
  options: {
    billing: 'Payments, invoices, refunds',
    technical: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades',
  },
  minConfidence: 0.5,
});
// { choice: 'billing', confidence: 0.81, probabilities: { billing: 0.88, … }, confident: true, runId }
```

`confident` は、回答の確信度から **あなたのコードの中で** 計算されます。`false` のときは、人やより強力なモデルに回してください。これは「確信度でゲートするルーティング」（confidence-gated routing）と呼ばれるパターンです。

## 複数選択 {#multiple-choice}

複数の選択肢が同時に当てはまることがありますか？ `selectMany` は各選択肢をそれぞれ独立したはい／いいえの質問に変え、**1 回のリクエストで** 送り、あなたのしきい値を適用します。

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## はい／いいえと評価 {#yes-no-and-ratings}

```ts
const refund = await sdk.decisions.check({
  context: ticket,
  question: 'Is the customer asking for a refund?',
  criteria: { true: 'Explicitly asks for money back', false: 'No refund requested' },
  threshold: 0.8,
});

const urgency = await sdk.decisions.rate({
  context: ticket,
  question: 'How urgent is this ticket?',
  levels: ['Can wait', 'This week', 'Today'], // lowest first, 2 to 10 levels
});
// { score: 1.82, normalized: 0.91, level: 'Today', confidence: 0.9 }
```

## 多くの質問を 1 回のリクエストで {#many-questions-one-request}

Jev はコンテキストを一度読み、すべての質問に並行して答えます。`ask` を `noul`、`choice`、`score` のヘルパーと組み合わせて使ってください。回答の型は推論されます。

```ts
import { choice, noul, score } from '@sdk-ai-agents/core';

const { answers } = await sdk.decisions.ask({
  context: ticket,
  questions: {
    urgent: noul('Does `messages` convey urgency?'),
    team: choice('Which team should handle it?', { billing: null, technical: null }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Annoyed', 'Angry']),
  },
});
answers.urgent.noul;          // number
answers.team.choice;          // 'billing' | 'technical'
answers.frustration.score;    // number
```

## 認知エージェントの中で {#inside-cognitive-agents}

決定のバックエンドが設定されていれば、認知エージェントは自動的にそれを使います。

- **コントローラー**：各ステップで、1 回のリクエストにより、次にどの利用可能なオペレーションを行うか（Choice）と、推論が決定する準備ができているか（Noul）を問います。
- **比較**：`compare` は、思考者のプロファイルを **含まない** リクエストで各仮説の証拠による支持度を問い、次に提案に限って、思考者への適合度を 2 回目のリクエストで問います。2 つのスコアは切り離されています。適合度は提案の順位を並べ替え（`limits.preferenceWeight`、デフォルトは 0.4）、思考者が明らかに好む提案を、もっともらしい程度の証拠で確定できるようにします（`limits.minProposalSupport`）。しかし、主張の信頼性を変えることは決してありません。[証拠と検証](./evidence-and-verification#evidence-is-not-preference) を参照してください。

どちらも、Jev に確信がないときや利用できないときは、LLM またはヒューリスティックコントローラーにフォールバックします。

## トレーサビリティとコスト {#traceability-and-cost}

すべての型付き決定は、そのコンテキスト、質問、回答、トークン使用量とともに `decision.evaluated` イベントとして書き込まれます。書き込み先は、あなたが渡した `runId`、または専用の `decision_*` ストリームです。Jev の価格は **入力 100 万トークンあたり 0.042 ドル、出力は無料**（2026-09-23 時点のドキュメントによる）なので、`sdk.getRunCost(runId)` は何も設定しなくてもこれを含めます。

## よい使い方 {#good-practice}

Jev は文字どおりに読み、算術、数え上げ、日付の比較は苦手です。数値はコードで扱い、一度に 1 つの単純な質問をし、各選択肢を正確に記述する基準を書き、コンテキストは質問に必要なものだけに絞ってください。TypeSafe の [既知の制限](https://docs.typesafe.ai/model-jaggedness/jev-1.13) を参照してください。
