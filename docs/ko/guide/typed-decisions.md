# 타입 지정 결정 (Jev)

어떤 질문에는 긴 글이 필요 없습니다. *이것은 긴급한가? 어느 팀인가? 얼마나 위험한가?* **타입 지정 결정**은 컨텍스트에 대해 모델에게 좁은 질문을 던지고, 여러분의 코드가 바로 활용할 수 있는 구조화되고 보정된 답을 반환합니다.

SDK는 최초의 "System One" 모델인 [TypeSafe Jev](https://docs.typesafe.ai)와, 같은 계약(`POST /v1/systemone`)을 노출하는 모든 백엔드를 통합합니다. 직접 호스팅하는 오픈 소스 클론도 여기에 포함됩니다.

![타입 지정 결정](/images/typed-decisions.svg){.illustration}

## 구성하기 {#configure}

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

| 옵션 | 기본값 | |
| --- | --- | --- |
| `apiKey` | — | `api.typesafe.ai`를 위한 TypeSafe 키, 또는 게이트웨이를 위한 AI Gateway 키(아래 참고). 키가 없는 자체 호스팅 클론에서는 선택 사항 |
| `baseUrl` | `https://api.typesafe.ai` | `POST /v1/systemone`을 노출하는 모든 서버 |
| `model` | `jev-latest` | 동작을 고정하려면 버전이 붙은 id를 지정하세요 |
| `timeoutMs` | `30000` | 시도당 |
| `maxRetries` | `2` | 408, 429, 5xx, 529 및 네트워크 오류일 때, `retry-after`를 존중하며 |
| `fetch` | 전역 `fetch` | 프록시를 인식하는 전송 계층을 주입합니다 |

### Vercel AI Gateway를 통해 {#through-vercel-ai-gateway}

Jev는 [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe)에서도 `typesafe-ai/jev`라는 이름으로 TypeSafe 호환 API를 통해 제공됩니다. TypeSafe 키 대신 AI Gateway 키를 쓰세요. 요청은 같은 가격(입력 토큰 100만 개당 $0.042, 출력 무료)으로 여러분의 Vercel 계정에 청구됩니다. AI Gateway에는 일부 모델에 대해 월간 크레딧을 주는 무료 티어도 있습니다. Jev가 포함되는지는 [가격 정책](https://vercel.com/docs/ai-gateway/pricing)을 확인하세요.

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

그 밖에는 아무것도 바뀌지 않습니다. `sdk.decisions`, 타입 지정 컨트롤러, 타입 지정 가설 평가기는 똑같이 동작하며, 비용은 `typesafe-ai/jev` 아래에 보고됩니다.

또는 `TypedDecisionClient`를 구현한 백엔드를 `decisionClient`로 가져올 수도 있습니다.

## 컨텍스트 주입하기 {#inject-your-context}

`context`는 모델이 평가하는 대상입니다. 평범한 텍스트일 수도 있고, 구조화된 데이터일 수도 있습니다. 티켓, 채팅 로그, 레코드, 애플리케이션의 상태 등이 그렇습니다. 질문에서는 그 필드를 백틱으로 감싼 이름으로 참조하세요.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## 단일 선택 {#single-choice}

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

`confident`는 답의 신뢰도로부터 **여러분의 코드 안에서** 계산됩니다. `false`라면 사람이나 더 강한 모델에게 넘기세요. 이것이 *신뢰도 기반 라우팅*(confidence-gated routing) 패턴입니다.

## 다중 선택 {#multiple-choice}

여러 선택지가 동시에 해당될 수 있나요? `selectMany`는 각 선택지를 별도의 예/아니요 질문으로 바꾸고, 이를 **한 번의 요청으로** 보내고, 여러분이 정한 임계값을 적용합니다.

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## 예/아니요와 등급 {#yes-no-and-ratings}

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

## 여러 질문, 한 번의 요청 {#many-questions-one-request}

Jev는 컨텍스트를 한 번 읽고 모든 질문에 병렬로 답합니다. `noul`, `choice`, `score` 헬퍼와 함께 `ask`를 쓰세요. 답의 타입은 추론됩니다.

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

## 인지 에이전트 안에서 {#inside-cognitive-agents}

결정 백엔드가 구성되어 있으면, 인지 에이전트는 자동으로 이를 사용합니다.

- **컨트롤러** — 단계마다 요청 한 번으로, 다음에 올 사용 가능한 연산이 무엇인지(Choice)와 추론이 결정할 준비가 되었는지(Noul)를 묻습니다.
- **비교** — `compare`는 사고자의 프로필 **없이** 한 요청으로 각 가설의 증거 지지도를 묻고, 그다음 제안에 대해서만 두 번째 요청으로 사고자와의 적합도를 묻습니다. 두 점수는 분리되어 유지됩니다. 적합도는 제안의 순서를 바꾸고(`limits.preferenceWeight`, 기본값 0.4), 사고자가 분명히 선호하는 제안이 그럴듯한 수준의 증거로 확정되게 하지만(`limits.minProposalSupport`), 주장의 신뢰성을 바꾸지는 절대 않습니다. [증거와 검증](./evidence-and-verification#evidence-is-not-preference)을 보세요.

Jev가 확신하지 못하거나 사용할 수 없을 때는 둘 다 LLM이나 휴리스틱 컨트롤러로 대체됩니다.

## 추적성과 비용 {#traceability-and-cost}

모든 타입 지정 결정은 그 컨텍스트, 질문, 답, 토큰 사용량과 함께 `decision.evaluated` 이벤트로 기록됩니다. 여러분이 넘긴 `runId`에 기록되거나, 전용 `decision_*` 스트림에 기록됩니다. Jev의 가격은 **입력 토큰 100만 개당 $0.042, 출력 무료**(2026-09-23 기준 문서)이므로, `sdk.getRunCost(runId)`에 별도 설정 없이 포함됩니다.

## 좋은 사용법 {#good-practice}

Jev는 글자 그대로 읽으며, 산술, 개수 세기, 날짜 비교에 약합니다. 숫자는 코드에서 다루고, 한 번에 원자적인 질문 하나씩 묻고, 각 선택지를 정확히 기술하는 기준을 쓰고, 컨텍스트는 질문에 필요한 것으로 걸러 주세요. TypeSafe의 [알려진 한계](https://docs.typesafe.ai/model-jaggedness/jev-1.13)를 보세요.
