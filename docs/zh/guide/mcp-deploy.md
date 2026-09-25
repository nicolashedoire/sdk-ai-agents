# 部署、安全与排障

你的服务器已经在你的机器上运行起来了（[第一个服务器](./mcp-first-server)、[配方](./mcp-recipes)）。本页介绍如何通过 HTTP 共享它、如何让规则和人参与到流程中、安全检查清单，以及出问题时该怎么办。

## stdio 还是 HTTP？ {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| 如何运行 | AI 应用在同一台电脑上把你的服务器作为一个程序启动 | 你的服务器作为一个 Web 服务运行在某处 |
| 谁能使用它 | 那台电脑上的人 | 任何你给了地址和令牌的人 |
| 网络暴露面 | 无 | 一个需要保护的 HTTP 端点 |
| 最适合 | 个人工具、本地文件、试验 | 一个团队、全公司范围的 API 或数据库 |
| 启动方式 | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + MCP SDK 的 HTTP 传输 |

先从 stdio 开始。当多个人需要同一个服务器时，再迁移到 HTTP。

## 通过 HTTP 提供服务 {#serve-over-http}

官方的 MCP SDK 提供 HTTP 传输；`createMcpServer` 为它提供一个受治理的服务器。下面这个完整文件使用 Node 自带的 `http` 模块——不用任何 Web 框架——并且是**无状态的**：每个请求都会得到一个全新的 MCP 服务器，所以你可以在负载均衡器后面运行多个副本。

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

每项检查的用途：

| 检查 | 为什么 |
| --- | --- |
| 路径 `/mcp` | MCP 只用一个地址；其他一切都被拒绝。 |
| `Host` 请求头 | 否则你访问的某个网页可能会让你的浏览器去调用 `localhost` 上的服务器（“DNS 重绑定”）。部署之后，请改为列出你的公开主机名。 |
| Bearer 令牌 | 只有知道令牌的客户端才能进入。以恒定时间进行比较。请生成一个很长的随机令牌；不要把它写在代码里。 |
| 只允许 `POST` | 在无状态模式下，没有可以用 `GET` 打开的长连接流。 |
| 每个请求一个服务器 | 请求之间不共享任何东西；工具定义只构建一次并重复使用（再次定义同一个定义是允许的）。代价是：客户端的“取消”消息会作为另一个请求到达，无法到达它要取消的那次调用——改由关闭连接或 `approvalTimeoutMs` 来结束它。 |

这个文件只监听 `127.0.0.1`。要对外发布它，请把它放在一个终止 **HTTPS** 的反向代理之后（Caddy、nginx、你所用云平台的负载均衡器），并把你的主机名加入 `allowedHosts`。永远不要在网络上通过明文 HTTP 发送 bearer 令牌。

一个可运行的版本以 [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) 的形式提供（`MCP_TOKEN=… npm run example:mcp-http`）。它已经用一个真实的客户端核实过：没有令牌的调用得到 `401`，伪造的 `Host` 得到 `403`，而带有令牌的客户端可以列出并调用工具。

### 把客户端连接到 HTTP 服务器 {#connect-clients-to-an-http-server}

- **Claude Code**：`claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`。在共享的 `.mcp.json` 中，写 `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`：Claude Code 会展开环境变量，所以令牌不会出现在文件里。
- **你自己的智能体**：`connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })`——参见 [MCP 通俗解释](./mcp#use-the-tools-of-an-mcp-server-in-your-agents)。
- **其他应用**：在它们的文档中查找“remote MCP server”（远程 MCP 服务器）或“custom connector”（自定义连接器）。有些应用只接受使用 OAuth 登录的服务器，而不接受固定令牌。

## 治理：策略、预算、审批 {#governance-policies-budgets-approvals}

每一次 MCP 调用都以同一个身份运行，即 `mcp:<server name>`（用 `agentId` 可以修改它）。策略、预算和告警都可以像针对任何智能体一样针对它。各种策略请参见[受治理智能体](./governed-agents)。

为一个服务器设置**每日调用预算**：

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

当天的第 501 次调用会被拒绝，并附上策略的名称，这次拒绝会记录在事件日志中。一次调用在**开始时**就被计数——检查和计数在同一步中完成，所以 20 个同时发出的调用不可能全都钻过上限为 2 的限制——而且**无论结果如何**都会计数，失败的调用也算在内。预算是在进程内存中计数的：服务器重启时会从零开始，HTTP 服务器的每个副本各自计算自己的调用。在任何策略或预算之前，会先检查参数：无效的调用会被拒绝，既不计数，也不等待任何人。

### 审批：先由人来批准 {#approvals-a-human-says-yes-first}

在以下情况下，一个工具会在运行之前等待人工决定：

- 它的定义带有 `metadata: { requiresApproval: true }`——这是 `openApiTools` 写操作的默认设置；
- 或者某个策略要求审批，针对你指定的工具，而无需改动它们的定义：

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

在等待期间，这次调用会出现在 `sdk.getPendingApprovals()` 中。你的代码通过 `sdk.approveAction(id, who, reason)` 或 `sdk.rejectAction(id, who, reason)` 作出决定；两者都会被记录（`approval.requested`、`approval.approved` 或 `approval.rejected`）。stdio 服务器无法在自己的终端里询问——标准输入承载的是协议——所以决定来自另一个渠道。例如，本机上的一个小型管理端点，与服务器运行在同一个进程中。

**管理端点决定什么会被运行：请像保护 MCP 端点一样保护它。** 否则，你浏览器中打开的某个页面可能会访问到 `localhost`（DNS 重绑定）并替你批准。因此它只监听 `127.0.0.1`，只接受它自己的 `Host`，拒绝任何带有 `Origin` 的请求（浏览器会加上它；脚本和 `curl` 不会），并要求提供一个秘密请求头：

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

然后，`curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` 会列出正在等待的内容，而 `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` 则作出决定。以这种方式构建的一个完整服务器以 [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts) 的形式提供；它已经过端到端核实（一次调用会等待，伪造的 `Host`、带有 `Origin` 或缺少秘密的请求会得到 `403`/`401`，审批会让工具运行，并且当客户端离开时进程会退出）。

要在有审批等待时收到通知，请在 `approval.requested` 上添加一条[事故规则](./incidents#rules)，并配上 Slack 或邮件通知器。待处理的审批保存在调用所在进程的内存中：如果 HTTP 服务器有多个副本，请通过持有该审批的那个副本来作出决定（或者对需要审批的工具只运行一个副本）。

::: warning 待处理的审批能持续多久
许多客户端在大约一分钟后就会取消调用。在以下情况下，待处理的审批会被取消——工具也就永远不会运行：

- 客户端取消了调用（stdio，或有状态的 HTTP 会话）；
- 连接关闭了：退出的 stdio 客户端、被关闭的 HTTP 请求；
- 在 `approvalTimeoutMs` 内没有人作出决定——**默认 50 秒**，低于大多数客户端的等待时间。如果你的客户端等待得更久（例如调高了 `MCP_TOOL_TIMEOUT` 的 Claude Code），请在 `createMcpServer`/`serveMcpOverStdio` 上设置它。

**在无状态的 HTTP 服务器上，只有后两条适用**：它无法把一个“取消”请求与它要取消的那次调用对应起来。一个放弃了却没有关闭连接的客户端，会让审批一直处于待处理状态，直到 `approvalTimeoutMs`——而在这段时间内给出的“可以”仍然会运行工具，尽管已经没有人在等待答案。请让 `approvalTimeoutMs` 远低于客户端的等待时间（示例使用 20 秒），或者通过 stdio 或有状态会话来提供需要审批的工具。

一旦被取消，迟到的“可以”会以“already rejected”失败，而且审批之后还会再检查一次调用：如果客户端在此期间已经离开，工具就不会运行。通过 MCP 进行的审批适合快速的决定。对于需要几个小时才能作出的决定，请让工具*提交一个请求*，由你的团队稍后处理。
:::

大多数 MCP 应用也会在每次工具调用之前询问用户（Claude Desktop 默认如此）。那种确认发生在应用中；SDK 的审批则发生在你的服务器上，遵循你的规则，并被记录下来。对于任何会改动数据的操作，两者都要用上。

## 进度通知 {#progress-notifications}

客户端可以要求获知一次调用的进展：它随调用一起发送一个 `progressToken`（当你传入 `onprogress` 时，官方 TypeScript SDK 就会这样做）。随后，服务器会为这次调用的每一个事件——以及 `cognitiveAgentTool` 或 `governedAgentTool` 所启动的那次智能体运行的每一个事件——发送一条 `notifications/progress`，其中带有一个每次加一的 `progress` 和一条简短的 `message`：

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

消息会写出步骤、工具和认知操作的名称：模型选择的工具，以及智能体调用的每一个工具，包括服务器没有暴露的、属于该智能体的工具。对于用其上下文中的 `onEvent` 运行[研究](./studies)的工具，消息按环节来描述它（`study started`、`passage changes started`、`search in changes`、`report ready`），从不按查询来描述。消息从不携带参数、结果或错误文本。没有 `total`：没有人能预先知道一次运行需要多少步。每一条通知都在结果之前发送，从不在结果之后。通过 Streamable HTTP 时，它们在响应的流上传输（SSE）；用 `enableJsonResponse: true` 创建的传输以普通 JSON 作答，并会丢弃它们。不发送 `progressToken` 的客户端不会收到任何通知。

只会跟随一个工具所启动的那次智能体运行，只跟随一层：该智能体通过它自己的智能体工具启动的运行不会被跟随，在没有实时事件的存储上手动构建的智能体也不会。通知不会被合并：每一个事件都是一条通知，一次很长的认知运行可能会发送数百条通知。

进度通知会改变什么，又不会改变什么：

- **只有在收到进度时重置超时的客户端才会等待得更久。** 使用 TypeScript SDK 时：`client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`。一个显示进度但保持固定超时的客户端，会在与以前相同的时刻放弃。在依赖它之前，请先确认你的应用是怎么做的。
- **对于这样的客户端，起决定作用的是最长的一段静默**，而不是调用的时长：一次模型调用、一个缓慢的工具，或者一次审批。在工具运行期间或审批等待期间不会发送任何东西，所以 `approvalTimeoutMs` 的 50 秒仍然适用，而且每一次单独的模型调用或工具调用都必须在客户端的超时之内完成。
- **这样一来，智能体就可以运行得更久**：认知智能体的 `limits.timeoutMs` 可以超过客户端的超时，因为每一步都会发送通知。对于其他客户端，请保留[智能体配方](./mcp-recipes#an-agent-your-reasoning-twin)中那些较小的限制。

## 安全检查清单 {#security-checklist}

在共享一个服务器之前：

- [ ] **只暴露最少的东西。** 在 `tools` 中只列出需要的工具；优先使用只读来源；逐个添加写操作。
- [ ] **写操作需要人来批准。** 除非你有理由，否则在写工具上保留 `requiresApproval`，并把那个理由记录下来。
- [ ] **底层采用最小权限。** 只有只读范围的 API 令牌、只能 SELECT 的数据库角色、只包含可以共享内容的文件夹。服务器的检查是第二道锁，而不是第一道。
- [ ] **机密放在代码之外。** 令牌来自环境变量（`claude mcp add … -e TOKEN=…`），永远不要来自 spec、描述或文件。
- [ ] **结果是不可信的文本。** API、文档或数据库返回的内容会原封不动地到达模型——一个页面可能包含“忽略你的指令，然后……”。不要在同一次对话中既提供不可信的来源，又提供没有审批的强力写工具。
- [ ] **HTTP 服务器**：HTTPS、很长的随机令牌、`Host` 允许列表、在代理之后监听 `127.0.0.1`。
- [ ] **错误细节留在内部**（`exposeErrorDetails` 关闭，即默认值）。对输入的拒绝（错误的参数、文件夹之外的路径、不是查询的 SQL）仍然会向客户端解释。
- [ ] **预算**用在任何要花钱的东西上：智能体（模型调用）和付费 API。
- [ ] 在最初几天之后**阅读事件日志**：哪些工具被调用了，哪些调用被拒绝了。

MCP 项目维护着一份关于攻击与防御的详细指南：[Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)。

## 故障排查 {#troubleshooting}

| 症状 | 可能的原因 | 解决办法 |
| --- | --- | --- |
| 客户端立即断开连接，或者说服务器发送了无效的 JSON | 有东西写入了**标准输出**：你的代码或某个库中的 `console.log` | 使用 `console.error`（标准错误）。stdout 承载的是协议。 |
| `npx tsx server.ts` 打印一行后似乎卡住了 | 正常：stdio 服务器在等待客户端 | 用 [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector) 测试，或者接入一个应用。 |
| 服务器没有出现在 Claude Desktop 中 | 配置中的 JSON 有错误、使用了相对路径、应用没有重启 | 检查 JSON，使用绝对路径，退出并重启应用，阅读 `mcp*.log`（[在哪里](./mcp-first-server#_5-connect-it-to-claude-desktop)）。 |
| 日志中出现 `npx: command not found` / `node: not found` | 应用看不到你的 shell 的 `PATH`（使用 nvm 时很常见） | 使用 `npx` 的完整路径（`which npx` / `where npx`）。 |
| 列表中缺少某个工具 | 它不在 `tools` 中 | 把它的名称或定义加入 `tools`：否则什么都不会被暴露。 |
| 启动时出现 `Another tool named "x" is already defined` | 两个来源产生了同一个工具名称 | 给每个来源设置一个 `prefix`。 |
| 只有 `Tool execution failed: <name>`，没有更多信息 | 原因可能包含内部细节，所以被隐藏了 | 在事件日志中阅读这次运行，或者在开发时设置 `exposeErrorDetails: true`。 |
| 调用超时 | 工具很慢（通常是智能体） | 把智能体的 `limits` 调小；调高客户端的超时（Claude Code：`MCP_TOOL_TIMEOUT`）；或者使用一个在收到[进度通知](#progress-notifications)时重置超时的客户端。 |
| 结果被截断 | 大小限制（`truncated: true`）或客户端自己的限制 | 调高 `maxResponseBytes`、`maxRows`、`maxFileBytes`；Claude Code：`MAX_MCP_OUTPUT_TOKENS`。 |
| 写工具回复“Approval no decision within 50000 ms” | 没有人及时批准它 | 更快地批准（参见[审批](#approvals-a-human-says-yes-first)），调高 `approvalTimeoutMs`，或者有意设置 `requiresApproval: false`。 |
| `events/` 或 `golden-traces/` 这样的文件夹出现在意料之外的地方 | 事件日志没有使用绝对路径（或者 SDK 版本较旧） | 传入 `eventStore: new FileEventStore(<absolute path>)`。当前版本只在用到时才创建其他文件夹。 |
| `Cannot find module 'node:sqlite'` | Node.js 版本低于 22.13 | 升级 Node.js，或者使用 `better-sqlite3`。 |
| `… is not JSON. For a YAML spec, parse it yourself` | OpenAPI spec 是 YAML | 解析它（`yaml` 包），把得到的对象作为 `spec` 传入。 |
| `cannot resolve the server URL "/v3"` | spec 中是一个相对的服务器地址，而且它是从文件加载的 | 传入 `baseUrl`。 |
| Inspector 无法启动 | 它的[文档](https://modelcontextprotocol.io/docs/tools/inspector)要求 Node.js 22.19+（于 2026-09-24 核实） | 升级 Node.js 以运行 Inspector（你的服务器可以继续使用 20+）。 |
| 只支持 2026-07-28 协议的客户端无法连接 | 服务器接受 2024-10-07 到 2025-11-25 的修订版（MCP TypeScript SDK 1.30） | 使用支持较早修订版的客户端。根据 Inspector 的[文档](https://modelcontextprotocol.io/docs/tools/inspector)（于 2026-09-24 核实），它可以协商两个“时代”的协议：旧版和 2026-07-28。 |
| 开启事故告警后，每个被拒绝的 MCP 调用都变成了一条告警 | 失败的 MCP 调用就是一次失败的运行 | 用 `when: (event) => event.metadata?.agentId !== 'mcp:docs'` 过滤，或者降低它的严重级别。 |

### 查看发生了什么 {#reading-what-happened}

每一次调用和每一次资源读取都是一次运行。使用默认的文件存储时，每次运行是你的 `events/` 文件夹中的一个 JSON 文件；在代码中：

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

一次工具调用的顺序是 `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`；一次资源读取是 `run.started → resource.read → run.completed`，其中 `resource.read` 保存了所提供内容的 URI、大小和 SHA-256。参见[事件目录](../reference/events)。
