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
| `providerConfig` | `{ openai?, anthropic? }` | 각 벤더의 `apiKey`, `defaultModel`, `baseURL`(`baseURL`: Azure OpenAI의 v1 API나 로컬 모델 서버 같은 호환 엔드포인트 또는 프록시). 기본 프로바이더는 자기 벤더의 항목을, 다른 벤더의 폴백은 그 벤더의 항목을 사용합니다 |
| `fallbackProviders` | `Array<{ provider, config? }>` | 기본 프로바이더가 실패하면 순서대로 시도됩니다. `config`는 `providerConfig`보다 우선합니다. 기본 프로바이더와 같은 벤더의 폴백은 기본 프로바이더의 설정을 물려받지 않으며(전역 `apiKey`만), 다른 벤더의 폴백에는 자체 키가 필요합니다 |
| `llmProvider` | `LLMProvider` | 직접 만든 프로바이더(로컬 모델, 게이트웨이, 테스트 대역). `nativeToolMessages`를 선언하면 도구 호출과 결과를 네이티브 형식(`LLMMessage`)으로, 그렇지 않으면 텍스트로 받습니다 |
| `retry` | `Partial<RetryPolicy> \| false` | LLM 재시도 정책, 프로바이더별로, 폴백 전에. 주입한 `llmProvider`에는 명시적으로 설정한 경우에만 적용되며, `llmProvider`로 넘긴 `FallbackProvider`와 그 안의 프로바이더에는 절대 적용되지 않음 |
| `jev` | `JevClientConfig` | 타입 지정 결정을 위해 TypeSafe Jev를 켭니다. 직접 쓰거나, `baseUrl`과 `model: 'typesafe-ai/jev'`로 [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway)를 통해 씁니다 |
| `decisionClient` | `TypedDecisionClient` | 어떤 타입 지정 결정 백엔드든(`jev`보다 우선) |
| `pricing` | `PricingTable` | 토큰 100만 개당 USD, 기본값 위에 병합됩니다 |
| `incidents` | `IncidentMonitorOptions` | 알림기, 규칙, 심각도 임계값, 빈도 제한 |
| `eventStore` | `IEventStore` | 기본값은 `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | 전역 정책 |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | 테스트 산출물의 저장 위치 |

## 에이전트 {#agents}

| 메서드 | 반환값 | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | 통제형 에이전트: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. 모델이 SDK에 등록된 다른 도구의 이름을 대더라도 자신의 도구(`tools`, `capabilities`)만 실행할 수 있습니다. `signal`은 실행을 취소합니다 |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | 도구를 등록합니다. 핸들러의 타입은 Zod 스키마로부터 정해집니다 |
| `defineCapability(definition)` | `Capability` | 도구를 묶습니다 |
| `listTools()` | `Tool[]` | 등록된 모든 도구 |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | 에이전트 밖에서의 통제된 실행(MCP 서버가 사용): 인자, 정책, 승인, 예산(호출이 시작될 때 계수), 그다음 도구. `signal`은 대기 중인 승인을 취소하고 핸들러에 전달됩니다. `approvalTimeoutMs`는 아무도 결정하지 않은 승인을 취소합니다 |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | `read()`를 자체 실행으로 실행합니다: `run.started`, `resource.read`(URI, 크기, SHA-256), `run.completed` 또는 `run.failed` |
| `stopRun(runId)` | `Promise<void>` | 통제형 실행이나 인지 실행을 중지합니다 |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| 옵션 | 기본값 | |
| --- | --- | --- |
| `name`, `model` | — | 필수 |
| `profile` | `DEFAULT_THINKER_PROFILE` | 에이전트가 추론하는 방식 |
| `tools`, `policies` | `[]` | 다른 곳과 똑같이 통제됩니다 |
| `systemPrompt` | — | 모든 프롬프트에 붙는 추가 지시문 |
| `limits` | [인지 에이전트](../guide/cognitive-agents#limits) 참고 | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` 또는 `CognitiveController` |
| `controllerOptions` | — | `minConfidence`(0.35), `readinessThreshold`(0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `compare` 연산을 위한 `'llm'`, `'typed'` 또는 직접 만든 `HypothesisAssessor` |
| `knowledge` | — | 실행 간 기억: `{ store, scope, recallLimit? (10), record? (true) }`, [실행 간 기억](../guide/memory) 참고 |
| `evaluator` | — | 예측을 테스트하는 `OutcomeEvaluator`. `test_prediction`을 켭니다 |
| `generator` | `model` 위의 LLM 생성기 | 직접 만든 `ThoughtGenerator`(관찰 비교 포함). 그 사고도 여전히 엔진의 수용 규칙을 거칩니다 |
| `temperature`, `maxTokens` | `0.4`, — | 사고 생성 설정 |
| `providerSettings` | — | 도구 선택(네이티브 추론 엔진)을 위한 설정 |

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
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — 답의 타입은 질문으로부터 정해집니다 |
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

## 트레이스, 리플레이, 테스트 {#traces-replay-and-testing}

| 메서드 | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | 실행 읽기 |
| `replay(runId, modifications?)` | LLM 없이 다시 실행 |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | 결정 이해하기 |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | 에이전트를 코드처럼 테스트하기 |

## 도구: `ToolDefinition` {#tools-tooldefinition}

| 필드 | |
| --- | --- |
| `name`, `description` | 모델이 보는 것 |
| `schema` | 인자의 Zod 스키마. 맞지 않는 호출은 거부됩니다 |
| `handler(params, context?)` | 검증된 인자와 `{ runId, agentId, signal? }`를 받습니다. `signal`은 호출한 쪽이 포기하면 중단됩니다 |
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `tools`가 나열한 것만 정확히 노출하는 MCP `Server`: 정의된 도구의 이름과/또는 `ToolDefinition`(SDK에 대신 정의됩니다. 같은 정의는 다시 넘겨도 되지만, 이미 쓰인 이름을 가진 다른 도구는 거부됩니다). `resources`: 하나 이상의 `ResourceProvider`. 모든 읽기가 추적됩니다. 호출은 `mcp:<name>`(또는 `agentId`)으로 실행됩니다. 아무도 `approvalTimeoutMs`(기본값 50 000 ms) 안에 결정하지 않은 승인은 취소됩니다. 입력 거부는 클라이언트에게 설명되고, 그 밖의 원인은 `exposeErrorDetails`를 쓸 때만 설명됩니다 |
| `serveMcpOverStdio(sdk, options)` | 위와 같지만 stdin/stdout에 연결됩니다. stderr에 "ready" 한 줄을 쓰고, stdin이 끝나면 닫힙니다(진행 중인 호출은 중단되고, 대기 중인 승인은 취소됩니다). `approvalTimeoutMs`의 기본값은 `createMcpServer`와 마찬가지로 50 000입니다 |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — 어떤 MCP 서버든 그 도구를 `ToolDefinition`으로 |

`GovernedToolHost`는 서버가 SDK에 요구하는 것(`listTools`, `defineTool`, `executeTool`, `traceResourceRead`)입니다. `createSDK()`는 이를 구현하는 객체를 반환합니다.

## 구성 요소 {#building-blocks}

SDK의 구성 요소는 커스텀 설정을 위해 export되어 있습니다: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, 그리고 이들의 주요 타입.
