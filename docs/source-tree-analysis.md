# SDK_AI_Agents - Source Tree Analysis

**Date:** 2026-01-06

## Overview

SDK_AI_Agents est organisé en une structure modulaire claire avec séparation des responsabilités. Le code source principal se trouve dans `src/` avec des sous-dossiers pour chaque domaine fonctionnel.

## Complete Directory Structure

```
SDK_AI_Agents/
├── src/                          # Source code principal
│   ├── agent.ts                 # Agent implementation (AgentImpl)
│   ├── sdk.ts                   # SDK main implementation (SDKImpl)
│   ├── index.ts                 # Public API exports
│   ├── engines/                 # Core engines
│   │   ├── reasoning-engine.ts  # Génère intentions depuis LLM
│   │   ├── action-engine.ts     # Exécute intentions après validation
│   │   ├── policy-engine.ts    # Valide intentions selon policies
│   │   └── replay-engine.ts    # Rejoue exécutions depuis événements
│   ├── stores/                  # Event store implementations
│   │   ├── event-store.ts      # Interface IEventStore
│   │   ├── file-event-store.ts # Implémentation file-based
│   │   ├── sql-event-store.ts  # Implémentation SQL générique
│   │   ├── sqlite-event-store.ts # Implémentation SQLite
│   │   └── postgresql-event-store.ts # Implémentation PostgreSQL
│   ├── providers/               # LLM provider implementations
│   │   ├── llm-provider.ts     # Interface LLMProvider
│   │   ├── openai-provider.ts  # Implémentation OpenAI
│   │   ├── anthropic-provider.ts # Implémentation Anthropic
│   │   ├── fallback-provider.ts # Provider avec fallback automatique
│   │   ├── provider-factory.ts # Factory pour créer providers
│   │   └── index.ts            # Exports providers
│   ├── managers/                # Manager classes
│   │   ├── approval-manager.ts # Gestion approbations humaines
│   │   ├── budget-tracker.ts   # Suivi budgets et usage
│   │   ├── golden-trace-manager.ts # Gestion golden traces
│   │   ├── regression-test-manager.ts # Gestion suites tests
│   │   ├── assertion-manager.ts # Gestion assertions
│   │   └── impact-analysis-manager.ts # Gestion analyses d'impact
│   ├── registry/                # Registry classes
│   │   ├── tool-registry.ts    # Gestion outils disponibles
│   │   └── capability-registry.ts # Gestion capacités
│   ├── types/                   # TypeScript type definitions
│   │   ├── index.ts            # Exports types
│   │   ├── agent.ts            # Types Agent
│   │   ├── tool.ts             # Types Tool
│   │   ├── policy.ts           # Types Policy
│   │   ├── events.ts           # Types Event
│   │   ├── run.ts              # Types Run
│   │   ├── sdk.ts              # Types SDK
│   │   ├── reasoning-graph.ts  # Types Reasoning Graph
│   │   ├── alternatives.ts     # Types Alternatives
│   │   ├── decision-patterns.ts # Types Decision Patterns
│   │   ├── trace-visualization.ts # Types Trace Visualization
│   │   ├── golden-trace.ts     # Types Golden Trace
│   │   ├── validation.ts      # Types Validation
│   │   ├── regression.ts      # Types Regression
│   │   ├── regression-test.ts # Types Regression Test
│   │   ├── assertion.ts       # Types Assertion
│   │   ├── comparison.ts      # Types Comparison
│   │   ├── impact-analysis.ts # Types Impact Analysis
│   │   ├── advanced-event-filter.ts # Types Advanced Filtering
│   │   ├── test-results-export.ts # Types Test Results Export
│   │   └── audit.ts            # Types Audit
│   ├── utils/                   # Utility functions
│   │   ├── constants.ts        # Constantes
│   │   ├── id.ts              # Génération IDs
│   │   ├── zod-to-json-schema.ts # Conversion Zod → JSON Schema
│   │   ├── reasoning-graph-builder.ts # Construction graphe raisonnement
│   │   ├── reasoning-graph-export.ts # Export graphe raisonnement
│   │   ├── alternatives-extractor.ts # Extraction alternatives
│   │   ├── pattern-analyzer.ts # Analyse patterns décision
│   │   ├── trace-visualizer.ts # Visualisation traces
│   │   ├── trace-validator.ts  # Validation traces
│   │   ├── regression-detector.ts # Détection régressions
│   │   ├── regression-test-runner.ts # Exécution tests régression
│   │   ├── test-results-exporter.ts # Export résultats tests
│   │   ├── assertion-evaluator.ts # Évaluation assertions
│   │   ├── run-comparator.ts   # Comparaison runs
│   │   ├── comparison-report-generator.ts # Génération rapports comparaison
│   │   ├── impact-analyzer.ts  # Analyse d'impact
│   │   └── advanced-event-filter.ts # Filtrage avancé événements
│   ├── evaluators/              # Evaluator classes
│   │   └── condition-evaluator.ts # Évaluation conditions policies
│   ├── errors/                  # Error classes
│   │   └── index.ts            # Exports erreurs
│   └── __tests__/               # Tests unitaires
│       ├── *.test.ts           # Tests par module
│       └── providers/          # Tests providers
├── dist/                        # Compiled output (TypeScript → JavaScript)
├── docs/                        # Documentation
│   ├── CONCEPTS.md             # Concepts clés
│   ├── QUICKSTART.md           # Guide de démarrage rapide
│   └── ...                     # Documentation générée
├── examples/                    # Example code
│   ├── quick-start.ts          # Exemple minimal
│   ├── complete-example.ts     # Exemple complet
│   └── test-api.ts            # Tests API
├── demo/                        # Next.js demo application
│   ├── app/                    # Next.js app directory
│   ├── components/             # React components
│   └── lib/                    # SDK client
├── _bmad-output/                # BMAD workflow outputs
│   ├── planning-artifacts/     # Artifacts de planification
│   └── implementation-artifacts/ # Artifacts d'implémentation
└── templates/                   # Templates
    └── starter-template/       # Template de démarrage
```

## Critical Directories

### `src/engines/`

**Purpose:** Contient les moteurs principaux du SDK qui orchestrent le cycle de vie d'un agent.

**Contains:**
- `reasoning-engine.ts`: Génère des intentions depuis le LLM (pas d'effets de bord)
- `action-engine.ts`: Exécute les intentions après validation par Policy Engine
- `policy-engine.ts`: Valide les intentions selon les policies configurées
- `replay-engine.ts`: Rejoue les exécutions depuis les événements persistés

**Entry Points:** Utilisés par `AgentImpl` et `SDKImpl`

**Integration:** Les engines sont injectés dans `AgentImpl` et `SDKImpl` via le constructeur

### `src/stores/`

**Purpose:** Implémentations de l'interface `IEventStore` pour la persistance des événements.

**Contains:**
- `event-store.ts`: Interface `IEventStore` commune
- `file-event-store.ts`: Implémentation file-based (MVP)
- `sql-event-store.ts`: Implémentation SQL générique
- `sqlite-event-store.ts`: Implémentation SQLite
- `postgresql-event-store.ts`: Implémentation PostgreSQL avec JSONB

**Entry Points:** Utilisé par `SDKImpl` et `ReplayEngine`

**Integration:** Injecté dans `SDKImpl` via la configuration

### `src/providers/`

**Purpose:** Implémentations de l'interface `LLMProvider` pour différents providers LLM.

**Contains:**
- `llm-provider.ts`: Interface `LLMProvider` commune
- `openai-provider.ts`: Implémentation OpenAI
- `anthropic-provider.ts`: Implémentation Anthropic
- `fallback-provider.ts`: Provider avec fallback automatique
- `provider-factory.ts`: Factory pour créer providers

**Entry Points:** Utilisé par `ReasoningEngine`

**Integration:** Injecté dans `ReasoningEngine` via le constructeur

### `src/managers/`

**Purpose:** Classes de gestion pour fonctionnalités avancées (approbations, budgets, tests, etc.).

**Contains:**
- `approval-manager.ts`: Gestion des approbations humaines
- `budget-tracker.ts`: Suivi des budgets et usage
- `golden-trace-manager.ts`: Gestion des golden traces
- `regression-test-manager.ts`: Gestion des suites de tests de régression
- `assertion-manager.ts`: Gestion des assertions comportementales
- `impact-analysis-manager.ts`: Gestion des analyses d'impact

**Entry Points:** Utilisés par `SDKImpl` et `PolicyEngine`

**Integration:** Injectés dans `SDKImpl` et `PolicyEngine` via le constructeur

### `src/registry/`

**Purpose:** Registries pour gérer les outils et capacités disponibles.

**Contains:**
- `tool-registry.ts`: Gestion des outils disponibles (deny-by-default)
- `capability-registry.ts`: Gestion des capacités (groupes d'outils)

**Entry Points:** Utilisés par `SDKImpl` et `ActionEngine`

**Integration:** Injectés dans `SDKImpl` et `ActionEngine` via le constructeur

### `src/types/`

**Purpose:** Définitions TypeScript pour tous les types du SDK.

**Contains:**
- Types pour Agent, Tool, Policy, Event, Run, SDK
- Types pour fonctionnalités avancées (Reasoning Graph, Alternatives, etc.)
- Types pour testing (Golden Trace, Regression, Assertion, etc.)

**Entry Points:** Importés par tous les modules

**Integration:** Utilisés partout dans le codebase pour la type-safety

### `src/utils/`

**Purpose:** Fonctions utilitaires et helpers.

**Contains:**
- `constants.ts`: Constantes globales
- `id.ts`: Génération d'IDs uniques
- `zod-to-json-schema.ts`: Conversion Zod → JSON Schema
- Utilitaires pour Reasoning Graph, Alternatives, Patterns, etc.
- Utilitaires pour testing (Validation, Regression, Assertion, etc.)

**Entry Points:** Importés par les modules qui en ont besoin

**Integration:** Utilisés par les engines, managers, et autres modules

## Entry Points

### Main Entry

- **`src/index.ts`**: Point d'entrée public du SDK, exporte toutes les APIs publiques

### Application Entry Points

- **`src/sdk.ts`**: Implémentation principale du SDK (`SDKImpl`)
- **`src/agent.ts`**: Implémentation de l'agent (`AgentImpl`)

## File Organization Patterns

### Naming Conventions

- **Files**: kebab-case pour les fichiers (ex: `reasoning-engine.ts`)
- **Classes**: PascalCase (ex: `ReasoningEngine`)
- **Interfaces**: PascalCase avec préfixe `I` si nécessaire (ex: `IEventStore`)
- **Types**: PascalCase (ex: `EventType`, `RunStatus`)
- **Functions**: camelCase (ex: `generateCompletion`)

### Module Organization

- **One class/interface per file**: Chaque fichier contient une classe ou interface principale
- **Co-located types**: Types associés dans le même fichier ou `types/`
- **Barrel exports**: `index.ts` pour exporter les APIs publiques

## Configuration Files

- **`package.json`**: Dépendances et scripts npm
- **`tsconfig.json`**: Configuration TypeScript (strict mode, ESM)
- **`biome.json`**: Configuration Biome (linting/formatting)
- **`vitest.config.ts`**: Configuration Vitest (testing)

## Notes for Development

### Adding New Features

1. **New Engine**: Créer dans `src/engines/`, injecter dans `SDKImpl` ou `AgentImpl`
2. **New Store**: Implémenter `IEventStore` dans `src/stores/`
3. **New Provider**: Implémenter `LLMProvider` dans `src/providers/`
4. **New Manager**: Créer dans `src/managers/`, injecter dans `SDKImpl`
5. **New Types**: Ajouter dans `src/types/`, exporter depuis `types/index.ts`

### Testing

- Tests unitaires dans `src/__tests__/`
- Un fichier de test par module source
- Utiliser Vitest pour les tests

### Build

- TypeScript compile `src/` → `dist/`
- Source maps générés pour debugging
- Déclarations TypeScript (`.d.ts`) générées

---

_Generated using BMAD Method `document-project` workflow_


