# 무엇이든 MCP 서버로

각 레시피는 한 종류의 시스템을 **한 줄로**, 안전하게 MCP 서버로 만듭니다. 모두 같은 방식으로 동작합니다. **도구 소스**가 도구(와 경우에 따라 리소스)를 만들고, `serveMcpOverStdio`가 이를 제공합니다.

| 노출하고 싶은 것 | 코드 한 줄 | 모델이 받는 도구 |
| --- | --- | --- |
| [직접 작성한 함수](#a-function) | `sdk.defineTool({ … })` | 여러분의 도구 |
| [웹 API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | 오퍼레이션마다 하나, 기본적으로 읽기 전용 |
| [문서 폴더](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ 리소스) |
| [읽기 전용 데이터베이스](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [에이전트](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |

MCP가 처음인가요? [5분 만에 만드는 첫 번째 MCP 서버](./mcp-first-server)부터 시작하세요. 서버를 실행하고, Inspector로 테스트하고, Claude Desktop이나 Claude Code에 연결하는 방법을 보여 줍니다. 아래의 모든 파일은 같은 방식으로 실행하고 연결합니다.

## 모든 레시피가 공유하는 뼈대 {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

`tools`는 **도구 정의**(아래 소스들이 반환하는 것으로, SDK가 대신 정의해 줍니다)와, `sdk.defineTool`로 직접 정의한 도구의 **이름**을 받습니다. 그 밖에는 아무것도 노출되지 않습니다. `resources`(선택 사항)는 문서 제공자를 받으며, 폴더 레시피에서 씁니다.

소스가 무엇이든 모든 호출은 같은 검사를 이 순서대로 거칩니다. 인자, [정책](./mcp-deploy#governance-policies-budgets-approvals), 승인, 예산 순이며, 이벤트 로그에 기록됩니다. 잘못된 호출은 누군가에게 승인을 요청하기 전에 거부됩니다.

## 함수 {#a-function}

가장 단순한 소스는 [첫 번째 서버](./mcp-first-server)에서처럼 직접 작성한 함수입니다.

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| 필드 | 용도 |
| --- | --- |
| `name` | 모델이 호출하는 이름입니다. 문자, 숫자, `_`, `-`를 써서 64자 이내로 지으세요(MCP 클라이언트가 다른 이름을 거부할 수 있습니다). |
| `description` | 언제 이 도구를 쓸지를 쉬운 말로 씁니다. 모델은 이것을 보고 결정합니다. |
| `schema` | zod 스키마로 표현한 인자입니다. `.describe()` 텍스트가 모델에게 보입니다. 맞지 않는 호출은 거부됩니다. |
| `handler` | 여러분의 코드입니다. 검증된 인자와, `signal`(클라이언트가 포기하면 중단됨)을 가진 컨텍스트를 받습니다. |
| `metadata.readOnly` | "이 도구는 아무것도 바꾸지 않는다"는 뜻으로, 클라이언트에게 `readOnlyHint`로 보입니다. |
| `metadata.requiresApproval` | 모든 호출이 사람을 기다립니다([승인](./mcp-deploy#approvals-a-human-says-yes-first) 참고). |
| `retry` | 실패 시 재시도하며, 멱등 도구에만 씁니다(`retryOn`으로 어떤 실패를 재시도할지 좁힐 수 있고, 잘못된 인자는 절대 재시도하지 않습니다). |

## 웹 API, OpenAPI 기술로부터 {#a-web-api-from-its-openapi-description}

**하는 일.** 많은 API가 자신의 엔드포인트를 기계가 읽을 수 있게 기술한 **OpenAPI** 문서(흔히 `openapi.json`)를 게시합니다. `openApiTools`는 이를 읽고 **각 오퍼레이션을 도구로** 바꿉니다. 모델은 오퍼레이션의 요약과 매개변수를 보고, 도구를 호출하면 API가 호출됩니다.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**기본적으로 읽기 전용입니다.** `GET` 오퍼레이션만 도구가 됩니다. 무언가를 바꾸는 오퍼레이션(`POST`, `PUT`, `PATCH`, `DELETE`)을 추가하려면 그 `operationId`로 나열하세요.

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

나열된 쓰기 오퍼레이션은 **고위험**으로 표시되고 **승인이 필요합니다**. 각 호출은 사람이 승인할 때까지 기다립니다([승인](./mcp-deploy#approvals-a-human-says-yes-first) 참고). 승인 없이 신뢰하려면 명시적으로 그렇게 밝히세요: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### 옵션 {#options}

| 옵션 | 기본값 | |
| --- | --- | --- |
| `spec` | — | URL(`https://…`), 파일 경로, 또는 이미 파싱한 객체. JSON만 지원합니다. YAML은 직접 파싱해서(예: `yaml` 패키지로) 객체를 넘기세요. |
| `baseUrl` | 첫 번째 `servers` 항목 | 요청이 가는 곳. 상대 서버 URL은 스펙의 URL을 기준으로 해석됩니다. |
| `headers` | — | 모든 요청에 추가됩니다(인증). 모델에게 절대 보이지 않으며, 헤더 인자보다 우선합니다. `baseUrl`이 필요하며(스펙을 API 자체의 오리진에서 내려받은 경우는 예외), API와 스펙 모두 https여야 합니다(http는 이 컴퓨터에서만). |
| `include` | GET 오퍼레이션 | 노출할 `operationId`들. 지정하면 GET 기본값을 **대체**합니다. 나열한 오퍼레이션만 도구가 됩니다. 쓰기 오퍼레이션을 노출하는 유일한 방법입니다. 알 수 없는 id는 오류입니다. |
| `exclude` | — | 제외할 `operationId`들. |
| `tags` | — | 이 태그 중 하나를 가진 오퍼레이션만. |
| `prefix` | — | 도구 이름의 접두사(`crm_getCustomer`)로, 여러 API를 결합할 때 씁니다. |
| `metadata` | GET: 저위험, 읽기 전용 · 그 밖: 고위험, 승인 | `(operation) => ToolMetadata`. 설정한 필드는 기본값을 대체합니다. 빠뜨린 필드나 `undefined`인 필드는 기본값을 유지하므로, 명시적인 `requiresApproval: false`만 승인을 없앱니다. |
| `retry` | — | 읽기 전용 오퍼레이션(`metadata`가 달리 말하지 않는 한 GET)만, 서버 오류(5xx), 429, 타임아웃, 네트워크 실패 시 재시도합니다. 4xx 응답이나 잘못된 인자는 절대 재시도하지 않습니다. |
| `timeoutMs` | `30000` | 요청당(스펙 내려받기에도 적용). |
| `maxResponseBytes` | `100000` | 이보다 긴 응답은 잘리고 `truncated: true`로 표시됩니다. |
| `maxSpecBytes` | `10000000` | 받아들이는 가장 큰 스펙. |
| `fetch` | 전역 `fetch` | 직접 만든 HTTP 함수(프록시, 테스트). |

### 모델이 보는 것 {#what-the-model-sees}

Petstore의 `getPetById`에 대해 클라이언트는 다음을 받습니다.

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

도구 이름은 `operationId`에서 옵니다(유효한 이름으로 바뀝니다. `show pet!`는 `show_pet`이 되고, `operationId`가 없는 오퍼레이션은 `get_pets_petId`가 되며, 중복에는 `_2`가 붙습니다). 인자는 평평합니다. 경로, 쿼리, 헤더 매개변수마다 하나씩이고, JSON 요청 본문에는 `body`가 추가됩니다. 호출은 HTTP 상태와 파싱된 본문을 반환합니다.

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### 보안 규칙 {#security-rules}

1. **기본적으로 읽기 전용**: `GET`만 허용됩니다. 그 밖의 것은 `include`에 나열해야 하며, 그러면 따로 밝히지 않는 한 승인이 필요합니다.
2. **모델은 호스트를 바꿀 수 없고, 경로를 거슬러 올라갈 수도 없습니다.** 기본 URL은 여러분이 정합니다. 경로 값에는 `/`, `\`, 또는 `.` / `..` 세그먼트가 들어갈 수 없습니다. 퍼센트 인코딩을 한 번 했든 여러 번 했든, 잘못된 이스케이프 옆에 있든 아니든 마찬가지입니다. 일부 서버와 프록시는 `%2F`를 디코딩하기 때문입니다. 그래서 `../../admin`은 거부되며, 최종 URL이 기본 URL 아래에 머무는지도 검사합니다. 이 한계 안에서 값은 모델이 고릅니다. 어느 고객인지, 어느 주문인지 같은 것입니다.
3. **인자는 무엇보다 먼저 검사됩니다**: 정책과 승인보다 먼저 검사되고(잘못된 호출은 절대 사람을 기다리지 않습니다), 요청을 만들 때 다시 검사됩니다. 알 수 없는 인자와 빠진 필수 인자는 거부됩니다. 값은 문자열, 숫자, 불리언이어야 하며(쿼리 매개변수는 이들의 목록도 가능), 헤더 값에는 줄바꿈이 들어갈 수 없습니다.
4. **여러분의 자격 증명은 여러분이 정한 곳으로만 갑니다**: `headers`는 서버가 추가하고, 헤더 인자보다 우선하며, 모델이 읽을 수 있는 곳 어디에도 나타나지 않습니다. `headers`를 쓰면 스펙 파일에 이름이 적힌 서버는 거부됩니다(`baseUrl`을 넘기세요). 스펙을 API 자체의 오리진에서 내려받은 경우는 예외입니다. 그리고 `http:`는 이 컴퓨터(`localhost`, `127.0.0.1`, `[::1]`)를 제외하고 거부됩니다. API에도, 스펙을 내려받을 때에도 마찬가지입니다. 전송 중에 변조된 스펙이 여러분의 자격 증명으로 허용될 오퍼레이션을 추가할 수 있기 때문입니다.
5. **한도가 있습니다**: 요청마다 타임아웃, `maxResponseBytes`에서 잘리는 응답, 스펙 크기 제한이 있습니다.
6. **리디렉션은 따라가지 않습니다**(리디렉션이 여러분의 `Authorization` 헤더를 다른 사이트로 옮길 수 있습니다). `3xx` 응답은 오류이며, 커스텀 `fetch`가 그래도 리디렉션을 따라간 경우도 오류입니다.
7. **오류는 오류입니다**: `2xx`가 아닌 상태는 그 상태와 본문 앞부분을 담아 호출을 실패시킵니다. `exposeErrorDetails: true`를 설정하지 않는 한 MCP 클라이언트에게는 "Tool execution failed"만 보입니다(본문에 내부 세부 정보가 있을 수 있습니다). 이벤트 로그에는 항상 전체 오류가 남습니다.
8. **모든 GET은 읽기 전용으로 알려집니다**(`readOnlyHint`). 어떤 API에는 부작용이 있는 GET(`GET /send-reminder`)이 있습니다. 그런 것은 `exclude`로 빼거나, 해당 오퍼레이션에 대해 `metadata`를 `readOnly: false, requiresApproval: true`로 설정하세요.
9. **큰 기술도 한도 안에 머뭅니다**: `$ref` 확장에는 오퍼레이션별 예산과 스펙 전체 예산이 있으며, 64,000자를 넘는 도구 스키마는 그 설명들로 대체됩니다.

### 전체 파일 {#complete-file}

설치된 패키지의 import를 쓴 [`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts):

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

토큰은 파일에 넣지 말고 클라이언트의 환경 변수로 넘기세요: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### 하지 않는 것 {#what-it-does-not-do}

- **OpenAPI 3.x만 지원합니다**: Swagger 2.0은 거부됩니다(예를 들어 `swagger2openapi`로 변환하세요). YAML은 대신 파싱해 주지 않습니다.
- **JSON 본문만 지원합니다**: `multipart/form-data`나 폼 본문이 필요한 오퍼레이션은 제외됩니다(나열하면 거부됩니다). 다른 타입의 선택적 본문은 제공되지 않습니다. 쿠키 매개변수는 제외됩니다.
- **로그인 흐름은 없습니다**: `headers`에 토큰을 넘기세요. OAuth는 처리하지 않습니다.
- **로컬 참조만 지원합니다**: 다른 파일이나 URL을 가리키는 `$ref`는 해석되지 않습니다("아무 값"이 됩니다). 자기 자신을 참조하는 스키마는 순환 지점에서 잘립니다.
- 응답은 스펙에 대해 검사되지 않고, 페이지를 따라가지 않으며, `baseUrl`을 넘기지 않는 한 스펙의 첫 번째 서버만 사용합니다.

## 문서 폴더 {#a-folder-of-documents}

**하는 일.** 한 폴더의 텍스트 파일(핸드북, 노트, 코드베이스, 내보낸 문서)을 세 가지 도구로 제공합니다. 파일 **나열하기**, 하나 **읽기**, 텍스트로 **검색하기**입니다. 같은 파일은 **리소스**로도 제공되어, 사용자가 직접 대화에 첨부할 수 있습니다.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### 옵션 {#options-1}

`folderTools`와 `folderResources`는 같은 옵션을 받습니다(도구에는 `prefix`가 추가됨).

| 옵션 | 기본값 | |
| --- | --- | --- |
| `root` | — | 폴더. 절대 경로를 쓰세요. 클라이언트는 어떤 작업 디렉터리에서든 서버를 시작합니다. |
| `name` | 폴더 이름 | 설명과 리소스 URI(`folder://<name>/…`)에 쓰입니다. |
| `prefix` | — | 도구 이름의 접두사(`handbook_read_file`)로, 여러 폴더를 제공할 때 씁니다. |
| `extensions` | 텍스트 형식 | 제공할 확장자로, 점 없이 씁니다(`['md', 'txt']`). 기본값: `md`, `txt`, `csv`, `json`, `yaml`, `html`, 소스 코드…(`DEFAULT_TEXT_EXTENSIONS`). 확장자가 없는 파일을 위해 `''`를 추가하세요. |
| `include` | 허용된 모든 것 | 제공할 파일의 glob: `guide/**`, `**/*.md`. `*`는 폴더 하나 안에서, `**`는 폴더를 가로질러 일치합니다. 일치하는 파일이 없는 폴더도 여전히 나열됩니다. |
| `exclude` | — | 어디서나 숨길 파일과 폴더의 glob: `drafts`, `private/*`, `**/node_modules`. 숨긴 폴더는 그 안의 모든 것을 숨깁니다. |
| `includeHidden` | `false` | 점으로 시작하는 이름(`.env`, `.git`…)을 제공합니다. 꺼 두세요. |
| `maxFileBytes` | `200000` | 파일 하나에서 읽는 바이트 수. 더 긴 파일은 잘립니다(`truncated: true`). |
| `maxEntries` | `500` | 목록 조회 한 번이 반환하는 항목 수로, 리소스도 포함합니다. |
| `maxDepth` | `8` | 탐색하는 하위 폴더 깊이. |
| `maxMatches` | `50` | 검색 한 번이 반환하는 일치 수. |
| `maxSearchBytes` | `20000000` | 검색 한 번이 모든 파일을 합쳐 읽는 바이트 수. |
| `maxExaminedEntries` | `50000` | 목록 조회나 검색 한 번이 살펴보는 이름 수로, 제공되든 아니든 셉니다. 이를 넘으면 결과에 `truncated: true`가 표시됩니다. |

### 모델이 보는 것 {#what-the-model-sees-1}

검색 도구를 줄여서 보면 다음과 같습니다.

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

검색은 `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`를 반환합니다. 읽기는 `{ "path", "size", "content", "truncated" }`를 반환합니다.

**리소스**: 각 파일은 크기와 타입(`text/markdown`, `text/csv`…)과 함께 `folder://handbook/guide/onboarding.md`로 나열됩니다. 리소스를 지원하는 애플리케이션은 사용자가 이를 고를 수 있게 해 줍니다. 예를 들어 첨부 메뉴에서 고르며, 방법은 애플리케이션마다 다릅니다.

### 보안 규칙 {#security-rules-1}

1. **상대 경로만** 받습니다. 절대 경로는 거부됩니다.
2. **폴더 밖은 아무것도 없습니다**: 모든 경로는 `..` 세그먼트와 심볼릭 링크를 포함해 실제 위치로 해석되며, 폴더를 벗어나면 거부됩니다. 이미 방문한 폴더를 가리키는 링크는 건너뛰므로, 링크 순환 때문에 목록 조회가 멈추는 일은 없습니다.
3. **숨김 이름은 보이지 않습니다**: `.env`, `.git`, `.ssh`…는 링크를 통해서도 존재하지 않는 것처럼 동작합니다.
4. **텍스트만** 제공합니다: 허용된 확장자만 제공되며, 처음 8 KB에 0 바이트가 있는 파일(바이너리)은 거부됩니다.
5. **한도가 있습니다**: 읽기, 목록 조회, 깊이, 검색 일치, 스캔한 바이트, 살펴본 이름(`maxExaminedEntries`, 50,000)이 모두 제한됩니다. 일찍 멈춘 목록 조회나 검색에는 `truncated: true`가 표시됩니다.
6. **읽기 전용**: 아무것도 쓰거나, 옮기거나, 삭제하지 않습니다.
7. **추적됩니다**: 모든 리소스 읽기는 이벤트 로그의 실행이 되며, URI, 크기, 제공한 내용의 SHA-256 지문이 기록됩니다.
8. **제외는 제외입니다**: 폴더(`private`, `private/*`, `**/node_modules`)를 제외하면, 목록 조회든, 검색이든, 경로로 읽기든, 리소스로 읽기든 그 안의 모든 것이 숨겨집니다.
9. **견고합니다**: 읽을 수 없는 하위 폴더는 건너뛰며, 오류 메시지에는 공유 폴더의 이름만 나오고 절대 경로는 나오지 않습니다.

### 전체 파일 {#complete-file-1}

[`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts)를 옮겨 온 것입니다(기본적으로 이 문서를 제공합니다).

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### 하지 않는 것 {#what-it-does-not-do-1}

- 어떤 종류의 **쓰기도 하지 않습니다**.
- **PDF, Word, 이미지는 지원하지 않습니다**: 텍스트 파일만 지원합니다. 문서는 먼저 Markdown이나 텍스트로 변환하세요.
- **부분 문자열 검색만** 합니다: 의미 기반("시맨틱") 검색도, 순위 매기기도 없습니다.
- **변경 알림이 없습니다**: 클라이언트는 목록을 조회한 시점의 파일을 봅니다.
- **신뢰하지 않는 사람이 폴더에 쓸 수 있어서는 안 됩니다**: 경로를 검사한 다음 파일을 엽니다. 바로 그 순간에 폴더를 링크로 바꿀 수 있는 사람이라면, 이론상 검사를 빠져나갈 수 있습니다.
- **`include`를 써도 폴더는 나열됩니다**. 일치하는 파일이 없는 폴더도 마찬가지입니다(이를 확인하려면 모든 하위 폴더를 읽어야 합니다).
- 리소스 읽기는 추적되지만 도구 정책으로 검사되지는 않습니다. 기꺼이 공유할 수 있는 폴더만 제공하세요.

## 읽기 전용 데이터베이스 {#a-read-only-database}

**하는 일.** 모델이 데이터베이스를 탐색하게 합니다. 테이블을 나열하고, 하나를 기술하고, `SELECT` 쿼리를 실행하되, **절대 바꾸지는 않습니다**. **SQLite**(Node.js 22.13+의 내장 `node:sqlite`, 또는 `better-sqlite3`)와 **PostgreSQL**(`pg`)에서 동작합니다.

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### 옵션 {#options-2}

| `databaseTools` 옵션 | 기본값 | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` 또는 `postgresReadOnly({ client })`, 또는 직접 만든 `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | 모델에게 소개되는 이름: "the shop database". |
| `prefix` | — | 도구 이름의 접두사(`shop_query`)로, 여러 데이터베이스를 제공할 때 씁니다. |
| `maxRows` | `100` (최대 `1000`) | 쿼리 한 번이 반환하는 행 수. `truncated: true`는 더 있었다는 뜻입니다. |
| `maxTextLength` | `2000` | 텍스트 값 하나당 유지하는 문자 수. |
| `maxTables` | `500` | 나열하는 테이블 수. |
| `maxSqlLength` | `20000` | 받아들이는 가장 긴 SQL. |

| `postgresReadOnly` 옵션 | 기본값 | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | 이보다 오래 실행되는 쿼리는 PostgreSQL이 멈춥니다. |
| `schemas` | 시스템 스키마를 제외한 전부 | `list_tables`와 `describe_table`이 **나열하고 기술하는** 스키마. `query`가 읽을 수 있는 것을 제한하지는 않습니다. 그것은 롤(role)의 몫입니다. |

`{ client }`를 쓸 때는 어댑터에 **전용** `pg.Client`를 주세요. 여러분의 애플리케이션이 자체 트랜잭션에 쓰지 않는 클라이언트여야 합니다(여기에 풀을 넘기면 거부됩니다. 풀은 `{ pool }`로 넘기세요).

`sqliteReadOnly(db)`에는 옵션이 없습니다. 파일을 읽기 전용으로 여세요(`node:sqlite`에서는 `{ readOnly: true }`, better-sqlite3에서는 `{ readonly: true }`). 이 어댑터는 두 드라이버가 공유하는 `prepare`, `exec`, 그리고 구문(statement) 메서드에만 의존합니다. 테스트 스위트는 better-sqlite3가 아니라 실제 `node:sqlite` 데이터베이스에서 이를 실행합니다.

### 모델이 보는 것 {#what-the-model-sees-2}

세 가지 도구가 있습니다. `list_tables`, `describe_table { table }`, `query { sql }`이며, 마지막 도구의 설명은 *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."*입니다. 쿼리는 다음을 반환합니다.

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

값은 행이 도착하는 대로 읽기 쉬운 형태로 바뀝니다. 아주 큰 정수는 문자열이 되고, 날짜는 ISO 문자열이 되고, 바이너리 데이터는 `<binary data, 3 bytes>` 같은 안내문이 되고, 긴 텍스트는 잘리고, 배열은 항목 100개까지만 유지됩니다(`… 400 more items`). 데이터베이스가 쿼리 자체를 거부하면("no such column", "read-only", 타임아웃) 모델은 SQL을 고칠 수 있도록 그 이유를 받습니다. 연결 오류와 서버 오류는 여러분 쪽에만 남습니다.

### 보안 규칙: 자물쇠 하나가 아니라 넷 {#security-rules-four-locks-not-one}

쿼리가 "SELECT로 시작하는지" 검사하는 것만으로는 부족합니다. `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone`은 `WITH`로 시작하지만 삭제를 합니다. 그래서 쿼리는 네 개의 자물쇠를 통과해야 합니다.

1. **구문 검사**: 정확히 하나의 구문이어야 하고(문자열 안의 세미콜론, 따옴표로 감싼 이름, 주석, PostgreSQL `$$` 인용과 `E'…'` 이스케이프 문자열을 이해합니다), `SELECT`, `WITH` 또는 `VALUES`로 시작해야 하고, `$1` 매개변수가 없어야 하며, 괄호의 짝이 맞아야 합니다. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`…은 거부됩니다.
2. **데이터베이스 자체가 쓰기를 거부합니다**:
   - SQLite: 모든 쿼리는 `PRAGMA query_only = ON`으로 실행되고(끝난 뒤 복원됨), better-sqlite3에서는 쓰기를 하는 구문이 실행 전에 거부됩니다.
   - PostgreSQL: 모든 쿼리는 자신만의 `BEGIN READ ONLY` 트랜잭션 안에서 실행됩니다. 이미 다른 트랜잭션 안에 있는 연결은 먼저 탐지되어(`transaction_timestamp()`가 구문보다 이전임) 그 트랜잭션을 건드리지 않고 거부됩니다. `SET LOCAL statement_timeout`이 적용되며, 항상 `ROLLBACK`에 이어 `SELECT pg_advisory_unlock_all()`로 끝납니다(권고 잠금(advisory lock)은 롤백 후에도 남습니다. 이를 해제하지 못한 연결은 재사용되지 않습니다). 쿼리는 바인딩된 매개변수를 가진 서브쿼리로 보내지므로, 서버는 구문 하나만 받아들입니다. 트랜잭션들이 동시에 한 연결을 공유하는 일은 없습니다.
3. **한도**: 최대 `maxRows`개의 행만 읽고(SQLite는 나머지를 절대 읽지 않고, PostgreSQL은 `LIMIT`에서 멈춥니다), 값은 행이 도착하는 대로 짧은 복사본으로 잘리며(각 원본 값은 잘리기 전에 여전히 통째로 로드됩니다), PostgreSQL 쿼리에는 타임아웃이 있습니다.
4. **여러분**: SQLite 파일은 읽기 전용으로 여세요. PostgreSQL에는 보여 주고 싶은 것만 읽을 수 있는 롤로 연결하세요. 이것이 진짜 경계입니다. 읽기 전용 트랜잭션은 함수가 데이터베이스 밖에서 하는 일(예를 들어 `dblink`나 HTTP 확장)을 막지 못하기 때문입니다. 그런 롤도 여전히 시스템 카탈로그(`pg_catalog`)를 읽고 `PUBLIC`에 부여된 함수를 호출할 수 있습니다. 외부에 닿는 확장의 함수는 권한을 회수하세요(`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;` 등).

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### 전체 파일 {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts)(SQLite, 파일을 주지 않으면 데모 상점 데이터베이스를 만듭니다)와 [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### 하지 않는 것 {#what-it-does-not-do-2}

- 설계상 **쓰기는 없습니다**. 모델이 데이터를 바꾸게 하려면, 그 한 가지 변경만을 위한 전용 도구를 승인과 함께 작성하세요.
- **쿼리 안에서 테이블별 필터는 없습니다**: 쿼리는 연결이 읽을 수 있는 모든 것을 읽을 수 있습니다. 롤(PostgreSQL)을 쓰거나, 필요한 테이블만 담은 파일 사본(SQLite)을 쓰세요. 원본 테이블보다는 뷰를 노출하세요.
- **SQLite: 공격 표면은 파일이 아니라 쿼리입니다.** 쿼리는 여러분의 서버 프로세스 안에서 동기적으로, 타임아웃도 메모리 상한도 없이 실행됩니다. SQL을 쓰는 쪽(모델, 또는 모델을 조종하는 누군가)은 끝나지 않는 쿼리(재귀 `WITH`)나 거대한 값을 만드는 쿼리를 써서 서버를 막거나 자원을 고갈시킬 수 있습니다. 행은 하나씩 읽히고 각 값은 도착하는 대로 짧은 복사본으로 잘리므로 결과는 작게 유지되고 원본은 해제될 수 있습니다. 하지만 각 원본 값은 먼저 통째로 로드되며, SQLite가 행 하나를 만들기 위해 하는 작업에는 아무런 한도가 없습니다. SQLite는 여러분 자신이나 신뢰하는 사람에게만 제공하고, 신뢰할 수 없는 클라이언트에게 HTTP로 노출하지 마세요. 멈출 수 있는 워커 스레드에서 쿼리를 실행하면 이 한계가 사라지겠지만, 아직 구현되지 않았습니다.
- **연결에 등록된 SQLite 함수는 모델의 SQL에서 호출할 수 있습니다**(`db.function(…)`). 제공하는 연결에는 무해한 함수만 등록하세요.
- **바인딩 매개변수가 없습니다**: 모델은 SQL에 값을 직접 씁니다.
- 결과에 이름이 같은 두 열이 있으면 마지막 것만 남습니다. 별칭을 붙이세요.
- 다른 데이터베이스(MySQL, SQL Server…): 작은 `ReadOnlyDatabase` 인터페이스를 직접 구현하고, 스스로 쓰기를 거부하게 만드세요. `assertSingleQuery(sql, dialect)`는 SQLite와 PostgreSQL 문법만 이해합니다. MySQL(모든 문자열에서의 백슬래시 이스케이프, `#` 주석)에는 별도의 검사가 필요합니다.

## 에이전트: 여러분의 추론 쌍둥이 {#an-agent-your-reasoning-twin}

**하는 일.** 에이전트 전체를 도구 하나로 노출합니다. 가장 인상적인 활용은 [여러분의 사고자 프로필을 가진 인지 에이전트](./thinker-profiles)입니다. 그러면 누구든 Claude Desktop에서 *"Nicolas라면 Jev에 돈을 내는 것을 어떻게 생각할까?"*라고 묻고, **Nicolas가 추론하는 방식대로** 추론한 답을 근거와 아직 부족한 것과 함께 받을 수 있습니다.

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

이 레시피에는 모델 키가 필요합니다(`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`). 에이전트가 언어 모델로 생각하기 때문입니다.

### 1단계 — 여러분의 추론 방식 담아내기 {#step-1-—-capture-how-you-reason}

몇 가지 주제를 자신의 말로 설명하고, 한 번 프로필로 추출한 다음 저장하세요.

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

프로필에 무엇이 담기는지, 시간을 두고 어떻게 교정하는지는 [특정 인물처럼 추론하기](./thinker-profiles)를 보세요.

### 2단계 — 제공하기 {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts)는 `PROFILE_FILE`에서 프로필을 불러오거나(프로필 스키마로 검사함) 내장된 예시를 쓰고, `ask_nicolas`를 제공합니다.

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### 모델이 보는 것과 돌려받는 것 {#what-the-model-sees-and-gets-back}

도구는 `problem`(질문, 최대 4,000자)과 선택적인 `context` 객체(사실과 제약, JSON으로 최대 20,000자)를 받습니다. 심적 상태 전체가 아니라 결정을 반환합니다.

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

`decisionStatus`는 `committed`(확고한 답), `provisional`(지금까지의 최선의 답으로, `missing`에 확립되지 않은 것이 담김) 또는 `abstain`입니다. 전체 추론은 `runId` 아래 이벤트 로그에 남습니다. `sdk.getMentalState(runId)`는 모든 가설과 비판을 보여 줍니다. 실행이 실패하면 `error`는 실행이 완료되지 않았다는 것과 어디를 봐야 하는지만 말합니다(`exposeErrors: true`를 쓰면 메시지 자체가 결과에 들어갑니다. 여기에는 프로바이더의 세부 정보가 있을 수 있습니다).

### 옵션 {#options-3}

| 옵션 | 기본값 | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | 도구 이름. |
| `description` | 일반적인 설명 | 언제 이 에이전트에게 물어볼지 적으세요. 모델은 이를 보고 결정합니다. |
| `metadata` | 중위험 | 거버넌스 메타데이터로, 기본값 위에 필드 단위로 병합됩니다. 모든 질의를 확인하려면 `requiresApproval: true`를 추가하세요. |
| `maxInputLength` | `4000` | 받아들이는 가장 긴 문제(또는 메시지). |
| `maxContextLength` | `20000` | JSON 텍스트로서 가장 긴 `context`. |
| `exposeErrors` | `false` | 실패한 실행의 오류 메시지를 결과에 넣습니다. |

`governedAgentTool(agent, options)`는 `sdk.createAgent`로 만든 에이전트에 대해 같은 일을 합니다. `message`(와 `context`)를 받고 `{ runId, status, output, error }`를 반환합니다.

### 알아 두면 좋은 것 {#good-to-know}

- **시간이 걸립니다.** 인지 실행은 모델 호출을 여러 번 합니다. 수십 초, 때로는 몇 분을 예상하세요. 많은 클라이언트가 약 1분 뒤에 호출을 취소합니다(공식 TypeScript SDK의 기본값은 60초이고, Claude Code에서는 `MCP_TOOL_TIMEOUT`으로 늘릴 수 있습니다). 대화형으로 쓸 때는 `limits`를 작게 유지하세요. **클라이언트가 포기하면 실행이 중지되고**(인지 에이전트와 통제형 에이전트 모두) 취소된 것으로 기록됩니다. 더 이상 모델 호출이 일어나지 않고, 에이전트가 기다리던 승인도 취소됩니다.
- **돈이 듭니다**: 질의 한 번이 모델 호출 여러 번입니다. [예산](./mcp-deploy#governance-policies-budgets-approvals)을 걸고 `sdk.getRunCost(runId)`를 확인하세요.
- **흉내 내는 것은 추론 방식이지, 그 사람이 아는 것이 아닙니다.** 쌍둥이는 프로필, 질문, 컨텍스트에 있는 것만 압니다. 그 사람의 기억은 모릅니다. 그 답은 "그 사람이라면 이것에 어떻게 접근할까"로 받아들이고, 실제 인물이 `learnFromFeedback`으로 교정하게 하세요.

## 서버 하나에 여러 소스 {#several-sources-in-one-server}

이름이 절대 충돌하지 않도록 접두사를 붙여 소스를 결합하세요.

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

이름이 같은 두 도구는 시작할 때 거부되며, 어떤 도구인지 알려 주는 메시지가 나옵니다.

## 여러분의 에이전트에서도 같은 도구를 {#the-same-tools-in-your-own-agents}

소스는 평범한 도구 정의입니다. 여러분의 에이전트는 MCP 없이도 이를 쓸 수 있습니다.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

같은 규칙이 적용됩니다. 여러분이 나열한 쓰기 오퍼레이션은 승인을 기다리고, 모든 호출은 검사되고 기록됩니다.

다음: [배포, 보안, 문제 해결](./mcp-deploy).
