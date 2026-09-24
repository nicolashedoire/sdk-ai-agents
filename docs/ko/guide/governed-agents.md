# 통제형 에이전트

통제형 에이전트는 고전적인 도구 호출 루프를 실행하지만, 한 가지가 다릅니다. **LLM은 의도를 제안할 뿐입니다.** 무슨 일이든 일어나기 전에 액션 엔진이 모든 의도를 스키마와 정책에 대해 검증하고, 모든 단계를 기록합니다. 이 페이지에서는 도구, 역량, 정책, 트레이스, 리플레이, 실행 중지를 차례로 살펴봅니다.

::: tip 행동하기 전에 추론하기
정답이 정해지지 않은 결정에는 [인지 에이전트](./cognitive-agents)를 권합니다. 인지 에이전트도 같은 도구, 정책, 트레이스를 공유합니다.
:::

## 사전 요구 사항 {#prerequisites}

- Node.js 20+ 설치
- OpenAI API 키(또는 다른 LLM 프로바이더)
- TypeScript/JavaScript 기초 지식

## 설치 {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## 5분 만에 첫 에이전트 만들기 {#first-agent-in-5-minutes}

### 1단계: SDK 초기화하기 {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### 2단계: 도구 정의하기 {#step-2-define-a-tool}

도구는 에이전트가 사용할 수 있는 기능입니다. 명시적으로 선언해야 합니다.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### 3단계: 에이전트 만들기 {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
});
```

### 4단계: 에이전트 실행하기 {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### 5단계: 트레이스 보기 {#step-5-view-the-trace}

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## 전체 예제 (10줄) {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## 핵심 개념 {#key-concepts}

### 1. 도구 {#_1-tools}

도구는 에이전트가 수행할 수 있는 유일한 행동입니다. **기본적으로 아무것도 허용되지 않습니다**(deny-by-default). 무엇이든 도구를 실행하려면 먼저 그 도구가 등록되어 있어야 합니다.

::: warning 통제형 에이전트의 범위
통제형 에이전트는 모델이 이름을 대는 **SDK에 등록된 모든 도구**를 실행할 수 있습니다. 에이전트의 `tools` 목록은 모델에게 무엇을 제시할지를 정할 뿐, 무엇을 호출할 수 있는지를 정하지 않습니다. `allowlist` 정책으로 제한하세요. 그 밖의 도구는 실행 전에 거부됩니다.

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

인지 에이전트와 MCP 서버는 자동으로 자신의 도구 목록으로 제한됩니다.
:::

**특징:**
- Zod 스키마를 사용한 명시적 정의
- 자동 입력 검증
- 버전 관리 지원
- 완전한 추적성

**예시:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. 역량 {#_2-capabilities}

역량을 사용하면 도구를 논리적으로 묶어 재사용할 수 있습니다.

**예시:**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  capabilities: ['math'],
});
```

### 3. 정책 {#_3-policies}

정책은 에이전트가 할 수 있는 일을 통제합니다.

**정책 유형:**
- **예산(Budget)**: 단계 수 또는 토큰 수의 한도
- **타임아웃(Timeout)**: 최대 실행 시간
- **허용 목록(Allowlist)**: 허용된 도구 목록
- **커스텀(Custom)**: 직접 만든 검증기

**예시:**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

예산과 시간 제한은 통제형 에이전트 실행에서 도구를 호출하기 전마다, 그 실행의 진행 상황에 따라 확인됩니다. `maxSteps`는 이미 진행한 단계 수(첫 호출은 0단계), `maxTokens`는 모델 호출이 사용한 토큰 수, `maxDuration`은 실행 시작 이후 경과한 시간입니다. 제한은 도구 호출을 거부하고, 그 결과 실행이 실패합니다. 모델 호출을 중단하지는 않습니다. 기간별 토큰 예산(`maxTokens`를 지정한 `budgetLimit`)은 통제형 에이전트의 모델 호출 토큰을 집계하며, 리플레이도 원래 실행과 같은 방식으로 제한을 적용합니다. 인지 에이전트에는 자체 제한(`maxSteps`, `maxToolCalls`, `timeoutMs`)이 있습니다.

### 4. 트레이스 {#_4-traces}

모든 실행은 완전하고 리플레이 가능한 트레이스를 만듭니다.

**트레이스 가져오기:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**트레이스 내보내기:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. 리플레이 {#_5-replay}

LLM에 다시 연락하지 않고 실행을 리플레이합니다.

**단순 리플레이:**
```typescript
const replayResult = await sdk.replay(runId);
```

**수정을 가한 리플레이:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. 실행 중지하기 {#_6-stopping-execution}

진행 중인 실행을 중지합니다.

**에이전트에서:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**SDK에서:**
```typescript
await sdk.stopRun(runId);
```

## 일반적인 작업 흐름 {#typical-workflow}

1. API 키로 **SDK를 초기화합니다**
2. 사용 사례에 필요한 **도구를 정의합니다**
3. **역량을 만듭니다**(선택 사항, 정리를 위해)
4. 거버넌스를 위해 **정책을 구성합니다**
5. 도구와 정책을 가진 **에이전트를 만듭니다**
6. 입력을 주어 **에이전트를 실행합니다**
7. 무슨 일이 있었는지 이해하기 위해 **트레이스를 분석합니다**
8. 디버깅을 위해 **필요하면 리플레이합니다**

## 모범 사례 {#best-practices}

### 도구 {#tools}
- ✅ 엄격한 Zod 스키마를 사용하세요
- ✅ 각 도구를 명확하게 문서화하세요
- ✅ 오류를 적절히 처리하세요
- ✅ 도구가 바뀌면 버전을 올리세요

### 정책 {#policies}
- ✅ 합리적인 예산을 적용하세요
- ✅ 엄격한 허용 목록을 사용하세요
- ✅ 프로덕션 전에 정책을 테스트하세요
- ✅ 정책을 문서화하세요

### 역량 {#capabilities}
- ✅ 도구를 논리적으로 묶으세요
- ✅ 여러 에이전트에서 역량을 재사용하세요
- ✅ 역량을 문서화하세요

### 보안 {#security}
- ✅ **기본 거부(Deny-by-default)**: 선언되지 않은 도구는 실행될 수 없습니다
- ✅ 검증: 모든 입력은 Zod로 검증됩니다
- ✅ 정책: 모든 행동 전에 검사됩니다
- ✅ 추적성: 모든 행동이 추적됩니다

## 예제 {#examples}

### 최소 예제 {#minimal-example}
[`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)를 보세요

### 전체 예제 {#complete-example}
모든 기능은 [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts)를 보세요

## 다음 단계 {#next-steps}

- 📚 [핵심 개념](./concepts) - 아키텍처 이해하기
- 🏗️ [아키텍처](../reference/architecture) - 기술적 세부 사항
- 📖 [SDK API](../reference/sdk-api) - 모든 옵션과 메서드

## 지원 {#support}

- 문서: `docs/`
- 예제: `examples/`
- 이슈: GitHub Issues

## 문제 해결 {#troubleshooting}

### 오류: "Tool not found" {#error-tool-not-found}
→ 에이전트에서 사용하기 전에 `defineTool()`로 도구를 등록했는지 확인하세요.

### 오류: "Policy violation" {#error-policy-violation}
→ 정책(예산, 타임아웃, 허용 목록)을 확인하세요.

### 오류: "Run cancelled" {#error-run-cancelled}
→ 실행이 중지되었습니다. `getTrace()`로 그 이유를 확인하세요.

### 빈 트레이스 {#empty-traces}
→ 이벤트 저장소가 제대로 동작하는지, 이벤트가 영속화되고 있는지 확인하세요.

## 첫 에이전트까지 걸리는 시간 {#time-to-first-agent}

**MVP 목표:** 30분 미만

**예상 시간:**
- 설치: 2분
- 첫 도구: 5분
- 첫 에이전트: 3분
- 첫 실행: 5분
- 트레이스 이해하기: 10분
- **합계: 약 25분** ✅
