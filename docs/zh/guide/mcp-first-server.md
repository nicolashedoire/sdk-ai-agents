# 5 分钟搭建你的第一个 MCP 服务器

我们将构建一个极小的 MCP 服务器，它根据一份团队名单回答“谁负责计费？”，先在不借助任何 AI 的情况下测试它，然后把它接入 Claude Desktop 和 Claude Code。每条命令都会给出；不预设你已经知道任何东西。如果有哪个术语不清楚，请参见 [MCP 通俗解释](./mcp)。

## 你需要什么 {#what-you-need}

- **Node.js 20.11 或更高版本**——用 `node --version` 检查。（SQLite 配方需要 22.13+。MCP Inspector 的文档要求 22.19+。）
- 一个终端。
- 如果要从 AI 应用中使用这个服务器：[Claude Desktop](https://claude.ai/download) 或 [Claude Code](https://code.claude.com/docs)。前面几步用不到。

不需要 API 密钥：这个服务器不调用语言模型。使用它的 AI 应用有自己的密钥。

## 1. 创建项目 {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

每一行的作用：

| 命令 | 为什么 |
| --- | --- |
| `npm init -y` | 创建 `package.json`，即列出项目依赖的文件。 |
| `npm pkg set type=module` | 使用现代的 JavaScript 模块（`import`）。SDK 要求这样做。 |
| `npm install @sdk-ai-agents/core …` | 安装本 SDK、zod（用来描述参数）以及官方的 MCP SDK，版本为 1.30 或 1.x 范围内的更高版本（本 SDK 就是用这个版本测试的）。 |
| `npm install --save-dev tsx` | 直接运行 TypeScript 文件，无需构建步骤。 |

## 2. 编写服务器 {#_2-write-the-server}

创建一个名为 `server.ts` 的文件：

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

从上到下读一遍：

1. **数据**——这里是文件中的一个列表；在实际中，是你的 API、文件或数据库。
2. **SDK**——它让每一次调用都经过受治理的处理流程，并把调用写入事件日志。日志放在这个文件旁边（`import.meta.dirname`），因为 AI 应用会从一个你无法选择的工作目录启动服务器。
3. **工具**——**名称**和**描述**是模型用来决定何时调用它的依据，所以请为一个对你的代码一无所知的读者来写。**schema** 列出参数；SDK 会把它转换成 MCP 客户端看到的 JSON Schema，并拒绝不匹配的调用。`readOnly: true` 告诉客户端这个工具不会改变任何东西。
4. **服务器**——`serveMcpOverStdio` 通过标准输入和标准输出使用 MCP 通信。`tools` 列表是必需的：你没有列出的工具永远不可见，即使它已经被定义。

## 3. 运行它 {#_3-run-it}

```sh
npx tsx server.ts
```

你应该只看到下面这一行，没有别的：

```text
MCP server "team" ready on stdio, waiting for a client
```

**它看起来卡住了——这是正常的。** stdio 服务器在等待 AI 应用通过它的输入与它对话。按 <kbd>Ctrl</kbd>+<kbd>C</kbd> 停止它。你很少需要自己启动它：AI 应用会去启动。

::: danger 永远不要打印到 stdout
在 stdio 服务器中，标准输出**就是**协议本身。代码中的一个 `console.log` 就会破坏消息，导致客户端断开连接。请用 `console.error` 输出你自己的消息：它会写到标准错误，客户端会把它保存在日志中。
:::

## 4. 用 MCP Inspector 测试它 {#_4-test-it-with-the-mcp-inspector}

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) 是官方的测试工具：一个充当 MCP 客户端的网页（或命令行），让你可以在不借助任何 AI 的情况下试用你的服务器。它的文档要求 Node.js 22.19 或更高版本（于 2026-09-24 核实）。

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

这条命令会打印一个带一次性令牌的地址；在浏览器中打开它，点击 **Connect**，打开 **Tools**，点击 **List Tools**，选择 `find_colleague`，输入 `billing` 并运行。你会得到 Ada。

更喜欢终端？同样的检查可以在命令行中完成：

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

`inspector`（或 `--cli`）之后的所有内容，就是启动你的服务器的命令。

## 5. 把它接入 Claude Desktop {#_5-connect-it-to-claude-desktop}

Claude Desktop 从一个配置文件中读取要启动的服务器。在应用中打开它：**Claude 菜单 → Settings… → Developer → Edit Config**。这个文件是：

| 系统 | 路径 |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

在 `mcpServers` 下添加你的服务器，并使用 `server.ts` 的**绝对路径**（在项目文件夹中运行 `pwd` 即可得到它；在 Windows 上用 `cd`）：

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

然后**彻底退出 Claude Desktop 并重新启动**：它只在启动时读取这个文件。你的服务器会出现在连接器列表中（消息框的“+”按钮，然后是 **Connectors**）。问它：*“我的团队里谁负责计费？”*——Claude 会请求你允许它使用 `find_colleague`，然后回答“Ada”。

如果它没有出现：

- 检查 JSON（少一个逗号就足以让它出错），并确认路径是绝对路径；
- 如果日志说找不到 `npx` 或 `node`（用 nvm 安装 Node.js 时很常见），就把 `"npx"` 替换为 `which npx`（macOS）或 `where npx`（Windows）给出的完整路径；
- 阅读日志：macOS 上是 `~/Library/Logs/Claude/mcp*.log`，Windows 上是 `%APPDATA%\Claude\logs\mcp*.log`。`mcp-server-team.log` 保存了你的服务器写到标准错误的内容。

这些路径和菜单来自 2026 年 9 月时的 MCP 文档（[连接本地 MCP 服务器](https://modelcontextprotocol.io/docs/develop/connect-local-servers)）；如果 Claude Desktop 有了变化，请查看那个页面。

## 6. 把它接入 Claude Code {#_6-connect-it-to-claude-code}

一条命令，在任意文件夹中执行（替换其中的路径）：

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- `--` 之后的所有内容，就是启动你的服务器的命令。
- 这个服务器只为当前项目添加（`--scope local`，默认值）。用 `--scope user` 可以为你的所有项目添加，用 `--scope project` 则会把它写进一个 `.mcp.json` 文件，你可以提交并共享这个文件。
- 环境变量（例如你的服务器需要的 API 令牌）：`claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`。
- 用 `claude mcp list` 检查它，或者在 Claude Code 中输入 `/mcp`。

于 2026-09-24 通过 `claude mcp add --help`（Claude Code 2.1.173）和 [Claude Code MCP 文档](https://code.claude.com/docs/en/mcp)核实。

## 7. 其他应用 {#_7-other-applications}

大多数 MCP 应用要求的都是同样三样东西：一个**命令**（`npx`）、它的**参数**（`-y`、`tsx`、`server.ts` 的绝对路径）以及可选的**环境变量**。请查看它们的文档，例如 [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) 或 [Cursor](https://cursor.com/docs/context/mcp)。

## 8. 查看发生了什么 {#_8-see-what-happened}

每一次调用都会写入事件日志：打开 `server.ts` 旁边的 `events/` 文件夹。每个文件就是一次调用——身份为 `mcp:team` 的一次**运行**——以及它的各个步骤：

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

这些运行同样可以借助 SDK 的其余部分来读取、回放、计算成本并转换成告警：参见[可追溯性与回放](./observability)。

## 接下来去哪里 {#where-to-go-next}

- 把团队名单换成真实的东西：[一个 Web API、一个文件夹、一个数据库或一个智能体——各只需一行代码](./mcp-recipes)。
- 通过 HTTP 与你的团队共享这个服务器，加入审批和预算：[部署、安全与排障](./mcp-deploy)。
