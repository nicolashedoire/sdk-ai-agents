# 도구

**도구**는 에이전트가 호출할 수 있는 함수입니다. 주문 조회하기, 파일 읽기, 웹 검색하기, 다른 에이전트에게 묻기 같은 것입니다. 도구는 직접 작성할 수도 있고, **도구 소스**에서 바로 쓸 수 있는 것을 가져올 수도 있습니다. 도구 소스는 폴더, 데이터베이스, 웹 API, 웹, 에이전트 또는 MCP 서버입니다.

어디서 왔든 모든 호출은 **통제됩니다**. 호출하는 쪽이 받은 도구여야 하고, 인자가 검사되고, 정책과 예산이 적용되고, 사람에게 승인을 요청할 수 있고, 실패는 재시도할 수 있으며, 모든 것이 이벤트 로그에 기록됩니다.

## 한 줄로 {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

이제 에이전트는 핸드북의 파일을 나열하고, 읽고, 검색할 수 있으며, 웹을 검색하고 읽을 수 있습니다. 모두 여덟 개의 도구이고, 전부 읽기 전용입니다.

## 직접 만든 도구 {#your-own-tools}

`sdk.defineTool`은 도구를 SDK에 등록하고 그 도구를 반환합니다. zod 스키마는 인자를 기술하고, 핸들러는 검증되고 타입이 지정된 인자를 받습니다.

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| 필드 | |
| --- | --- |
| `name`, `description` | 모델이 보고, 이를 바탕으로 결정하는 것입니다. 문자, 숫자, `_`, `-`를 써서 64자 이내로 지으세요. 모델 API와 MCP 클라이언트가 다른 이름을 거부할 수 있습니다. |
| `schema` | zod 스키마로 표현한 인자입니다. `.describe()` 텍스트가 모델에게 보입니다. 맞지 않는 호출은 다른 무엇보다 먼저 거부됩니다. |
| `handler(params, context?)` | 여러분의 코드입니다. `context`에는 `runId`, `agentId`, 그리고 호출하는 쪽이 포기하면 중단되는 `signal`이 들어 있습니다. |
| `metadata` | `riskLevel`(`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`입니다. [호출이 통제되는 방식](#how-calls-are-governed)을 보세요. 기본값은 없습니다. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`이며, 멱등 도구에만 씁니다. |
| `version` | 기본값은 `1.0.0`입니다. 에이전트의 설정 해시에 포함되므로, 변경 전후의 실행을 [비교](../reference/sdk-api#comparisons-and-impact)할 수 있습니다. |
| `capability` | 묶기 위한 레이블입니다. 내장 소스는 이 레이블을 설정합니다(`web:search`, `folder:handbook`…). |

이름은 SDK마다 한 번만 등록됩니다. 이미 쓰인 이름이면 버전이 무엇이든 `sdk.defineTool`이 오류를 던집니다. 두 소스의 이름이 충돌할 수 있다면 각 소스에 접두사를 붙이세요. 모든 필드는 [SDK API](../reference/sdk-api#tools-tooldefinition)에 나와 있습니다.

## 내장 도구 소스 {#the-built-in-tool-sources}

각 소스는 `sdk.defineTool`에 바로 넘길 수 있는 도구 정의를 반환합니다(`connectMcpServer`는 그 `tools`에 담아 반환합니다). 각 소스는 도구의 이름을 바꿀 수 있습니다. 접두사를 붙이거나(`prefix`, MCP는 `toolPrefix`), 에이전트의 도구라면 이름 전체를 바꿉니다(`name`).

| 소스 | 에이전트가 할 수 있는 것 | 도구 이름 | 위험, 읽기 전용 | 필요한 것 | 자세히 |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | 한 폴더의 텍스트 파일을 나열하고, 읽고, 검색합니다. 폴더 밖으로는 절대 나가지 않습니다 | `list_files`, `read_file`, `search_files` | 낮음, 읽기 전용 | 폴더 하나 | [문서 폴더](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | 테이블을 나열하고, 하나를 기술하고, `SELECT` 하나를 실행합니다(기본적으로 100행) | `list_tables`, `describe_table`, `query` | 중간, 읽기 전용 | `sqliteReadOnly(db)`(`node:sqlite` 또는 `better-sqlite3`) 또는 `postgresReadOnly({ pool })`(`pg`) | [읽기 전용 데이터베이스](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | 웹 API를 호출합니다. 오퍼레이션마다 도구가 하나이며, `include`에 나열하지 않으면 `GET`만 호출합니다 | `operationId`, 없으면 메서드와 경로(`get_pets_petId`) | `GET`: 낮음, 읽기 전용. 그 밖: 높음, 승인 필요 | OpenAPI 3 기술(URL, 파일 또는 객체) | [웹 API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | 웹을 검색하고, 페이지나 PDF를 읽고, arXiv, Wikipedia, GitHub를 검색합니다 | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch`는 중간, 나머지는 낮음. 모두 읽기 전용 | 시작하는 데는 아무것도 필요 없음(DuckDuckGo). PDF에는 `unpdf`, 코드 검색에는 GitHub 토큰 | [웹 조사](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | 다른 에이전트에게 묻습니다. 통제형 에이전트는 `message`에 답하고, 인지 에이전트는 `problem`에 대해 추론한 뒤 결정을 반환합니다 | `ask_<agent name>` | 중간, 읽기 전용으로 표시되지 않음 | 에이전트, 따라서 모델 키 | [에이전트](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | 어떤 MCP 서버의 도구든 사용합니다 | 서버가 붙인 이름, 앞에 `toolPrefix`가 붙음 | 설정되지 않음. `metadata`가 가져온 모든 도구에 적용됩니다 | `@sdk-ai-agents/core/mcp`와 `@modelcontextprotocol/sdk`. 다 쓰면 `close()` | [MCP 서버의 도구 사용하기](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

MCP 도구는 두 가지가 다릅니다. SDK는 인자가 객체인지만 검사하고(나머지는 서버가 검사합니다), 읽기 전용 같은 서버 자체의 힌트는 가져오지 않습니다. `metadata`를 직접 설정하세요.

## 에이전트에게 도구 주기 {#giving-tools-to-an-agent}

`createAgent({ tools })`와 `createCognitiveAgent({ tools })`는 도구를 받으므로, 위에서처럼 소스의 정의를 먼저 `sdk.defineTool`에 넘기세요. 에이전트는 **자신의 도구만** 실행할 수 있습니다. `tools`에 있는 도구와 `capabilities`에 있는 도구입니다. 모델이 이름을 대는 그 밖의 도구는 모두 거부됩니다(`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

패키지에서 가져온 `defineTool`은 도구를 등록하지 않고 만들기만 합니다. 그 도구를 쓰는 에이전트가 만들어질 때 SDK가 등록합니다. 그 이름의 도구가 이미 등록되어 있다면, 등록된 도구가 유지되고 그 도구가 실행됩니다.

### 역량 {#capabilities}

역량은 여러 에이전트에게 줄 도구 묶음에 이름을 붙인 것입니다. 도구의 `capability` 레이블은 역량이 아닙니다. 역량은 `sdk.defineCapability`로 정의하세요.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### 에이전트 밖에서 {#outside-an-agent}

`sdk.listTools()`는 SDK에 등록된 모든 도구를 반환합니다. `sdk.executeTool(name, parameters, options?)`는 같은 통제된 파이프라인을 거쳐 도구 하나를 독립된 실행으로 호출하고(`agentId`를 주지 않으면 에이전트 id는 `external`), 핸들러가 반환한 것을 반환합니다.

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

옵션은 다음과 같습니다. `runId`는 호출을 기존 실행 안에 기록하고, `allowedTools`는 이 호출하는 쪽이 실행할 수 있는 것을 제한하고, `signal`은 호출을 취소하고, `approvalTimeoutMs`는 승인을 기다리는 시간에 상한을 두고, `onEvent`는 호출을 실시간으로 지켜봅니다. 거부되면 `PolicyViolationError`를 던지고, 잘못된 인자와 실패한 핸들러는 `ToolExecutionError`를 던집니다.

같은 도구를 다른 곳에서도 쓸 수 있습니다. [연구](./studies#research-through-your-sources)는 정의된 도구의 **이름**을 `sources`로 받고, MCP 서버는 여러분이 넘긴 정의나 이름을 Claude Desktop, Claude Code 또는 어떤 MCP 클라이언트에든 제공합니다([무엇이든 MCP 서버로](./mcp-recipes) 참고).

## 호출이 통제되는 방식 {#how-calls-are-governed}

호출은 다음 단계를 이 순서대로 거치며, 처음 거부되는 곳에서 멈춥니다.

1. **호출하는 쪽의 도구.** 호출하는 쪽이 받지 않은 도구는 거부됩니다. 받은 도구란 에이전트의 도구, 연구의 소스, MCP 서버의 목록, 또는 `allowedTools`입니다. `allowedTools` 없이 쓴 `executeTool`은 등록된 어떤 도구든 실행할 수 있습니다.
2. **인자.** 누구에게 무엇을 묻기 전에 스키마에 대해 검사됩니다.
3. **정책.** 모든 전역 정책과 에이전트의 모든 정책입니다([통제형 에이전트](./governed-agents#_3-policies) 참고).
4. **승인.** 도구나 정책이 승인을 요구할 때입니다.
5. **예산.** 호출은 결과가 어떻든 시작될 때 셉니다.
6. **도구 실행.** 재시도도 이 단계에서 이루어집니다.

### 위험 수준 {#risk-levels}

`riskLevel`은 레이블입니다. 사람과 코드에게 얼마나 조심해야 하는지 알려 줍니다. **어떤 정책도 이것을 읽지 않으며**, 호출을 막지도 늦추지도 않습니다. 이 레이블에 따라 무언가를 하려면 도구에 `requiresApproval`을 주거나, 레이블을 정책으로 바꾸세요.

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

목록은 정책을 정의하는 시점에 만들어집니다. 도구를 먼저 정의하세요.

### 승인 {#approvals}

도구에 `requiresApproval: true`가 있거나(`openApiTools`의 쓰기 오퍼레이션 기본값) 정책 규칙이 `require_approval`이라고 하면, 호출은 사람을 기다립니다. 그 호출은 `sdk.getPendingApprovals()`에 나타나며, `sdk.approveAction(id, who, reason?)`은 실행을 허락하고 `sdk.rejectAction(id, who, reason?)`은 거부합니다. 호출하는 쪽이 먼저 포기하면(중지된 실행, 중단된 `signal`, `approvalTimeoutMs`, MCP 서버에서는 기본값 50초) 승인은 취소되고 도구는 절대 실행되지 않습니다. [승인](./mcp-deploy#approvals-a-human-says-yes-first)을 보세요.

### 읽기 전용 도구 {#read-only-tools}

`readOnly: true`는 도구가 아무것도 바꾸지 않는다는 뜻입니다. MCP 클라이언트에게는 `readOnlyHint`로 보이고, `openApiTools`는 읽기 전용 오퍼레이션만 재시도합니다. 이 표시는 어떤 정책도 완화하지 않으며, 검증되지도 않습니다. 읽기 전용으로 표시된 핸들러라도 쓰기를 하면 여전히 쓰기가 일어납니다. 읽기만 하는 소스는 가능한 곳에서 이를 강제합니다. `folderTools`에는 쓰는 방법이 아예 없고, `sqliteReadOnly`와 `postgresReadOnly`는 데이터베이스 자체에서 각 쿼리를 읽기 전용으로 실행합니다.

### 재시도 {#retries}

`retry`는 실패한 핸들러를 다시 실행합니다. 핸들러의 오류만 재시도하며, 잘못된 인자나 거부는 절대 재시도하지 않습니다. 재시도 하나하나가 `tool.retry` 이벤트가 되며, 호출은 예산에서 한 번만 셉니다. `openApiTools`, `webTools`, `connectMcpServer`는 자신의 도구를 위한 `retry` 옵션을 받습니다. [재시도와 폴백](./resilience#tools)을 보세요.

### 예산 {#budgets}

`budgetLimit`을 가진 `budget` 정책은 기간별 도구 호출 수에 상한을 둡니다. 에이전트 하나(`agentId`), 도구 하나(`toolName`), 또는 전체에 대해 둘 수 있습니다.

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

`maxTokens`와 `maxCost`는 모델 호출을 집계하며, 다 쓰고 나면 도구 호출을 거부합니다. [API 비용](./costs#budgets)을 보세요.

### 신뢰할 수 없는 출력 {#untrusted-output}

도구가 반환한 것은 모델에게 돌아가며, 페이지나 파일이나 API 응답에 모델을 겨냥해 쓴 지시가 들어 있을 수 있습니다(프롬프트 인젝션). 웹 도구는 모든 응답에 `untrusted: true`를 붙이고, 그 설명은 모델에게 그 안에서 찾은 지시를 절대 따르지 말라고 알려 줍니다. 다른 소스는 내용을 있는 그대로 반환합니다. 시스템 프롬프트에 도구 결과는 데이터라고 적고, 각 에이전트에게는 필요한 도구만 주고, 무언가를 바꾸는 도구는 승인으로 보호하세요. 연구는 모든 결과를 데이터로서 모델에게 보여 줍니다. [웹 도구의 보안 규칙](./web-research#security-rules)을 보세요.

### 호출이 기록하는 것 {#what-a-call-records}

| 이벤트 | 시점 |
| --- | --- |
| `action.executing` | 호출이 제안될 때, 어떤 검사보다도 먼저 |
| `policy.checked` | 정책을 하나 검사할 때마다, 그리고 마지막에 판정 |
| `policy.violated` | 거부: 호출하는 쪽이 받지 않은 도구(`allowed-tools`), 정책, 다 쓴 예산 |
| `approval.requested`, `approval.approved`, `approval.rejected` | 사람의 결정 |
| `tool.called` | 핸들러가 시작될 때 |
| `tool.retry` | 재시도, 대기 시간과 오류 포함 |
| `action.executed`, `action.failed` | 결과 또는 오류(잘못된 인자 포함), 소요 시간과 함께 |

`executeTool`로 한 호출은 `runId`를 주지 않는 한 독립된 실행이 됩니다. `run.started`(모드 `tool`), 그다음 `run.completed` 또는 `run.failed`가 기록됩니다. [이벤트 카탈로그](../reference/events#reasoning-and-actions)를 보세요.

## 소스 고르기 {#choosing-a-source}

| 필요한 것… | 쓸 것 |
| --- | --- |
| 직접 작성한 코드나 서비스 | `sdk.defineTool` |
| 폴더에 든 문서 | `folderTools` |
| 쓰기 위험 없이 SQL 데이터베이스에서 얻는 답 | `databaseTools`와 `sqliteReadOnly` 또는 `postgresReadOnly` |
| OpenAPI 기술을 게시하는 웹 API | `openApiTools` |
| OpenAPI 기술이 없는 웹 API | `sdk.defineTool`, 핸들러 안에서 `fetch` 사용 |
| 웹, 논문, 백과사전 글, GitHub의 코드 | `webTools` |
| 다른 에이전트의 답이나 결정 | `governedAgentTool` 또는 `cognitiveAgentTool` |
| 이미 MCP 서버가 있는 시스템 | `connectMcpServer` |
| 연구의 소스 | `webTools`의 검색 도구, 또는 MCP 서버의 검색 도구 |
| Claude Desktop이나 Claude Code에서 쓸 여러분의 도구 | 반대 방향입니다: [MCP 서버](./mcp-recipes) |
