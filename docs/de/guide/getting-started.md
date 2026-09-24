# Schnellstart

## Installation {#install}

Installieren Sie das Paket von npm, zusammen mit zod:

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

Voraussetzungen: **Node.js 20+**, TypeScript 5+ und **zod 3.25.28 oder neuer innerhalb von v3** – Schemas von zod 4 werden noch nicht unterstützt. Das Paket ist **nur ESM**: Laden Sie es mit `import`; CommonJS-Code kann es mit einem dynamischen `import()` laden. MCP-Konnektoren benötigen zusätzlich das offizielle MCP-SDK:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

Um Änderungen auszuprobieren, die noch nicht veröffentlicht sind, installieren Sie stattdessen den Branch `main` von GitHub – er baut sich bei der Installation selbst:

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 1. Das SDK erstellen {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

Agenten brauchen einen Weg zu einem LLM: einen `apiKey` für die eingebauten Anbieter OpenAI und Anthropic oder Ihren eigenen `llmProvider`. Alles andere ist optional – und ohne Schlüssel führt das SDK trotzdem Tools und [MCP-Server](./mcp-first-server) aus; nur ein Aufruf, der ein Modell braucht, schlägt fehl, mit einer Meldung, die das sagt.

## 2. Ein kontrolliertes Tool definieren {#_2-define-a-governed-tool}

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

Tools sind standardmäßig verboten (deny-by-default): Nur registrierte Tools können laufen, jeder Aufruf wird mit dem Zod-Schema validiert und gegen die Richtlinien geprüft, und ein **kognitiver Agent kann nur die Tools verwenden, die ihm gegeben wurden** – jedes andere Tool wird vor der Ausführung abgelehnt, selbst wenn das Modell es nennt.

## 3. Einen Agenten denken lassen {#_3-let-an-agent-think}

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

## 4. Nachsehen, was passiert ist {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. Typisierte Entscheidungen hinzufügen (optional) {#_5-add-typed-decisions-optional}

Mit einem [TypeSafe](https://docs.typesafe.ai)-Schlüssel – oder einem Schlüssel für Vercel AI Gateway, siehe [Jev über AI Gateway](./typed-decisions#through-vercel-ai-gateway) – verwenden der Controller des Agenten und der Vergleich der Hypothesen Jev, und Sie erhalten `sdk.decisions`:

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

## Wie geht es weiter? {#where-next}

- [Kognitive Agenten](./cognitive-agents) – die Denkschleife im Detail
- [Denkerprofile](./thinker-profiles) – den Agenten wie Sie denken lassen
- [Typisierte Entscheidungen](./typed-decisions) – Kontext übergeben, Einfach- und Mehrfachauswahl
- [MCP-Konnektoren](./mcp) – Ihre Unternehmenssysteme anschließen
- [Incident-Benachrichtigungen](./incidents) – eine E-Mail erhalten, wenn ein Lauf fehlschlägt
