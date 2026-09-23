# SDK_AI_Agents Templates

This folder contains project templates to quickly get started with SDK_AI_Agents.

## Available Templates

### starter-template

Base template for starting a new project using SDK_AI_Agents.

**Includes:**
- Complete TypeScript project structure
- Biome configuration (linter/formatter)
- Vitest configuration (tests)
- Working agent example
- Basic unit tests
- Complete documentation

**Usage:**

```bash
cp -r starter-template my-new-project
cd my-new-project
npm install
cp ENV_TEMPLATE.txt .env
# Edit .env and add your API key
npm start
```

See [starter-template/USAGE.md](./starter-template/USAGE.md) for more details.

## Creating a New Template

To create a new template:

1. Create a new folder in `templates/`
2. Add the base structure
3. Create a `USAGE.md` file with instructions
4. Document the template in this README

## Contribution

Templates are maintained alongside the main SDK. To propose a new template or improve an existing one, open an issue or a pull request.
