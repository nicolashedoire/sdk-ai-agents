# API コスト

SDK は、すべてのモデル呼び出しのトークン使用量を **その呼び出しを行った実行の中に** 記録します。対象は、ツールの選択、認知エージェントの思考、型付き決定です。そして、それをモデルごとの価格で料金に換算します。

```ts
const cost = await sdk.getRunCost(runId);
```

```json
{
  "runId": "run_7f3…",
  "currency": "USD",
  "totalUsd": 0.01842,
  "complete": true,
  "unpricedModels": [],
  "lines": [
    { "model": "gpt-4o", "source": "llm", "calls": 9, "inputTokens": 14210, "outputTokens": 2310, "costUsd": 0.0186 },
    { "model": "jev-1.13.0", "source": "decision", "calls": 7, "inputTokens": 5880, "outputTokens": 140, "costUsd": 0.00025 }
  ]
}
```

## 価格 {#prices}

LLM の価格は頻繁に変わり、契約によっても異なります。そのため価格は **コードではなく設定** として扱います。デフォルトとして同梱されているのは、提供元のドキュメントで確認できた価格だけです。現時点では Jev（入力 100 万トークンあたり 0.042 ドル、出力は無料、2026-09-23 に確認）がそれにあたり、TypeSafe の ID（`jev-*`）でも、Vercel AI Gateway 経由（`typesafe-ai/jev`）でも適用されます。

```ts
const sdk = createSDK({
  apiKey,
  pricing: {
    // Illustrative values: use your provider's current prices or your contract.
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
});
```

キーには、モデル ID そのもの、または `*` で終わるプレフィックスを指定します。`gpt-4o` を指定したのに、プロバイダーがバージョン付きの ID（`gpt-4o-2024-08-06`）で応答することはよくあります。SDK はその両方を記録し、まず返された ID で、次に指定した名前で価格を探します。完全一致のキーはプレフィックスより優先され、プレフィックス同士では最も長いものが優先されます。プレフィックスには注意してください。`gpt-4o-mini*` がない限り、`gpt-4o*` は `gpt-4o-mini` にも一致します。

価格のないモデルも（呼び出し回数とトークン数は）集計され、`unpricedModels` に列挙されます。その場合、レポートには `complete: false` が付きます。SDK が価格をでっち上げることは決してありません。

## 使用量はどこから来るのか {#where-usage-comes-from}

| イベント | 発生源 | フィールド |
| --- | --- | --- |
| `intention.generated` | ネイティブの推論、ツールの選択 | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | 認知オペレーション（修復と失敗した試行も含む） | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev とその他の型付き決定のバックエンド | `model`, `usage.inputTokens`, `usage.outputTokens` |

使用量はイベントの中に記録されているので、`computeRunCost(runId, events, pricing)` を使って自分でコストを計算することもできます。エージェントごとや日ごとに集計したり、自社の課金システムに渡したりできます。

## 予算 {#budgets}

コストは一つの側面にすぎません。ポリシーを使えば、エージェント、ツール、期間ごとに、**ステップ数、トークン数、ツール呼び出しの回数** に上限を設けることもできます。[ガバナンス付きエージェント](./governed-agents) を参照してください。認知エージェントには、独自の制限（`maxSteps`、`maxToolCalls`、`timeoutMs`）があります。`maxCost` を指定した `budgetLimit` は、期間内のモデル呼び出しの費用が上限を超えると、上記の料金に基づき、ガバナンス付きエージェントのツール呼び出しを拒否します。モデル呼び出し自体は拒否されず、`toolName` を指定するとそのツールだけが拒否されます。料金のないモデルがある場合や、トークン数を報告しない呼び出しがある場合は上限を確認できないため、ツール呼び出しは拒否されます。有限で 0 以上の数値ではない `maxCost`（設定ファイルから読み込んだ `'0.5'` のような文字列、`NaN`、負の金額、`Infinity`、`null`）も確認できないため、その上限が対象とするツール呼び出しは拒否されます。`agentId` を指定した上限はそのエージェントのモデル呼び出しを、指定しない上限はすべてのガバナンス付きエージェントのモデル呼び出しを数えます。
