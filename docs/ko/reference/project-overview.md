# 프로젝트 개요

**유형:** 라이브러리(TypeScript SDK)
**아키텍처:** 관심사 분리를 갖춘 이벤트 소싱

## 요약 {#executive-summary}

SDK_AI_Agents는 네이티브 이벤트 소싱, 리플레이, 설계 단계부터의 보안을 갖춘 AI 에이전트 거버넌스 인프라입니다. 이 SDK는 AI 에이전트를 실험적인 도구에서 통제 가능하고, 설명 가능하며, 프로덕션에 투입할 수 있는 의사 결정 시스템으로 바꿉니다.

## 프로젝트 분류 {#project-classification}

- **저장소 유형:** 모놀리스(하나의 응집된 코드베이스)
- **프로젝트 유형:** 라이브러리(TypeScript SDK)
- **주 언어:** TypeScript 5.x
- **아키텍처 패턴:** 관심사 분리를 갖춘 이벤트 소싱(추론 엔진 ≠ 액션 엔진)

## 기술 스택 요약 {#technology-stack-summary}

| 범주 | 기술 | 버전 | 선정 이유 |
|----------|-----------|---------|---------------|
| 언어 | TypeScript | 5.3.2+ | 엄격한 타입 안전성, ESM 지원 |
| 런타임 | Node.js | 20.0.0+ | LTS 지원, 최신 기능 |
| 패키지 관리자 | npm | - | 표준 Node.js 패키지 관리자 |
| 빌드 도구 | TypeScript Compiler | 5.3.2 | 네이티브 TypeScript 컴파일 |
| 테스트 | Vitest | 1.0.4 | 빠른 Vite 기반 테스트 러너 |
| 린트/포맷 | Biome | 1.7.0 | 빠른 올인원 도구 |
| LLM 프로바이더 | OpenAI SDK | 4.20.0 | OpenAI API 통합 |
| LLM 프로바이더 | Anthropic SDK | 0.71.2 | Claude API 통합 |
| 검증 | Zod | 3.22.4 | 도구 입력을 위한 스키마 검증 |
| UUID | uuid | 9.0.1 | 고유 ID 생성 |
| 데이터베이스(선택 사항) | PostgreSQL | 8.11.0+ | 프로덕션 이벤트 저장소(피어 의존성) |

## 주요 기능 {#key-features}

### 핵심 역량 {#core-capabilities}

1. **네이티브 이벤트 소싱**
   - 모든 이벤트가 이벤트 저장소에 영속화됩니다
   - LLM 호출 없는 결정론적 리플레이
   - 모든 결정의 완전한 추적성

2. **추론과 행동의 분리**
   - 추론 엔진: 의도를 생성합니다(부작용 없음)
   - 액션 엔진: 검증 후 의도를 실행합니다
   - 설계 단계부터의 보안: LLM은 절대 직접 부작용을 일으키지 않습니다

3. **내장된 거버넌스**
   - 정책 엔진: 실행 전에 의도를 검증합니다
   - 예산 추적기: 에이전트/도구/기간별로 비용과 사용량을 추적합니다
   - 승인 관리자: 중요한 행동을 위한 사람의 승인 작업 흐름
   - 감사 추적: 정책 결정의 완전한 추적성

4. **멀티 프로바이더 LLM**
   - OpenAI와 Anthropic을 위한 LLMProvider 추상화
   - 프로바이더 사이의 자동 폴백
   - 프로바이더별 설정(temperature, maxTokens)

5. **인지 관측 가능성**
   - 추론 그래프: 추론 과정의 시각화
   - 대안 분석: 에이전트가 고려한 대안
   - 결정 패턴: 여러 실행에 걸친 결정 패턴
   - 트레이스 시각화: 시각화를 위한 트레이스 준비

6. **테스트와 품질 보증**
   - 골든 트레이스: 테스트를 위한 기준 트레이스
   - 회귀 탐지: 자동 회귀 탐지
   - 단언: 트레이스에 대한 동작 단언
   - CI/CD 통합: 테스트 결과 내보내기(JUnit XML, JSON)

7. **고급 관측 가능성**
   - 실행 비교: 두 실행 비교하기
   - 영향 분석: 배포 전후 영향 분석
   - 고급 이벤트 필터링: JSON 경로를 이용한 고급 이벤트 필터링

## 아키텍처 주요 특징 {#architecture-highlights}

### 이벤트 저장소 추상화 {#event-store-abstraction}

- **IEventStore**: 모든 이벤트 저장소의 공통 인터페이스
- **FileEventStore**: 파일 기반 구현(MVP)
- **SQLEventStore**: 범용 SQL 구현
- **SQLiteEventStore**: SQLite 구현
- **PostgreSQLEventStore**: JSONB를 쓰는 PostgreSQL 구현

### 엔진 아키텍처 {#engine-architecture}

- **ReasoningEngine**: LLM으로부터 의도를 생성합니다
- **ActionEngine**: 검증 후 의도를 실행합니다
- **PolicyEngine**: 의도를 정책에 대해 검증합니다
- **ReplayEngine**: 이벤트로부터 실행을 리플레이합니다

### 레지스트리 시스템 {#registry-system}

- **ToolRegistry**: 사용 가능한 도구를 관리합니다
- **CapabilityRegistry**: 역량(도구 묶음)을 관리합니다

### 관리자 시스템 {#manager-system}

- **ApprovalManager**: 사람의 승인 관리
- **BudgetTracker**: 예산과 사용량 추적
- **GoldenTraceManager**: 골든 트레이스 관리
- **RegressionTestManager**: 회귀 테스트 스위트 관리
- **AssertionManager**: 동작 단언 관리
- **ImpactAnalysisManager**: 영향 분석 관리

## 개발 개요 {#development-overview}

### 사전 요구 사항 {#prerequisites}

- Node.js 20.0.0+ (LTS)
- npm 또는 동등한 도구
- TypeScript 5.3.2+ (로컬에 설치)

### 시작하기 {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### 주요 명령 {#key-commands}

- **설치:** `npm install`
- **빌드:** `npm run build`
- **개발:** `npm run dev`(watch 모드)
- **테스트:** `npm test`
- **테스트 watch:** `npm run test:watch`
- **테스트 커버리지:** `npm run test:coverage`
- **린트:** `npm run lint`
- **포맷:** `npm run format`
- **검사:** `npm run check`(린트 + 포맷)

## 저장소 구조 {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

`src/`의 자세한 내용은 [소스 트리](../contributing/source-tree)를 보세요.

## 문서 안내 {#documentation-map}

자세한 정보는 다음을 보세요.

- [소개](../guide/introduction) - SDK의 용도
- [소스 트리](../contributing/source-tree) - 디렉터리 구조
- [아키텍처](./architecture) - 자세한 아키텍처
- [개발 가이드](../contributing/development) - 개발 작업 흐름
