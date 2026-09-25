# 核心概念

## 概览 {#overview}

SDK AI Agents 是一套面向 AI 智能体的治理基础设施，它把推理与行动分开，并提供原生的事件溯源，用于回放和审计。在此之上，[认知智能体](./cognitive-agents)加入了一个显式的推理层，[类型化决策](./typed-decisions)则提供经过校准的结构化答案。

::: info 本页介绍基础概念
智能体、工具、能力、策略、意图、事件存储、追踪记录和回放。它们同样适用于受治理智能体和认知智能体。
:::

## 基本概念 {#fundamental-concepts}

### 1. 智能体 {#_1-agent}

**智能体（Agent）** 是一个受治理的决策系统：它使用 LLM 生成意图，但所有动作都要经过一个受控的动作引擎（Action Engine）。

**特点：**
- 配置极简（名称、LLM 模型）
- 显式声明的工具
- 用于治理的策略
- 用于追踪的版本管理
- 用于组织工具的能力

**示例：**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. 工具 {#_2-tool}

**工具（Tool）** 是智能体可以使用的一项显式声明的能力。所有工具都必须在使用前注册（默认拒绝）。

**特点：**
- 必需的 Zod 验证 schema
- 异步处理函数
- 版本管理
- 可关联到某个能力（可选）

**示例：**
```typescript
const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    // Implementation
  },
  version: '1.0.0',
  capability: 'math'
})
```

现成的工具（一个文件夹、一个数据库、一个 Web API、整个 Web、另一个智能体、一个 MCP 服务器），以及每一次调用如何受治理：参见[工具](./tools)。

### 3. 能力 {#_3-capability}

**能力（Capability）** 是一组逻辑上相关的工具，可以在多个智能体之间复用。

**特点：**
- 名称和描述
- 关联工具的列表
- 版本管理
- 可选的元数据

**示例（使用工具名称）：**
```typescript
const calculatorTool = sdk.defineTool({ /* ... */ });
const scientificTool = sdk.defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

**示例（直接使用 Tool 对象）：**
```typescript
const calculatorTool = defineTool({ /* ... */ });
const scientificTool = defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

### 4. 策略 {#_4-policy}

**策略（Policy）** 定义了在每个动作之前应用的治理规则。

**策略类型：**
- **预算（Budget）**：对步数、token 数、工具调用次数或费用的限制（按运行，或者按智能体、工具和时间段）
- **超时（Timeout）**：最长执行时间
- **允许列表（Allowlist）**：获准使用的工具列表
- **自定义（Custom）**：自定义校验器

**示例：**
```typescript
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 }
  }],
  scope: 'global',
  enabled: true
})
```

### 5. 意图 {#_5-intention}

**意图（Intention）** 是由 LLM 生成的一个结构，它描述智能体想做什么，但不会直接执行。

**类型：**
- `tool_call`：调用某个特定工具
- `final_answer`：给用户的最终答案
- `continue`：继续推理

**安全性：**
- 所有意图都由策略引擎（Policy Engine）验证
- LLM 不能直接执行任何动作
- 完整的可追溯性

### 6. 事件存储 {#_6-event-store}

**事件存储（Event Store）** 是所有执行的唯一事实来源。

**特点：**
- 自动持久化（默认使用 JSON 文件）
- 批量写入以提升性能
- 完整导出
- 按类型、日期等过滤

**主要事件：**
- `run.started`：执行开始
- `intention.generated`：LLM 生成了一个意图
- `policy.checked`：策略检查
- `action.executed`：动作已执行
- `tool.called`：工具已调用
- `run.completed`：执行完成
- `run.failed`：执行失败
- `run.cancelled`：执行已取消

### 7. 追踪记录 {#_7-trace}

**追踪记录（Trace）** 是一次完整执行的可读呈现。

**内容：**
- 事件时间线
- 统计摘要
- 最终状态
- 元数据

**示例：**
```typescript
const trace = await sdk.getTrace(runId)
console.log(trace.summary)
// {
//   totalEvents: 15,
//   duration: 1234,
//   intentionsGenerated: 3,
//   actionsExecuted: 2,
//   policiesChecked: 2,
//   toolsCalled: 2
// }
```

### 8. 回放 {#_8-replay}

**回放（Replay）** 让你在不再次联系 LLM 的情况下重放一次完整的执行。

**特点：**
- 确定性（相同的动作序列）
- 可以做修改（输入、策略、工具）
- 用于排查事故
- 用于非回归测试

**示例：**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## 架构原则 {#architectural-principles}

### 1. 推理与行动分离 {#_1-reasoning-action-separation}

LLM 生成的是意图，而不是直接的动作。所有动作都要经过动作引擎。

### 2. 默认拒绝 {#_2-deny-by-default}

默认情况下什么都不被允许。所有工具都必须先显式声明（注册），然后才能被运行。

::: info 受治理智能体的作用范围
受治理智能体**只运行它自己的工具**：即它的 `tools` 和它的 `capabilities` 中的工具。如果模型点名了任何其他工具，即使是在 SDK 中为另一个智能体注册的工具，调用也会在执行前被拒绝（`policy.violated`、`allowed-tools`）。认知智能体、研究和 MCP 服务器也以同样的方式被限制在各自的工具列表之内。`allowlist` 策略可以针对一个智能体或所有智能体，进一步缩小这个范围。
:::

### 3. 原生事件溯源 {#_3-native-event-sourcing}

得益于事件溯源，每一次执行都可以追溯和回放。

### 4. 内置治理 {#_4-built-in-governance}

策略是从结构上强制应用的，而不是一个可选项。

### 5. 完整的版本管理 {#_5-full-versioning}

智能体、工具和能力都有版本，便于追踪和追溯。

## 典型工作流程 {#typical-workflow}

1. **初始化**：用 API 密钥创建 SDK
2. **定义**：定义工具和能力
3. **配置**：用工具和策略创建智能体
4. **执行**：用一个输入运行智能体
5. **观察**：查看执行的追踪记录
6. **回放**：为调试或测试而回放

## 最佳实践 {#best-practices}

### 工具 {#tools}
- 使用严格的 Zod schema
- 清楚地为每个工具编写文档
- 工具变更时更新版本

### 策略 {#policies}
- 设置合理的预算
- 使用严格的允许列表
- 在投入生产前测试策略

### 能力 {#capabilities}
- 按逻辑对工具分组
- 在智能体之间复用能力
- 为能力编写文档
- **推荐的工作流程：** 你可以向 `defineCapability()` 传入工具名称（字符串），也可以直接传入 Tool 对象。如果传入的是 Tool 对象，它们会被自动注册。

### 版本管理 {#versioning}
- 使用语义化版本
- 记录版本变更
- 在事件中追踪版本

## 安全 {#security}

- **默认拒绝**：任何未声明的工具都无法执行
- **验证**：所有输入都用 Zod 验证
- **策略**：在每个动作之前检查
- **可追溯性**：所有动作都被追踪
- **审计**：可通过回放进行完整审计
