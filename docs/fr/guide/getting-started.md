# Premiers pas

## Installation {#install}

Le paquet n'est pas encore publié sur npm. Installez-le depuis GitHub — il se compile lui-même à l'installation :

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

Prérequis : **Node.js 20+**, TypeScript 5+ et **zod 3.25.28 ou ultérieur dans la v3** — les schémas zod 4 ne sont pas encore pris en charge. Les connecteurs MCP nécessitent en plus le SDK MCP officiel :

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

## 1. Créer le SDK {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

Les agents ont besoin d'un moyen d'atteindre un LLM : une `apiKey` pour les fournisseurs OpenAI et Anthropic intégrés, ou votre propre `llmProvider`. Tout le reste est facultatif — et sans clé, le SDK exécute quand même les outils et les [serveurs MCP](./mcp-first-server) ; seul un appel qui a besoin d'un modèle échoue, avec un message qui le dit.

## 2. Définir un outil gouverné {#_2-define-a-governed-tool}

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

Les outils sont refusés par défaut : seuls les outils enregistrés peuvent s'exécuter, chaque appel est validé par le schéma Zod et vérifié par rapport aux politiques, et **un agent cognitif ne peut utiliser que les outils qui lui ont été donnés** — tout autre outil est refusé avant son exécution, même si le modèle le nomme.

## 3. Laisser un agent réfléchir {#_3-let-an-agent-think}

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

## 4. Regarder ce qui s'est passé {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. Ajouter des décisions typées (facultatif) {#_5-add-typed-decisions-optional}

Avec une clé [TypeSafe](https://docs.typesafe.ai) — ou une clé Vercel AI Gateway, voir [Jev via AI Gateway](./typed-decisions#through-vercel-ai-gateway) —, le contrôleur de l'agent et la comparaison des hypothèses utilisent Jev, et vous disposez de `sdk.decisions` :

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

## Et ensuite ? {#where-next}

- [Agents cognitifs](./cognitive-agents) — la boucle de raisonnement en détail
- [Profils de penseur](./thinker-profiles) — faire raisonner l'agent comme vous
- [Décisions typées](./typed-decisions) — injection de contexte, choix unique et multiple
- [Connecteurs MCP](./mcp) — brancher les systèmes de votre entreprise
- [Alertes d'incident](./incidents) — recevoir un e-mail quand une exécution échoue
