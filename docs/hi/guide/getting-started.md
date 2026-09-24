# शुरुआत करें

## इंस्टॉल करें {#install}

पैकेज को npm से, zod के साथ इंस्टॉल करें:

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

ज़रूरतें: **Node.js 20+**, TypeScript 5+ और **zod 3.25.28 या उसके बाद का v3 वर्ज़न** — zod 4 के स्कीमा अभी समर्थित नहीं हैं। पैकेज **सिर्फ़ ESM** है: इसे `import` से लोड करें; CommonJS कोड इसे डायनैमिक `import()` से लोड कर सकता है। MCP कनेक्टर के लिए इसके अलावा आधिकारिक MCP SDK भी चाहिए:

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

जो बदलाव अभी रिलीज़ नहीं हुए हैं उन्हें आज़माने के लिए, इसके बजाय GitHub से `main` branch इंस्टॉल करें — इंस्टॉल होते समय यह खुद को बिल्ड कर लेता है:

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 1. SDK बनाएँ {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

एजेंटों को किसी LLM तक पहुँचने का रास्ता चाहिए: बिल्ट-इन OpenAI और Anthropic प्रदाताओं के लिए एक `apiKey`, या आपका अपना `llmProvider`। बाकी सब वैकल्पिक है — और बिना key के भी SDK टूल और [MCP सर्वर](./mcp-first-server) चलाता है; सिर्फ़ वही कॉल विफल होती है जिसे मॉडल की ज़रूरत हो, और साथ में यही बताने वाला संदेश आता है।

## 2. एक नियंत्रित टूल परिभाषित करें {#_2-define-a-governed-tool}

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

टूल डिफ़ॉल्ट रूप से मना होते हैं (deny-by-default): सिर्फ़ रजिस्टर किए गए टूल चल सकते हैं, हर कॉल Zod स्कीमा से सत्यापित होती है और नीतियों के सामने जाँची जाती है, और एक **संज्ञानात्मक एजेंट सिर्फ़ वही टूल इस्तेमाल कर सकता है जो उसे दिए गए हों** — कोई भी दूसरा टूल चलने से पहले ही मना कर दिया जाता है, चाहे मॉडल उसका नाम ले।

## 3. एजेंट को सोचने दें {#_3-let-an-agent-think}

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

## 4. देखें कि क्या हुआ {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. टाइप्ड निर्णय जोड़ें (वैकल्पिक) {#_5-add-typed-decisions-optional}

[TypeSafe](https://docs.typesafe.ai) की key के साथ — या Vercel AI Gateway की key के साथ, देखें [AI Gateway के ज़रिए Jev](./typed-decisions#through-vercel-ai-gateway) — एजेंट का कंट्रोलर और परिकल्पनाओं की तुलना Jev का इस्तेमाल करते हैं, और आपको `sdk.decisions` मिलता है:

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

## आगे कहाँ? {#where-next}

- [संज्ञानात्मक एजेंट](./cognitive-agents) — तर्क का चक्र, विस्तार से
- [विचारक प्रोफ़ाइल](./thinker-profiles) — एजेंट को अपनी तरह तर्क करना सिखाएँ
- [टाइप्ड निर्णय](./typed-decisions) — संदर्भ जोड़ना, एक और कई विकल्पों वाले सवाल
- [MCP कनेक्टर](./mcp) — अपनी कंपनी के सिस्टम जोड़ें
- [घटना अलर्ट](./incidents) — run विफल होने पर ईमेल पाएँ
