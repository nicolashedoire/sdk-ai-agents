# Governed agents

A governed agent runs the classic tool-calling loop — with a twist: **the LLM only proposes intentions**. The action engine validates every intention against schemas and policies before anything happens, and records every step. This page walks through tools, capabilities, policies, traces, replay and stopping a run.

::: tip Reasoning before acting
For open-ended decisions, prefer [cognitive agents](./cognitive-agents): they share the same tools, policies and traces.
:::

## Prerequisites

- Node.js 20+ installed
- OpenAI API key (or another LLM provider)
- Basic knowledge of TypeScript/JavaScript

## Installation

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## First Agent in 5 Minutes

### Step 1: Initialize the SDK

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Step 2: Define a Tool

A tool is a capability the agent can use. It must be explicitly declared.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### Step 3: Create an Agent

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
});
```

### Step 4: Run the Agent

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### Step 5: View the Trace

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## Complete Example (10 Lines)

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## Key Concepts

### 1. Tools

Tools are the only actions the agent can perform. **Nothing is authorized by default** (deny-by-default): a tool must be registered before anything can run it.

::: warning Scope of a governed agent
A governed agent can execute **any tool registered in the SDK** that the model names: the agent's `tools` list decides what the model is offered, not what it may call. Restrict it with an `allowlist` policy — any other tool is denied before execution:

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

Cognitive agents and MCP servers are restricted to their tool list automatically.
:::

**Characteristics:**
- Explicit definition with a Zod schema
- Automatic input validation
- Versioning supported
- Full traceability

**Example:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. Capabilities

Capabilities let you group tools logically and reuse them.

**Example:**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  capabilities: ['math'],
});
```

### 3. Policies

Policies control what the agent can do.

**Policy types:**
- **Budget**: Limit on steps or tokens
- **Timeout**: Maximum execution duration
- **Allowlist**: List of authorized tools
- **Custom**: Custom validator

**Example:**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

Budget and timeout limits are checked before each tool call of a governed agent's run, against the run's progress: `maxSteps` counts the steps already taken (the first call is at step 0), `maxTokens` the tokens its model calls used, `maxDuration` the time since the run started. A limit refuses the tool call, which fails the run; it never interrupts a model call. Token budgets per period (`budgetLimit` with `maxTokens`) count the tokens of governed agents' model calls, and a replay applies the limits as the original run did. Cognitive agents have their own limits (`maxSteps`, `maxToolCalls`, `timeoutMs`).

### 4. Traces

Every execution generates a complete, replayable trace.

**Retrieve a trace:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Export a trace:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Replay

Replay an execution without recontacting the LLM.

**Simple replay:**
```typescript
const replayResult = await sdk.replay(runId);
```

**Replay with modifications:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Stopping Execution

Stop an execution in progress.

**From the agent:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**From the SDK:**
```typescript
await sdk.stopRun(runId);
```

## Typical Workflow

1. **Initialize the SDK** with your API key
2. **Define the tools** needed for your use case
3. **Create capabilities** (optional, for organization)
4. **Configure policies** for governance
5. **Create the agent** with tools and policies
6. **Run the agent** with an input
7. **Analyze the trace** to understand what happened
8. **Replay if needed** for debugging

## Best Practices

### Tools
- ✅ Use strict Zod schemas
- ✅ Document each tool clearly
- ✅ Handle errors properly
- ✅ Version tools when they change

### Policies
- ✅ Apply reasonable budgets
- ✅ Use strict allowlists
- ✅ Test policies before production
- ✅ Document policies

### Capabilities
- ✅ Group tools logically
- ✅ Reuse capabilities across agents
- ✅ Document capabilities

### Security
- ✅ **Deny-by-default**: No undeclared tool can be executed
- ✅ Validation: All inputs are validated with Zod
- ✅ Policies: Checked before every action
- ✅ Traceability: All actions are traced

## Examples

### Minimal Example
See [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### Complete Example
See [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) for all features

## Next Steps

- 📚 [Core concepts](./concepts) - Understand the architecture
- 🏗️ [Architecture](../reference/architecture) - Technical details
- 📖 [SDK API](../reference/sdk-api) - Every option and method

## Support

- Documentation: `docs/`
- Examples: `examples/`
- Issues: GitHub Issues

## Troubleshooting

### Error: "Tool not found"
→ Make sure you registered the tool with `defineTool()` before using it in an agent.

### Error: "Policy violation"
→ Check your policies (budget, timeout, allowlist).

### Error: "Run cancelled"
→ The execution was stopped. Check with `getTrace()` to see why.

### Empty traces
→ Check that the event store is working correctly and that events are being persisted.

## Time-to-First-Agent

**MVP Goal:** < 30 minutes

**Estimated time:**
- Installation: 2 minutes
- First tool: 5 minutes
- First agent: 3 minutes
- First execution: 5 minutes
- Understanding traces: 10 minutes
- **Total: ~25 minutes** ✅
