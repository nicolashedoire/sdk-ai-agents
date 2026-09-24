# Architecture

![Architecture du SDK](/images/architecture.svg){.illustration}

## Couche cognitive (v0.2) {#cognitive-layer-v0-2}

La version 0.2 ajoute une couche de raisonnement par-dessus l'environnement d'exécution gouverné décrit plus bas. Elle est construite à partir de petites pièces remplaçables :

| Pièce | Module | Responsabilité |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | Boucle d'exécution, annulation, délai maximal, retours |
| `OperationSelector` | `src/cognition/operation-selector.ts` | Calcule les opérations disponibles, interroge le contrôleur, impose la décision finale |
| Contrôleurs | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | Choix de l'opération suivante, heuristique ou appuyé sur Jev |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | Aiguille vers le générateur de pensées, le chercheur d'information, le testeur de prédictions ou l'évaluateur d'hypothèses |
| Admission des patchs | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | Point d'entrée unique de chaque pensée : champs autorisés par opération, champs réservés au moteur, règlement de la décision |
| Preuves | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | Provenance des observations, révisions de faits, comparaisons, résultats de tests, contradictions et leurs résolutions |
| Vue de l'état | `src/cognition/mental-state-view.ts` | Vue compacte de l'état pour les prompts de pensée et les jeux de données du contrôleur : état « prêt à conclure », classement, expériences déjà menées |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | Exécute votre `OutcomeEvaluator` sur une prédiction en attente et enregistre le rapport |
| Garde-fou de conclusion | `src/cognition/decision-readiness.ts` | Classement, contrôle « prêt à conclure », ferme / provisoire / abstention |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | Un prompt par opération, JSON strict, validation Zod, une réparation |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | Sélection d'outil avec le moteur de raisonnement natif, exécution via le moteur d'action |
| Réducteur | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | Application pure et déterministe des patchs de pensée, avec invariants, versionnée par `schemaVersion` |
| Rejeu | `src/cognition/mental-state-replay.ts` | Reconstruction de l'état mental et jeu de données du contrôleur à partir des événements |
| Profils | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | Schéma de profil, rendu, affinage, distillation |
| Évaluateurs d'hypothèses | `src/cognition/hypothesis-assessor.ts` | `compare` avec des décisions typées : les preuves sont demandées sans le penseur, l'adéquation seulement pour les propositions |
| Enregistreur et fabrique | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | Forme des événements d'une exécution cognitive ; assemblage d'un agent à partir de sa configuration et des services du SDK |

Autour : `src/decisions` (décisions typées, client Jev, service de décision), `src/costs` (tarification et coûts des exécutions), `src/resilience` (politique de nouvelles tentatives et fournisseur qui retente), `src/incidents` (règles, notificateurs, magasin d'événements surveillé) et `src/mcp` (serveur et client, publiés sous `@sdk-ai-agents/core/mcp`).

Le reste de cette page documente l'environnement d'exécution gouverné (v0.1).

## Synthèse {#executive-summary}

SDK_AI_Agents suit une architecture fondée sur l'event sourcing, avec une séparation stricte entre raisonnement et action. Le SDK masque la complexité interne derrière une API simple et intuitive.

## Modèle d'architecture {#architecture-pattern}

**Modèle principal :** event sourcing avec séparation des responsabilités

- **Moteur de raisonnement** (*Reasoning Engine*) : génère des intentions à partir du LLM (sans effets de bord)
- **Moteur d'action** (*Action Engine*) : exécute les intentions après validation
- **Moteur de politiques** (*Policy Engine*) : valide les intentions au regard des politiques
- **Magasin d'événements** (*Event Store*) : source unique de vérité pour tous les événements

## Vue d'ensemble des composants {#component-overview}

### 1. Couche d'API du SDK (façade) {#_1-sdk-api-layer-facade}

**Responsabilités :**
- Interface publique simple et intuitive
- Correspondance entre l'API et les événements internes
- Configuration par défaut intelligente
- Gestion du cycle de vie du SDK et des agents

**Fichiers :**
- `src/sdk.ts` : implémentation principale (`SDKImpl`)
- `src/agent.ts` : implémentation de l'agent (`AgentImpl`)
- `src/index.ts` : exports publics

**Interfaces principales :**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. Moteur de raisonnement {#_2-reasoning-engine}

**Responsabilités :**
- Intégration avec le fournisseur de LLM (OpenAI/Anthropic)
- Génération d'intentions structurées à partir des réponses du LLM
- Gestion du contexte conversationnel
- Émission des événements de raisonnement

**Fichier :** `src/engines/reasoning-engine.ts`

**Contraintes :**
- Ne peut jamais exécuter directement un outil
- Ne peut jamais provoquer d'effet de bord
- Ne génère que des intentions structurées

**Dépendances :**
- Fournisseur de LLM (patron Stratégie)
- Magasin d'événements (émission d'événements)

### 3. Moteur d'action {#_3-action-engine}

**Responsabilités :**
- Réception et validation des intentions
- Exécution des outils via le registre d'outils
- Application des politiques via le moteur de politiques
- Émission des événements d'action

**Fichier :** `src/engines/action-engine.ts`

**Contraintes :**
- Chaque action doit passer par le moteur d'action
- Validation obligatoire avant l'exécution
- Un événement émis pour chaque action

**Dépendances :**
- Moteur de politiques (validation)
- Registre d'outils (exécution)
- Magasin d'événements (émission d'événements)
- Gestionnaire d'approbations (facultatif)
- Suivi des budgets (facultatif)

### 4. Moteur de politiques {#_4-policy-engine}

**Responsabilités :**
- Validation des intentions au regard des politiques actives
- Application des politiques globales et spécifiques
- Vérification des budgets, des délais maximaux et des listes d'autorisation
- Émission des événements de validation

**Fichier :** `src/engines/policy-engine.ts`

**Contraintes :**
- Refus par défaut : tout est interdit sauf autorisation explicite
- Vérification obligatoire avant chaque action

**Dépendances :**
- Magasin d'événements (émission des événements de validation)
- Suivi des budgets (facultatif)
- Évaluateur de conditions

### 5. Moteur de rejeu {#_5-replay-engine}

**Responsabilités :**
- Rejeu des exécutions à partir des événements persistés
- Rejeu déterministe sans appel au LLM
- Génération de nouveaux événements de rejeu

**Fichier :** `src/engines/replay-engine.ts`

**Contraintes :**
- Le rejeu n'utilise que les événements persistés
- Aucun appel au LLM pendant le rejeu
- Le rejeu reproduit la même séquence logique

**Dépendances :**
- Magasin d'événements (lecture des événements)
- Moteur d'action (exécution des intentions)

### 6. Magasin d'événements {#_6-event-store}

**Responsabilités :**
- Persistance des événements (en ajout seul)
- Récupération des événements par runId
- Filtrage et interrogation des événements
- Abstraction pour différentes implémentations

**Fichiers :**
- `src/stores/event-store.ts` : interface `IEventStore`
- `src/stores/file-event-store.ts` : implémentation à base de fichiers
- `src/stores/sql-event-store.ts` : implémentation SQL générique
- `src/stores/sqlite-event-store.ts` : implémentation SQLite
- `src/stores/postgresql-event-store.ts` : implémentation PostgreSQL

**Interface :**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
}
```

### 7. Registre d'outils {#_7-tool-registry}

**Responsabilités :**
- Gestion des outils déclarés
- Validation du schéma des entrées (Zod)
- Exécution des outils avec validation
- Liste d'autorisation stricte (refus par défaut)

**Fichier :** `src/registry/tool-registry.ts`

**Contraintes :**
- Rejet automatique des outils non déclarés
- Validation obligatoire avant l'exécution
- Liste d'autorisation stricte

**Dépendances :**
- Zod (validation des schémas)

### 8. Registre des capacités {#_8-capability-registry}

**Responsabilités :**
- Gestion des capacités (groupes d'outils)
- Association outil ↔ capacité

**Fichier :** `src/registry/capability-registry.ts`

### 9. Abstraction des fournisseurs de LLM {#_9-llm-provider-abstraction}

**Responsabilités :**
- Abstraction des différences entre fournisseurs de LLM
- Normalisation des formats de requête et de réponse
- Prise en charge de plusieurs fournisseurs (OpenAI, Anthropic)
- Repli automatique

**Fichiers :**
- `src/providers/llm-provider.ts` : interface `LLMProvider`
- `src/providers/openai-provider.ts` : implémentation OpenAI
- `src/providers/anthropic-provider.ts` : implémentation Anthropic
- `src/providers/fallback-provider.ts` : fournisseur avec repli
- `src/providers/provider-factory.ts` : fabrique de fournisseurs

**Interface :**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. Classes gestionnaires {#_10-manager-classes}

**Responsabilités :**
- Gestion des fonctionnalités avancées
- Coordination entre les composants

**Fichiers :**
- `src/managers/approval-manager.ts` : gestion des approbations humaines
- `src/managers/budget-tracker.ts` : suivi des budgets et de la consommation
- `src/managers/golden-trace-manager.ts` : gestion des traces de référence
- `src/managers/regression-test-manager.ts` : gestion des suites de tests
- `src/managers/assertion-manager.ts` : gestion des assertions
- `src/managers/impact-analysis-manager.ts` : gestion des analyses d'impact

## Architecture des données {#data-architecture}

### Types d'événements {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';
```

### Structure d'un événement {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### Implémentations du magasin d'événements {#event-store-implementations}

1. **FileEventStore** (MVP)
   - Persistance à base de fichiers
   - Un fichier JSON par runId
   - Écriture automatique par lots

2. **SQLEventStore** (production)
   - Implémentation SQL générique
   - Prise en charge de SQLite et PostgreSQL
   - Index pour les performances

3. **PostgreSQLEventStore** (production avancée)
   - Utilise JSONB pour un stockage efficace
   - Index GIN pour les requêtes JSON
   - Prise en charge de requêtes avancées

## Conception de l'API {#api-design}

### Initialisation du SDK {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Création d'un agent {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Définition d'un outil {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Exécution d'un agent {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Stratégie de test {#testing-strategy}

### Tests unitaires {#unit-tests}

- Des tests unitaires pour chaque module
- Utilise Vitest
- Simulation (mocking) des dépendances externes

### Tests d'intégration {#integration-tests}

- Des tests d'intégration pour les parcours complets
- Des tests avec différents magasins d'événements
- Des tests de rejeu

### Traces de référence {#golden-traces}

- Des traces de référence pour les tests de régression
- Validation du comportement par le rejeu
- Détection automatique des régressions

## Architecture de déploiement {#deployment-architecture}

### Distribution du paquet {#package-distribution}

- **Nom du paquet** : `@sdk-ai-agents/core`
- **Distribution** : npm
- **Point d'entrée** : `dist/index.js`
- **Définitions de types** : `dist/index.d.ts`

### Processus de compilation {#build-process}

1. Compilation TypeScript (`tsc`)
2. Génération des source maps
3. Génération des fichiers de déclaration
4. Résultat dans `dist/`

### Dépendances {#dependencies}

**À l'exécution :**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Dépendances homologues (*peer dependencies*) :**
- `pg`: ^8.11.0 (pour PostgreSQLEventStore)

**Dépendances de développement :**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Considérations de sécurité {#security-considerations}

### Refus par défaut {#deny-by-default}

- Tous les outils doivent être déclarés explicitement
- Toutes les actions doivent passer par le moteur de politiques
- Validation obligatoire avant l'exécution

### Séparation des responsabilités {#separation-of-concerns}

- Le moteur de raisonnement ne peut pas exécuter d'outils
- Le moteur d'action valide avant l'exécution
- Le moteur de politiques vérifie toutes les actions

### Piste d'audit {#audit-trail}

- Tous les événements sont persistés
- Traçabilité complète des décisions
- Piste d'audit des politiques

## Considérations de performance {#performance-considerations}

### Performances du magasin d'événements {#event-store-performance}

- FileEventStore : écriture par lots (10 événements ou 100 ms)
- SQLEventStore : index pour des requêtes rapides
- PostgreSQLEventStore : JSONB + index GIN

### Surcoût du SDK {#sdk-overhead}

- Surcoût minimal (< 5-10 ms hors LLM et outils)
- Émission asynchrone des événements
- Écriture par lots pour les performances

## Perspectives {#future-considerations}

### Passage à l'échelle {#scalability}

- Migration vers un magasin d'événements distribué (à la Kafka)
- Prise en charge de plusieurs instances
- Mise en grappe du magasin d'événements

### Fonctionnalités {#features}

- Prise en charge de fournisseurs de LLM supplémentaires
- Magasin d'événements dans le cloud (S3, etc.)
- Tableau de bord de supervision
