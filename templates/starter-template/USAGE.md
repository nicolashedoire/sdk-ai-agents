# How to Use This Template

This template provides a base structure to quickly start a project using SDK_AI_Agents.

## Installation

### Option 1: Copy the template manually

1. Copy the `starter-template` folder to your new project:
   ```bash
   cp -r templates/starter-template my-new-project
   cd my-new-project
   ```

2. Install the dependencies:
   ```bash
   npm install
   ```

3. Create the `.env` file:
   ```bash
   cp ENV_TEMPLATE.txt .env
   ```
   Then edit `.env` and add your OpenAI API key.

### Option 2: Use npm create (once the SDK is published)

```bash
npm create @sdk-ai-agents/starter my-new-project
cd my-new-project
npm install
```

## Initial Configuration

1. **Environment variables**:
   - Copy `ENV_TEMPLATE.txt` to `.env`
   - Add your OpenAI API key: `OPENAI_API_KEY=sk-...`

2. **Customization**:
   - Edit `package.json` to change the project name
   - Customize `src/index.ts` to your needs

## Template Structure

```
starter-template/
├── src/
│   ├── index.ts          # Your agent's main code
│   └── __tests__/        # Unit tests
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── biome.json            # Linter/formatter configuration
├── vitest.config.ts      # Test configuration
├── README.md             # Project documentation
├── ENV_TEMPLATE.txt      # Template for .env
└── .gitignore            # Files to ignore
```

## Available Scripts

- `npm start` - Runs the project
- `npm run build` - Compiles TypeScript
- `npm run dev` - Development mode with watch
- `npm test` - Runs the tests
- `npm run lint` - Checks the code
- `npm run format` - Formats the code

## Next Steps

1. **Define your tools**: Create custom tools in `src/index.ts`
2. **Create capabilities**: Organize your tools into capabilities
3. **Configure policies**: Add governance rules
4. **Add tests**: Write tests in `src/__tests__/`
5. **Customize the agent**: Adjust the configuration to your needs

## Documentation

See the full SDK documentation:
- [Getting started](https://nicolashedoire.github.io/sdk-ai-agents/guide/getting-started)
- [Core concepts](https://nicolashedoire.github.io/sdk-ai-agents/guide/concepts)

## Notes

- The `@sdk-ai-agents/core` package must be installed from npm (or linked locally during development)
- Make sure you have Node.js >= 20.0.0
- TypeScript errors about `@sdk-ai-agents/core` are expected until the package is installed
