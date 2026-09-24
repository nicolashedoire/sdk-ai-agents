# 快速开始

## 安装 {#install}

从 npm 安装这个包，并一同安装 zod：

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

环境要求：**Node.js 20+**、TypeScript 5+，以及 **zod 3.25.28 或 v3 范围内的更高版本**——暂不支持 zod 4 的 schema。这个包**只支持 ESM**：请用 `import` 加载；CommonJS 代码可以用动态 `import()` 加载。MCP 连接器还需要官方的 MCP SDK：

```sh
npm install @modelcontextprotocol/sdk@^1.30.0
```

如果想试用尚未发布的改动，请改为从 GitHub 安装 `main` 分支——它会在安装时自行构建：

```sh
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 1. 创建 SDK {#_1-create-the-sdk}

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY, // or provider: 'anthropic'
});
```

智能体需要一种访问 LLM 的方式：内置的 OpenAI 和 Anthropic 提供商需要一个 `apiKey`，或者使用你自己的 `llmProvider`。其余一切都是可选的——即使没有密钥，SDK 也照样能运行工具和 [MCP 服务器](./mcp-first-server)；只有需要模型的调用会失败，并给出说明原因的消息。

## 2. 定义一个受治理的工具 {#_2-define-a-governed-tool}

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

工具默认拒绝：只有已注册的工具才能运行，每次调用都会用 Zod schema 验证并按策略检查，而且**认知智能体只能使用交给它的工具**——任何其他工具都会在执行前被拒绝，即使模型点名要用它。

## 3. 让智能体思考 {#_3-let-an-agent-think}

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

## 4. 查看发生了什么 {#_4-look-at-what-happened}

```ts
const trace = await sdk.getTrace(result.runId);             // every event, as a timeline
const state = await sdk.getMentalState(result.runId);       // the mental state, rebuilt from events
const cost = await sdk.getRunCost(result.runId);            // token usage and USD per model
const replay = await sdk.replay(result.runId);              // re-run the actions, no LLM call
```

## 5. 加入类型化决策（可选） {#_5-add-typed-decisions-optional}

有了 [TypeSafe](https://docs.typesafe.ai) 密钥——或者 Vercel AI Gateway 密钥，参见[通过 AI Gateway 使用 Jev](./typed-decisions#through-vercel-ai-gateway)——智能体的控制器和假设比较就会使用 Jev，你还会得到 `sdk.decisions`：

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

## 接下来去哪里？ {#where-next}

- [认知智能体](./cognitive-agents)——深入了解推理循环
- [思考者画像](./thinker-profiles)——让智能体像你一样推理
- [类型化决策](./typed-decisions)——上下文注入、单选和多选
- [MCP 连接器](./mcp)——接入你公司的系统
- [事故告警](./incidents)——运行失败时收到邮件
