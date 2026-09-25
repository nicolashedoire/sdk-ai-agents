# Concepts fondamentaux

## Vue d'ensemble {#overview}

SDK AI Agents est une infrastructure de gouvernance pour agents d'IA qui sépare le raisonnement de l'action et fournit un event sourcing natif pour le rejeu et l'audit. Par-dessus, les [agents cognitifs](./cognitive-agents) ajoutent une couche de raisonnement explicite, et les [décisions typées](./typed-decisions) ajoutent des réponses structurées et calibrées.

::: info Cette page couvre les fondations
Les agents, les outils, les capacités, les politiques, les intentions, le magasin d'événements, les traces et le rejeu. Ils s'appliquent aussi bien aux agents gouvernés qu'aux agents cognitifs.
:::

## Concepts fondamentaux {#fundamental-concepts}

### 1. Agent {#_1-agent}

Un **agent** est un système de prise de décision gouverné qui utilise un LLM pour générer des intentions, mais dont toutes les actions passent par un moteur d'action contrôlé (*Action Engine*).

**Caractéristiques :**
- Configuration minimale (nom, modèle de LLM)
- Outils déclarés explicitement
- Politiques de gouvernance
- Versionnage pour le suivi
- Capacités pour organiser les outils

**Exemple :**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. Outil {#_2-tool}

Un **outil** (*tool*) est une capacité déclarée explicitement que l'agent peut utiliser. Tous les outils doivent être enregistrés avant d'être utilisés (refus par défaut, *deny-by-default*).

**Caractéristiques :**
- Schéma de validation Zod obligatoire
- Gestionnaire (*handler*) asynchrone
- Versionnage
- Association à une capacité (facultative)

**Exemple :**
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

Des outils prêts à l'emploi (un dossier, une base de données, une API web, le Web, un autre agent, un serveur MCP) et la façon dont chaque appel est gouverné : voir [Outils](./tools).

### 3. Capacité {#_3-capability}

Une **capacité** (*capability*) est un groupe logique d'outils qui peut être réutilisé par plusieurs agents.

**Caractéristiques :**
- Nom et description
- Liste des outils associés
- Versionnage
- Métadonnées facultatives

**Exemple (avec des noms d'outils) :**
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
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

**Exemple (directement avec des objets Tool) :**
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
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

### 4. Politique {#_4-policy}

Une **politique** (*policy*) définit les règles de gouvernance appliquées avant chaque action.

**Types de politiques :**
- **Budget** : limite du nombre d'étapes ou de tokens
- **Délai maximal** (*timeout*) : durée d'exécution maximale
- **Liste d'autorisation** (*allowlist*) : liste des outils autorisés
- **Personnalisée** (*custom*) : validateur personnalisé

**Exemple :**
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

### 5. Intention {#_5-intention}

Une **intention** est une structure générée par le LLM qui décrit ce que l'agent veut faire, sans l'exécuter directement.

**Types :**
- `tool_call` : appel à un outil précis
- `final_answer` : réponse finale à l'utilisateur
- `continue` : poursuivre le raisonnement

**Sécurité :**
- Toutes les intentions sont validées par le moteur de politiques (*Policy Engine*)
- Aucune action directe du LLM
- Traçabilité complète

### 6. Magasin d'événements {#_6-event-store}

Le **magasin d'événements** (*event store*) est l'unique source de vérité pour toutes les exécutions.

**Caractéristiques :**
- Persistance automatique (fichiers JSON par défaut)
- Regroupement des écritures par lots pour les performances
- Export complet
- Filtrage par type, par date, etc.

**Principaux événements :**
- `run.started` : début de l'exécution
- `intention.generated` : intention générée par le LLM
- `policy.checked` : vérification d'une politique
- `action.executed` : action exécutée
- `tool.called` : outil appelé
- `run.completed` : exécution terminée
- `run.failed` : exécution en échec
- `run.cancelled` : exécution annulée

### 7. Trace {#_7-trace}

Une **trace** est la représentation lisible par un humain d'une exécution complète.

**Contenu :**
- Chronologie des événements
- Résumé statistique
- État final
- Métadonnées

**Exemple :**
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

### 8. Rejeu {#_8-replay}

Le **rejeu** (*replay*) permet de rejouer une exécution complète sans recontacter le LLM.

**Caractéristiques :**
- Déterministe (même séquence d'actions)
- Modifications possibles (entrée, politiques, outils)
- Débogage d'incidents
- Tests de non-régression

**Exemple :**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## Principes d'architecture {#architectural-principles}

### 1. Séparation du raisonnement et de l'action {#_1-reasoning-action-separation}

Le LLM génère des intentions, jamais des actions directes. Toutes les actions passent par le moteur d'action.

### 2. Refus par défaut {#_2-deny-by-default}

Rien n'est autorisé par défaut. Tous les outils doivent être explicitement déclarés (enregistrés) avant que quoi que ce soit puisse les exécuter.

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

### 3. Event sourcing natif {#_3-native-event-sourcing}

Chaque exécution est traçable et rejouable grâce à l'event sourcing.

### 4. Gouvernance intégrée {#_4-built-in-governance}

Les politiques sont appliquées structurellement, pas en option.

### 5. Versionnage complet {#_5-full-versioning}

Les agents, les outils et les capacités sont versionnés pour le suivi et la traçabilité.

## Déroulement type {#typical-workflow}

1. **Initialisation** : créer le SDK avec la clé d'API
2. **Définition** : définir les outils et les capacités
3. **Configuration** : créer l'agent avec ses outils et ses politiques
4. **Exécution** : lancer l'agent avec une entrée
5. **Observation** : examiner la trace de l'exécution
6. **Rejeu** : rejouer pour déboguer ou tester

## Bonnes pratiques {#best-practices}

### Outils {#tools}
- Utilisez des schémas Zod stricts
- Documentez clairement chaque outil
- Versionnez les outils quand ils changent

### Politiques {#policies}
- Appliquez des budgets raisonnables
- Utilisez des listes d'autorisation strictes
- Testez les politiques avant la production

### Capacités {#capabilities}
- Regroupez les outils de façon logique
- Réutilisez les capacités d'un agent à l'autre
- Documentez les capacités
- **Démarche recommandée :** vous pouvez passer à `defineCapability()` soit des noms d'outils (chaînes de caractères), soit directement des objets Tool. Si vous passez des objets Tool, ils seront enregistrés automatiquement.

### Versionnage {#versioning}
- Utilisez le versionnage sémantique
- Documentez les changements de version
- Suivez les versions dans les événements

## Sécurité {#security}

- **Refus par défaut** : aucun outil non déclaré ne peut être exécuté
- **Validation** : toutes les entrées sont validées avec Zod
- **Politiques** : vérifiées avant chaque action
- **Traçabilité** : toutes les actions sont tracées
- **Audit** : le rejeu est disponible pour un audit complet
