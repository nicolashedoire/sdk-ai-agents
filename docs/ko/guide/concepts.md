# 핵심 개념

## 개요 {#overview}

SDK AI Agents는 추론과 행동을 분리하고, 리플레이와 감사를 위한 네이티브 이벤트 소싱을 제공하는 AI 에이전트용 거버넌스 인프라입니다. 그 위에 [인지 에이전트](./cognitive-agents)가 명시적인 추론 계층을 더하고, [타입 지정 결정](./typed-decisions)이 보정된 구조화 답변을 더합니다.

::: info 이 페이지는 기초를 다룹니다
에이전트, 도구, 역량, 정책, 의도, 이벤트 저장소, 트레이스, 리플레이입니다. 이 개념들은 통제형 에이전트와 인지 에이전트에 똑같이 적용됩니다.
:::

## 기본 개념 {#fundamental-concepts}

### 1. 에이전트 {#_1-agent}

**에이전트**(Agent)는 LLM을 사용해 의도를 생성하지만, 모든 행동은 통제된 액션 엔진을 거치는, 통제되는 의사 결정 시스템입니다.

**특징:**
- 최소한의 설정(이름, LLM 모델)
- 명시적으로 선언된 도구
- 거버넌스를 위한 정책
- 추적을 위한 버전 관리
- 도구를 정리하기 위한 역량

**예시:**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. 도구 {#_2-tool}

**도구**(Tool)는 에이전트가 사용할 수 있도록 명시적으로 선언된 기능입니다. 모든 도구는 사용하기 전에 등록해야 합니다(deny-by-default, 기본 거부).

**특징:**
- 필수 Zod 검증 스키마
- 비동기 핸들러
- 버전 관리
- 역량과의 연결(선택 사항)

**예시:**
```typescript
const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    // Implementation
  },
  version: '1.0.0',
  capability: 'math'
})
```

바로 쓸 수 있는 도구(폴더, 데이터베이스, 웹 API, 웹, 다른 에이전트, MCP 서버)와 모든 호출이 통제되는 방식은 [도구](./tools)를 보세요.

### 3. 역량 {#_3-capability}

**역량**(Capability)은 여러 에이전트에서 재사용할 수 있는 도구의 논리적 묶음입니다.

**특징:**
- 이름과 설명
- 연결된 도구 목록
- 버전 관리
- 선택적 메타데이터

**예시 (도구 이름 사용):**
```typescript
const calculatorTool = sdk.defineTool({ /* ... */ });
const scientificTool = sdk.defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

**예시 (Tool 객체를 직접 사용):**
```typescript
const calculatorTool = defineTool({ /* ... */ });
const scientificTool = defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

### 4. 정책 {#_4-policy}

**정책**(Policy)은 각 행동 전에 적용되는 거버넌스 규칙을 정의합니다.

**정책 유형:**
- **예산(Budget)**: 단계 수, 토큰 수, 도구 호출 수 또는 비용의 한도(실행별, 또는 에이전트, 도구, 기간별)
- **타임아웃(Timeout)**: 최대 실행 시간
- **허용 목록(Allowlist)**: 허용된 도구 목록
- **커스텀(Custom)**: 직접 만든 검증기

**예시:**
```typescript
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 }
  }],
  scope: 'global',
  enabled: true
})
```

### 5. 의도 {#_5-intention}

**의도**(Intention)는 LLM이 생성하는 구조로, 에이전트가 하고 싶은 일을 직접 실행하지 않고 기술합니다.

**유형:**
- `tool_call`: 특정 도구 호출
- `final_answer`: 사용자에게 주는 최종 답변
- `continue`: 추론 계속하기

**보안:**
- 모든 의도는 정책 엔진이 검증합니다
- LLM이 직접 행동하는 일은 없습니다
- 완전한 추적성

### 6. 이벤트 저장소 {#_6-event-store}

**이벤트 저장소**(Event Store)는 모든 실행에 대한 유일한 진실의 원천입니다.

**특징:**
- 자동 영속화(기본값은 JSON 파일)
- 성능을 위한 일괄 처리(batching)
- 전체 내보내기
- 유형, 날짜 등으로 필터링

**주요 이벤트:**
- `run.started`: 실행 시작
- `intention.generated`: LLM이 생성한 의도
- `policy.checked`: 정책 검사
- `action.executed`: 실행된 행동
- `tool.called`: 호출된 도구
- `run.completed`: 실행 완료
- `run.failed`: 실행 실패
- `run.cancelled`: 실행 취소

### 7. 트레이스 {#_7-trace}

**트레이스**(Trace)는 하나의 완전한 실행을 사람이 읽을 수 있게 표현한 것입니다.

**내용:**
- 이벤트 타임라인
- 통계 요약
- 최종 상태
- 메타데이터

**예시:**
```typescript
const trace = await sdk.getTrace(runId)
console.log(trace.summary)
// {
//   totalEvents: 15,
//   duration: 1234,
//   intentionsGenerated: 3,
//   actionsExecuted: 2,
//   policiesChecked: 2,
//   toolsCalled: 2
// }
```

### 8. 리플레이 {#_8-replay}

**리플레이**(Replay)를 사용하면 LLM에 다시 연락하지 않고 완전한 실행을 다시 재생할 수 있습니다.

**특징:**
- 결정론적(같은 행동 순서)
- 수정 가능(입력, 정책, 도구)
- 인시던트 디버깅
- 비회귀 테스트

**예시:**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## 아키텍처 원칙 {#architectural-principles}

### 1. 추론과 행동의 분리 {#_1-reasoning-action-separation}

LLM은 의도를 생성할 뿐, 직접 행동하지 않습니다. 모든 행동은 액션 엔진을 거칩니다.

### 2. 기본 거부(Deny-by-Default) {#_2-deny-by-default}

기본적으로 아무것도 허용되지 않습니다. 무엇이든 도구를 실행하려면, 그 전에 모든 도구가 명시적으로 선언(등록)되어야 합니다.

::: info 통제형 에이전트의 범위
통제형 에이전트는 **자신의 도구만** 실행합니다. `tools`에 있는 도구와 `capabilities`에 있는 도구입니다. 모델이 그 밖의 도구의 이름을 대면, 다른 에이전트를 위해 SDK에 등록된 도구라 해도 그 호출은 실행 전에 거부됩니다(`policy.violated`, `allowed-tools`). 인지 에이전트, 연구, MCP 서버도 같은 방식으로 자신의 도구 목록으로 제한됩니다. `allowlist` 정책은 에이전트 하나 또는 모든 에이전트에 대해 이 범위를 더 좁힙니다.
:::

### 3. 네이티브 이벤트 소싱 {#_3-native-event-sourcing}

이벤트 소싱 덕분에 모든 실행은 추적하고 리플레이할 수 있습니다.

### 4. 내장된 거버넌스 {#_4-built-in-governance}

정책은 선택 사항이 아니라 구조적으로 적용됩니다.

### 5. 완전한 버전 관리 {#_5-full-versioning}

에이전트, 도구, 역량은 추적과 추적성을 위해 버전이 관리됩니다.

## 일반적인 작업 흐름 {#typical-workflow}

1. **초기화**: API 키로 SDK를 만듭니다
2. **정의**: 도구와 역량을 정의합니다
3. **구성**: 도구와 정책을 가진 에이전트를 만듭니다
4. **실행**: 입력을 주어 에이전트를 실행합니다
5. **관찰**: 실행 트레이스를 검토합니다
6. **리플레이**: 디버깅이나 테스트를 위해 리플레이합니다

## 모범 사례 {#best-practices}

### 도구 {#tools}
- 엄격한 Zod 스키마를 사용하세요
- 각 도구를 명확하게 문서화하세요
- 도구가 바뀌면 버전을 올리세요

### 정책 {#policies}
- 합리적인 예산을 적용하세요
- 엄격한 허용 목록을 사용하세요
- 프로덕션 전에 정책을 테스트하세요

### 역량 {#capabilities}
- 도구를 논리적으로 묶으세요
- 여러 에이전트에서 역량을 재사용하세요
- 역량을 문서화하세요
- **권장 작업 흐름:** `defineCapability()`에는 도구 이름(문자열)이나 Tool 객체를 직접 전달할 수 있습니다. Tool 객체를 전달하면 자동으로 등록됩니다.

### 버전 관리 {#versioning}
- 시맨틱 버저닝을 사용하세요
- 버전 변경 사항을 문서화하세요
- 이벤트에서 버전을 추적하세요

## 보안 {#security}

- **기본 거부(Deny-by-default)**: 선언되지 않은 도구는 실행될 수 없습니다
- **검증**: 모든 입력은 Zod로 검증됩니다
- **정책**: 모든 행동 전에 검사됩니다
- **추적성**: 모든 행동이 추적됩니다
- **감사**: 전체 감사를 위해 리플레이를 쓸 수 있습니다
