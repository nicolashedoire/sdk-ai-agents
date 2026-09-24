# 重试与回退

网络会出故障，提供商会限流，工具会超时。SDK 会重试可以重试的，对无法重试的进行故障转移，并且**把每一次重试都写进运行记录**，不隐瞒任何事情。

```mermaid
flowchart LR
  R["请求"] --> P1{"主提供商"}
  P1 -- "临时性错误" --> W1["等待，退避"] --> P1
  P1 -- "重试次数用尽" --> P2{"备用提供商"}
  P2 -- "临时性错误" --> W2["等待，退避"] --> P2
  P1 -- "成功" --> OK(["响应"])
  P2 -- "成功" --> OK
```

## LLM 提供商 {#llm-providers}

重试策略**在任何回退之前，分别**应用于每个提供商：

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  fallbackProviders: [{ provider: 'anthropic', config: { apiKey: process.env.ANTHROPIC_API_KEY } }],
  retry: { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 8_000 },
});
```

来自另一厂商的回退提供商需要自己的密钥，写在它的 `config` 或 `providerConfig` 中：主提供商的密钥绝不会发送给其他厂商。只有当它支持智能体的模型时才会收到该模型，否则使用它自己的 `defaultModel`（未设置时，OpenAI 为 `gpt-5.4`，Anthropic 为 `claude-opus-5`；Anthropic 会拒绝 OpenAI 的模型名，反之亦然）。`intention.generated` 事件会记录实际应答的提供商及其使用的模型。

| 选项 | 默认值 | |
| --- | --- | --- |
| `maxRetries` | `2` | 首次尝试之后的重试次数 |
| `initialDelayMs` | `500` | 每次重试时翻倍（`multiplier`） |
| `maxDelayMs` | `8000` | 单次退避等待的上限 |
| `maxRetryAfterMs` | `60000` | 遵循的最长 `retry-after`（存在备用提供商时为 `maxDelayMs`） |
| `jitter` | `true` | 让每次等待在 [delay/2, delay] 范围内随机化 |
| `retryOn` | `isTransientError` | 你自己的判断函数 |

只有**临时性**错误才会重试：408、409、425、429、5xx、529、连接失败和超时——包括 OpenAI 和 Anthropic 的连接错误，它们按类以及其 `cause` 上的网络错误码来识别。身份认证、验证和策略错误会立即失败，表示账户额度或配额已经用完的 429（`insufficient_quota`、`credit_balance_exhausted`……）也是如此：等待并不能让额度回来。错误消息中带有厂商给出的解释。当提供商发送 `retry-after-ms` 或 `retry-after` 时，SDK 会按这个时长等待，而不是使用它自己的退避时间，最长为 `maxRetryAfterMs`（默认 60 秒）。当配置了 `fallbackProviders` 时，这个上限会降低到 `maxDelayMs`：一个要求长时间暂停的提供商会被留给备用提供商处理，而不是让运行卡住。如果要求等待的时间比这更长，重试就此结束。

当 SDK 的重试策略生效时，OpenAI 和 Anthropic 客户端自带的重试会被禁用——**重试永远不会叠加**。每一次重试都会被记录为一个 `provider.retry` 事件，包含提供商、模型、尝试次数、延迟和错误。传入 `retry: false` 可以改为保留厂商的默认设置。

流式输出文本的运行（`onText`）可能会遇到模型调用在部分回答已经到达之后才失败的情况。厂商在流的中途发送的错误按其对应的 HTTP 错误处理：OpenAI 的 `server_error`（500）以及 Anthropic 的 `rate_limit_error`（429）、`api_error`（500）、`timeout_error`（504）和 `overloaded_error`（529）会被重试，其他类型则不会。在流的中途断开的连接、在回答完整之前就结束的流，以及在客户端的超时时间（默认 10 分钟，即 `OpenAIProvider` 和 `AnthropicProvider` 的 `timeout` 选项）内没有发送任何内容的流，都属于连接失败。在重试之前，或在切换到备用提供商之前，`onTextRestart` 会告诉调用方丢弃失败的那次尝试已经流式输出的文本：下一次尝试会重新写出回答（参见[流式输出回答](./governed-agents#_7-streaming-the-answer)）。

你通过 `llmProvider` 注入的提供商会按原样使用，除非你显式设置了 `retry`；`FallbackProvider` 永远不会被包装，这样它的故障转移在追踪记录中始终可见。它内部的提供商也不会被包装，因此 `retry` 对它们不起作用：要在故障转移前重试某个提供商，请用 `RetryingLLMProvider` 包装它，并为它的客户端设置 `maxRetries: 0`。请像 SDK 在有备用提供商可接手时那样，把策略的 `maxRetryAfterMs` 设为它的 `maxDelayMs`，这样要求长时间暂停的提供商会被留给备用提供商处理。这些重试不会被记录为 `provider.retry` 事件。

## 工具 {#tools}

把幂等的工具标记为可重试：

```ts
sdk.defineTool({
  name: 'lookup_metric',
  description: 'Reads a metric',
  schema: z.object({ metric: z.string() }),
  retry: { maxRetries: 2, initialDelayMs: 200 },
  handler: async ({ metric }) => warehouse.read(metric),
});
```

只有工具失败才会重试——策略拒绝或验证错误永远不会重试。每一次重试都是一个 `tool.retry` 事件。

## 类型化决策 {#typed-decisions}

Jev 客户端会对 408、429、5xx 和 529 响应以及网络错误进行重试，**并遵循 `retry-after`**，默认使用 SDK 的重试策略（`jev.maxRetries` 可以覆盖它）。与 LLM 提供商不同，它会重试每一个 429，无论原因是什么，直到达到 `maxRetries`。

## 其他任何地方 {#anywhere-else}

`withRetry` 被导出，供你自己的代码使用：

```ts
import { withRetry, DEFAULT_RETRY_POLICY } from '@sdk-ai-agents/core';

const data = await withRetry(() => fetchPartnerFeed(), DEFAULT_RETRY_POLICY, {
  onRetry: ({ retry, delayMs, error }) => logger.warn({ retry, delayMs, error }),
});
```
