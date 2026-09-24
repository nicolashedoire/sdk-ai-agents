# 受治理智能体

受治理智能体运行经典的工具调用循环——但有一个关键不同：**LLM 只提出意图**。在任何事情发生之前，动作引擎都会对照 schema 和策略验证每一个意图，并记录每一步。本页将逐一介绍工具、能力、策略、追踪记录、回放以及停止运行。

::: tip 先推理，后行动
对于开放式的决策，请优先使用[认知智能体](./cognitive-agents)：它们共享同样的工具、策略和追踪记录。
:::

## 前提条件 {#prerequisites}

- 已安装 Node.js 20+
- OpenAI API 密钥（或其他 LLM 提供商的密钥）
- TypeScript/JavaScript 基础知识

## 安装 {#installation}

```bash
npm install @sdk-ai-agents/core zod@^3.25.28
```

## 5 分钟创建第一个智能体 {#first-agent-in-5-minutes}

### 第 1 步：初始化 SDK {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### 第 2 步：定义一个工具 {#step-2-define-a-tool}

工具是智能体可以使用的一项能力。它必须被显式声明。

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

### 第 3 步：创建一个智能体 {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
});
```

### 第 4 步：运行智能体 {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### 第 5 步：查看追踪记录 {#step-5-view-the-trace}

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

## 完整示例（10 行） {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-5.4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## 关键概念 {#key-concepts}

### 1. 工具 {#_1-tools}

工具是智能体唯一能执行的动作。**默认情况下什么都不被允许**（默认拒绝）：一个工具必须先注册，然后才能被运行。

::: warning 受治理智能体的作用范围
受治理智能体可以执行模型点名的**任何已在 SDK 中注册的工具**：智能体的 `tools` 列表决定的是向模型提供哪些工具，而不是它可以调用哪些工具。请用一个 `allowlist` 策略来限制它——任何其他工具都会在执行前被拒绝：

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

认知智能体和 MCP 服务器会自动限制在各自的工具列表之内。
:::

**特点：**
- 用 Zod schema 显式定义
- 自动验证输入
- 支持版本管理
- 完整的可追溯性

**示例：**
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

### 2. 能力 {#_2-capabilities}

能力让你可以按逻辑对工具分组并复用它们。

**示例：**
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
  model: 'gpt-5.4',
  capabilities: ['math'],
});
```

### 3. 策略 {#_3-policies}

策略控制智能体能做什么。

**策略类型：**
- **预算（Budget）**：对步数或 token 数的限制
- **超时（Timeout）**：最长执行时间
- **允许列表（Allowlist）**：获准使用的工具列表
- **自定义（Custom）**：自定义校验器

**示例：**
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
  model: 'gpt-5.4',
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

预算和时长限制会在受治理智能体一次运行中的每次工具调用之前，根据该运行的进度进行检查：`maxSteps` 统计已完成的步骤（第一次调用位于第 0 步），`maxTokens` 统计其模型调用消耗的令牌数，`maxDuration` 统计自运行开始以来的时间。限制会拒绝该工具调用，从而使运行失败；它从不中断模型调用。按时间段计算的令牌和费用预算（带 `maxTokens` 或 `maxCost` 的 `budgetLimit`）会统计受治理智能体模型调用的令牌和费用，回放也会像原始运行一样应用 `maxSteps`、`maxTokens` 和 `maxDuration`（按时间段计算的预算看到的是当前时间段的用量）。认知智能体有自己的限制（`maxSteps`、`maxToolCalls`、`timeoutMs`）。策略在应用时（`defaultPolicies`、`defineGlobalPolicy`、智能体的 `policies`、`setPolicy`）会被检查：`maxSteps` 或 `maxTokens` 规则应放在 `budget` 策略中，`maxDuration` 规则应放在 `timeout` 策略中，且 `value` 必须是大于 0 的有限数字；`budgetLimit`（同样放在 `budget` 策略中）需要一个 `period`（`hour`、`day`、`week`、`month` 或 `all`），如果提供了 `agentId` 和 `toolName`，它们必须是字符串，并且至少需要一个上限（`maxTokens`、`maxToolCalls`、`maxCost`），每个上限都是 ≥ 0 的有限数字（`maxToolCalls: 0` 会拒绝所有调用；token 或成本上限为 0 时，一旦有任何计数就会拒绝）。其他任何值，例如从配置文件读取的字符串（`'10'`）、`NaN`、运行限制的 `0` 或负数，都会抛出一个指明字段的 `ValidationError`。

### 4. 追踪记录 {#_4-traces}

每一次执行都会生成一份完整的、可回放的追踪记录。

**获取追踪记录：**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**导出追踪记录：**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. 回放 {#_5-replay}

在不再次联系 LLM 的情况下回放一次执行。

**简单回放：**
```typescript
const replayResult = await sdk.replay(runId);
```

**带修改的回放：**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. 停止执行 {#_6-stopping-execution}

停止一个正在进行的执行。

**从智能体停止：**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**从 SDK 停止：**
```typescript
await sdk.stopRun(runId);
```

## 典型工作流程 {#typical-workflow}

1. 用你的 API 密钥**初始化 SDK**
2. **定义**你的使用场景所需的**工具**
3. **创建能力**（可选，用于组织）
4. **配置策略**以实现治理
5. 用工具和策略**创建智能体**
6. 用一个输入**运行智能体**
7. **分析追踪记录**以了解发生了什么
8. 需要时**回放**以进行调试

## 最佳实践 {#best-practices}

### 工具 {#tools}
- ✅ 使用严格的 Zod schema
- ✅ 清楚地为每个工具编写文档
- ✅ 妥善处理错误
- ✅ 工具变更时更新版本

### 策略 {#policies}
- ✅ 设置合理的预算
- ✅ 使用严格的允许列表
- ✅ 在投入生产前测试策略
- ✅ 为策略编写文档

### 能力 {#capabilities}
- ✅ 按逻辑对工具分组
- ✅ 在智能体之间复用能力
- ✅ 为能力编写文档

### 安全 {#security}
- ✅ **默认拒绝**：任何未声明的工具都无法执行
- ✅ 验证：所有输入都用 Zod 验证
- ✅ 策略：在每个动作之前检查
- ✅ 可追溯性：所有动作都被追踪

## 示例 {#examples}

### 最小示例 {#minimal-example}
参见 [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### 完整示例 {#complete-example}
参见 [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts)，其中演示了所有功能

## 后续步骤 {#next-steps}

- 📚 [核心概念](./concepts) - 理解架构
- 🏗️ [架构](../reference/architecture) - 技术细节
- 📖 [SDK API](../reference/sdk-api) - 每一个选项和方法

## 支持 {#support}

- 文档：`docs/`
- 示例：`examples/`
- 问题反馈：GitHub Issues

## 故障排查 {#troubleshooting}

### 错误：“Tool not found” {#error-tool-not-found}
→ 确保在智能体中使用工具之前，已经用 `defineTool()` 注册了它。

### 错误：“Policy violation” {#error-policy-violation}
→ 检查你的策略（预算、超时、允许列表）。

### 错误：“Run cancelled” {#error-run-cancelled}
→ 执行被停止了。用 `getTrace()` 查看原因。

### 追踪记录为空 {#empty-traces}
→ 检查事件存储是否正常工作，以及事件是否被持久化。

## 首个智能体上手时间 {#time-to-first-agent}

**MVP 目标：** < 30 分钟

**预计用时：**
- 安装：2 分钟
- 第一个工具：5 分钟
- 第一个智能体：3 分钟
- 第一次执行：5 分钟
- 理解追踪记录：10 分钟
- **总计：约 25 分钟** ✅
