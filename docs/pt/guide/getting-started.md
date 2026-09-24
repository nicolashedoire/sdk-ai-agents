# Primeiros passos

## Instalação {#install}

O pacote ainda não está publicado no npm. Instale-o a partir do GitHub — ele se compila sozinho durante a instalação:

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

Requisitos: **Node.js 20+**, TypeScript 5+ e **zod 3.25.28 ou posterior dentro da v3** — schemas do zod 4 ainda não são suportados. Os conectores MCP precisam, além disso, do SDK oficial do MCP:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

## 1. Crie o SDK {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

Os agentes precisam de um meio de acessar um LLM: uma `apiKey` para os provedores OpenAI e Anthropic integrados, ou o seu próprio `llmProvider`. Todo o resto é opcional — e, sem uma chave, o SDK continua executando ferramentas e [servidores MCP](./mcp-first-server); só falha uma chamada que precisa de um modelo, com uma mensagem que diz isso.

## 2. Defina uma ferramenta governada {#_2-define-a-governed-tool}

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

As ferramentas são negadas por padrão (deny-by-default): só ferramentas registradas podem ser executadas, cada chamada é validada com o schema Zod e verificada em relação às políticas, e **um agente cognitivo só pode usar as ferramentas que recebeu** — qualquer outra ferramenta é negada antes da execução, mesmo que o modelo a mencione.

## 3. Deixe um agente pensar {#_3-let-an-agent-think}

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

## 4. Veja o que aconteceu {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. Adicione decisões tipadas (opcional) {#_5-add-typed-decisions-optional}

Com uma chave da [TypeSafe](https://docs.typesafe.ai) — ou uma chave do Vercel AI Gateway, veja [O Jev pelo AI Gateway](./typed-decisions#through-vercel-ai-gateway) — o controlador do agente e a comparação de hipóteses usam o Jev, e você ganha `sdk.decisions`:

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

## Para onde ir agora? {#where-next}

- [Agentes cognitivos](./cognitive-agents) — o ciclo de raciocínio em profundidade
- [Perfis de pensador](./thinker-profiles) — faça o agente raciocinar como você
- [Decisões tipadas](./typed-decisions) — injeção de contexto, escolha única e múltipla
- [Conectores MCP](./mcp) — conecte os sistemas da sua empresa
- [Alertas de incidentes](./incidents) — receba um e-mail quando uma execução falhar
