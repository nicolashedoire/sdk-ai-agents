# Development guide

## Prerequisites

### Required

- **Node.js**: 20.0.0+ (LTS)
- **npm**: Included with Node.js
- **TypeScript**: 5.3.2+ (installed locally via npm)

### Optional

- **PostgreSQL**: 8.11.0+ (for PostgreSQLEventStore, peer dependency)
- **Git**: For version control

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file at the root (optional, for the examples):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Local Development

### Build

Compile the TypeScript:

```bash
npm run build
```

The compiled code will be in `dist/`.

### Watch Mode

Compile in watch mode (automatic recompilation):

```bash
npm run dev
```

### Run Examples

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## Testing

### Run All Tests

```bash
npm test
```

### Watch Mode

```bash
npm run test:watch
```

### Coverage

```bash
npm run test:coverage
```

### Run Specific Test File

```bash
npx vitest src/__tests__/agent.test.ts
```

## Code Quality

### Linting

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Formatting

```bash
# Format code
npm run format
```

### Full Check (Lint + Format)

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## Common Development Tasks

### Adding a New Tool

1. Define the tool with `sdk.defineTool()`:

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

2. Add the tool to an agent:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### Adding a New Policy

1. Define the policy:

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

2. Apply the policy:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Adding a New Event Store

1. Implement `IEventStore`:

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

2. Use it in the SDK:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Adding a New LLM Provider

1. Implement `LLMProvider`:

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

2. Add it to `ProviderFactory`:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Build Process

### TypeScript Compilation

The build uses the TypeScript compiler directly:

```bash
tsc
```

Configuration in `tsconfig.json`:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Strict Mode**: Enabled
- **Source Maps**: Enabled
- **Declaration Files**: Enabled

### Output Structure

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

## Testing Strategy

### Unit Tests

- Unit tests for each module
- Uses Vitest
- No test calls a real paid service, and none uses module mocks or spies: the SDK ports are implemented by the test doubles of `src/__tests__/support/`, and HTTP adapters, the OpenAI and Anthropic providers included, run against local servers. `no-mocks.test.ts` refuses `vi.mock`, `vi.fn` and `vi.spyOn`

### Integration Tests

- Integration tests for complete workflows
- The model is a scripted provider, or the real OpenAI or Anthropic client talking to a local server that answers in the vendor's format; no test calls a real API
- Tests with different event stores

### Example Test Structure

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

## Debugging

### Source Maps

Source maps are generated automatically during the build. They let you debug the TypeScript code directly.

### VS Code Debugging

`.vscode/launch.json` configuration:

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

## Code Style

### TypeScript Best Practices

- **Strict Mode**: Always enabled
- **Type Safety**: Use explicit types
- **No `any`**: Avoid `any`, use `unknown` if necessary
- **Interfaces vs Types**: Prefer interfaces for objects, types for unions/intersections

### Naming Conventions

- **Files**: kebab-case (`my-file.ts`)
- **Classes**: PascalCase (`MyClass`)
- **Functions**: camelCase (`myFunction`)
- **Constants**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types/Interfaces**: PascalCase (`MyType`)

### Code Organization

- **One class/interface per file**
- **Co-located types**: Types in the same file or `types/`
- **Barrel exports**: `index.ts` for public exports

## Common Issues

### TypeScript Errors

If you get TypeScript errors:

1. Check that `tsconfig.json` is correct
2. Check that all dependencies are installed
3. Clean and rebuild: `npm run clean && npm run build`

### Test Failures

If tests fail:

1. Check that the test doubles of `src/__tests__/support/` still match the interfaces they replace
2. Check that dependencies are up to date
3. Run the tests in watch mode to see errors in real time

### Build Errors

If the build fails:

1. Check the TypeScript errors: `npm run build`
2. Check the linting errors: `npm run lint`
3. Clean the `dist/` folder: `npm run clean`

## Release Process

### Versioning

The project uses semantic versioning (SemVer):
- **MAJOR**: Breaking changes
- **MINOR**: Backward-compatible new features
- **PATCH**: Backward-compatible bug fixes

### Pre-release Checklist

- [ ] All tests pass
- [ ] Code linted and formatted
- [ ] Documentation up to date
- [ ] CHANGELOG.md updated
- [ ] Version in `package.json` updated

### Build for Release

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

## Resources

- **Documentation**: `docs/`
- **Examples**: `examples/`
- **Type Definitions**: `src/types/`
- **Tests**: `src/__tests__/`

## Documentation site

The documentation is a VitePress site in `docs/`, illustrated with SVGs in `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

The `Docs` GitHub Actions workflow publishes it to GitHub Pages on every push to `main`.
