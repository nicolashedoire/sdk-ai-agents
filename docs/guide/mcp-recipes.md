# An MCP server for anything

Each recipe turns one kind of system into an MCP server **in one line**, safely. They all work the same way: a **tool source** builds the tools (and sometimes resources), and `serveMcpOverStdio` serves them.

| You want to expose | The line | Tools the model gets |
| --- | --- | --- |
| [A function you write](#a-function) | `sdk.defineTool({ … })` | yours |
| [A web API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | one per operation, read-only by default |
| [A folder of documents](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ resources) |
| [A database, read-only](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [An agent](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |

New to MCP? Start with [Your first MCP server in 5 minutes](./mcp-first-server): it shows how to run a server, test it with the Inspector and connect it to Claude Desktop or Claude Code. Every file below is run and connected the same way.

## The skeleton every recipe shares

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

`tools` takes **tool definitions** (what the sources below return — the SDK defines them for you) and **names** of tools you defined yourself with `sdk.defineTool`. Nothing else is ever exposed. `resources` (optional) takes document providers, used by the folder recipe.

Whatever the source, every call goes through the same checks — arguments, [policies and budgets](./mcp-deploy#governance-policies-budgets-approvals), approvals — and is written to the event log.

## A function

The simplest source: a function you write, as in the [first server](./mcp-first-server).

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

| Field | What it is for |
| --- | --- |
| `name` | What the model calls. Letters, digits, `_` and `-`, up to 64 characters. |
| `description` | When to use the tool, in plain words. The model decides from it. |
| `schema` | The arguments, as a zod schema. `.describe()` texts are shown to the model. Calls that do not match are refused. |
| `handler` | Your code. It receives the validated arguments, and a context with `signal` (aborted when the client gives up). |
| `metadata.readOnly` | "This tool changes nothing": shown to clients as `readOnlyHint`. |
| `metadata.requiresApproval` | Every call waits for a human (see [approvals](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | Retries on failure, for idempotent tools only. |

## A web API, from its OpenAPI description

**What it does.** Many APIs publish a machine-readable description of their endpoints, called an **OpenAPI** document (often `openapi.json`). `openApiTools` reads it and turns **each operation into a tool**: the model sees its summary and its parameters, and calling the tool calls the API.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**Read-only by default.** Only `GET` operations become tools. To add an operation that changes something (`POST`, `PUT`, `PATCH`, `DELETE`), list it by its `operationId`:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

A listed write operation is marked **high risk** and **requires approval**: each call waits until a human approves it (see [approvals](./mcp-deploy#approvals-a-human-says-yes-first)). To trust it without approval, say so explicitly: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### Options

| Option | Default | |
| --- | --- | --- |
| `spec` | — | A URL (`https://…`), a file path, or an object you already parsed. JSON only; for YAML, parse it yourself (for example with the `yaml` package) and pass the object. |
| `baseUrl` | first `servers` entry | Where requests go. A relative server URL is resolved against the spec's URL. |
| `headers` | — | Added to every request (authentication). Never shown to the model, and they override any header argument. |
| `include` | GET operations | `operationId`s to expose — the only way to expose a write operation. An unknown id is an error. |
| `exclude` | — | `operationId`s to leave out. |
| `tags` | — | Only operations with one of these tags. |
| `prefix` | — | Prefix of tool names (`crm_getCustomer`), to combine several APIs. |
| `metadata` | GET: low risk, read-only · others: high risk, approval | `(operation) => ToolMetadata`, merged over the defaults. |
| `retry` | — | Retries on failure. Only for idempotent operations. |
| `timeoutMs` | `30000` | Per request (and for downloading the spec). |
| `maxResponseBytes` | `100000` | Longer responses are cut and marked `truncated: true`. |
| `maxSpecBytes` | `10000000` | Largest spec accepted. |
| `fetch` | global `fetch` | Your own HTTP function (proxy, tests). |

### What the model sees

For the Petstore's `getPetById`, clients receive:

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

Tool names come from `operationId` (made valid: `show pet!` becomes `show_pet`; an operation without one becomes `get_pets_petId`; duplicates get `_2`). Arguments are flat: one per path, query and header parameter, plus `body` for a JSON request body. A call returns the HTTP status and the parsed body:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### Security rules

1. **Read-only by default**: only `GET`; anything else must be listed in `include`, and then requires approval unless you say otherwise.
2. **The model cannot change where requests go.** The base URL is yours. Path parameters are URL-encoded, `.` and `..` are refused, and the final URL is checked to stay under the base URL.
3. **Arguments are checked before anything is sent**: unknown arguments and missing required ones are refused; values must be strings, numbers or booleans (lists of them for query parameters); header values cannot contain line breaks.
4. **Your credentials stay yours**: `headers` are added by the server, override header arguments, and appear nowhere the model can read.
5. **Bounded**: a timeout per request, responses cut at `maxResponseBytes`, a size limit on the spec.
6. **Redirects are not followed** (a redirect could carry your `Authorization` header to another site): a `3xx` answer is an error.
7. **Errors are errors**: a non-`2xx` status fails the call with the status and the start of the body. MCP clients see only "Tool execution failed" unless you set `exposeErrorDetails: true` (bodies can hold internal details); the event log always has the full error.

### Complete file

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), with the imports of an installed package:

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

Pass the token through the client's environment, never in the file: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### What it does not do

- **OpenAPI 3.x only**: Swagger 2.0 is refused (convert it, for example with `swagger2openapi`). YAML is not parsed for you.
- **JSON bodies only**: an operation that requires a `multipart/form-data` or form body is left out (or refused if you list it); an optional body of another type is not offered. Cookie parameters are left out.
- **No login flows**: pass a token in `headers`; OAuth is not handled.
- **Local references only**: `$ref`s to other files or URLs are not resolved (they become "any value"); a schema that refers to itself is cut at the cycle.
- Responses are not checked against the spec, pages are not followed, and only the first server of the spec is used unless you pass `baseUrl`.

## A folder of documents

**What it does.** Offers the text files of one folder — a handbook, notes, a codebase, exported docs — with three tools: **list** the files, **read** one, **search** them for a text. The same files are also offered as **resources**, which users can attach to a conversation themselves.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### Options

`folderTools` and `folderResources` take the same options (plus `prefix` for the tools):

| Option | Default | |
| --- | --- | --- |
| `root` | — | The folder. Use an absolute path: clients start servers from any working directory. |
| `name` | the folder's name | Used in descriptions and resource URIs (`folder://<name>/…`). |
| `prefix` | — | Prefix of the tool names (`handbook_read_file`), to serve several folders. |
| `extensions` | text formats | Extensions offered, without the dot (`['md', 'txt']`). Default: `md`, `txt`, `csv`, `json`, `yaml`, `html`, source code… (`DEFAULT_TEXT_EXTENSIONS`). Add `''` for files without an extension. |
| `include` | everything allowed | Globs of files to offer: `guide/**`, `**/*.md`. `*` matches within one folder, `**` across folders. |
| `exclude` | — | Globs of files and folders to hide everywhere: `drafts/**`, `**/node_modules/**`. |
| `includeHidden` | `false` | Offer names starting with a dot (`.env`, `.git`…). Leave it off. |
| `maxFileBytes` | `200000` | Bytes read from one file; longer files are cut (`truncated: true`). |
| `maxEntries` | `500` | Entries returned by one listing, resources included. |
| `maxDepth` | `8` | Sub-folder depth explored. |
| `maxMatches` | `50` | Matches returned by one search. |
| `maxSearchBytes` | `20000000` | Bytes read by one search, all files together. |

### What the model sees

The search tool, shortened:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

A search returns `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. A read returns `{ "path", "size", "content", "truncated" }`.

**Resources**: each file is listed as `folder://handbook/guide/onboarding.md` with its size and type (`text/markdown`, `text/csv`…). Applications that support resources let the user pick them, for example from an attachment menu; how depends on the application.

### Security rules

1. **Relative paths only**; absolute paths are refused.
2. **Nothing outside the folder**: every path is resolved to its real location — `..` segments and symbolic links included — and refused if it leaves the folder. A link to a folder already visited is skipped, so a link loop cannot hang a listing.
3. **Hidden names are invisible**: `.env`, `.git`, `.ssh`… behave as if they did not exist, even through a link.
4. **Text only**: only allowed extensions are offered, and a file whose first 8 KB contain a zero byte (binary) is refused.
5. **Bounded**: reads, listings, depth, search matches and bytes scanned are all limited (see the options), and one walk never looks at more than 50,000 names.
6. **Read-only**: nothing is ever written, moved or deleted.
7. **Traced**: every resource read is a run in the event log, with the URI, the size and the SHA-256 fingerprint of what was served.

### Complete file

Adapted from [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (which serves this documentation by default):

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

### What it does not do

- **No writing** of any kind.
- **No PDF, Word or images**: only text files. Convert documents to Markdown or text first.
- **Substring search only**: no meaning-based ("semantic") search, no ranking.
- **No change notifications**: clients see the files as they are when they list them.
- **The folder must not be writable by people you do not trust**: paths are checked, then the file is opened; someone who can replace a folder by a link at that exact moment could, in theory, slip through.
- Resource reads are traced but not checked by tool policies: offer only folders you are happy to share.

## A read-only database

**What it does.** Lets the model explore a database — list the tables, describe one, run a `SELECT` query — and **never change it**. Works with **SQLite** (the built-in `node:sqlite` of Node.js 22.13+, or `better-sqlite3`) and **PostgreSQL** (`pg`).

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

### Options

| `databaseTools` option | Default | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` or `postgresReadOnly({ client })`, or your own `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | How the model hears about it: "the shop database". |
| `prefix` | — | Prefix of the tool names (`shop_query`), to serve several databases. |
| `maxRows` | `100` (at most `1000`) | Rows returned by one query; `truncated: true` says there were more. |
| `maxTextLength` | `2000` | Characters kept per text value. |
| `maxTables` | `500` | Tables listed. |
| `maxSqlLength` | `20000` | Longest SQL accepted. |

| `postgresReadOnly` option | Default | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL stops any query that runs longer. |
| `schemas` | all but the system ones | Schemas listed and described. |

`sqliteReadOnly(db)` has no options: open the file read-only (`{ readOnly: true }` with `node:sqlite`, `{ readonly: true }` with better-sqlite3).

### What the model sees

Three tools: `list_tables`, `describe_table { table }` and `query { sql }`, described as *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."* A query returns:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

Values are made readable: very large integers become strings, dates ISO strings, binary data a note such as `<binary data, 3 bytes>`, long texts are cut. When the database refuses a query ("no such column", "read-only"), the model gets the reason so it can fix its SQL.

### Security rules: four locks, not one

Checking that a query "starts with SELECT" is not enough: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` starts with `WITH` and deletes. So a query must pass four locks:

1. **The statement check**: exactly one statement (semicolons inside strings, quoted names, comments and PostgreSQL `$$` quotes are understood), starting with `SELECT`, `WITH` or `VALUES`, without `$1` parameters. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… are refused.
2. **The database itself refuses writes**:
   - SQLite: every query runs with `PRAGMA query_only = ON` (restored afterwards), and with better-sqlite3 a statement that writes is refused before it runs;
   - PostgreSQL: every query runs in its own `BEGIN READ ONLY` transaction with `SET LOCAL statement_timeout`, and always ends with `ROLLBACK`. It is sent as a sub-query with a bound parameter, so the server accepts one statement only. Transactions never share a connection at the same time.
3. **Limits**: at most `maxRows` rows are read (the rest is never fetched), texts are cut, PostgreSQL queries time out.
4. **You**: open SQLite files read-only; connect PostgreSQL with a role that can only read what you want to show — this is the real boundary, because a read-only transaction does not stop what a function might do outside the database (for example `dblink`):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### Complete files

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite, creates a demo shop database when you give no file) and [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

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

### What it does not do

- **No writes**, by design. To let a model change data, write a dedicated tool for that one change, with approval.
- **No per-table filter inside queries**: a query can read anything the connection can read. Use a role (PostgreSQL) or a copy of the file with only the right tables (SQLite); expose views rather than raw tables.
- **SQLite has no query timeout here**: queries run inside your server process and cannot be interrupted, so a query that never ends blocks the server. Serve SQLite files you trust and keep them reasonably sized.
- **No bind parameters**: the model writes values in the SQL.
- Two columns with the same name in a result keep only the last one: give them aliases.
- Other databases (MySQL, SQL Server…): implement the small `ReadOnlyDatabase` interface yourself, and make it refuse writes on its own; `assertSingleQuery(sql, dialect)` gives you the statement check.

## An agent: your reasoning twin

**What it does.** Exposes a whole agent as one tool. The most striking use: a [cognitive agent with your thinker profile](./thinker-profiles), so that from Claude Desktop anyone can ask *"what would Nicolas think of paying for Jev?"* and get an answer reasoned **the way Nicolas reasons**, with its rationale and what is still missing.

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

This recipe needs a model key (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): the agent thinks with a language model.

### Step 1 — capture how you reason

Explain a few topics in your own words, distill them into a profile once, and save it:

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

See [Reason like a given person](./thinker-profiles) for what a profile contains and how to correct it over time.

### Step 2 — serve it

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) loads the profile from `PROFILE_FILE` (checked against the profile schema) or uses a built-in example, and serves `ask_nicolas`:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### What the model sees and gets back

The tool takes `problem` (the question, up to 4,000 characters) and an optional `context` object (facts and constraints). It returns the decision, not the whole mental state:

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

`decisionStatus` is `committed` (a firm answer), `provisional` (the best answer so far, with `missing`: what is not established) or `abstain`. The full reasoning stays in the event log under `runId`: `sdk.getMentalState(runId)` shows every hypothesis and critique.

### Options

| Option | Default | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | The tool name. |
| `description` | generic | Say when to consult this agent: the model decides from it. |
| `metadata` | medium risk | Governance metadata; add `requiresApproval: true` to confirm every consultation. |
| `maxInputLength` | `4000` | Longest problem accepted. |

`governedAgentTool(agent, options)` does the same for an agent created with `sdk.createAgent`: it takes `message` (and `context`) and returns `{ runId, status, output, error }`.

### Good to know

- **It takes time.** A cognitive run makes several model calls: count tens of seconds, sometimes minutes. Many clients cancel a call after about a minute (the default of the official TypeScript SDK is 60 seconds; Claude Code lets you raise it with `MCP_TOOL_TIMEOUT`). Keep `limits` small for interactive use. **When the client gives up, the cognitive run is stopped** and recorded as cancelled — no tokens are spent for nothing. A governed agent (`governedAgentTool`) is not stopped: it runs until its own `timeout`.
- **It costs money**: each consultation is several model calls. Put a [budget](./mcp-deploy#governance-policies-budgets-approvals) on it and check `sdk.getRunCost(runId)`.
- **It imitates a way of reasoning, not what the person knows.** The twin knows what is in the profile, the question and the context — not the person's memory. Treat its answers as "how would they approach this", and let the real person correct it with `learnFromFeedback`.

## Several sources in one server

Combine sources with prefixes so names never collide:

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

Two tools with the same name are refused at start-up, with a message that says which one.

## The same tools in your own agents

The sources are plain tool definitions: your agents can use them without MCP.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

The same rules apply: the write operations you listed wait for approval, every call is checked and recorded.

Next: [deploy, secure and troubleshoot](./mcp-deploy).
