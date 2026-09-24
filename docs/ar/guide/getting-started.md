# البدء

## التثبيت {#install}

ثبّت الحزمة من npm مع zod:

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

المتطلبات: **Node.js 20+**، وTypeScript 5+، و**zod 3.25.28 أو أحدث ضمن الإصدار v3** — مخططات zod 4 غير مدعومة بعد. الحزمة **بصيغة ESM فقط**: حمّلها باستخدام `import`؛ ويمكن لشيفرة CommonJS تحميلها باستخدام `import()` الديناميكي. وتحتاج موصِّلات MCP إضافةً إلى ذلك إلى حزمة MCP SDK الرسمية:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

لتجربة تغييرات لم تُصدَر بعد، ثبّت بدلًا من ذلك الفرع `main` من GitHub — فهو يبني نفسه عند التثبيت:

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 1. إنشاء حزمة SDK {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

يحتاج الوكلاء إلى وسيلة للوصول إلى نموذج لغوي: مفتاح `apiKey` للمزوّدَين المدمجين OpenAI وAnthropic، أو `llmProvider` خاص بك. كل ما عدا ذلك اختياري — وحتى دون مفتاح تظل حزمة SDK تشغّل الأدوات و[خوادم MCP](./mcp-first-server)؛ ولا يفشل إلا الاستدعاء الذي يحتاج إلى نموذج، مع رسالة تقول ذلك.

## 2. تعريف أداة خاضعة للحوكمة {#_2-define-a-governed-tool}

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

الأدوات ممنوعة افتراضيًا (deny-by-default): لا يمكن أن تعمل إلا الأدوات المسجَّلة، ويُتحقَّق من كل استدعاء بمخطط Zod ويُفحَص مقابل السياسات، و**لا يستطيع الوكيل المعرفي استخدام إلا الأدوات التي أُعطيت له** — وأي أداة أخرى تُرفَض قبل التنفيذ، حتى لو ذكر النموذج اسمها.

## 3. دع وكيلًا يفكّر {#_3-let-an-agent-think}

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

## 4. انظر إلى ما حدث {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. إضافة القرارات المُنمَّطة (اختياري) {#_5-add-typed-decisions-optional}

مع مفتاح [TypeSafe](https://docs.typesafe.ai) — أو مفتاح Vercel AI Gateway، انظر [Jev عبر AI Gateway](./typed-decisions#through-vercel-ai-gateway) — يستخدم متحكّم الوكيل ومقارنة الفرضيات Jev، وتحصل على `sdk.decisions`:

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

## إلى أين بعد ذلك؟ {#where-next}

- [الوكلاء المعرفيون](./cognitive-agents) — حلقة الاستدلال بالتفصيل
- [ملفات المفكّرين](./thinker-profiles) — اجعل الوكيل يستدل مثلك
- [القرارات المُنمَّطة](./typed-decisions) — إدخال السياق، والاختيار الواحد والمتعدد
- [موصِّلات MCP](./mcp) — اربط أنظمة شركتك
- [تنبيهات الحوادث](./incidents) — استلم بريدًا إلكترونيًا حين يفشل تشغيل
