# 아키텍처

![SDK의 아키텍처](/images/architecture.svg){.illustration}

## 인지 계층 (v0.2) {#cognitive-layer-v0-2}

버전 0.2는 아래에서 설명하는 통제형 런타임 위에 추론 계층을 더합니다. 이 계층은 작고 교체 가능한 부품들로 만들어져 있습니다.

| 부품 | 모듈 | 책임 |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | 실행 루프, 취소, 타임아웃, 피드백 |
| `OperationSelector` | `src/cognition/operation-selector.ts` | 사용 가능한 연산을 계산하고, 컨트롤러에 묻고, 최종 결정을 강제합니다 |
| 컨트롤러 | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | 휴리스틱과 Jev 기반의 다음 연산 선택 |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | 사고 생성기, 정보 탐색기, 예측 테스터 또는 가설 평가기로 작업을 보냅니다 |
| 패치 수용 | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | 모든 사고의 단일 진입점: 연산별로 허용된 필드, 엔진 전용 필드, 결정의 정리 |
| 증거 | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | 관찰의 출처, 사실의 수정, 비교, 테스트 결과, 모순과 그 해소 |
| 상태 뷰 | `src/cognition/mental-state-view.ts` | 사고 프롬프트와 컨트롤러 데이터셋을 위한 상태의 압축된 뷰: 준비도, 순위, 이미 수행한 실험 |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | 대기 중인 예측에 여러분의 `OutcomeEvaluator`를 실행하고 보고서를 기록합니다 |
| 결론 가드 | `src/cognition/decision-readiness.ts` | 순위, 준비 검사, committed / provisional / abstain |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | 연산마다 프롬프트 하나, 엄격한 JSON, Zod 검증, 수정 한 번 |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | 네이티브 추론 엔진을 이용한 도구 선택, 액션 엔진을 통한 실행 |
| 리듀서 | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | 불변 조건을 지키며 사고 패치를 순수하고 결정론적으로 적용합니다. `schemaVersion`으로 버전이 관리됩니다 |
| 리플레이 | `src/cognition/mental-state-replay.ts` | 이벤트로부터의 심적 상태 재구성과 컨트롤러 데이터셋 |
| 프로필 | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | 프로필 스키마, 렌더링, 다듬기, 추출 |
| 가설 평가기 | `src/cognition/hypothesis-assessor.ts` | 타입 지정 결정을 이용한 `compare`: 증거는 사고자 없이 묻고, 적합도는 제안에 대해서만 묻습니다 |
| 기록기와 팩토리 | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | 인지 실행의 이벤트 형태, 설정과 SDK 서비스로부터의 에이전트 조립 |

그 주변에는 `src/decisions`(타입 지정 결정, Jev 클라이언트, 결정 서비스), `src/costs`(가격과 실행 비용), `src/resilience`(재시도 정책과 재시도 프로바이더), `src/incidents`(규칙, 알림기, 모니터링되는 이벤트 저장소), `src/mcp`(서버와 클라이언트, `@sdk-ai-agents/core/mcp`로 게시됨)가 있습니다.

이 페이지의 나머지 부분은 통제형 런타임(v0.1)을 설명합니다.

## 요약 {#executive-summary}

SDK_AI_Agents는 추론과 행동을 엄격히 분리하는 이벤트 소싱 아키텍처를 따릅니다. SDK는 내부의 복잡성을 단순하고 직관적인 API 뒤에 숨깁니다.

## 아키텍처 패턴 {#architecture-pattern}

**주요 패턴:** 관심사 분리를 갖춘 이벤트 소싱

- **추론 엔진**: LLM으로부터 의도를 생성합니다(부작용 없음)
- **액션 엔진**: 검증 후 의도를 실행합니다
- **정책 엔진**: 의도를 정책에 대해 검증합니다
- **이벤트 저장소**: 모든 이벤트에 대한 유일한 진실의 원천

## 구성 요소 개요 {#component-overview}

### 1. SDK API 계층 (퍼사드) {#_1-sdk-api-layer-facade}

**책임:**
- 단순하고 직관적인 공개 인터페이스
- API → 내부 이벤트 매핑
- 똑똑한 기본 설정
- SDK와 에이전트의 생명 주기 관리

**파일:**
- `src/sdk.ts`: 주 구현(`SDKImpl`)
- `src/agent.ts`: 에이전트 구현(`AgentImpl`)
- `src/index.ts`: 공개 export

**주요 인터페이스:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. 추론 엔진 {#_2-reasoning-engine}

**책임:**
- LLM 프로바이더(OpenAI/Anthropic)와의 통합
- LLM 응답으로부터 구조화된 의도 생성
- 대화 컨텍스트 관리
- 추론 이벤트 발행

**파일:** `src/engines/reasoning-engine.ts`

**제약:**
- 도구를 직접 실행할 수 없습니다
- 부작용을 일으킬 수 없습니다
- 구조화된 의도만 생성합니다

**의존성:**
- LLM 프로바이더(전략 패턴)
- 이벤트 저장소(이벤트 발행)

### 3. 액션 엔진 {#_3-action-engine}

**책임:**
- 의도를 받아 검증하기
- 도구 레지스트리를 통해 도구 실행하기
- 정책 엔진을 통해 정책 적용하기
- 행동 이벤트 발행

**파일:** `src/engines/action-engine.ts`

**제약:**
- 모든 행동은 액션 엔진을 거쳐야 합니다
- 실행 전에 검증이 필요합니다
- 모든 행동마다 이벤트가 발행됩니다

**의존성:**
- 정책 엔진(검증)
- 도구 레지스트리(실행)
- 이벤트 저장소(이벤트 발행)
- 승인 관리자(선택 사항)
- 예산 추적기(선택 사항)

### 4. 정책 엔진 {#_4-policy-engine}

**책임:**
- 활성 정책에 대해 의도 검증하기
- 전역 정책과 개별 정책 적용하기
- 예산, 타임아웃, 허용 목록 검사하기
- 검증 이벤트 발행

**파일:** `src/engines/policy-engine.ts`

**제약:**
- 기본 거부(Deny-by-default): 명시적으로 허용되지 않은 모든 것은 금지됩니다
- 모든 행동 전에 필수 검사

**의존성:**
- 이벤트 저장소(검증 이벤트 발행)
- 예산 추적기(선택 사항)
- 조건 평가기

### 5. 리플레이 엔진 {#_5-replay-engine}

**책임:**
- 영속화된 이벤트로부터 실행을 리플레이하기
- LLM 호출 없는 결정론적 리플레이
- 새 리플레이 이벤트 생성

**파일:** `src/engines/replay-engine.ts`

**제약:**
- 리플레이는 영속화된 이벤트만 사용합니다
- 리플레이 중에는 LLM을 호출하지 않습니다
- 리플레이는 같은 논리적 순서를 재현합니다

**의존성:**
- 이벤트 저장소(이벤트 읽기)
- 액션 엔진(의도 실행)

### 6. 이벤트 저장소 {#_6-event-store}

**책임:**
- 이벤트 영속화(덧붙이기만 함)
- runId로 이벤트 조회
- 이벤트 필터링과 쿼리
- 여러 구현을 위한 추상화

**파일:**
- `src/stores/event-store.ts`: `IEventStore` 인터페이스
- `src/stores/file-event-store.ts`: 파일 기반 구현
- `src/stores/sql-event-store.ts`: 범용 SQL 구현
- `src/stores/sqlite-event-store.ts`: SQLite 구현
- `src/stores/postgresql-event-store.ts`: PostgreSQL 구현

**인터페이스:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
}
```

### 7. 도구 레지스트리 {#_7-tool-registry}

**책임:**
- 선언된 도구 관리
- 입력 스키마 검증(Zod)
- 검증을 거쳐 도구 실행
- 엄격한 허용 목록(기본 거부)

**파일:** `src/registry/tool-registry.ts`

**제약:**
- 선언되지 않은 도구는 자동으로 거부됩니다
- 실행 전에 필수 검증
- 엄격한 허용 목록

**의존성:**
- Zod(스키마 검증)

### 8. 역량 레지스트리 {#_8-capability-registry}

**책임:**
- 역량(도구 묶음) 관리
- 도구 ↔ 역량 연결

**파일:** `src/registry/capability-registry.ts`

### 9. LLM 프로바이더 추상화 {#_9-llm-provider-abstraction}

**책임:**
- LLM 프로바이더 사이의 차이를 추상화하기
- 요청/응답 형식 정규화
- 멀티 프로바이더 지원(OpenAI, Anthropic)
- 자동 폴백

**파일:**
- `src/providers/llm-provider.ts`: `LLMProvider` 인터페이스
- `src/providers/openai-provider.ts`: OpenAI 구현
- `src/providers/anthropic-provider.ts`: Anthropic 구현
- `src/providers/fallback-provider.ts`: 폴백을 갖춘 프로바이더
- `src/providers/provider-factory.ts`: 프로바이더를 만드는 팩토리

**인터페이스:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. 관리자 클래스 {#_10-manager-classes}

**책임:**
- 고급 기능 관리
- 구성 요소 사이의 조정

**파일:**
- `src/managers/approval-manager.ts`: 사람의 승인 관리
- `src/managers/budget-tracker.ts`: 예산과 사용량 추적
- `src/managers/golden-trace-manager.ts`: 골든 트레이스 관리
- `src/managers/regression-test-manager.ts`: 테스트 스위트 관리
- `src/managers/assertion-manager.ts`: 단언(assertion) 관리
- `src/managers/impact-analysis-manager.ts`: 영향 분석 관리

## 데이터 아키텍처 {#data-architecture}

### 이벤트 유형 {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';
```

### 이벤트 구조 {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### 이벤트 저장소 구현 {#event-store-implementations}

1. **FileEventStore** (MVP)
   - 파일 기반 영속화
   - runId마다 JSON 파일 하나
   - 자동 일괄 플러시

2. **SQLEventStore** (프로덕션)
   - 범용 SQL 구현
   - SQLite와 PostgreSQL 지원
   - 성능을 위한 인덱스

3. **PostgreSQLEventStore** (고급 프로덕션)
   - 효율적인 저장을 위해 JSONB 사용
   - JSON 쿼리를 위한 GIN 인덱스
   - 고급 쿼리 지원

## API 설계 {#api-design}

### SDK 초기화 {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### 에이전트 생성 {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### 도구 정의 {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### 에이전트 실행 {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## 테스트 전략 {#testing-strategy}

### 단위 테스트 {#unit-tests}

- 모듈마다 단위 테스트
- Vitest 사용
- 외부 의존성의 모킹

### 통합 테스트 {#integration-tests}

- 전체 작업 흐름에 대한 통합 테스트
- 여러 이벤트 저장소를 사용한 테스트
- 리플레이 테스트

### 골든 트레이스 {#golden-traces}

- 회귀 테스트를 위한 기준 트레이스
- 리플레이를 통한 동작 검증
- 자동 회귀 탐지

## 배포 아키텍처 {#deployment-architecture}

### 패키지 배포 {#package-distribution}

- **패키지 이름**: `@sdk-ai-agents/core`
- **배포 채널**: npm
- **진입점**: `dist/index.js`
- **타입 정의**: `dist/index.d.ts`

### 빌드 과정 {#build-process}

1. TypeScript 컴파일(`tsc`)
2. 소스 맵 생성
3. 선언 파일 생성
4. `dist/`에 출력

### 의존성 {#dependencies}

**런타임:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**피어 의존성:**
- `pg`: ^8.11.0 (PostgreSQLEventStore용)

**개발 의존성:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## 보안 고려 사항 {#security-considerations}

### 기본 거부(Deny-by-Default) {#deny-by-default}

- 모든 도구는 명시적으로 선언해야 합니다
- 모든 행동은 정책 엔진을 거쳐야 합니다
- 실행 전에 필수 검증

### 관심사 분리 {#separation-of-concerns}

- 추론 엔진은 도구를 실행할 수 없습니다
- 액션 엔진은 실행 전에 검증합니다
- 정책 엔진은 모든 행동을 검사합니다

### 감사 추적 {#audit-trail}

- 모든 이벤트가 영속화됩니다
- 결정의 완전한 추적성
- 정책 감사 추적

## 성능 고려 사항 {#performance-considerations}

### 이벤트 저장소 성능 {#event-store-performance}

- FileEventStore: 일괄 플러시(이벤트 10개 또는 100ms)
- SQLEventStore: 빠른 쿼리를 위한 인덱스
- PostgreSQLEventStore: JSONB + GIN 인덱스

### SDK 오버헤드 {#sdk-overhead}

- 최소한의 오버헤드(LLM/도구를 제외하고 < 5-10ms)
- 비동기 이벤트 발행
- 성능을 위한 일괄 플러시

## 향후 고려 사항 {#future-considerations}

### 확장성 {#scalability}

- 분산 이벤트 저장소(Kafka 방식)로의 이전
- 다중 인스턴스 지원
- 이벤트 저장소 클러스터링

### 기능 {#features}

- 추가 LLM 프로바이더 지원
- 클라우드 이벤트 저장소(S3 등)
- 모니터링 대시보드
