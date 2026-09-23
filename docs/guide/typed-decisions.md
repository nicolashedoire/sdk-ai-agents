# Typed decisions (Jev)

Some questions do not need prose. *Is this urgent? Which team? How risky?* A **typed decision** asks a model a narrow question about a context and returns a structured, calibrated answer your code can act on.

The SDK integrates [TypeSafe Jev](https://docs.typesafe.ai), the first "System One" model, and any backend exposing the same contract (`POST /v1/systemone`) — including self-hosted open-source clones.

![Typed decisions](/images/typed-decisions.svg){.illustration}

## Configure

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

| Option | Default | |
| --- | --- | --- |
| `apiKey` | — | A TypeSafe key for `api.typesafe.ai`, or an AI Gateway key for the gateway (see below); optional for a keyless self-hosted clone |
| `baseUrl` | `https://api.typesafe.ai` | Any server exposing `POST /v1/systemone` |
| `model` | `jev-latest` | Pin a versioned id to freeze behavior |
| `timeoutMs` | `30000` | Per attempt |
| `maxRetries` | `2` | On 408, 429, 5xx, 529 and network errors, honoring `retry-after` |
| `fetch` | global `fetch` | Inject a proxy-aware transport |

### Through Vercel AI Gateway

Jev is also served by [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) under the name `typesafe-ai/jev`, with a TypeSafe-compatible API. Use an AI Gateway key instead of a TypeSafe key; requests are billed on your Vercel account at the same price ($0.042 per million input tokens, output free). AI Gateway also has a free tier with a monthly credit for a subset of models: see [its pricing](https://vercel.com/docs/ai-gateway/pricing) for whether Jev is included.

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

Nothing else changes: `sdk.decisions`, the typed controller and the typed assessor work the same way, and costs are reported under `typesafe-ai/jev`.

Or bring any backend implementing `TypedDecisionClient` with `decisionClient`.

## Inject your context

The `context` is what the model evaluates: plain text, or structured data — a ticket, a chat log, a record, the state of your app. Refer to its fields by name in backticks in your questions.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## Single choice

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

`confident` is computed **in your code** from the answer's confidence. When it is `false`, route to a human or a stronger model — this is the *confidence-gated routing* pattern.

## Multiple choice

Several options can apply at once? `selectMany` turns each option into its own yes/no question, sends them **in one request**, and applies your threshold:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## Yes / no and ratings

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

## Many questions, one request

Jev reads the context once and answers every question in parallel. Use `ask` with the `noul`, `choice` and `score` helpers — answer types are inferred:

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

## Inside cognitive agents

With a decision backend configured, cognitive agents use it automatically:

- **controller** — at each step, one request asks which available operation comes next (Choice) and whether the reasoning is ready to decide (Noul);
- **comparison** — `compare` asks for the evidence support of each hypothesis in a request **without** the thinker's profile, then, for proposals only, their fit with the thinker in a second request. The two scores are kept apart: fit only reorders proposals (`limits.preferenceWeight`, 0.4 by default), never the credibility of a claim — see [Evidence & verification](./evidence-and-verification#evidence-is-not-preference).

Both fall back to the LLM or the heuristic controller when Jev is unsure or unavailable.

## Traceability and cost

Every typed decision is written as a `decision.evaluated` event with its context, questions, answers and token usage — in the `runId` you pass, or in a dedicated `decision_*` stream. Jev is priced at **$0.042 per million input tokens, output free** (as documented on 2026-09-23), so `sdk.getRunCost(runId)` includes it out of the box.

## Good practice

Jev reads literally and is weak at arithmetic, counting and date comparison. Keep numbers in code, ask one atomic question at a time, write criteria that describe each option precisely, and filter the context to what the question needs. See TypeSafe's [known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13).
