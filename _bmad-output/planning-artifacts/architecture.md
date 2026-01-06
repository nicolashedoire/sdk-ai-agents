---
stepsCompleted: [1, 2]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
  - _bmad-output/planning-artifacts/product-brief-SDK_AI_Agents-2026-01-06.md
  - _bmad-output/planning-artifacts/research/technical-ecosysteme-sdks-frameworks-agents-ia-research-2026-01-06.md
  - _bmad-output/planning-artifacts/epics.md
workflowType: 'architecture'
project_name: 'SDK_AI_Agents'
user_name: 'Nicolashedoire'
date: '2026-01-06'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

Le projet SDK_AI_Agents comprend 78 Functional Requirements organisés en 9 epics MVP avec 65 stories. Les domaines fonctionnels principaux sont :

- **Agent Lifecycle & Execution Management** : Création, démarrage, arrêt, gestion d'état des agents
- **Tool & Capability Management** : Définition, validation, contrôle des outils avec sécurité deny-by-default
- **Policies & Governance** : Système de gouvernance native avec policies globales et spécifiques
- **Runtime Architecture** : Séparation stricte raisonnement/action (Reasoning Engine ≠ Action Engine)
- **Event Sourcing & Persistence** : Event log comme source de vérité unique pour traçabilité complète
- **Tracing & Observability** : Observabilité complète des décisions, contraintes et raisonnement
- **Replay & Debugging** : Replay déterministe sans LLM pour debugging et audit
- **Versioning & Audit** : Traçabilité des versions d'agents et exécutions

**Non-Functional Requirements:**

Les NFRs critiques qui vont guider les décisions architecturales :

- **Performance** : Overhead SDK < 5-10ms (hors LLM/tools), replay sans appel LLM
- **Fiabilité** : 100% des runs rejouables, aucun événement perdu, aucun tool sans event correspondant
- **Sécurité** : Deny-by-default structurel, sécurité par impossibilité (pas par configuration)
- **Type-safety** : TypeScript strict, API entièrement typée, prévisible
- **Scalabilité** : Event store file-based (MVP) → SQL (production) → distribué (scale)
- **Déterminisme** : Replay = même séquence logique, même ordre de tool calls

**Scale & Complexity:**

- **Primary domain** : SDK/package TypeScript/Node.js (developer tool)
- **Complexity level** : Moyenne à élevée (architecture sophistiquée sous-jacente, API simple exposée)
- **Estimated architectural components** : ~8 composants majeurs (Event Store, Reasoning Engine, Action Engine, Policy Engine, Tool Registry, Trace Engine, Replay Engine, SDK API Layer)

### Technical Constraints & Dependencies

**Contraintes techniques non négociables (PRD) :**

1. **Event log = source de vérité unique** : Pas de logique "cachée", tout est traçable et rejouable
2. **Deny-by-default** : Tool, action, capability - tout doit être explicitement autorisé
3. **API stable et minimaliste** : Peu de concepts mais solides, type-safe, documentée, prévisible
4. **Séparation raisonnement/action** : Le LLM ne provoque jamais d'effet de bord direct
5. **Replay sans LLM** : Replay déterministe à partir des événements uniquement

**Stack technique MVP :**

- TypeScript 5.x avec mode strict
- Node.js 20+ (LTS)
- Support ESM et CommonJS
- npm package (@sdk-ai-agents/core)
- Event store : in-memory + file (MVP)
- 1 provider LLM (OpenAI ou Anthropic)

**Dépendances identifiées :**

- Provider LLM (OpenAI ou Anthropic) pour Reasoning Engine
- Zod ou équivalent pour validation de schémas (tool inputs)
- Système de fichiers pour persistance événements (MVP)
- Potentiellement SQL pour event store production (post-MVP)

### Cross-Cutting Concerns Identified

**Concerns transversaux qui affecteront plusieurs composants :**

1. **Event-Sourcing** : Tous les composants doivent émettre des événements structurés, l'event log est la source de vérité
2. **Sécurité by Design** : Deny-by-default doit être garanti architecturalement, pas optionnellement
3. **Observabilité** : Chaque décision, action, contrainte doit être traçable
4. **Testabilité** : Architecture doit permettre tests basés sur traces (golden traces), replay pour tests
5. **Versioning & Audit** : Traçabilité des versions d'agents et exécutions pour conformité
6. **Performance** : Overhead minimal malgré traçabilité complète (< 5-10ms)
7. **Simplicité API** : Complexité interne masquée par API simple et intuitive

### Défis Architecturaux Uniques

**Défis spécifiques identifiés :**

1. **Event-sourcing invisible** : Complexité interne (event-sourcing) masquée par API simple
2. **Séparation raisonnement/action garantie** : Architecture doit garantir que LLM ne provoque jamais d'effet de bord
3. **Replay déterministe sans LLM** : Replay doit fonctionner uniquement à partir des événements persistés
4. **Gouvernance native** : Policies intégrées au runtime, pas un plugin optionnel
5. **Performance avec traçabilité complète** : Overhead minimal malgré event-sourcing complet

### Implications Architecturales

**Composants architecturaux estimés :**

- Event Store (in-memory + file persistence)
- Event Bus / Event Publisher (distribution événements)
- Reasoning Engine (intégration LLM, génération intentions)
- Action Engine (exécution tools gouvernée)
- Policy Engine (validation & enforcement policies)
- Tool Registry (gestion capabilities/tools)
- Trace/Replay Engine (tracing, replay déterministe)
- SDK API Layer (facade simple masquant complexité)

**Patterns architecturaux requis :**

- Event Sourcing (source de vérité unique)
- CQRS (séparation raisonnement/action)
- Strategy Pattern (providers LLM, event stores)
- Facade Pattern (API simple masquant complexité interne)
- Observer Pattern (tracing, événements)
- Repository Pattern (abstraction accès données)

---

## Core Architectural Decisions

### ADR-001: Event-Sourcing comme Source de Vérité Unique

**Status:** Accepted

**Context:**
Le replay natif et l'audit complet sont des différenciateurs clés du SDK. Pour garantir que chaque exécution est rejouable et traçable, nous devons stocker l'historique complet de chaque action.

**Decision:**
Adopter l'Event-Sourcing comme pattern architectural fondamental. L'event log est la source de vérité unique pour toutes les exécutions. Aucune logique métier ne modifie l'état sans générer d'événement correspondant.

**Consequences:**
- ✅ Replay déterministe possible sans LLM
- ✅ Audit trail complet garanti
- ✅ Traçabilité complète de chaque décision
- ⚠️ Overhead de persistance (mitigé par écriture asynchrone)
- ⚠️ Complexité interne accrue (masquée par API simple)

**Implementation:**
- Event Store avec interface abstraite (permettant file → SQL → distribué)
- Tous les composants émettent des événements structurés
- Event log immuable (append-only)
- Projection simple pour reconstruction d'état

---

### ADR-002: Séparation Raisonnement/Action (CQRS)

**Status:** Accepted

**Context:**
Le principe fondamental du SDK est que "le LLM ne provoque jamais d'effet de bord". Pour garantir cette propriété structurellement, nous devons séparer clairement le raisonnement de l'action.

**Decision:**
Adopter une architecture CQRS avec deux engines distincts :
- **Reasoning Engine** : Intègre le LLM, génère des intentions structurées (Command)
- **Action Engine** : Valide et exécute les actions gouvernées (Command Handler)

Le LLM ne peut jamais appeler directement un tool. Toutes les actions passent par l'Action Engine qui applique les policies.

**Consequences:**
- ✅ Sécurité garantie par architecture (pas par configuration)
- ✅ Gouvernance native possible
- ✅ Traçabilité complète raisonnement → action
- ⚠️ Latence légèrement accrue (mitigée par validation rapide)
- ⚠️ Complexité architecture (masquée par API simple)

**Implementation:**
- Reasoning Engine : Interface avec LLM, génère `Intention` structurée
- Action Engine : Reçoit `Intention`, valide via Policy Engine, exécute via Tool Registry
- Communication via événements (pas d'appels directs)

---

### ADR-003: Deny-by-Default Structurel

**Status:** Accepted

**Context:**
La sécurité doit être une propriété structurelle, pas une feature optionnelle. Pour garantir que les agents ne peuvent pas faire d'actions non autorisées, nous devons implémenter deny-by-default au niveau architectural.

**Decision:**
Tout est interdit par défaut. Un tool doit être explicitement déclaré ET autorisé dans une policy pour être utilisable. Le Tool Registry maintient une allowlist stricte. Le Policy Engine vérifie chaque intention avant exécution.

**Consequences:**
- ✅ Sécurité par impossibilité (pas par configuration)
- ✅ Réduction drastique des risques
- ✅ Conformité facilitée
- ⚠️ Configuration explicite requise (acceptable pour sécurité)

**Implementation:**
- Tool Registry : Allowlist stricte, rejet automatique des tools non déclarés
- Policy Engine : Vérification obligatoire avant chaque action
- Validation au niveau Action Engine (dernière ligne de défense)

---

### ADR-004: Event Store Abstraction avec Migration Progressive

**Status:** Accepted

**Context:**
Le MVP nécessite un event store simple (file-based), mais la production nécessitera une scalabilité horizontale. Nous devons permettre une migration progressive sans réécriture.

**Decision:**
Créer une interface abstraite `EventStore` avec implémentations multiples :
- MVP : `FileEventStore` (in-memory + file persistence)
- Production : `SQLEventStore` (PostgreSQL/MySQL)
- Scale : `DistributedEventStore` (Kafka-style, post-MVP)

L'interface garantit la compatibilité et permet migration transparente.

**Consequences:**
- ✅ MVP simple et rapide à implémenter
- ✅ Migration progressive possible
- ✅ Scalabilité future garantie
- ⚠️ Abstraction supplémentaire (justifiée par flexibilité)

**Implementation:**
- Interface `IEventStore` avec méthodes : `append()`, `getEvents()`, `getRunIds()`
- Implémentations concrètes : `FileEventStore`, `SQLEventStore` (futur)
- Factory pattern pour création selon configuration

---

### ADR-005: Replay Sans LLM (Déterministe)

**Status:** Accepted

**Context:**
Le replay est la killer feature du MVP. Pour être rapide, économique et déterministe, le replay ne doit pas recontacter le LLM.

**Decision:**
Le replay utilise uniquement les événements persistés. Les intentions originales générées par le LLM sont réutilisées telles quelles. Le replay reproduit la même séquence logique sans appel LLM.

**Consequences:**
- ✅ Replay rapide (< 100ms vs plusieurs secondes)
- ✅ Replay économique (pas de coût LLM)
- ✅ Replay déterministe (même séquence)
- ⚠️ Replay ne teste pas les changements de prompt (acceptable, c'est un feature, pas un bug)

**Implementation:**
- Replay Engine charge les événements du runId
- Filtre les événements d'intention LLM
- Réutilise les intentions pour exécution via Action Engine
- Génère nouveaux événements avec préfixe "replay:"

---

### ADR-006: API Facade Masquant Complexité

**Status:** Accepted

**Context:**
L'architecture interne est sophistiquée (event-sourcing, CQRS, séparation engines), mais l'API doit rester simple et intuitive (< 10 lignes pour Quick Start).

**Decision:**
Implémenter une couche Facade (SDK API Layer) qui masque la complexité interne. L'API expose des concepts simples (agent, tool, run) tandis que l'implémentation gère les événements, policies, et engines en arrière-plan.

**Consequences:**
- ✅ API simple et intuitive
- ✅ Courbe d'apprentissage réduite
- ✅ Complexité interne isolée
- ⚠️ Couche d'abstraction supplémentaire (justifiée par DX)

**Implementation:**
- SDK API Layer : `createSDK()`, `createAgent()`, `defineTool()`, `agent.run()`
- Mapping automatique API → événements internes
- Configuration par défaut intelligente

---

## Component Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SDK API Layer (Facade)                    │
│  createSDK() | createAgent() | defineTool() | agent.run()  │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│   Reasoning  │ │   Action    │ │  Policy    │
│   Engine     │ │   Engine    │ │  Engine    │
└───────┬──────┘ └──────┬──────┘ └─────┬──────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│ Tool Registry│ │ Event Store │ │ Trace/     │
│              │ │             │ │ Replay     │
│              │ │             │ │ Engine     │
└──────────────┘ └─────────────┘ └────────────┘
```

### Component Responsibilities

#### 1. SDK API Layer (Facade)

**Responsabilités:**
- Interface publique simple et intuitive
- Mapping API → événements internes
- Configuration par défaut intelligente
- Gestion du cycle de vie SDK et agents

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
  addTools(tools: Tool[]): void
  setPolicy(policy: Policy): void
}
```

**Dépendances:**
- Reasoning Engine
- Action Engine
- Policy Engine
- Event Store
- Tool Registry

---

#### 2. Reasoning Engine

**Responsabilités:**
- Intégration avec provider LLM (OpenAI/Anthropic)
- Génération d'intentions structurées depuis réponses LLM
- Gestion du contexte conversationnel
- Émission d'événements de raisonnement

**Interfaces:**
```typescript
interface ReasoningEngine {
  generateIntention(context: ReasoningContext): Promise<Intention>
  getReasoningEvents(runId: string): Event[]
}

interface Intention {
  type: 'tool_call' | 'final_answer' | 'continue'
  toolName?: string
  parameters?: Record<string, unknown>
  reasoning?: string
}
```

**Dépendances:**
- LLM Provider (Strategy Pattern)
- Event Store (émission événements)
- Tool Registry (connaître tools disponibles pour contexte)

**Contraintes:**
- Ne peut jamais exécuter directement un tool
- Ne peut jamais provoquer d'effet de bord
- Génère uniquement des intentions structurées

---

#### 3. Action Engine

**Responsabilités:**
- Réception et validation des intentions
- Exécution des tools via Tool Registry
- Application des policies via Policy Engine
- Émission d'événements d'action

**Interfaces:**
```typescript
interface ActionEngine {
  executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult>
  validateIntention(intention: Intention): ValidationResult
}

interface ActionResult {
  success: boolean
  result?: unknown
  error?: Error
  events: Event[]
}
```

**Dépendances:**
- Policy Engine (validation)
- Tool Registry (exécution)
- Event Store (émission événements)

**Contraintes:**
- Toute action doit passer par Action Engine
- Validation obligatoire avant exécution
- Émission d'événement pour chaque action

---

#### 4. Policy Engine

**Responsabilités:**
- Validation des intentions contre policies actives
- Application des policies globales et spécifiques
- Vérification budgets, timeouts, allowlists
- Émission d'événements de validation

**Interfaces:**
```typescript
interface PolicyEngine {
  validate(intention: Intention, context: PolicyContext): PolicyValidationResult
  getActivePolicies(agentId: string): Policy[]
  applyGlobalPolicies(policies: Policy[]): void
}

interface Policy {
  id: string
  type: 'budget' | 'timeout' | 'allowlist' | 'custom'
  rules: PolicyRule[]
  scope: 'global' | 'agent'
}

interface PolicyValidationResult {
  allowed: boolean
  reason?: string
  violatedPolicies?: string[]
}
```

**Dépendances:**
- Event Store (émission événements validation)

**Contraintes:**
- Deny-by-default : tout est interdit sauf explicitement autorisé
- Vérification obligatoire avant chaque action

---

#### 5. Tool Registry

**Responsabilités:**
- Gestion des tools déclarés
- Validation des schémas d'inputs
- Exécution des tools avec validation
- Allowlist stricte (deny-by-default)

**Interfaces:**
```typescript
interface ToolRegistry {
  registerTool(tool: ToolDefinition): void
  getTool(name: string): Tool | null
  executeTool(name: string, parameters: unknown): Promise<ToolResult>
  isToolAllowed(name: string, allowlist?: string[]): boolean
}

interface ToolDefinition {
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
}
```

**Dépendances:**
- Zod (validation schémas)
- Event Store (émission événements tool)

**Contraintes:**
- Rejet automatique des tools non déclarés
- Validation obligatoire avant exécution
- Allowlist stricte

---

#### 6. Event Store

**Responsabilités:**
- Persistance des événements (append-only)
- Récupération des événements par runId
- Filtrage et requêtes sur événements
- Abstraction pour différentes implémentations

**Interfaces:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  exportEventLog(runId: string): Promise<EventLog>
}

interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: EventData
}

type EventType = 
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'intention.generated'
  | 'intention.rejected'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'tool.called'
  | 'tool.failed'
```

**Implémentations MVP:**
- `FileEventStore` : Persistance in-memory + fichier JSON
- Structure : `events/{runId}.json`

**Implémentations futures:**
- `SQLEventStore` : PostgreSQL/MySQL
- `DistributedEventStore` : Kafka-style (post-MVP)

---

#### 7. Trace/Replay Engine

**Responsabilités:**
- Construction de traces depuis événements
- Replay déterministe sans LLM
- Comparaison de runs (post-MVP)
- Export de traces

**Interfaces:**
```typescript
interface TraceEngine {
  getTrace(runId: string): Promise<Trace>
  exportTrace(runId: string, format: 'json' | 'text'): Promise<string>
}

interface ReplayEngine {
  replay(runId: string, modifications?: ReplayModifications): Promise<RunResult>
  canReplay(runId: string): boolean
}

interface Trace {
  runId: string
  agentId: string
  status: RunStatus
  events: Event[]
  timeline: TimelineEntry[]
  summary: TraceSummary
}
```

**Dépendances:**
- Event Store (lecture événements)
- Action Engine (replay exécution)

**Contraintes:**
- Replay sans appel LLM
- Déterminisme relatif (même séquence logique)

---

## Data Models & Event Schema

### Core Domain Models

#### Agent Model
```typescript
interface Agent {
  id: string
  name: string
  model: LLMModel
  tools: Tool[]
  policies: Policy[]
  config: AgentConfig
  version: string
}

interface AgentConfig {
  maxSteps?: number
  timeout?: number
  temperature?: number
  systemPrompt?: string
}
```

#### Tool Model
```typescript
interface Tool {
  id: string
  name: string
  description: string
  schema: ZodSchema
  handler: ToolHandler
  version: string
  metadata?: ToolMetadata
}

interface ToolMetadata {
  category?: string
  riskLevel?: 'low' | 'medium' | 'high'
  requiresApproval?: boolean
}
```

#### Policy Model
```typescript
interface Policy {
  id: string
  type: PolicyType
  rules: PolicyRule[]
  scope: 'global' | 'agent'
  agentId?: string
  enabled: boolean
}

type PolicyType = 
  | 'budget'      // maxTokens, maxSteps
  | 'timeout'     // maxDuration
  | 'allowlist'   // allowedTools
  | 'custom'      // custom validation function

interface PolicyRule {
  condition: string
  action: 'allow' | 'deny' | 'require_approval'
  metadata?: Record<string, unknown>
}
```

#### Run Model
```typescript
interface Run {
  id: string
  agentId: string
  status: RunStatus
  input: RunInput
  output?: RunOutput
  startedAt: number
  completedAt?: number
  events: Event[]
  version: string
}

type RunStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

interface RunInput {
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
}
```

### Event Schema

#### Event Base Structure
```typescript
interface Event {
  id: string                    // UUID unique
  runId: string                 // ID de l'exécution
  type: EventType              // Type d'événement
  timestamp: number            // Timestamp Unix (ms)
  data: EventData             // Données spécifiques au type
  metadata?: EventMetadata     // Métadonnées additionnelles
}

interface EventMetadata {
  agentId?: string
  agentVersion?: string
  userId?: string
  sessionId?: string
  [key: string]: unknown
}
```

#### Event Types & Data Structures

**Run Lifecycle Events:**
```typescript
type RunLifecycleEvent = 
  | { type: 'run.started', data: { input: RunInput } }
  | { type: 'run.completed', data: { output: RunOutput, duration: number } }
  | { type: 'run.failed', data: { error: Error, reason: string } }
  | { type: 'run.cancelled', data: { reason: string } }
```

**Reasoning Events:**
```typescript
type ReasoningEvent = 
  | { 
      type: 'intention.generated', 
      data: { 
        intention: Intention
        reasoning?: string
        alternatives?: Intention[]
      } 
    }
  | { 
      type: 'intention.rejected', 
      data: { 
        intention: Intention
        reason: string
        violatedPolicies?: string[]
      } 
    }
```

**Action Events:**
```typescript
type ActionEvent = 
  | { 
      type: 'action.executed', 
      data: { 
        toolName: string
        parameters: Record<string, unknown>
        result: unknown
        duration: number
      } 
    }
  | { 
      type: 'action.failed', 
      data: { 
        toolName: string
        parameters: Record<string, unknown>
        error: Error
      } 
    }
```

**Policy Events:**
```typescript
type PolicyEvent = 
  | { 
      type: 'policy.checked', 
      data: { 
        policyId: string
        intention: Intention
        result: PolicyValidationResult
      } 
    }
  | { 
      type: 'policy.violated', 
      data: { 
        policyId: string
        intention: Intention
        reason: string
      } 
    }
```

**Tool Events:**
```typescript
type ToolEvent = 
  | { 
      type: 'tool.called', 
      data: { 
        toolName: string
        parameters: Record<string, unknown>
        validated: boolean
      } 
    }
  | { 
      type: 'tool.failed', 
      data: { 
        toolName: string
        error: Error
        validationError?: boolean
      } 
    }
```

#### Event Log Structure
```typescript
interface EventLog {
  runId: string
  agentId: string
  version: string
  startedAt: number
  completedAt?: number
  status: RunStatus
  events: Event[]
  summary: {
    totalEvents: number
    intentionsGenerated: number
    actionsExecuted: number
    policiesChecked: number
    toolsCalled: number
  }
}
```

---

## API Design

### Public API Surface (MVP)

#### SDK Initialization
```typescript
function createSDK(config: SDKConfig): SDK

interface SDKConfig {
  apiKey: string                    // LLM provider API key
  provider?: 'openai' | 'anthropic'  // Default: 'openai'
  eventStore?: IEventStore           // Optional: custom event store
  defaultPolicies?: Policy[]         // Optional: global policies
}
```

#### Agent Creation
```typescript
function createAgent(config: AgentConfig): Agent

interface AgentConfig {
  name: string
  model: string                      // e.g., 'gpt-4', 'claude-3'
  systemPrompt?: string
  maxSteps?: number                 // Default: 10
  timeout?: number                  // Default: 30000ms
  tools?: Tool[]                    // Optional: tools to add
  policies?: Policy[]               // Optional: agent-specific policies
}
```

#### Tool Definition
```typescript
function defineTool(definition: ToolDefinition): Tool

interface ToolDefinition {
  name: string
  description: string
  schema: ZodSchema                  // Input validation schema
  handler: (params: unknown) => Promise<unknown>
  metadata?: ToolMetadata
}
```

#### Agent Execution
```typescript
interface Agent {
  run(input: RunInput): Promise<RunResult>
  addTools(tools: Tool[]): void
  setPolicy(policy: Policy): void
  stop(): Promise<void>
}

interface RunInput {
  message: string
  context?: Record<string, unknown>
}

interface RunResult {
  runId: string
  status: RunStatus
  output?: string
  error?: Error
  events?: Event[]                  // Optional: include events in result
}
```

#### Replay & Tracing
```typescript
interface SDK {
  replay(runId: string, modifications?: ReplayModifications): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  exportTrace(runId: string, format?: 'json' | 'text'): Promise<string>
}

interface ReplayModifications {
  input?: RunInput
  policies?: Policy[]
  tools?: Tool[]
}
```

#### Policies
```typescript
interface SDK {
  defineGlobalPolicy(policy: Policy): void
}

interface Policy {
  id: string
  type: PolicyType
  rules: PolicyRule[]
  enabled: boolean
}
```

### Quick Start Example
```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core'
import { z } from 'zod'

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY })

const calculatorTool = defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b
      case 'subtract': return a - b
      case 'multiply': return a * b
      case 'divide': return a / b
    }
  }
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-4',
  tools: [calculatorTool]
})

const result = await agent.run({ message: 'What is 15 * 23?' })
console.log(result.output)

const trace = await sdk.getTrace(result.runId)
console.log(trace.events)

const replay = await sdk.replay(result.runId)
console.log(replay.output)
```

---

## Security Architecture

### Security Principles

1. **Deny-by-Default** : Tout est interdit sauf explicitement autorisé
2. **Sécurité par Impossibilité** : Architecture garantit la sécurité, pas la configuration
3. **Validation Multi-Niveaux** : Tool Registry → Policy Engine → Action Engine
4. **Traçabilité Complète** : Toute action est tracée et auditable

### Security Layers

#### Layer 1: Tool Registry (Allowlist)
- Seuls les tools explicitement déclarés sont disponibles
- Rejet automatique des tools non déclarés
- Validation des schémas avant exécution

#### Layer 2: Policy Engine (Governance)
- Vérification des policies avant chaque action
- Budgets, timeouts, allowlists appliqués
- Rejet si policy violée

#### Layer 3: Action Engine (Execution)
- Dernière ligne de défense
- Validation finale avant exécution
- Isolation des erreurs

### Threat Model

**Threats Mitigated:**
- ✅ Tool injection (validation schéma)
- ✅ Unauthorized tool execution (allowlist + policies)
- ✅ Resource exhaustion (budgets + timeouts)
- ✅ Unauthorized actions (deny-by-default)
- ✅ Lack of auditability (event-sourcing)

**Threats Not Mitigated (Post-MVP):**
- ⚠️ LLM prompt injection (mitigation post-MVP)
- ⚠️ Tool handler vulnerabilities (responsabilité développeur)
- ⚠️ Event store tampering (mitigation: signatures post-MVP)

---

## Performance & Scalability

### Performance Targets (MVP)

- **Overhead SDK** : < 5-10ms par événement (hors LLM/tools)
- **Replay Latency** : < 100ms pour exécution complète
- **Event Persistence** : Asynchrone, non-bloquant
- **Tool Execution** : Pas d'overhead SDK significatif

### Scalability Strategy

#### MVP: File-Based Event Store
- **Limite** : ~1000 runs simultanés
- **Stockage** : Fichiers JSON par runId
- **Performance** : Acceptable pour MVP

#### Phase 2: SQL-Based Event Store
- **Limite** : ~10,000 runs simultanés
- **Stockage** : PostgreSQL/MySQL
- **Migration** : Export/import depuis file-based

#### Phase 3: Distributed Event Store
- **Limite** : Illimitée (scalabilité horizontale)
- **Stockage** : Kafka-style (Kafka, EventStore, etc.)
- **Migration** : Depuis SQL avec réplication

### Optimization Strategies

1. **Event Persistence Async** : Écriture non-bloquante
2. **Event Batching** : Groupement événements pour écriture
3. **Lazy Loading** : Chargement événements à la demande
4. **Caching** : Cache in-memory pour événements fréquents
5. **Compression** : Compression événements anciens (post-MVP)

---

## Implementation Roadmap

### Phase 1: MVP Core (Weeks 1-4)
1. Event Store interface + FileEventStore
2. Event schema & types
3. Tool Registry avec validation Zod
4. Policy Engine basique
5. Reasoning Engine (OpenAI integration)
6. Action Engine
7. SDK API Layer (Facade)
8. Replay Engine basique

### Phase 2: MVP Polish (Weeks 5-6)
1. Tracing & observability
2. Error handling & validation
3. Documentation & examples
4. Tests unitaires & intégration
5. Performance optimization

### Phase 3: MVP Validation (Weeks 7-8)
1. Quick Start guide
2. Example complet fonctionnel
3. Feedback early adopters
4. Bug fixes & improvements

---

## Sequence Diagrams & Flow Design

### Flow 1: Agent Execution (Normal Flow)

```
User          SDK API      Reasoning    Action      Policy      Tool      Event
              Layer        Engine       Engine      Engine      Registry  Store
  |              |             |            |           |          |         |
  |--run()------>|             |            |           |          |         |
  |              |--start()--->|           |           |          |         |
  |              |             |           |           |          |         |
  |              |             |--emit---->|           |          |--append->
  |              |             |           |           |          |         |
  |              |             |--LLM()--->|           |          |         |
  |              |             |<--intent--|           |          |         |
  |              |             |--emit---->|           |          |--append->
  |              |             |           |           |          |         |
  |              |             |           |--validate>|          |         |
  |              |             |           |<--allowed-|          |         |
  |              |             |           |--emit---->|          |--append->
  |              |             |           |           |          |         |
  |              |             |           |--execute->|          |         |
  |              |             |           |           |          |--call()>
  |              |             |           |<--result--|          |         |
  |              |             |           |--emit---->|          |--append->
  |              |             |           |           |          |         |
  |              |             |--continue>|           |          |         |
  |              |             |... (loop) |           |          |         |
  |              |             |           |           |          |         |
  |              |             |--final()--|           |          |         |
  |              |             |--emit---->|           |          |--append->
  |              |<--complete--|           |           |          |         |
  |<--result-----|             |           |           |          |         |
```

### Flow 2: Policy Violation Flow

```
User          SDK API      Reasoning    Action      Policy      Event
              Layer        Engine       Engine      Engine      Store
  |              |             |            |           |         |
  |--run()------>|             |           |           |         |
  |              |--start()--->|           |           |         |
  |              |             |--LLM()--->|           |         |
  |              |             |<--intent-|           |         |
  |              |             |--emit---->|          |--append->
  |              |             |           |           |         |
  |              |             |           |--validate>|         |
  |              |             |           |           |--check()>
  |              |             |           |<--DENIED--|         |
  |              |             |           |--emit---->|--append->
  |              |             |           |           |         |
  |              |             |--retry()--|           |         |
  |              |             |... (loop) |           |         |
  |              |             |           |           |         |
  |              |<--failed----|           |           |         |
  |<--error------|             |           |           |         |
```

### Flow 3: Replay Flow

```
User          SDK API      Replay       Action      Event      Tool
              Layer        Engine       Engine      Store      Registry
  |              |             |            |          |          |
  |--replay()--->|             |           |          |          |
  |              |--load()--->|           |          |          |
  |              |             |--getEvents>|          |          |
  |              |             |<--events--|          |          |
  |              |             |           |          |          |
  |              |             |--filter()>|          |          |
  |              |             |           |          |          |
  |              |             |--replay()>|          |          |
  |              |             |           |          |          |
  |              |             |           |--execute>|          |
  |              |             |           |          |--call()>
  |              |             |           |<--result-|          |
  |              |             |           |--emit()>|          |
  |              |             |           |          |          |
  |              |             |... (loop) |          |          |
  |              |             |           |          |          |
  |              |<--complete--|           |          |          |
  |<--result-----|             |           |          |          |
```

---

## Error Handling Strategy

### Error Classification

#### 1. Validation Errors (400-level)
**Sources:** Tool Registry, Policy Engine, Input Validation
**Handling:**
- Erreur immédiate, pas d'exécution
- Événement `validation.failed` émis
- Message d'erreur clair et actionnable

```typescript
class ValidationError extends SDKError {
  constructor(
    public field: string,
    public reason: string,
    public schema?: ZodSchema
  ) {
    super(`Validation failed: ${field} - ${reason}`, 'VALIDATION_ERROR')
  }
}
```

#### 2. Policy Violation Errors (403-level)
**Sources:** Policy Engine
**Handling:**
- Action bloquée, intention rejetée
- Événement `policy.violated` émis
- Retry possible avec nouvelle intention

```typescript
class PolicyViolationError extends SDKError {
  constructor(
    public policyId: string,
    public intention: Intention,
    public reason: string
  ) {
    super(`Policy violation: ${policyId} - ${reason}`, 'POLICY_VIOLATION')
  }
}
```

#### 3. Tool Execution Errors (500-level)
**Sources:** Tool handlers
**Handling:**
- Erreur capturée, événement `tool.failed` émis
- Run peut continuer ou échouer selon configuration
- Retry possible selon type d'erreur

```typescript
class ToolExecutionError extends SDKError {
  constructor(
    public toolName: string,
    public originalError: Error,
    public parameters: unknown
  ) {
    super(`Tool execution failed: ${toolName}`, 'TOOL_ERROR', originalError)
  }
}
```

#### 4. LLM Provider Errors (500-level)
**Sources:** Reasoning Engine, LLM Provider
**Handling:**
- Retry avec backoff exponentiel
- Événement `llm.error` émis
- Run échoue si retries épuisés

```typescript
class LLMProviderError extends SDKError {
  constructor(
    public provider: string,
    public originalError: Error,
    public retryable: boolean = true
  ) {
    super(`LLM provider error: ${provider}`, 'LLM_ERROR', originalError)
  }
}
```

#### 5. Event Store Errors (500-level)
**Sources:** Event Store persistence
**Handling:**
- Retry avec backoff
- Run peut continuer si événements en mémoire
- Échec critique si persistance impossible

```typescript
class EventStoreError extends SDKError {
  constructor(
    public operation: string,
    public originalError: Error
  ) {
    super(`Event store error: ${operation}`, 'EVENT_STORE_ERROR', originalError)
  }
}
```

### Error Recovery Strategies

#### Strategy 1: Fail-Fast (Validation Errors)
- Erreur immédiate, pas d'exécution
- Utilisé pour: Validation inputs, configuration invalide

#### Strategy 2: Retry with Backoff (Transient Errors)
- Retry automatique avec backoff exponentiel
- Utilisé pour: LLM provider errors, network errors
- Max retries: 3 par défaut

#### Strategy 3: Continue on Error (Tool Errors)
- Run continue malgré erreur tool
- Événement d'erreur émis
- Utilisé pour: Tool execution errors non-critiques

#### Strategy 4: Fail Run (Critical Errors)
- Run échoue immédiatement
- Tous les événements jusqu'à l'erreur sont persistés
- Utilisé pour: Policy violations critiques, event store failures

### Error Event Schema

```typescript
interface ErrorEvent extends Event {
  type: 'error.occurred'
  data: {
    errorType: string
    errorMessage: string
    errorStack?: string
    context: {
      component: string
      operation: string
      [key: string]: unknown
    }
    recoverable: boolean
    retryCount?: number
  }
}
```

---

## Testing Strategy

### Testing Pyramid

#### Level 1: Unit Tests (70%)
**Scope:** Composants individuels isolés
**Coverage Target:** > 80%

**Components to Test:**
- Tool Registry (validation, allowlist)
- Policy Engine (validation, enforcement)
- Event Store (persistence, retrieval)
- Replay Engine (replay logic)
- SDK API Layer (mapping, validation)

**Example:**
```typescript
describe('ToolRegistry', () => {
  it('should reject undeclared tools', () => {
    const registry = new ToolRegistry()
    expect(() => registry.executeTool('unknown')).toThrow()
  })
  
  it('should validate tool parameters', () => {
    const tool = defineTool({...})
    registry.registerTool(tool)
    expect(() => 
      registry.executeTool('tool', { invalid: 'params' })
    ).toThrow(ValidationError)
  })
})
```

#### Level 2: Integration Tests (20%)
**Scope:** Interactions entre composants
**Coverage Target:** > 60%

**Flows to Test:**
- Reasoning → Action flow complet
- Policy enforcement end-to-end
- Event emission et persistence
- Replay flow complet

**Example:**
```typescript
describe('Agent Execution Flow', () => {
  it('should execute agent with policy enforcement', async () => {
    const sdk = createSDK({...})
    const agent = sdk.createAgent({...})
    agent.setPolicy({ type: 'allowlist', rules: [...] })
    
    const result = await agent.run({ message: '...' })
    
    expect(result.status).toBe('completed')
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'policy.checked' })
    )
  })
})
```

#### Level 3: End-to-End Tests (10%)
**Scope:** Scénarios utilisateur complets
**Coverage Target:** Scénarios critiques

**Scenarios:**
- Quick Start flow complet
- Replay d'un run complet
- Policy violation handling
- Error recovery

**Example:**
```typescript
describe('E2E: Quick Start', () => {
  it('should create agent, run, and replay', async () => {
    const sdk = createSDK({ apiKey: 'test' })
    const tool = defineTool({...})
    const agent = sdk.createAgent({ tools: [tool] })
    
    const run = await agent.run({ message: 'test' })
    expect(run.status).toBe('completed')
    
    const replay = await sdk.replay(run.runId)
    expect(replay.status).toBe('completed')
    expect(replay.output).toBe(run.output)
  })
})
```

### Test Utilities

#### Mock LLM Provider
```typescript
class MockLLMProvider implements LLMProvider {
  responses: Intention[] = []
  
  async generateIntention(context: ReasoningContext): Promise<Intention> {
    return this.responses.shift() || { type: 'final_answer', ... }
  }
  
  setResponse(intention: Intention): void {
    this.responses.push(intention)
  }
}
```

#### Mock Event Store
```typescript
class MockEventStore implements IEventStore {
  events: Map<string, Event[]> = new Map()
  
  async append(runId: string, event: Event): Promise<void> {
    if (!this.events.has(runId)) {
      this.events.set(runId, [])
    }
    this.events.get(runId)!.push(event)
  }
  
  async getEvents(runId: string): Promise<Event[]> {
    return this.events.get(runId) || []
  }
}
```

#### Golden Traces (Post-MVP)
```typescript
describe('Agent Behavior Regression', () => {
  it('should match golden trace', async () => {
    const result = await agent.run({ message: 'test' })
    const trace = await sdk.getTrace(result.runId)
    
    expect(trace).toMatchGoldenTrace('agent-test-v1.json')
  })
})
```

### Test Coverage Goals

- **Unit Tests:** > 80% coverage
- **Integration Tests:** Tous les flows critiques
- **E2E Tests:** Scénarios MVP complets
- **Performance Tests:** Latence, throughput (post-MVP)

---

## Operational Considerations

### Logging Strategy

#### Log Levels
- **DEBUG:** Événements détaillés, développement
- **INFO:** Exécutions normales, événements importants
- **WARN:** Policy violations, retries
- **ERROR:** Erreurs critiques, échecs

#### Log Structure
```typescript
interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error'
  timestamp: number
  runId?: string
  agentId?: string
  component: string
  message: string
  data?: Record<string, unknown>
  error?: Error
}
```

#### Logging Implementation
- Console logging pour développement
- Structured logging (JSON) pour production
- Log rotation pour fichiers
- Integration avec systèmes externes (post-MVP)

### Monitoring & Observability

#### Metrics à Tracker (MVP)
- Nombre de runs par agent
- Taux de succès/échec
- Latence moyenne par run
- Nombre d'événements par run
- Taux de policy violations
- Erreurs par type

#### Metrics à Tracker (Post-MVP)
- Coûts LLM par run
- Throughput (runs/seconde)
- Taille moyenne événements
- Taux d'utilisation replay
- Performance event store

#### Health Checks
```typescript
interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy'
  components: {
    eventStore: ComponentHealth
    llmProvider: ComponentHealth
    toolRegistry: ComponentHealth
  }
  metrics: SystemMetrics
}

interface ComponentHealth {
  status: 'up' | 'down'
  latency?: number
  errorRate?: number
}
```

### Deployment Considerations

#### MVP Deployment
- Package npm standard
- Installation via `npm install`
- Pas de dépendances externes (sauf LLM provider)
- Event store file-based (local)

#### Production Deployment (Post-MVP)
- Event store SQL (optionnel)
- Configuration via variables d'environnement
- Health checks endpoint
- Metrics export (Prometheus format)

### Backup & Recovery

#### Event Store Backup (MVP)
- Fichiers événements sauvegardés manuellement
- Export JSON pour archivage
- Pas de backup automatique (MVP)

#### Event Store Backup (Post-MVP)
- Backup automatique SQL
- Réplication event store distribué
- Point-in-time recovery
- Archivage événements anciens

### Security Operations

#### Secrets Management
- API keys LLM: Variables d'environnement
- Pas de secrets dans code
- Rotation des clés supportée

#### Audit Trail
- Tous les événements sont auditables
- Export event log pour conformité
- Signatures cryptographiques (post-MVP)

---

## Code Patterns & Best Practices

### Pattern 1: Event Emission Pattern

**Tous les composants doivent émettre des événements pour leurs actions:**

```typescript
class ActionEngine {
  constructor(private eventStore: IEventStore) {}
  
  async executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult> {
    // Émettre événement avant action
    await this.eventStore.append(context.runId, {
      id: generateId(),
      runId: context.runId,
      type: 'action.executing',
      timestamp: Date.now(),
      data: { intention }
    })
    
    try {
      const result = await this.executeTool(intention)
      
      // Émettre événement succès
      await this.eventStore.append(context.runId, {
        id: generateId(),
        runId: context.runId,
        type: 'action.executed',
        timestamp: Date.now(),
        data: { intention, result }
      })
      
      return { success: true, result }
    } catch (error) {
      // Émettre événement échec
      await this.eventStore.append(context.runId, {
        id: generateId(),
        runId: context.runId,
        type: 'action.failed',
        timestamp: Date.now(),
        data: { intention, error: error.message }
      })
      
      throw error
    }
  }
}
```

### Pattern 2: Policy Enforcement Pattern

**Toute action doit passer par Policy Engine:**

```typescript
class ActionEngine {
  constructor(
    private policyEngine: PolicyEngine,
    private toolRegistry: ToolRegistry
  ) {}
  
  async executeIntention(intention: Intention, context: ActionContext): Promise<ActionResult> {
    // Validation obligatoire
    const validation = await this.policyEngine.validate(intention, context)
    
    if (!validation.allowed) {
      throw new PolicyViolationError(
        validation.violatedPolicies![0],
        intention,
        validation.reason!
      )
    }
    
    // Exécution seulement si autorisée
    return await this.toolRegistry.executeTool(intention.toolName!, intention.parameters)
  }
}
```

### Pattern 3: Deny-by-Default Pattern

**Tool Registry rejette automatiquement les tools non déclarés:**

```typescript
class ToolRegistry {
  private tools: Map<string, Tool> = new Map()
  
  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }
  
  async executeTool(name: string, parameters: unknown): Promise<unknown> {
    // Deny-by-default: rejet si tool non déclaré
    const tool = this.tools.get(name)
    if (!tool) {
      throw new ToolNotFoundError(`Tool "${name}" is not declared`)
    }
    
    // Validation schéma
    const validated = tool.schema.parse(parameters)
    
    // Exécution
    return await tool.handler(validated)
  }
}
```

### Pattern 4: Async Event Persistence

**Persistance asynchrone pour ne pas bloquer l'exécution:**

```typescript
class FileEventStore implements IEventStore {
  private pendingEvents: Event[] = []
  private flushInterval: NodeJS.Timeout
  
  constructor() {
    // Flush périodique (toutes les 100ms ou 10 événements)
    this.flushInterval = setInterval(() => this.flush(), 100)
  }
  
  async append(runId: string, event: Event): Promise<void> {
    // Ajout immédiat en mémoire
    this.pendingEvents.push(event)
    
    // Flush si seuil atteint
    if (this.pendingEvents.length >= 10) {
      await this.flush()
    }
  }
  
  private async flush(): Promise<void> {
    if (this.pendingEvents.length === 0) return
    
    const events = [...this.pendingEvents]
    this.pendingEvents = []
    
    // Écriture asynchrone (non-bloquant)
    await Promise.all(
      events.map(event => this.writeToFile(event))
    )
  }
}
```

### Pattern 5: Replay Deterministic Pattern

**Replay utilise uniquement les événements, pas le LLM:**

```typescript
class ReplayEngine {
  async replay(runId: string): Promise<RunResult> {
    // Charger événements originaux
    const originalEvents = await this.eventStore.getEvents(runId)
    
    // Filtrer intentions LLM
    const intentions = originalEvents.filter(
      e => e.type === 'intention.generated'
    )
    
    // Rejouer avec intentions originales (pas de LLM)
    const newRunId = generateRunId()
    for (const intentionEvent of intentions) {
      const intention = intentionEvent.data.intention
      
      // Exécuter via Action Engine (sans Reasoning Engine)
      await this.actionEngine.executeIntention(intention, {
        runId: newRunId,
        mode: 'replay'
      })
    }
    
    return { runId: newRunId, status: 'completed' }
  }
}
```

### Best Practices

1. **Toujours émettre un événement avant/après action critique**
2. **Validation multi-niveaux: Tool Registry → Policy Engine → Action Engine**
3. **Erreurs explicites avec contexte pour debugging**
4. **Async/await pour opérations I/O (event store, LLM)**
5. **Type-safety strict avec TypeScript**
6. **Configuration par défaut intelligente**
7. **Isolation des erreurs (un tool qui échoue ne fait pas échouer le run)**

---

## Migration & Compatibility

### Versioning Strategy

#### Semantic Versioning
- **MAJOR:** Breaking changes API publique
- **MINOR:** Nouvelles features compatibles
- **PATCH:** Bug fixes, améliorations

#### API Stability Promise
- **MVP → v1.0:** API peut changer (pré-release)
- **v1.0+:** API stable, breaking changes seulement en MAJOR
- **Deprecation:** Features dépréciées avec warning 2 versions avant suppression

### Migration Paths

#### File Event Store → SQL Event Store
```typescript
async function migrateToSQL(fileStore: FileEventStore, sqlStore: SQLEventStore): Promise<void> {
  const runIds = await fileStore.getRunIds()
  
  for (const runId of runIds) {
    const events = await fileStore.getEvents(runId)
    for (const event of events) {
      await sqlStore.append(runId, event)
    }
  }
}
```

#### Policy Format Migration
- Support multiple formats de policies
- Conversion automatique lors chargement
- Validation format avant application

### Backward Compatibility

#### Event Schema Evolution
- Nouveaux champs optionnels uniquement
- Anciens événements restent valides
- Migration automatique lors lecture si nécessaire

#### API Compatibility
- Anciennes méthodes API supportées avec deprecation warnings
- Migration guides fournis
- Tools de migration automatique (post-MVP)

---

## Open Questions & Future Considerations

### Questions Ouvertes (À Résoudre Pendant Implémentation)

1. **Event Store File Format** : JSON vs Binary? Compression?
2. **Error Recovery** : Comment gérer crashes pendant exécution?
3. **Concurrent Runs** : Gestion de plusieurs runs simultanés?
4. **Event Size Limits** : Limite taille événements individuels?

### Future Enhancements (Post-MVP)

1. **Observabilité Cognitive** : Graphe raisonnement, alternatives envisagées
2. **Multi-Agent Orchestration** : Coordination entre agents
3. **Approval Humaine** : Workflow d'approbation pour actions critiques
4. **Event Signing** : Signatures cryptographiques pour audit
5. **Distributed Tracing** : Intégration avec systèmes observabilité externes

---

---

## Architecture Summary

### Key Architectural Principles

1. **Event-Sourcing First** : L'event log est la source de vérité unique
2. **Security by Design** : Deny-by-default structurel, pas optionnel
3. **Separation of Concerns** : Reasoning Engine ≠ Action Engine
4. **Simplicity Through Abstraction** : API simple masquant complexité interne
5. **Deterministic Replay** : Replay sans LLM pour debugging et audit

### Component Interaction Summary

```
SDK API Layer (Facade)
    ↓
┌─────────────────────────────────────┐
│  Reasoning Engine → Intention        │
│  Policy Engine → Validation         │
│  Action Engine → Execution          │
│  Tool Registry → Tool Execution     │
└─────────────────────────────────────┘
    ↓
Event Store (Source of Truth)
    ↓
Trace/Replay Engine
```

### MVP Deliverables

**Core Components:**
- ✅ Event Store (File-based)
- ✅ Reasoning Engine (OpenAI)
- ✅ Action Engine
- ✅ Policy Engine
- ✅ Tool Registry
- ✅ SDK API Layer
- ✅ Replay Engine

**Key Features:**
- ✅ Agent execution avec event-sourcing
- ✅ Tool calling contrôlé (deny-by-default)
- ✅ Policies simples mais actives
- ✅ Tracing structuré
- ✅ Replay déterministe sans LLM
- ✅ Quick Start < 30 minutes

### Success Criteria

**Technical:**
- Replay fonctionnel : 100% des runs rejouables
- Overhead SDK : < 10ms par événement
- Policies actives : > 60% projets avec policies

**User Experience:**
- Time-to-first-agent : < 30 minutes
- Tracing compréhensible : > 80% utilisateurs comprennent traces
- API intuitive : < 10 lignes pour Quick Start

### Next Steps

1. **Implementation Phase 1** : Event Store + Core Components
2. **Implementation Phase 2** : SDK API Layer + Integration
3. **Implementation Phase 3** : Replay Engine + Testing
4. **Validation Phase** : Early adopters feedback
5. **Iteration** : Refinement basé sur feedback

---

**Document Status:** Complete - Architecture fully documented, ready for implementation.

**Last Updated:** 2026-01-06
**Version:** 1.0

