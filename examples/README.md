# Examples

## Quick Start

Run the quick start example:

```bash
OPENAI_API_KEY=your-key npm run example:quick-start
```

The examples import the SDK from `src/` and are not compiled into `dist/`: run any of them with `tsx`, as the scripts do:

```bash
OPENAI_API_KEY=your-key npx tsx examples/quick-start.ts
```

## More examples

| Script | What it shows |
| --- | --- |
| `npm run example:cognitive` | A cognitive agent with a governed tool, costs and incident alerts; typed decisions with `TYPESAFE_API_KEY`, or Jev through Vercel AI Gateway with `AI_GATEWAY_API_KEY` |
| `npm run example:rules` | The evidence loop: a rule induced from measurements, predictions tested on a simulated bench, a refuted rule revised (`MODEL=gpt-4o` to try a stronger model) |
| `npm run example:mcp` | A function exposed as an MCP server over stdio (no model key needed) |
| `npm run example:mcp-openapi` | Any web API as an MCP server, from its OpenAPI description (`OPENAPI_SPEC`, `API_BASE_URL`, `API_TOKEN`) |
| `npm run example:mcp-folder -- /path/to/folder` | A folder of documents: list, read, search, and MCP resources |
| `npm run example:mcp-database -- /path/to/file.sqlite` | A SQLite database, read-only (Node.js 22.13+; creates a demo database without a path) |
| `npm run example:mcp-postgres` | A PostgreSQL database, read-only (`DATABASE_URL` of a read-only role) |
| `npm run example:mcp-agent` | Your reasoning twin: a cognitive agent with a thinker profile as one MCP tool (`OPENAI_API_KEY`, `PROFILE_FILE`) |
| `npm run example:mcp-http -- /path/to/folder` | An MCP server over Streamable HTTP with a bearer token (`MCP_TOKEN`) |
| `npm run example:mcp-approvals` | An MCP server whose write tool waits for a human, with a small admin endpoint to see and decide the pending approvals (`ADMIN_SECRET`) |

The MCP examples are started by an MCP client, not by hand: see [Your first MCP server](https://nicolashedoire.github.io/sdk-ai-agents/guide/mcp-first-server) to test them with the MCP Inspector or connect them to Claude Desktop and Claude Code. They write their event log to `examples/events/`.

## What the Example Does

1. Creates an SDK instance
2. Defines a calculator tool
3. Creates an agent with the tool
4. Runs the agent with a math question
5. Retrieves the trace
6. Replays the execution

This demonstrates:
- Tool definition and registration
- Agent creation and execution
- Event tracing
- Replay functionality


