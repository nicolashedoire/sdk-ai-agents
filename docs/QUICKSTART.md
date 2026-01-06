# Quick Start Guide - SDK_AI_Agents

Ce guide vous permet de créer votre premier agent en moins de 30 minutes.

## Prérequis

- Node.js 20+ installé
- Clé API OpenAI (ou autre provider LLM)
- Connaissances de base en TypeScript/JavaScript

## Installation

```bash
npm install @sdk-ai-agents/core
```

## Premier Agent en 5 Minutes

### Étape 1 : Initialiser le SDK

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Étape 2 : Définir un Tool

Un tool est une capacité que l'agent peut utiliser. Il doit être explicitement déclaré.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### Étape 3 : Créer un Agent

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
});
```

### Étape 4 : Exécuter l'Agent

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // UUID unique pour cette exécution
```

### Étape 5 : Voir la Trace

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## Exemple Complet (10 Lignes)

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## Concepts Clés

### 1. Tools (Outils)

Les tools sont les seules actions que l'agent peut exécuter. **Rien n'est autorisé par défaut** (deny-by-default).

**Caractéristiques:**
- Définition explicite avec schéma Zod
- Validation automatique des inputs
- Versioning supporté
- Traçabilité complète

**Exemple:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Votre logique ici
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. Capabilities (Capacités)

Les capabilities permettent de grouper des tools logiquement et de les réutiliser.

**Exemple:**
```typescript
// Option 1: Avec noms de tools (tools déjà enregistrés)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: Avec objets Tool (auto-enregistrement)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Utilisation dans un agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  capabilities: ['math'],
});
```

### 3. Policies (Politiques)

Les policies contrôlent ce que l'agent peut faire.

**Types de policies:**
- **Budget**: Limite de steps ou tokens
- **Timeout**: Durée maximale d'exécution
- **Allowlist**: Liste de tools autorisés
- **Custom**: Validateur personnalisé

**Exemple:**
```typescript
// Policy globale
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Policy par agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 secondes
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

### 4. Traces (Traces)

Chaque exécution génère une trace complète et rejouable.

**Récupérer une trace:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Exporter une trace:**
```typescript
// Format texte
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// Format JSON
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Replay (Rejouer)

Rejouer une exécution sans recontacter le LLM.

**Replay simple:**
```typescript
const replayResult = await sdk.replay(runId);
```

**Replay avec modifications:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Arrêt d'Exécution

Arrêter une exécution en cours.

**Depuis l'agent:**
```typescript
await agent.stop(runId); // Arrêter un run spécifique
await agent.stop(); // Arrêter tous les runs de cet agent
```

**Depuis le SDK:**
```typescript
await sdk.stopRun(runId);
```

## Workflow Typique

1. **Initialiser le SDK** avec votre clé API
2. **Définir les tools** nécessaires pour votre cas d'usage
3. **Créer des capabilities** (optionnel, pour organiser)
4. **Configurer les policies** pour la gouvernance
5. **Créer l'agent** avec tools et policies
6. **Exécuter l'agent** avec un input
7. **Analyser la trace** pour comprendre ce qui s'est passé
8. **Rejouer si nécessaire** pour debugging

## Bonnes Pratiques

### Tools
- ✅ Utiliser des schémas Zod stricts
- ✅ Documenter clairement chaque tool
- ✅ Gérer les erreurs proprement
- ✅ Versionner les tools lors de changements

### Policies
- ✅ Appliquer des budgets raisonnables
- ✅ Utiliser des allowlists strictes
- ✅ Tester les policies avant production
- ✅ Documenter les policies

### Capabilities
- ✅ Grouper les tools logiquement
- ✅ Réutiliser les capabilities entre agents
- ✅ Documenter les capabilities

### Sécurité
- ✅ **Deny-by-default**: Aucun tool non déclaré ne peut être exécuté
- ✅ Validation: Tous les inputs sont validés avec Zod
- ✅ Policies: Vérification avant chaque action
- ✅ Traçabilité: Toutes les actions sont tracées

## Exemples

### Exemple Minimal
Voir `examples/quick-start.ts`

### Exemple Complet
Voir `examples/complete-example.ts` pour toutes les fonctionnalités

## Prochaines Étapes

- 📚 [Concepts Clés](./CONCEPTS.md) - Comprendre l'architecture
- 🏗️ [Architecture](./../_bmad-output/planning-artifacts/architecture.md) - Détails techniques
- 📋 [PRD](./../_bmad-output/planning-artifacts/prd.md) - Requirements complets

## Support

- Documentation: `docs/`
- Exemples: `examples/`
- Issues: GitHub Issues

## Troubleshooting

### Erreur: "Tool not found"
→ Assurez-vous d'avoir enregistré le tool avec `defineTool()` avant de l'utiliser dans un agent.

### Erreur: "Policy violation"
→ Vérifiez vos policies (budget, timeout, allowlist).

### Erreur: "Run cancelled"
→ L'exécution a été arrêtée. Vérifiez avec `getTrace()` pour voir pourquoi.

### Traces vides
→ Vérifiez que l'event store fonctionne correctement et que les événements sont persistés.

## Time-to-First-Agent

**Objectif MVP:** < 30 minutes

**Temps estimé:**
- Installation: 2 minutes
- Premier tool: 5 minutes
- Premier agent: 3 minutes
- Première exécution: 5 minutes
- Comprendre les traces: 10 minutes
- **Total: ~25 minutes** ✅

