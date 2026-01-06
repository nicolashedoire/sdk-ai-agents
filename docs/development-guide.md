# SDK_AI_Agents - Development Guide

**Date:** 2026-01-06

## Prerequisites

### Required

- **Node.js**: 20.0.0+ (LTS)
- **npm**: Inclus avec Node.js
- **TypeScript**: 5.3.2+ (installé localement via npm)

### Optional

- **PostgreSQL**: 8.11.0+ (pour PostgreSQLEventStore, peer dependency)
- **Git**: Pour version control

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/nicolashedoire/SDK_AI_Agents.git
cd SDK_AI_Agents
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Créer un fichier `.env` à la racine (optionnel, pour les exemples) :

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Local Development

### Build

Compiler le TypeScript :

```bash
npm run build
```

Le code compilé sera dans `dist/`.

### Watch Mode

Compiler en mode watch (recompilation automatique) :

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
npm run example:test-api
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

1. Définir le tool avec `sdk.defineTool()` :

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

2. Ajouter le tool à un agent :

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-4',
  tools: [myTool]
});
```

### Adding a New Policy

1. Définir la policy :

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

2. Appliquer la policy :

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Adding a New Event Store

1. Implémenter `IEventStore` :

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... autres méthodes
}
```

2. Utiliser dans le SDK :

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Adding a New LLM Provider

1. Implémenter `LLMProvider` :

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

2. Ajouter au `ProviderFactory` :

```typescript
// Dans provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Build Process

### TypeScript Compilation

Le build utilise le compilateur TypeScript directement :

```bash
tsc
```

Configuration dans `tsconfig.json` :
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

- Tests unitaires pour chaque module
- Utilisation de Vitest
- Mocking des dépendances externes (LLM providers, event stores)

### Integration Tests

- Tests d'intégration pour les workflows complets
- Utilisation de mocks pour les providers LLM
- Tests avec différents event stores

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

Les source maps sont générées automatiquement lors du build. Permet de debugger le code TypeScript directement.

### VS Code Debugging

Configuration `.vscode/launch.json` :

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

- **Strict Mode**: Toujours activé
- **Type Safety**: Utiliser les types explicites
- **No `any`**: Éviter `any`, utiliser `unknown` si nécessaire
- **Interfaces vs Types**: Préférer interfaces pour objets, types pour unions/intersections

### Naming Conventions

- **Files**: kebab-case (`my-file.ts`)
- **Classes**: PascalCase (`MyClass`)
- **Functions**: camelCase (`myFunction`)
- **Constants**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types/Interfaces**: PascalCase (`MyType`)

### Code Organization

- **One class/interface per file**
- **Co-located types**: Types dans le même fichier ou `types/`
- **Barrel exports**: `index.ts` pour exports publics

## Common Issues

### TypeScript Errors

Si vous avez des erreurs TypeScript :

1. Vérifier que `tsconfig.json` est correct
2. Vérifier que toutes les dépendances sont installées
3. Nettoyer et rebuilder : `npm run clean && npm run build`

### Test Failures

Si les tests échouent :

1. Vérifier que les mocks sont corrects
2. Vérifier que les dépendances sont à jour
3. Exécuter les tests en mode watch pour voir les erreurs en temps réel

### Build Errors

Si le build échoue :

1. Vérifier les erreurs TypeScript : `npm run build`
2. Vérifier les erreurs de linting : `npm run lint`
3. Nettoyer le dossier `dist/` : `npm run clean`

## Release Process

### Versioning

Le projet utilise le versioning sémantique (SemVer) :
- **MAJOR**: Changements incompatibles
- **MINOR**: Nouvelles fonctionnalités compatibles
- **PATCH**: Corrections de bugs compatibles

### Pre-release Checklist

- [ ] Tous les tests passent
- [ ] Code linté et formaté
- [ ] Documentation à jour
- [ ] CHANGELOG.md mis à jour
- [ ] Version dans `package.json` mise à jour

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

---

_Generated using BMAD Method `document-project` workflow_

