---
layout: home

hero:
  name: SDK AI Agents
  text: 行動する前に考える、ガバナンス付きエージェント
  tagline: 中身を確認できる心的状態による明示的な推論、Jev による型付き決定、MCP コネクター。その土台として、イベントソーシング、リプレイ、コスト、リトライ、インシデントアラートを備えています。
  image:
    src: /images/reasoning-loop.svg
    alt: 明示的な心的状態を中心に回る認知ループ
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/getting-started
    - theme: alt
      text: エージェントの考え方
      link: /ja/guide/cognitive-agents
    - theme: alt
      text: GitHub で見る
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: プロンプトだけでなく、推論を
    details: 表現する、観測を比較する、仮説を立てる、シミュレーションする、検証する、修正する、批判する、情報を探す、比較する、決定する。各ステップは明示的な心的状態に対するオペレーションで、コントローラーが選び、イベントとして記録されます。
    link: /ja/guide/cognitive-agents
    linkText: 認知ループ
  - icon: 🔬
    title: 正当化できることを信じる
    details: 観測は出所を保持し、規則には反証可能な予測が付き、それをあなた自身の評価器が検証し、反証された規則は修正されます。そして回答は、コードで書かれたガードを通過したときにだけ確定されます。
    link: /ja/guide/evidence-and-verification
    linkText: 証拠と検証
  - icon: 🪞
    title: 特定の人物のように推論する
    details: はい、誰かの推論の仕方を模倣できます。いくつかのテーマを自分の言葉で説明すると、あなたの注意の順序、優先事項、反射的な判断を抽出してプロファイルにまとめ、推論の各ステップの指示に書き込みます。修正はそのたびにプロファイルに加えられ、あなたの一致度がどこまで近づいたかを示します。
    link: /ja/guide/thinker-profiles
    linkText: 特定の人物のように推論する
  - icon: 🎯
    title: Jev による型付き決定
    details: 任意のコンテキストを注入し、はい／いいえ、単一選択、複数選択、評価の質問を投げかけると、コードでそのまま扱える較正された確率が返ってきます。
    link: /ja/guide/typed-decisions
    linkText: 確信をもって決定する
  - icon: 🔌
    title: なんでも MCP サーバーに
    details: Web API、ドキュメントのフォルダー、読み取り専用のデータベース、エージェントを、ガバナンスとトレースの付いた MCP サーバーに 1 行で変換できます。さらに、任意の MCP サーバーのツールをあなたのエージェントに渡せます。
    link: /ja/guide/mcp
    linkText: システムをつなぐ
  - icon: 🛡️
    title: 設計段階からのガバナンス
    details: モデルが提案し、エンジンが決める。ポリシー、許可リスト、予算、人による承認が、すべてのアクションの前にチェックされます。
    link: /ja/guide/governed-agents
    linkText: ガバナンス付きエージェント
  - icon: 🎞️
    title: すべてはイベント
    details: LLM を呼び出さずに実行をリプレイし、どの実行の心的状態も再構築し、実行同士を比較して、ゴールデンテストに変えられます。
    link: /ja/guide/observability
    linkText: トレーサビリティとリプレイ
  - icon: 💸
    title: 目に見えるコスト
    details: すべての LLM 呼び出しと型付き決定のトークン使用量が記録され、実行ごと・モデルごとに料金が算出されます。
    link: /ja/guide/costs
    linkText: API コスト
  - icon: 🔁
    title: 積み重ならないリトライ
    details: フェイルオーバーの前にはプロバイダーごとに 1 つのリトライポリシー、冪等なツールにはリトライを適用し、すべてのリトライをトレースに書き込みます。
    link: /ja/guide/resilience
    linkText: リトライとフォールバック
  - icon: 🚨
    title: 確実に届くインシデント
    details: 失敗した実行、ブロックされたアクション、プロバイダーのフェイルオーバーは、タイムライン付きのインシデントになり、メールや Webhook で送信されます。
    link: /ja/guide/incidents
    linkText: インシデントアラート
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## プロンプトから、監査できる決定へ {#from-a-prompt-to-a-decision-you-can-audit}

従来の LLM 呼び出しは、質問から回答へ一直線に進みます。認知エージェントは問題の明示的な全体像を組み立て、複数の選択肢を探り、それらを厳しく試し、ガバナンス付きツールで事実を確認してから、ようやく結論を確定します。そして、そのすべてのステップを後から読み返せます。

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![イベントログから再構築された心的状態](/images/mental-state.svg){.illustration}

## 1 つの SDK で、すべてのレイヤーを {#one-sdk-every-layer}

![SDK のアーキテクチャ](/images/architecture.svg){.illustration}

| 必要なこと | 素の LLM API | SDK AI Agents |
| --- | --- | --- |
| 回答する前に推論する | 一度きりの生成 | 明示的な状態の上での仮説、シミュレーション、批判 |
| 特定の人物のように推論する | 長いシステムプロンプト | フィードバックで洗練される、バージョン管理された思考者プロファイル |
| 速く、較正された決定 | 自由記述のテキストを解析する | 確率と確信度の付いた型付きの回答（Jev） |
| 社内のツールをつなぐ | ツールごとに独自のつなぎのコード | ポリシーでガバナンスされる MCP サーバーとクライアント |
| 何が起きたかを知る | ログ（あれば） | イベントログ、リプレイ、心的状態の再構築 |
| リスクと支出を管理する | 祈るだけ | ポリシー、承認、予算、実行ごとのコスト、インシデントアラート |

</div>
