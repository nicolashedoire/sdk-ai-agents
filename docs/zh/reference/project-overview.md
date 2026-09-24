# 项目概览

**类型：** 库（TypeScript SDK）
**架构：** 事件溯源与关注点分离

## 执行摘要 {#executive-summary}

SDK_AI_Agents 是一套 AI 智能体治理基础设施，具备原生的事件溯源、回放能力，并在设计上保证安全。这个 SDK 把 AI 智能体从实验性的工具，转变为可治理、可解释、可投入生产的决策系统。

## 项目分类 {#project-classification}

- **仓库类型：** 单体仓库（单一、内聚的代码库）
- **项目类型：** 库（TypeScript SDK）
- **主要语言：** TypeScript 5.x
- **架构模式：** 事件溯源与关注点分离（推理引擎 ≠ 动作引擎）

## 技术栈概要 {#technology-stack-summary}

| 类别 | 技术 | 版本 | 选择理由 |
|----------|-----------|---------|---------------|
| 语言 | TypeScript | 5.3.2+ | 严格的类型安全，支持 ESM |
| 运行时 | Node.js | 20.0.0+ | LTS 支持，现代特性 |
| 包管理器 | npm | - | 标准的 Node.js 包管理器 |
| 构建工具 | TypeScript Compiler | 5.3.2 | 原生 TypeScript 编译 |
| 测试 | Vitest | 1.0.4 | 快速，基于 Vite 的测试运行器 |
| 代码检查/格式化 | Biome | 1.7.0 | 快速的一体化工具 |
| LLM 提供商 | OpenAI SDK | 4.20.0 | 集成 OpenAI API |
| LLM 提供商 | Anthropic SDK | 0.71.2 | 集成 Claude API |
| 验证 | Zod | 3.22.4 | 为工具输入做 schema 验证 |
| UUID | uuid | 9.0.1 | 生成唯一 ID |
| 数据库（可选） | PostgreSQL | 8.11.0+ | 生产环境的事件存储（对等依赖） |

## 主要特性 {#key-features}

### 核心能力 {#core-capabilities}

1. **原生事件溯源**
   - 所有事件都持久化在事件存储中
   - 不调用 LLM 的确定性回放
   - 每个决策完全可追溯

2. **推理与行动分离**
   - 推理引擎：生成意图（没有副作用）
   - 动作引擎：在验证之后执行意图
   - 设计上的安全：LLM 从不直接造成副作用

3. **内置治理**
   - 策略引擎：在执行之前验证意图
   - 预算追踪器：按智能体/工具/时间段追踪成本和用量
   - 审批管理器：关键动作的人工审批流程
   - 审计轨迹：策略决策完全可追溯

4. **多提供商 LLM**
   - 面向 OpenAI 和 Anthropic 的 LLMProvider 抽象
   - 提供商之间自动回退
   - 按提供商配置（temperature、maxTokens）

5. **认知可观测性**
   - 推理图：推理过程的可视化
   - 备选方案分析：智能体考虑过的备选方案
   - 决策模式：跨多次运行的决策模式
   - 追踪可视化：为可视化准备追踪数据

6. **测试与质量保证**
   - 黄金追踪记录：用于测试的参照追踪记录
   - 回归检测：自动检测回归
   - 断言：针对追踪记录的行为断言
   - CI/CD 集成：导出测试结果（JUnit XML、JSON）

7. **高级可观测性**
   - 运行比较：比较两次执行
   - 影响分析：部署前后的影响分析
   - 高级事件过滤：用 JSON 路径进行高级事件过滤

## 架构亮点 {#architecture-highlights}

### 事件存储抽象 {#event-store-abstraction}

- **IEventStore**：所有事件存储的通用接口
- **FileEventStore**：基于文件的实现（MVP）
- **SQLEventStore**：通用 SQL 实现
- **SQLiteEventStore**：SQLite 实现
- **PostgreSQLEventStore**：使用 JSONB 的 PostgreSQL 实现

### 引擎架构 {#engine-architecture}

- **ReasoningEngine**：根据 LLM 生成意图
- **ActionEngine**：在验证之后执行意图
- **PolicyEngine**：对照策略验证意图
- **ReplayEngine**：根据事件回放执行

### 注册表体系 {#registry-system}

- **ToolRegistry**：管理可用的工具
- **CapabilityRegistry**：管理能力（工具组）

### 管理器体系 {#manager-system}

- **ApprovalManager**：人工审批管理
- **BudgetTracker**：预算和用量追踪
- **GoldenTraceManager**：黄金追踪记录管理
- **RegressionTestManager**：回归测试套件管理
- **AssertionManager**：行为断言管理
- **ImpactAnalysisManager**：影响分析管理

## 开发概览 {#development-overview}

### 前提条件 {#prerequisites}

- Node.js 20.0.0+（LTS）
- npm 或同类工具
- TypeScript 5.3.2+（本地安装）

### 入门 {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### 主要命令 {#key-commands}

- **安装：** `npm install`
- **构建：** `npm run build`
- **开发：** `npm run dev`（监听模式）
- **测试：** `npm test`
- **测试（监听）：** `npm run test:watch`
- **测试覆盖率：** `npm run test:coverage`
- **代码检查：** `npm run lint`
- **格式化：** `npm run format`
- **全面检查：** `npm run check`（代码检查 + 格式化）

## 仓库结构 {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

`src/` 的详细内容请参见[源码结构](../contributing/source-tree)。

## 文档地图 {#documentation-map}

更多详细信息，请参见：

- [简介](../guide/introduction) - 这个 SDK 是做什么的
- [源码结构](../contributing/source-tree) - 目录结构
- [架构](./architecture) - 详细的架构
- [开发指南](../contributing/development) - 开发工作流程
