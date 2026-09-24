# Primeros pasos

## Instalar {#install}

Instala el paquete desde npm, junto con zod:

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

Requisitos: **Node.js 20+**, TypeScript 5+ y **zod 3.25.28 o posterior dentro de la v3** — los esquemas de zod 4 todavía no son compatibles. El paquete es **solo ESM**: cárgalo con `import`; el código CommonJS puede cargarlo con un `import()` dinámico. Los conectores MCP necesitan además el SDK oficial de MCP:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

Para probar cambios que todavía no se han publicado, instala en su lugar la rama `main` desde GitHub — se compila sola durante la instalación:

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 1. Crear el SDK {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

Los agentes necesitan una forma de llegar a un LLM: una `apiKey` para los proveedores integrados de OpenAI y Anthropic, o tu propio `llmProvider`. Todo lo demás es opcional — y sin clave el SDK sigue ejecutando herramientas y [servidores MCP](./mcp-first-server); solo falla una llamada que necesita un modelo, con un mensaje que lo indica.

## 2. Definir una herramienta gobernada {#_2-define-a-governed-tool}

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

Las herramientas están denegadas por defecto (deny-by-default): solo pueden ejecutarse las herramientas registradas, cada llamada se valida con el esquema Zod y se comprueba contra las políticas, y un **agente cognitivo solo puede usar las herramientas que se le dieron** — cualquier otra herramienta se deniega antes de ejecutarse, aunque el modelo la nombre.

## 3. Dejar que un agente piense {#_3-let-an-agent-think}

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

## 4. Ver qué ha pasado {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. Añadir decisiones tipadas (opcional) {#_5-add-typed-decisions-optional}

Con una clave de [TypeSafe](https://docs.typesafe.ai) — o una clave de Vercel AI Gateway, consulta [Jev a través de AI Gateway](./typed-decisions#through-vercel-ai-gateway) — el controlador del agente y la comparación de hipótesis usan Jev, y obtienes `sdk.decisions`:

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

## ¿Y ahora qué? {#where-next}

- [Agentes cognitivos](./cognitive-agents) — el bucle de razonamiento en profundidad
- [Perfiles de pensador](./thinker-profiles) — haz que el agente razone como tú
- [Decisiones tipadas](./typed-decisions) — inyección de contexto, opción única y múltiple
- [Conectores MCP](./mcp) — conecta los sistemas de tu empresa
- [Alertas de incidentes](./incidents) — recibe un correo cuando falla una ejecución
