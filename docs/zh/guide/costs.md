# API 成本

SDK 会把每一次模型调用的 token 用量记录**在发起它的那次运行中**——工具选择、认知思维和类型化决策——并按模型计价。只要厂商已经应答，这次调用就会被计数，即使 SDK 随后因为这个应答让该步骤失败也一样（参见[失败的调用](#failed-calls)）。

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
  "unpricedCalls": 0,
  "unmeteredCalls": 0,
  "unmeteredModels": [],
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

## 未知的成本 {#unknown-costs}

SDK 从不编造价格，也不编造 token 数。调用的成本在两种情况下是未知的，报告会明确指出：

- **它的模型没有价格**：它的调用次数和 token 数仍然会被计数，模型列在 `unpricedModels` 中，这些调用计入 `unpricedCalls`，它所在的行没有 `costUsd`；
- **它没有报告 token 数**——既没有输入 token 数也没有输出 token 数，例如提供商不返回用量，或者只返回一个总数：它会计入 `unmeteredCalls`（以及它所在行的 `unmeteredCalls`），它的模型列在 `unmeteredModels` 中。它永远不会被当作 0 个 token；如果某一行的调用都没有报告 token 数，这一行同样没有 `costUsd`。

没有 token 数的调用即使模型有价格，也会像预算中那样被算作未计量调用。只要有任何调用的成本未知，报告就会被标记为 `complete: false`，而 `totalUsd` 只累加成本已知的调用：它只是一个下限，而不是这次运行的成本。

## 失败的调用 {#failed-calls}

厂商已经应答的调用就会被计费，不管 SDK 随后如何处理这个应答。即使步骤因它而失败，它也会被记录并计数——计入运行的事件、`getRunCost`、按周期的预算和运行的 `maxTokens`：

- 受治理智能体的工具调用，其参数不是有效的 JSON：`intention.generated` 会在读取应答之前被记录；
- 应答未通过校验的认知思维（包括修复），以及在已计费的尝试之后被 `stop()` 或运行超时打断的操作（`cognition.operation_failed` 带有它们的 `usage`，已经得到应答的类型化决策请求记录为 `decision.evaluated`）；
- 答案与问题不符的类型化决策（选择不在选项之中，答案缺失或类型不对）：先记录带有 `error` 和空 `answers` 的 `decision.evaluated`，然后 `sdk.decisions` 抛出该错误，认知智能体则像以前一样回退；
- 提供商丢弃的应答：不含任何选项的 OpenAI 应答，它会让调用失败，或让回退提供商接手（`provider.answer_discarded`；在受治理的运行和认知思维中都一样，按给出该应答的模型计价）。

没有得到应答就失败的尝试——HTTP 错误、超时、连接断开，也就是重试和故障转移所处理的情况——不会报告用量，因此不计数。完全无法使用的应答（被丢弃的应答，或不是有效决策正文的应答）只有在厂商报告了其用量时才会计数。恰好在运行被取消时到达的应答会被提供商连同其用量一起丢弃，同样不会计数。

## 用量从哪里来 {#where-usage-comes-from}

| 事件 | 来源 | 字段 |
| --- | --- | --- |
| `intention.generated` | 原生推理、工具选择 | `model`、`requestedModel`、`usage.promptTokens`、`usage.completionTokens` |
| `provider.answer_discarded` | 提供商无法使用的应答 | `provider`、`model`、`usage` |
| `cognition.thought` | 认知操作，包括修复和失败的尝试 | `model`、`requestedModel`、`usage.calls`、`usage.unmeteredCalls` |
| `cognition.operation_failed` | 在已计费的尝试之后被停止或超时打断的操作 | `model`、`requestedModel`、`usage` |
| `decision.evaluated` | Jev 以及其他类型化决策后端，包括被拒绝的答案 | `model`、`usage.inputTokens`、`usage.outputTokens` |

认知运行的最终答案也会被记录为一个 `intention.generated` 事件（`source: 'cognition'`）：它不是模型调用，不会被计数。

因为用量保存在事件中，你也可以用 `computeRunCost(runId, events, pricing)` 自己计算成本，按智能体或按天汇总，或者把它们送入你的计费系统。

## 预算 {#budgets}

成本只是一个方面；策略还可以按智能体、工具和时间段为**步数、token 数和工具调用次数**设置上限——参见[受治理智能体](./governed-agents)。带 `maxCost` 的 `budgetLimit` 会在某个智能体该时间段内模型调用的花费（按上面的价格计算）超过上限后，拒绝它的工具调用，对认知智能体还会拒绝它的下一步（参见[限制与策略](./cognitive-agents#limits-and-policies)）：已经开始的模型调用从不被中断，带 `toolName` 时只拒绝该工具。如果某个模型没有价格，或某次调用没有报告 token 数，就无法检查该上限，这些工具调用和步骤会被拒绝。如果 `maxCost` 不是有限且 ≥ 0 的数字（例如从配置文件读取的字符串 `'0.5'`、`NaN`、负数金额、`Infinity`、`null`），策略在应用时就会以 `ValidationError` 被拒绝。

预算统计 `getRunCost` 读取的模型调用，读取方式与它相同——包括[失败的调用](#failed-calls)，没有 token 数的调用则算作成本未知的调用：受治理智能体的推理步骤；认知智能体的思维（包括修复和失败的尝试）、工具选择、类型化决策，以及在已计费的尝试之后被打断的操作；两者中提供商无法使用的应答；以及用 `sdk.decisions` 做出的类型化决策，包括被拒绝的答案。带 `agentId` 的上限统计该智能体的模型调用——以及用 `agentId` 指明它的 `sdk.decisions` 调用；不带 `agentId` 的上限统计全部调用，包括不指明智能体做出的类型化决策。预算从不拒绝 `sdk.decisions` 的调用：它拒绝的是工具调用和认知智能体的步骤。
