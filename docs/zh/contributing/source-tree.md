# 源码结构

## 概览 {#overview}

SDK 采用清晰的模块化结构组织，各部分职责分离。主要源代码位于 `src/` 中，每个功能领域有各自的子文件夹。

## 完整的目录结构 {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents, the Web
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## 关键目录 {#critical-directories}

### `src/engines/` {#src-engines}

**用途：** 包含 SDK 的主要引擎，负责编排智能体的生命周期。

**包含：**
- `reasoning-engine.ts`：根据 LLM 生成意图（没有副作用）
- `action-engine.ts`：在策略引擎验证之后执行意图
- `policy-engine.ts`：对照已配置的策略验证意图
- `replay-engine.ts`：根据持久化的事件回放执行

**入口点：** 由 `AgentImpl` 和 `SDKImpl` 使用

**集成方式：** 引擎通过构造函数注入到 `AgentImpl` 和 `SDKImpl` 中

### `src/stores/` {#src-stores}

**用途：** 用于持久化事件的 `IEventStore` 接口的各种实现。

**包含：**
- `event-store.ts`：通用的 `IEventStore` 接口
- `file-event-store.ts`：基于文件的实现（MVP）
- `sql-event-store.ts`：通用 SQL 实现
- `sqlite-event-store.ts`：SQLite 实现
- `postgresql-event-store.ts`：使用 JSONB 的 PostgreSQL 实现
- `observed-event-store.ts`：将每个追加的事件实时交给它的监听器（`onEvent`、`sdk.subscribe`）

**入口点：** 由 `SDKImpl` 和 `ReplayEngine` 使用

**集成方式：** 通过配置注入到 `SDKImpl` 中

### `src/providers/` {#src-providers}

**用途：** 面向不同 LLM 提供商的 `LLMProvider` 接口实现。

**包含：**
- `llm-provider.ts`：通用的 `LLMProvider` 接口
- `openai-provider.ts`：OpenAI 实现
- `anthropic-provider.ts`：Anthropic 实现
- `fallback-provider.ts`：带自动回退的提供商
- `provider-factory.ts`：用于创建提供商的工厂

**入口点：** 由 `ReasoningEngine` 使用

**集成方式：** 通过构造函数注入到 `ReasoningEngine` 中

### `src/managers/` {#src-managers}

**用途：** 用于高级功能（审批、预算、测试等）的管理类。

**包含：**
- `approval-manager.ts`：人工审批管理
- `budget-tracker.ts`：预算和用量追踪
- `golden-trace-manager.ts`：黄金追踪记录管理
- `regression-test-manager.ts`：回归测试套件管理
- `assertion-manager.ts`：行为断言管理
- `impact-analysis-manager.ts`：影响分析管理

**入口点：** 由 `SDKImpl` 和 `PolicyEngine` 使用

**集成方式：** 通过构造函数注入到 `SDKImpl` 和 `PolicyEngine` 中

### `src/registry/` {#src-registry}

**用途：** 用于管理可用工具和能力的注册表。

**包含：**
- `tool-registry.ts`：可用工具的管理（默认拒绝）
- `capability-registry.ts`：能力（工具组）的管理

**入口点：** 由 `SDKImpl` 和 `ActionEngine` 使用

**集成方式：** 通过构造函数注入到 `SDKImpl` 和 `ActionEngine` 中

### `src/types/` {#src-types}

**用途：** SDK 所有类型的 TypeScript 定义。

**包含：**
- Agent、Tool、Policy、Event、Run、SDK 的类型
- 高级功能（推理图、备选方案等）的类型
- 测试相关（黄金追踪记录、回归、断言等）的类型

**入口点：** 被所有模块导入

**集成方式：** 在整个代码库中用于保证类型安全

### `src/utils/` {#src-utils}

**用途：** 工具函数和辅助函数。

**包含：**
- `constants.ts`：全局常量
- `id.ts`：唯一 ID 生成
- `zod-to-json-schema.ts`：Zod → JSON Schema 转换
- 用于推理图、备选方案、模式等的工具函数
- 用于测试（验证、回归、断言等）的工具函数

**入口点：** 被需要它们的模块导入

**集成方式：** 由引擎、管理器和其他模块使用

### `src/cognition/`（v0.2） {#src-cognition-v0-2}

**用途：** 认知智能体——显式心智状态、认知操作、控制器、思考者画像。

**包含：** `cognitive-agent.ts`（运行循环）、`operation-selector.ts`、`operation-performer.ts`、`cognitive-controller.ts`（启发式）、`typed-decision-controller.ts`（Jev）、`hypothesis-assessor.ts`、`information-seeker.ts`、`llm-thought-generator.ts` 和 `thought-prompts.ts`、`mental-state.ts`（schema 和类型）、`mental-state-reducer.ts` 和 `hypothesis-transitions.ts`、`mental-state-replay.ts`、`thinker-profile.ts`、`profile-distiller.ts`、`create-cognitive-agent.ts`。

### `src/study/` {#src-study}

**用途：** 研究（`sdk.createStudy`）——一位先理解一个对象、再提出如何重新设计它的研究员，独立于认知引擎之外。

**包含：** `study.ts`（`Study` 类：运行、守护者、修正案、现有技术搜索）、`passages.ts`（七个环节及其集合和 schema）、`study-config.ts`（配置、冻结的章程及其哈希）、`study-prompts.ts` 和 `study-replies.ts`（每次调用都重建的 prompt，以及对照 schema 读取的回复）、`study-claims.ts`（由代码检查的论断状态）、`study-sources.ts`（来源、查询参数、结果）、`study-model.ts` 和 `study-run.ts`（模型调用、限制、事件）、`study-report.ts`、`study-markdown.ts` 和 `study-labels.ts`（报告，以及十一种语言的档案）、`study-types.ts`。

### `src/decisions/`（v0.2） {#src-decisions-v0-2}

**用途：** 类型化决策——Noul/Choice/Score 约定、TypeSafe Jev 的 HTTP 客户端，以及 `sdk.decisions` 背后的 `DecisionService`。

### `src/costs/`、`src/resilience/`、`src/incidents/`（v0.2） {#src-costs-src-resilience-src-incidents-v0-2}

**用途：** 定价和按运行统计的成本报告；重试策略和带重试的 LLM 提供商；事故规则、通知器（邮件、webhook、Resend）以及受监控的事件存储。

### `src/mcp/` 和 `src/mcp.ts`（v0.2） {#src-mcp-and-src-mcp-ts-v0-2}

**用途：** 暴露受治理工具和资源的 MCP 服务器（`mcp-server.ts`、`mcp-resources.ts`、`governed-tool-host.ts`），以及导入工具的 MCP 客户端（`mcp-client.ts`）。以 `@sdk-ai-agents/core/mcp` 入口的形式发布，这样核心包就不依赖 `@modelcontextprotocol/sdk`。

### `src/tools/` {#src-tools}

**用途：** 从一个系统构建 `ToolDefinition` 的工具源，不依赖 MCP：`openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts`（Web API）、`folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts`（文件夹和资源）、`sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts`（只读数据库）、`agent-tools.ts`（作为工具的智能体），以及 `tool-names.ts` 和 `bounded-text.ts`。`web/` 存放 Web 调研工具：`web-tools.ts`（`webTools`）、`guarded-http.ts` 和 `ip-ranges.ts`（HTTP 客户端及其地址、重定向、大小和时间检查）、`robots.ts` 和 `politeness.ts`（robots.txt、按主机的节奏控制）、`web-cache.ts`、`results.ts`（可引用的结果）、`html-parser.ts` / `html-to-markdown.ts` / `html-entities.ts`（把网页转换为 Markdown）、`pdf-text.ts`（借助可选的 `unpdf` 读取 PDF）、`web-fetch.ts`、`search-chain.ts` 和 `providers/`（DuckDuckGo、SearXNG、Brave、Tavily、Serper）、`sources/`（arXiv、Wikipedia、GitHub）。

### `src/__tests__/support/` {#src-tests-support}

**用途：** 实现 SDK 各端口的测试替身（脚本化的 LLM 提供商、内存中的决策客户端、本地 HTTP 服务器、记录操作的 PostgreSQL 客户端、`node:sqlite` 加载器）——不使用模块 mock。

## 入口点 {#entry-points}

### 主入口 {#main-entry}

- **`src/index.ts`**：SDK 的公共入口点，导出所有公共 API

### 应用入口点 {#application-entry-points}

- **`src/sdk.ts`**：SDK 的主要实现（`SDKImpl`）
- **`src/agent.ts`**：智能体实现（`AgentImpl`）

## 文件组织方式 {#file-organization-patterns}

### 命名约定 {#naming-conventions}

- **文件**：文件名使用 kebab-case（例如 `reasoning-engine.ts`）
- **类**：PascalCase（例如 `ReasoningEngine`）
- **接口**：PascalCase，需要时加 `I` 前缀（例如 `IEventStore`）
- **类型**：PascalCase（例如 `EventType`、`RunStatus`）
- **函数**：camelCase（例如 `generateCompletion`）

### 模块组织 {#module-organization}

- **每个文件一个类/接口**：每个文件包含一个主要的类或接口
- **类型就近放置**：相关类型放在同一个文件或 `types/` 中
- **桶式导出**：用 `index.ts` 导出公共 API

## 配置文件 {#configuration-files}

- **`package.json`**：依赖和 npm 脚本
- **`tsconfig.json`**：TypeScript 配置（严格模式、ESM）
- **`biome.json`**：Biome 配置（代码检查/格式化）
- **`vitest.config.ts`**：Vitest 配置（测试）

## 开发注意事项 {#notes-for-development}

### 添加新功能 {#adding-new-features}

1. **新引擎**：在 `src/engines/` 中创建，注入到 `SDKImpl` 或 `AgentImpl` 中
2. **新存储**：在 `src/stores/` 中实现 `IEventStore`
3. **新提供商**：在 `src/providers/` 中实现 `LLMProvider`
4. **新管理器**：在 `src/managers/` 中创建，注入到 `SDKImpl` 中
5. **新类型**：添加到 `src/types/` 中，并从 `types/index.ts` 导出

### 测试 {#testing}

- 单元测试位于 `src/__tests__/` 中
- 每个源码模块一个测试文件
- 使用 Vitest 进行测试

### 构建 {#build}

- TypeScript 把 `src/` 编译到 `dist/`
- 生成 source map 以便调试
- 生成 TypeScript 声明文件（`.d.ts`）
