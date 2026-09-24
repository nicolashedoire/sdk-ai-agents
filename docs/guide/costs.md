# API costs

The SDK records the token usage of every model call **in the run that made it** — tool selection, cognitive thoughts and typed decisions — and prices it per model.

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

## Prices

LLM prices change often and depend on your contract, so they are **configuration, not code**. Only prices verified against vendor documentation ship as defaults — today, Jev ($0.042 per million input tokens, output free, checked on 2026-09-23), both under its TypeSafe ids (`jev-*`) and through Vercel AI Gateway (`typesafe-ai/jev`).

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

Keys are exact model ids or prefixes ending with `*`. Providers often answer with a versioned id (`gpt-4o-2024-08-06`) while you asked for `gpt-4o`: the SDK records both and looks up the returned id first, then the requested name — exact keys before prefixes, the longest prefix winning. Be careful with prefixes: `gpt-4o*` also matches `gpt-4o-mini` unless `gpt-4o-mini*` exists.

A model without a price is still counted (calls and tokens) and listed in `unpricedModels`, and the report is marked `complete: false` — the SDK never invents a price.

## Where usage comes from

| Event | Source | Fields |
| --- | --- | --- |
| `intention.generated` | Native reasoning, tool selection | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | Cognitive operations, repairs and failed attempts included | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev and other typed-decision backends | `model`, `usage.inputTokens`, `usage.outputTokens` |

Because usage lives in events, you can also compute costs yourself with `computeRunCost(runId, events, pricing)`, aggregate them per agent or per day, or feed them to your billing.

## Budgets

Cost is only one side; policies can also cap **steps, tokens and tool calls** per agent, tool and period — see [Governed agents](./governed-agents). Cognitive agents have their own limits (`maxSteps`, `maxToolCalls`, `timeoutMs`). A `budgetLimit` with `maxCost` refuses a governed agent's tool calls once its model calls have cost more than the cap in the period, priced as above: a model call itself is never refused, and with `toolName` only that tool is. When a model has no price, or a call reports no token counts, the cap cannot be checked and tool calls are refused. A `maxCost` that is not a finite number ≥ 0 (a string such as `'0.5'` read from a config file, `NaN`, a negative amount, `Infinity`, `null`) is refused when the policy is applied, with a `ValidationError`. A cap with `agentId` counts that agent's model calls; one without counts those of every governed agent.
