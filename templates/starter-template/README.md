# My AI Agent Project

Starter project using SDK_AI_Agents to build governable, traceable AI agents.

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Copy the `.env.example` file to `.env` and add your OpenAI API key:

```bash
cp .env.example .env
```

Edit `.env` and add your key:

```
OPENAI_API_KEY=sk-your-key-here
```

### 3. Running

```bash
npm start
```

Or in development mode with watch:

```bash
npm run dev
```

## 📚 Documentation

- [Getting started](https://nicolashedoire.github.io/sdk-ai-agents/guide/getting-started)
- [Core concepts](https://nicolashedoire.github.io/sdk-ai-agents/guide/concepts)
- [Full documentation](https://nicolashedoire.github.io/sdk-ai-agents/)

## 🛠️ Available Scripts

- `npm start` - Runs the project
- `npm run build` - Compiles TypeScript
- `npm run dev` - Development mode with watch
- `npm test` - Runs the tests
- `npm run test:watch` - Tests in watch mode
- `npm run lint` - Checks the code with Biome
- `npm run lint:fix` - Automatically fixes errors
- `npm run format` - Formats the code
- `npm run check` - Checks the code and formatting
- `npm run clean` - Cleans the dist folder

## 📁 Project Structure

```
.
├── src/
│   ├── index.ts          # Main entry point
│   └── __tests__/        # Unit tests
├── dist/                 # Compiled code (generated)
├── .env                  # Environment variables (to create)
├── .env.example          # Configuration example
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── biome.json            # Biome configuration (linter/formatter)
└── vitest.config.ts      # Vitest configuration (tests)
```

## 🎯 Next Steps

1. **Define your tools**: Create custom tools in `src/index.ts`
2. **Create capabilities**: Organize your tools into capabilities
3. **Configure policies**: Add governance rules
4. **Add tests**: Write tests in `src/__tests__/`
5. **Customize the agent**: Adjust the configuration to your needs

## 📖 Examples

Check out the examples in the SDK_AI_Agents repository:
- [Quick Start Example](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)
- [Complete Example](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts)

## 🤝 Contribution

This project uses SDK_AI_Agents. To contribute to the SDK, see the [contribution guide](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/CONTRIBUTING.md).

## 📄 License

MIT
