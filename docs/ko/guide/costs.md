# API 비용

SDK는 모든 모델 호출(도구 선택, 인지 사고, 타입 지정 결정)의 토큰 사용량을 **그 호출을 만든 실행 안에** 기록하고, 모델별로 가격을 매깁니다.

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

## 가격 {#prices}

LLM 가격은 자주 바뀌고 여러분의 계약에 따라 달라지므로, **코드가 아니라 설정**입니다. 공급사 문서로 확인된 가격만 기본값으로 제공됩니다. 현재는 Jev(입력 토큰 100만 개당 $0.042, 출력 무료, 2026-09-23 확인)이며, TypeSafe id(`jev-*`)로도, Vercel AI Gateway(`typesafe-ai/jev`)를 통해서도 제공됩니다.

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

키는 정확한 모델 id이거나 `*`로 끝나는 접두사입니다. 여러분이 `gpt-4o`를 요청해도 프로바이더는 흔히 버전이 붙은 id(`gpt-4o-2024-08-06`)로 응답합니다. SDK는 둘 다 기록하고, 반환된 id를 먼저 찾은 다음 요청한 이름을 찾습니다. 정확한 키가 접두사보다 먼저이고, 접두사끼리는 가장 긴 것이 이깁니다. 접두사를 조심하세요. `gpt-4o-mini*`가 없으면 `gpt-4o*`는 `gpt-4o-mini`에도 일치합니다.

가격이 없는 모델도 여전히 집계되고(호출과 토큰) `unpricedModels`에 나열되며, 보고서는 `complete: false`로 표시됩니다. SDK는 가격을 절대 지어내지 않습니다.

## 사용량의 출처 {#where-usage-comes-from}

| 이벤트 | 출처 | 필드 |
| --- | --- | --- |
| `intention.generated` | 네이티브 추론, 도구 선택 | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | 인지 연산(수정과 실패한 시도 포함) | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev와 그 밖의 타입 지정 결정 백엔드 | `model`, `usage.inputTokens`, `usage.outputTokens` |

사용량이 이벤트 안에 있으므로, `computeRunCost(runId, events, pricing)`로 비용을 직접 계산하거나, 에이전트별 또는 일별로 집계하거나, 청구 시스템에 넣을 수도 있습니다.

## 예산 {#budgets}

비용은 한 측면일 뿐입니다. 정책으로 에이전트, 도구, 기간별로 **단계, 토큰, 도구 호출**에 상한을 둘 수도 있습니다. [통제형 에이전트](./governed-agents)를 보세요. 인지 에이전트에는 자체 한도(`maxSteps`, `maxToolCalls`, `timeoutMs`)가 있습니다. `maxCost`를 지정한 `budgetLimit`은 기간 내 모델 호출 비용이 한도를 넘으면 위의 가격을 기준으로 통제형 에이전트의 도구 호출을 거부합니다. 모델 호출 자체는 거부하지 않으며, `toolName`을 지정하면 그 도구만 거부합니다. 가격이 없는 모델이 있거나 토큰 수를 보고하지 않는 호출이 있으면 한도를 확인할 수 없으므로 도구 호출이 거부됩니다. `agentId`를 지정한 한도는 그 에이전트의 모델 호출을, 지정하지 않은 한도는 모든 통제형 에이전트의 모델 호출을 셉니다.
