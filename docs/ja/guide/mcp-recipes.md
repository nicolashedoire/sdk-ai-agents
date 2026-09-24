# なんでも MCP サーバーにする

各レシピは、ある種類のシステムを **1 行で**、安全に MCP サーバーにします。どれも同じ仕組みで動きます。**ツールソース** がツール（場合によってはリソースも）を組み立て、`serveMcpOverStdio` がそれを提供します。

| 公開したいもの | その 1 行 | モデルが得るツール |
| --- | --- | --- |
| [自分で書いた関数](#a-function) | `sdk.defineTool({ … })` | あなたのツール |
| [Web API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | オペレーションごとに 1 つ。デフォルトで読み取り専用 |
| [ドキュメントのフォルダー](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`、`read_file`、`search_files`（+ リソース） |
| [読み取り専用のデータベース](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`、`describe_table`、`query` |
| [エージェント](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |

MCP ははじめてですか？ まず [5 分ではじめての MCP サーバー](./mcp-first-server) から始めてください。サーバーを実行し、Inspector でテストし、Claude Desktop や Claude Code に接続する方法を説明しています。以下のファイルはすべて、同じ方法で実行し、接続します。

## すべてのレシピに共通する骨組み {#the-skeleton-every-recipe-shares}

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

`tools` には、**ツール定義**（以下のソースが返すもので、SDK が代わりに定義してくれます）と、`sdk.defineTool` で自分で定義したツールの **名前** を渡せます。それ以外のものが公開されることはありません。`resources`（任意）には文書プロバイダーを渡します。フォルダーのレシピで使います。

ソースが何であれ、すべての呼び出しは、引数、[ポリシー](./mcp-deploy#governance-policies-budgets-approvals)、承認、予算の順で同じチェックを通り、イベントログに書き込まれます。不正な呼び出しは、誰かに承認を求める前に拒否されます。

## 関数 {#a-function}

最もシンプルなソースです。[はじめてのサーバー](./mcp-first-server) と同じように、自分で関数を書きます。

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

| フィールド | 用途 |
| --- | --- |
| `name` | モデルが呼び出す名前。英字、数字、`_`、`-` を使い、64 文字以内にする（それ以外の名前は、MCP クライアントに拒否されることがある）。 |
| `description` | いつこのツールを使うかを、わかりやすい言葉で書く。モデルはこれを見て判断する。 |
| `schema` | zod スキーマで表した引数。`.describe()` のテキストはモデルに示される。合わない呼び出しは拒否される。 |
| `handler` | あなたのコード。検証済みの引数と、`signal`（クライアントが待つのをやめると中断される）を持つコンテキストを受け取る。 |
| `metadata.readOnly` | 「このツールは何も変更しない」。クライアントには `readOnlyHint` として示される。 |
| `metadata.requiresApproval` | すべての呼び出しが人を待つ（[承認](./mcp-deploy#approvals-a-human-says-yes-first) を参照）。 |
| `retry` | 失敗時のリトライ。冪等なツールに限る（`retryOn` で対象の失敗を絞り込める。不正な引数がリトライされることはない）。 |

## Web API（OpenAPI の記述から） {#a-web-api-from-its-openapi-description}

**何をするか。** 多くの API は、エンドポイントを機械が読める形で記述したもの、つまり **OpenAPI** ドキュメント（多くは `openapi.json`）を公開しています。`openApiTools` はそれを読み、**各オペレーションをツールに** 変えます。モデルにはその概要とパラメーターが見え、ツールを呼び出すと API が呼び出されます。

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**デフォルトで読み取り専用。** ツールになるのは `GET` オペレーションだけです。何かを変更するオペレーション（`POST`、`PUT`、`PATCH`、`DELETE`）を加えるには、その `operationId` を列挙します。

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

列挙した書き込みオペレーションは **高リスク** とされ、**承認が必要** になります。各呼び出しは、人が承認するまで待ちます（[承認](./mcp-deploy#approvals-a-human-says-yes-first) を参照）。承認なしで信頼するには、明示的にそう指定します：`metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`。

### オプション {#options}

| オプション | デフォルト | |
| --- | --- | --- |
| `spec` | — | URL（`https://…`）、ファイルパス、またはすでに解析済みのオブジェクト。JSON のみ。YAML の場合は自分で解析して（たとえば `yaml` パッケージで）オブジェクトを渡す。 |
| `baseUrl` | `servers` の最初のエントリー | リクエストの送り先。相対的なサーバー URL は、spec の URL を基準に解決される。 |
| `headers` | — | すべてのリクエストに追加される（認証）。モデルには決して示されず、ヘッダーの引数より優先される。`baseUrl` が必要（spec を API 自身のオリジンからダウンロードした場合を除く）。また、API と spec の両方に https が必要（http はこのマシン上でのみ可）。 |
| `include` | GET オペレーション | 公開する `operationId`。指定すると GET のデフォルトを **置き換え**、列挙したオペレーションだけがツールになる。書き込みオペレーションを公開する唯一の方法。存在しない ID はエラーになる。 |
| `exclude` | — | 除外する `operationId`。 |
| `tags` | — | これらのタグのいずれかを持つオペレーションだけ。 |
| `prefix` | — | ツール名の接頭辞（`crm_getCustomer`）。複数の API を組み合わせるために使う。 |
| `metadata` | GET：低リスク、読み取り専用 · それ以外：高リスク、承認あり | `(operation) => ToolMetadata`。設定した各フィールドがデフォルトを置き換える。省略した（または `undefined` の）フィールドはデフォルトのままなので、承認を外せるのは明示的な `requiresApproval: false` だけ。 |
| `retry` | — | 読み取り専用のオペレーション（`metadata` で別に指定しない限り GET）だけを、サーバーエラー（5xx）、429、タイムアウト、ネットワーク障害のときにリトライする。4xx の応答や不正な引数ではリトライしない。 |
| `timeoutMs` | `30000` | リクエストごと（spec のダウンロードにも適用）。 |
| `maxResponseBytes` | `100000` | これより長い応答は切り詰められ、`truncated: true` が付く。 |
| `maxSpecBytes` | `10000000` | 受け付ける spec の最大サイズ。 |
| `fetch` | グローバルな `fetch` | 独自の HTTP 関数（プロキシ、テスト）。 |

### モデルに見えるもの {#what-the-model-sees}

Petstore の `getPetById` の場合、クライアントは次のものを受け取ります。

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

ツール名は `operationId` から作られます（有効な名前に変換されます。`show pet!` は `show_pet` になり、`operationId` のないオペレーションは `get_pets_petId` のようになり、重複には `_2` が付きます）。引数はフラットで、パス、クエリ、ヘッダーのパラメーターごとに 1 つずつと、JSON のリクエストボディ用の `body` があります。呼び出しは、HTTP ステータスと解析済みのボディを返します。

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### セキュリティのルール {#security-rules}

1. **デフォルトで読み取り専用**：`GET` のみです。それ以外は `include` に列挙する必要があり、その場合は、別に指定しない限り承認が必要になります。
2. **モデルはホストを変えられず、パスをさかのぼることもできません。** ベース URL を決めるのはあなたです。パスの値には `/`、`\`、`.` や `..` のセグメントを含められません。一部のサーバーやプロキシは `%2F` をデコードするため、パーセントエンコードされていても（1 回でも複数回でも、不正なエスケープの隣にあってもなくても）同じです。したがって `../../admin` は拒否されます。最終的な URL がベース URL の配下にとどまっていることも確認されます。その範囲内で、値（どの顧客か、どの注文か）を選ぶのはモデルです。
3. **引数は何よりも先にチェックされます**。ポリシーや承認の前に（不正な呼び出しが人を待つことはありません）、そしてリクエストを組み立てるときにもう一度チェックされます。未知の引数や、必須なのに欠けている引数は拒否されます。値は文字列、数値、真偽値のいずれかでなければならず（クエリパラメーターではそれらのリストも可）、ヘッダーの値に改行を含めることはできません。
4. **認証情報は、あなたが決めた場所にだけ送られます**。`headers` はサーバーが追加し、ヘッダーの引数より優先され、モデルが読める場所にはどこにも現れません。`headers` を使う場合、spec ファイルが指定したサーバーは拒否されるので、`baseUrl` を渡してください（spec を API 自身のオリジンからダウンロードした場合を除きます）。また、このマシン上（`localhost`、`127.0.0.1`、`[::1]`）を除いて `http:` は拒否されます。これは API にも spec のダウンロードにも適用されます。途中で改ざんされた spec が、あなたの認証情報で許可されてしまうオペレーションを追加できるからです。
5. **上限あり**：リクエストごとのタイムアウト、`maxResponseBytes` での応答の切り詰め、spec のサイズ制限があります。
6. **リダイレクトはたどりません**（リダイレクトによって `Authorization` ヘッダーが別のサイトに送られるおそれがあるため）。`3xx` の応答はエラーになり、独自の `fetch` がそれでもリダイレクトをたどった場合もエラーになります。
7. **エラーはエラー**：`2xx` 以外のステータスは、ステータスとボディの冒頭を添えて呼び出しを失敗させます。`exposeErrorDetails: true` を設定しない限り、MCP クライアントには "Tool execution failed" としか見えません（ボディには内部の詳細が含まれることがあるため）。イベントログには常に完全なエラーが残ります。
8. **すべての GET は読み取り専用として告知されます**（`readOnlyHint`）。API によっては、副作用のある GET（`GET /send-reminder`）があります。それらは `exclude` で除外するか、`metadata` で `readOnly: false, requiresApproval: true` を設定してください。
9. **大きな記述にも上限があります**：`$ref` の展開には、オペレーションごとと spec 全体の予算があり、64,000 文字を超えるツールのスキーマは、その説明文に置き換えられます。

### 完全なファイル {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts) を、インストール済みパッケージからのインポートに書き換えたものです。

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

トークンはファイルに書かず、クライアントの環境変数で渡してください：`claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`。

### できないこと {#what-it-does-not-do}

- **OpenAPI 3.x のみ**：Swagger 2.0 は拒否されます（たとえば `swagger2openapi` で変換してください）。YAML を解析する機能はありません。
- **JSON のボディのみ**：`multipart/form-data` やフォームのボディを必要とするオペレーションは除外されます（列挙した場合は拒否されます）。ほかの種類の任意のボディは提示されません。Cookie のパラメーターは除外されます。
- **ログインフローなし**：トークンは `headers` で渡してください。OAuth には対応していません。
- **ローカルな参照のみ**：ほかのファイルや URL への `$ref` は解決されません（「任意の値」になります）。自分自身を参照するスキーマは、循環したところで打ち切られます。
- 応答は spec と照合されず、ページ送りはたどらず、`baseUrl` を渡さない限り spec の最初のサーバーだけが使われます。

## ドキュメントのフォルダー {#a-folder-of-documents}

**何をするか。** 1 つのフォルダー（ハンドブック、メモ、コードベース、エクスポートしたドキュメントなど）のテキストファイルを、3 つのツールで提供します。ファイルを **一覧する**、1 つを **読む**、テキストを **検索する** です。同じファイルは **リソース** としても提供され、ユーザーが自分で会話に添付できます。

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### オプション {#options-1}

`folderTools` と `folderResources` は同じオプションを受け取ります（ツールには、さらに `prefix` があります）。

| オプション | デフォルト | |
| --- | --- | --- |
| `root` | — | フォルダー。クライアントは任意の作業ディレクトリからサーバーを起動するので、絶対パスを使う。 |
| `name` | フォルダーの名前 | 説明文とリソースの URI（`folder://<name>/…`）で使われる。 |
| `prefix` | — | ツール名の接頭辞（`handbook_read_file`）。複数のフォルダーを提供するために使う。 |
| `extensions` | テキスト形式 | 提供する拡張子（ドットなし、`['md', 'txt']`）。デフォルト：`md`、`txt`、`csv`、`json`、`yaml`、`html`、ソースコードなど（`DEFAULT_TEXT_EXTENSIONS`）。拡張子のないファイルには `''` を加える。 |
| `include` | 許可されたものすべて | 提供するファイルのグロブ：`guide/**`、`**/*.md`。`*` は 1 つのフォルダー内で、`**` はフォルダーをまたいで一致する。一致するファイルがなくても、フォルダーは一覧に表示される。 |
| `exclude` | — | あらゆる場所で隠すファイルやフォルダーのグロブ：`drafts`、`private/*`、`**/node_modules`。隠したフォルダーの中身はすべて隠れる。 |
| `includeHidden` | `false` | ドットで始まる名前（`.env`、`.git` など）を提供する。オフのままにしておくこと。 |
| `maxFileBytes` | `200000` | 1 つのファイルから読むバイト数。これより長いファイルは切り詰められる（`truncated: true`）。 |
| `maxEntries` | `500` | 1 回の一覧で返すエントリー数（リソースを含む）。 |
| `maxDepth` | `8` | 探索するサブフォルダーの深さ。 |
| `maxMatches` | `50` | 1 回の検索で返す一致の数。 |
| `maxSearchBytes` | `20000000` | 1 回の検索で読むバイト数（全ファイルの合計）。 |
| `maxExaminedEntries` | `50000` | 1 回の一覧や検索で調べる名前の数（提供するかどうかにかかわらず）。これを超えると、結果に `truncated: true` が付く。 |

### モデルに見えるもの {#what-the-model-sees-1}

検索ツールを短くしたものです。

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

検索は `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }` を返します。読み取りは `{ "path", "size", "content", "truncated" }` を返します。

**リソース**：各ファイルは、サイズと種類（`text/markdown`、`text/csv` など）とともに、`folder://handbook/guide/onboarding.md` のように一覧されます。リソースに対応したアプリケーションでは、ユーザーがそれを選べます（たとえば添付のメニューから）。方法はアプリケーションによって異なります。

### セキュリティのルール {#security-rules-1}

1. **相対パスのみ**。絶対パスは拒否されます。
2. **フォルダーの外には何もない**：すべてのパスは、`..` のセグメントやシンボリックリンクも含めて実際の場所に解決され、フォルダーの外に出るなら拒否されます。すでに訪れたフォルダーへのリンクはスキップされるので、リンクのループで一覧が止まることはありません。
3. **隠し名は見えない**：`.env`、`.git`、`.ssh` などは、リンクを経由しても、存在しないかのように振る舞います。
4. **テキストのみ**：許可された拡張子だけが提供され、先頭 8 KB にゼロバイトを含むファイル（バイナリ）は拒否されます。
5. **上限あり**：読み取り、一覧、深さ、検索の一致、走査するバイト数、調べる名前の数（`maxExaminedEntries`、50,000）にはすべて上限があります。途中で止まった一覧や検索には `truncated: true` が付きます。
6. **読み取り専用**：何かが書き込まれたり、移動されたり、削除されたりすることは決してありません。
7. **トレースされる**：リソースの読み取りは、提供したものの URI、サイズ、SHA-256 のフィンガープリントとともに、すべてイベントログの 1 つの実行になります。
8. **除外は除外**：フォルダー（`private`、`private/*`、`**/node_modules`）を除外すると、一覧、検索、パスでの読み取り、リソースとしての読み取りのいずれにおいても、その中身はすべて隠れます。
9. **堅牢**：読めないサブフォルダーはスキップされ、エラーメッセージには共有フォルダーの名前が示されます。絶対パスが示されることはありません。

### 完全なファイル {#complete-file-1}

[`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts)（デフォルトではこのドキュメントを提供します）をもとにしたものです。

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

### できないこと {#what-it-does-not-do-1}

- **いかなる書き込みもできません**。
- **PDF、Word、画像は非対応**：テキストファイルのみです。文書は先に Markdown かテキストに変換してください。
- **部分文字列の検索のみ**：意味にもとづく（「セマンティック」な）検索も、ランキングもありません。
- **変更の通知はなし**：クライアントには、一覧を取得した時点のファイルが見えます。
- **信頼できない人がフォルダーに書き込めてはいけません**：パスをチェックしてからファイルを開くので、ちょうどその瞬間にフォルダーをリンクに置き換えられる人は、理論上はすり抜けられる可能性があります。
- **`include` を使っても、フォルダーは一覧に表示されます**。一致するファイルがなくても同様です（それを確認するには、すべてのサブフォルダーを読む必要があるため）。
- リソースの読み取りはトレースされますが、ツールのポリシーではチェックされません。共有してかまわないフォルダーだけを提供してください。

## 読み取り専用のデータベース {#a-read-only-database}

**何をするか。** モデルがデータベースを探索できるようにします（テーブルを一覧する、1 つを記述する、`SELECT` クエリを実行する）。そして **決して変更はさせません**。**SQLite**（Node.js 22.13 以上に組み込みの `node:sqlite`、または `better-sqlite3`）と **PostgreSQL**（`pg`）で動作します。

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

### オプション {#options-2}

| `databaseTools` のオプション | デフォルト | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`、`postgresReadOnly({ pool })`、`postgresReadOnly({ client })`、または独自の `ReadOnlyDatabase`。 |
| `name` | `the <dialect> database` | モデルへの伝え方。例："the shop database"。 |
| `prefix` | — | ツール名の接頭辞（`shop_query`）。複数のデータベースを提供するために使う。 |
| `maxRows` | `100`（最大 `1000`） | 1 回のクエリで返す行数。`truncated: true` は、さらに行があったことを示す。 |
| `maxTextLength` | `2000` | テキストの値ごとに保持する文字数。 |
| `maxTables` | `500` | 一覧するテーブルの数。 |
| `maxSqlLength` | `20000` | 受け付ける SQL の最大長。 |

| `postgresReadOnly` のオプション | デフォルト | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | これより長く実行されるクエリは、PostgreSQL が停止する。 |
| `schemas` | システムのもの以外すべて | `list_tables` と `describe_table` で **一覧・記述される** スキーマ。`query` が読めるものは制限しない。それはロールの役目。 |

`{ client }` を使う場合は、アダプターに **専用の** `pg.Client` を渡してください。アプリケーションが自分のトランザクションに使っていないクライアントです（そこにプールを渡すと拒否されます。プールは `{ pool }` として渡してください）。

`sqliteReadOnly(db)` にオプションはありません。ファイルは読み取り専用で開いてください（`node:sqlite` では `{ readOnly: true }`、better-sqlite3 では `{ readonly: true }`）。このアダプターが頼るのは、`prepare`、`exec` と、両方のドライバーに共通するステートメントのメソッドだけです。テストスイートは実際の `node:sqlite` データベースで実行しており、better-sqlite3 では実行していません。

### モデルに見えるもの {#what-the-model-sees-2}

ツールは 3 つです。`list_tables`、`describe_table { table }`、`query { sql }` で、`query` の説明は *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."*（「shop データベースに対して読み取り専用の SQL クエリ（sqlite 方言）を 1 つ実行し、最大 100 行を返します。さらに行があった場合、"truncated" は true になります。データやスキーマを変更するステートメントは拒否されます。まず list_tables と describe_table を使ってください。」）です。クエリは次のものを返します。

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

値は、行が届くたびに読みやすい形に変換されます。非常に大きな整数は文字列に、日付は ISO 形式の文字列に、バイナリデータは `<binary data, 3 bytes>` のような注記になり、長いテキストは切り詰められ、配列は 100 項目まで保持されます（`… 400 more items`）。データベースがクエリそのものを拒否した場合（"no such column"、"read-only"、タイムアウト）、モデルは SQL を直せるように、その理由を受け取ります。接続エラーやサーバーエラーは、あなたの側にとどまります。

### セキュリティのルール：鍵は 1 つではなく 4 つ {#security-rules-four-locks-not-one}

クエリが「SELECT で始まる」ことをチェックするだけでは不十分です。`WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` は `WITH` で始まり、しかも削除を行います。そのため、クエリは 4 つの鍵を通過しなければなりません。

1. **ステートメントのチェック**：ちょうど 1 つのステートメントであること（文字列内のセミコロン、引用符で囲まれた名前、コメント、PostgreSQL の `$$` 引用や `E'…'` のエスケープ文字列も理解します）、`SELECT`、`WITH`、`VALUES` のいずれかで始まること、`$1` のようなパラメーターがないこと、括弧の対応が取れていること。`PRAGMA`、`ATTACH`、`EXPLAIN ANALYZE`、`COMMIT` などは拒否されます。
2. **データベース自体が書き込みを拒否します**：
   - SQLite：すべてのクエリは `PRAGMA query_only = ON` の状態で実行され（後で元に戻されます）、better-sqlite3 では、書き込むステートメントは実行前に拒否されます。
   - PostgreSQL：すべてのクエリは、`SET LOCAL statement_timeout` を設定した専用の `BEGIN READ ONLY` トランザクションの中で実行され、必ず `ROLLBACK`、続いて `SELECT pg_advisory_unlock_all()` で終わります（アドバイザリーロックはロールバック後も残るためです。ロックを解放できない接続は再利用されません）。すでに別のトランザクションの中にある接続は事前に検出され（`transaction_timestamp()` がステートメントより古い）、そのトランザクションには触れずに拒否されます。クエリはバインドされたパラメーターを持つサブクエリとして送られるので、サーバーは 1 つのステートメントしか受け付けません。複数のトランザクションが同時に 1 つの接続を共有することはありません。
3. **上限**：読み込まれるのは最大 `maxRows` 行です（SQLite は残りを読まず、PostgreSQL は `LIMIT` で止まります）。値は行が届くたびに短いコピーへと切り詰められます（ただし、元の値はそれぞれ、切り詰められる前にまるごと読み込まれます）。PostgreSQL のクエリはタイムアウトします。
4. **あなた**：SQLite のファイルは読み取り専用で開いてください。PostgreSQL には、見せたいものだけを読めるロールで接続してください。これこそが本当の境界です。読み取り専用のトランザクションでは、関数がデータベースの外で行うかもしれないこと（たとえば `dblink` や HTTP の拡張機能）を止められないからです。そうしたロールでも、システムカタログ（`pg_catalog`）は読めますし、`PUBLIC` に許可された関数は呼び出せます。外部に到達する拡張機能の関数については、実行権限を取り消してください（`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;` など）。

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### 完全なファイル {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts)（SQLite。ファイルを指定しなければ、デモ用のショップのデータベースを作成します）と [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts) です。

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

### できないこと {#what-it-does-not-do-2}

- **書き込みはできません**。設計上そうしています。モデルにデータを変更させたい場合は、その 1 つの変更のための専用のツールを、承認付きで書いてください。
- **クエリ内でのテーブル単位のフィルターはなし**：クエリは、接続が読めるものなら何でも読めます。ロール（PostgreSQL）か、必要なテーブルだけを含むファイルのコピー（SQLite）を使ってください。生のテーブルではなく、ビューを公開しましょう。
- **SQLite：攻撃対象はファイルではなくクエリ。** クエリはサーバーのプロセス内で同期的に実行され、タイムアウトもメモリの上限もありません。SQL を書く者（モデル、またはモデルを誘導する者）は、終わらないクエリ（再帰的な `WITH`）や巨大な値を作るクエリを書いて、サーバーをブロックしたり、資源を使い果たさせたりできます。行は 1 行ずつ読まれ、各値は届くたびに短いコピーへと切り詰められるので、結果は小さく保たれ、元の値は解放できます。しかし、元の値はそれぞれまずまるごと読み込まれ、SQLite が 1 行を作るために行う処理には何の上限もありません。SQLite は、自分自身か信頼できる人に向けて提供し、信頼できないクライアントに HTTP で公開しないでください。停止できるワーカースレッドでクエリを実行すればこの制限はなくなりますが、まだ実装されていません。
- **接続に登録された SQLite の関数は、モデルの SQL から呼び出せます**（`db.function(…)`）。提供する接続には、無害な関数だけを登録してください。
- **バインドパラメーターはなし**：モデルは値を SQL の中に書きます。
- 結果の中に同じ名前の列が 2 つあると、最後の 1 つだけが残ります。別名を付けてください。
- そのほかのデータベース（MySQL、SQL Server など）：小さな `ReadOnlyDatabase` インターフェースを自分で実装し、それ自体が書き込みを拒否するようにしてください。`assertSingleQuery(sql, dialect)` が理解するのは SQLite と PostgreSQL の構文だけです。MySQL（すべての文字列でのバックスラッシュのエスケープ、`#` のコメント）には独自のチェックが必要です。

## エージェント：あなたの推論の分身 {#an-agent-your-reasoning-twin}

**何をするか。** エージェント全体を 1 つのツールとして公開します。最も印象的な使い方は、[あなたの思考者プロファイルを持つ認知エージェント](./thinker-profiles) です。こうすれば、誰でも Claude Desktop から「Jev にお金を払うことを、Nicolas ならどう考えるか？」と尋ね、**Nicolas が推論するのと同じように** 推論された回答を、その根拠やまだ足りないものとともに得られます。

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

このレシピにはモデルのキーが必要です（`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`）。エージェントは言語モデルを使って考えるからです。

### ステップ 1：あなたの推論の仕方を捉える {#step-1-—-capture-how-you-reason}

いくつかのテーマを自分の言葉で説明し、それを一度プロファイルに抽出して、保存します。

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

プロファイルに何が含まれるか、どのように時間をかけて修正していくかは、[特定の人物のように推論する](./thinker-profiles) を参照してください。

### ステップ 2：提供する {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) は、`PROFILE_FILE` からプロファイルを読み込むか（プロファイルのスキーマでチェックされます）、組み込みの例を使って、`ask_nicolas` を提供します。

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### モデルに見えるものと返ってくるもの {#what-the-model-sees-and-gets-back}

このツールは、`problem`（質問。最大 4,000 文字）と、任意の `context` オブジェクト（事実や制約。JSON として最大 20,000 文字）を受け取ります。返すのは決定であり、心的状態の全体ではありません。

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

`decisionStatus` は、`committed`（確かな回答）、`provisional`（ここまでの最良の回答で、確立されていないことを示す `missing` 付き）、`abstain` のいずれかです。推論の全体は、`runId` のもとでイベントログに残ります。`sdk.getMentalState(runId)` を使えば、すべての仮説と批判を確認できます。実行が失敗した場合、`error` が伝えるのは、完了しなかったことと、どこを見ればよいかだけです（`exposeErrors: true` にするとメッセージそのものが結果に入りますが、プロバイダーの詳細が含まれることがあります）。

### オプション {#options-3}

| オプション | デフォルト | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | ツール名。 |
| `description` | 汎用の説明 | いつこのエージェントに相談すべきかを書く。モデルはこれを見て判断する。 |
| `metadata` | 中リスク | ガバナンスのメタデータ。デフォルトにフィールド単位でマージされる。相談のたびに確認するには `requiresApproval: true` を加える。 |
| `maxInputLength` | `4000` | 受け付ける問題（またはメッセージ）の最大長。 |
| `maxContextLength` | `20000` | JSON テキストとしての `context` の最大長。 |
| `exposeErrors` | `false` | 失敗した実行のエラーメッセージを結果に入れる。 |

`governedAgentTool(agent, options)` は、`sdk.createAgent` で作成したエージェントに対して同じことをします。`message`（と `context`）を受け取り、`{ runId, status, output, error }` を返します。

### 知っておくとよいこと {#good-to-know}

- **時間がかかります。** 認知エージェントの実行ではモデルを何回か呼び出すので、数十秒、ときには数分かかると見込んでください。多くのクライアントは約 1 分で呼び出しをキャンセルします（公式の TypeScript SDK のデフォルトは 60 秒です。Claude Code では `MCP_TOOL_TIMEOUT` で引き上げられます）。対話的に使う場合は、`limits` を小さく保ってください。ただし、クライアントが [進捗通知](./mcp-deploy#progress-notifications) を受け取るたびにタイムアウトをリセットするなら、その必要はありません。エージェントはステップごとに進捗通知を 1 つ送るからです。**クライアントが待つのをやめると、実行は停止され**（認知エージェントでもガバナンス付きエージェントでも同様です）、キャンセルとして記録されます。それ以上モデルは呼び出されず、エージェントが待っていた承認もキャンセルされます。
- **お金がかかります**。相談のたびに、モデルを何回か呼び出します。[予算](./mcp-deploy#governance-policies-budgets-approvals) を設定し、`sdk.getRunCost(runId)` を確認してください。
- **模倣するのは推論の仕方であって、その人が知っていることではありません。** 分身が知っているのは、プロファイル、質問、コンテキストの中身であって、その人の記憶ではありません。回答は「その人ならどう取り組むか」として扱い、本人に `learnFromFeedback` で修正してもらってください。

## 1 つのサーバーに複数のソース {#several-sources-in-one-server}

名前が衝突しないように、接頭辞を付けてソースを組み合わせます。

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

同じ名前のツールが 2 つあると、起動時に、どのツールかを示すメッセージとともに拒否されます。

## 同じツールを自分のエージェントで {#the-same-tools-in-your-own-agents}

ソースはただのツール定義なので、あなたのエージェントは MCP なしでもそれらを使えます。

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

同じルールが適用されます。列挙した書き込みオペレーションは承認を待ち、すべての呼び出しがチェックされ、記録されます。

次は [デプロイ・保護・トラブルシューティング](./mcp-deploy) です。
