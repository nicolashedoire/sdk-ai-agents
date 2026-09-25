# Tools

A **tool** is a function an agent can call: look up an order, read a file, search the Web, ask another agent. You write your own, or take them ready-made from a **tool source**: a folder, a database, a web API, the Web, an agent or an MCP server.

Whatever its origin, every call is **governed**. It must be one of the caller's tools, its arguments are checked, policies and budgets apply, a human can be asked to approve it, failures can be retried, and everything is written to the event log.

## In one line

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

The agent can now list, read and search the handbook, and search and read the Web: eight tools, all read-only.

## Your own tools

`sdk.defineTool` registers a tool in the SDK and returns it. The zod schema describes the arguments; the handler receives them validated and typed.

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

| Field | |
| --- | --- |
| `name`, `description` | What the model sees and decides from. Use letters, digits, `_` and `-`, up to 64 characters: model APIs and MCP clients may refuse other names. |
| `schema` | The arguments, as a zod schema; `.describe()` texts are shown to the model. A call that does not match is refused before any policy, approval or budget. |
| `handler(params, context?)` | Your code. `context` holds `runId`, `agentId`, `signal` (aborted when the caller gives up) and `onEvent` (set when the caller watches the call live). |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`: see [How calls are governed](#how-calls-are-governed). None by default. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`, for idempotent tools only. |
| `version` | `1.0.0` by default. It is part of the agent's configuration hash, so runs before and after a change can be [compared](../reference/sdk-api#comparisons-and-impact). |
| `capability` | A label for grouping; the built-in sources set one (`web:search`, `folder:handbook`…). |

A name is registered once per SDK: `sdk.defineTool` throws for a name already taken, whatever the version. Give each source a prefix when two could clash. Every field is in the [SDK API](../reference/sdk-api#tools-tooldefinition).

## The built-in tool sources

Each source returns tool definitions, ready for `sdk.defineTool` (`connectMcpServer` in its `tools`). Each can rename its tools: a prefix (`prefix`; `toolPrefix` for MCP), or the whole name of an agent's tool (`name`).

| Source | The agent can | Tool names | Risk, read-only | Needs | Details |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | List, read and search the text files of one folder, never outside it | `list_files`, `read_file`, `search_files` | low, read-only | A folder | [A folder of documents](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | List the tables, describe one, run one read-only query: `SELECT`, `WITH … SELECT` or `VALUES` (at most 100 rows by default) | `list_tables`, `describe_table`, `query` | medium, read-only | `sqliteReadOnly(db)` (`node:sqlite` or `better-sqlite3`) or `postgresReadOnly({ pool })` (`pg`) | [A read-only database](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Call a web API, one tool per operation: the `GET` operations by default; `include` replaces them with the operations it lists, the only way to get writes | The `operationId`, else method and path (`get_pets_petId`) | `GET`: low, read-only. Others: high, approval required | An OpenAPI 3 description (URL, file or object) | [A web API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Search the Web, read a page or a PDF, search arXiv, Wikipedia and GitHub | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` medium, the others low; all read-only | Nothing to start (DuckDuckGo); `unpdf` for PDFs; a GitHub token to search code | [Web research](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | Ask another agent: a governed agent answers a `message`, a cognitive agent reasons about a `problem` and returns its decision | `ask_<agent name>` | medium, not marked read-only | An agent, so a model key | [An agent](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | Use the tools of any MCP server | The server's names, after `toolPrefix` | None set: `metadata` applies to every imported tool | `@sdk-ai-agents/core/mcp` and `@modelcontextprotocol/sdk`; `close()` when done | [Use the tools of an MCP server](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

Two things differ for MCP tools: the SDK only checks that their arguments form an object (the server checks the rest), and the server's own hints, such as read-only, are not imported: set `metadata` yourself.

## Giving tools to an agent

`createAgent({ tools })` and `createCognitiveAgent({ tools })` take tools, so pass a source's definitions through `sdk.defineTool` first, as above. An agent can run **only its own tools**, those of `tools` and of its `capabilities`: any other tool the model names is refused (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

`defineTool`, imported from the package, builds a tool without registering it: the SDK registers it when an agent that uses it is created. If a tool of that name is already registered, the registered one is kept and runs.

### Capabilities

A capability names a group of tools to give to several agents. The `capability` label of a tool is not one: define it with `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### Outside an agent

`sdk.listTools()` returns every tool registered in the SDK. `sdk.executeTool(name, parameters, options?)` calls one through the same governed pipeline, as its own run (agent id `external` unless you give `agentId`), and returns what the handler returned:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

Its options: `runId` records the call inside an existing run, `allowedTools` limits what this caller may run, `signal` cancels it, `approvalTimeoutMs` bounds the wait for an approval, and `onEvent` watches the call live. A refusal throws a `PolicyViolationError`; invalid arguments and a failing handler throw a `ToolExecutionError`.

The same tools serve elsewhere. A [study](./studies#research-through-your-sources) takes the **names** of defined tools as its `sources`, and an MCP server serves the definitions or names you give it to Claude Desktop, Claude Code or any MCP client (see [An MCP server for anything](./mcp-recipes)).

## How calls are governed

A call goes through these steps, in this order, and stops at the first refusal:

1. **The caller's tools.** A tool the caller was not given is refused: an agent's tools, a study's sources, an MCP server's list, or `allowedTools`. `executeTool` without `allowedTools` can run any registered tool.
2. **The arguments**, checked against the schema, before anyone is asked anything.
3. **The policies**: every global policy and every policy of the agent (see [Governed agents](./governed-agents#_3-policies)).
4. **The approval**, when the tool or a policy asks for one. A call that any policy refuses is refused without asking for an approval: an approval never overrides a deny, an allowlist or a budget.
5. **The budget**: the call is counted when it starts, whatever its outcome.
6. **The tool runs**, with its retries.

### Risk levels

`riskLevel` is a label: it tells people and code how careful to be. **No policy reads it**, and it neither blocks nor slows a call. To act on it, give a tool `requiresApproval`, or turn the label into a policy:

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

The list is taken when the policy is defined: define the tools first.

### Approvals

A call waits for a human when the tool has `requiresApproval: true` (the default of `openApiTools` for write operations) or a policy rule says `require_approval`. It appears in `sdk.getPendingApprovals()`; `sdk.approveAction(id, who, reason?)` lets it run, `sdk.rejectAction(id, who, reason?)` refuses it. A call that any policy refuses is refused without asking for an approval: an approval never overrides a deny, an allowlist or a budget. If the caller gives up first (a stopped run, an aborted `signal`, `approvalTimeoutMs`, 50 s by default on MCP servers), the approval is cancelled and the tool never runs. See [Approvals](./mcp-deploy#approvals-a-human-says-yes-first).

### Read-only tools

`readOnly: true` says that the tool changes nothing. MCP clients see it as `readOnlyHint`, and `openApiTools` retries only read-only operations. It relaxes no policy and is not verified: a handler marked read-only that writes still writes. The sources that only read enforce it where they can: `folderTools` has no way to write, and `sqliteReadOnly` and `postgresReadOnly` run each query read-only in the database itself.

### Retries

`retry` runs a failing handler again: only the handler's errors, never invalid arguments or a refusal. Each retry is a `tool.retry` event, and the call counts once in its budget. `openApiTools`, `webTools` and `connectMcpServer` take a `retry` option for their tools. See [Retries & fallback](./resilience#tools).

### Budgets

A `budget` policy with a `budgetLimit` caps tool calls per period, for one agent (`agentId`), one tool (`toolName`) or all:

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

A `budgetLimit` can also cap `maxTokens` and `maxCost`, counted on the model calls: once the period's usage exceeds a cap, tool calls are refused, and `maxCost` also refuses them as soon as a call's cost is unknown (a model without a price, a call without token counts). See [API costs](./costs#budgets).

### Untrusted output

What a tool returns goes back to the model, and a page, a file or an API answer can hold instructions written for it (prompt injection). The web tools mark every answer `untrusted: true`, and their descriptions tell the model never to follow instructions found in it. The other sources return their content as it is. Say in the system prompt that tool results are data, give each agent only the tools it needs, and protect the tools that change things with approvals. A study shows every result to its model as data. See [the web tools' security rules](./web-research#security-rules).

### What a call records

| Event | When |
| --- | --- |
| `action.executing` | The call is proposed, before any check |
| `policy.checked` | Each policy checked, then the verdict |
| `policy.violated` | A refusal: a tool the caller was not given (`allowed-tools`), a policy, a spent budget |
| `approval.requested`, `approval.approved`, `approval.rejected` | The human decision |
| `tool.called` | The handler starts |
| `tool.retry` | A retry, with its delay and the error |
| `action.executed`, `action.failed` | The result or the error (invalid arguments included), with the duration |

A call made with `executeTool` is a run of its own, unless you give `runId`: `run.started` (mode `tool`), then `run.completed` or `run.failed`. See the [event catalog](../reference/events#reasoning-and-actions).

## Choosing a source

| I need… | Use |
| --- | --- |
| My own code or service | `sdk.defineTool` |
| Documents in a folder | `folderTools` |
| Answers from a SQL database, read-only | `databaseTools` with `sqliteReadOnly` or `postgresReadOnly`; for PostgreSQL, also connect with a role that can only read |
| A web API that publishes an OpenAPI description | `openApiTools` |
| A web API without one | `sdk.defineTool`, with `fetch` in the handler |
| The Web, papers, encyclopedia articles, code on GitHub | `webTools` |
| Another agent's answer or decision | `governedAgentTool` or `cognitiveAgentTool` |
| A system that already has an MCP server | `connectMcpServer` |
| Sources for a study | The search tools of `webTools`, or of an MCP server |
| My tools in Claude Desktop or Claude Code | The other direction: [an MCP server](./mcp-recipes) |
