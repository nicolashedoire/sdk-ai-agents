---
layout: home

hero:
  name: SDK AI Agents
  text: 행동하기 전에 생각하는 통제형 에이전트
  tagline: 들여다볼 수 있는 심적 상태를 바탕으로 한 명시적 추론, Jev를 이용한 타입 지정 결정, MCP 커넥터 — 이 모두가 이벤트 소싱, 리플레이, 비용, 재시도, 인시던트 알림 위에서 동작합니다.
  image:
    src: /images/reasoning-loop.svg
    alt: 명시적인 심적 상태를 중심으로 도는 인지 루프
  actions:
    - theme: brand
      text: 시작하기
      link: /ko/guide/getting-started
    - theme: alt
      text: 에이전트가 생각하는 방식
      link: /ko/guide/cognitive-agents
    - theme: alt
      text: GitHub에서 보기
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: 프롬프트만이 아닌 추론
    details: 표현하기, 관찰 비교하기, 가설 세우기, 시뮬레이션하기, 테스트하기, 수정하기, 비판하기, 정보 찾기, 비교하기, 결정하기. 각 단계는 명시적인 심적 상태에 대한 연산이며, 컨트롤러가 선택하고 이벤트로 기록됩니다.
    link: /ko/guide/cognitive-agents
    linkText: 인지 루프
  - icon: 🔬
    title: 정당화할 수 있는 것만 믿습니다
    details: 관찰은 출처를 간직하고, 규칙에는 반증 가능한 예측이 따르며, 여러분의 평가기가 이를 테스트하고, 반증된 규칙은 수정됩니다. 그리고 답은 코드로 작성된 가드를 통과할 때에만 확정됩니다.
    link: /ko/guide/evidence-and-verification
    linkText: 증거와 검증
  - icon: 🪞
    title: 특정 인물처럼 추론합니다
    details: 네, 누군가의 추론 방식을 흉내 낼 수 있습니다. 몇 가지 주제를 자신의 말로 설명하면, 여러분의 주의 순서, 우선순위, 반사적 판단을 프로필로 추출하고, 이 프로필은 각 추론 단계의 지시문에 들어갑니다. 교정할 때마다 프로필에 추가되며, 여러분의 동의율이 얼마나 가까워졌는지 보여 줍니다.
    link: /ko/guide/thinker-profiles
    linkText: 특정 인물처럼 추론하기
  - icon: 🧭
    title: 항로를 지키는 연구자
    details: 오늘날의 수단으로 이해하고 다시 설계할 대상을 주세요. 연구자는 여러분의 소스를 검색하고, 확립된 사실을 가설과 신규 아이디어로부터 구분하고, 결정을 내려 줄 실험을 제안합니다. 고정된 헌장과 감시자가 연구자를 목표에 붙잡아 둡니다.
    link: /ko/guide/studies
    linkText: 연구
  - icon: 🎯
    title: Jev를 이용한 타입 지정 결정
    details: 어떤 컨텍스트든 주입하고 예/아니요, 단일 선택, 다중 선택, 등급 질문을 던지면, 코드가 바로 활용할 수 있는 보정된 확률을 받습니다.
    link: /ko/guide/typed-decisions
    linkText: 확신을 갖고 결정하기
  - icon: 🔌
    title: 무엇이든 MCP 서버로
    details: 웹 API, 문서 폴더, 읽기 전용 데이터베이스, 에이전트를 한 줄로 통제되고 추적되는 MCP 서버로 만들고, 어떤 MCP 서버의 도구든 여러분의 에이전트에게 제공하세요.
    link: /ko/guide/mcp
    linkText: 시스템 연결하기
  - icon: 🛡️
    title: 설계 단계부터 내장된 거버넌스
    details: 모델은 제안하고, 엔진이 결정합니다. 정책, 허용 목록, 예산, 사람의 승인이 모든 행동 전에 검사됩니다.
    link: /ko/guide/governed-agents
    linkText: 통제형 에이전트
  - icon: 🎞️
    title: 모든 것이 이벤트입니다
    details: LLM을 호출하지 않고 실행을 리플레이하고, 어떤 실행이든 심적 상태를 재구성하고, 실행을 비교해 골든 테스트로 만드세요.
    link: /ko/guide/observability
    linkText: 추적성과 리플레이
  - icon: 💸
    title: 눈에 보이는 비용
    details: 모든 LLM 호출과 타입 지정 결정의 토큰 사용량이 기록되고, 실행별·모델별로 가격이 매겨집니다.
    link: /ko/guide/costs
    linkText: API 비용
  - icon: 🔁
    title: 중첩되지 않는 재시도
    details: 페일오버 전에 프로바이더마다 하나의 재시도 정책을 적용하고, 멱등 도구는 재시도하며, 모든 재시도는 트레이스에 기록됩니다.
    link: /ko/guide/resilience
    linkText: 재시도와 폴백
  - icon: 🚨
    title: 여러분에게 도달하는 인시던트
    details: 실패한 실행, 차단된 행동, 프로바이더 페일오버는 타임라인과 함께 인시던트가 되어 이메일이나 웹훅으로 전송됩니다.
    link: /ko/guide/incidents
    linkText: 인시던트 알림
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## 프롬프트에서 감사 가능한 결정으로 {#from-a-prompt-to-a-decision-you-can-audit}

일반적인 LLM 호출은 질문에서 곧바로 답으로 갑니다. 인지 에이전트는 문제에 대한 명시적인 그림을 그리고, 여러 선택지를 탐색하고, 그 선택지를 압박해 보고, 통제된 도구로 사실을 확인한 다음에야 결론을 확정합니다. 그리고 여러분은 나중에 모든 단계를 읽어 볼 수 있습니다.

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![이벤트 로그에서 재구성한 심적 상태](/images/mental-state.svg){.illustration}

## 하나의 SDK, 모든 계층 {#one-sdk-every-layer}

![SDK의 아키텍처](/images/architecture.svg){.illustration}

| 필요한 것 | 원시 LLM API | SDK AI Agents |
| --- | --- | --- |
| 답하기 전에 추론하기 | 한 번에 생성 | 명시적 상태 위에서의 가설, 시뮬레이션, 비판 |
| 특정 인물처럼 추론하기 | 긴 시스템 프롬프트 | 피드백으로 다듬어지고 버전이 관리되는 사고자 프로필 |
| 목표에서 벗어나지 않는 조사 | 지시가 쌓일수록 주제에서 벗어나는 채팅 | 연구: 고정된 헌장, 호출마다 다시 만드는 프롬프트, 감시자, 소스에 대조해 검사되는 주장 |
| 빠르고 보정된 결정 | 자유 텍스트 파싱 | 확률과 신뢰도가 붙은 타입 지정 답변 (Jev) |
| 회사 도구 연결하기 | 도구마다 따로 만드는 연결 코드 | 정책으로 통제되는 MCP 서버와 클라이언트 |
| 무슨 일이 있었는지 알기 | 로그 (있다면) | 이벤트 로그, 리플레이, 심적 상태 재구성 |
| 위험과 지출 통제하기 | 희망 사항 | 정책, 승인, 예산, 실행별 비용, 인시던트 알림 |

</div>
