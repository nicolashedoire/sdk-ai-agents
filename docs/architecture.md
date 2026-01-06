# SDK_AI_Agents - Architecture

**Date:** 2026-01-06

## Executive Summary

SDK_AI_Agents suit une architecture event-sourcing avec séparation stricte entre raisonnement et action. Le SDK masque la complexité interne derrière une API simple et intuitive.

## Architecture Pattern

**Pattern Principal:** Event-Sourcing avec Separation of Concerns

- **Reasoning Engine** : Génère des intentions depuis le LLM (pas d'effets de bord)
- **Action Engine** : Exécute les intentions après validation
- **Policy Engine** : Valide les intentions selon les policies
- **Event Store** : Source de vérité unique pour tous les événements

## Component Overview

### 1. SDK API Layer (Facade)

**Responsabilités:**
- Interface publique simple et intuitive
- Mapping API → événements internes
- Configuration par défaut intelligente
- Gestion du cycle de vie SDK et agents

**Fichiers:**
- `src/sdk.ts`: Implémentation principale (`SDKImpl`)
- `src/agent.ts`: Implémentation agent (`AgentImpl`)
- `src/index.ts`: Exports publics

**Interfaces principales:**
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

### 2. Reasoning Engine

**Responsabilités:**
- Intégration avec provider LLM (OpenAI/Anthropic)
- Génération d'intentions structurées depuis réponses LLM
- Gestion du contexte conversationnel
- Émission d'événements de raisonnement

**Fichier:** `src/engines/reasoning-engine.ts`

**Contraintes:**
- Ne peut jamais exécuter directement un tool
- Ne peut jamais provoquer d'effet de bord
- Génère uniquement des intentions structurées

**Dépendances:**
- LLM Provider (Strategy Pattern)
- Event Store (émission événements)

### 3. Action Engine

**Responsabilités:**
- Réception et validation des intentions
- Exécution des tools via Tool Registry
- Application des policies via Policy Engine
- Émission d'événements d'action

**Fichier:** `src/engines/action-engine.ts`

**Contraintes:**
- Toute action doit passer par Action Engine
- Validation obligatoire avant exécution
- Émission d'événement pour chaque action

**Dépendances:**
- Policy Engine (validation)
- Tool Registry (exécution)
- Event Store (émission événements)
- Approval Manager (optionnel)
- Budget Tracker (optionnel)

### 4. Policy Engine

**Responsabilités:**
- Validation des intentions contre policies actives
- Application des policies globales et spécifiques
- Vérification budgets, timeouts, allowlists
- Émission d'événements de validation

**Fichier:** `src/engines/policy-engine.ts`

**Contraintes:**
- Deny-by-default : tout est interdit sauf explicitement autorisé
- Vérification obligatoire avant chaque action

**Dépendances:**
- Event Store (émission événements validation)
- Budget Tracker (optionnel)
- Condition Evaluator

### 5. Replay Engine

**Responsabilités:**
- Rejouer les exécutions depuis les événements persistés
- Replay déterministe sans appel LLM
- Génération de nouveaux événements de replay

**Fichier:** `src/engines/replay-engine.ts`

**Contraintes:**
- Replay utilise uniquement les événements persistés
- Pas d'appel LLM pendant le replay
- Replay reproduit la même séquence logique

**Dépendances:**
- Event Store (lecture événements)
- Action Engine (exécution intentions)

### 6. Event Store

**Responsabilités:**
- Persistance des événements (append-only)
- Récupération des événements par runId
- Filtrage et requêtes sur événements
- Abstraction pour différentes implémentations

**Fichiers:**
- `src/stores/event-store.ts`: Interface `IEventStore`
- `src/stores/file-event-store.ts`: Implémentation file-based
- `src/stores/sql-event-store.ts`: Implémentation SQL générique
- `src/stores/sqlite-event-store.ts`: Implémentation SQLite
- `src/stores/postgresql-event-store.ts`: Implémentation PostgreSQL

**Interface:**
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

### 7. Tool Registry

**Responsabilités:**
- Gestion des tools déclarés
- Validation des schémas d'inputs (Zod)
- Exécution des tools avec validation
- Allowlist stricte (deny-by-default)

**Fichier:** `src/registry/tool-registry.ts`

**Contraintes:**
- Rejet automatique des tools non déclarés
- Validation obligatoire avant exécution
- Allowlist stricte

**Dépendances:**
- Zod (validation schémas)

### 8. Capability Registry

**Responsabilités:**
- Gestion des capacités (groupes d'outils)
- Association tools ↔ capabilities

**Fichier:** `src/registry/capability-registry.ts`

### 9. LLM Provider Abstraction

**Responsabilités:**
- Abstraction des différences entre providers LLM
- Normalisation des formats de requête/réponse
- Support multi-provider (OpenAI, Anthropic)
- Fallback automatique

**Fichiers:**
- `src/providers/llm-provider.ts`: Interface `LLMProvider`
- `src/providers/openai-provider.ts`: Implémentation OpenAI
- `src/providers/anthropic-provider.ts`: Implémentation Anthropic
- `src/providers/fallback-provider.ts`: Provider avec fallback
- `src/providers/provider-factory.ts`: Factory pour créer providers

**Interface:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
}
```

### 10. Manager Classes

**Responsabilités:**
- Gestion de fonctionnalités avancées
- Coordination entre composants

**Fichiers:**
- `src/managers/approval-manager.ts`: Gestion approbations humaines
- `src/managers/budget-tracker.ts`: Suivi budgets et usage
- `src/managers/golden-trace-manager.ts`: Gestion golden traces
- `src/managers/regression-test-manager.ts`: Gestion suites tests
- `src/managers/assertion-manager.ts`: Gestion assertions
- `src/managers/impact-analysis-manager.ts`: Gestion analyses d'impact

## Data Architecture

### Event Types

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'intention.generated'
  | 'intention.rejected'
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed'
  | 'provider.fallback'
  | 'error.occurred';
```

### Event Structure

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

### Event Store Implementations

1. **FileEventStore** (MVP)
   - Persistance file-based
   - Un fichier JSON par runId
   - Flush automatique par batch

2. **SQLEventStore** (Production)
   - Implémentation SQL générique
   - Support SQLite et PostgreSQL
   - Indexes pour performance

3. **PostgreSQLEventStore** (Production avancée)
   - Utilise JSONB pour stockage efficace
   - Indexes GIN pour requêtes JSON
   - Support requêtes avancées

## API Design

### SDK Initialization

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Agent Creation

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Tool Definition

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Agent Execution

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Testing Strategy

### Unit Tests

- Tests unitaires pour chaque module
- Utilisation de Vitest
- Mocking des dépendances externes

### Integration Tests

- Tests d'intégration pour les workflows complets
- Tests avec différents event stores
- Tests de replay

### Golden Traces

- Traces de référence pour tests de régression
- Validation comportementale via replay
- Détection automatique de régressions

## Deployment Architecture

### Package Distribution

- **Package Name**: `@sdk-ai-agents/core`
- **Distribution**: npm
- **Entry Point**: `dist/index.js`
- **Type Definitions**: `dist/index.d.ts`

### Build Process

1. TypeScript compilation (`tsc`)
2. Source maps générés
3. Declaration files générés
4. Output dans `dist/`

### Dependencies

**Runtime:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Peer Dependencies:**
- `pg`: ^8.11.0 (pour PostgreSQLEventStore)

**Dev Dependencies:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Security Considerations

### Deny-by-Default

- Tous les tools doivent être explicitement déclarés
- Toutes les actions doivent passer par Policy Engine
- Validation obligatoire avant exécution

### Separation of Concerns

- Reasoning Engine ne peut pas exécuter de tools
- Action Engine valide avant exécution
- Policy Engine vérifie toutes les actions

### Audit Trail

- Tous les événements sont persistés
- Traçabilité complète des décisions
- Audit trail des policies

## Performance Considerations

### Event Store Performance

- FileEventStore: Flush par batch (10 événements ou 100ms)
- SQLEventStore: Indexes pour requêtes rapides
- PostgreSQLEventStore: JSONB + GIN indexes

### Overhead SDK

- Overhead minimal (< 5-10ms hors LLM/tools)
- Event emission asynchrone
- Batch flushing pour performance

## Future Considerations

### Scalability

- Migration vers event store distribué (Kafka-style)
- Support multi-instance
- Event store clustering

### Features

- Support providers LLM supplémentaires
- Event store cloud (S3, etc.)
- Dashboard de monitoring

---

_Generated using BMAD Method `document-project` workflow_


