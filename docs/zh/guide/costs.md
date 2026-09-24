# API 成本

SDK 会把每一次模型调用的 token 用量记录**在发起它的那次运行中**——工具选择、认知思维和类型化决策——并按模型计价。

```ts
const cost = await sdk.getRunCost(runId);
```

```json
{
  "runId": "run_7f3…",
  "currency": "USD",
  "totalUsd": 0.01842,
  "complete": true,
  "unpricedModels": [],
  "lines": [
    { "model": "gpt-4o", "source": "llm", "calls": 9, "inputTokens": 14210, "outputTokens": 2310, "costUsd": 0.0186 },
    { "model": "jev-1.13.0", "source": "decision", "calls": 7, "inputTokens": 5880, "outputTokens": 140, "costUsd": 0.00025 }
  ]
}
```

## 价格 {#prices}

LLM 的价格经常变化，而且取决于你的合同，所以它们是**配置，而不是代码**。只有对照厂商文档核实过的价格才会作为默认值提供——目前只有 Jev（每百万输入 token 0.042 美元，输出免费，于 2026-09-23 核实），无论是使用它的 TypeSafe id（`jev-*`），还是通过 Vercel AI Gateway（`typesafe-ai/jev`）。

```ts
const sdk = createSDK({
  apiKey,
  pricing: {
    // Illustrative values: use your provider's current prices or your contract.
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
});
```

键可以是精确的模型 id，也可以是以 `*` 结尾的前缀。提供商返回的往往是带版本的 id（`gpt-4o-2024-08-06`），而你请求的是 `gpt-4o`：SDK 会把两者都记录下来，先查找返回的 id，再查找请求的名称——精确键优先于前缀，最长的前缀胜出。使用前缀时要小心：除非存在 `gpt-4o-mini*`，否则 `gpt-4o*` 也会匹配 `gpt-4o-mini`。

没有价格的模型仍然会被计数（调用次数和 token 数），并列在 `unpricedModels` 中，报告会被标记为 `complete: false`——SDK 从不编造价格。

## 用量从哪里来 {#where-usage-comes-from}

| 事件 | 来源 | 字段 |
| --- | --- | --- |
| `intention.generated` | 原生推理、工具选择 | `model`、`requestedModel`、`usage.promptTokens`、`usage.completionTokens` |
| `cognition.thought` | 认知操作，包括修复和失败的尝试 | `model`、`requestedModel`、`usage.calls` |
| `decision.evaluated` | Jev 以及其他类型化决策后端 | `model`、`usage.inputTokens`、`usage.outputTokens` |

因为用量保存在事件中，你也可以用 `computeRunCost(runId, events, pricing)` 自己计算成本，按智能体或按天汇总，或者把它们送入你的计费系统。

## 预算 {#budgets}

成本只是一个方面；策略还可以按智能体、工具和时间段为**步数、token 数和工具调用次数**设置上限——参见[受治理智能体](./governed-agents)。认知智能体有它们自己的限制（`maxSteps`、`maxToolCalls`、`timeoutMs`）。带 `maxCost` 的 `budgetLimit` 会在受治理智能体的模型调用在该时间段内的花费（按上面的价格计算）超过上限后，拒绝它的工具调用：模型调用本身从不被拒绝，带 `toolName` 时只拒绝该工具。如果某个模型没有价格，或某次调用没有报告token 数，就无法检查该上限，工具调用会被拒绝。带 `agentId` 的上限只计算该智能体的模型调用；不带 `agentId` 的上限计算所有受治理智能体的模型调用。
