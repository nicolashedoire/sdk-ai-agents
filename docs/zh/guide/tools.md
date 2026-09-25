# 工具

**工具**是智能体可以调用的一个函数：查询一个订单、读取一个文件、搜索 Web、询问另一个智能体。你可以自己编写工具，也可以从**工具源**获取现成的工具：一个文件夹、一个数据库、一个 Web API、整个 Web、一个智能体或一个 MCP 服务器。

无论工具来自哪里，每一次调用都是**受治理**的：被调用的工具必须属于调用方，参数会被检查，策略和预算都适用，可以请人来审批这次调用，失败可以重试，而一切都会写入事件日志。

## 一行代码 {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

现在，这个智能体可以列出、读取和搜索员工手册，还可以搜索和阅读 Web：一共八个工具，全部只读。

## 你自己的工具 {#your-own-tools}

`sdk.defineTool` 在 SDK 中注册一个工具并返回它。zod schema 描述参数；处理函数收到的参数已经过验证，并且带有类型。

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

| 字段 | |
| --- | --- |
| `name`、`description` | 模型看到的内容，它据此做出决定。请使用字母、数字、`_` 和 `-`，最多 64 个字符：模型 API 和 MCP 客户端可能会拒绝其他名称。 |
| `schema` | 参数，以 zod schema 表示；`.describe()` 中的文本会展示给模型。不匹配的调用会在任何策略、审批或预算之前被拒绝。 |
| `handler(params, context?)` | 你的代码。`context` 包含 `runId`、`agentId`、`signal`（当调用方放弃时被中止）和 `onEvent`（当调用方实时观察这次调用时被设置）。 |
| `metadata` | `riskLevel`（`low`、`medium`、`high`）、`requiresApproval`、`readOnly`、`category`：参见[调用如何受治理](#how-calls-are-governed)。默认一个都不设置。 |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`，仅适用于幂等的工具。 |
| `version` | 默认为 `1.0.0`。它是智能体配置哈希的一部分，因此可以[比较](../reference/sdk-api#comparisons-and-impact)变更前后的运行。 |
| `capability` | 用于分组的标签；内置的工具源会设置它（`web:search`、`folder:handbook`……）。 |

每个名称在一个 SDK 中只能注册一次：对于已被占用的名称，无论版本如何，`sdk.defineTool` 都会抛出错误。当两个工具源的名称可能冲突时，请给每个工具源加一个前缀。所有字段都列在 [SDK API](../reference/sdk-api#tools-tooldefinition) 中。

## 内置的工具源 {#the-built-in-tool-sources}

每个工具源都返回工具定义，可以直接交给 `sdk.defineTool`（`connectMcpServer` 则把它们放在返回结果的 `tools` 中）。每个工具源都可以给它的工具改名：加一个前缀（`prefix`；MCP 用 `toolPrefix`），或者为智能体的工具指定完整的名称（`name`）。

| 工具源 | 智能体可以 | 工具名称 | 风险、只读 | 需要 | 详情 |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | 列出、读取和搜索一个文件夹中的文本文件，从不越出该文件夹 | `list_files`、`read_file`、`search_files` | 低，只读 | 一个文件夹 | [一个文档文件夹](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | 列出表、描述其中一张表、运行一条只读查询：`SELECT`、`WITH … SELECT` 或 `VALUES`（默认最多返回 100 行） | `list_tables`、`describe_table`、`query` | 中，只读 | `sqliteReadOnly(db)`（`node:sqlite` 或 `better-sqlite3`）或 `postgresReadOnly({ pool })`（`pg`） | [一个只读数据库](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | 调用一个 Web API，每个操作一个工具：默认是 `GET` 操作；`include` 会用它列出的操作取代它们，这是获得写操作的唯一方式 | `operationId`，没有时则是方法加路径（`get_pets_petId`） | `GET`：低，只读。其他：高，需要审批 | 一份 OpenAPI 3 描述（URL、文件或对象） | [一个 Web API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | 搜索 Web，阅读一个网页或一份 PDF，搜索 arXiv、Wikipedia 和 GitHub | `web_search`、`web_fetch`、`arxiv_search`、`wikipedia_search`、`github_search` | `web_fetch` 为中，其他为低；全部只读 | 起步什么都不需要（DuckDuckGo）；读取 PDF 需要 `unpdf`；搜索代码需要一个 GitHub 令牌 | [Web 调研](./web-research) |
| `governedAgentTool(agent)`、`cognitiveAgentTool(agent)` | 询问另一个智能体：受治理智能体回答一条 `message`，认知智能体针对一个 `problem` 进行推理并返回它的决策 | `ask_<agent name>` | 中，未标记为只读 | 一个智能体，因此需要一个模型密钥 | [一个智能体](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | 使用任何 MCP 服务器的工具 | 服务器自己的名称，前面加上 `toolPrefix` | 不设置：`metadata` 会应用到每一个导入的工具 | `@sdk-ai-agents/core/mcp` 和 `@modelcontextprotocol/sdk`；用完后调用 `close()` | [使用 MCP 服务器的工具](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

MCP 工具有两点不同：SDK 只检查它们的参数是否构成一个对象（其余的由服务器检查）；服务器自己给出的提示（例如只读）不会被导入：请自己设置 `metadata`。

## 把工具交给智能体 {#giving-tools-to-an-agent}

`createAgent({ tools })` 和 `createCognitiveAgent({ tools })` 接受的是工具，所以请像上面那样，先让工具源的定义经过 `sdk.defineTool`。智能体**只能运行它自己的工具**，即 `tools` 中的工具和它的 `capabilities` 带来的工具：模型点名的任何其他工具都会被拒绝（`allowed-tools`）。

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

从包中导入的 `defineTool` 只构建工具，并不注册它：SDK 会在创建使用它的智能体时注册它。如果同名的工具已经注册，保留并运行的是已注册的那一个。

### 能力 {#capabilities}

能力为一组工具命名，以便把它们交给多个智能体。工具的 `capability` 标签并不是能力：能力要用 `sdk.defineCapability` 来定义。

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### 在智能体之外 {#outside-an-agent}

`sdk.listTools()` 返回 SDK 中注册的每一个工具。`sdk.executeTool(name, parameters, options?)` 经过同样受治理的流程调用其中一个工具，作为一次独立的运行（除非你提供 `agentId`，否则智能体 id 为 `external`），并返回处理函数返回的内容：

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

它的选项：`runId` 把这次调用记录在一次已有的运行中，`allowedTools` 限制这个调用方可以运行的工具，`signal` 取消调用，`approvalTimeoutMs` 限制等待审批的时间，`onEvent` 实时观察这次调用。拒绝会抛出 `PolicyViolationError`；无效参数和失败的处理函数会抛出 `ToolExecutionError`。

同样的工具也能用在别处。[研究](./studies#research-through-your-sources)把已定义工具的**名称**作为它的 `sources`，而 MCP 服务器会把你交给它的工具定义或名称提供给 Claude Desktop、Claude Code 或任何 MCP 客户端（参见[把任何系统变成 MCP 服务器](./mcp-recipes)）。

## 调用如何受治理 {#how-calls-are-governed}

一次调用会按以下顺序经过这些步骤，并在第一次拒绝处停止：

1. **调用方的工具。** 没有交给调用方的工具会被拒绝：调用方的工具是指智能体的工具、研究的来源、MCP 服务器的列表或 `allowedTools`。不带 `allowedTools` 的 `executeTool` 可以运行任何已注册的工具。
2. **参数**：对照 schema 检查，在向任何人询问任何事情之前进行。
3. **策略**：每一条全局策略，以及智能体的每一条策略（参见[受治理智能体](./governed-agents#_3-policies)）。
4. **审批**：当工具或某条策略要求审批时。任何一条策略拒绝的调用都会直接被拒绝，不会请求审批：审批永远不会推翻拒绝、允许列表或预算。
5. **预算**：调用在开始时就被计数，无论结果如何。
6. **工具运行**，连同它的重试。

### 风险等级 {#risk-levels}

`riskLevel` 是一个标签：它告诉人和代码需要多小心。**没有任何策略会读取它**，它既不会拦截调用，也不会减慢调用。要让它起作用，请给工具加上 `requiresApproval`，或者把这个标签变成一条策略：

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

这份列表是在定义策略的那一刻取得的：请先定义工具。

### 审批 {#approvals}

当工具带有 `requiresApproval: true`（`openApiTools` 对写操作的默认设置），或者某条策略规则写着 `require_approval` 时，调用会等待人来决定。它会出现在 `sdk.getPendingApprovals()` 中；`sdk.approveAction(id, who, reason?)` 让它运行，`sdk.rejectAction(id, who, reason?)` 拒绝它。任何一条策略拒绝的调用都会直接被拒绝，不会请求审批：审批永远不会推翻拒绝、允许列表或预算。如果调用方先放弃了（运行被停止、`signal` 被中止、`approvalTimeoutMs` 到期，它在 MCP 服务器上默认为 50 秒），审批就会被取消，工具永远不会运行。参见[审批](./mcp-deploy#approvals-a-human-says-yes-first)。

### 只读工具 {#read-only-tools}

`readOnly: true` 表示这个工具不改变任何东西。MCP 客户端看到的是 `readOnlyHint`，而 `openApiTools` 只重试只读操作。它不会放宽任何策略，也不会被验证：一个标记为只读、实际却会写入的处理函数照样会写入。只做读取的工具源会在能做到的地方强制执行只读：`folderTools` 根本没有写入的途径，`sqliteReadOnly` 和 `postgresReadOnly` 则让数据库本身以只读方式运行每一条查询。

### 重试 {#retries}

`retry` 会再次运行失败的处理函数：只针对处理函数的错误，从不针对无效参数或拒绝。每一次重试都是一个 `tool.retry` 事件，而这次调用在预算中只算一次。`openApiTools`、`webTools` 和 `connectMcpServer` 都接受一个 `retry` 选项，用于它们的工具。参见[重试与回退](./resilience#tools)。

### 预算 {#budgets}

带 `budgetLimit` 的 `budget` 策略按时间段为工具调用设置上限，可以针对一个智能体（`agentId`）、一个工具（`toolName`）或全部：

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

`budgetLimit` 还可以为 `maxTokens` 和 `maxCost` 设置上限，它们统计的是模型调用：一旦该时间段的用量超过某个上限，工具调用就会被拒绝；而只要有一次调用的成本未知（模型没有价格、调用没有报告 token 数），`maxCost` 也会拒绝工具调用。参见 [API 成本](./costs#budgets)。

### 不可信的输出 {#untrusted-output}

工具返回的内容会回到模型那里，而一个网页、一个文件或一个 API 应答中可能含有专门写给模型的指令（prompt 注入）。Web 工具会把每个应答都标记为 `untrusted: true`，它们的描述也会告诉模型绝不要遵循其中出现的指令。其他工具源则按原样返回内容。请在系统提示中说明工具的结果是数据，只给每个智能体它需要的工具，并用审批来保护会改变东西的工具。研究会把每个结果作为数据展示给它的模型。参见 [Web 工具的安全规则](./web-research#security-rules)。

### 一次调用记录了什么 {#what-a-call-records}

| 事件 | 何时 |
| --- | --- |
| `action.executing` | 调用被提出时，在任何检查之前 |
| `policy.checked` | 每检查一条策略记录一次，最后是判定 |
| `policy.violated` | 一次拒绝：调用方没有得到的工具（`allowed-tools`）、一条策略、一个已用完的预算 |
| `approval.requested`、`approval.approved`、`approval.rejected` | 人的决定 |
| `tool.called` | 处理函数开始运行 |
| `tool.retry` | 一次重试，附带它的延迟和错误 |
| `action.executed`、`action.failed` | 结果或错误（包括无效参数），附带耗时 |

用 `executeTool` 发起的调用本身就是一次运行，除非你提供了 `runId`：先是 `run.started`（模式为 `tool`），然后是 `run.completed` 或 `run.failed`。参见[事件目录](../reference/events#reasoning-and-actions)。

## 选择工具源 {#choosing-a-source}

| 我需要…… | 使用 |
| --- | --- |
| 我自己的代码或服务 | `sdk.defineTool` |
| 一个文件夹里的文档 | `folderTools` |
| 以只读方式从 SQL 数据库得到答案 | `databaseTools` 配合 `sqliteReadOnly` 或 `postgresReadOnly`；对于 PostgreSQL，还要用一个只能读取的角色来连接 |
| 一个发布了 OpenAPI 描述的 Web API | `openApiTools` |
| 一个没有 OpenAPI 描述的 Web API | `sdk.defineTool`，在处理函数中使用 `fetch` |
| Web、论文、百科文章、GitHub 上的代码 | `webTools` |
| 另一个智能体的回答或决策 | `governedAgentTool` 或 `cognitiveAgentTool` |
| 一个已经有 MCP 服务器的系统 | `connectMcpServer` |
| 研究的来源 | `webTools` 的搜索工具，或者某个 MCP 服务器的搜索工具 |
| 在 Claude Desktop 或 Claude Code 中使用我的工具 | 方向相反：[一个 MCP 服务器](./mcp-recipes) |
