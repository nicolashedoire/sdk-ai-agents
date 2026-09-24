# 开发指南

## 前提条件 {#prerequisites}

### 必需 {#required}

- **Node.js**：20.0.0+（LTS）
- **npm**：随 Node.js 一起提供
- **TypeScript**：5.3.2+（通过 npm 本地安装）

### 可选 {#optional}

- **PostgreSQL**：8.11.0+（用于 PostgreSQLEventStore，对等依赖）
- **Git**：用于版本控制

## 环境搭建 {#environment-setup}

### 1. 克隆仓库 {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. 安装依赖 {#_2-install-dependencies}

```bash
npm install
```

### 3. 配置环境变量 {#_3-configure-environment-variables}

在根目录创建一个 `.env` 文件（可选，供示例使用）：

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## 本地开发 {#local-development}

### 构建 {#build}

编译 TypeScript：

```bash
npm run build
```

编译后的代码位于 `dist/` 中。

### 监听模式 {#watch-mode}

以监听模式编译（自动重新编译）：

```bash
npm run dev
```

### 运行示例 {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run example:test-api
```

## 测试 {#testing}

### 运行所有测试 {#run-all-tests}

```bash
npm test
```

### 监听模式 {#watch-mode-1}

```bash
npm run test:watch
```

### 覆盖率 {#coverage}

```bash
npm run test:coverage
```

### 运行指定的测试文件 {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## 代码质量 {#code-quality}

### 代码检查 {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### 格式化 {#formatting}

```bash
# Format code
npm run format
```

### 全面检查（代码检查 + 格式化） {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## 常见开发任务 {#common-development-tasks}

### 添加一个新工具 {#adding-a-new-tool}

1. 用 `sdk.defineTool()` 定义工具：

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. 把工具添加到一个智能体中：

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-4',
  tools: [myTool]
});
```

### 添加一个新策略 {#adding-a-new-policy}

1. 定义策略：

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. 应用策略：

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### 添加一个新的事件存储 {#adding-a-new-event-store}

1. 实现 `IEventStore`：

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. 在 SDK 中使用它：

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### 添加一个新的 LLM 提供商 {#adding-a-new-llm-provider}

1. 实现 `LLMProvider`：

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

2. 把它添加到 `ProviderFactory` 中：

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## 构建过程 {#build-process}

### TypeScript 编译 {#typescript-compilation}

构建直接使用 TypeScript 编译器：

```bash
tsc
```

`tsconfig.json` 中的配置：
- **Target**：ES2022
- **Module**：ESNext
- **Module Resolution**：node
- **严格模式**：启用
- **Source map**：启用
- **声明文件**：启用

### 输出结构 {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## 测试策略 {#testing-strategy}

### 单元测试 {#unit-tests}

- 每个模块都有单元测试
- 使用 Vitest
- 没有任何测试会调用真实的付费服务，也没有任何测试使用模块 mock 或 spy：SDK 的各端口由 `src/__tests__/support/` 中的测试替身实现，HTTP 适配器（包括 OpenAI 和 Anthropic 提供商）则针对本地服务器运行。`no-mocks.test.ts` 会拒绝 `vi.mock`、`vi.fn` 和 `vi.spyOn`

### 集成测试 {#integration-tests}

- 针对完整工作流程的集成测试
- 模型是脚本化的提供商，或是与本地服务器通信的真实 OpenAI 或 Anthropic 客户端，该服务器按厂商的格式应答；没有任何测试会调用真实的 API
- 使用不同事件存储的测试

### 测试结构示例 {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## 调试 {#debugging}

### Source map {#source-maps}

Source map 会在构建时自动生成。它们让你可以直接调试 TypeScript 代码。

### VS Code 调试 {#vs-code-debugging}

`.vscode/launch.json` 配置：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## 代码风格 {#code-style}

### TypeScript 最佳实践 {#typescript-best-practices}

- **严格模式**：始终启用
- **类型安全**：使用显式类型
- **不用 `any`**：避免使用 `any`，必要时使用 `unknown`
- **接口与类型别名**：对象优先使用接口，联合/交叉类型使用类型别名

### 命名约定 {#naming-conventions}

- **文件**：kebab-case（`my-file.ts`）
- **类**：PascalCase（`MyClass`）
- **函数**：camelCase（`myFunction`）
- **常量**：UPPER_SNAKE_CASE（`MY_CONSTANT`）
- **类型/接口**：PascalCase（`MyType`）

### 代码组织 {#code-organization}

- **每个文件一个类/接口**
- **类型就近放置**：类型放在同一个文件或 `types/` 中
- **桶式导出**：用 `index.ts` 进行公共导出

## 常见问题 {#common-issues}

### TypeScript 错误 {#typescript-errors}

如果遇到 TypeScript 错误：

1. 检查 `tsconfig.json` 是否正确
2. 检查是否已安装所有依赖
3. 清理并重新构建：`npm run clean && npm run build`

### 测试失败 {#test-failures}

如果测试失败：

1. 检查 `src/__tests__/support/` 中的测试替身是否仍与它们所替代的接口一致
2. 检查依赖是否是最新的
3. 以监听模式运行测试，实时查看错误

### 构建错误 {#build-errors}

如果构建失败：

1. 检查 TypeScript 错误：`npm run build`
2. 检查代码检查错误：`npm run lint`
3. 清理 `dist/` 文件夹：`npm run clean`

## 发布流程 {#release-process}

### 版本管理 {#versioning}

本项目使用语义化版本（SemVer）：
- **MAJOR**：不兼容的变更
- **MINOR**：向后兼容的新功能
- **PATCH**：向后兼容的缺陷修复

### 发布前检查清单 {#pre-release-checklist}

- [ ] 所有测试通过
- [ ] 代码已通过检查并完成格式化
- [ ] 文档是最新的
- [ ] CHANGELOG.md 已更新
- [ ] `package.json` 中的版本已更新

### 为发布进行构建 {#build-for-release}

```bash
# Clean
npm run clean

# Build
npm run build

# Test
npm test

# Check
npm run check
```

## 资源 {#resources}

- **文档**：`docs/`
- **示例**：`examples/`
- **类型定义**：`src/types/`
- **测试**：`src/__tests__/`

## 文档站点 {#documentation-site}

文档是位于 `docs/` 中的一个 VitePress 站点，配有 `docs/public/images/` 中的 SVG 插图。

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

`Docs` 这个 GitHub Actions 工作流会在每次推送到 `main` 时把它发布到 GitHub Pages。
