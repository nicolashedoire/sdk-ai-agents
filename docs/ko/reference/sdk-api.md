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
| `includeStreamUsage` | OpenAI 자체 API에서 켜짐 | `true`: 스트리밍된 답변에 사용량을 요청하므로(`stream_options`) 그 비용이 집계됩니다. `false`: 요청하지 않습니다. 기본적으로 `https://api.openai.com/v1`과 `https://eu.api.openai.com/v1` 같은 지역 호스트(`baseURL` 또는 `OPENAI_BASE_URL`에서 가져옴)에서 켜집니다. 호환 서버는 이 필드를 거부하거나(그러면 이 필드 없이 요청을 다시 보냅니다. 단 이 필드를 받는 OpenAI 자체 API에는 다시 보내지 않습니다) 무시할 수 있고, 사용량이 없는 스트리밍 호출은 측정되지 않은 호출로 집계되기 때문입니다. 사용량을 보고하는 호환 서버(Azure OpenAI v1 API가 그렇습니다)에서 비용 예산을 쓴다면 `true`로 설정하세요 |
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
| `createAgent(config)` | `AgentImpl` | 통제형 에이전트: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. 모델이 SDK에 등록된 다른 도구의 이름을 대더라도 자신의 도구(`tools`, `capabilities`)만 실행할 수 있습니다. `signal`은 실행을 취소합니다. `onText`는 모델이 쓰는 텍스트를 쓰이는 대로 받고, `onTextRestart`는 실패한 모델 호출을 다시 시도할 때 지워야 할 부분을 받습니다([답변 스트리밍하기](../guide/governed-agents#_7-streaming-the-answer) 참고) |
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

## 연구 {#studies}

연구는 연구자입니다. 대상을 이해한 다음, 오늘날의 지식과 기술로 그것을 어떻게 다시 설계할지 제안하고, 결정을 내려 줄 실험을 설계합니다. [연구](../guide/studies)를 보세요.

| 메서드 | 반환값 | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | 설정을 검사하고, 소스를 해석하고, 헌장을 고정합니다. 잘못된 설정이나, 정의된 도구가 아니거나 텍스트 쿼리를 받지 않는 소스에는 `ValidationError`를 던집니다 |

### `StudyConfig` {#studyconfig}

| 옵션 | 기본값 | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | 필수이며 비어 있으면 안 됩니다. `name`은 연구의 이벤트와 함께 기록됩니다(`metadata.studyName`). 목표는 절대 바뀌지 않습니다. 새로운 목표는 새로운 연구입니다 |
| `question` | `language`로 쓴 방법의 길잡이 질문과 역량 지향점 | 길잡이 질문 |
| `needs`, `leads`, `analogues` | `[]` | 오늘날의 필요 사항과 기준, 여러분의 단서(검증할 예시로, 각각 판정을 받음), 해체할 결합에 의한 혁신(`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | 범위 밖인 것 |
| `capability` | — | 겨냥하는 새로운 역량. 없으면 연구가 후보를 제안합니다 |
| `sources` | `[]` | 연구가 검색에 쓰는 SDK 도구의 이름으로, 연구보다 먼저 정의되어 있어야 합니다(예: `connectMcpServer`의 도구). 소스가 없으면 아무것도 확립될 수 없습니다 |
| `model` | 프로바이더의 기본값 | 모든 호출의 모델 |
| `llmProvider` | SDK의 프로바이더 | 이 연구에 쓸 프로바이더 |
| `language` | `'en'` | 텍스트와 자료집의 언어로, 언어 태그(`fr`, `pt-BR`…)로 지정합니다 |
| `limits` | [`StudyLimits`](#studylimits) 참고 | 생략한 한도는 기본값을 유지합니다 |
| `driftThreshold` | `1/3`(`DEFAULT_DRIFT_THRESHOLD`) | 과정이 한 번 다시 수행되기 전까지 거부될 수 있는, 과정 항목의 비율로 0부터 1까지입니다 |
| `temperature`, `maxTokens` | `0.4`, — | 과정과 검색 요청에 적용됩니다. 감시자, 개정안, 선행 기술 검사는 0으로 실행됩니다 |

헌장(`StudyCharter`)은 `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability`, `analogues`를 담으며, (대소문자를 무시하고) 반복된 목록 항목은 제거됩니다. 헌장은 고정되고 해시되며, `name`은 헌장에 포함되지 않습니다.

### `StudyLimits` {#studylimits}

실행마다 적용됩니다. `DEFAULT_STUDY_LIMITS`에 기본값이 들어 있으며, 범위를 벗어난 값은 `ValidationError`를 던집니다.

| 한도 | 기본값 | 범위 | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1부터 10 000까지 | 수정과 검사를 포함한 모델 호출. 도달하면 실행이 멈춥니다(`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | 0부터 10 000까지 | 검색. 다 쓰면 실행이 검색 없이 계속됩니다(주의 사항 `searchesSkipped`) |
| `maxLoops` | 1 | 0부터 10까지 | 실행이 다시 열 수 있는 앞선 과정의 수 |
| `timeoutMs` | 1 200 000(20분) | 1부터 2 147 483 647까지 | 실행의 길이. 도달하면 실행이 중단됩니다(`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | 1부터 50까지 | 검색 한 번에서 보관하는 결과 수 |

### `Study` {#study}

| 멤버 | |
| --- | --- |
| `id` | `study_…`, 연구마다 새로 생깁니다. 연구 이벤트의 `metadata.agentId`이자, 예산, 정책, 도구 호출의 에이전트 id입니다 |
| `name`, `language`, `charter`, `charterHash` | 이름, 언어, 고정된 `StudyCharter`, 그리고 그 SHA-256(16진수)으로, `study.started`와 각 개정안에 기록됩니다 |
| `amendments` | `StudyAmendment[]`: 수락된 것과 거부된 것, 순서대로 |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. 마지막 실행이 멈춘 곳에서 재개합니다. 먼저 감시자가 그 실행이 판단하지 않고 남긴 것을 판단하고, 판단은 되었지만 끝나지 않은 과정은 마무리만 하며, 그다음 완료되지 않은 과정들이 실행됩니다. `restart`는 연구를 처음부터 다시 시작합니다. 과정, 결과, 검색, 이탈 기록, 번호 매기기, 실행이 지워지고, 헌장과 개정안은 남습니다. 한도, 정책, 취소, 오류는 실행을 그 상태와 함께, 한 일의 보고서와 함께 끝냅니다. 예외를 던지는 경우는 이미 진행 중인 실행, 처리할 수 없는 `onEvent`, 실패하는 이벤트 저장소뿐입니다. `onEvent`는 `agent.run`에서와 똑같이 동작합니다 |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. 오직 헌장에만 비추어 분류되며, 앞선 개정안에 비추어 분류되는 일은 절대 없습니다(서로 모순되는 두 개정안이 둘 다 수락될 수 있습니다). 요청된 순서대로 하나씩, 자체 실행(`mode: 'study-amendment'`)에서 분류되며, 그 실행에서는 예산 정책이 먼저 검사됩니다. `refines`만 수락되며, 이후의 모든 프롬프트에 표시됩니다. `timeoutMs`(기본값 60 000, 차례가 왔을 때부터 셈)와 `signal`이 분류에 한도를 둡니다. 그 한도를 넘거나 정책이 분류를 거부하면, 개정안은 `unclassified`로 거부됩니다. 빈 텍스트, `MAX_AMENDMENT_LENGTH`(500자)보다 긴 텍스트, 또는 차례가 왔을 때 이미 `MAX_AMENDMENTS`(10)개의 개정안이 수락된 경우에는 `ValidationError`를 던집니다 |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. 카드의 10번과 11번 필드를 채우고, 그 카드를 작성한 실행에 `study.result_recorded`를 기록합니다. 알 수 없는 카드나 빈 `result`에는 `ValidationError` |
| `report()` | `StudyReport`: 현재 상태의 보고서로, 마지막 실행 이후에 기록된 결과를 포함합니다 |

연구는 `sdk.createStudy`로 만듭니다. `Study` 클래스는 그 타입을 위해 export되어 있으며, 연구를 구성하는 데 쓰이는 것은 내부 구현입니다. `MAX_AMENDMENTS`와 `MAX_AMENDMENT_LENGTH`도 export되어 있고, `amend`의 옵션 타입인 `StudyAmendOptions`도 마찬가지입니다.

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status`는 `completed`이거나, 한도 또는 예산·타임아웃 정책이 실행을 끝냈을 때 `stoppedBy`(`maxModelCalls`, `timeoutMs` 또는 `policy`)와 함께 `stopped`, 오류가 실행을 끝냈을 때 `failed`, 또는 `cancelled`입니다. `error`는 실행을 끝낸 `Error`, `report`는 실행이 끝났을 때의 `StudyReport`, `markdown`은 같은 내용을 담은 자료집입니다.

### `StudyReport` {#studyreport}

```ts
interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  amendments: StudyAmendment[];
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];                       // { code, message, details? }
  passages: StudyPassageState[];                // { passage, state, attempts, reopenedBy, runId? }
  observations: StudyObservation[];             // O1…
  pieces: StudyPiece[];                         // P1…
  chain: StudyChainStage[];                     // C1…
  threeStates: StudyPieceStates[];              // { piece, atItsTime, currentBest, proposal }
  historicalChoices: StudyHistoricalChoice[];   // H1…
  advances: StudyAdvance[];                     // V1…
  leadVerdicts: StudyLeadVerdict[];             // L1…
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];     // I1…
  references: StudyReference[];                 // R1…
  analogues: StudyAnalogue[];                   // B1…
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];               // K1…
  revisableDecisions: StudyRevisableDecision[]; // D1…
  combinations: StudyCombination[];             // X1…
  capabilities: StudyCapability[];              // Y1…
  architectures: StudyArchitecture[];           // A1…: new capabilities, existing ones, improvements
  noveltyClaims: StudyNoveltyClaim[];           // N1…
  experiments: StudyExperiment[];               // E1…
  cards: MechanismCard[];                       // M1…
  results: StudySearchResult[];                 // S1…
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  runIds: string[];                             // runs of run() since the last restart, oldest first
}

interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  status: 'established' | 'hypothesis' | 'novelty'; // after the study's checks
  declaredStatus?: StudyClaimStatus;                // the model's, when the study changed it
  statusReason?: StudyReason;
  sources: string[];                                // results listed in the prompt that wrote it
  unlistedSources?: string[];                       // cited, not listed in that prompt: they support nothing
  servesObjective: string;
  toVerify?: boolean;                               // prior art not assessed: a novelty, or a capability's assembly
  priorArtReason?: StudyReason;                     // a capability that is not a novelty: why not checked, or assemblyExists
  priorArt?: { closest: string; sources: string[]; verdict: 'novel' | 'partlyNovel' | 'exists' };
  unchecked?: boolean;                              // not judged by the guardian: kept out of later prompts
  runId: string;
}

interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  message: string;                                  // the same reason, in English
}

interface StudyTrace {
  from: string[];                                   // records of the investigation it comes from
  unknownFrom?: string[];                           // cited, not listed in the design's prompt
  untraced?: boolean;                               // it cites none of the listed records
}
```

보고서의 모든 이유는 `StudyReason`입니다. 주장과 구성 요소의 `statusReason`, 신규 주장이 아닌 역량의 `priorArtReason`, 이탈 항목과 개정안의 `reason`, 그리고 격하된 아키텍처의 `kindReason`입니다. 자료집은 그 `code`를 연구의 언어로 표시합니다(`studyLabels(language).reasons`). 감시자나 모델이 쓴 텍스트는 코드가 `judged`이며, 텍스트는 `params.text`에 있습니다. 코드(`StudyReasonCode`)는 다음과 같습니다.

| 코드 | 이유 |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | `hypothesis`로 낮춰진 `established` 주장이나 구성 요소. 소스가 없거나, 그 프롬프트에 나열된 id가 하나도 없음 |
| `priorArtNotSearchedYet`, `priorArtNoSource`, `priorArtSearchBudget`, `priorArtNotSearched`, `priorArtSearchFailed`, `priorArtNoResult`, `priorArtNotAssessed`, `priorArtUnsupported` | 신규 주장의 선행 기술, 또는 역량의 결합의 선행 기술이 아직 검증 대상인 이유(그 영어 텍스트는 "To verify against prior art:"로 시작함) |
| `priorArtExists` | `hypothesis`로 낮춰진 신규 주장. 가장 가까운 작업이 이미 그것을 실현함 |
| `assemblyExists` | 결합이 이미 존재하는, 신규 주장이 아닌 역량(그 `priorArtReason`에 기록됨) |
| `componentDocumented`, `componentUndocumented` | 새것으로 제시된 구성 요소 |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead` | 스키마가 거부한 항목 |
| `leadAlreadyJudged` | 이미 판정된 단서에 다시 내려진 판정. 버려지며, 이탈이 아님(`study.passage_completed`의 `duplicates`) |
| `designWithoutCapability` | 새로운 역량이 하나도 없는 설계 |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | 분류할 수 없었던 개정안 |
| `judged` | 감시자나 모델 자신의 말 |

모든 항목은 고유 필드를 가진 `StudyClaim`입니다.

| 타입 | 고유 필드 |
| --- | --- |
| `StudyObservation` | `kind`(`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?`(이 부품이 세분하는 부품) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors`(`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain`(`object` 또는 `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead`(헌장에 적힌 그대로), `verdict`(`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind`(`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?`(이 항목이 해체하는 헌장 속 혁신의 번호), `domain?`, `date?`, `components`(두 개 이상의 `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state`(`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because`(바뀐 조건), `opens` |
| `StudyCombination` | `a`, `b`, `enables`(A가 B에게 가능하게 하는 것), `exchange`, `cost`, `changes`(`representation`, `distribution`, `responsibilities`, `trust`, `verification`, `other`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind`(`capability` 또는 `improvement`), `declaredKind?`와 `kindReason?`(감시자가 단지 더 빠르거나 더 싸다고 판단한 역량), `capability`(`what`, `forWhom`, `liftedConstraint`), `principleChange?`(`principle`: `representation`, `distribution`, `responsibility`, `trust`, `verification` 또는 `other`. 그리고 `change`), `mechanism`, `components`(`StudyComponent[]`: `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?`, 그리고 `StudyTrace`), `assembly`(`component`, `gives`, `exchanges`, `cost`, 그리고 `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain`(`stage`, `how`), `uncoveredStages`(연구가 검사한 결과, 이 아키텍처가 다루지 않는 전체 사슬의 단계), `predictions` |
| `StudyThreeState` | `piece`, `state`(`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected`(`architecture`, `result`), `wholeChain` |
| `MechanismCard` | 1번부터 9번 필드: `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment`. 여러분이 기록한 뒤에는 10번과 11번 필드: `resultAndError?`(`result`, `error?`), `conclusionAndMemory?`, 그리고 `resultRecordedAt?` |

보고서의 다른 항목은 주장이 아닙니다.

| 타입 | 필드 |
| --- | --- |
| `StudyAmendment` | `number?`(수락된 경우만, 1부터), `text`, `verdict`(`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason`(`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item`(`id?`, `statement?`, `servesObjective?`), `reason`(`StudyReason`), `by`(`guardian`: 목표를 벗어남. `schema`: 그 전에 거부됨, 예를 들어 `servesObjective`가 없음), `attempt`(재수행에서는 2), `runId` |
| `StudySearchResult` | `id`(`S1`…, 같은 결과를 다시 찾으면 다시 시작하기 전까지 유지됨), `title`, `locator`(URL 또는 다른 위치 정보), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose`(`research` 또는 `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `skipped?`(`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state`(`complete`. `partial`: 판단은 되었지만 끝나지 않음, 즉 루프를 기다리고 있거나 선행 기술 검색이 중간에 끊김. `unchecked`: 감시자가 판단하지 않은 항목. `notRun`), `attempts`(재수행 뒤에는 2), `keptAttempt?`와 `discarded?`(`attempt`, `items`: 더 나은 첫 시도 때문에 버려진 재수행), `reopenedBy`, `runId?` |
| `StudyNotice` | `code`(`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `passagesOutdated`, `capabilitiesToVerify`, `capabilitiesExist`, `noveltiesToVerify`), `params?`(`limit`, `error`, `count`), `details?`(해당하는 과정, `passage.collection` 쌍, 단서, 혁신 또는 아키텍처), `message`(영어. 자료집은 코드를 자신의 언어로 표시함) |
| `StudyStats` | 마지막으로 다시 시작한 이후: `runs`와 `modelCalls`(`run()`의 실행, 그리고 그 안에서 벤더가 응답한 호출), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus`(상태별), `downgraded`(연구가 상태를 낮춘 주장), `noveltiesToVerify`, `redos`, `loops`. 그리고 `amendments`(`count`, `modelCalls`): 연구의 모든 개정안을 따로 센 값 |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

보고서를 보고서의 언어로 된, 읽기 쉬운 Markdown 자료집으로 반환합니다. `StudyResult`의 `markdown`과 같습니다. 그 뒤에 기록된 결과를 포함하려면 `study.report()`에 대해 호출하세요. 그 문구는 `studyLabels(language)`(`StudyLabels`)에서 오며, 이 문서의 열한 개 언어로 준비되어 있습니다(`StudyLabelLanguage`). 그 밖의 언어나 알 수 없는 언어는 영어 문구를 받고, `fr-CA`는 프랑스어 문구를 받습니다.

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
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| 필드 | |
| --- | --- |
| `totalUsd` | 비용을 아는 호출의 비용. `complete`가 `false`이면 하한일 뿐입니다 |
| `complete` | 일부 호출의 비용을 알 수 없을 때, 즉 `unpricedCalls`나 `unmeteredCalls`가 0보다 클 때 `false` |
| `unpricedModels`, `unpricedCalls` | `pricing`에 가격이 없는 모델과, 그중 토큰 수를 보고한 호출 |
| `unmeteredModels`, `unmeteredCalls` | 입력 토큰 수와 출력 토큰 수를 모두 보고하지는 않은 호출의 모델과 그 호출 |
| `lines` | 모델, 요청한 모델, 출처마다 한 줄: 호출 수, 계량된 호출의 토큰, 있으면 `unmeteredCalls`, 그 호출들의 토큰인 `unmeteredTokens`, 모델에 가격이 있고 그 줄의 호출 중 계량된 것이 있으면 `costUsd`. 모델 이름을 기록하지 않은 호출의 `model`은 `(unknown)`입니다 |

## 트레이스, 리플레이, 테스트 {#traces-replay-and-testing}

| 메서드 | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | 실행 읽기 |
| `replay(runId, modifications?, { onEvent? })` | LLM 없이 다시 실행 |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | 결정 이해하기 |

### 골든 트레이스 {#golden-traces}

| 메서드 | 반환값 | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | 실행을 기준으로 보관합니다. 그 실행을 한 통제형 에이전트의 이름(`agentName`)도 함께 기록합니다 |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: 에이전트의 id 또는 이름 |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` 또는 `partial`. 차이마다 종류(`event_added`, `event_removed`, `event_modified`, `event_order_changed`)와 위치가 붙습니다 |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | 같은 차이를 심각도와 영향이 붙은 회귀로 돌려줍니다: `no_regression` 또는 `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | 실행을 리플레이한 뒤 그 리플레이를 검증합니다. 리플레이는 모델을 호출하지 않으므로 `validateAspects: ['tools', 'policies']`로 비교하세요 |

실행은 **이벤트가 뜻하는 바로** 비교되며, 이벤트 id로는 절대 비교되지 않습니다(실행마다 id가 새로 생깁니다). 이벤트는 순서대로 짝지어집니다. 먼저 똑같은 이벤트, 그다음 종류와 대상(도구, 작업, 연구의 과정, 답변)이 같지만 데이터가 바뀐 이벤트, 마지막으로 대상은 같지만 종류가 바뀐 이벤트입니다. 비교하지 않는 것: 이벤트 id, 시각, 메타데이터, `incident.reported` 이벤트(알림 전송과 발송 제한을 기록합니다. 인시던트를 일으킨 이벤트는 비교됩니다), 그리고 SDK가 기록하며 실행마다 바뀌는 값인 도구 호출의 소요 시간, 토큰 사용량, 재시도 전 대기 시간, 승인 id, 리플레이의 원본 실행, 관찰의 시각과 원본 이벤트. 모델이 도구 호출 옆에 쓰는 텍스트는 `intention.generated`에서만 비교됩니다. 도구의 매개변수, 결과, 입력은 키 이름과 상관없이 항상 비교됩니다. 30에서 60으로 바뀐 `duration` 인수는 변경입니다. 같은 일을 다시 하는 실행은 통과하고, 다른 인수로 호출된 도구는 호출이 일어난 자리에서 보고됩니다(`parameters.metric: "churn" → "revenue"`). 똑같은 호출 앞에 끼워 넣은 호출은 추가된 호출 하나입니다. `action.executed`가 `action.failed`로 바뀐 것은 사라짐과 추가가 아니라 하나의 변경입니다.

| 옵션 | 대상 | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects`(`intentions`, `actions`, `tools`, `policies`) | 검증 | 비교할 이벤트를 줄입니다 |
| `tolerance.dataFields` | 검증 | 어느 깊이에서든 비교에서 뺄 데이터 필드를 더합니다 |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | 검증 | 시점은 `timestampMs`가 있을 때만, 각 실행의 시작을 기준으로 비교합니다 |
| `compareStructureOnly` | 검증 | 데이터 차이는 `fail`이 아니라 `partial`이 됩니다. 추가, 제거, 이동되었거나 종류가 바뀐 이벤트는 여전히 실패입니다 |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | 회귀 | 비교할 이벤트를 줄이고 데이터 필드를 뺍니다 |
| `tolerance.criticalEventTypes` | 회귀 | 나타나거나 사라지거나 바뀌면 치명적인 종류(기본값: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | 회귀 | 추가되거나 제거된 처리 이벤트(정책 검사, 재시도, 승인)는 이 수까지 허용합니다. 결과의 변경은 절대 허용하지 않습니다 |
| `tolerance.maxDurationDiff`, `severityThresholds` | 회귀 | 소요 시간은 둘 중 하나가 있을 때만 검사합니다. `maxDurationDiff` ms보다 더 느려진 실행은 회귀이며, 도달한 가장 높은 임계값의 심각도가 붙습니다. 더 빨라진 실행은 절대 회귀가 아닙니다 |

### 회귀 테스트 스위트 {#regression-suites}

| 메서드 | 반환값 | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | `regressionTestSuitesDir`에 저장됩니다. `agent`: 이 SDK에 있는 에이전트의 id 또는 이름. 각 골든 트레이스는 존재해야 하며, `input`의 기본값은 기준 실행이 받은 입력입니다. 스위트는 입력의 `signal`과 콜백(`onEvent`, `onText`, `onTextRestart`)을 저장하지 않습니다 |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | 최신순 |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | 에이전트의 모든 스위트를 오래된 것부터 실행합니다. 각 테스트는 입력을 에이전트에 보내고 그 실행을 골든 트레이스와 비교합니다. `suites`에는 스위트마다 결과가 하나씩 있습니다 |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | 스위트 하나만 |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0은 모든 테스트 통과, 1은 회귀를 찾은 테스트가 있음, 2는 실행할 수 없었던 테스트가 있음(오류 또는 시간 초과). 옵션에 `exitCode: false`를 주면 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML: 스위트마다 `<testsuite>` 하나. 실행할 수 없었던 테스트(오류 또는 시간 초과)는 `<error>`가 되고, XML에 담을 수 없는 문자는 제거됩니다 |

에이전트 id는 프로세스마다 새로 생기므로, 스위트는 에이전트의 **이름**도 기록하고, 다른 프로세스는 그 이름의 에이전트로 스위트를 실행합니다(스위트의 에이전트 id가 SDK에 있으면 그것을 먼저 씁니다). 한 SDK 안에서 에이전트의 id는 그 에이전트만의 것입니다. 이름이 같은 두 에이전트(예를 들어 두 버전)는 각자 자신의 스위트, 단언, 골든 트레이스를 가지며, 이름은 그 모두를 가리킵니다. `createAgent`로 만든 에이전트는 모두 SDK에 남으므로, 요청마다 에이전트를 만드는 애플리케이션에서는 이름이 모호해집니다. id를 넘기거나, 각 에이전트를 한 번만 만들어 재사용하세요. 이전 버전이 저장한 스위트에는 이름이 없어서, 그것을 만든 프로세스에서만 실행됩니다. 옵션: `parallel`(한 스위트의 테스트를 동시에), `stopOnFirstFailure`(순차 실행일 때만. 통과하지 못한 첫 테스트 뒤로는 다음 스위트까지 포함해 아무것도 실행하지 않음), `filterTags`, `excludeTags`, `timeout`(테스트마다 ms, 기본값 60 000, 최대 2 147 483 647. 넘으면 실행이 취소되고 테스트는 `timeout`), `detection`(위의 회귀 옵션).

### 단언 {#assertions}

| 메서드 | 반환값 | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | 모든 실행 또는 한 에이전트의 실행에 적용됩니다. `agentId`로 지정한 이 SDK의 에이전트는 이름도 기록됩니다. 평가할 수 없는 조건은 `ValidationError`로 거부됩니다 |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | 최신순 |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | 지정한 단언(알 수 없는 id는 오류), 아니면 모든 실행에 대한 단언과 그 실행의 에이전트에 대한 단언 |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | 필요한 것 | 통과 조건 |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` 또는 `eventTypes` | 종류 중 하나가 나타남 / 하나도 나타나지 않음 |
| `event_count` | `eventType` 또는 `eventTypes`, 그리고 `count`, 또는 `minCount`와 `maxCount` | 그런 이벤트의 수가 맞음 |
| `event_order` | `beforeEventType`, `afterEventType` | 한쪽의 첫 이벤트가 다른 쪽의 첫 이벤트보다 앞섬 |
| `event_value` | `eventType`, `valuePath`, `valueMatcher`(`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | 그 종류의 모든 이벤트가 일치함 |
| `custom` | `customEvaluator(events) => boolean` | 함수가 `true`를 반환함 |

`custom` 단언은 함수를 담고 있는데, 함수는 파일에 쓸 수 없습니다. 그래서 **저장되지 않고**, 그것을 정의한 SDK 인스턴스가 살아 있는 동안만 유지되므로 시작할 때 다시 정의하세요. 다른 종류는 `assertionsDir`에 저장됩니다.

### 비교와 영향 {#comparisons-and-impact}

| 메서드 | 반환값 | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | 위와 같이 뜻으로 맞춘 차이: `event_added`, `event_removed`, `event_modified`(종류가 바뀜), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | 변경 전후의 평균: `duration`(ms), `cost`(가격이 있는 모델 호출의 USD, `getRunCost`와 같음), `quality`(실패한 액션이 아닌 이벤트의 비율), `success_rate`, 그리고 동작 변화. `impactAnalysesDir`에 저장됩니다 |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | 통제형 에이전트(이름, 또는 이 SDK에 있는 에이전트의 id)의 실행 중 각 버전(`version` 또는 `configHash`)으로 기록된 실행에 대한 `analyzeImpact`. 그 이름의 에이전트는 모두 포함됩니다. 리플레이는 제외됩니다. 두 버전은 서로 달라야 하고 서로 다른 실행을 골라야 합니다. 알 수 없는 버전은 기록된 버전 목록과 함께 오류를 던집니다 |

통제형 에이전트 실행의 생명 주기 이벤트(`run.started`, `run.completed` 등)는 에이전트의 `agentName`, `agentVersion`, `configHash`를 기록합니다. 이름이 같은 두 에이전트는 두 버전, 또는 두 프로세스에 있는 하나의 에이전트입니다. 해시는 모델, 시스템 프롬프트, `maxSteps`와 `timeout`, 프로바이더 설정, `version`, 기능(capability), 도구(이름, 설명, 버전, 매개변수 스키마, 메타데이터, 재시도 설정), 그리고 에이전트 자신의 정책과 그 규칙을 포함합니다. `setPolicy`와 `addTools`로 바뀌며, 각 실행은 시작할 때의 해시를 기록합니다. 이전 버전이 기록한 실행에는 id와 버전만 있습니다.

### 모든 실행에 걸친 쿼리 {#queries-across-runs}

| 메서드 | 반환값 |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: 일치하는 이벤트(시간순, 최대 `limit`개), 범위 안의 이벤트 수, 일치하는 이벤트 수 |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

필터에는 **범위**(`runId`, 없으면 모든 실행, 그리고 `since`, `until`)와 **조건**(`type`, `agentId`, `userId`, `sessionId`, `dataFilters`(`{ path, operator, value?, regex? }`), `metadataFilters`(`{ field, operator, value? }`))이 있습니다. 조건은 `logic`(기본값 `and`, `or`는 적어도 하나)으로 결합된 뒤 `not`으로 부정됩니다. 범위는 절대 부정되지 않습니다. 기본 제공 저장소는 모두 답합니다. 파일 저장소는 쿼리마다 각 실행 파일을 한 번만 읽고, SQL 저장소는 데이터베이스에 질의합니다. 모든 조건이 성립해야 할 때는 데이터베이스가 직접 종류와 id로 이벤트를 걸러 냅니다. `or`나 `not`을 쓰면 저장소가 범위 안의 모든 이벤트를 돌려주고 조건은 메모리에서 검사되므로, 큰 데이터베이스에서는 비용이 더 듭니다. 같은 밀리초의 이벤트는 실행 안의 순서를 유지합니다. 실행은 id 순으로, 각 실행 안에서는 기록된 순서대로 정렬됩니다.

## 실시간 이벤트 {#live-events}

리스너는 `(event: Event) => unknown`입니다. 리스너는 저장소가 받아들인 이벤트를 각 실행의 순서대로, 한 번에 하나씩 받습니다. 리스너가 프로미스를 반환하면 다음 이벤트 전에 그 프로미스를 기다립니다. 실행은 리스너를 절대 기다리지 않으며, 리스너의 오류는 보고될 뿐 실행 안으로 던져지지 않습니다. 리스너를 기다릴 수 있는 이벤트는 최대 `maxQueued`개(기본값 10 000)입니다. 이를 넘으면 새 이벤트는 그 리스너에게 전달되지 않고 버려지며, `LiveEventsDroppedError`로 보고됩니다. [실시간 진행 상황](../guide/observability#live-progress)을 보세요.

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | 실행의 모든 이벤트. `run()`은 리스너가 이벤트 하나하나의 처리를 마친 뒤에 완료되며, 실행이 중지되거나 취소되었을 때 또는 `signal`이 중단될 때는 더 일찍 완료됩니다(그러면 리스너는 구독 해제됩니다). 리스너는 기록되지 않습니다 |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | 인지 실행에 대해 위와 같습니다. 인지 실행에서는 `limits.timeoutMs`도 기다림을 끝냅니다 |
| `StudyRunOptions.onEvent`: `study.run({ onEvent })` | 연구의 실행에 대해 위와 같습니다. 연구의 실행에서는 `limits.timeoutMs`도 기다림을 끝냅니다 |
| `replay(runId, modifications?, { onEvent })` | 리플레이에 대해 위와 같습니다. 리플레이는 취소할 수 없으므로 항상 기다립니다 |
| `executeTool(name, params, { onEvent })` | 호출의 이벤트, 그리고 그 도구가 시작하는 실행의 이벤트(한 단계 깊이까지만). 핸들러는 리스너를 `context.onEvent`로 받으며, `governedAgentTool`과 `cognitiveAgentTool`은 이를 자신의 에이전트에 넘깁니다(실시간 이벤트가 없는 저장소 위에 직접 만든 에이전트는 리스너 없이 실행됩니다). `signal`은 기다림을 끝냅니다 |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: 필터에 맞는 모든 실행의 모든 이벤트(`agentId`는 `metadata.agentId`). 반환된 함수를 호출할 때까지 받으며, 그 함수는 아직 전달되지 않은 이벤트를 버립니다. 회귀 테스트 스위트의 실행과 리플레이도 실제 실행이므로 리스너는 그 이벤트도 받습니다(스위트는 입력의 `onEvent`와 `onText`를 저장하지 않습니다) |
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
| `webTools({ include?, prefix?, search?, circuitBreaker?, language?, userAgent?, timeoutMs?, callTimeoutMs?, maxResponseBytes?, maxRedirects?, hostIntervalMs?, robots?, allowPrivateNetwork?, lookup?, maxPdfBytes?, maxPdfPages?, cache?, retry?, arxiv?, wikipedia?, github? })` | `ToolDefinition[]` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search`, 읽기 전용(`web_fetch`는 중간 위험, 나머지는 낮은 위험). 검색 결과는 `{ id, title, url, date?, excerpt, source }`, 페이지는 `{ url, finalUrl, title?, date?, language?, contentType, content, truncated, untrusted: true, hint? }`. `allowPrivateNetwork`가 아니면 공개 인터넷 밖의 주소는 쓰지 않으며, robots.txt를 지키고, 호출마다 `callTimeoutMs`(60초) 안에 끝납니다. [웹 조사](../guide/web-research)를 보세요 |
| `duckDuckGo({ region?, minIntervalMs?, baseUrl? })` | `SearchProvider` | 키가 필요 없는 `web_search`의 기본 프로바이더. DuckDuckGo의 HTML 페이지를 쓰며, 검색 사이에 1.5초를 둡니다 |
| `searxng({ baseUrl, engines?, categories?, minIntervalMs? })` | `SearchProvider` | SearXNG 인스턴스의 JSON API. 결과 이름은 `searxng:<engine>`이고, 날짜는 `publishedDate`에서 가져옵니다 |
| `brave({ apiKey, baseUrl?, minIntervalMs? })`, `tavily(…)`, `serper(…)` | `SearchProvider` | Brave Search, Tavily, Serper API로, 각자의 키가 필요합니다 |
| `citableUrl(url)`, `normalizeUrl(url)` | `string \| undefined` | 검색 결과를 인용할 때 쓰는 URL(추적 매개변수와 프래그먼트 제거)과, id와 중복 판정에서 검색 결과를 식별하는 URL(여기에 더해 호스트는 소문자, 끝의 슬래시 없음). http(s)가 아니면 `undefined` |
| `isPublicAddress(address)` | `boolean` | IP 주소가 공개 인터넷에 있는지 여부(`allowPrivateNetwork` 뒤에 있는 검사) |

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

`web_search`는 프로바이더들에게 순서대로 묻습니다. 예외를 던진 프로바이더는 다음 프로바이더에게 차례를 넘기고, `SearchThrottledError`를 던진(또는 세 번 연속 실패한) 프로바이더는 `circuitBreaker.cooldownMs`(2분) 동안 건너뜁니다. 웹 도구는 일부러 거부한 것에 대해 `WebRequestRefusedError`(`reason`: `private-address`, `scheme`, `downgrade`, `redirects`, `robots`, `content-type`, `too-large`, `pacing`)를, 2xx가 아닌 응답에 대해 `WebHttpError`(`status`)를, 요청이나 호출의 마감 시간 또는 추출의 시간 예산을 넘으면 `WebTimeoutError`를, 설정이 빠졌을 때(`unpdf`, GitHub 토큰) `WebConfigurationError`를, 어느 프로바이더도 답하지 않았을 때 `SearchUnavailableError`(`failures`)를 던집니다. `retry`는 거부, 빠진 설정, 어느 프로바이더도 답하지 않은 검색을 절대 재시도하지 않습니다.

```ts
interface SearchProvider {
  readonly name: string;
  /** The origin of a baseUrl you gave it: its requests there may reach a private network. */
  readonly configuredOrigin?: string;
  /** Send every request through `web`: timeouts, byte caps, pacing and address checks. */
  search(request: SearchRequest, web: WebClient): Promise<SearchHit[]>;
}

interface SearchRequest {
  query: string;
  maxResults: number;
  site?: string;
  freshness?: 'day' | 'week' | 'month' | 'year';
  language?: string;
  signal?: AbortSignal;
}

interface SearchHit { title: string; url: string; excerpt: string; date?: string; source?: string }

interface WebClient {
  request(url: string, init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    minIntervalMs?: number;
    signal?: AbortSignal;
    maxBytes?: number;
  }): Promise<{ status: number; url: string; headers: Record<string, string>; body: Buffer; truncated: boolean }>;
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
