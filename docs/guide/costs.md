# API costs

The SDK records the token usage of every model call **in the run that made it** — tool selection, cognitive thoughts and typed decisions — and prices it per model. A call counts as soon as the vendor has answered it, even when the SDK then fails the step on its answer (see [Failed calls](#failed-calls)).

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
  "unpricedCalls": 0,
  "unmeteredCalls": 0,
  "unmeteredModels": [],
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

## Unknown costs

The SDK never invents a price, nor a token count. The cost of a call is unknown in two cases, and the report says so:

- **its model has no price**: its calls and tokens are still counted, the model is listed in `unpricedModels`, those calls in `unpricedCalls`, and its line has no `costUsd`;
- **it reported no token counts** — neither input nor output tokens, as with a provider that returns no usage, or only a total: it is counted in `unmeteredCalls` (and in its line's `unmeteredCalls`), and its model in `unmeteredModels`. It is never taken as zero tokens, and a line none of whose calls reported them has no `costUsd` either.

A call without token counts is unmetered even when its model has a price, as budgets count it. When the cost of any call is unknown, the report is marked `complete: false` and `totalUsd` only adds up the calls whose cost is known: a lower bound, not the cost of the run.

## Failed calls

A call the vendor answered is billed, whatever the SDK then does with the answer. It is recorded and counted — in the run's events, in `getRunCost` and, for governed agents, in budgets per period and in the run's `maxTokens` — even when the step fails on it:

- a governed agent's tool call whose arguments are not valid JSON: `intention.generated` is recorded before the answer is read;
- a cognitive thought whose reply fails validation, repairs included, and an operation that `stop()` or the run's timeout cut short after billed attempts (`cognition.operation_failed` with their `usage`, and `decision.evaluated` for the typed-decision requests already answered);
- a typed decision whose answer does not match its questions (a choice that is not one of the options, a missing or mistyped answer): `decision.evaluated` with the `error` and empty `answers`, then `sdk.decisions` throws the error, and a cognitive agent falls back as before;
- an answer a provider discards: an OpenAI answer without any choice, which fails the call or makes a fallback provider take over (`provider.answer_discarded`, in governed runs and cognitive thoughts alike, priced at the model that gave it).

An attempt that failed without an answer — an HTTP error, a timeout, a lost connection, which retries and failovers handle — reports no usage and is not counted. An answer that could not be used at all (discarded, or not a valid decision body) is counted only when the vendor reported its usage. An answer that arrives just as the run is cancelled is dropped by the provider without its usage, and is not counted either.

## Where usage comes from

| Event | Source | Fields |
| --- | --- | --- |
| `intention.generated` | Native reasoning, tool selection | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | An answer the provider could not use | `provider`, `model`, `usage` |
| `cognition.thought` | Cognitive operations, repairs and failed attempts included | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls` |
| `cognition.operation_failed` | An operation cut short by a stop or a timeout after billed attempts | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev and other typed-decision backends, rejected answers included | `model`, `usage.inputTokens`, `usage.outputTokens` |

The final answer of a cognitive run is also recorded as an `intention.generated` event (`source: 'cognition'`): it is not a model call and is not counted.

Because usage lives in events, you can also compute costs yourself with `computeRunCost(runId, events, pricing)`, aggregate them per agent or per day, or feed them to your billing.

## Budgets

Cost is only one side; policies can also cap **steps, tokens and tool calls** per agent, tool and period — see [Governed agents](./governed-agents). A `budgetLimit` with `maxCost` refuses an agent's tool calls once its model calls have cost more than the cap in the period, priced as above, and a cognitive agent's next step as well (see [Limits and policies](./cognitive-agents#limits-and-policies)): a model call already started is never interrupted, and with `toolName` only that tool is refused. When a model has no price, or a call reports no token counts, the cap cannot be checked and those tool calls and steps are refused. A `maxCost` that is not a finite number ≥ 0 (a string such as `'0.5'` read from a config file, `NaN`, a negative amount, `Infinity`, `null`) is refused when the policy is applied, with a `ValidationError`.

Budgets count the model calls recorded in runs, like `getRunCost`: a governed agent's reasoning steps; a cognitive agent's thoughts (repairs and failed attempts included), tool selections and typed decisions; and the typed decisions made with `sdk.decisions`. A cap with `agentId` counts that agent's model calls — and the `sdk.decisions` calls that name it with `agentId`; one without counts them all, typed decisions made without an agent included. A budget never refuses a call of `sdk.decisions`: it refuses tool calls and the steps of cognitive agents.
