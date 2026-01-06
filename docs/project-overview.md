# SDK_AI_Agents - Project Overview

**Date:** 2026-01-06
**Type:** Library (TypeScript SDK)
**Architecture:** Event-Sourcing with Separation of Concerns

## Executive Summary

SDK_AI_Agents est une infrastructure de gouvernance des agents IA avec event-sourcing natif, replay et sécurité by design. Le SDK transforme les agents IA d'outils expérimentaux en systèmes décisionnels gouvernables, explicables et prêts pour la production.

## Project Classification

- **Repository Type:** Monolith (single cohesive codebase)
- **Project Type:** Library (TypeScript SDK)
- **Primary Language:** TypeScript 5.x
- **Architecture Pattern:** Event-Sourcing with Separation of Concerns (Reasoning Engine ≠ Action Engine)

## Technology Stack Summary

| Category | Technology | Version | Justification |
|----------|-----------|---------|---------------|
| Language | TypeScript | 5.3.2+ | Type-safety strict, ESM support |
| Runtime | Node.js | 20.0.0+ | LTS support, modern features |
| Package Manager | npm | - | Standard Node.js package manager |
| Build Tool | TypeScript Compiler | 5.3.2 | Native TypeScript compilation |
| Testing | Vitest | 1.0.4 | Fast, Vite-based test runner |
| Linting/Formatting | Biome | 1.7.0 | Fast, all-in-one tool |
| LLM Providers | OpenAI SDK | 4.20.0 | OpenAI API integration |
| LLM Providers | Anthropic SDK | 0.71.2 | Claude API integration |
| Validation | Zod | 3.22.4 | Schema validation for tool inputs |
| UUID | uuid | 9.0.1 | Unique ID generation |
| Database (optional) | PostgreSQL | 8.11.0+ | Production event store (peer dependency) |

## Key Features

### Core Capabilities

1. **Event-Sourcing Natif**
   - Tous les événements sont persistés dans un event store
   - Replay déterministe sans appel LLM
   - Traçabilité complète de toutes les décisions

2. **Séparation Raisonnement/Action**
   - Reasoning Engine : génère des intentions (pas d'effets de bord)
   - Action Engine : exécute les intentions après validation
   - Sécurité par design : le LLM ne provoque jamais d'effet de bord direct

3. **Gouvernance Intégrée**
   - Policy Engine : validation des intentions avant exécution
   - Budget Tracker : suivi des coûts et usage par agent/tool/période
   - Approval Manager : workflow d'approbation humaine pour actions critiques
   - Audit Trail : traçabilité complète des décisions de policy

4. **Multi-Provider LLM**
   - Abstraction LLMProvider pour OpenAI et Anthropic
   - Fallback automatique entre providers
   - Configuration par provider (temperature, maxTokens)

5. **Observabilité Cognitive**
   - Reasoning Graph : visualisation du processus de raisonnement
   - Alternatives Analysis : alternatives envisagées par l'agent
   - Decision Patterns : patterns de décision sur plusieurs runs
   - Trace Visualization : préparation des traces pour visualisation

6. **Testing & Quality Assurance**
   - Golden Traces : traces de référence pour tests
   - Regression Detection : détection automatique de régressions
   - Assertions : assertions comportementales sur les traces
   - CI/CD Integration : export de résultats de tests (JUnit XML, JSON)

7. **Advanced Observability**
   - Run Comparison : comparaison de deux exécutions
   - Impact Analysis : analyse d'impact avant/après déploiement
   - Advanced Event Filtering : filtrage avancé d'événements avec JSON paths

## Architecture Highlights

### Event Store Abstraction

- **IEventStore** : Interface commune pour tous les event stores
- **FileEventStore** : Implémentation file-based (MVP)
- **SQLEventStore** : Implémentation SQL générique
- **SQLiteEventStore** : Implémentation SQLite
- **PostgreSQLEventStore** : Implémentation PostgreSQL avec JSONB

### Engine Architecture

- **ReasoningEngine** : Génère des intentions depuis le LLM
- **ActionEngine** : Exécute les intentions après validation
- **PolicyEngine** : Valide les intentions selon les policies
- **ReplayEngine** : Rejoue les exécutions depuis les événements

### Registry System

- **ToolRegistry** : Gestion des outils disponibles
- **CapabilityRegistry** : Gestion des capacités (groupes d'outils)

### Manager System

- **ApprovalManager** : Gestion des approbations humaines
- **BudgetTracker** : Suivi des budgets et usage
- **GoldenTraceManager** : Gestion des golden traces
- **RegressionTestManager** : Gestion des suites de tests de régression
- **AssertionManager** : Gestion des assertions comportementales
- **ImpactAnalysisManager** : Gestion des analyses d'impact

## Development Overview

### Prerequisites

- Node.js 20.0.0+ (LTS)
- npm ou équivalent
- TypeScript 5.3.2+ (installé localement)

### Getting Started

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

### Key Commands

- **Install:** `npm install`
- **Build:** `npm run build`
- **Dev:** `npm run dev` (watch mode)
- **Test:** `npm test`
- **Test Watch:** `npm run test:watch`
- **Test Coverage:** `npm run test:coverage`
- **Lint:** `npm run lint`
- **Format:** `npm run format`
- **Check:** `npm run check` (lint + format)

## Repository Structure

```
SDK_AI_Agents/
├── src/                    # Source code principal
│   ├── agent.ts           # Agent implementation
│   ├── sdk.ts             # SDK main implementation
│   ├── engines/           # Core engines (reasoning, action, policy, replay)
│   ├── stores/            # Event store implementations
│   ├── providers/        # LLM provider implementations
│   ├── managers/         # Manager classes (approval, budget, etc.)
│   ├── registry/         # Registry classes (tool, capability)
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── evaluators/       # Evaluator classes (condition)
│   └── errors/           # Error classes
├── dist/                  # Compiled output
├── docs/                  # Documentation
├── examples/              # Example code
├── _bmad-output/          # BMAD workflow outputs
└── demo/                  # Next.js demo application
```

## Documentation Map

For detailed information, see:

- [index.md](./index.md) - Master documentation index
- [source-tree-analysis.md](./source-tree-analysis.md) - Directory structure
- [architecture.md](./architecture.md) - Detailed architecture
- [development-guide.md](./development-guide.md) - Development workflow

---

_Generated using BMAD Method `document-project` workflow_

