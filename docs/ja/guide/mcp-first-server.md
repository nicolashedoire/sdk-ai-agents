# 5 分ではじめての MCP サーバー

チームの名簿から「請求の担当は誰？」に答える小さな MCP サーバーを作り、AI を使わずにテストしてから、Claude Desktop と Claude Code に接続します。すべてのコマンドを示しており、前提知識は求めません。わからない用語があれば、[MCP をやさしく解説](./mcp) を参照してください。

## 必要なもの {#what-you-need}

- **Node.js 20.11 以降**：`node --version` で確認します（SQLite のレシピには 22.13 以上が必要です。MCP Inspector のドキュメントでは 22.19 以上が求められています）。
- ターミナル。
- AI アプリからサーバーを使うには、[Claude Desktop](https://claude.ai/download) または [Claude Code](https://code.claude.com/docs)。最初のステップでは必要ありません。

API キーは必要ありません。このサーバーは言語モデルを呼び出さないからです。サーバーを使う AI アプリケーションが、自分のモデルを持っています。

## 1. プロジェクトを作成する {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

各行の役割は次のとおりです。

| コマンド | 理由 |
| --- | --- |
| `npm init -y` | `package.json` を作成する。プロジェクトの依存関係を列挙するファイル。 |
| `npm pkg set type=module` | モダンな JavaScript のモジュール（`import`）を使う。SDK がこれを必要とする。 |
| `npm install @sdk-ai-agents/core …` | この SDK、zod（引数を記述するため）、公式の MCP SDK（1.x 系の 1.30 以降。この SDK がテストされているバージョン）をインストールする。 |
| `npm install --save-dev tsx` | ビルドの手順なしで、TypeScript のファイルを直接実行する。 |

## 2. サーバーを書く {#_2-write-the-server}

`server.ts` という名前のファイルを作成します。

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

上から順に読んでいきましょう。

1. **データ**：ここではファイル内のリストですが、実際には API、ファイル、データベースになります。
2. **SDK**：すべての呼び出しをガバナンス付きのパイプラインに通し、イベントログに書き込みます。AI アプリはあなたが選べない作業ディレクトリからサーバーを起動するので、ログはこのファイルの隣（`import.meta.dirname`）に置きます。
3. **ツール**：**名前** と **説明** は、モデルがいつ呼び出すかを決めるために読むものなので、あなたのコードについて何も知らない読み手に向けて書いてください。**スキーマ** は引数を列挙します。SDK はそれを MCP クライアントが見る JSON Schema に変換し、合わない呼び出しを拒否します。`readOnly: true` は、このツールが何も変更しないことをクライアントに伝えます。
4. **サーバー**：`serveMcpOverStdio` は、標準入力と標準出力で MCP を話します。`tools` のリストは必須です。列挙しなかったツールは、定義されていても決して見えません。

## 3. 実行する {#_3-run-it}

```sh
npx tsx server.ts
```

次の表示だけが出るはずです。

```text
MCP server "team" ready on stdio, waiting for a client
```

**止まっているように見えますが、それで正常です。** stdio サーバーは、AI アプリが入力を通じて話しかけてくるのを待っています。止めるには <kbd>Ctrl</kbd>+<kbd>C</kbd> を押します。自分で起動することはめったにありません。起動するのは AI アプリです。

::: danger 標準出力には決して出力しない
stdio サーバーでは、標準出力 **こそが** プロトコルです。コード内の `console.log` はメッセージを壊し、クライアントは切断されます。自分のメッセージには `console.error` を使ってください。これは標準エラー出力に送られ、クライアントはそれをログに残します。
:::

## 4. MCP Inspector でテストする {#_4-test-it-with-the-mcp-inspector}

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) は公式のテストツールです。MCP クライアントとして振る舞う Web ページ（またはコマンドライン）で、AI を使わずにサーバーを試せます。そのドキュメントでは、Node.js 22.19 以降が求められています（2026-09-24 に確認）。

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

コマンドは、使い捨てのトークン付きのアドレスを表示します。それをブラウザーで開き、**Connect** をクリックし、**Tools** を開いて **List Tools** をクリックし、`find_colleague` を選んで `billing` と入力し、実行します。Ada が返ってきます。

ターミナルのほうがよければ、同じチェックをコマンドラインから行えます。

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

`inspector` の後（または `--cli` の後）にあるものはすべて、サーバーを起動するコマンドです。

## 5. Claude Desktop に接続する {#_5-connect-it-to-claude-desktop}

Claude Desktop は、起動するサーバーを設定ファイルから読み込みます。アプリから開いてください：**Claude メニュー → Settings… → Developer → Edit Config**。ファイルの場所は次のとおりです。

| システム | パス |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

`mcpServers` の下に、`server.ts` の **絶対パス** を使ってサーバーを追加します（絶対パスは、プロジェクトのフォルダーで `pwd` を実行すると得られます。Windows では `cd` です）。

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

次に、**Claude Desktop を完全に終了して、もう一度起動します**。ファイルは起動時にしか読み込まれないからです。サーバーはコネクターの一覧に表示されます（メッセージ欄の「+」ボタンから **Connectors**）。「私のチームで請求の担当は誰？」と尋ねてみてください。Claude は `find_colleague` を使う許可を求め、それから「Ada」と答えます。

表示されない場合：

- JSON を確認し（カンマが 1 つ抜けているだけで壊れます）、パスが絶対パスであることを確認します。
- ログに `npx` や `node` が見つからないと出ている場合（Node.js を nvm でインストールしたときによくあります）、`"npx"` を、`which npx`（macOS）または `where npx`（Windows）で得られるフルパスに置き換えます。
- ログを読みます。macOS では `~/Library/Logs/Claude/mcp*.log`、Windows では `%APPDATA%\Claude\logs\mcp*.log` です。`mcp-server-team.log` には、サーバーが標準エラー出力に書いた内容が入っています。

これらのパスとメニューは、2026 年 9 月時点の MCP のドキュメント（[ローカルの MCP サーバーに接続する](https://modelcontextprotocol.io/docs/develop/connect-local-servers)）にもとづいています。Claude Desktop が変わっていたら、そのページを確認してください。

## 6. Claude Code に接続する {#_6-connect-it-to-claude-code}

どのフォルダーからでも、コマンド 1 つで接続できます（パスは置き換えてください）。

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- `--` の後にあるものはすべて、サーバーを起動するコマンドです。
- サーバーは現在のプロジェクトにだけ追加されます（`--scope local`、デフォルト）。すべてのプロジェクトで使うには `--scope user` を、コミットして共有できる `.mcp.json` ファイルに書き込むには `--scope project` を使います。
- 環境変数（たとえばサーバーが必要とする API トークン）：`claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`。
- `claude mcp list` で確認するか、Claude Code の中で `/mcp` と入力します。

2026-09-24 に、`claude mcp add --help`（Claude Code 2.1.173）と [Claude Code の MCP ドキュメント](https://code.claude.com/docs/en/mcp) で確認しました。

## 7. ほかのアプリケーション {#_7-other-applications}

ほとんどの MCP アプリケーションが求めるのは、同じ 3 つのものです。**コマンド**（`npx`）、その **引数**（`-y`、`tsx`、`server.ts` の絶対パス）、そして任意の **環境変数** です。それぞれのドキュメントを参照してください。たとえば [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) や [Cursor](https://cursor.com/docs/context/mcp) です。

## 8. 何が起きたかを見る {#_8-see-what-happened}

すべての呼び出しは、イベントログに書き込まれます。`server.ts` の隣にある `events/` フォルダーを開いてください。各ファイルが 1 回の呼び出し、つまりエージェント ID `mcp:team` の 1 回の **実行** で、そのステップが含まれています。

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

これらの実行は、SDK のほかの機能を使って、読んだり、リプレイしたり、料金を算出したり、アラートにしたりできます。[トレーサビリティとリプレイ](./observability) を参照してください。

## 次に進む先 {#where-to-go-next}

- チームの名簿を本物に置き換えましょう：[Web API、フォルダー、データベース、エージェントを、それぞれ 1 行で](./mcp-recipes)。
- HTTP でサーバーをチームと共有し、承認と予算を追加しましょう：[デプロイ・保護・トラブルシューティング](./mcp-deploy)。
