# 시작하기

## 설치 {#install}

패키지는 아직 npm에 게시되지 않았습니다. GitHub에서 설치하세요. 설치할 때 스스로 빌드됩니다.

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

요구 사항: **Node.js 20+**, TypeScript 5+, 그리고 **v3 안에서 zod 3.25.28 이상**입니다. zod 4 스키마는 아직 지원하지 않습니다. 패키지는 **ESM 전용**입니다. `import`로 불러오세요. CommonJS 코드에서는 동적 `import()`로 불러올 수 있습니다. MCP 커넥터를 쓰려면 공식 MCP SDK도 필요합니다.

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

## 1. SDK 만들기 {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

에이전트에는 LLM에 접근할 수단이 필요합니다. 내장된 OpenAI와 Anthropic 프로바이더를 위한 `apiKey`, 또는 직접 만든 `llmProvider`입니다. 그 밖의 설정은 모두 선택 사항입니다. 키가 없어도 SDK는 도구와 [MCP 서버](./mcp-first-server)를 실행하며, 모델이 필요한 호출만 그 사실을 알리는 메시지와 함께 실패합니다.

## 2. 통제된 도구 정의하기 {#_2-define-a-governed-tool}

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

도구는 기본적으로 거부됩니다(deny-by-default). 등록된 도구만 실행될 수 있고, 모든 호출은 Zod 스키마로 검증되고 정책에 대해 검사되며, **인지 에이전트는 자신에게 주어진 도구만 쓸 수 있습니다**. 그 밖의 도구는 모델이 이름을 대더라도 실행 전에 거부됩니다.

## 3. 에이전트가 생각하게 하기 {#_3-let-an-agent-think}

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

## 4. 무슨 일이 있었는지 살펴보기 {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. 타입 지정 결정 추가하기 (선택 사항) {#_5-add-typed-decisions-optional}

[TypeSafe](https://docs.typesafe.ai) 키가 있으면(또는 Vercel AI Gateway 키가 있으면. [AI Gateway를 통한 Jev](./typed-decisions#through-vercel-ai-gateway) 참고) 에이전트의 컨트롤러와 가설 비교에 Jev가 쓰이고, `sdk.decisions`를 사용할 수 있습니다.

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

## 다음으로 어디로 갈까요? {#where-next}

- [인지 에이전트](./cognitive-agents) — 추론 루프를 깊이 있게
- [사고자 프로필](./thinker-profiles) — 에이전트가 여러분처럼 추론하게 만들기
- [타입 지정 결정](./typed-decisions) — 컨텍스트 주입, 단일 선택과 다중 선택
- [MCP 커넥터](./mcp) — 회사 시스템 연결하기
- [인시던트 알림](./incidents) — 실행이 실패하면 이메일 받기
