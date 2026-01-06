# Concepts Clés - SDK_AI_Agents

## Vue d'ensemble

SDK_AI_Agents est une infrastructure de gouvernance pour les agents IA qui sépare le raisonnement de l'action et fournit un event-sourcing natif pour le replay et l'audit.

## Concepts Fondamentaux

### 1. Agent

Un **Agent** est un système décisionnel gouverné qui utilise un LLM pour générer des intentions, mais toutes les actions passent par un Action Engine contrôlé.

**Caractéristiques:**
- Configuration minimale (nom, modèle LLM)
- Tools déclarés explicitement
- Policies pour la gouvernance
- Versioning pour le suivi
- Capabilities pour organiser les tools

**Exemple:**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. Tool

Un **Tool** est une capacité déclarée explicitement que l'agent peut utiliser. Tous les tools doivent être enregistrés avant utilisation (deny-by-default).

**Caractéristiques:**
- Schéma de validation Zod obligatoire
- Handler asynchrone
- Versioning
- Association à une capability (optionnel)

**Exemple:**
```typescript
const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    // Implementation
  },
  version: '1.0.0',
  capability: 'math'
})
```

### 3. Capability

Une **Capability** est un groupe logique de tools qui peuvent être réutilisés entre plusieurs agents.

**Caractéristiques:**
- Nom et description
- Liste de tools associés
- Versioning
- Métadonnées optionnelles

**Exemple (avec noms de tools):**
```typescript
const calculatorTool = sdk.defineTool({ /* ... */ });
const scientificTool = sdk.defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  capabilities: ['math']
})
```

**Exemple (avec objets Tool directement):**
```typescript
const calculatorTool = defineTool({ /* ... */ });
const scientificTool = defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  capabilities: ['math']
})
```

### 4. Policy

Une **Policy** définit les règles de gouvernance appliquées avant chaque action.

**Types de policies:**
- **Budget**: Limite de steps ou tokens
- **Timeout**: Durée maximale d'exécution
- **Allowlist**: Liste de tools autorisés
- **Custom**: Validateur personnalisé

**Exemple:**
```typescript
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 }
  }],
  scope: 'global',
  enabled: true
})
```

### 5. Intention

Une **Intention** est une structure générée par le LLM qui décrit ce que l'agent veut faire, sans exécuter directement.

**Types:**
- `tool_call`: Appel d'un tool spécifique
- `final_answer`: Réponse finale à l'utilisateur
- `continue`: Continuer le raisonnement

**Sécurité:**
- Toutes les intentions sont validées par le Policy Engine
- Aucune action directe depuis le LLM
- Traçabilité complète

### 6. Event Store

L'**Event Store** est la source de vérité unique pour toutes les exécutions.

**Caractéristiques:**
- Persistance automatique (fichiers JSON par défaut)
- Batching pour performance
- Export complet
- Filtrage par type, date, etc.

**Événements principaux:**
- `run.started`: Début d'exécution
- `intention.generated`: Intention générée par le LLM
- `policy.checked`: Vérification de policy
- `action.executed`: Action exécutée
- `tool.called`: Tool appelé
- `run.completed`: Exécution terminée
- `run.failed`: Exécution échouée
- `run.cancelled`: Exécution annulée

### 7. Trace

Une **Trace** est la représentation lisible d'une exécution complète.

**Contenu:**
- Timeline des événements
- Résumé statistique
- État final
- Métadonnées

**Exemple:**
```typescript
const trace = await sdk.getTrace(runId)
console.log(trace.summary)
// {
//   totalEvents: 15,
//   duration: 1234,
//   intentionsGenerated: 3,
//   actionsExecuted: 2,
//   policiesChecked: 2,
//   toolsCalled: 2
// }
```

### 8. Replay

Le **Replay** permet de rejouer une exécution complète sans recontacter le LLM.

**Caractéristiques:**
- Déterministe (même séquence d'actions)
- Modifications possibles (input, policies, tools)
- Debugging d'incidents
- Tests de non-régression

**Exemple:**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## Principes Architecturaux

### 1. Séparation Raisonnement/Action

Le LLM génère des intentions, jamais d'actions directes. Toutes les actions passent par l'Action Engine.

### 2. Deny-by-Default

Rien n'est autorisé par défaut. Tous les tools doivent être explicitement déclarés.

### 3. Event-Sourcing Natif

Chaque exécution est traçable et rejouable grâce à l'event-sourcing.

### 4. Gouvernance Intégrée

Les policies sont appliquées structurellement, pas comme une option.

### 5. Versioning Complet

Agents, tools et capabilities sont versionnés pour le suivi et la traçabilité.

## Workflow Typique

1. **Initialisation**: Créer le SDK avec la clé API
2. **Définition**: Définir les tools et capabilities
3. **Configuration**: Créer l'agent avec tools et policies
4. **Exécution**: Lancer l'agent avec un input
5. **Observation**: Consulter la trace de l'exécution
6. **Replay**: Rejouer pour debugging ou tests

## Bonnes Pratiques

### Tools
- Utiliser des schémas Zod stricts
- Documenter clairement chaque tool
- Versionner les tools lors de changements

### Policies
- Appliquer des budgets raisonnables
- Utiliser des allowlists strictes
- Tester les policies avant production

### Capabilities
- Grouper les tools logiquement
- Réutiliser les capabilities entre agents
- Documenter les capabilities
- **Workflow recommandé:** Vous pouvez passer soit des noms de tools (strings) soit des objets Tool directement dans `defineCapability()`. Si vous passez des objets Tool, ils seront automatiquement enregistrés.

### Versioning
- Utiliser le semantic versioning
- Documenter les changements de version
- Tracer les versions dans les événements

## Sécurité

- **Deny-by-default**: Aucun tool non déclaré ne peut être exécuté
- **Validation**: Tous les inputs sont validés avec Zod
- **Policies**: Vérification avant chaque action
- **Traçabilité**: Toutes les actions sont tracées
- **Audit**: Replay possible pour audit complet

