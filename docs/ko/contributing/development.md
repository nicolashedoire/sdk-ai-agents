# 개발 가이드

## 사전 요구 사항 {#prerequisites}

### 필수 {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: Node.js에 포함
- **TypeScript**: 5.3.2+ (npm으로 로컬에 설치)

### 선택 {#optional}

- **PostgreSQL**: 8.11.0+ (PostgreSQLEventStore용, 피어 의존성)
- **Git**: 버전 관리용

## 환경 설정 {#environment-setup}

### 1. 저장소 복제하기 {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. 의존성 설치하기 {#_2-install-dependencies}

```bash
npm install
```

### 3. 환경 변수 구성하기 {#_3-configure-environment-variables}

루트에 `.env` 파일을 만드세요(선택 사항, 예제용).

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## 로컬 개발 {#local-development}

### 빌드 {#build}

TypeScript를 컴파일합니다.

```bash
npm run build
```

컴파일된 코드는 `dist/`에 생깁니다.

### Watch 모드 {#watch-mode}

watch 모드로 컴파일합니다(자동 재컴파일).

```bash
npm run dev
```

### 예제 실행하기 {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run example:test-api
```

## 테스트 {#testing}

### 모든 테스트 실행하기 {#run-all-tests}

```bash
npm test
```

### Watch 모드 {#watch-mode-1}

```bash
npm run test:watch
```

### 커버리지 {#coverage}

```bash
npm run test:coverage
```

### 특정 테스트 파일 실행하기 {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## 코드 품질 {#code-quality}

### 린트 {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### 포맷 {#formatting}

```bash
# Format code
npm run format
```

### 전체 검사 (린트 + 포맷) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## 자주 하는 개발 작업 {#common-development-tasks}

### 새 도구 추가하기 {#adding-a-new-tool}

1. `sdk.defineTool()`로 도구를 정의합니다.

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. 에이전트에 도구를 추가합니다.

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-4',
  tools: [myTool]
});
```

### 새 정책 추가하기 {#adding-a-new-policy}

1. 정책을 정의합니다.

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. 정책을 적용합니다.

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### 새 이벤트 저장소 추가하기 {#adding-a-new-event-store}

1. `IEventStore`를 구현합니다.

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. SDK에서 사용합니다.

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### 새 LLM 프로바이더 추가하기 {#adding-a-new-llm-provider}

1. `LLMProvider`를 구현합니다.

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

2. `ProviderFactory`에 추가합니다.

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## 빌드 과정 {#build-process}

### TypeScript 컴파일 {#typescript-compilation}

빌드는 TypeScript 컴파일러를 직접 사용합니다.

```bash
tsc
```

`tsconfig.json`의 설정:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Strict Mode**: 켜짐
- **Source Maps**: 켜짐
- **Declaration Files**: 켜짐

### 출력 구조 {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## 테스트 전략 {#testing-strategy}

### 단위 테스트 {#unit-tests}

- 모듈마다 단위 테스트
- Vitest 사용
- 외부 의존성(LLM 프로바이더, 이벤트 저장소)의 모킹

### 통합 테스트 {#integration-tests}

- 전체 작업 흐름에 대한 통합 테스트
- LLM 프로바이더에 목(mock) 사용
- 여러 이벤트 저장소를 사용한 테스트

### 테스트 구조 예시 {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## 디버깅 {#debugging}

### 소스 맵 {#source-maps}

소스 맵은 빌드 중에 자동으로 생성됩니다. 소스 맵 덕분에 TypeScript 코드를 직접 디버깅할 수 있습니다.

### VS Code 디버깅 {#vs-code-debugging}

`.vscode/launch.json` 설정:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## 코드 스타일 {#code-style}

### TypeScript 모범 사례 {#typescript-best-practices}

- **Strict 모드**: 항상 켭니다
- **타입 안전성**: 명시적인 타입을 쓰세요
- **`any` 금지**: `any`를 피하고, 필요하면 `unknown`을 쓰세요
- **인터페이스와 타입**: 객체에는 인터페이스를, 유니언/인터섹션에는 타입을 선호하세요

### 명명 규칙 {#naming-conventions}

- **파일**: kebab-case (`my-file.ts`)
- **클래스**: PascalCase (`MyClass`)
- **함수**: camelCase (`myFunction`)
- **상수**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **타입/인터페이스**: PascalCase (`MyType`)

### 코드 구성 {#code-organization}

- **파일마다 클래스/인터페이스 하나**
- **함께 두는 타입**: 같은 파일이나 `types/`에 타입을 둡니다
- **배럴 export**: 공개 export를 위한 `index.ts`

## 자주 겪는 문제 {#common-issues}

### TypeScript 오류 {#typescript-errors}

TypeScript 오류가 나면:

1. `tsconfig.json`이 올바른지 확인하세요
2. 모든 의존성이 설치되어 있는지 확인하세요
3. 정리하고 다시 빌드하세요: `npm run clean && npm run build`

### 테스트 실패 {#test-failures}

테스트가 실패하면:

1. 목(mock)이 올바른지 확인하세요
2. 의존성이 최신인지 확인하세요
3. 오류를 실시간으로 보려면 watch 모드로 테스트를 실행하세요

### 빌드 오류 {#build-errors}

빌드가 실패하면:

1. TypeScript 오류를 확인하세요: `npm run build`
2. 린트 오류를 확인하세요: `npm run lint`
3. `dist/` 폴더를 정리하세요: `npm run clean`

## 릴리스 과정 {#release-process}

### 버전 관리 {#versioning}

이 프로젝트는 시맨틱 버저닝(SemVer)을 씁니다.
- **MAJOR**: 호환되지 않는 변경
- **MINOR**: 하위 호환되는 새 기능
- **PATCH**: 하위 호환되는 버그 수정

### 릴리스 전 체크리스트 {#pre-release-checklist}

- [ ] 모든 테스트 통과
- [ ] 코드 린트와 포맷 완료
- [ ] 문서 최신화
- [ ] CHANGELOG.md 업데이트
- [ ] `package.json`의 버전 업데이트

### 릴리스용 빌드 {#build-for-release}

```bash
# Clean
npm run clean

# Build
npm run build

# Test
npm test

# Check
npm run check
```

## 자료 {#resources}

- **문서**: `docs/`
- **예제**: `examples/`
- **타입 정의**: `src/types/`
- **테스트**: `src/__tests__/`

## 문서 사이트 {#documentation-site}

문서는 `docs/`에 있는 VitePress 사이트이며, `docs/public/images/`의 SVG로 그림을 넣었습니다.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

`Docs` GitHub Actions 워크플로가 `main`에 푸시할 때마다 이를 GitHub Pages에 게시합니다.
