# API 비용

SDK는 모든 모델 호출(도구 선택, 인지 사고, 타입 지정 결정)의 토큰 사용량을 **그 호출을 만든 실행 안에** 기록하고, 모델별로 가격을 매깁니다. 호출은 벤더가 응답하는 순간 집계되며, SDK가 그 응답 때문에 단계를 실패시키더라도 마찬가지입니다([실패한 호출](#failed-calls) 참고).

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

## 알 수 없는 비용 {#unknown-costs}

SDK는 가격도, 토큰 수도 절대 지어내지 않습니다. 호출의 비용을 알 수 없는 경우는 두 가지이며, 보고서가 이를 밝힙니다.

- **모델에 가격이 없는 경우**: 호출과 토큰은 여전히 집계되고, 모델은 `unpricedModels`에, 그 호출은 `unpricedCalls`에 들어가며, 그 줄에는 `costUsd`가 없습니다.
- **토큰 수를 보고하지 않은 경우**: 입력 토큰 수도 출력 토큰 수도 없는 경우로, 사용량을 돌려주지 않거나 합계만 돌려주는 프로바이더가 여기에 해당합니다. 그 호출은 `unmeteredCalls`(와 그 줄의 `unmeteredCalls`)에, 모델은 `unmeteredModels`에 집계됩니다. 토큰 0개로 간주되는 일은 절대 없으며, 어떤 호출도 토큰 수를 보고하지 않은 줄에는 `costUsd`도 없습니다.

토큰 수가 없는 호출은 예산에서와 마찬가지로 모델에 가격이 있어도 미계량 호출로 집계됩니다. 어떤 호출이든 비용을 알 수 없으면 보고서는 `complete: false`로 표시되고, `totalUsd`는 비용을 아는 호출만 더합니다. 즉 실행의 비용이 아니라 그 하한입니다.

## 실패한 호출 {#failed-calls}

벤더가 응답한 호출은 SDK가 그 응답으로 무엇을 하든 청구됩니다. 따라서 단계가 그 호출 때문에 실패하더라도 호출은 기록되고 집계됩니다. 실행의 이벤트, `getRunCost`, 기간별 예산, 그리고 실행의 `maxTokens`에 반영됩니다.

- 인자가 유효한 JSON이 아닌 통제형 에이전트의 도구 호출: `intention.generated`는 응답을 읽기 전에 기록됩니다.
- 응답이 검증을 통과하지 못한 인지 사고(수정 포함), 그리고 청구된 시도 뒤에 `stop()`이나 실행의 타임아웃으로 중단된 연산: `cognition.operation_failed`가 그 `usage`를 담고, 이미 응답을 받은 타입 지정 결정 요청은 `decision.evaluated`로 기록됩니다.
- 답이 질문과 맞지 않는 타입 지정 결정(선택지에 없는 선택, 빠지거나 타입이 틀린 답): `error`와 빈 `answers`를 담은 `decision.evaluated`가 기록된 뒤 `sdk.decisions`가 그 오류를 던지고, 인지 에이전트는 이전처럼 대안으로 넘어갑니다.
- 프로바이더가 버린 응답: 선택지가 하나도 없는 OpenAI 응답으로, 호출을 실패시키거나 폴백 프로바이더가 이어받게 합니다(`provider.answer_discarded`. 통제형 실행에서도 인지 사고에서도 그 응답을 준 모델의 가격으로 계산됩니다).

응답 없이 실패한 시도(HTTP 오류, 타임아웃, 끊긴 연결처럼 재시도와 페일오버가 다루는 경우)는 사용량을 보고하지 않으므로 집계되지 않습니다. 전혀 쓸 수 없었던 응답(버려진 응답이나 유효한 결정 본문이 아닌 응답)은 벤더가 사용량을 보고한 경우에만 집계됩니다. 실행이 취소되는 바로 그 순간에 도착한 응답은 프로바이더가 사용량과 함께 버리므로, 역시 집계되지 않습니다.

## 사용량의 출처 {#where-usage-comes-from}

| 이벤트 | 출처 | 필드 |
| --- | --- | --- |
| `intention.generated` | 네이티브 추론, 도구 선택 | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | 프로바이더가 쓸 수 없었던 응답 | `provider`, `model`, `usage` |
| `cognition.thought` | 인지 연산(수정과 실패한 시도 포함) | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls` |
| `cognition.operation_failed` | 청구된 시도 뒤에 중지나 타임아웃으로 중단된 연산 | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev와 그 밖의 타입 지정 결정 백엔드(거부된 답 포함) | `model`, `usage.inputTokens`, `usage.outputTokens` |

인지 실행의 최종 답도 `intention.generated` 이벤트(`source: 'cognition'`)로 기록되지만, 모델 호출이 아니므로 집계되지 않습니다.

사용량이 이벤트 안에 있으므로, `computeRunCost(runId, events, pricing)`로 비용을 직접 계산하거나, 에이전트별 또는 일별로 집계하거나, 청구 시스템에 넣을 수도 있습니다.

## 예산 {#budgets}

비용은 한 측면일 뿐입니다. 정책으로 에이전트, 도구, 기간별로 **단계, 토큰, 도구 호출**에 상한을 둘 수도 있습니다. [통제형 에이전트](./governed-agents)를 보세요. `maxCost`를 지정한 `budgetLimit`은 기간 내 모델 호출 비용이 한도를 넘으면 위의 가격을 기준으로 에이전트의 도구 호출을 거부하고, 인지 에이전트라면 다음 단계도 거부합니다([한도와 정책](./cognitive-agents#limits-and-policies) 참고). 이미 시작된 모델 호출은 중단되지 않으며, `toolName`을 지정하면 그 도구만 거부합니다. 가격이 없는 모델이 있거나 토큰 수를 보고하지 않는 호출이 있으면 한도를 확인할 수 없으므로 그 도구 호출과 단계가 거부됩니다. 0 이상의 유한한 숫자가 아닌 `maxCost`(설정 파일에서 읽은 `'0.5'` 같은 문자열, `NaN`, 음수 금액, `Infinity`, `null`)는 정책을 적용할 때 `ValidationError`로 거부됩니다.

예산은 `getRunCost`가 읽는 모델 호출을 같은 방식으로 셉니다. [실패한 호출](#failed-calls)도 포함하며, 토큰 수가 없는 호출은 비용을 알 수 없는 호출로 셉니다. 통제형 에이전트의 추론 단계, 인지 에이전트의 사고(수정과 실패한 시도 포함), 도구 선택, 타입 지정 결정, 청구된 시도 뒤에 중단된 연산, 두 경우 모두 프로바이더가 쓸 수 없었던 응답, 그리고 `sdk.decisions`로 내린 타입 지정 결정(거부된 답 포함)입니다. `agentId`를 지정한 한도는 그 에이전트의 모델 호출과, `agentId`로 그 에이전트를 지정한 `sdk.decisions` 호출을 셉니다. 지정하지 않은 한도는 에이전트 없이 내린 타입 지정 결정까지 포함해 모두를 셉니다. 예산은 `sdk.decisions` 호출을 거부하지 않습니다. 거부하는 것은 도구 호출과 인지 에이전트의 단계입니다.
