# 类型化决策（Jev）

有些问题并不需要长篇大论。*这件事紧急吗？交给哪个团队？风险有多大？* **类型化决策**会就某个上下文向模型提出一个范围很窄的问题，并返回一个结构化的、经过校准的答案，你的代码可以直接据此行动。

SDK 集成了 [TypeSafe Jev](https://docs.typesafe.ai)——第一个“System One”模型——以及任何提供相同约定（`POST /v1/systemone`）的后端，包括自托管的开源克隆版本。

![类型化决策](/images/typed-decisions.svg){.illustration}

## 配置 {#configure}

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: 'jev-latest',        // pin 'jev-1.13.0' once you tune thresholds
    // baseUrl: 'http://localhost:8080', // a compatible self-hosted clone (no key needed)
  },
});
```

| 选项 | 默认值 | |
| --- | --- | --- |
| `apiKey` | — | 用于 `api.typesafe.ai` 的 TypeSafe 密钥，或用于网关的 AI Gateway 密钥（见下文）；对于不需要密钥的自托管克隆版本是可选的 |
| `baseUrl` | `https://api.typesafe.ai` | 任何提供 `POST /v1/systemone` 的服务器 |
| `model` | `jev-latest` | 固定一个带版本的 id 以冻结行为 |
| `timeoutMs` | `30000` | 每次尝试 |
| `maxRetries` | `2` | 遇到 408、429、5xx、529 和网络错误时重试，并遵循 `retry-after` |
| `retryBaseDelayMs` | `500` | 第一次等待时间，每次重试翻倍 |
| `maxRetryDelayMs` | `30000` | 每次等待的上限，包括 `retry-after` |
| `fetch` | 全局 `fetch` | 注入一个支持代理的传输实现 |

### 通过 Vercel AI Gateway {#through-vercel-ai-gateway}

Jev 也由 [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) 以 `typesafe-ai/jev` 这个名称提供，其 API 与 TypeSafe 兼容。使用 AI Gateway 密钥代替 TypeSafe 密钥即可；请求会按相同的价格（每百万输入 token 0.042 美元，输出免费）计入你的 Vercel 账户。AI Gateway 还有一个免费额度，每月为部分模型提供一笔赠送额度：Jev 是否包含在内，请查看[它的定价](https://vercel.com/docs/ai-gateway/pricing)。

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseUrl: 'https://ai-gateway.vercel.sh/typesafe',
    model: 'typesafe-ai/jev',
  },
});
```

其他一切都不变：`sdk.decisions`、类型化控制器和类型化评分器的工作方式都一样，成本会记在 `typesafe-ai/jev` 名下。

你也可以通过 `decisionClient` 接入任何实现了 `TypedDecisionClient` 的后端。

## 注入你的上下文 {#inject-your-context}

`context` 是模型要评估的内容：纯文本，或者结构化数据——一张工单、一段聊天记录、一条记录、你的应用的状态。在问题中用反引号括起字段名来引用它的字段。

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## 单选 {#single-choice}

```ts
const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle `messages`?',
  options: {
    billing: 'Payments, invoices, refunds',
    technical: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades',
  },
  minConfidence: 0.5,
});
// { choice: 'billing', confidence: 0.81, probabilities: { billing: 0.88, … }, confident: true, runId }
```

`confident` 是**在你的代码中**根据答案的置信度计算出来的。当它为 `false` 时，就转交给人工或更强的模型处理——这就是*基于置信度的路由*模式。

## 多选 {#multiple-choice}

可能同时有多个选项适用？`selectMany` 会把每个选项变成一个独立的是/否问题，**在一次请求中**发送它们，并应用你的阈值：

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## 是/否与评分 {#yes-no-and-ratings}

```ts
const refund = await sdk.decisions.check({
  context: ticket,
  question: 'Is the customer asking for a refund?',
  criteria: { true: 'Explicitly asks for money back', false: 'No refund requested' },
  threshold: 0.8,
});

const urgency = await sdk.decisions.rate({
  context: ticket,
  question: 'How urgent is this ticket?',
  levels: ['Can wait', 'This week', 'Today'], // lowest first, 2 to 10 levels
});
// { score: 1.82, normalized: 0.91, level: 'Today', confidence: 0.9 }
```

## 多个问题，一次请求 {#many-questions-one-request}

Jev 只读取一次上下文，并行回答所有问题。使用 `ask` 配合 `noul`、`choice` 和 `score` 辅助函数——答案类型会被自动推断：

```ts
import { choice, noul, score } from '@sdk-ai-agents/core';

const { answers } = await sdk.decisions.ask({
  context: ticket,
  questions: {
    urgent: noul('Does `messages` convey urgency?'),
    team: choice('Which team should handle it?', { billing: null, technical: null }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Annoyed', 'Angry']),
  },
});
answers.urgent.noul;          // number
answers.team.choice;          // 'billing' | 'technical'
answers.frustration.score;    // number
```

## 在认知智能体内部 {#inside-cognitive-agents}

配置了决策后端之后，认知智能体会自动使用它：

- **控制器**——在每一步，一次请求会询问下一个应执行的可用操作（Choice），以及推理是否已准备好做决策（Noul）；
- **比较**——`compare` 先在一次**不带**思考者画像的请求中询问每个假设的证据支持度，然后仅针对提议，在第二次请求中询问它们与思考者的契合度。两个分数分开保存：契合度会调整提议的排序（`limits.preferenceWeight`，默认 0.4），并让思考者明显偏好的提议在证据看似合理时被确定（`limits.minProposalSupport`），但永远不会影响论断的可信度——参见[证据与验证](./evidence-and-verification#evidence-is-not-preference)。

当 Jev 没有把握或不可用时，两者都会回退到 LLM 或启发式控制器。

## 可追溯性与成本 {#traceability-and-cost}

每一个类型化决策都会被写成一个 `decision.evaluated` 事件，包含它的上下文、问题、答案和 token 用量——写入你传入的 `runId`，或者写入一个专用的 `decision_*` 流。Jev 的价格是**每百万输入 token 0.042 美元，输出免费**（依据 2026-09-23 的文档），所以 `sdk.getRunCost(runId)` 开箱即可把它计算在内。每个决策也会计入按时间段计算的预算——计入它指明的 `agentId`，以及不指明智能体的上限——而预算从不拒绝它（参见 [API 成本](./costs#budgets)）。

与问题不符的答案（选择不在选项之中，答案缺失或类型不对）同样已经计费：它也会被记录，带有 `error` 和空的 `answers`，然后才抛出错误。当后端没有报告 token 数时，事件中没有 `usage`，这次调用的成本会被报告为未知，而绝不是 0 美元——参见 [API 成本](./costs#unknown-costs)。

## 良好实践 {#good-practice}

Jev 按字面意思理解，而且不擅长算术、计数和日期比较。请把数字留在代码里处理，一次只问一个原子性的问题，编写能精确描述每个选项的标准，并把上下文过滤到问题所需的范围。参见 TypeSafe 的[已知局限](https://docs.typesafe.ai/model-jaggedness/jev-1.13)。
