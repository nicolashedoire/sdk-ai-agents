# Your first MCP server in 5 minutes

We will build a tiny MCP server that answers "who is in charge of billing?" from a team list, test it without any AI, then plug it into Claude Desktop and Claude Code. Every command is given; nothing is assumed. If a word is unclear, see [MCP in plain words](./mcp).

## What you need

- **Node.js 20.11 or later** — check with `node --version`. (The SQLite recipe needs 22.13+. The MCP Inspector documentation asks for 22.19+.)
- A terminal.
- To use the server from an AI app: [Claude Desktop](https://claude.ai/download) or [Claude Code](https://code.claude.com/docs). Not needed for the first steps.

No API key is needed: this server does not call a language model. The AI application that uses it has its own.

## 1. Create the project

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install @sdk-ai-agents/core zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

What each line does:

| Command | Why |
| --- | --- |
| `npm init -y` | Creates `package.json`, the file that lists your project's dependencies. |
| `npm pkg set type=module` | Uses modern JavaScript modules (`import`). The SDK requires it. |
| `npm install @sdk-ai-agents/core …` | Installs this SDK, zod (to describe arguments) and the official MCP SDK, version 1.30 or later within 1.x (the version this SDK is tested with). |
| `npm install --save-dev tsx` | Runs TypeScript files directly, without a build step. |

## 2. Write the server

Create a file named `server.ts`:

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

Read it top to bottom:

1. **The data** — here a list in the file; in real life, your API, files or database.
2. **The SDK** — it runs every call through the governed pipeline and writes it to the event log. The log goes next to the file (`import.meta.dirname`) because AI apps start servers from a working directory you do not choose.
3. **The tool** — the **name** and **description** are what the model reads to decide when to call it, so write them for a reader who knows nothing about your code. The **schema** lists the arguments; the SDK turns it into the JSON Schema that MCP clients see, and refuses calls that do not match. `readOnly: true` tells clients the tool changes nothing.
4. **The server** — `serveMcpOverStdio` talks MCP over standard input and output. The `tools` list is required: a tool you did not list is never visible, even if it is defined.

## 3. Run it

```sh
npx tsx server.ts
```

You should see, and nothing else:

```text
MCP server "team" ready on stdio, waiting for a client
```

**It looks stuck — that is normal.** A stdio server waits for an AI app to talk to it through its input. Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop it. You will rarely start it yourself: the AI app does it.

::: danger Never print to stdout
In a stdio server, standard output **is** the protocol. A `console.log` in your code corrupts the messages and the client disconnects. Use `console.error` for your own messages: it goes to standard error, which clients keep in their logs.
:::

## 4. Test it with the MCP Inspector

The [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) is the official test tool: a web page (or a command line) that acts as an MCP client, so you can try your server without any AI. Its documentation asks for Node.js 22.19 or later (checked on 2026-09-24).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

The command prints an address with a one-time token; open it in your browser, click **Connect**, open **Tools**, click **List Tools**, choose `find_colleague`, type `billing` and run it. You get Ada.

Prefer the terminal? The same checks from the command line:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

Everything after `inspector` (or after `--cli`) is the command that starts your server.

## 5. Connect it to Claude Desktop

Claude Desktop reads the servers to start from a configuration file. Open it from the app: **Claude menu → Settings… → Developer → Edit Config**. The file is:

| System | Path |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Add your server under `mcpServers`, with the **absolute path** of `server.ts` (run `pwd` in the project folder to get it; on Windows, `cd`):

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

Then **quit Claude Desktop completely and start it again**: it only reads the file at start-up. Your server appears in the list of connectors (the "+" button of the message box, then **Connectors**). Ask: *"Who is in charge of billing in my team?"* — Claude asks for your permission to use `find_colleague`, then answers "Ada".

If it does not appear:

- check the JSON (a missing comma is enough to break it) and that the path is absolute;
- if the log says `npx` or `node` cannot be found (common when Node.js was installed with nvm), replace `"npx"` by the full path given by `which npx` (macOS) or `where npx` (Windows);
- read the logs: `~/Library/Logs/Claude/mcp*.log` on macOS, `%APPDATA%\Claude\logs\mcp*.log` on Windows. `mcp-server-team.log` holds what your server wrote to standard error.

These paths and menus come from the MCP documentation ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) as of September 2026; check that page if Claude Desktop has changed.

## 6. Connect it to Claude Code

One command, from any folder (replace the path):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- Everything after `--` is the command that starts your server.
- The server is added for the current project only (`--scope local`, the default). Use `--scope user` for all your projects, or `--scope project` to write it in a `.mcp.json` file you can commit and share.
- Environment variables (for example an API token your server needs): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- Check it with `claude mcp list`, or type `/mcp` inside Claude Code.

Checked on 2026-09-24 with `claude mcp add --help` (Claude Code 2.1.173) and the [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp).

## 7. Other applications

Most MCP applications ask for the same three things: a **command** (`npx`), its **arguments** (`-y`, `tsx`, the absolute path of `server.ts`) and optional **environment variables**. See their documentation, for example [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) or [Cursor](https://cursor.com/docs/context/mcp).

## 8. See what happened

Every call is written to the event log: open the `events/` folder next to `server.ts`. Each file is one call — one **run** of the identity `mcp:team` — with its steps:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

The same runs can be read, replayed, priced and turned into alerts with the rest of the SDK: see [Traceability & replay](./observability).

## Where to go next

- Replace the team list by something real: [a web API, a folder, a database or an agent — one line each](./mcp-recipes).
- Share the server with your team over HTTP, add approvals and budgets: [Deploy, secure and troubleshoot](./mcp-deploy).
