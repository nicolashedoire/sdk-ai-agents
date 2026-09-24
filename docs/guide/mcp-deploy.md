# Deploy, secure and troubleshoot

Your server works on your machine ([first server](./mcp-first-server), [recipes](./mcp-recipes)). This page covers sharing it over HTTP, putting rules and humans in the loop, the security checklist, and what to do when something does not work.

## stdio or HTTP?

| | stdio | Streamable HTTP |
| --- | --- | --- |
| How it runs | The AI app starts your server as a program on the same computer | Your server runs somewhere as a web service |
| Who can use it | The person on that computer | Anyone you give the address and a token to |
| Network exposure | None | An HTTP endpoint to protect |
| Best for | Personal tools, local files, trying things | A team, a company-wide API or database |
| Start it with | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + the MCP SDK's HTTP transport |

Start with stdio. Move to HTTP when several people need the same server.

## Serve over HTTP

The official MCP SDK provides the HTTP transport; `createMcpServer` gives it a governed server. This complete file uses Node's own `http` module — no web framework — and is **stateless**: every request gets a fresh MCP server, so you can run several copies behind a load balancer.

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
  // cannot tie to a call still in progress. A pending approval then ends when the client
  // closes the connection, or after `approvalTimeoutMs` (50 s by default) at the latest.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources });
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

What each check is for:

| Check | Why |
| --- | --- |
| Path `/mcp` | One address for MCP; everything else is refused. |
| `Host` header | A web page you visit could otherwise make your browser call a server on `localhost` ("DNS rebinding"). When deployed, list your public host name instead. |
| Bearer token | Only clients that know the token get in. Compared in constant time. Generate a long random one; keep it out of your code. |
| `POST` only | In stateless mode there is no long-lived stream to open with `GET`. |
| A server per request | Nothing is shared between requests; tool definitions are built once and reused (defining the same definition again is allowed). The price: a client's "cancel" message arrives as another request and cannot reach the call it cancels — closing the connection, or `approvalTimeoutMs`, ends it instead. |

The file listens on `127.0.0.1` only. To publish it, put it behind a reverse proxy that terminates **HTTPS** (Caddy, nginx, your cloud's load balancer), and add your host name to `allowedHosts`. Never send a bearer token over plain HTTP on a network.

A runnable version ships as [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) (`MCP_TOKEN=… npm run example:mcp-http`). It was checked with a real client: a call without the token gets `401`, a forged `Host` gets `403`, and a client with the token lists and calls the tools.

### Connect clients to an HTTP server

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. In a shared `.mcp.json`, write `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`: Claude Code expands environment variables, so the token stays out of the file.
- **Your own agents**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — see [MCP in plain words](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **Other applications**: look for "remote MCP server" or "custom connector" in their documentation. Some only accept servers that use OAuth sign-in rather than a fixed token.

## Governance: policies, budgets, approvals

Every MCP call runs under one identity, `mcp:<server name>` (change it with `agentId`). Policies, budgets and alerts can target it like any agent. See [Governed agents](./governed-agents) for every kind of policy.

**A daily budget of calls** for one server:

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

Call 501 of the day is refused with the policy's name, and the refusal is in the event log. A call is counted **when it starts** — checked and counted in one step, so 20 simultaneous calls cannot all slip under a limit of 2 — and it counts **whatever its outcome**, failures included. Budgets are counted in the memory of the process: they start again from zero when the server restarts, and each copy of an HTTP server counts its own calls. Before any policy or budget, the arguments are checked: an invalid call is refused without being counted or waiting for anyone.

### Approvals: a human says yes first

A tool waits for a human decision before running when:

- its definition has `metadata: { requiresApproval: true }` — the default for write operations of `openApiTools`;
- or a policy asks for it, for tools you name, without touching their definitions:

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

While it waits, the call appears in `sdk.getPendingApprovals()`. Your code decides with `sdk.approveAction(id, who, reason)` or `sdk.rejectAction(id, who, reason)`; both are recorded (`approval.requested`, `approval.approved` or `approval.rejected`). A stdio server cannot ask in its own terminal — standard input carries the protocol — so the decision comes from another channel. For example, a small admin endpoint on this machine, in the same process as the server.

**The admin endpoint decides what runs: protect it like the MCP endpoint.** A page open in your browser could otherwise reach `localhost` (DNS rebinding) and approve for you. So it listens on `127.0.0.1` only, accepts only its own `Host`, refuses any request carrying an `Origin` (browsers add one; scripts and `curl` do not) and requires a secret header:

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

Then `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` lists what waits, and `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` decides. A complete server built this way ships as [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts); it was checked end to end (a call waits, a forged `Host`, an `Origin` or a missing secret get `403`/`401`, the approval runs the tool, and the process exits when the client leaves).

To be told when an approval is waiting, add an [incident rule](./incidents#rules) on `approval.requested` with a Slack or email notifier. Pending approvals live in the memory of the process where the call waits: with several copies of an HTTP server, decide through the copy that holds it (or run a single copy for tools that need approval).

::: warning Nobody can approve a call whose client has left
Many clients cancel a call after about a minute. A pending approval is cancelled — and the tool never runs — when:

- the client cancels the call (stdio, or a stateful HTTP session);
- the connection closes: a stdio client that exits, an HTTP request that is closed;
- nobody decided within `approvalTimeoutMs` — **50 seconds by default**, below what most clients wait. Set it on `createMcpServer`/`serveMcpOverStdio` if your client waits longer (Claude Code with a raised `MCP_TOOL_TIMEOUT`). This is the only limit for a stateless HTTP server, which cannot tie a "cancel" request to the call it cancels.

A late "yes" then fails with "already rejected", and the call is checked once more after the approval: if the client left in between, the tool does not run. Approvals through MCP suit quick decisions. For decisions that take hours, make the tool *submit a request* that your team processes later.
:::

Most MCP applications also ask the user before each tool call (Claude Desktop does by default). That confirmation happens in the application; SDK approvals happen on your server, under your rules, and are recorded. Use both for anything that changes data.

## Security checklist

Before you share a server:

- [ ] **Expose the minimum.** List only the tools needed in `tools`; prefer read-only sources; add write operations one by one.
- [ ] **Writes need a human.** Keep `requiresApproval` on write tools unless you have a reason, and record that reason.
- [ ] **Least privilege underneath.** API tokens with read-only scopes, a SELECT-only database role, a folder that contains only what may be shared. The server's checks are a second lock, not the first.
- [ ] **Secrets outside the code.** Tokens come from environment variables (`claude mcp add … -e TOKEN=…`), never from the spec, the description or the file.
- [ ] **Results are untrusted text.** What an API, a document or a database returns reaches the model word for word — a page can contain "ignore your instructions and…". Do not give the same conversation both untrusted sources and powerful write tools without approval.
- [ ] **HTTP servers**: HTTPS, a long random token, a `Host` allowlist, listening on `127.0.0.1` behind the proxy.
- [ ] **Error details stay inside** (`exposeErrorDetails` off, the default). Refusals of the input (wrong argument, path outside the folder, SQL that is not a query) are still explained to the client.
- [ ] **Budgets** on anything that costs money: agents (model calls) and paid APIs.
- [ ] **Read the event log** after the first days: which tools are called, which calls are refused.

The MCP project maintains a detailed guide of attacks and defences: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The client disconnects at once, or says the server sent invalid JSON | Something writes to **standard output**: a `console.log` in your code or a library | Use `console.error` (standard error). Stdout carries the protocol. |
| `npx tsx server.ts` prints one line and seems stuck | Normal: a stdio server waits for a client | Test with the [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector), or connect an app. |
| The server does not appear in Claude Desktop | JSON error in the config, relative path, app not restarted | Check the JSON, use absolute paths, quit and restart the app, read `mcp*.log` ([where](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` in the logs | The app does not see your shell's `PATH` (common with nvm) | Use the full path of `npx` (`which npx` / `where npx`). |
| A tool is missing from the list | It is not in `tools` | Add its name or definition to `tools`: nothing is exposed otherwise. |
| `Another tool named "x" is already defined` at start-up | Two sources produce the same tool name | Give each source a `prefix`. |
| `Tool execution failed: <name>` and nothing more | The cause may contain internal details, so it is hidden | Read the run in the event log, or set `exposeErrorDetails: true` while developing. |
| Calls time out | The tool is slow (often an agent) | Smaller agent `limits`; raise the client's timeout (Claude Code: `MCP_TOOL_TIMEOUT`). |
| Results are cut | Size limits (`truncated: true`) or the client's own limit | Raise `maxResponseBytes`, `maxRows`, `maxFileBytes`; Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| A write tool answers "Approval no decision within 50000 ms" | Nobody approved it in time | Approve it quicker (see [approvals](#approvals-a-human-says-yes-first)), raise `approvalTimeoutMs`, or set `requiresApproval: false` deliberately. |
| Folders such as `events/` or `golden-traces/` appear in unexpected places | No absolute path for the event log (or an older SDK version) | Pass `eventStore: new FileEventStore(<absolute path>)`. Current versions create their other folders only when used. |
| `Cannot find module 'node:sqlite'` | Node.js older than 22.13 | Upgrade Node.js, or use `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | The OpenAPI spec is YAML | Parse it (`yaml` package) and pass the object as `spec`. |
| `cannot resolve the server URL "/v3"` | The spec has a relative server and was loaded from a file | Pass `baseUrl`. |
| The Inspector refuses to start | Its [documentation](https://modelcontextprotocol.io/docs/tools/inspector) asks for Node.js 22.19+ (checked on 2026-09-24) | Upgrade Node.js to run the Inspector (your server can stay on 20+). |
| A client that only speaks the 2026-07-28 protocol cannot connect | The server accepts revisions 2024-10-07 to 2025-11-25 (MCP TypeScript SDK 1.30) | Use a client that supports the earlier revisions. The Inspector negotiates both "eras", legacy and 2026-07-28, according to its [documentation](https://modelcontextprotocol.io/docs/tools/inspector) (checked on 2026-09-24). |
| With incident alerts on, every refused MCP call becomes an alert | A failed MCP call is a failed run | Filter with `when: (event) => event.metadata?.agentId !== 'mcp:docs'`, or lower its severity. |

### Reading what happened

Every call and every resource read is a run. With the default file store, each run is one JSON file in your `events/` folder; from code:

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

A tool call reads `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`; a resource read `run.started → resource.read → run.completed`, where `resource.read` holds the URI, the size and the SHA-256 of what was served. See the [event catalog](../reference/events).
