# Guide de développement

## Prérequis {#prerequisites}

### Obligatoires {#required}

- **Node.js** : 20.0.0+ (LTS)
- **npm** : fourni avec Node.js
- **TypeScript** : 5.3.2+ (installé localement via npm)

### Facultatifs {#optional}

- **PostgreSQL** : 8.11.0+ (pour PostgreSQLEventStore, dépendance homologue)
- **Git** : pour la gestion de versions

## Mise en place de l'environnement {#environment-setup}

### 1. Cloner le dépôt {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Installer les dépendances {#_2-install-dependencies}

```bash
npm install
```

### 3. Configurer les variables d'environnement {#_3-configure-environment-variables}

Créez un fichier `.env` à la racine (facultatif, pour les exemples) :

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Développement local {#local-development}

### Compilation {#build}

Compilez le TypeScript :

```bash
npm run build
```

Le code compilé se trouvera dans `dist/`.

### Mode surveillance {#watch-mode}

Compilez en mode surveillance (recompilation automatique) :

```bash
npm run dev
```

### Lancer les exemples {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run example:test-api
```

## Tests {#testing}

### Lancer tous les tests {#run-all-tests}

```bash
npm test
```

### Mode surveillance {#watch-mode-1}

```bash
npm run test:watch
```

### Couverture {#coverage}

```bash
npm run test:coverage
```

### Lancer un fichier de test précis {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## Qualité du code {#code-quality}

### Analyse statique {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Formatage {#formatting}

```bash
# Format code
npm run format
```

### Vérification complète (analyse statique + formatage) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## Tâches de développement courantes {#common-development-tasks}

### Ajouter un nouvel outil {#adding-a-new-tool}

1. Définissez l'outil avec `sdk.defineTool()` :

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

2. Ajoutez l'outil à un agent :

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-4',
  tools: [myTool]
});
```

### Ajouter une nouvelle politique {#adding-a-new-policy}

1. Définissez la politique :

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

2. Appliquez la politique :

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Ajouter un nouveau magasin d'événements {#adding-a-new-event-store}

1. Implémentez `IEventStore` :

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

2. Utilisez-le dans le SDK :

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Ajouter un nouveau fournisseur de LLM {#adding-a-new-llm-provider}

1. Implémentez `LLMProvider` :

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

2. Ajoutez-le à `ProviderFactory` :

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Processus de compilation {#build-process}

### Compilation TypeScript {#typescript-compilation}

La compilation utilise directement le compilateur TypeScript :

```bash
tsc
```

Configuration dans `tsconfig.json` :
- **Cible** (*Target*) : ES2022
- **Module** : ESNext
- **Résolution des modules** (*Module Resolution*) : node
- **Mode strict** : activé
- **Source maps** : activées
- **Fichiers de déclaration** : activés

### Structure du résultat {#output-structure}

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

## Stratégie de test {#testing-strategy}

### Tests unitaires {#unit-tests}

- Des tests unitaires pour chaque module
- Utilise Vitest
- Simulation (mocking) des dépendances externes (fournisseurs de LLM, magasins d'événements)

### Tests d'intégration {#integration-tests}

- Des tests d'intégration pour les parcours complets
- Utilise des simulacres (mocks) pour les fournisseurs de LLM
- Des tests avec différents magasins d'événements

### Exemple de structure de test {#example-test-structure}

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

## Débogage {#debugging}

### Source maps {#source-maps}

Les source maps sont générées automatiquement pendant la compilation. Elles permettent de déboguer directement le code TypeScript.

### Débogage dans VS Code {#vs-code-debugging}

Configuration de `.vscode/launch.json` :

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

## Style de code {#code-style}

### Bonnes pratiques TypeScript {#typescript-best-practices}

- **Mode strict** : toujours activé
- **Sûreté du typage** : utilisez des types explicites
- **Pas de `any`** : évitez `any`, utilisez `unknown` si nécessaire
- **Interfaces ou types** : préférez les interfaces pour les objets, les types pour les unions et les intersections

### Conventions de nommage {#naming-conventions}

- **Fichiers** : kebab-case (`my-file.ts`)
- **Classes** : PascalCase (`MyClass`)
- **Fonctions** : camelCase (`myFunction`)
- **Constantes** : UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types et interfaces** : PascalCase (`MyType`)

### Organisation du code {#code-organization}

- **Une classe ou une interface par fichier**
- **Types colocalisés** : types dans le même fichier ou dans `types/`
- **Exports groupés** (*barrel exports*) : `index.ts` pour les exports publics

## Problèmes courants {#common-issues}

### Erreurs TypeScript {#typescript-errors}

Si vous obtenez des erreurs TypeScript :

1. Vérifiez que `tsconfig.json` est correct
2. Vérifiez que toutes les dépendances sont installées
3. Nettoyez et recompilez : `npm run clean && npm run build`

### Tests en échec {#test-failures}

Si des tests échouent :

1. Vérifiez que les simulacres (mocks) sont corrects
2. Vérifiez que les dépendances sont à jour
3. Lancez les tests en mode surveillance pour voir les erreurs en temps réel

### Erreurs de compilation {#build-errors}

Si la compilation échoue :

1. Vérifiez les erreurs TypeScript : `npm run build`
2. Vérifiez les erreurs d'analyse statique : `npm run lint`
3. Nettoyez le dossier `dist/` : `npm run clean`

## Processus de publication {#release-process}

### Versionnage {#versioning}

Le projet utilise le versionnage sémantique (SemVer) :
- **MAJOR** : changements incompatibles
- **MINOR** : nouvelles fonctionnalités rétrocompatibles
- **PATCH** : corrections de bugs rétrocompatibles

### Liste de contrôle avant publication {#pre-release-checklist}

- [ ] Tous les tests passent
- [ ] Code analysé et formaté
- [ ] Documentation à jour
- [ ] CHANGELOG.md mis à jour
- [ ] Version mise à jour dans `package.json`

### Compiler pour une publication {#build-for-release}

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

## Ressources {#resources}

- **Documentation** : `docs/`
- **Exemples** : `examples/`
- **Définitions de types** : `src/types/`
- **Tests** : `src/__tests__/`

## Site de documentation {#documentation-site}

La documentation est un site VitePress situé dans `docs/`, illustré par des SVG placés dans `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

Le workflow GitHub Actions `Docs` le publie sur GitHub Pages à chaque push sur `main`.
