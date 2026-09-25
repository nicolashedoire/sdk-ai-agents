# Arborescence des sources

## Vue d'ensemble {#overview}

Le SDK suit une structure modulaire claire, avec une séparation des responsabilités. Le code source principal se trouve dans `src/`, avec un sous-dossier pour chaque domaine fonctionnel.

## Structure complète des répertoires {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents, the Web
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## Répertoires essentiels {#critical-directories}

### `src/engines/` {#src-engines}

**Rôle :** contient les moteurs principaux du SDK, qui orchestrent le cycle de vie d'un agent.

**Contenu :**
- `reasoning-engine.ts` : génère des intentions à partir du LLM (sans effets de bord)
- `action-engine.ts` : exécute les intentions après leur validation par le moteur de politiques
- `policy-engine.ts` : valide les intentions au regard des politiques configurées
- `replay-engine.ts` : rejoue des exécutions à partir des événements persistés

**Points d'entrée :** utilisés par `AgentImpl` et `SDKImpl`

**Intégration :** les moteurs sont injectés dans `AgentImpl` et `SDKImpl` par le constructeur

### `src/stores/` {#src-stores}

**Rôle :** implémentations de l'interface `IEventStore` pour la persistance des événements.

**Contenu :**
- `event-store.ts` : interface commune `IEventStore`
- `file-event-store.ts` : implémentation à base de fichiers (MVP)
- `sql-event-store.ts` : implémentation SQL générique
- `sqlite-event-store.ts` : implémentation SQLite
- `postgresql-event-store.ts` : implémentation PostgreSQL avec JSONB
- `observed-event-store.ts` : transmet en direct chaque événement ajouté à ses écouteurs (`onEvent`, `sdk.subscribe`)

**Points d'entrée :** utilisés par `SDKImpl` et `ReplayEngine`

**Intégration :** injectés dans `SDKImpl` par la configuration

### `src/providers/` {#src-providers}

**Rôle :** implémentations de l'interface `LLMProvider` pour différents fournisseurs de LLM.

**Contenu :**
- `llm-provider.ts` : interface commune `LLMProvider`
- `openai-provider.ts` : implémentation OpenAI
- `anthropic-provider.ts` : implémentation Anthropic
- `fallback-provider.ts` : fournisseur avec repli automatique
- `provider-factory.ts` : fabrique de fournisseurs

**Points d'entrée :** utilisés par `ReasoningEngine`

**Intégration :** injectés dans `ReasoningEngine` par le constructeur

### `src/managers/` {#src-managers}

**Rôle :** classes de gestion des fonctionnalités avancées (approbations, budgets, tests, etc.).

**Contenu :**
- `approval-manager.ts` : gestion des approbations humaines
- `budget-tracker.ts` : suivi des budgets et de la consommation
- `golden-trace-manager.ts` : gestion des traces de référence
- `regression-test-manager.ts` : gestion des suites de tests de régression
- `assertion-manager.ts` : gestion des assertions de comportement
- `impact-analysis-manager.ts` : gestion des analyses d'impact

**Points d'entrée :** utilisés par `SDKImpl` et `PolicyEngine`

**Intégration :** injectés dans `SDKImpl` et `PolicyEngine` par le constructeur

### `src/registry/` {#src-registry}

**Rôle :** registres de gestion des outils et des capacités disponibles.

**Contenu :**
- `tool-registry.ts` : gestion des outils disponibles (refus par défaut)
- `capability-registry.ts` : gestion des capacités (groupes d'outils)

**Points d'entrée :** utilisés par `SDKImpl` et `ActionEngine`

**Intégration :** injectés dans `SDKImpl` et `ActionEngine` par le constructeur

### `src/types/` {#src-types}

**Rôle :** définitions TypeScript de tous les types du SDK.

**Contenu :**
- Types pour Agent, Tool, Policy, Event, Run, SDK
- Types pour les fonctionnalités avancées (graphe de raisonnement, alternatives, etc.)
- Types pour les tests (trace de référence, régression, assertion, etc.)

**Points d'entrée :** importés par tous les modules

**Intégration :** utilisés dans toute la base de code pour la sûreté du typage

### `src/utils/` {#src-utils}

**Rôle :** fonctions utilitaires et auxiliaires.

**Contenu :**
- `constants.ts` : constantes globales
- `id.ts` : génération d'identifiants uniques
- `zod-to-json-schema.ts` : conversion Zod → JSON Schema
- Utilitaires pour le graphe de raisonnement, les alternatives, les schémas de décision, etc.
- Utilitaires pour les tests (validation, régression, assertion, etc.)

**Points d'entrée :** importés par les modules qui en ont besoin

**Intégration :** utilisés par les moteurs, les gestionnaires et les autres modules

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**Rôle :** les agents cognitifs — état mental explicite, opérations cognitives, contrôleurs, profils de penseur.

**Contenu :** `cognitive-agent.ts` (boucle d'exécution), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (heuristique), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` et `thought-prompts.ts`, `mental-state.ts` (schémas et types), `mental-state-reducer.ts` et `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/study/` {#src-study}

**Rôle :** les études (`sdk.createStudy`) — un chercheur qui comprend un objet, puis propose de le repenser, séparé du moteur cognitif.

**Contenu :** `study.ts` (la classe `Study` : exécutions, gardien, amendements, recherche de l'existant), `passages.ts` (les sept passages, leurs collections et leurs schémas), `study-config.ts` (configuration, charte figée et son empreinte), `study-prompts.ts` et `study-replies.ts` (prompts reconstruits à chaque appel, réponses lues au regard de leurs schémas), `study-claims.ts` (statuts des affirmations vérifiés par le code), `study-sources.ts` (sources, paramètres de requête, résultats), `study-model.ts` et `study-run.ts` (appels au modèle, limites, événements), `study-report.ts`, `study-markdown.ts` et `study-labels.ts` (le rapport, et le dossier en onze langues), `study-types.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**Rôle :** les décisions typées — le contrat Noul/Choice/Score, le client HTTP de TypeSafe Jev et le `DecisionService` qui se trouve derrière `sdk.decisions`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**Rôle :** la tarification et les rapports de coût par exécution ; la politique de nouvelles tentatives et le fournisseur de LLM qui retente ; les règles d'incident, les notificateurs (e-mail, webhook, Resend) et le magasin d'événements surveillé.

### `src/mcp/` et `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**Rôle :** le serveur MCP qui expose des outils gouvernés et des ressources (`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`) et le client MCP qui importe des outils (`mcp-client.ts`). Publiés sous le point d'entrée `@sdk-ai-agents/core/mcp`, pour que le cœur ne dépende pas de `@modelcontextprotocol/sdk`.

### `src/tools/` {#src-tools}

**Rôle :** les sources d'outils qui construisent des `ToolDefinition` à partir d'un système, sans dépendance à MCP : `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (API web), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (dossiers et ressources), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (bases de données en lecture seule), `agent-tools.ts` (agents sous forme d'outils), ainsi que `tool-names.ts` et `bounded-text.ts`. `web/` contient les outils de recherche sur le Web : `web-tools.ts` (`webTools`), `guarded-http.ts` et `ip-ranges.ts` (le client HTTP et ses vérifications d'adresse, de redirection, de taille et de durée), `robots.ts` et `politeness.ts` (robots.txt, espacement des requêtes par hôte), `web-cache.ts`, `results.ts` (résultats citables), `html-parser.ts` / `html-to-markdown.ts` / `html-entities.ts` (des pages au Markdown), `pdf-text.ts` (les PDF, avec le paquet facultatif `unpdf`), `web-fetch.ts`, `search-chain.ts` et `providers/` (DuckDuckGo, SearXNG, Brave, Tavily, Serper), `sources/` (arXiv, Wikipédia, GitHub).

### `src/__tests__/support/` {#src-tests-support}

**Rôle :** les doublures de test qui implémentent les ports du SDK (fournisseur de LLM scripté, client de décisions en mémoire, serveur HTTP local, client PostgreSQL enregistreur, chargeur `node:sqlite`) — sans simulation de modules.

## Points d'entrée {#entry-points}

### Point d'entrée principal {#main-entry}

- **`src/index.ts`** : point d'entrée public du SDK, exporte toutes les API publiques

### Points d'entrée de l'application {#application-entry-points}

- **`src/sdk.ts`** : implémentation principale du SDK (`SDKImpl`)
- **`src/agent.ts`** : implémentation de l'agent (`AgentImpl`)

## Principes d'organisation des fichiers {#file-organization-patterns}

### Conventions de nommage {#naming-conventions}

- **Fichiers** : kebab-case pour les fichiers (par exemple `reasoning-engine.ts`)
- **Classes** : PascalCase (par exemple `ReasoningEngine`)
- **Interfaces** : PascalCase avec le préfixe `I` si nécessaire (par exemple `IEventStore`)
- **Types** : PascalCase (par exemple `EventType`, `RunStatus`)
- **Fonctions** : camelCase (par exemple `generateCompletion`)

### Organisation des modules {#module-organization}

- **Une classe ou une interface par fichier** : chaque fichier contient une classe ou une interface principale
- **Types colocalisés** : les types associés se trouvent dans le même fichier ou dans `types/`
- **Exports groupés** (*barrel exports*) : `index.ts` pour exporter les API publiques

## Fichiers de configuration {#configuration-files}

- **`package.json`** : dépendances et scripts npm
- **`tsconfig.json`** : configuration TypeScript (mode strict, ESM)
- **`biome.json`** : configuration de Biome (analyse statique et formatage)
- **`vitest.config.ts`** : configuration de Vitest (tests)

## Notes pour le développement {#notes-for-development}

### Ajouter de nouvelles fonctionnalités {#adding-new-features}

1. **Nouveau moteur** : créez-le dans `src/engines/`, injectez-le dans `SDKImpl` ou `AgentImpl`
2. **Nouveau magasin** : implémentez `IEventStore` dans `src/stores/`
3. **Nouveau fournisseur** : implémentez `LLMProvider` dans `src/providers/`
4. **Nouveau gestionnaire** : créez-le dans `src/managers/`, injectez-le dans `SDKImpl`
5. **Nouveaux types** : ajoutez-les à `src/types/`, exportez-les depuis `types/index.ts`

### Tests {#testing}

- Tests unitaires dans `src/__tests__/`
- Un fichier de test par module source
- Utilisez Vitest pour les tests

### Compilation {#build}

- TypeScript compile `src/` → `dist/`
- Source maps générées pour le débogage
- Déclarations TypeScript (`.d.ts`) générées
