# デプロイ・保護・トラブルシューティング

サーバーは、すでにあなたのマシンで動いています（[はじめてのサーバー](./mcp-first-server)、[レシピ](./mcp-recipes)）。このページでは、HTTP でサーバーを共有する方法、ルールと人を処理の流れに組み込む方法、セキュリティのチェックリスト、そしてうまく動かないときの対処を扱います。

## stdio と HTTP、どちらを使う？ {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| 動かし方 | AI アプリが、同じコンピューター上であなたのサーバーをプログラムとして起動する | あなたのサーバーが、どこかで Web サービスとして動く |
| 使える人 | そのコンピューターを使っている人 | アドレスとトークンを渡した人なら誰でも |
| ネットワークへの露出 | なし | 保護すべき HTTP エンドポイントが 1 つ |
| 向いている用途 | 個人用のツール、ローカルのファイル、ちょっとした試し | チーム、全社で使う API やデータベース |
| 起動方法 | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + MCP SDK の HTTP トランスポート |

まずは stdio から始めましょう。複数の人が同じサーバーを必要とするようになったら、HTTP に移行します。

## HTTP で提供する {#serve-over-http}

HTTP トランスポートは公式の MCP SDK が提供し、`createMcpServer` はそこにガバナンス付きのサーバーを渡します。次の完全なファイルは、Web フレームワークを使わずに Node 自身の `http` モジュールだけを使い、**ステートレス** です。つまり、リクエストごとに新しい MCP サーバーが作られるので、ロードバランサーの後ろで複数のコピーを動かせます。

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

それぞれのチェックの目的は次のとおりです。

| チェック | 理由 |
| --- | --- |
| パス `/mcp` | MCP 用のアドレスは 1 つだけ。それ以外はすべて拒否される。 |
| `Host` ヘッダー | これがないと、あなたが訪れた Web ページが、ブラウザーに `localhost` 上のサーバーを呼び出させることができてしまう（「DNS リバインディング」）。デプロイしたら、代わりに公開するホスト名を列挙する。 |
| Bearer トークン | トークンを知っているクライアントだけが入れる。比較は一定時間で行われる。長いランダムなトークンを生成し、コードの外に置く。 |
| `POST` のみ | ステートレスモードでは、`GET` で開く長時間のストリームがない。 |
| リクエストごとのサーバー | リクエストの間で何も共有されない。ツールの定義は一度だけ組み立てて再利用する（同じ定義をもう一度定義してもかまわない）。その代償として、クライアントの「キャンセル」メッセージは別のリクエストとして届くので、キャンセルしたい呼び出しには届かない。代わりに、接続を閉じるか、`approvalTimeoutMs` が経過することで呼び出しが終わる。 |

このファイルは `127.0.0.1` でのみ待ち受けます。公開するには、**HTTPS** を終端するリバースプロキシ（Caddy、nginx、クラウドのロードバランサー）の後ろに置き、ホスト名を `allowedHosts` に追加してください。ネットワーク上で、Bearer トークンを暗号化されていない HTTP で送ってはいけません。

実行できる版が [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) として同梱されています（`MCP_TOKEN=… npm run example:mcp-http`）。本物のクライアントで確認済みです。トークンのない呼び出しは `401` を、偽装した `Host` は `403` を受け取り、トークンを持つクライアントはツールを一覧して呼び出せます。

### HTTP サーバーにクライアントを接続する {#connect-clients-to-an-http-server}

- **Claude Code**：`claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`。共有する `.mcp.json` では、`"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }` と書きます。Claude Code は環境変数を展開するので、トークンはファイルに入りません。
- **あなた自身のエージェント**：`connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })`。[MCP をやさしく解説](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) を参照してください。
- **ほかのアプリケーション**：それぞれのドキュメントで「リモート MCP サーバー」（remote MCP server）や「カスタムコネクター」（custom connector）を探してください。固定のトークンではなく、OAuth によるサインインを使うサーバーしか受け付けないアプリケーションもあります。

## ガバナンス：ポリシー、予算、承認 {#governance-policies-budgets-approvals}

MCP の呼び出しはすべて、`mcp:<server name>` という 1 つの ID のもとで実行されます（`agentId` で変更できます）。ポリシー、予算、アラートは、ほかのエージェントと同じようにこの ID を対象にできます。ポリシーのすべての種類については、[ガバナンス付きエージェント](./governed-agents) を参照してください。

1 つのサーバーに対する **1 日あたりの呼び出し回数の予算** は、次のように設定します。

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

その日の 501 回目の呼び出しは、ポリシーの名前とともに拒否され、その拒否はイベントログに残ります。呼び出しは **開始した時点で** 計上されます。チェックと計上は 1 つのステップで行われるので、同時に届いた 20 件の呼び出しが、そろって上限 2 をすり抜けることはありません。また、呼び出しは失敗も含めて **結果にかかわらず** 計上されます。予算はプロセスのメモリの中で数えられます。サーバーを再起動するとゼロから数え直しになり、HTTP サーバーのコピーはそれぞれ自分の呼び出しを数えます。ポリシーや予算よりも前に、引数がチェックされます。不正な呼び出しは、計上されることも、誰かを待つこともなく拒否されます。

### 承認：まず人が「はい」と言う {#approvals-a-human-says-yes-first}

次の場合、ツールは実行の前に人の判断を待ちます。

- その定義に `metadata: { requiresApproval: true }` がある場合。`openApiTools` の書き込みオペレーションでは、これがデフォルトです。
- または、あなたが名前を挙げたツールについて、ポリシーがそれを求める場合。ツールの定義には手を加えずに済みます。

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

待っている間、その呼び出しは `sdk.getPendingApprovals()` に現れます。あなたのコードは `sdk.approveAction(id, who, reason)` または `sdk.rejectAction(id, who, reason)` で判断し、どちらも記録されます（`approval.requested`、`approval.approved` または `approval.rejected`）。stdio サーバーは、自分のターミナルで尋ねることができません。標準入力がプロトコルを運んでいるからです。そのため、判断は別の経路から届きます。たとえば、このマシン上で、サーバーと同じプロセスの中で動く小さな管理用エンドポイントです。

**管理用エンドポイントは、何が実行されるかを決めます。MCP エンドポイントと同じように保護してください。** そうしないと、ブラウザーで開いているページが `localhost` に到達し（DNS リバインディング）、あなたの代わりに承認できてしまいます。そこで、このエンドポイントは `127.0.0.1` でのみ待ち受け、自分自身の `Host` だけを受け付け、`Origin` を含むリクエストはすべて拒否し（ブラウザーはこれを付けますが、スクリプトや `curl` は付けません）、秘密のヘッダーを要求します。

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

あとは、`curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` で待っているものを一覧し、`curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` で判断します。この方法で作った完全なサーバーが [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts) として同梱されています。最初から最後まで通して確認済みです（呼び出しが待つこと、偽装した `Host`、`Origin` の付いたリクエスト、秘密のないリクエストが `403`/`401` を受け取ること、承認するとツールが実行されること、クライアントが去るとプロセスが終了すること）。

承認が待っていることを知らせてもらうには、`approval.requested` に対する [インシデントルール](./incidents#rules) を、Slack やメールの通知手段とともに追加してください。承認待ちは、呼び出しが待っているプロセスのメモリの中にあります。HTTP サーバーのコピーが複数ある場合は、その承認待ちを保持しているコピーを通じて判断してください（または、承認が必要なツールについてはコピーを 1 つだけ動かしてください）。

::: warning 承認待ちはどれだけ続くか
多くのクライアントは、約 1 分で呼び出しをキャンセルします。承認待ちは、次の場合にキャンセルされ、ツールは決して実行されません。

- クライアントが呼び出しをキャンセルしたとき（stdio、またはステートフルな HTTP セッション）。
- 接続が閉じたとき。stdio のクライアントが終了した場合や、HTTP リクエストが閉じられた場合です。
- `approvalTimeoutMs` 以内に誰も判断しなかったとき。**デフォルトは 50 秒** で、ほとんどのクライアントが待つ時間より短くしてあります。クライアントがもっと長く待つ場合（`MCP_TOOL_TIMEOUT` を引き上げた Claude Code など）は、`createMcpServer`/`serveMcpOverStdio` で設定してください。

**ステートレスな HTTP サーバーでは、あとの 2 つしか当てはまりません**。「キャンセル」のリクエストを、それがキャンセルする呼び出しと結び付けられないからです。接続を閉じないままあきらめたクライアントがいると、承認は `approvalTimeoutMs` まで待ちの状態で残ります。そして、その間に与えられた「はい」は、もう誰も答えを待っていないのに、ツールを実行してしまいます。`approvalTimeoutMs` はクライアントが待つ時間より十分に短くするか（例では 20 秒）、承認が必要なツールは stdio かステートフルなセッションで提供してください。

キャンセルされた後に遅れて届いた「はい」は "already rejected" で失敗します。また、呼び出しは承認の後にもう一度チェックされるので、その間にクライアントが去っていれば、ツールは実行されません。MCP を通じた承認は、すばやい判断に向いています。何時間もかかる判断については、ツールには *リクエストを提出する* ことだけをさせ、それをチームが後で処理するようにしてください。
:::

ほとんどの MCP アプリケーションも、ツールを呼び出す前に毎回ユーザーに確認します（Claude Desktop はデフォルトでそうします）。その確認はアプリケーションの中で行われます。SDK の承認は、あなたのサーバーで、あなたのルールのもとで行われ、記録されます。データを変更するものについては、両方を使ってください。

## 進捗通知 {#progress-notifications}

クライアントは、呼び出しがどう進んでいるかを知らせるよう求めることができます。そのためには、呼び出しとともに `progressToken` を送ります（公式の TypeScript SDK では、`onprogress` を渡すとそうなります）。するとサーバーは、呼び出しのイベントと、`cognitiveAgentTool` や `governedAgentTool` が開始するエージェントの実行のイベントについて、そのすべてに 1 つずつ `notifications/progress` を送ります。それぞれには、毎回 1 ずつ増える `progress` と、短い `message` が付きます。

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

メッセージが示すのは、ステップ、ツール、認知オペレーションの名前です。名前が出るツールは、モデルが選んだツールと、エージェントが呼び出すすべてのツールで、サーバーが公開していないエージェントのツールも含まれます。引数、結果、エラーのテキストが含まれることは決してありません。`total` はありません。1 つの実行が何ステップかかるかは、誰にも前もってわからないからです。どの通知も結果より前に送られ、結果の後に送られることはありません。Streamable HTTP では、通知はレスポンスのストリーム（SSE）に乗って届きます。`enableJsonResponse: true` を指定して作成したトランスポートは、ただの JSON で応答し、通知を捨てます。`progressToken` を送らないクライアントには、通知は届きません。

追跡されるのは、ツールが開始したエージェントの実行だけで、1 階層分までです。そのエージェントが自分のエージェントツールを通じて開始する実行は追跡されません。リアルタイムのイベントに対応していないストアの上に手作業で組み立てたエージェントも、追跡されません。通知はまとめられません。すべてのイベントが 1 つの通知になるので、長い認知エージェントの実行では、数百件の通知が送られることもあります。

進捗通知によって変わること、変わらないことは次のとおりです。

- **長く待つのは、進捗を受け取るたびにタイムアウトをリセットするクライアントだけ。** TypeScript SDK の場合：`client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`。進捗を表示しても固定のタイムアウトを保つクライアントは、以前と同じ時点で待つのをやめます。これを当てにする前に、あなたのアプリケーションがどう動くかを確認してください。
- **そうしたクライアントで重要なのは、呼び出しの長さではなく、最も長い沈黙** です。つまり、1 回のモデル呼び出し、1 つの遅いツール、または 1 つの承認です。ツールの実行中や承認の待機中には何も送られないので、`approvalTimeoutMs` の 50 秒は引き続き適用されます。また、モデルやツールの呼び出しは、1 回ずつがどれもクライアントのタイムアウト内に収まる必要があります。
- **そうすれば、エージェントはもっと長くかけられる**：各ステップが通知を送るので、認知エージェントの `limits.timeoutMs` をクライアントのタイムアウトより長くできます。ほかのクライアントでは、[エージェントのレシピ](./mcp-recipes#an-agent-your-reasoning-twin) の小さな上限を保ってください。

## セキュリティのチェックリスト {#security-checklist}

サーバーを共有する前に、次を確認してください。

- [ ] **公開は最小限に。** `tools` には必要なツールだけを列挙し、読み取り専用のソースを優先し、書き込みオペレーションは 1 つずつ追加します。
- [ ] **書き込みには人が必要。** 理由がない限り、書き込みツールの `requiresApproval` は有効のままにしておき、外す場合はその理由を記録します。
- [ ] **その下でも最小権限。** 読み取り専用のスコープを持つ API トークン、SELECT しかできないデータベースのロール、共有してよいものだけを含むフォルダーを使います。サーバーのチェックは 2 つ目の鍵であって、1 つ目の鍵ではありません。
- [ ] **秘密情報はコードの外に。** トークンは環境変数から渡し（`claude mcp add … -e TOKEN=…`）、決して spec、説明、ファイルには書きません。
- [ ] **結果は信頼できないテキスト。** API、ドキュメント、データベースが返すものは、一字一句そのままモデルに届きます。ページに「これまでの指示を無視して…」と書かれていることもあります。信頼できないソースと、承認なしの強力な書き込みツールを、同じ会話に同時に与えないでください。
- [ ] **HTTP サーバー**：HTTPS、長いランダムなトークン、`Host` の許可リスト、そしてプロキシの後ろで `127.0.0.1` で待ち受けること。
- [ ] **エラーの詳細は内側にとどめる**（`exposeErrorDetails` はオフ。これがデフォルトです）。入力に対する拒否（不正な引数、フォルダーの外のパス、クエリではない SQL）は、それでもクライアントに説明されます。
- [ ] **予算** を、お金がかかるものすべてに設定します。エージェント（モデルの呼び出し）と有料の API です。
- [ ] 最初の数日が過ぎたら **イベントログを読みます**。どのツールが呼ばれているか、どの呼び出しが拒否されているかを確認します。

MCP プロジェクトは、攻撃と防御についての詳しいガイドを公開しています：[Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)。

## トラブルシューティング {#troubleshooting}

| 症状 | 考えられる原因 | 対処 |
| --- | --- | --- |
| クライアントがすぐに切断される、またはサーバーが不正な JSON を送ったと言われる | 何かが **標準出力** に書き込んでいる：あなたのコードやライブラリの中の `console.log` | `console.error`（標準エラー出力）を使う。標準出力はプロトコルを運んでいる。 |
| `npx tsx server.ts` が 1 行だけ表示して止まったように見える | 正常：stdio サーバーはクライアントを待っている | [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector) でテストするか、アプリを接続する。 |
| Claude Desktop にサーバーが表示されない | 設定ファイルの JSON のエラー、相対パス、アプリを再起動していない | JSON を確認し、絶対パスを使い、アプリを終了して再起動し、`mcp*.log` を読む（[場所](./mcp-first-server#_5-connect-it-to-claude-desktop)）。 |
| ログに `npx: command not found` / `node: not found` と出る | アプリにシェルの `PATH` が見えていない（nvm でよくある） | `npx` のフルパスを使う（`which npx` / `where npx`）。 |
| 一覧にツールが見当たらない | そのツールが `tools` に入っていない | その名前か定義を `tools` に追加する。そうしない限り、何も公開されない。 |
| 起動時に `Another tool named "x" is already defined` と出る | 2 つのソースが同じ名前のツールを作っている | 各ソースに `prefix` を付ける。 |
| `Tool execution failed: <name>` とだけ表示される | 原因に内部の詳細が含まれうるので、隠されている | イベントログで実行を読むか、開発中は `exposeErrorDetails: true` を設定する。 |
| 呼び出しがタイムアウトする | ツールが遅い（エージェントであることが多い） | エージェントの `limits` を小さくする。クライアントのタイムアウトを引き上げる（Claude Code：`MCP_TOOL_TIMEOUT`）。または、[進捗通知](#progress-notifications) を受け取るたびにタイムアウトをリセットするクライアントを使う。 |
| 結果が途中で切れている | サイズの上限（`truncated: true`）、またはクライアント自身の上限 | `maxResponseBytes`、`maxRows`、`maxFileBytes` を引き上げる。Claude Code：`MAX_MCP_OUTPUT_TOKENS`。 |
| 書き込みツールが "Approval no decision within 50000 ms" と答える | 時間内に誰も承認しなかった | もっと早く承認する（[承認](#approvals-a-human-says-yes-first) を参照）、`approvalTimeoutMs` を引き上げる、または意図して `requiresApproval: false` を設定する。 |
| `events/` や `golden-traces/` のようなフォルダーが思わぬ場所に現れる | イベントログに絶対パスを指定していない（または SDK のバージョンが古い） | `eventStore: new FileEventStore(<absolute path>)` を渡す。現在のバージョンは、ほかのフォルダーを使うときにしか作らない。 |
| `Cannot find module 'node:sqlite'` | Node.js が 22.13 より古い | Node.js をアップグレードするか、`better-sqlite3` を使う。 |
| `… is not JSON. For a YAML spec, parse it yourself` | OpenAPI の spec が YAML で書かれている | 自分で解析し（`yaml` パッケージ）、そのオブジェクトを `spec` として渡す。 |
| `cannot resolve the server URL "/v3"` | spec のサーバーが相対パスで、しかも spec がファイルから読み込まれた | `baseUrl` を渡す。 |
| Inspector が起動しない | Inspector の [ドキュメント](https://modelcontextprotocol.io/docs/tools/inspector) は Node.js 22.19 以上を求めている（2026-09-24 に確認） | Inspector を動かすために Node.js をアップグレードする（サーバーは 20 以上のままでよい）。 |
| 2026-07-28 のプロトコルしか話さないクライアントが接続できない | サーバーが受け付けるのはリビジョン 2024-10-07 から 2025-11-25 まで（MCP TypeScript SDK 1.30） | 以前のリビジョンに対応したクライアントを使う。Inspector の [ドキュメント](https://modelcontextprotocol.io/docs/tools/inspector) によれば、Inspector は旧来のものと 2026-07-28 の両方の「世代」をネゴシエートできる（2026-09-24 に確認）。 |
| インシデントアラートを有効にすると、拒否された MCP の呼び出しがすべてアラートになる | 失敗した MCP の呼び出しは、失敗した実行として扱われる | `when: (event) => event.metadata?.agentId !== 'mcp:docs'` で絞り込むか、その重大度を下げる。 |

### 何が起きたかを読む {#reading-what-happened}

すべての呼び出しとすべてのリソースの読み取りは、それぞれ 1 つの実行です。デフォルトのファイルストアでは、各実行が `events/` フォルダーの中の 1 つの JSON ファイルになります。コードから読むには、次のようにします。

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

ツールの呼び出しは `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed` の順に並び、リソースの読み取りは `run.started → resource.read → run.completed` の順に並びます。`resource.read` には、提供したものの URI、サイズ、SHA-256 が入っています。[イベントカタログ](../reference/events) を参照してください。
