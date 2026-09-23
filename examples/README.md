# Examples

## Quick Start

Run the quick start example:

```bash
OPENAI_API_KEY=your-key npm run example:quick-start
```

Or compile and run manually:

```bash
npm run build
node dist/examples/quick-start.js
```

## More examples

| Script | What it shows |
| --- | --- |
| `npm run example:cognitive` | A cognitive agent with a governed tool, typed decisions (with a TypeSafe key), costs and incident alerts |
| `npm run example:rules` | The evidence loop: a rule induced from measurements, predictions tested on a simulated bench, a refuted rule revised |
| `npm run example:mcp` | Governed tools exposed as an MCP server over stdio |

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


