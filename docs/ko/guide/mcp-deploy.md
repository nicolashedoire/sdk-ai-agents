# 배포, 보안, 문제 해결

여러분의 서버는 여러분의 컴퓨터에서 동작합니다([첫 번째 서버](./mcp-first-server), [레시피](./mcp-recipes)). 이 페이지에서는 HTTP로 서버를 공유하는 방법, 규칙과 사람을 루프에 넣는 방법, 보안 체크리스트, 그리고 무언가 동작하지 않을 때 할 일을 다룹니다.

## stdio 또는 HTTP? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| 실행 방식 | AI 앱이 같은 컴퓨터에서 서버를 프로그램으로 시작합니다 | 서버가 어딘가에서 웹 서비스로 실행됩니다 |
| 사용할 수 있는 사람 | 그 컴퓨터의 사용자 | 주소와 토큰을 받은 모든 사람 |
| 네트워크 노출 | 없음 | 보호해야 할 HTTP 엔드포인트 |
| 적합한 용도 | 개인 도구, 로컬 파일, 이것저것 시험해 보기 | 팀, 회사 전체의 API나 데이터베이스 |
| 시작 방법 | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + MCP SDK의 HTTP 전송 방식 |

stdio로 시작하세요. 여러 사람이 같은 서버를 써야 할 때 HTTP로 옮기세요.

## HTTP로 제공하기 {#serve-over-http}

공식 MCP SDK가 HTTP 전송 방식을 제공하고, `createMcpServer`가 여기에 통제된 서버를 붙입니다. 이 전체 파일은 웹 프레임워크 없이 Node 자체의 `http` 모듈을 쓰며, **상태가 없습니다**(stateless). 요청마다 새 MCP 서버를 받으므로, 로드 밸런서 뒤에서 여러 복사본을 실행할 수 있습니다.

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

각 검사의 목적은 다음과 같습니다.

| 검사 | 이유 |
| --- | --- |
| 경로 `/mcp` | MCP를 위한 주소 하나. 그 밖의 모든 것은 거부됩니다. |
| `Host` 헤더 | 그렇지 않으면 여러분이 방문한 웹 페이지가 브라우저를 시켜 `localhost`의 서버를 호출하게 만들 수 있습니다("DNS 리바인딩"). 배포할 때는 대신 공개 호스트 이름을 나열하세요. |
| Bearer 토큰 | 토큰을 아는 클라이언트만 들어옵니다. 상수 시간으로 비교합니다. 길고 무작위인 토큰을 생성하고, 코드 밖에 두세요. |
| `POST`만 허용 | 상태 없는 모드에서는 `GET`으로 열 장기 스트림이 없습니다. |
| 요청마다 서버 하나 | 요청 사이에 공유되는 것이 없습니다. 도구 정의는 한 번 만들어 재사용합니다(같은 정의를 다시 정의하는 것은 허용됩니다). 대가: 클라이언트의 "취소" 메시지는 또 다른 요청으로 도착하므로 그것이 취소하려는 호출에 닿을 수 없습니다. 대신 연결을 닫거나 `approvalTimeoutMs`가 지나야 호출이 끝납니다. |

이 파일은 `127.0.0.1`에서만 수신합니다. 공개하려면 **HTTPS**를 종료하는 리버스 프록시(Caddy, nginx, 클라우드의 로드 밸런서) 뒤에 두고, 호스트 이름을 `allowedHosts`에 추가하세요. 네트워크에서 bearer 토큰을 절대 평문 HTTP로 보내지 마세요.

실행 가능한 버전이 [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts)로 함께 제공됩니다(`MCP_TOKEN=… npm run example:mcp-http`). 실제 클라이언트로 확인했습니다. 토큰 없는 호출은 `401`을, 위조된 `Host`는 `403`을 받고, 토큰이 있는 클라이언트는 도구를 나열하고 호출합니다.

### HTTP 서버에 클라이언트 연결하기 {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. 공유되는 `.mcp.json`에는 `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`라고 쓰세요. Claude Code는 환경 변수를 확장하므로 토큰이 파일에 들어가지 않습니다.
- **여러분의 에이전트**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — [쉽게 풀어 쓴 MCP](./mcp#use-the-tools-of-an-mcp-server-in-your-agents)를 보세요.
- **다른 애플리케이션**: 해당 문서에서 "remote MCP server"나 "custom connector"를 찾아보세요. 일부는 고정 토큰이 아니라 OAuth 로그인을 쓰는 서버만 받아들입니다.

## 거버넌스: 정책, 예산, 승인 {#governance-policies-budgets-approvals}

모든 MCP 호출은 하나의 신원 `mcp:<server name>`으로 실행됩니다(`agentId`로 바꿀 수 있습니다). 정책, 예산, 알림은 다른 에이전트와 마찬가지로 이 신원을 대상으로 할 수 있습니다. 모든 종류의 정책은 [통제형 에이전트](./governed-agents)를 보세요.

서버 하나에 대한 **일일 호출 예산**:

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

그날의 501번째 호출은 정책 이름과 함께 거부되며, 거부 기록은 이벤트 로그에 남습니다. 호출은 **시작될 때** 셉니다. 검사와 계수가 한 단계로 이루어지므로, 동시에 들어온 20개의 호출이 한도 2를 모두 빠져나갈 수는 없습니다. 그리고 실패를 포함해 **결과와 상관없이** 셉니다. 예산은 프로세스의 메모리에서 셉니다. 서버가 다시 시작되면 0부터 다시 시작하고, HTTP 서버의 각 복사본은 자신의 호출을 따로 셉니다. 어떤 정책이나 예산보다도 먼저 인자를 검사합니다. 잘못된 호출은 계수되지도 않고 누구를 기다리지도 않은 채 거부됩니다.

### 승인: 사람이 먼저 허락하기 {#approvals-a-human-says-yes-first}

도구는 다음 경우에 실행 전에 사람의 결정을 기다립니다.

- 그 정의에 `metadata: { requiresApproval: true }`가 있을 때. `openApiTools`의 쓰기 오퍼레이션은 이것이 기본값입니다.
- 또는 정책이 요구할 때. 정의를 건드리지 않고, 여러분이 이름을 지정한 도구에 대해서입니다.

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

어떤 정책이든 거부하는 호출은 승인을 요청하지 않고 거부됩니다. 승인은 거부 규칙, 허용 목록, 예산을 절대 뒤집지 않습니다. 기다리는 동안 호출은 `sdk.getPendingApprovals()`에 나타납니다. 여러분의 코드는 `sdk.approveAction(id, who, reason)` 또는 `sdk.rejectAction(id, who, reason)`으로 결정하며, 둘 다 기록됩니다(`approval.requested`, `approval.approved` 또는 `approval.rejected`). stdio 서버는 자기 터미널에서 물어볼 수 없습니다. 표준 입력이 프로토콜을 운반하기 때문입니다. 그래서 결정은 다른 경로로 와야 합니다. 예를 들어 서버와 같은 프로세스 안에, 이 컴퓨터에서만 접근할 수 있는 작은 관리용 엔드포인트를 둘 수 있습니다.

**관리용 엔드포인트는 무엇이 실행될지를 결정합니다. MCP 엔드포인트처럼 보호하세요.** 그렇지 않으면 브라우저에 열어 둔 페이지가 `localhost`에 접근해(DNS 리바인딩) 여러분 대신 승인할 수 있습니다. 그래서 이 엔드포인트는 `127.0.0.1`에서만 수신하고, 자신의 `Host`만 받아들이고, `Origin`이 붙은 모든 요청을 거부하며(브라우저는 이를 붙이지만, 스크립트와 `curl`은 붙이지 않습니다), 비밀 헤더를 요구합니다.

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

그러면 `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals`로 기다리는 것을 나열하고, `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve`로 결정합니다. 이렇게 만든 완전한 서버가 [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts)로 함께 제공됩니다. 처음부터 끝까지 확인했습니다(호출이 기다리고, 위조된 `Host`, `Origin`, 빠진 비밀은 `403`/`401`을 받고, 승인하면 도구가 실행되며, 클라이언트가 떠나면 프로세스가 종료됩니다).

승인이 기다리고 있을 때 알림을 받으려면, Slack이나 이메일 알림기와 함께 `approval.requested`에 대한 [인시던트 규칙](./incidents#rules)을 추가하세요. 대기 중인 승인은 호출이 기다리는 프로세스의 메모리에 있습니다. HTTP 서버의 복사본이 여럿이라면 그 승인을 가진 복사본을 통해 결정하세요(또는 승인이 필요한 도구에는 복사본 하나만 실행하세요).

::: warning 대기 중인 승인이 얼마나 유지되나
많은 클라이언트가 약 1분 뒤에 호출을 취소합니다. 대기 중인 승인은 다음 경우에 취소되며, 도구는 절대 실행되지 않습니다.

- 클라이언트가 호출을 취소할 때(stdio, 또는 상태가 있는 HTTP 세션).
- 연결이 닫힐 때: 종료된 stdio 클라이언트, 닫힌 HTTP 요청.
- 아무도 `approvalTimeoutMs` 안에 결정하지 않았을 때. **기본값은 50초**로, 대부분의 클라이언트가 기다리는 시간보다 짧습니다. 클라이언트가 더 오래 기다린다면(`MCP_TOOL_TIMEOUT`을 늘린 Claude Code) `createMcpServer`/`serveMcpOverStdio`에서 설정하세요.

**상태 없는 HTTP 서버에서는 마지막 두 경우만 적용됩니다**. "취소" 요청을 그것이 취소하려는 호출에 연결할 수 없기 때문입니다. 연결을 닫지 않고 포기한 클라이언트는 `approvalTimeoutMs`까지 승인을 대기 상태로 남깁니다. 그리고 그 사이에 주어진 "예"는, 아무도 답을 기다리지 않는데도 여전히 도구를 실행합니다. `approvalTimeoutMs`를 클라이언트가 기다리는 시간보다 충분히 짧게 유지하거나(예제는 20초를 씁니다), 승인이 필요한 도구는 stdio나 상태가 있는 세션으로 제공하세요.

일단 취소되면 늦게 온 "예"는 "already rejected"로 실패하며, 승인 뒤에 호출이 한 번 더 검사됩니다. 그 사이에 클라이언트가 떠났다면 도구는 실행되지 않습니다. MCP를 통한 승인은 빠른 결정에 알맞습니다. 몇 시간이 걸리는 결정이라면, 도구가 팀이 나중에 처리할 *요청을 제출*하게 만드세요.
:::

대부분의 MCP 애플리케이션도 도구를 호출할 때마다 사용자에게 묻습니다(Claude Desktop은 기본적으로 그렇게 합니다). 그 확인은 애플리케이션 안에서 일어나고, SDK 승인은 여러분의 서버에서, 여러분의 규칙에 따라 일어나며 기록됩니다. 데이터를 바꾸는 모든 것에는 둘 다 쓰세요.

## 진행 알림 {#progress-notifications}

클라이언트는 호출이 어떻게 진행되고 있는지 알려 달라고 요청할 수 있습니다. 호출과 함께 `progressToken`을 보내면 됩니다(공식 TypeScript SDK는 `onprogress`를 넘기면 그렇게 합니다). 그러면 서버는 호출의 모든 이벤트마다, 그리고 `cognitiveAgentTool`이나 `governedAgentTool`이 시작하는 에이전트 실행의 모든 이벤트마다 `notifications/progress`를 하나씩 보냅니다. 여기에는 매번 1씩 올라가는 `progress`와 짧은 `message`가 담깁니다.

```text
call started
tool ask_support called
agent started
step 1: model chose lookup_customer
step 1: tool lookup_customer called
step 1: tool lookup_customer done
step 2: model answered
agent completed
call completed
```

메시지는 단계, 도구, 인지 연산의 이름을 알려 줍니다. 모델이 고른 도구, 그리고 서버가 노출하지 않는 에이전트의 도구를 포함해 에이전트가 호출하는 모든 도구의 이름이 나옵니다. 자신의 컨텍스트의 `onEvent`로 [연구](./studies)를 실행하는 도구는 과정 단위로 기술되며(`study started`, `passage changes started`, `search in changes`, `report ready`), 쿼리 단위로 기술되는 일은 없습니다. 메시지는 인자, 결과, 오류 텍스트를 절대 담지 않습니다. `total`은 없습니다. 실행이 몇 단계를 거칠지 미리 아는 사람은 없기 때문입니다. 모든 알림은 결과보다 먼저 보내지며, 결과 뒤에 보내지는 일은 없습니다. Streamable HTTP에서는 알림이 응답의 스트림(SSE)을 타고 전달됩니다. `enableJsonResponse: true`로 만든 전송 방식은 평범한 JSON으로 답하므로 알림을 버립니다. `progressToken`을 보내지 않는 클라이언트는 알림을 전혀 받지 않습니다.

도구가 시작하는 에이전트 실행만, 한 단계 깊이까지만 따라갑니다. 그 에이전트가 자신의 에이전트 도구를 통해 시작하는 실행은 따라가지 않으며, 실시간 이벤트가 없는 저장소 위에 직접 만든 에이전트도 마찬가지입니다. 알림은 하나도 합쳐지지 않습니다. 이벤트 하나하나가 알림이 되므로, 긴 인지 실행은 수백 개의 알림을 보낼 수 있습니다.

진행 알림으로 달라지는 것과 달라지지 않는 것은 다음과 같습니다.

- **진행 알림을 받을 때 타임아웃을 초기화하는 클라이언트만 더 오래 기다립니다.** TypeScript SDK에서는 `client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`입니다. 진행 상황을 표시하더라도 타임아웃이 고정된 클라이언트는 이전과 똑같은 시점에 포기합니다. 이에 기대기 전에 여러분의 애플리케이션이 어떻게 동작하는지 확인하세요.
- **그런 클라이언트에서 중요한 것은 가장 긴 침묵**이지, 호출의 길이가 아닙니다. 모델 호출 한 번, 느린 도구 하나, 또는 승인 하나가 그런 침묵입니다. 도구가 실행되는 동안이나 승인을 기다리는 동안에는 아무것도 보내지 않으므로, `approvalTimeoutMs`의 50초는 여전히 적용되며, 모델 호출이나 도구 호출 하나하나가 클라이언트의 타임아웃 안에 끝나야 합니다.
- **그러면 에이전트가 더 오래 걸려도 됩니다**: 단계마다 알림을 보내므로, 인지 에이전트의 `limits.timeoutMs`가 클라이언트의 타임아웃을 넘어도 됩니다. 다른 클라이언트에는 [에이전트 레시피](./mcp-recipes#an-agent-your-reasoning-twin)의 작은 한도를 유지하세요.

## 보안 체크리스트 {#security-checklist}

서버를 공유하기 전에:

- [ ] **최소한만 노출하세요.** `tools`에는 필요한 도구만 나열하고, 읽기 전용 소스를 우선하고, 쓰기 오퍼레이션은 하나씩 추가하세요.
- [ ] **쓰기에는 사람이 필요합니다.** 이유가 없다면 쓰기 도구에 `requiresApproval`을 켜 두고, 이유가 있다면 그 이유를 기록하세요.
- [ ] **아래 계층에서도 최소 권한.** 읽기 전용 범위의 API 토큰, SELECT만 가능한 데이터베이스 롤, 공유해도 되는 것만 담은 폴더. 서버의 검사는 첫 번째가 아니라 두 번째 자물쇠입니다.
- [ ] **비밀은 코드 밖에.** 토큰은 환경 변수(`claude mcp add … -e TOKEN=…`)에서 가져오고, 절대 스펙, 설명, 파일에서 가져오지 마세요.
- [ ] **결과는 신뢰할 수 없는 텍스트입니다.** API, 문서, 데이터베이스가 반환하는 내용은 한 글자도 바뀌지 않고 모델에 도달합니다. 페이지에 "지시를 무시하고…"가 들어 있을 수 있습니다. 같은 대화에 신뢰할 수 없는 소스와 승인 없는 강력한 쓰기 도구를 함께 주지 마세요.
- [ ] **HTTP 서버**: HTTPS, 길고 무작위인 토큰, `Host` 허용 목록, 프록시 뒤에서 `127.0.0.1`로만 수신.
- [ ] **오류 세부 정보는 안에 둡니다**(`exposeErrorDetails` 꺼짐, 기본값). 입력 거부(잘못된 인자, 폴더 밖의 경로, 쿼리가 아닌 SQL)는 여전히 클라이언트에게 설명됩니다.
- [ ] 돈이 드는 모든 것에 **예산**을: 에이전트(모델 호출)와 유료 API.
- [ ] 처음 며칠이 지나면 **이벤트 로그를 읽으세요**: 어떤 도구가 호출되는지, 어떤 호출이 거부되는지.

MCP 프로젝트는 공격과 방어에 대한 자세한 가이드를 관리합니다: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## 문제 해결 {#troubleshooting}

| 증상 | 가능성 높은 원인 | 해결 방법 |
| --- | --- | --- |
| 클라이언트가 바로 연결을 끊거나, 서버가 잘못된 JSON을 보냈다고 말함 | 무언가가 **표준 출력**에 씀: 여러분의 코드나 라이브러리의 `console.log` | `console.error`(표준 오류)를 쓰세요. stdout은 프로토콜을 운반합니다. |
| `npx tsx server.ts`가 한 줄을 출력하고 멈춘 것처럼 보임 | 정상: stdio 서버는 클라이언트를 기다립니다 | [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector)로 테스트하거나 앱을 연결하세요. |
| Claude Desktop에 서버가 나타나지 않음 | 구성의 JSON 오류, 상대 경로, 앱을 다시 시작하지 않음 | JSON을 확인하고, 절대 경로를 쓰고, 앱을 종료했다가 다시 시작하고, `mcp*.log`를 읽으세요([위치](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| 로그에 `npx: command not found` / `node: not found` | 앱이 셸의 `PATH`를 보지 못함(nvm에서 흔함) | `npx`의 전체 경로를 쓰세요(`which npx` / `where npx`). |
| 목록에서 도구가 빠짐 | `tools`에 없음 | 그 이름이나 정의를 `tools`에 추가하세요. 그렇지 않으면 아무것도 노출되지 않습니다. |
| 시작할 때 `Another tool named "x" is already defined` | 두 소스가 같은 도구 이름을 만듦 | 각 소스에 `prefix`를 주세요. |
| `Tool execution failed: <name>`만 나오고 그 이상은 없음 | 원인에 내부 세부 정보가 있을 수 있어 숨겨짐 | 이벤트 로그에서 실행을 읽거나, 개발 중에는 `exposeErrorDetails: true`를 설정하세요. |
| 호출이 타임아웃됨 | 도구가 느림(흔히 에이전트) | 에이전트 `limits`를 줄이고, 클라이언트의 타임아웃을 늘리세요(Claude Code: `MCP_TOOL_TIMEOUT`). 또는 [진행 알림](#progress-notifications)을 받을 때 타임아웃을 초기화하는 클라이언트를 쓰세요. |
| 결과가 잘림 | 크기 한도(`truncated: true`) 또는 클라이언트 자체 한도 | `maxResponseBytes`, `maxRows`, `maxFileBytes`를 늘리세요. Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| 쓰기 도구가 "Approval no decision within 50000 ms"라고 답함 | 아무도 제시간에 승인하지 않음 | 더 빨리 승인하거나([승인](#approvals-a-human-says-yes-first) 참고), `approvalTimeoutMs`를 늘리거나, 의도적으로 `requiresApproval: false`를 설정하세요. |
| `events/`나 `golden-traces/` 같은 폴더가 예상치 못한 곳에 생김 | 이벤트 로그에 절대 경로를 쓰지 않음(또는 이전 SDK 버전) | `eventStore: new FileEventStore(<absolute path>)`를 넘기세요. 현재 버전은 다른 폴더를 쓸 때만 만듭니다. |
| `Cannot find module 'node:sqlite'` | Node.js가 22.13보다 오래됨 | Node.js를 업그레이드하거나, `better-sqlite3`를 쓰세요. |
| `… is not JSON. For a YAML spec, parse it yourself` | OpenAPI 스펙이 YAML임 | 파싱해서(`yaml` 패키지) 그 객체를 `spec`으로 넘기세요. |
| `cannot resolve the server URL "/v3"` | 스펙에 상대 서버가 있고 파일에서 불러옴 | `baseUrl`을 넘기세요. |
| Inspector가 시작되지 않음 | 그 [문서](https://modelcontextprotocol.io/docs/tools/inspector)는 Node.js 22.19+를 요구함(2026-09-24 확인) | Inspector를 실행하려면 Node.js를 업그레이드하세요(서버는 20+에 머물러도 됩니다). |
| 2026-07-28 프로토콜만 쓰는 클라이언트가 연결하지 못함 | 서버는 개정판 2024-10-07부터 2025-11-25까지를 받아들임(MCP TypeScript SDK 1.30) | 이전 개정판을 지원하는 클라이언트를 쓰세요. Inspector는 그 [문서](https://modelcontextprotocol.io/docs/tools/inspector)에 따르면 레거시와 2026-07-28, 두 "시대"를 모두 협상합니다(2026-09-24 확인). |
| 인시던트 알림을 켜면 거부된 모든 MCP 호출이 알림이 됨 | 실패한 MCP 호출은 실패한 실행임 | `when: (event) => event.metadata?.agentId !== 'mcp:docs'`로 필터링하거나, 심각도를 낮추세요. |

### 무슨 일이 있었는지 읽기 {#reading-what-happened}

모든 호출과 모든 리소스 읽기는 하나의 실행입니다. 기본 파일 저장소에서는 실행 하나가 `events/` 폴더의 JSON 파일 하나입니다. 코드에서는 다음과 같습니다.

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

도구 호출은 `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`로 읽히고, 리소스 읽기는 `run.started → resource.read → run.completed`로 읽힙니다. 여기서 `resource.read`에는 URI, 크기, 제공한 내용의 SHA-256이 담깁니다. [이벤트 카탈로그](../reference/events)를 보세요.
