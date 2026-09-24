# 把任何系统变成 MCP 服务器

每个配方都能**用一行代码**把一类系统安全地变成 MCP 服务器。它们的工作方式都一样：由一个**工具源**构建工具（有时还有资源），再由 `serveMcpOverStdio` 对外提供它们。

| 你想对外提供 | 那一行代码 | 模型得到的工具 |
| --- | --- | --- |
| [你编写的函数](#a-function) | `sdk.defineTool({ … })` | 你自己的工具 |
| [一个 Web API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | 每个操作一个，默认只读 |
| [一个文档文件夹](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`、`read_file`、`search_files`（+ 资源） |
| [一个只读数据库](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`、`describe_table`、`query` |
| [一个智能体](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |

刚接触 MCP？请从 [5 分钟搭建你的第一个 MCP 服务器](./mcp-first-server)开始：它展示了如何运行服务器、用 Inspector 测试它，以及把它接入 Claude Desktop 或 Claude Code。下面的每个文件都以同样的方式运行和接入。

## 所有配方共用的骨架 {#the-skeleton-every-recipe-shares}

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

`tools` 接受**工具定义**（即下面这些工具源返回的东西——SDK 会替你定义它们），以及你自己用 `sdk.defineTool` 定义的工具的**名称**。除此之外，任何东西都不会被暴露。`resources`（可选）接受文档提供者，文件夹配方会用到它。

无论来源是什么，每一次调用都要按以下顺序经过同样的检查——参数、[策略](./mcp-deploy#governance-policies-budgets-approvals)、审批、预算——并写入事件日志。无效的调用会在请任何人审批之前就被拒绝。

## 一个函数 {#a-function}

最简单的来源：你编写的一个函数，就像[第一个服务器](./mcp-first-server)中那样。

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

| 字段 | 用途 |
| --- | --- |
| `name` | 模型调用时使用的名称。请使用字母、数字、`_` 和 `-`，最多 64 个字符（MCP 客户端可能会拒绝其他名称）。 |
| `description` | 用通俗的话说明何时使用这个工具。模型根据它来做决定。 |
| `schema` | 参数，以 zod schema 表示。`.describe()` 中的文本会展示给模型。不匹配的调用会被拒绝。 |
| `handler` | 你的代码。它接收经过验证的参数，以及一个带有 `signal` 的上下文（当客户端放弃时中止）。 |
| `metadata.readOnly` | “这个工具不会改变任何东西”：以 `readOnlyHint` 的形式展示给客户端。 |
| `metadata.requiresApproval` | 每次调用都要等待人工决定（参见[审批](./mcp-deploy#approvals-a-human-says-yes-first)）。 |
| `retry` | 失败时重试，仅适用于幂等的工具（`retryOn` 可以缩小重试哪些失败的范围；无效参数从不重试）。 |

## 一个 Web API，基于它的 OpenAPI 描述 {#a-web-api-from-its-openapi-description}

**它做什么。** 许多 API 都会发布一份机器可读的端点描述，称为 **OpenAPI** 文档（通常是 `openapi.json`）。`openApiTools` 读取它，并把**每个操作变成一个工具**：模型能看到操作的摘要和参数，调用这个工具就会调用该 API。

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**默认只读。** 只有 `GET` 操作会变成工具。要加入一个会改变东西的操作（`POST`、`PUT`、`PATCH`、`DELETE`），请用它的 `operationId` 把它列出来：

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

被列出的写操作会被标记为**高风险**并**需要审批**：每一次调用都会等待，直到有人批准（参见[审批](./mcp-deploy#approvals-a-human-says-yes-first)）。如果要在没有审批的情况下信任它，请明确说明：`metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`。

### 选项 {#options}

| 选项 | 默认值 | |
| --- | --- | --- |
| `spec` | — | 一个 URL（`https://…`）、一个文件路径，或者一个你已经解析好的对象。仅支持 JSON；如果是 YAML，请自行解析（例如用 `yaml` 包），再传入这个对象。 |
| `baseUrl` | `servers` 的第一项 | 请求发往哪里。相对的服务器 URL 会相对于 spec 的 URL 来解析。 |
| `headers` | — | 添加到每个请求中（身份认证）。从不展示给模型，并且会覆盖任何请求头参数。需要设置 `baseUrl`（除非 spec 是从该 API 自己的源下载的），并且 API 和 spec 都必须使用 https（只有在本机上才允许 http）。 |
| `include` | GET 操作 | 要暴露的 `operationId`。一旦给出，它就会**取代**默认的 GET：只有列出的操作才会变成工具。这是暴露写操作的唯一方式。未知的 id 会报错。 |
| `exclude` | — | 要排除的 `operationId`。 |
| `tags` | — | 只包含带有其中某个标签的操作。 |
| `prefix` | — | 工具名称的前缀（`crm_getCustomer`），用于组合多个 API。 |
| `metadata` | GET：低风险、只读 · 其他：高风险、需审批 | `(operation) => ToolMetadata`。你设置的每个字段都会替换默认值；省略的字段——或设为 `undefined` 的字段——保持默认值不变，所以只有显式的 `requiresApproval: false` 才能去掉审批。 |
| `retry` | — | 仅对只读操作重试（即 GET，除非 `metadata` 另有说明），重试的情形为服务器错误（5xx）、429、超时和网络故障——从不针对 4xx 响应或无效参数重试。 |
| `timeoutMs` | `30000` | 每个请求（以及下载 spec）的超时。 |
| `maxResponseBytes` | `100000` | 更长的响应会被截断，并标记为 `truncated: true`。 |
| `maxSpecBytes` | `10000000` | 接受的最大 spec 大小。 |
| `fetch` | 全局 `fetch` | 你自己的 HTTP 函数（代理、测试）。 |

### 模型看到的内容 {#what-the-model-sees}

对于 Petstore 的 `getPetById`，客户端收到的是：

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

工具名称来自 `operationId`（会被转换为合法名称：`show pet!` 变成 `show_pet`；没有 `operationId` 的操作变成 `get_pets_petId`；重名的会加上 `_2`）。参数是扁平的：每个路径参数、查询参数和请求头参数各一个，再加上用于 JSON 请求体的 `body`。一次调用返回 HTTP 状态码和解析后的响应体：

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### 安全规则 {#security-rules}

1. **默认只读**：只有 `GET`；其他任何操作都必须在 `include` 中列出，并且除非你另有说明，否则需要审批。
2. **模型无法更换主机，也无法沿路径向上走。** 基础 URL 由你决定。路径参数的值不能包含 `/`、`\` 或 `.` / `..` 段——即使经过百分号编码（一次或多次，无论是否紧挨着格式错误的转义序列），因为有些服务器和代理会解码 `%2F`——所以 `../../admin` 会被拒绝；最终的 URL 还会被检查，确保它仍在基础 URL 之下。在这些限制之内，由模型选择具体的值：哪个客户、哪个订单。
3. **参数先于一切被检查**：在策略和审批之前（无效的调用永远不会等待人工决定），然后在构建请求时再检查一次。未知参数和缺失的必需参数会被拒绝；值必须是字符串、数字或布尔值（查询参数可以是它们的列表）；请求头的值不能包含换行符。
4. **你的凭据只会去往你决定的地方**：`headers` 由服务器添加，会覆盖请求头参数，并且不会出现在模型能读到的任何地方。使用 `headers` 时，由 spec 文件指定的服务器会被拒绝——请传入 `baseUrl`——除非 spec 是从该 API 自己的源下载的；而且除了在本机上（`localhost`、`127.0.0.1`、`[::1]`），`http:` 都会被拒绝——无论是对 API，还是对下载 spec，因为一份在传输途中被篡改的 spec 可能会加入你的凭据会授权的操作。
5. **有上限**：每个请求都有超时，响应在 `maxResponseBytes` 处截断，spec 有大小限制。
6. **不跟随重定向**（重定向可能会把你的 `Authorization` 请求头带到另一个网站）：`3xx` 响应被视为错误，自定义 `fetch` 擅自跟随了的重定向也同样如此。
7. **错误就是错误**：非 `2xx` 状态码会让调用失败，并附上状态码和响应体的开头部分。除非你设置 `exposeErrorDetails: true`，否则 MCP 客户端只会看到“Tool execution failed”（响应体可能包含内部细节）；事件日志中始终有完整的错误。
8. **每个 GET 都被宣告为只读**（`readOnlyHint`）。有些 API 的 GET 带有副作用（`GET /send-reminder`）：请用 `exclude` 把它们排除，或者为它们把 `metadata` 设为 `readOnly: false, requiresApproval: true`。
9. **庞大的描述也有上限**：`$ref` 展开对每个操作和整个 spec 都有预算，大于 64,000 个字符的工具 schema 会被替换为它的描述。

### 完整文件 {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts)，使用已安装包的导入方式：

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

请通过客户端的环境变量传入令牌，永远不要写在文件里：`claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`。

### 它不做什么 {#what-it-does-not-do}

- **仅支持 OpenAPI 3.x**：Swagger 2.0 会被拒绝（请先转换，例如用 `swagger2openapi`）。YAML 不会替你解析。
- **仅支持 JSON 请求体**：需要 `multipart/form-data` 或表单请求体的操作会被排除（如果你列出了它则会被拒绝）；其他类型的可选请求体不会提供。Cookie 参数会被排除。
- **没有登录流程**：请在 `headers` 中传入令牌；不处理 OAuth。
- **仅支持本地引用**：指向其他文件或 URL 的 `$ref` 不会被解析（它们会变成“任意值”）；引用自身的 schema 会在循环处被截断。
- 不会根据 spec 检查响应，不会跟随分页，并且除非你传入 `baseUrl`，否则只使用 spec 中的第一个服务器。

## 一个文档文件夹 {#a-folder-of-documents}

**它做什么。** 提供一个文件夹中的文本文件——员工手册、笔记、代码库、导出的文档——并配有三个工具：**列出**文件、**读取**其中一个、在其中**搜索**一段文本。同样的文件还会作为**资源**提供，用户可以自己把它们附加到对话中。

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### 选项 {#options-1}

`folderTools` 和 `folderResources` 接受相同的选项（工具还多一个 `prefix`）：

| 选项 | 默认值 | |
| --- | --- | --- |
| `root` | — | 这个文件夹。请使用绝对路径：客户端会从任意工作目录启动服务器。 |
| `name` | 文件夹的名称 | 用在描述和资源 URI（`folder://<name>/…`）中。 |
| `prefix` | — | 工具名称的前缀（`handbook_read_file`），用于提供多个文件夹。 |
| `extensions` | 文本格式 | 提供的扩展名，不带点（`['md', 'txt']`）。默认：`md`、`txt`、`csv`、`json`、`yaml`、`html`、源代码……（`DEFAULT_TEXT_EXTENSIONS`）。添加 `''` 可以包含没有扩展名的文件。 |
| `include` | 所有允许的内容 | 要提供的文件的 glob 模式：`guide/**`、`**/*.md`。`*` 在一个文件夹内匹配，`**` 跨文件夹匹配。文件夹仍然会被列出，即使其中没有匹配的文件。 |
| `exclude` | — | 在任何地方都要隐藏的文件和文件夹的 glob 模式：`drafts`、`private/*`、`**/node_modules`。被隐藏的文件夹会隐藏其中的一切。 |
| `includeHidden` | `false` | 提供以点开头的名称（`.env`、`.git`……）。请保持关闭。 |
| `maxFileBytes` | `200000` | 从一个文件中读取的字节数；更长的文件会被截断（`truncated: true`）。 |
| `maxEntries` | `500` | 一次列出返回的条目数，包括资源。 |
| `maxDepth` | `8` | 探索的子文件夹深度。 |
| `maxMatches` | `50` | 一次搜索返回的匹配数。 |
| `maxSearchBytes` | `20000000` | 一次搜索读取的字节数，所有文件合计。 |
| `maxExaminedEntries` | `50000` | 一次列出或搜索查看的名称数，无论是否提供；超过它时结果会显示 `truncated: true`。 |

### 模型看到的内容 {#what-the-model-sees-1}

搜索工具（有删节）：

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

一次搜索返回 `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`。一次读取返回 `{ "path", "size", "content", "truncated" }`。

**资源**：每个文件都以 `folder://handbook/guide/onboarding.md` 的形式列出，附带它的大小和类型（`text/markdown`、`text/csv`……）。支持资源的应用会让用户挑选它们，例如通过一个附件菜单；具体方式取决于应用。

### 安全规则 {#security-rules-1}

1. **只接受相对路径**；绝对路径会被拒绝。
2. **文件夹之外什么都不行**：每个路径都会被解析到它的真实位置——包括 `..` 段和符号链接——如果它离开了这个文件夹就会被拒绝。指向已经访问过的文件夹的链接会被跳过，所以链接循环不会让列出操作卡住。
3. **隐藏名称不可见**：`.env`、`.git`、`.ssh`……表现得就像不存在一样，即使通过链接访问也是如此。
4. **只限文本**：只提供允许的扩展名，前 8 KB 中包含零字节（二进制）的文件会被拒绝。
5. **有上限**：读取、列出、深度、搜索匹配数、扫描的字节数和查看的名称数（`maxExaminedEntries`，50,000）全都有限制；提前停止的列出或搜索会显示 `truncated: true`。
6. **只读**：从不写入、移动或删除任何东西。
7. **可追踪**：每一次资源读取都是事件日志中的一次运行，附带所提供内容的 URI、大小和 SHA-256 指纹。
8. **排除就是排除**：排除一个文件夹（`private`、`private/*`、`**/node_modules`）会隐藏其中的一切，无论是被列出、被搜索、按路径读取还是作为资源读取。
9. **稳健**：无法读取的子文件夹会被跳过，错误消息只会提到共享文件夹的名称，从不暴露它的绝对路径。

### 完整文件 {#complete-file-1}

改编自 [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts)（它默认提供的就是这份文档）：

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

### 它不做什么 {#what-it-does-not-do-1}

- **不进行任何形式的写入**。
- **不支持 PDF、Word 或图片**：只支持文本文件。请先把文档转换成 Markdown 或纯文本。
- **只做子串搜索**：没有基于含义的（“语义”）搜索，也没有排序。
- **没有变更通知**：客户端看到的是它们列出文件那一刻的样子。
- **这个文件夹不能让你不信任的人写入**：先检查路径，然后才打开文件；能在那一瞬间把某个文件夹替换成链接的人，理论上可以钻这个空子。
- **使用 `include` 时，文件夹仍然会被列出**，即使其中没有匹配的文件（要检查的话就得读取每一个子文件夹）。
- 资源读取会被追踪，但不受工具策略的检查：只提供你乐意共享的文件夹。

## 一个只读数据库 {#a-read-only-database}

**它做什么。** 让模型探索一个数据库——列出表、描述某张表、运行一条 `SELECT` 查询——并且**永远不会改动它**。支持 **SQLite**（Node.js 22.13+ 内置的 `node:sqlite`，或 `better-sqlite3`）和 **PostgreSQL**（`pg`）。

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

### 选项 {#options-2}

| `databaseTools` 选项 | 默认值 | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`、`postgresReadOnly({ pool })` 或 `postgresReadOnly({ client })`，或者你自己的 `ReadOnlyDatabase`。 |
| `name` | `the <dialect> database` | 模型听到的名称：“the shop database”。 |
| `prefix` | — | 工具名称的前缀（`shop_query`），用于提供多个数据库。 |
| `maxRows` | `100`（最多 `1000`） | 一次查询返回的行数；`truncated: true` 表示还有更多行。 |
| `maxTextLength` | `2000` | 每个文本值保留的字符数。 |
| `maxTables` | `500` | 列出的表数。 |
| `maxSqlLength` | `20000` | 接受的最长 SQL。 |

| `postgresReadOnly` 选项 | 默认值 | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL 会停止运行时间超过它的任何查询。 |
| `schemas` | 除系统 schema 外的全部 | 由 `list_tables` 和 `describe_table` **列出和描述**的 schema。它并不限制 `query` 能读取什么：那是数据库角色的职责。 |

使用 `{ client }` 时，请给适配器一个**专用的** `pg.Client`：一个你的应用不会用于自身事务的客户端（在这里传入连接池会被拒绝；请以 `{ pool }` 的形式传入它）。

`sqliteReadOnly(db)` 没有选项：请以只读方式打开文件（`node:sqlite` 用 `{ readOnly: true }`，better-sqlite3 用 `{ readonly: true }`）。它只依赖 `prepare`、`exec` 以及两种驱动共有的语句方法；测试套件在一个真实的 `node:sqlite` 数据库上运行它，而不是在 better-sqlite3 上。

### 模型看到的内容 {#what-the-model-sees-2}

三个工具：`list_tables`、`describe_table { table }` 和 `query { sql }`，其描述为 *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."*（在 shop 数据库上运行一条只读 SQL 查询（sqlite 方言），最多返回 100 行；还有更多行时 "truncated" 为 true。会改变数据或 schema 的语句会被拒绝。请先使用 list_tables 和 describe_table。）一次查询返回：

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

值会在各行到达时被转换成可读的形式：非常大的整数变成字符串，日期变成 ISO 字符串，二进制数据变成 `<binary data, 3 bytes>` 这样的说明，长文本被截断，数组保留 100 项（`… 400 more items`）。当数据库本身拒绝了查询（“no such column”、“read-only”、超时），模型会得到原因，以便修正它的 SQL；连接错误和服务器错误则留在你这一侧。

### 安全规则：四道锁，而不是一道 {#security-rules-four-locks-not-one}

只检查查询是否“以 SELECT 开头”是不够的：`WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` 以 `WITH` 开头，却会删除数据。所以一条查询必须通过四道锁：

1. **语句检查**：恰好一条语句（能正确理解字符串中的分号、带引号的名称、注释、PostgreSQL 的 `$$` 引号以及 `E'…'` 转义字符串），以 `SELECT`、`WITH` 或 `VALUES` 开头，不含 `$1` 参数，括号配对。`PRAGMA`、`ATTACH`、`EXPLAIN ANALYZE`、`COMMIT`……都会被拒绝。
2. **数据库本身拒绝写入**：
   - SQLite：每条查询都在 `PRAGMA query_only = ON` 下运行（之后恢复原值），而使用 better-sqlite3 时，会写入的语句在运行之前就会被拒绝；
   - PostgreSQL：每条查询都在它自己的 `BEGIN READ ONLY` 事务中运行——已经处于另一个事务中的连接会先被检测出来（`transaction_timestamp()` 早于该语句）并被拒绝，而不会触碰那个事务——并带有 `SET LOCAL statement_timeout`，而且总是以 `ROLLBACK` 然后 `SELECT pg_advisory_unlock_all()` 结束（咨询锁在回滚后依然存在；无法释放它们的连接不会被复用）。查询以带绑定参数的子查询形式发送，所以服务器只接受一条语句。事务从不同时共用一个连接。
3. **上限**：最多读取 `maxRows` 行（SQLite 从不读取其余的行；PostgreSQL 在 `LIMIT` 处停止），值会在各行到达时被截断成简短的副本（每个原始值在截断前仍会被完整加载），PostgreSQL 查询会超时。
4. **你自己**：以只读方式打开 SQLite 文件；用一个只能读取你想展示的内容的角色连接 PostgreSQL——这才是真正的边界，因为只读事务并不能阻止某个函数在数据库之外做的事（例如 `dblink` 或某个 HTTP 扩展）。这样的角色仍然可以读取系统目录（`pg_catalog`），并调用授予 `PUBLIC` 的函数；请撤销那些会访问外部的扩展函数的权限（`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;` 等）：

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### 完整文件 {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts)（SQLite，如果你没有提供文件，它会创建一个演示用的商店数据库）和 [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts)：

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

### 它不做什么 {#what-it-does-not-do-2}

- **不写入**，这是有意设计的。要让模型改动数据，请为那一种改动专门编写一个工具，并加上审批。
- **查询内部没有按表过滤**：一条查询可以读取该连接能读取的任何东西。请使用角色（PostgreSQL）或者一个只包含合适表的文件副本（SQLite）；对外提供视图而不是原始表。
- **SQLite：攻击面在于查询，而不是文件。** 查询在你的服务器进程内同步运行，没有超时，也没有内存上限：编写 SQL 的一方——模型，或者操纵它的人——可以写出一条永不结束的查询（递归的 `WITH`）或者构造出巨大的值，从而阻塞或耗尽服务器。行是逐行读取的，每个值在到达时都会被截断成一个简短的副本，所以结果始终很小，原始值也可以被释放——但每个原始值都会先被完整加载，而且没有任何东西限制 SQLite 为产出一行所做的工作量。请只把 SQLite 提供给你自己或你信任的人；不要通过 HTTP 把它暴露给不可信的客户端。在可以被停止的工作线程中运行查询可以消除这个限制；目前尚未实现。
- **注册在连接上的 SQLite 函数，模型的 SQL 都可以调用**（`db.function(…)`）：在你对外提供的连接上，只注册无害的函数。
- **没有绑定参数**：模型直接在 SQL 中写入值。
- 结果中同名的两列只会保留最后一列：请给它们起别名。
- 其他数据库（MySQL、SQL Server……）：请自己实现小巧的 `ReadOnlyDatabase` 接口，并让它自己拒绝写入。`assertSingleQuery(sql, dialect)` 只理解 SQLite 和 PostgreSQL 语法；MySQL（每个字符串中都有反斜杠转义、`#` 注释）需要它自己的检查。

## 一个智能体：你的推理分身 {#an-agent-your-reasoning-twin}

**它做什么。** 把一整个智能体作为一个工具对外提供。最引人注目的用法：一个[带有你的思考者画像的认知智能体](./thinker-profiles)，这样任何人都可以在 Claude Desktop 中问*“Nicolas 会怎么看待为 Jev 付费？”*，并得到一个**按 Nicolas 的推理方式**推理出来的答案，附带它的理由以及仍然缺少的内容。

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

这个配方需要一个模型密钥（`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`）：智能体要借助语言模型来思考。

### 第 1 步——捕捉你的推理方式 {#step-1-—-capture-how-you-reason}

用你自己的话讲解几个话题，把它们一次性提炼成一份画像，然后保存下来：

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

画像包含什么，以及如何随着时间推移纠正它，请参见[像特定的人一样推理](./thinker-profiles)。

### 第 2 步——对外提供它 {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) 会从 `PROFILE_FILE` 加载画像（并对照画像 schema 检查），或者使用一个内置的示例，然后对外提供 `ask_nicolas`：

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### 模型看到什么、拿回什么 {#what-the-model-sees-and-gets-back}

这个工具接受 `problem`（问题，最多 4,000 个字符）和一个可选的 `context` 对象（事实和约束，以 JSON 表示时最多 20,000 个字符）。它返回的是决策，而不是整个心智状态：

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

`decisionStatus` 可以是 `committed`（确定的答案）、`provisional`（目前为止最好的答案，附带 `missing`：尚未确立的内容）或 `abstain`。完整的推理保留在事件日志中 `runId` 名下：`sdk.getMentalState(runId)` 会显示每一个假设和批判。当一次运行失败时，`error` 只会说明它没有完成以及该去哪里查看（`exposeErrors: true` 会把错误消息本身放进结果中：它可能包含提供商的细节）。

### 选项 {#options-3}

| 选项 | 默认值 | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | 工具名称。 |
| `description` | 通用描述 | 说明何时应该咨询这个智能体：模型根据它来做决定。 |
| `metadata` | 中等风险 | 治理元数据，逐字段合并到默认值之上；加上 `requiresApproval: true` 就会让每一次咨询都需要确认。 |
| `maxInputLength` | `4000` | 接受的最长问题（或消息）。 |
| `maxContextLength` | `20000` | 最长的 `context`，以 JSON 文本计。 |
| `exposeErrors` | `false` | 把失败运行的错误消息放进结果中。 |

`governedAgentTool(agent, options)` 为用 `sdk.createAgent` 创建的智能体做同样的事：它接受 `message`（以及 `context`），并返回 `{ runId, status, output, error }`。

### 值得了解 {#good-to-know}

- **它需要时间。** 一次认知运行会进行多次模型调用：大约需要几十秒，有时要几分钟。许多客户端在大约一分钟后就会取消调用（官方 TypeScript SDK 的默认值是 60 秒；Claude Code 允许你用 `MCP_TOOL_TIMEOUT` 调高它）。交互式使用时请把 `limits` 设得小一些。**当客户端放弃时，运行会被停止**（认知智能体和受治理智能体都是如此），并被记录为已取消：不会再进行任何模型调用，智能体正在等待的审批也会被取消。
- **它要花钱**：每一次咨询都是多次模型调用。请给它设置一个[预算](./mcp-deploy#governance-policies-budgets-approvals)，并查看 `sdk.getRunCost(runId)`。
- **它模仿的是一种推理方式，而不是这个人知道的东西。** 分身知道的只是画像、问题和上下文中的内容——而不是这个人的记忆。请把它的答案看作“他们会如何着手处理这件事”，并让真正的这个人用 `learnFromFeedback` 来纠正它。

## 一个服务器中的多个来源 {#several-sources-in-one-server}

用前缀组合多个来源，这样名称就永远不会冲突：

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

两个同名的工具会在启动时被拒绝，并给出一条说明是哪一个的消息。

## 在你自己的智能体中使用同样的工具 {#the-same-tools-in-your-own-agents}

这些工具源就是普通的工具定义：你的智能体不经过 MCP 也能使用它们。

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

同样的规则依然适用：你列出的写操作会等待审批，每一次调用都会被检查和记录。

下一步：[部署、安全与排障](./mcp-deploy)。
