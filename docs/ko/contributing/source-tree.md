# 소스 트리

## 개요 {#overview}

SDK는 책임이 분리된 명확한 모듈 구조로 구성되어 있습니다. 주 소스 코드는 `src/`에 있으며, 기능 영역마다 하위 폴더가 있습니다.

## 전체 디렉터리 구조 {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## 핵심 디렉터리 {#critical-directories}

### `src/engines/` {#src-engines}

**목적:** 에이전트의 생명 주기를 조율하는 SDK의 주요 엔진을 담고 있습니다.

**내용:**
- `reasoning-engine.ts`: LLM으로부터 의도를 생성합니다(부작용 없음)
- `action-engine.ts`: 정책 엔진의 검증 후 의도를 실행합니다
- `policy-engine.ts`: 구성된 정책에 대해 의도를 검증합니다
- `replay-engine.ts`: 영속화된 이벤트로부터 실행을 리플레이합니다

**진입점:** `AgentImpl`과 `SDKImpl`이 사용합니다

**통합:** 엔진은 생성자를 통해 `AgentImpl`과 `SDKImpl`에 주입됩니다

### `src/stores/` {#src-stores}

**목적:** 이벤트 영속화를 위한 `IEventStore` 인터페이스의 구현들입니다.

**내용:**
- `event-store.ts`: 공통 `IEventStore` 인터페이스
- `file-event-store.ts`: 파일 기반 구현(MVP)
- `sql-event-store.ts`: 범용 SQL 구현
- `sqlite-event-store.ts`: SQLite 구현
- `postgresql-event-store.ts`: JSONB를 쓰는 PostgreSQL 구현
- `observed-event-store.ts`: 추가된 각 이벤트를 리스너에게 실시간으로 전달(`onEvent`, `sdk.subscribe`)

**진입점:** `SDKImpl`과 `ReplayEngine`이 사용합니다

**통합:** 설정을 통해 `SDKImpl`에 주입됩니다

### `src/providers/` {#src-providers}

**목적:** 여러 LLM 프로바이더를 위한 `LLMProvider` 인터페이스의 구현들입니다.

**내용:**
- `llm-provider.ts`: 공통 `LLMProvider` 인터페이스
- `openai-provider.ts`: OpenAI 구현
- `anthropic-provider.ts`: Anthropic 구현
- `fallback-provider.ts`: 자동 폴백을 갖춘 프로바이더
- `provider-factory.ts`: 프로바이더를 만드는 팩토리

**진입점:** `ReasoningEngine`이 사용합니다

**통합:** 생성자를 통해 `ReasoningEngine`에 주입됩니다

### `src/managers/` {#src-managers}

**목적:** 고급 기능(승인, 예산, 테스트 등)을 위한 관리 클래스들입니다.

**내용:**
- `approval-manager.ts`: 사람의 승인 관리
- `budget-tracker.ts`: 예산과 사용량 추적
- `golden-trace-manager.ts`: 골든 트레이스 관리
- `regression-test-manager.ts`: 회귀 테스트 스위트 관리
- `assertion-manager.ts`: 동작 단언 관리
- `impact-analysis-manager.ts`: 영향 분석 관리

**진입점:** `SDKImpl`과 `PolicyEngine`이 사용합니다

**통합:** 생성자를 통해 `SDKImpl`과 `PolicyEngine`에 주입됩니다

### `src/registry/` {#src-registry}

**목적:** 사용 가능한 도구와 역량을 관리하는 레지스트리입니다.

**내용:**
- `tool-registry.ts`: 사용 가능한 도구 관리(기본 거부)
- `capability-registry.ts`: 역량 관리(도구 묶음)

**진입점:** `SDKImpl`과 `ActionEngine`이 사용합니다

**통합:** 생성자를 통해 `SDKImpl`과 `ActionEngine`에 주입됩니다

### `src/types/` {#src-types}

**목적:** SDK의 모든 타입에 대한 TypeScript 정의입니다.

**내용:**
- Agent, Tool, Policy, Event, Run, SDK의 타입
- 고급 기능(추론 그래프, 대안 등)의 타입
- 테스트(골든 트레이스, 회귀, 단언 등)의 타입

**진입점:** 모든 모듈이 import합니다

**통합:** 타입 안전성을 위해 코드베이스 전체에서 쓰입니다

### `src/utils/` {#src-utils}

**목적:** 유틸리티 함수와 헬퍼입니다.

**내용:**
- `constants.ts`: 전역 상수
- `id.ts`: 고유 ID 생성
- `zod-to-json-schema.ts`: Zod → JSON Schema 변환
- 추론 그래프, 대안, 패턴 등을 위한 유틸리티
- 테스트(검증, 회귀, 단언 등)를 위한 유틸리티

**진입점:** 필요한 모듈이 import합니다

**통합:** 엔진, 관리자, 그 밖의 모듈이 사용합니다

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**목적:** 인지 에이전트 — 명시적인 심적 상태, 인지 연산, 컨트롤러, 사고자 프로필.

**내용:** `cognitive-agent.ts`(실행 루프), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts`(휴리스틱), `typed-decision-controller.ts`(Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts`와 `thought-prompts.ts`, `mental-state.ts`(스키마와 타입), `mental-state-reducer.ts`와 `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/study/` {#src-study}

**목적:** 연구(`sdk.createStudy`) — 대상을 이해한 다음 그것을 어떻게 다시 설계할지 제안하는 연구자로, 인지 엔진과는 분리되어 있습니다.

**내용:** `study.ts`(`Study` 클래스: 실행, 감시자, 개정안, 선행 기술 검색), `passages.ts`(일곱 과정과 그 컬렉션, 스키마), `study-config.ts`(설정, 고정된 헌장과 그 해시), `study-prompts.ts`와 `study-replies.ts`(호출마다 다시 만드는 프롬프트, 스키마에 대조해 읽는 응답), `study-claims.ts`(코드로 검사되는 주장 상태), `study-sources.ts`(소스, 쿼리 매개변수, 결과), `study-model.ts`와 `study-run.ts`(모델 호출, 한도, 이벤트), `study-report.ts`, `study-markdown.ts`와 `study-labels.ts`(보고서, 그리고 열한 개 언어로 된 자료집), `study-types.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**목적:** 타입 지정 결정 — Noul/Choice/Score 계약, TypeSafe Jev HTTP 클라이언트, 그리고 `sdk.decisions` 뒤에 있는 `DecisionService`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**목적:** 가격과 실행별 비용 보고서, 재시도 정책과 재시도 LLM 프로바이더, 인시던트 규칙, 알림기(이메일, 웹훅, Resend)와 모니터링되는 이벤트 저장소.

### `src/mcp/`와 `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**목적:** 통제된 도구와 리소스를 노출하는 MCP 서버(`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`)와, 도구를 가져오는 MCP 클라이언트(`mcp-client.ts`). 코어가 `@modelcontextprotocol/sdk`에 의존하지 않도록 `@sdk-ai-agents/core/mcp` 진입점으로 게시됩니다.

### `src/tools/` {#src-tools}

**목적:** MCP에 의존하지 않고 시스템으로부터 `ToolDefinition`을 만드는 도구 소스: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts`(웹 API), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts`(폴더와 리소스), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts`(읽기 전용 데이터베이스), `agent-tools.ts`(도구로서의 에이전트), 그리고 `tool-names.ts`와 `bounded-text.ts`.

### `src/__tests__/support/` {#src-tests-support}

**목적:** SDK 포트를 구현하는 테스트 대역(스크립트로 동작하는 LLM 프로바이더, 인메모리 결정 클라이언트, 로컬 HTTP 서버, 기록하는 PostgreSQL 클라이언트, `node:sqlite` 로더) — 모듈 모킹은 없습니다.

## 진입점 {#entry-points}

### 주 진입점 {#main-entry}

- **`src/index.ts`**: SDK의 공개 진입점으로, 모든 공개 API를 export합니다

### 애플리케이션 진입점 {#application-entry-points}

- **`src/sdk.ts`**: 주 SDK 구현(`SDKImpl`)
- **`src/agent.ts`**: 에이전트 구현(`AgentImpl`)

## 파일 구성 패턴 {#file-organization-patterns}

### 명명 규칙 {#naming-conventions}

- **파일**: 파일에는 kebab-case(예: `reasoning-engine.ts`)
- **클래스**: PascalCase(예: `ReasoningEngine`)
- **인터페이스**: PascalCase, 필요하면 `I` 접두사(예: `IEventStore`)
- **타입**: PascalCase(예: `EventType`, `RunStatus`)
- **함수**: camelCase(예: `generateCompletion`)

### 모듈 구성 {#module-organization}

- **파일마다 클래스/인터페이스 하나**: 각 파일에는 주요 클래스나 인터페이스가 하나 들어 있습니다
- **함께 두는 타입**: 관련된 타입은 같은 파일이나 `types/`에 둡니다
- **배럴 export**: 공개 API를 export하는 `index.ts`

## 설정 파일 {#configuration-files}

- **`package.json`**: 의존성과 npm 스크립트
- **`tsconfig.json`**: TypeScript 설정(strict 모드, ESM)
- **`biome.json`**: Biome 설정(린트/포맷)
- **`vitest.config.ts`**: Vitest 설정(테스트)

## 개발 참고 사항 {#notes-for-development}

### 새 기능 추가하기 {#adding-new-features}

1. **새 엔진**: `src/engines/`에 만들고, `SDKImpl`이나 `AgentImpl`에 주입합니다
2. **새 저장소**: `src/stores/`에서 `IEventStore`를 구현합니다
3. **새 프로바이더**: `src/providers/`에서 `LLMProvider`를 구현합니다
4. **새 관리자**: `src/managers/`에 만들고, `SDKImpl`에 주입합니다
5. **새 타입**: `src/types/`에 추가하고, `types/index.ts`에서 export합니다

### 테스트 {#testing}

- `src/__tests__/`의 단위 테스트
- 소스 모듈마다 테스트 파일 하나
- 테스트에는 Vitest를 쓰세요

### 빌드 {#build}

- TypeScript가 `src/` → `dist/`로 컴파일합니다
- 디버깅을 위한 소스 맵 생성
- TypeScript 선언(`.d.ts`) 생성
