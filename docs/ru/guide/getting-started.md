# Быстрый старт

## Установка {#install}

Пакет ещё не опубликован в npm. Установите его с GitHub — он собирается сам при установке:

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

Требования: **Node.js 20+**, TypeScript 5+ и **zod 3.25.28 или новее в пределах v3** — схемы zod 4 пока не поддерживаются. Пакет поставляется **только в формате ESM**: загружайте его через `import`; код на CommonJS может загрузить его динамическим `import()`. Коннекторам MCP дополнительно нужен официальный MCP SDK:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

## 1. Создайте SDK {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

Агентам нужен способ обратиться к LLM: `apiKey` для встроенных провайдеров OpenAI и Anthropic или ваш собственный `llmProvider`. Всё остальное необязательно — и даже без ключа SDK выполняет инструменты и [серверы MCP](./mcp-first-server); ошибкой завершится только вызов, которому нужна модель, с сообщением об этом.

## 2. Определите управляемый инструмент {#_2-define-a-governed-tool}

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

Инструменты по умолчанию запрещены: запускаться могут только зарегистрированные инструменты, каждый вызов проверяется по схеме Zod и сверяется с политиками, а **когнитивный агент может использовать только те инструменты, которые ему дали** — любой другой инструмент отклоняется до выполнения, даже если модель его называет.

## 3. Дайте агенту подумать {#_3-let-an-agent-think}

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

## 4. Посмотрите, что произошло {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. Добавьте типизированные решения (необязательно) {#_5-add-typed-decisions-optional}

С ключом [TypeSafe](https://docs.typesafe.ai) — или ключом Vercel AI Gateway, см. [Jev через AI Gateway](./typed-decisions#through-vercel-ai-gateway) — контроллер агента и сравнение гипотез используют Jev, а вы получаете `sdk.decisions`:

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

## Что дальше? {#where-next}

- [Когнитивные агенты](./cognitive-agents) — цикл рассуждения подробно
- [Профили мыслителя](./thinker-profiles) — заставьте агента рассуждать как вы
- [Типизированные решения](./typed-decisions) — передача контекста, одиночный и множественный выбор
- [Коннекторы MCP](./mcp) — подключите системы вашей компании
- [Оповещения об инцидентах](./incidents) — получайте письмо, когда запуск завершается ошибкой
