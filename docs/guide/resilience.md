# Retries & fallback

Networks fail, providers get rate-limited, tools time out. The SDK retries what can be retried, fails over what cannot, and **writes every retry in the run** so nothing is hidden.

```mermaid
flowchart LR
  R[Request] --> P1{Primary provider}
  P1 -- transient error --> W1[wait, backoff] --> P1
  P1 -- retries exhausted --> P2{Fallback provider}
  P2 -- transient error --> W2[wait, backoff] --> P2
  P1 -- ok --> OK([Response])
  P2 -- ok --> OK
```

## LLM providers

A retry policy applies to each provider **individually, before any fallback**:

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  fallbackProviders: [{ provider: 'anthropic', config: { apiKey: process.env.ANTHROPIC_API_KEY } }],
  retry: { maxRetries: 3, initialDelayMs: 500, maxDelayMs: 8_000 },
});
```

| Option | Default | |
| --- | --- | --- |
| `maxRetries` | `2` | Retries after the first attempt |
| `initialDelayMs` | `500` | Doubled at each retry (`multiplier`) |
| `maxDelayMs` | `8000` | Upper bound for one backoff wait |
| `maxRetryAfterMs` | `60000` | Longest `retry-after` honored (`maxDelayMs` when a fallback exists) |
| `jitter` | `true` | Randomizes each wait in [delay/2, delay] |
| `retryOn` | `isTransientError` | Your own predicate |

Only **transient** errors are retried: 408, 409, 425, 429, 5xx, 529, connection failures and timeouts — including the OpenAI and Anthropic connection errors, recognized by class and by the network code on their `cause`. Authentication, validation and policy errors fail immediately. When the provider sends `retry-after-ms` or `retry-after`, the SDK waits that long instead of its own backoff, up to `maxRetryAfterMs` (60 s by default). When `fallbackProviders` are configured, that bound is lowered to `maxDelayMs`: a provider asking for a long pause is left for the fallback instead of blocking the run. A longer request ends the retries.

When the SDK policy is active, the OpenAI and Anthropic clients' own retries are disabled — **retries never stack**. Each retry is recorded as a `provider.retry` event with the provider, model, attempt, delay and error. Pass `retry: false` to keep the vendor defaults instead.

A provider you inject with `llmProvider` is used as given unless you set `retry` explicitly, and a `FallbackProvider` is never wrapped so its failovers stay visible in the trace.

## Tools

Mark idempotent tools as retryable:

```ts
sdk.defineTool({
  name: 'lookup_metric',
  description: 'Reads a metric',
  schema: z.object({ metric: z.string() }),
  retry: { maxRetries: 2, initialDelayMs: 200 },
  handler: async ({ metric }) => warehouse.read(metric),
});
```

Only tool failures are retried — never a policy denial or a validation error. Each retry is a `tool.retry` event.

## Typed decisions

The Jev client retries 408, 429, 5xx and 529 responses and network errors, **honoring `retry-after`**, with the SDK retry policy as default (`jev.maxRetries` overrides it).

## Anywhere else

`withRetry` is exported for your own code:

```ts
import { withRetry, DEFAULT_RETRY_POLICY } from '@sdk-ai-agents/core';

const data = await withRetry(() => fetchPartnerFeed(), DEFAULT_RETRY_POLICY, {
  onRetry: ({ retry, delayMs, error }) => logger.warn({ retry, delayMs, error }),
});
```
