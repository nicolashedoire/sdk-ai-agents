# Getting started

## Install

Install the package from npm, with zod:

::: code-group

```sh [npm]
npm install @sdk-ai-agents/core zod@^3.25.28
```

```sh [pnpm]
pnpm add @sdk-ai-agents/core zod@^3.25.28
```

```sh [yarn]
yarn add @sdk-ai-agents/core zod@^3.25.28
```

:::

Requirements: **Node.js 20+**, TypeScript 5+ and **zod 3.25.28 or later within v3** — zod 4 schemas are not supported yet. The package is **ESM only**: load it with `import`; CommonJS code can load it with a dynamic `import()`. MCP connectors additionally need the official MCP SDK:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

To try changes that are not released yet, install the `main` branch from GitHub instead — it builds itself on install:

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 1. Create the SDK

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

Agents need a way to reach an LLM: an `apiKey` for the built-in OpenAI and Anthropic providers, or your own `llmProvider`. Everything else is optional — and without a key the SDK still runs tools and [MCP servers](./mcp-first-server); only a call that needs a model fails, with a message saying so.

## 2. Define a governed tool

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

Tools are deny-by-default: only registered tools can run, every call is validated with the Zod schema and checked against policies, and a **cognitive agent can only use the tools it was given** — any other tool is denied before execution, even if the model names it.

## 3. Let an agent think

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

## 4. Look at what happened

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. Add typed decisions (optional)

With a [TypeSafe](https://docs.typesafe.ai) key — or a Vercel AI Gateway key, see [Jev through AI Gateway](./typed-decisions#through-vercel-ai-gateway) — the agent's controller and hypothesis comparison use Jev, and you get `sdk.decisions`:

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

## Where next?

- [Cognitive agents](./cognitive-agents) — the reasoning loop in depth
- [Thinker profiles](./thinker-profiles) — make the agent reason like you
- [Typed decisions](./typed-decisions) — context injection, single and multiple choice
- [MCP connectors](./mcp) — plug your company systems in
- [Incident alerts](./incidents) — get an email when a run fails
