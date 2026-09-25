# 架构

![SDK 的架构](/images/architecture.svg){.illustration}

## 认知层（v0.2） {#cognitive-layer-v0-2}

0.2 版本在下文所述的受治理运行时之上增加了一个推理层。它由小巧、可替换的部件构成：

| 部件 | 模块 | 职责 |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | 运行循环、取消、超时、反馈 |
| `OperationSelector` | `src/cognition/operation-selector.ts` | 计算可用的操作，询问控制器，强制执行最终决策 |
| 控制器 | `src/cognition/cognitive-controller.ts`、`typed-decision-controller.ts` | 以启发式方式或借助 Jev 选择下一个操作 |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | 分派给思维生成器、信息搜寻器、预测检验器或评分器 |
| 补丁准入 | `src/cognition/patch-admission.ts`、`thought-fields.ts`、`thought-patch.ts` | 每一个思维的唯一入口：每个操作允许的字段、仅限引擎写入的字段、决策的裁定 |
| 证据 | `src/cognition/observation-records.ts`、`evidence-transitions.ts`、`contradiction-transitions.ts` | 观测的出处、事实修订、比较、检验结果、矛盾及其解决 |
| 状态视图 | `src/cognition/mental-state-view.ts` | 为思维 prompt 和控制器数据集准备的紧凑状态视图：就绪情况、排序、已经做过的实验 |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | 对一条待检验的预测运行你的 `OutcomeEvaluator`，并记录报告 |
| 结论守卫 | `src/cognition/decision-readiness.ts` | 排序、就绪检查、确定 / 暂定 / 弃权 |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`、`thought-prompts.ts` | 每个操作一个 prompt、严格的 JSON、Zod 验证、一次修复 |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | 借助原生推理引擎选择工具，并通过动作引擎执行 |
| 归约器 | `src/cognition/mental-state-reducer.ts`、`hypothesis-transitions.ts` | 纯粹、确定性地应用思维补丁并保证不变式，按 `schemaVersion` 区分版本 |
| 回放 | `src/cognition/mental-state-replay.ts` | 根据事件重建心智状态并生成控制器数据集 |
| 画像 | `src/cognition/thinker-profile.ts`、`profile-distiller.ts`、`profile-learning.ts` | 画像 schema、渲染、完善、提炼 |
| 评分器 | `src/cognition/hypothesis-assessor.ts` | 用类型化决策执行 `compare`：询问证据时不带思考者画像，只针对提议询问契合度 |
| 记录器与工厂 | `src/cognition/cognitive-run-recorder.ts`、`create-cognitive-agent.ts` | 认知运行的事件结构；根据配置和 SDK 服务组装一个智能体 |

在它周围：`src/decisions`（类型化决策、Jev 客户端、决策服务）、`src/costs`（定价和运行成本）、`src/resilience`（重试策略和带重试的提供商）、`src/incidents`（规则、通知器、受监控的事件存储）、`src/mcp`（服务器和客户端，以 `@sdk-ai-agents/core/mcp` 的形式发布）以及 `src/study`（研究，它复用提供商、事件存储、受治理的工具执行和成本，但不复用认知引擎）。

本页其余部分介绍受治理的运行时（v0.1）。

## 执行摘要 {#executive-summary}

SDK_AI_Agents 采用事件溯源架构，并在推理和行动之间严格分离。SDK 把内部的复杂性隐藏在一个简单、直观的 API 之后。

## 架构模式 {#architecture-pattern}

**主要模式：** 事件溯源与关注点分离

- **推理引擎（Reasoning Engine）**：根据 LLM 生成意图（没有副作用）
- **动作引擎（Action Engine）**：在验证之后执行意图
- **策略引擎（Policy Engine）**：对照策略验证意图
- **事件存储（Event Store）**：所有事件的唯一事实来源

## 组件概览 {#component-overview}

### 1. SDK API 层（外观） {#_1-sdk-api-layer-facade}

**职责：**
- 简单、直观的公共接口
- API 到内部事件的映射
- 智能的默认配置
- SDK 和智能体的生命周期管理

**文件：**
- `src/sdk.ts`：主要实现（`SDKImpl`）
- `src/agent.ts`：智能体实现（`AgentImpl`）
- `src/index.ts`：公共导出

**主要接口：**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. 推理引擎 {#_2-reasoning-engine}

**职责：**
- 与 LLM 提供商（OpenAI/Anthropic）集成
- 根据 LLM 的响应生成结构化的意图
- 管理对话上下文
- 发出推理事件

**文件：** `src/engines/reasoning-engine.ts`

**约束：**
- 永远不能直接执行工具
- 永远不能造成副作用
- 只生成结构化的意图

**依赖：**
- LLM 提供商（策略模式）
- 事件存储（发出事件）

### 3. 动作引擎 {#_3-action-engine}

**职责：**
- 接收并验证意图
- 通过工具注册表执行工具
- 通过策略引擎应用策略
- 发出动作事件

**文件：** `src/engines/action-engine.ts`

**约束：**
- 每个动作都必须经过动作引擎
- 执行之前必须验证
- 每个动作都会发出事件

**依赖：**
- 策略引擎（验证）
- 工具注册表（执行）
- 事件存储（发出事件）
- 审批管理器（可选）
- 预算追踪器（可选）

### 4. 策略引擎 {#_4-policy-engine}

**职责：**
- 对照生效的策略验证意图
- 应用全局策略和特定策略
- 检查预算、超时、允许列表
- 发出验证事件

**文件：** `src/engines/policy-engine.ts`

**约束：**
- 默认拒绝：除非明确授权，否则一切都被禁止
- 每个动作之前必须检查

**依赖：**
- 事件存储（发出验证事件）
- 预算追踪器（可选）
- 条件评估器

### 5. 回放引擎 {#_5-replay-engine}

**职责：**
- 根据持久化的事件回放执行
- 不调用 LLM 的确定性回放
- 生成新的回放事件

**文件：** `src/engines/replay-engine.ts`

**约束：**
- 回放只使用持久化的事件
- 回放期间不调用 LLM
- 回放重现同样的逻辑序列

**依赖：**
- 事件存储（读取事件）
- 动作引擎（执行意图）

### 6. 事件存储 {#_6-event-store}

**职责：**
- 持久化事件（只追加）
- 按 runId 获取事件
- 过滤和查询事件
- 为不同的实现提供抽象

**文件：**
- `src/stores/event-store.ts`：`IEventStore` 接口
- `src/stores/file-event-store.ts`：基于文件的实现
- `src/stores/sql-event-store.ts`：通用 SQL 实现
- `src/stores/sqlite-event-store.ts`：SQLite 实现
- `src/stores/postgresql-event-store.ts`：PostgreSQL 实现
- `src/stores/observed-event-store.ts`：将每个追加的事件实时交给它的监听器（`onEvent`、`sdk.subscribe`）

**接口：**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
  subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): EventSubscription
}
```

### 7. 工具注册表 {#_7-tool-registry}

**职责：**
- 管理已声明的工具
- 输入 schema 验证（Zod）
- 带验证地执行工具
- 严格的允许列表（默认拒绝）

**文件：** `src/registry/tool-registry.ts`

**约束：**
- 自动拒绝未声明的工具
- 执行之前必须验证
- 严格的允许列表

**依赖：**
- Zod（schema 验证）

### 8. 能力注册表 {#_8-capability-registry}

**职责：**
- 管理能力（工具组）
- 工具 ↔ 能力的关联

**文件：** `src/registry/capability-registry.ts`

### 9. LLM 提供商抽象 {#_9-llm-provider-abstraction}

**职责：**
- 屏蔽不同 LLM 提供商之间的差异
- 统一请求/响应格式
- 多提供商支持（OpenAI、Anthropic）
- 自动回退

**文件：**
- `src/providers/llm-provider.ts`：`LLMProvider` 接口
- `src/providers/openai-provider.ts`：OpenAI 实现
- `src/providers/anthropic-provider.ts`：Anthropic 实现
- `src/providers/fallback-provider.ts`：带回退的提供商
- `src/providers/provider-factory.ts`：用于创建提供商的工厂

**接口：**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. 管理器类 {#_10-manager-classes}

**职责：**
- 管理高级功能
- 组件之间的协调

**文件：**
- `src/managers/approval-manager.ts`：人工审批管理
- `src/managers/budget-tracker.ts`：预算和用量追踪
- `src/managers/golden-trace-manager.ts`：黄金追踪记录管理
- `src/managers/regression-test-manager.ts`：测试套件管理
- `src/managers/assertion-manager.ts`：断言管理
- `src/managers/impact-analysis-manager.ts`：影响分析管理

## 数据架构 {#data-architecture}

### 事件类型 {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated'
  | 'study.started'
  | 'study.passage_started'
  | 'study.passage_completed'
  | 'study.search'
  | 'study.model_called'
  | 'study.drift_rejected'
  | 'study.capability_demoted'
  | 'study.amendment_accepted'
  | 'study.amendment_refused'
  | 'study.result_recorded'
  | 'study.completed'
  | 'study.failed';
```

### 事件结构 {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### 事件存储的实现 {#event-store-implementations}

1. **FileEventStore**（MVP）
   - 基于文件的持久化
   - 每个 runId 一个 JSON 文件
   - 自动批量刷新

2. **SQLEventStore**（生产环境）
   - 通用 SQL 实现
   - 支持 SQLite 和 PostgreSQL
   - 用索引提升性能

3. **PostgreSQLEventStore**（高级生产环境）
   - 使用 JSONB 实现高效存储
   - 用 GIN 索引支持 JSON 查询
   - 支持高级查询

## API 设计 {#api-design}

### SDK 初始化 {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### 创建智能体 {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### 定义工具 {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### 执行智能体 {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## 测试策略 {#testing-strategy}

### 单元测试 {#unit-tests}

- 每个模块都有单元测试
- 使用 Vitest
- 对外部依赖进行模拟

### 集成测试 {#integration-tests}

- 针对完整工作流程的集成测试
- 使用不同事件存储的测试
- 回放测试

### 黄金追踪记录 {#golden-traces}

- 用于回归测试的参照追踪记录
- 通过回放进行行为验证
- 自动检测回归

## 部署架构 {#deployment-architecture}

### 包的分发 {#package-distribution}

- **包名**：`@sdk-ai-agents/core`
- **分发渠道**：npm
- **入口文件**：`dist/index.js`
- **类型定义**：`dist/index.d.ts`

### 构建过程 {#build-process}

1. TypeScript 编译（`tsc`）
2. 生成 source map
3. 生成声明文件
4. 输出到 `dist/`

### 依赖 {#dependencies}

**运行时依赖：**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**对等依赖（peer dependencies）：**
- `pg`: ^8.11.0（用于 PostgreSQLEventStore）

**开发依赖：**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## 安全方面的考虑 {#security-considerations}

### 默认拒绝 {#deny-by-default}

- 所有工具都必须显式声明
- 所有动作都必须经过策略引擎
- 执行之前必须验证

### 关注点分离 {#separation-of-concerns}

- 推理引擎无法执行工具
- 动作引擎在执行之前进行验证
- 策略引擎检查所有动作

### 审计轨迹 {#audit-trail}

- 所有事件都被持久化
- 决策完全可追溯
- 策略审计轨迹

## 性能方面的考虑 {#performance-considerations}

### 事件存储的性能 {#event-store-performance}

- FileEventStore：批量刷新（10 个事件或 100 毫秒）
- SQLEventStore：用索引实现快速查询
- PostgreSQLEventStore：JSONB + GIN 索引

### SDK 开销 {#sdk-overhead}

- 开销极小（不计 LLM/工具时 < 5-10 毫秒）
- 异步发出事件
- 批量刷新以提升性能

## 未来的考虑 {#future-considerations}

### 可扩展性 {#scalability}

- 迁移到分布式事件存储（类似 Kafka）
- 多实例支持
- 事件存储集群

### 功能 {#features}

- 支持更多 LLM 提供商
- 云端事件存储（S3 等）
- 监控仪表盘
