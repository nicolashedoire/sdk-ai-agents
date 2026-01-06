# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-01-06

### Added
- **MVP Core Features**
  - Event-sourcing natif avec persistance fichier
  - Reasoning Engine avec intégration OpenAI
  - Action Engine avec séparation raisonnement/action
  - Policy Engine avec validation avant chaque action
  - Tool Registry avec deny-by-default
  - Replay Engine pour rejouer les exécutions sans LLM
  - SDK API Layer avec interface simple et intuitive

- **Agent Lifecycle**
  - Création d'agents avec configuration minimale
  - Exécution d'agents avec boucle contrôlée
  - Arrêt d'exécution avec AbortController
  - Gestion des runs actifs

- **Tool Management**
  - Définition de tools avec validation Zod
  - Tool Registry avec allowlist
  - Versioning des tools
  - Gestion des erreurs de validation

- **Capabilities System**
  - Création de capabilities pour grouper les tools
  - Auto-enregistrement des tools dans capabilities
  - Support dans AgentConfig

- **Policies & Governance**
  - Policies globales et par agent
  - Budget (maxSteps, maxTokens)
  - Timeout
  - Allowlist de tools
  - Custom policies

- **Tracing & Observability**
  - Traces structurées avec timeline
  - Export JSON et texte
  - Filtrage d'événements
  - Récupération de traces par runId

- **Replay**
  - Replay déterministe sans LLM
  - Replay avec modifications (input, policies, tools)
  - Reproduction de la même séquence d'actions

- **Versioning**
  - Versioning des agents
  - Versioning des tools
  - Versioning des capabilities
  - Hash de configuration (configHash)

- **Documentation**
  - Guide Quick Start complet
  - Documentation des concepts clés
  - Exemples complets
  - README avec installation et usage

- **Testing**
  - 74 tests unitaires passants
  - Tests d'intégration
  - Tests de performance (benchmarks)

### Security
- Deny-by-default pour tous les tools
- Validation Zod obligatoire pour tous les inputs
- Policies appliquées structurellement
- Traçabilité complète de toutes les actions

### Performance
- Overhead SDK optimisé (< 10ms par événement)
- Batching automatique des événements
- Initialisation rapide du SDK

## [Unreleased]

### Planned
- Multi-providers LLM (Anthropic, etc.)
- Event Store SQL-based
- Policies avancées (approval humaine)
- Observabilité cognitive (graphe raisonnement)
- Performance optimizations


