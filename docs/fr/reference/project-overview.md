# Vue d'ensemble du projet

**Type :** bibliothèque (SDK TypeScript)
**Architecture :** event sourcing avec séparation des responsabilités

## Synthèse {#executive-summary}

SDK_AI_Agents est une infrastructure de gouvernance pour agents d'IA, avec un event sourcing natif, le rejeu et la sécurité dès la conception. Le SDK transforme les agents d'IA, d'outils expérimentaux, en systèmes de prise de décision gouvernables, explicables et prêts pour la production.

## Classification du projet {#project-classification}

- **Type de dépôt :** monolithe (une base de code unique et cohérente)
- **Type de projet :** bibliothèque (SDK TypeScript)
- **Langage principal :** TypeScript 5.x
- **Modèle d'architecture :** event sourcing avec séparation des responsabilités (moteur de raisonnement ≠ moteur d'action)

## Résumé de la pile technique {#technology-stack-summary}

| Catégorie | Technologie | Version | Justification |
|----------|-----------|---------|---------------|
| Langage | TypeScript | 5.3.2+ | Typage strict, prise en charge d'ESM |
| Environnement d'exécution | Node.js | 20.0.0+ | Support LTS, fonctionnalités modernes |
| Gestionnaire de paquets | npm | - | Gestionnaire de paquets standard de Node.js |
| Outil de compilation | Compilateur TypeScript | 5.3.2 | Compilation TypeScript native |
| Tests | Vitest | 1.0.4 | Exécuteur de tests rapide, fondé sur Vite |
| Analyse statique et formatage | Biome | 1.7.0 | Outil rapide et tout-en-un |
| Fournisseurs de LLM | OpenAI SDK | 4.20.0 | Intégration de l'API OpenAI |
| Fournisseurs de LLM | Anthropic SDK | 0.71.2 | Intégration de l'API Claude |
| Validation | Zod | 3.22.4 | Validation des schémas des entrées d'outils |
| UUID | uuid | 9.0.1 | Génération d'identifiants uniques |
| Base de données (facultative) | PostgreSQL | 8.11.0+ | Magasin d'événements de production (dépendance homologue) |

## Fonctionnalités clés {#key-features}

### Capacités fondamentales {#core-capabilities}

1. **Event sourcing natif**
   - Tous les événements sont persistés dans un magasin d'événements
   - Rejeu déterministe sans appel au LLM
   - Traçabilité complète de chaque décision

2. **Séparation du raisonnement et de l'action**
   - Moteur de raisonnement : génère des intentions (sans effets de bord)
   - Moteur d'action : exécute les intentions après validation
   - Sécurité dès la conception : le LLM ne provoque jamais directement d'effet de bord

3. **Gouvernance intégrée**
   - Moteur de politiques : valide les intentions avant l'exécution
   - Suivi des budgets : suit les coûts et la consommation par agent, outil et période
   - Gestionnaire d'approbations : circuit d'approbation humaine pour les actions critiques
   - Piste d'audit : traçabilité complète des décisions des politiques

4. **LLM multi-fournisseurs**
   - Abstraction LLMProvider pour OpenAI et Anthropic
   - Repli automatique entre fournisseurs
   - Configuration par fournisseur (temperature, maxTokens)

5. **Observabilité cognitive**
   - Graphe de raisonnement : visualisation du processus de raisonnement
   - Analyse des alternatives : les alternatives envisagées par l'agent
   - Schémas de décision : les schémas de décision sur plusieurs exécutions
   - Visualisation des traces : préparation des traces pour la visualisation

6. **Tests et assurance qualité**
   - Traces de référence : des traces de référence pour les tests
   - Détection des régressions : détection automatique des régressions
   - Assertions : assertions de comportement sur les traces
   - Intégration CI/CD : export des résultats de tests (JUnit XML, JSON)

7. **Observabilité avancée**
   - Comparaison d'exécutions : comparer deux exécutions
   - Analyse d'impact : analyse d'impact avant/après un déploiement
   - Filtrage avancé des événements : filtrage avancé des événements avec des chemins JSON

## Points forts de l'architecture {#architecture-highlights}

### Abstraction du magasin d'événements {#event-store-abstraction}

- **IEventStore** : interface commune à tous les magasins d'événements
- **FileEventStore** : implémentation à base de fichiers (MVP)
- **SQLEventStore** : implémentation SQL générique
- **SQLiteEventStore** : implémentation SQLite
- **PostgreSQLEventStore** : implémentation PostgreSQL avec JSONB

### Architecture des moteurs {#engine-architecture}

- **ReasoningEngine** : génère des intentions à partir du LLM
- **ActionEngine** : exécute les intentions après validation
- **PolicyEngine** : valide les intentions au regard des politiques
- **ReplayEngine** : rejoue des exécutions à partir des événements

### Système de registres {#registry-system}

- **ToolRegistry** : gère les outils disponibles
- **CapabilityRegistry** : gère les capacités (groupes d'outils)

### Système de gestionnaires {#manager-system}

- **ApprovalManager** : gestion des approbations humaines
- **BudgetTracker** : suivi des budgets et de la consommation
- **GoldenTraceManager** : gestion des traces de référence
- **RegressionTestManager** : gestion des suites de tests de régression
- **AssertionManager** : gestion des assertions de comportement
- **ImpactAnalysisManager** : gestion des analyses d'impact

## Aperçu du développement {#development-overview}

### Prérequis {#prerequisites}

- Node.js 20.0.0+ (LTS)
- npm ou équivalent
- TypeScript 5.3.2+ (installé localement)

### Pour commencer {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### Commandes clés {#key-commands}

- **Installer :** `npm install`
- **Compiler :** `npm run build`
- **Développer :** `npm run dev` (mode surveillance)
- **Tester :** `npm test`
- **Tester en mode surveillance :** `npm run test:watch`
- **Couverture des tests :** `npm run test:coverage`
- **Analyse statique :** `npm run lint`
- **Formater :** `npm run format`
- **Vérifier :** `npm run check` (analyse statique + formatage)

## Structure du dépôt {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

Voir [Arborescence des sources](../contributing/source-tree) pour le détail de `src/`.

## Plan de la documentation {#documentation-map}

Pour des informations détaillées, voir :

- [Introduction](../guide/introduction) - À quoi sert le SDK
- [Arborescence des sources](../contributing/source-tree) - Structure des répertoires
- [Architecture](./architecture) - Architecture détaillée
- [Guide de développement](../contributing/development) - Processus de développement
