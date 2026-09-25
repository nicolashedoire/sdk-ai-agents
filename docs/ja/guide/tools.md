# ツール

**ツール** とは、エージェントが呼び出せる関数のことです。注文を調べる、ファイルを読む、Web を検索する、別のエージェントに尋ねる、といったものです。ツールは自分で書くことも、**ツールソース** からすぐに使える形で受け取ることもできます。ツールソースには、フォルダー、データベース、Web API、Web、エージェント、MCP サーバーがあります。

ツールがどこから来たものであっても、すべての呼び出しは **ガバナンスされます**。そのツールは呼び出し元に与えられたツールの 1 つでなければならず、引数はチェックされ、ポリシーと予算が適用され、人に承認を求めることができ、失敗はリトライでき、すべてがイベントログに書き込まれます。

## 1 行で {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

これでエージェントは、ハンドブックを一覧し、読み、検索できるようになり、Web を検索して読むこともできます。ツールは 8 つで、すべて読み取り専用です。

## 自分のツール {#your-own-tools}

`sdk.defineTool` は、ツールを SDK に登録して、それを返します。zod スキーマが引数を記述し、ハンドラーは検証済みで型の付いた引数を受け取ります。

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

| フィールド | |
| --- | --- |
| `name`、`description` | モデルが目にし、それをもとに判断するもの。英字、数字、`_`、`-` を使い、64 文字以内にする。それ以外の名前は、モデルの API や MCP クライアントに拒否されることがある。 |
| `schema` | zod スキーマで表した引数。`.describe()` のテキストはモデルに示される。合わない呼び出しは、ほかの何よりも先に拒否される。 |
| `handler(params, context?)` | あなたのコード。`context` は `runId`、`agentId`、そして `signal` を持つ。`signal` は、呼び出し元が待つのをやめると中断される。 |
| `metadata` | `riskLevel`（`low`、`medium`、`high`）、`requiresApproval`、`readOnly`、`category`。[呼び出しはどうガバナンスされるか](#how-calls-are-governed) を参照。デフォルトでは何も設定されていない。 |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`。冪等なツールに限る。 |
| `version` | デフォルトは `1.0.0`。エージェントの設定ハッシュの一部なので、変更の前と後の実行を [比較](../reference/sdk-api#comparisons-and-impact) できる。 |
| `capability` | グループ分けのためのラベル。組み込みのソースはこれを設定する（`web:search`、`folder:handbook`…）。 |

1 つの名前は、SDK ごとに 1 回だけ登録されます。すでに使われている名前に対しては、バージョンにかかわらず、`sdk.defineTool` がエラーをスローします。2 つのソースの名前が衝突しうる場合は、それぞれに接頭辞を付けてください。すべてのフィールドは [SDK API](../reference/sdk-api#tools-tooldefinition) に載っています。

## 組み込みのツールソース {#the-built-in-tool-sources}

各ソースはツール定義を返し、それはそのまま `sdk.defineTool` に渡せます（`connectMcpServer` の場合は、その `tools` の中にあります）。どのソースも、ツールの名前を変えられます。接頭辞を付けるか（`prefix`。MCP では `toolPrefix`）、エージェントのツールなら名前全体を指定します（`name`）。

| ソース | エージェントができること | ツール名 | リスク、読み取り専用 | 必要なもの | 詳細 |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | 1 つのフォルダーのテキストファイルを一覧し、読み、検索する。フォルダーの外には決して出ない | `list_files`、`read_file`、`search_files` | 低、読み取り専用 | フォルダー | [ドキュメントのフォルダー](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | テーブルを一覧する、1 つを記述する、`SELECT` を 1 文実行する（デフォルトでは最大 100 行） | `list_tables`、`describe_table`、`query` | 中、読み取り専用 | `sqliteReadOnly(db)`（`node:sqlite` または `better-sqlite3`）、または `postgresReadOnly({ pool })`（`pg`） | [読み取り専用のデータベース](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Web API を呼び出す。オペレーションごとに 1 つのツール。`include` に列挙しない限り `GET` のみ | `operationId`、なければメソッドとパス（`get_pets_petId`） | `GET`：低、読み取り専用。それ以外：高、承認が必要 | OpenAPI 3 の記述（URL、ファイル、またはオブジェクト） | [Web API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Web を検索する、ページや PDF を読む、arXiv、Wikipedia、GitHub を検索する | `web_search`、`web_fetch`、`arxiv_search`、`wikipedia_search`、`github_search` | `web_fetch` は中、それ以外は低。すべて読み取り専用 | 始めるのに必要なものはない（DuckDuckGo）。PDF には `unpdf`、コードの検索には GitHub のトークン | [Web で調べる](./web-research) |
| `governedAgentTool(agent)`、`cognitiveAgentTool(agent)` | 別のエージェントに尋ねる。ガバナンス付きエージェントは `message` に答え、認知エージェントは `problem` について推論して、その決定を返す | `ask_<agent name>` | 中、読み取り専用の印はない | エージェント。したがってモデルのキー | [エージェント](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | 任意の MCP サーバーのツールを使う | サーバーでの名前（前に `toolPrefix` が付く） | 何も設定されない。`metadata` を指定すると、取り込んだすべてのツールに適用される | `@sdk-ai-agents/core/mcp` と `@modelcontextprotocol/sdk`。使い終わったら `close()` | [MCP サーバーのツールをエージェントで使う](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

MCP のツールでは、2 つの点が異なります。SDK がチェックするのは引数がオブジェクトであることだけで（残りはサーバーがチェックします）、読み取り専用などのサーバー自身のヒントは取り込まれません。`metadata` は自分で設定してください。

## エージェントにツールを渡す {#giving-tools-to-an-agent}

`createAgent({ tools })` と `createCognitiveAgent({ tools })` が受け取るのはツールです。そのため、上の例のように、ソースの定義はまず `sdk.defineTool` に通してください。エージェントが実行できるのは **自分のツールだけ**、つまり `tools` のツールと、その `capabilities` のツールだけです。モデルがそれ以外のツールの名前を挙げても、拒否されます（`allowed-tools`）。

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

パッケージからインポートした `defineTool` は、ツールを登録せずに組み立てます。SDK は、そのツールを使うエージェントが作成されたときにそれを登録します。その名前のツールがすでに登録されている場合は、登録済みのほうが残り、そちらが実行されます。

### ケイパビリティ {#capabilities}

ケイパビリティは、複数のエージェントに渡すツールのグループに名前を付けたものです。ツールの `capability` ラベルは、ケイパビリティではありません。ケイパビリティは `sdk.defineCapability` で定義してください。

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### エージェントの外で {#outside-an-agent}

`sdk.listTools()` は、SDK に登録されているすべてのツールを返します。`sdk.executeTool(name, parameters, options?)` は、同じガバナンスのパイプラインを通してツールを 1 つ呼び出し、それを独立した実行とし（`agentId` を指定しない限り、エージェント ID は `external`）、ハンドラーが返したものを返します。

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

オプションは次のとおりです。`runId` は既存の実行の中に呼び出しを記録し、`allowedTools` はこの呼び出し元が実行してよいものを制限し、`signal` は呼び出しをキャンセルし、`approvalTimeoutMs` は承認を待つ時間に上限を設け、`onEvent` は呼び出しをリアルタイムで見守ります。拒否されると `PolicyViolationError` がスローされ、引数が不正な場合やハンドラーが失敗した場合は `ToolExecutionError` がスローされます。

同じツールは、ほかの場所でも使えます。[研究](./studies#research-through-your-sources) は、定義済みのツールの **名前** を `sources` として受け取ります。MCP サーバーは、あなたが渡したツール定義や名前のツールを、Claude Desktop、Claude Code、任意の MCP クライアントに提供します（[なんでも MCP サーバーにする](./mcp-recipes) を参照）。

## 呼び出しはどうガバナンスされるか {#how-calls-are-governed}

呼び出しは次のステップをこの順番で通り、最初の拒否で止まります。

1. **呼び出し元のツール。** 呼び出し元に与えられていないツールは拒否されます。与えられたツールとは、エージェントのツール、研究のソース、MCP サーバーのリスト、または `allowedTools` です。`allowedTools` を指定しない `executeTool` は、登録済みのどのツールでも実行できます。
2. **引数。** 誰かに何かを尋ねる前に、スキーマと照合してチェックされます。
3. **ポリシー。** すべてのグローバルポリシーと、エージェントのすべてのポリシーです（[ガバナンス付きエージェント](./governed-agents#_3-policies) を参照）。
4. **承認。** ツールかポリシーが承認を求める場合です。
5. **予算。** 呼び出しは、結果にかかわらず、開始した時点で計上されます。
6. **ツールの実行。** リトライも含みます。

### リスクレベル {#risk-levels}

`riskLevel` はラベルです。どれだけ慎重になるべきかを、人とコードに伝えます。**どのポリシーもこれを読みません**。呼び出しをブロックすることも、遅らせることもありません。これに応じて何かをするには、ツールに `requiresApproval` を付けるか、ラベルをポリシーに変えてください。

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

このリストは、ポリシーを定義した時点で作られます。ツールを先に定義してください。

### 承認 {#approvals}

ツールに `requiresApproval: true` がある場合（`openApiTools` の書き込みオペレーションではこれがデフォルト）、またはポリシーのルールが `require_approval` を指定する場合、呼び出しは人を待ちます。待っている呼び出しは `sdk.getPendingApprovals()` に現れます。`sdk.approveAction(id, who, reason?)` はそれを実行させ、`sdk.rejectAction(id, who, reason?)` はそれを拒否します。それより先に呼び出し元が待つのをやめた場合（実行の停止、`signal` の中断、`approvalTimeoutMs` の経過。MCP サーバーではデフォルトで 50 秒）、承認はキャンセルされ、ツールは決して実行されません。[承認](./mcp-deploy#approvals-a-human-says-yes-first) を参照してください。

### 読み取り専用のツール {#read-only-tools}

`readOnly: true` は、そのツールが何も変更しないことを示します。MCP クライアントにはこれが `readOnlyHint` として示され、`openApiTools` は読み取り専用のオペレーションだけをリトライします。これによって緩むポリシーはなく、検証もされません。読み取り専用の印が付いたハンドラーでも、書き込むなら書き込みます。読み取るだけのソースは、できるところでこれを強制しています。`folderTools` には書き込む手段がなく、`sqliteReadOnly` と `postgresReadOnly` は、各クエリをデータベース自体の中で読み取り専用として実行します。

### リトライ {#retries}

`retry` は、失敗したハンドラーをもう一度実行します。対象はハンドラーのエラーだけで、不正な引数や拒否がリトライされることは決してありません。各リトライは `tool.retry` イベントになり、呼び出しは予算に 1 回だけ計上されます。`openApiTools`、`webTools`、`connectMcpServer` は、それぞれのツールのための `retry` オプションを受け取ります。[リトライとフォールバック](./resilience#tools) を参照してください。

### 予算 {#budgets}

`budgetLimit` を持つ `budget` ポリシーは、期間ごとのツール呼び出しの回数に上限を設けます。対象は、1 つのエージェント（`agentId`）、1 つのツール（`toolName`）、またはすべてです。

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

`maxTokens` と `maxCost` はモデル呼び出しを数え、使い切るとツール呼び出しを拒否します。[API コスト](./costs#budgets) を参照してください。

### 信頼できない出力 {#untrusted-output}

ツールが返したものはモデルに戻ります。そして、ページ、ファイル、API の応答には、モデルに向けて書かれた指示が含まれていることがあります（プロンプトインジェクション）。Web ツールはすべての応答に `untrusted: true` の印を付け、その説明は、中に見つかった指示には決して従わないようモデルに伝えます。ほかのソースは、内容をそのまま返します。システムプロンプトでツールの結果はデータであると伝え、各エージェントには必要なツールだけを渡し、何かを変更するツールは承認で保護してください。研究は、すべての結果をデータとしてモデルに示します。[Web ツールのセキュリティのルール](./web-research#security-rules) を参照してください。

### 呼び出しが記録するもの {#what-a-call-records}

| イベント | いつ |
| --- | --- |
| `action.executing` | 呼び出しが提案されたとき。どのチェックよりも前 |
| `policy.checked` | ポリシーをチェックするたび。続いて判定 |
| `policy.violated` | 拒否。呼び出し元に与えられていないツール（`allowed-tools`）、ポリシー、使い切った予算 |
| `approval.requested`、`approval.approved`、`approval.rejected` | 人の判断 |
| `tool.called` | ハンドラーが始まるとき |
| `tool.retry` | リトライ。その待ち時間とエラー付き |
| `action.executed`、`action.failed` | 結果またはエラー（不正な引数を含む）。所要時間付き |

`executeTool` で行った呼び出しは、`runId` を指定しない限り、それだけで 1 つの実行になります。`run.started`（モードは `tool`）、続いて `run.completed` または `run.failed` です。[イベントカタログ](../reference/events#reasoning-and-actions) を参照してください。

## ソースを選ぶ {#choosing-a-source}

| 必要なもの | 使うもの |
| --- | --- |
| 自分のコードやサービス | `sdk.defineTool` |
| フォルダーの中のドキュメント | `folderTools` |
| SQL データベースからの回答。書き込みの危険はまったくなしで | `databaseTools` と、`sqliteReadOnly` または `postgresReadOnly` |
| OpenAPI の記述を公開している Web API | `openApiTools` |
| OpenAPI の記述を公開していない Web API | `sdk.defineTool`。ハンドラーの中で `fetch` を使う |
| Web、論文、百科事典の記事、GitHub 上のコード | `webTools` |
| 別のエージェントの回答や決定 | `governedAgentTool` または `cognitiveAgentTool` |
| すでに MCP サーバーを持っているシステム | `connectMcpServer` |
| 研究の情報源 | `webTools` の検索ツール、または MCP サーバーの検索ツール |
| Claude Desktop や Claude Code で使う自分のツール | 逆の方向：ツールを [MCP サーバー](./mcp-recipes) で提供する |
