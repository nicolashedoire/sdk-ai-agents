# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| 옵션 | 타입 | 설명 |
| --- | --- | --- |
| `apiKey` | `string` | 기본 프로바이더의 키(`llmProvider`를 쓰면 필요 없음). 키가 전혀 없어도 도구와 MCP 서버는 동작하며, 모델이 필요한 호출은 명확한 오류와 함께 실패합니다 |
| `provider` | `'openai' \| 'anthropic'` | 기본 프로바이더, 기본값 `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | 각 벤더의 `apiKey`, `defaultModel`, `baseURL`, `timeout`(`baseURL`: Azure OpenAI의 v1 API나 로컬 모델 서버 같은 호환 엔드포인트 또는 프록시. `timeout`: 밀리초 단위로 답변을 기다리는 최대 시간으로, 기본값은 10분이며, 스트리밍된 답변에서는 그 이벤트 두 개 사이를 기다리는 최대 시간). 기본 프로바이더는 자기 벤더의 항목을, 다른 벤더의 폴백은 그 벤더의 항목을 사용합니다. 기본 모델: `gpt-5.4`와 `claude-opus-5`. OpenAI 항목은 `reasoningModels`, `reasoningEffort`, `nativeToolMessages`, `includeStreamUsage`도 받습니다. [OpenAI 모델](#openai-models) 참고 |
| `fallbackProviders` | `Array<{ provider, config? }>` | 기본 프로바이더가 실패하면 순서대로 시도됩니다. `config`는 `providerConfig`보다 우선합니다. 기본 프로바이더와 같은 벤더의 폴백은 기본 프로바이더의 설정을 물려받지 않으며(전역 `apiKey`만), 다른 벤더의 폴백에는 자체 키가 필요합니다 |
| `llmProvider` | `LLMProvider` | 직접 만든 프로바이더(로컬 모델, 게이트웨이, 테스트 대역). `nativeToolMessages`를 선언하면 도구 호출과 결과를 네이티브 형식(`LLMMessage`)으로, 그렇지 않으면 텍스트로 받습니다. 텍스트를 스트리밍할 수도 있습니다([`LLMProvider`](#llmprovider) 참고) |
| `retry` | `Partial<RetryPolicy> \| false` | LLM 재시도 정책, 프로바이더별로, 폴백 전에. 이 정책의 `maxRetries`와 `initialDelayMs`는 `jev.maxRetries`와 `jev.retryBaseDelayMs`의 기본값이기도 함. 다른 필드는 Jev 클라이언트에 전달되지 않으며, `retry: false`이면 Jev 클라이언트는 자체 재시도 2회와 500 ms를 유지함. 주입한 `llmProvider`에는 명시적으로 설정한 경우에만 적용되며, `llmProvider`로 넘긴 `FallbackProvider`와 그 안의 프로바이더에는 절대 적용되지 않음 |
| `jev` | `JevClientConfig` | 타입 지정 결정을 위해 TypeSafe Jev를 켭니다. 직접 쓰거나, `baseUrl`과 `model: 'typesafe-ai/jev'`로 [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway)를 통해 씁니다 |
| `decisionClient` | `TypedDecisionClient` | 어떤 타입 지정 결정 백엔드든(`jev`보다 우선) |
| `pricing` | `PricingTable` | 토큰 100만 개당 USD, 기본값 위에 병합됩니다 |
| `incidents` | `IncidentMonitorOptions` | 알림기, 규칙, 심각도 임계값, 빈도 제한 |
| `eventStore` | `IEventStore` | 기본값은 `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | 전역 정책 |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | 테스트 산출물의 저장 위치 |

### OpenAI 모델 {#openai-models}

OpenAI의 추론 모델, 즉 o 시리즈(`o1`, `o3`, `o4-mini`…)와 GPT-5 이후 모델(`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…)은 날짜가 붙거나 파인튜닝된 경우(`ft:o4-mini-…`)를 포함해 `max_tokens`를 거부하고, 추론 노력 수준이 `none`이 아니면 `temperature`도 거부합니다. OpenAI 프로바이더는 대소문자와 관계없이 이름으로 이들을 알아보고, `maxTokens`를 `max_completion_tokens`(추론 토큰도 포함해 셉니다)로 보내며 추론 노력 수준도 함께 보냅니다. 기본 노력 수준은 모델마다 다르므로 온도는 절대 보내지 않으며, 이 모델들에서는 에이전트나 엔진의 온도가 무시됩니다. 다른 모델은 모든 OpenAI 호환 서버가 아는 `temperature`와 `max_tokens`를 받습니다.

::: warning 도구와 추론 노력 수준
SDK는 Chat Completions로 OpenAI를 호출하는데, Chat Completions에서 GPT-5.4 이후 모델은 노력 수준이 `none`일 때만 도구를 호출합니다. 기본 모델 `gpt-5.4`는 다른 노력 수준을 정하지 않는 한 `none`을 사용합니다. GPT-5.5, GPT-5.6, GPT-6 Sol과 Luna는 기본값이 `medium`이므로, `reasoningEffort: 'none'`을 정하지 않으면 도구가 있는 에이전트가 이 모델들에서 실패합니다(`Function tools with reasoning_effort are not supported`). GPT-6 Astra는 Chat Completions로는 도구를 전혀 호출할 수 없습니다. SDK는 정한 노력 수준을 그대로 보냅니다.
:::

| 옵션 | 기본값 | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | 모델을 지정하지 않은 요청, 그리고 에이전트의 모델을 지원하지 않는 폴백이 쓰는 모델 |
| `reasoningModels` | 이름으로 판별 | `true` 또는 `false`: 이 프로바이더의 모든 모델이 추론 모델이거나, 모두 아닙니다. 목록: 목록의 이름은 추론 모델이고(Azure 배포, 게이트웨이 별칭), 나머지는 이름으로 판별합니다 |
| `reasoningEffort` | 모델의 기본값 | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` 중 하나이며 추론 모델에만 그대로 보냅니다. 모델마다 이 중 일부 값만 받으며, API는 나머지를 거부합니다 |
| `includeStreamUsage` | OpenAI 자체 API에서 켜짐 | `true`: 스트리밍된 답변에 사용량을 요청하므로(`stream_options`) 그 비용이 집계됩니다. `false`: 요청하지 않습니다. 기본적으로 `https://api.openai.com/v1`과 `https://eu.api.openai.com/v1` 같은 지역 호스트(`baseURL` 또는 `OPENAI_BASE_URL`에서 가져옴)에서 켜집니다. 호환 서버는 이 필드를 거부하거나(그러면 이 필드 없이 요청을 다시 보냅니다) 무시할 수 있고, 사용량이 없는 스트리밍 호출은 측정되지 않은 호출로 집계되기 때문입니다. 사용량을 보고하는 호환 서버(Azure OpenAI v1 API가 그렇습니다)에서 비용 예산을 쓴다면 `true`로 설정하세요 |
| `nativeToolMessages` | `true` | 대화 안의 어시스턴트 `tool_calls`와 `tool` 메시지를 받지 않는 호환 서버에는 `false`: 이전 도구 호출과 결과를 텍스트로 보내며, 도구는 계속 제공되고 응답의 도구 호출도 계속 읽습니다. 기본 프로바이더나 어떤 폴백에서든 `false`이면 체인 전체에 적용됩니다 |

이 옵션들은 `providerConfig.openai`나 OpenAI 폴백의 `config`에 넣습니다. 다른 벤더의 폴백은 자기 `config`가 정하지 않은 옵션을 `providerConfig.openai`에서 가져오고, 기본 프로바이더와 같은 벤더의 폴백은 아무것도 가져오지 않습니다. 에이전트나 실행은 `providerSettings.openai.reasoningEffort`로 자체 노력 수준을 정합니다. 실행의 값이 가장 우선하고, 그다음이 에이전트, 마지막이 프로바이더의 값입니다. 인지 에이전트는 이를 도구 선택에만 적용하며, 도구를 제공하지 않는 사고에는 에이전트의 `reasoningEffort` 옵션을 씁니다.

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

### `LLMProvider` {#llmprovider}

직접 만든 프로바이더는 `generateCompletion(request)`, `supportsModel(model)`, `getProviderName()`을 구현하며, `nativeToolMessages`를 선언할 수 있습니다. 요청의 필드 중 두 개가 스트리밍에 관한 것입니다.

| `LLMRequest` 필드 | |
| --- | --- |
| `onTextDelta?(delta)` | 호출한 쪽이 텍스트를 쓰이는 대로 받고 싶을 때 설정됩니다(`onText`를 준 실행). 텍스트 조각이 도착할 때마다 이 함수를 호출한 다음, 평소처럼 완전한 `LLMResponse`를 반환하세요. 조각을 이어 붙이면 그 `content`가 되어야 합니다. 스트리밍할 수 없는 프로바이더는 이를 무시하며, 그러면 SDK가 `content` 전체를 한 번에 넘깁니다. 이 함수는 오류를 던지면 안 됩니다(SDK 자체의 함수는 절대 던지지 않습니다) |
| `onTextRestart?()` | 이미 텍스트를 스트리밍한 시도 뒤에 다시 시도할 때(직접 구현한 재시도) 호출하세요. 그 텍스트는 무효가 되고, 다음 조각부터 답변이 처음부터 다시 시작됩니다. `RetryingLLMProvider`와 `FallbackProvider`는 자신이 감싼 프로바이더를 위해 이를 호출합니다 |

## 에이전트 {#agents}

| 메서드 | 반환값 | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | 통제형 에이전트: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. 모델이 SDK에 등록된 다른 도구의 이름을 대더라도 자신의 도구(`tools`, `capabilities`)만 실행할 수 있습니다. `signal`은 실행을 취소합니다. `onText`는 모델이 쓰는 텍스트를 쓰이는 대로 받고, `onTextRestart`는 실패한 모델 호출을 다시 시도할 때 지워야 할 부분을 받습니다([답변 스트리밍하기](../guide/governed-agents#_7-streaming-the-answer) 참고) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. 사고는 구조화되어 있으며 스트리밍되지 않습니다 |
| `defineTool(definition)` | `Tool` | 도구를 등록합니다. 핸들러의 타입은 Zod 스키마로부터 정해집니다 |
| `defineCapability(definition)` | `Capability` | 도구를 묶습니다 |
| `listTools()` | `Tool[]` | 등록된 모든 도구 |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | 에이전트 밖에서의 통제된 실행(MCP 서버가 사용): 인자, 정책, 승인, 예산(호출이 시작될 때 계수), 그다음 도구. `signal`은 대기 중인 승인을 취소하고 핸들러에 전달됩니다. `approvalTimeoutMs`는 아무도 결정하지 않은 승인을 취소합니다 |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | `read()`를 자체 실행으로 실행합니다: `run.started`, `resource.read`(URI, 크기, SHA-256), `run.completed` 또는 `run.failed` |
| `stopRun(runId)` | `Promise<void>` | 통제형 실행이나 인지 실행을 중지합니다 |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| 옵션 | 기본값 | |
| --- | --- | --- |
| `name`, `model` | — | 필수 |
| `profile` | `DEFAULT_THINKER_PROFILE` | 에이전트가 추론하는 방식 |
| `tools`, `policies` | `[]` | 다른 곳과 똑같이 통제됩니다. 예산 정책과 타임아웃 정책은 각 단계 전에도 검사됩니다. [한도와 정책](../guide/cognitive-agents#limits-and-policies)을 보세요 |
| `systemPrompt` | — | 모든 프롬프트에 붙는 추가 지시문 |
| `limits` | [인지 에이전트](../guide/cognitive-agents#limits) 참고 | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` 또는 `CognitiveController` |
| `controllerOptions` | — | `minConfidence`(0.35), `readinessThreshold`(0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `compare` 연산을 위한 `'llm'`, `'typed'` 또는 직접 만든 `HypothesisAssessor` |
| `knowledge` | — | 실행 간 기억: `{ store, scope, recallLimit? (10), record? (true) }`, [실행 간 기억](../guide/memory) 참고 |
| `evaluator` | — | 예측을 테스트하는 `OutcomeEvaluator`. `test_prediction`을 켭니다 |
| `generator` | `model` 위의 LLM 생성기 | 직접 만든 `ThoughtGenerator`(관찰 비교 포함). 그 사고도 여전히 엔진의 수용 규칙을 거칩니다 |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | 사고 생성 설정(`reasoningEffort`: OpenAI 추론 모델 전용) |
| `providerSettings` | — | 도구 선택(네이티브 추론 엔진)을 위한 설정, `openai.reasoningEffort` 포함 |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status`는 `completed`, `failed` 또는 `cancelled`이고, `decision.status`는 `committed`, `provisional` 또는 `abstain`이며 `decision.missing`에 확립되지 않은 것이 나열됩니다. `state`는 최종 `MentalState`입니다.

### `OutcomeEvaluator` {#outcomeevaluator}

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

[증거와 검증](../guide/evidence-and-verification)을 보세요.

## 추론과 프로필 {#reasoning-profiles}

| 메서드 | 반환값 |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — 이벤트에서 재구성됩니다 |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## 타입 지정 결정 — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

백엔드가 구성되어 있지 않으면 `ValidationError`를 던집니다.

| 메서드 | 반환값 |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — 답의 타입은 질문으로부터 정해집니다. 백엔드가 토큰 수를 보고하지 않았으면 `usage`가 없습니다 |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

질문 헬퍼: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## 운영 {#operations}

| 메서드 | 반환값 |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | 사람의 승인 |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | 예산과 정책 감사 |

### `RunCostReport` {#runcostreport}

`getRunCost(runId)`가 돌려주는 것: 실행의 모델 호출이며, 실패한 단계도 포함합니다. [API 비용](../guide/costs)을 참고하세요.

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}
```

| 필드 | |
| --- | --- |
| `totalUsd` | 비용을 아는 호출의 비용. `complete`가 `false`이면 하한일 뿐입니다 |
| `complete` | 일부 호출의 비용을 알 수 없을 때, 즉 `unpricedCalls`나 `unmeteredCalls`가 0보다 클 때 `false` |
| `unpricedModels`, `unpricedCalls` | `pricing`에 가격이 없는 모델과, 그중 토큰 수를 보고한 호출 |
| `unmeteredModels`, `unmeteredCalls` | 입력 토큰 수도 출력 토큰 수도 보고하지 않은 호출의 모델과 그 호출 |
| `lines` | 모델과 출처마다 한 줄: 호출 수, 토큰 수를 보고한 호출의 토큰, 있으면 `unmeteredCalls`, 모델에 가격이 있고 그 줄의 호출 중 토큰 수를 보고한 것이 있으면 `costUsd`. 모델 이름을 기록하지 않은 호출의 `model`은 `(unknown)`입니다 |

## 트레이스, 리플레이, 테스트 {#traces-replay-and-testing}

| 메서드 | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | 실행 읽기 |
| `replay(runId, modifications?, { onEvent? })` | LLM 없이 다시 실행 |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | 결정 이해하기 |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | 에이전트를 코드처럼 테스트하기 |

## 실시간 이벤트 {#live-events}

리스너는 `(event: Event) => unknown`입니다. 리스너는 저장소가 받아들인 이벤트를 각 실행의 순서대로, 한 번에 하나씩 받습니다. 리스너가 프로미스를 반환하면 다음 이벤트 전에 그 프로미스를 기다립니다. 실행은 리스너를 절대 기다리지 않으며, 리스너의 오류는 보고될 뿐 실행 안으로 던져지지 않습니다. 리스너를 기다릴 수 있는 이벤트는 최대 `maxQueued`개(기본값 10 000)입니다. 이를 넘으면 새 이벤트는 그 리스너에게 전달되지 않고 버려지며, `LiveEventsDroppedError`로 보고됩니다. [실시간 진행 상황](../guide/observability#live-progress)을 보세요.

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | 실행의 모든 이벤트. `run()`은 리스너가 이벤트 하나하나의 처리를 마친 뒤에 완료되며, 실행이 중지되거나 취소되었을 때 또는 `signal`이 중단될 때는 더 일찍 완료됩니다(그러면 리스너는 구독 해제됩니다). 리스너는 기록되지 않습니다 |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | 인지 실행에 대해 위와 같습니다. 인지 실행에서는 `limits.timeoutMs`도 기다림을 끝냅니다 |
| `replay(runId, modifications?, { onEvent })` | 리플레이에 대해 위와 같습니다. 리플레이는 취소할 수 없으므로 항상 기다립니다 |
| `executeTool(name, params, { onEvent })` | 호출의 이벤트, 그리고 그 도구가 시작하는 실행의 이벤트(한 단계 깊이까지만). 핸들러는 리스너를 `context.onEvent`로 받으며, `governedAgentTool`과 `cognitiveAgentTool`은 이를 자신의 에이전트에 넘깁니다(실시간 이벤트가 없는 저장소 위에 직접 만든 에이전트는 리스너 없이 실행됩니다). `signal`은 기다림을 끝냅니다 |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: 필터에 맞는 모든 실행의 모든 이벤트(`agentId`는 `metadata.agentId`). 반환된 함수를 호출할 때까지 받으며, 그 함수는 아직 전달되지 않은 이벤트를 버립니다 |
| `new ObservedEventStore(store, { onListenerError? })` | 이벤트를 전달하는 계층. SDK는 자기 저장소를 이것으로 감싸거나, 여러분이 `eventStore`로 넘긴 것을 그대로 씁니다. `MonitoredEventStore` 안에 넣은 경우도 마찬가지입니다(그러면 그 인시던트 보고도 전달됩니다). 그 `subscribe(listener, options?)`는 `{ unsubscribe(), close() }`를 반환합니다. `close()`는 리스너가 이미 가져간 이벤트의 처리를 마칠 때까지 기다립니다. `onListenerError`는 리스너의 오류와 버려진 이벤트를 받습니다 |

## 도구: `ToolDefinition` {#tools-tooldefinition}

| 필드 | |
| --- | --- |
| `name`, `description` | 모델이 보는 것 |
| `schema` | 인자의 Zod 스키마. 맞지 않는 호출은 거부됩니다 |
| `handler(params, context?)` | 검증된 인자와 `{ runId, agentId, signal?, onEvent? }`를 받습니다. `signal`은 호출한 쪽이 포기하면 중단되고, `onEvent`는 호출한 쪽이 호출을 실시간으로 지켜볼 때 설정됩니다. 도구가 시작하는 실행의 `onEvent`로 넘기세요 |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — 멱등 도구에만. 잘못된 인자는 절대 재시도하지 않습니다 |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true`를 쓰면 모든 호출이 `approveAction`을 기다립니다. `readOnly`는 MCP 클라이언트에게 `readOnlyHint`로 보입니다 |
| `inputJsonSchema` | `schema`에서 도출된 것 대신 보여 줄 JSON Schema |
| `capability`, `version` | 묶음, 버전 |

## 도구 소스 {#tool-sources}

각 함수는 바로 쓸 수 있는 `ToolDefinition`을 반환합니다. 이를 `sdk.defineTool`에, 에이전트에, 또는 MCP 서버의 `tools`에 바로 넘기세요. [무엇이든 MCP 서버로](../guide/mcp-recipes)를 보세요.

| 함수 | 반환값 | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | OpenAPI 3 기술의 오퍼레이션마다 도구 하나. `include`에 나열하지 않는 한 `GET`만. 그 밖의 메서드는 기본적으로 승인이 필요합니다. 호출은 `{ status, data, truncated? }`를 반환합니다 |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | 한 폴더에 대한 `list_files`, `read_file`, `search_files`로, 절대 그 밖으로 나가지 않습니다. 제외된 폴더는 그 안의 모든 것을 숨깁니다 |
| `folderResources(options)` | `ResourceProvider` | 같은 파일을 MCP 리소스 `folder://<name>/<path>`로 |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query`(읽기 전용 구문 하나, 최대 `maxRows`행, 기본값 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | `node:sqlite` `DatabaseSync` 또는 `better-sqlite3`용. 쿼리를 `PRAGMA query_only = ON`으로 실행합니다 |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | `pg`용(전용 클라이언트 또는 풀). 각 쿼리는 `BEGIN READ ONLY`(이미 트랜잭션 안에 있는 연결에서는 거부) … `ROLLBACK` + `pg_advisory_unlock_all()` 안에서, `SET LOCAL statement_timeout`(기본값 10초)과 함께 실행됩니다. `schemas`는 나열과 기술만 제한합니다 |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`. 호출한 쪽과 함께 취소됩니다. `exposeErrors`가 아니면 `error`는 일반적인 내용입니다 |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | 데이터베이스 어댑터가 쓰는 구문 검사(SQLite와 PostgreSQL 문법만) |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| 함수 | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `tools`가 나열한 것만 정확히 노출하는 MCP `Server`: 정의된 도구의 이름과/또는 `ToolDefinition`(SDK에 대신 정의됩니다. 같은 정의는 다시 넘겨도 되지만, 이미 쓰인 이름을 가진 다른 도구는 거부됩니다). `resources`: 하나 이상의 `ResourceProvider`. 모든 읽기가 추적됩니다. 호출은 `mcp:<name>`(또는 `agentId`)으로 실행됩니다. 아무도 `approvalTimeoutMs`(기본값 50 000 ms) 안에 결정하지 않은 승인은 취소됩니다. 입력 거부는 클라이언트에게 설명되고, 그 밖의 원인은 `exposeErrorDetails`를 쓸 때만 설명됩니다. `progressToken`이 있는 호출은 이벤트마다 `notifications/progress`를 하나씩 받으며, 모두 결과보다 먼저 보내집니다([진행 알림](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | 위와 같지만 stdin/stdout에 연결됩니다. stderr에 "ready" 한 줄을 쓰고, stdin이 끝나면 닫힙니다(진행 중인 호출은 중단되고, 대기 중인 승인은 취소됩니다). `approvalTimeoutMs`의 기본값은 `createMcpServer`와 마찬가지로 50 000입니다 |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — 어떤 MCP 서버든 그 도구를 `ToolDefinition`으로 |

`GovernedToolHost`는 서버가 SDK에 요구하는 것(`listTools`, `defineTool`, `executeTool`, `traceResourceRead`)입니다. `createSDK()`는 이를 구현하는 객체를 반환합니다.

## 구성 요소 {#building-blocks}

SDK의 구성 요소는 커스텀 설정을 위해 export되어 있습니다: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, 그리고 이들의 주요 타입.
