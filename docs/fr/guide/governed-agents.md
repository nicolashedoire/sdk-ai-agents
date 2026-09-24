# Agents gouvernés

Un agent gouverné exécute la boucle classique d'appel d'outils — avec une particularité : **le LLM ne fait que proposer des intentions**. Le moteur d'action valide chaque intention au regard des schémas et des politiques avant que quoi que ce soit ne se produise, et enregistre chaque étape. Cette page passe en revue les outils, les capacités, les politiques, les traces, le rejeu et l'arrêt d'une exécution.

::: tip Raisonner avant d'agir
Pour les décisions ouvertes, préférez les [agents cognitifs](./cognitive-agents) : ils partagent les mêmes outils, politiques et traces.
:::

## Prérequis {#prerequisites}

- Node.js 20+ installé
- Une clé d'API OpenAI (ou d'un autre fournisseur de LLM)
- Des connaissances de base en TypeScript/JavaScript

## Installation {#installation}

```bash
npm install @sdk-ai-agents/core zod@^3.25.28
```

## Un premier agent en 5 minutes {#first-agent-in-5-minutes}

### Étape 1 : initialiser le SDK {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Étape 2 : définir un outil {#step-2-define-a-tool}

Un outil est une capacité que l'agent peut utiliser. Il doit être déclaré explicitement.

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

### Étape 3 : créer un agent {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
});
```

### Étape 4 : lancer l'agent {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### Étape 5 : consulter la trace {#step-5-view-the-trace}

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

## Exemple complet (10 lignes) {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-5.4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## Concepts clés {#key-concepts}

### 1. Outils {#_1-tools}

Les outils sont les seules actions que l'agent peut effectuer. **Rien n'est autorisé par défaut** (refus par défaut, *deny-by-default*) : un outil doit être enregistré avant que quoi que ce soit puisse l'exécuter.

::: warning Périmètre d'un agent gouverné
Un agent gouverné peut exécuter **n'importe quel outil enregistré dans le SDK** que le modèle nomme : la liste `tools` de l'agent détermine ce qui est proposé au modèle, pas ce qu'il a le droit d'appeler. Restreignez-le avec une politique `allowlist` — tout autre outil est alors refusé avant son exécution :

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

Les agents cognitifs et les serveurs MCP sont automatiquement restreints à leur liste d'outils.
:::

**Caractéristiques :**
- Définition explicite avec un schéma Zod
- Validation automatique des entrées
- Versionnage pris en charge
- Traçabilité complète

**Exemple :**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. Capacités {#_2-capabilities}

Les capacités permettent de regrouper des outils de façon logique et de les réutiliser.

**Exemple :**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  capabilities: ['math'],
});
```

### 3. Politiques {#_3-policies}

Les politiques contrôlent ce que l'agent peut faire.

**Types de politiques :**
- **Budget** : limite du nombre d'étapes ou de tokens
- **Délai maximal** (*timeout*) : durée d'exécution maximale
- **Liste d'autorisation** (*allowlist*) : liste des outils autorisés
- **Personnalisée** (*custom*) : validateur personnalisé

**Exemple :**
```typescript
// Global policy
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

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

Les limites de budget et de durée sont vérifiées avant chaque appel d'outil d'une exécution d'agent gouverné, d'après sa progression : `maxSteps` compte les étapes déjà effectuées (le premier appel est à l'étape 0), `maxTokens` les tokens consommés par ses appels au modèle, `maxDuration` le temps écoulé depuis le début de l'exécution. Une limite refuse l'appel d'outil, ce qui fait échouer l'exécution ; elle n'interrompt jamais un appel au modèle. Les budgets de tokens et de coût par période (`budgetLimit` avec `maxTokens` ou `maxCost`) comptent les tokens et le coût des appels au modèle des agents gouvernés, et un rejeu applique `maxSteps`, `maxTokens` et `maxDuration` comme l'exécution d'origine (les budgets par période voient la consommation de la période en cours). Les agents cognitifs ont leurs propres limites (`maxSteps`, `maxToolCalls`, `timeoutMs`). Une politique est vérifiée quand elle est appliquée (`defaultPolicies`, `defineGlobalPolicy`, les `policies` d'un agent, `setPolicy`) : une règle `maxSteps` ou `maxTokens` va dans une politique `budget` et une règle `maxDuration` dans une politique `timeout`, avec une `value` qui est un nombre fini supérieur à 0 ; un `budgetLimit` (lui aussi dans une politique `budget`) a besoin d'une `period` (`hour`, `day`, `week`, `month` ou `all`), d'un `agentId` et d'un `toolName` en chaînes s'ils sont donnés, et d'au moins un plafond (`maxTokens`, `maxToolCalls`, `maxCost`), chacun un nombre fini ≥ 0 (`maxToolCalls: 0` refuse tous les appels ; un plafond de tokens ou de coût à 0 les refuse dès que quelque chose est compté). Toute autre valeur, comme une chaîne (`'10'`) lue dans un fichier de configuration, `NaN`, `0` pour une limite d'exécution ou un nombre négatif, lève une `ValidationError` qui nomme le champ.

### 4. Traces {#_4-traces}

Chaque exécution génère une trace complète et rejouable.

**Récupérer une trace :**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Exporter une trace :**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Rejeu {#_5-replay}

Rejouez une exécution sans recontacter le LLM.

**Rejeu simple :**
```typescript
const replayResult = await sdk.replay(runId);
```

**Rejeu avec modifications :**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Arrêter une exécution {#_6-stopping-execution}

Arrêtez une exécution en cours.

**Depuis l'agent :**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**Depuis le SDK :**
```typescript
await sdk.stopRun(runId);
```

## Déroulement type {#typical-workflow}

1. **Initialisez le SDK** avec votre clé d'API
2. **Définissez les outils** nécessaires à votre cas d'usage
3. **Créez des capacités** (facultatif, pour l'organisation)
4. **Configurez les politiques** de gouvernance
5. **Créez l'agent** avec ses outils et ses politiques
6. **Lancez l'agent** avec une entrée
7. **Analysez la trace** pour comprendre ce qui s'est passé
8. **Rejouez si nécessaire** pour déboguer

## Bonnes pratiques {#best-practices}

### Outils {#tools}
- ✅ Utilisez des schémas Zod stricts
- ✅ Documentez clairement chaque outil
- ✅ Gérez correctement les erreurs
- ✅ Versionnez les outils quand ils changent

### Politiques {#policies}
- ✅ Appliquez des budgets raisonnables
- ✅ Utilisez des listes d'autorisation strictes
- ✅ Testez les politiques avant la production
- ✅ Documentez les politiques

### Capacités {#capabilities}
- ✅ Regroupez les outils de façon logique
- ✅ Réutilisez les capacités d'un agent à l'autre
- ✅ Documentez les capacités

### Sécurité {#security}
- ✅ **Refus par défaut** : aucun outil non déclaré ne peut être exécuté
- ✅ Validation : toutes les entrées sont validées avec Zod
- ✅ Politiques : vérifiées avant chaque action
- ✅ Traçabilité : toutes les actions sont tracées

## Exemples {#examples}

### Exemple minimal {#minimal-example}
Voir [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### Exemple complet {#complete-example}
Voir [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) pour l'ensemble des fonctionnalités

## Étapes suivantes {#next-steps}

- 📚 [Concepts fondamentaux](./concepts) - Comprendre l'architecture
- 🏗️ [Architecture](../reference/architecture) - Détails techniques
- 📖 [API du SDK](../reference/sdk-api) - Toutes les options et méthodes

## Assistance {#support}

- Documentation : `docs/`
- Exemples : `examples/`
- Signalements : GitHub Issues

## Dépannage {#troubleshooting}

### Erreur : « Tool not found » {#error-tool-not-found}
→ Vérifiez que vous avez enregistré l'outil avec `defineTool()` avant de l'utiliser dans un agent.

### Erreur : « Policy violation » {#error-policy-violation}
→ Vérifiez vos politiques (budget, délai maximal, liste d'autorisation).

### Erreur : « Run cancelled » {#error-run-cancelled}
→ L'exécution a été arrêtée. Consultez `getTrace()` pour savoir pourquoi.

### Traces vides {#empty-traces}
→ Vérifiez que le magasin d'événements fonctionne correctement et que les événements sont bien persistés.

## Temps jusqu'au premier agent {#time-to-first-agent}

**Objectif du MVP :** < 30 minutes

**Temps estimé :**
- Installation : 2 minutes
- Premier outil : 5 minutes
- Premier agent : 3 minutes
- Première exécution : 5 minutes
- Comprendre les traces : 10 minutes
- **Total : ~25 minutes** ✅
