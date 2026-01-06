---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - _bmad-output/planning-artifacts/prd.md
workflowStatus: complete
validationDate: 2026-01-06
totalEpics: 11
totalStoriesMVP: 65
totalFRs: 78
totalFRsMVP: 40
---

# SDK_AI_Agents - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for SDK_AI_Agents, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

**FR1:** Un développeur peut créer un agent avec une configuration minimale
**FR2:** Un développeur peut initialiser un SDK avec des paramètres de base
**FR3:** Un développeur peut démarrer l'exécution d'un agent avec un input initial
**FR4:** Un développeur peut arrêter une exécution en cours
**FR5:** Un développeur peut arrêter une exécution à partir de son runId
**FR6:** Un développeur peut configurer un agent avec des capabilities spécifiques
**FR7:** Un développeur peut définir des contraintes d'exécution (max steps, timeout)
**FR8:** Un développeur peut définir un tool avec un schéma de validation
**FR9:** Un développeur peut déclarer explicitement les tools disponibles pour un agent
**FR10:** Un développeur peut valider les inputs d'un tool avant exécution
**FR11:** Un développeur peut restreindre les tools autorisés via allowlist
**FR12:** Un développeur peut organiser les tools en capabilities logiques
**FR13:** Un développeur peut réutiliser des tools entre plusieurs agents
**FR14:** Un développeur peut versionner des tools indépendamment
**FR15:** Le système empêche l'exécution d'un tool non déclaré (deny by default)
**FR16:** Un développeur peut définir une policy globale qui s'applique à tous les agents
**FR17:** Un développeur peut définir une policy spécifique à un agent
**FR18:** Un développeur peut définir un budget maximum (tokens ou steps) pour un agent
**FR19:** Un développeur peut définir un timeout pour une exécution
**FR20:** Un développeur peut définir une allowlist de tools autorisés
**FR21:** Le système applique automatiquement les policies avant chaque action
**FR22:** Le système bloque une action si elle viole une policy
**FR23:** Un développeur peut consulter les policies appliquées à une exécution
**FR24:** Le système trace chaque vérification de policy dans les événements
**FR25:** Le système sépare le raisonnement (LLM) de l'action (tool execution)
**FR26:** Le LLM génère des intentions structurées, jamais d'actions directes
**FR27:** Toutes les actions passent par un Action Engine gouverné
**FR28:** Le système valide chaque intention avant exécution
**FR29:** Le système peut rejeter une intention si elle viole une policy
**FR30:** Le système trace chaque intention générée par le LLM
**FR31:** Le système trace chaque action exécutée par l'Action Engine
**FR32:** Un développeur peut comprendre pourquoi une action a été acceptée ou rejetée
**FR33:** Le système garantit qu'aucun effet de bord ne provient directement du LLM
**FR34:** Un développeur peut inspecter la séquence raisonnement → validation → action
**FR35:** Le système génère un événement structuré pour chaque étape d'exécution
**FR36:** Chaque exécution a un runId unique et traçable
**FR37:** Un développeur peut récupérer la trace complète d'une exécution via son runId
**FR38:** Un développeur peut exporter les traces dans un format structuré (JSON)
**FR39:** Un développeur peut consulter les traces via console ou fichier
**FR40:** Le système trace chaque décision prise par l'agent
**FR41:** Un développeur peut comprendre pourquoi l'agent a pris une décision spécifique *(MVP)*
**FR42:** Un développeur peut voir les contraintes qui ont pesé sur une décision *(MVP)*
**FR43:** Un développeur peut voir les alternatives envisagées par l'agent *(Post-MVP)*
**FR44:** Un développeur peut visualiser le graphe de raisonnement de l'agent *(Post-MVP)*
**FR45:** Un développeur peut analyser les patterns de décision sur plusieurs runs *(Post-MVP)*
**FR46:** Un développeur peut rejouer une exécution complète à partir de son runId
**FR47:** Le replay fonctionne sans recontacter le LLM (mode replay)
**FR48:** Le replay reproduit la même séquence d'actions et tool calls
**FR49:** Un développeur peut comparer deux exécutions pour identifier les différences *(Post-MVP)*
**FR50:** Un développeur peut rejouer une exécution avec des modifications de contexte
**FR51:** Un développeur peut tester des scénarios "et si" en rejouant avec des paramètres différents
**FR52:** Le système garantit la reproductibilité relative des replays
**FR53:** Un développeur peut utiliser le replay pour déboguer un incident
**FR54:** Un développeur peut analyser l'impact d'un changement avant/après déploiement *(Post-MVP)*
**FR55:** Le système persiste tous les événements d'une exécution
**FR56:** L'event log est la source de vérité unique pour une exécution
**FR57:** Un développeur peut reconstruire l'état complet d'une exécution à partir des événements
**FR58:** Le système persiste les événements au minimum en mémoire et fichier
**FR59:** Un développeur peut exporter l'event log complet d'une exécution
**FR60:** Le système garantit qu'aucun événement n'est perdu pendant une exécution
**FR61:** Un développeur peut interroger les événements par runId
**FR62:** Le système peut filtrer les événements par type ou critère
**FR63:** Un développeur peut filtrer les événements par critères avancés *(Post-MVP)*
**FR64:** Un développeur peut créer des tests basés sur des traces (golden traces)
**FR65:** Un développeur peut valider qu'un agent se comporte de manière attendue via replay
**FR66:** Un développeur peut détecter des régressions en comparant des traces
**FR67:** Un développeur peut exécuter des tests de non-régression sur des agents
**FR68:** Le système supporte l'intégration de tests dans un pipeline CI/CD
**FR69:** Un développeur peut définir des assertions sur le comportement d'un agent
**FR70:** Un développeur peut créer son premier agent fonctionnel en moins de 30 minutes
**FR71:** Un développeur peut utiliser le SDK avec une API minimale (< 10 lignes pour Quick Start)
**FR72:** L'API est entièrement typée avec TypeScript (type-safety complet)
**FR73:** Un développeur peut comprendre les concepts clés via la documentation
**FR74:** Le SDK fournit au moins un exemple complet fonctionnel
**FR75:** Un développeur peut installer le SDK via npm avec une seule commande
**FR76:** Le système peut exposer l'état courant d'une exécution (pending, running, completed, failed, cancelled)
**FR77:** Un développeur peut interroger l'état d'un run à partir de son runId
**FR78:** Un développeur peut associer une version (ou hash de configuration) à un agent ou à une exécution

**Total FRs: 78**

### NonFunctional Requirements

**NFR1:** Overhead SDK (hors LLM/tools) < 5–10 ms
**NFR2:** Replay sans appel LLM
**NFR3:** Aucun tool exécuté sans event correspondant
**NFR4:** Aucune action non traçable
**NFR5:** Aucun run "orphelin" (sans trace complète)
**NFR6:** Replay = même séquence logique
**NFR7:** Même tool calls dans le même ordre
**NFR8:** Event log = source de vérité (pas de logique "cachée")
**NFR9:** Tout est traçable et rejouable
**NFR10:** Sécurité "deny by default" - tout doit être explicitement autorisé
**NFR11:** Sécurité par impossibilité, pas par configuration
**NFR12:** API stable et minimaliste
**NFR13:** Type-safe, documentée, prévisible
**NFR14:** Time-to-first-agent acceptable : < 30 minutes
**NFR15:** Replay fonctionnel et utilisé : 100% des runs rejouables
**NFR16:** Tracing compréhensible sans effort : > 80% utilisateurs comprennent traces
**NFR17:** Policies réellement actives : > 60% projets avec policies
**NFR18:** TypeScript 5.x avec mode strict
**NFR19:** Node.js 20+ (LTS)
**NFR20:** Support ESM et CommonJS
**NFR21:** Type-safety complet pour toute l'API
**NFR22:** Package publié sur npm registry
**NFR23:** Versioning sémantique strict
**NFR24:** Support des workspaces monorepo

**Total NFRs: 24**

### Additional Requirements

**From Technical Architecture Considerations:**
- TypeScript/Node.js exclusif pour MVP (support multi-langages post-MVP)
- API claire et typée avec type-safety complet
- Documentation conceptuelle forte (mental model avant tout)
- Exemples réels et démonstratifs (3 exemples obligatoires)
- Replay comme feature centrale (killer feature du MVP)
- Event schema minimal, 1 projection simple, pas de DSL
- Event store in-memory / file (simple) pour MVP
- Pas d'optimisation prématurée
- L'event-sourcing doit être invisible côté utilisateur

**From Principles Non Négociables:**
- Principe #1 : Toute action est un événement
- Principe #2 : Aucune action sans policy
- Principe #3 : Le LLM ne provoque jamais d'effet de bord
- Principe #4 : Le replay doit être possible sans LLM
- Principe #5 : La sécurité est deny-by-default

**From MVP Strategy:**
- Problem-Solving MVP avec architecture de Platform
- Focus sur validation du paradigme avant extension
- Quick Start ultra court (< 30 minutes)
- API simple malgré le core complexe

**Starter Template Requirements:**
- Greenfield project - nouveau projet
- Quick Start template avec exemple minimal fonctionnel
- 1 exemple complet (agent + tool + replay)

### FR Coverage Map

**Agent Lifecycle Management:**
FR1: Epic 1 - Créer un agent avec configuration minimale
FR2: Epic 1 - Initialiser un SDK avec paramètres de base
FR3: Epic 2 - Démarrer l'exécution d'un agent avec input initial
FR4: Epic 2 - Arrêter une exécution en cours
FR5: Epic 2 - Arrêter une exécution à partir de son runId
FR6: Epic 2 - Configurer un agent avec des capabilities spécifiques
FR7: Epic 2 - Définir des contraintes d'exécution (max steps, timeout)

**Tool & Capability Management:**
FR8: Epic 3 - Définir un tool avec un schéma de validation
FR9: Epic 3 - Déclarer explicitement les tools disponibles pour un agent
FR10: Epic 3 - Valider les inputs d'un tool avant exécution
FR11: Epic 3 - Restreindre les tools autorisés via allowlist
FR12: Epic 3 - Organiser les tools en capabilities logiques
FR13: Epic 3 - Réutiliser des tools entre plusieurs agents
FR14: Epic 3 - Versionner des tools indépendamment
FR15: Epic 3 - Empêcher l'exécution d'un tool non déclaré (deny by default)

**Policies & Governance:**
FR16: Epic 4 - Définir une policy globale qui s'applique à tous les agents
FR17: Epic 4 - Définir une policy spécifique à un agent
FR18: Epic 4 - Définir un budget maximum (tokens ou steps) pour un agent
FR19: Epic 4 - Définir un timeout pour une exécution
FR20: Epic 4 - Définir une allowlist de tools autorisés
FR21: Epic 4 - Appliquer automatiquement les policies avant chaque action
FR22: Epic 4 - Bloquer une action si elle viole une policy
FR23: Epic 4 - Consulter les policies appliquées à une exécution
FR24: Epic 4 - Tracer chaque vérification de policy dans les événements

**Runtime - Séparation Raisonnement/Action:**
FR25: Epic 5 - Séparer le raisonnement (LLM) de l'action (tool execution)
FR26: Epic 5 - LLM génère des intentions structurées, jamais d'actions directes
FR27: Epic 5 - Toutes les actions passent par un Action Engine gouverné
FR28: Epic 5 - Valider chaque intention avant exécution
FR29: Epic 5 - Rejeter une intention si elle viole une policy
FR30: Epic 5 - Tracer chaque intention générée par le LLM
FR31: Epic 5 - Tracer chaque action exécutée par l'Action Engine
FR32: Epic 5 - Comprendre pourquoi une action a été acceptée ou rejetée
FR33: Epic 5 - Garantir qu'aucun effet de bord ne provient directement du LLM
FR34: Epic 5 - Inspecter la séquence raisonnement → validation → action

**Tracing & Observabilité:**
FR35: Epic 7 - Générer un événement structuré pour chaque étape d'exécution
FR36: Epic 7 - Chaque exécution a un runId unique et traçable
FR37: Epic 7 - Récupérer la trace complète d'une exécution via son runId
FR38: Epic 7 - Exporter les traces dans un format structuré (JSON)
FR39: Epic 7 - Consulter les traces via console ou fichier
FR40: Epic 7 - Tracer chaque décision prise par l'agent
FR41: Epic 7 - Comprendre pourquoi l'agent a pris une décision spécifique (MVP)
FR42: Epic 7 - Voir les contraintes qui ont pesé sur une décision (MVP)
FR43: Epic 11 - Voir les alternatives envisagées par l'agent (Post-MVP)
FR44: Epic 11 - Visualiser le graphe de raisonnement de l'agent (Post-MVP)
FR45: Epic 11 - Analyser les patterns de décision sur plusieurs runs (Post-MVP)

**Replay & Comparaison:**
FR46: Epic 8 - Rejouer une exécution complète à partir de son runId
FR47: Epic 8 - Replay fonctionne sans recontacter le LLM (mode replay)
FR48: Epic 8 - Replay reproduit la même séquence d'actions et tool calls
FR49: Epic 11 - Comparer deux exécutions pour identifier les différences (Post-MVP)
FR50: Epic 8 - Rejouer une exécution avec des modifications de contexte
FR51: Epic 8 - Tester des scénarios "et si" en rejouant avec des paramètres différents
FR52: Epic 8 - Garantir la reproductibilité relative des replays
FR53: Epic 8 - Utiliser le replay pour déboguer un incident
FR54: Epic 11 - Analyser l'impact d'un changement avant/après déploiement (Post-MVP)

**Event Sourcing & Persistence:**
FR55: Epic 6 - Persister tous les événements d'une exécution
FR56: Epic 6 - Event log est la source de vérité unique pour une exécution
FR57: Epic 6 - Reconstruire l'état complet d'une exécution à partir des événements
FR58: Epic 6 - Persister les événements au minimum en mémoire et fichier
FR59: Epic 6 - Exporter l'event log complet d'une exécution
FR60: Epic 6 - Garantir qu'aucun événement n'est perdu pendant une exécution
FR61: Epic 6 - Interroger les événements par runId
FR62: Epic 6 - Filtrer les événements par type ou critère
FR63: Epic 11 - Filtrer les événements par critères avancés (Post-MVP)

**Testing & Quality Assurance:**
FR64: Epic 10 - Créer des tests basés sur des traces (golden traces) (Post-MVP)
FR65: Epic 10 - Valider qu'un agent se comporte de manière attendue via replay (Post-MVP)
FR66: Epic 10 - Détecter des régressions en comparant des traces (Post-MVP)
FR67: Epic 10 - Exécuter des tests de non-régression sur des agents (Post-MVP)
FR68: Epic 10 - Supporter l'intégration de tests dans un pipeline CI/CD (Post-MVP)
FR69: Epic 10 - Définir des assertions sur le comportement d'un agent (Post-MVP)

**Developer Experience & Quick Start:**
FR70: Epic 1 - Créer son premier agent fonctionnel en moins de 30 minutes
FR71: Epic 1 - Utiliser le SDK avec une API minimale (< 10 lignes pour Quick Start)
FR72: Epic 1 - API entièrement typée avec TypeScript (type-safety complet)
FR73: Epic 1 - Comprendre les concepts clés via la documentation
FR74: Epic 1 - SDK fournit au moins un exemple complet fonctionnel
FR75: Epic 1 - Installer le SDK via npm avec une seule commande

**Run Lifecycle Management:**
FR76: Epic 2 - Exposer l'état courant d'une exécution (pending, running, completed, failed, cancelled)
FR77: Epic 2 - Interroger l'état d'un run à partir de son runId

**Versioning & Audit:**
FR78: Epic 9 - Associer une version (ou hash de configuration) à un agent ou à une exécution

## Epic List

### Epic 1: Quick Start & SDK Foundation
Permettre à un développeur de créer son premier agent en moins de 30 minutes avec une API minimale et intuitive.
**FRs covered:** FR1, FR2, FR70, FR71, FR72, FR73, FR74, FR75

### Epic 2: Agent Lifecycle & Execution Management
Permettre de démarrer, gérer et contrôler l'exécution d'un agent avec suivi de l'état en temps réel.
**FRs covered:** FR3, FR4, FR5, FR6, FR7, FR76, FR77

### Epic 3: Tool & Capability Management
Permettre de définir, déclarer et contrôler les outils disponibles pour un agent avec sécurité deny-by-default.
**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15

### Epic 4: Policies & Governance
Permettre de définir et appliquer des règles de gouvernance sur les agents pour contrôler leurs actions.
**FRs covered:** FR16, FR17, FR18, FR19, FR20, FR21, FR22, FR23, FR24

### Epic 5: Runtime Architecture - Séparation Raisonnement/Action
Implémenter l'architecture de séparation raisonnement/action pour garantir la sécurité by design.
**FRs covered:** FR25, FR26, FR27, FR28, FR29, FR30, FR31, FR32, FR33, FR34

### Epic 6: Event Sourcing & Persistence
Implémenter le système d'event-sourcing comme source de vérité pour toutes les exécutions.
**FRs covered:** FR55, FR56, FR57, FR58, FR59, FR60, FR61, FR62

### Epic 7: Tracing & Observability
Permettre de voir exactement ce que l'agent a fait et pourquoi il a pris ses décisions.
**FRs covered:** FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42

### Epic 8: Replay & Debugging
Permettre de rejouer une exécution pour comprendre et déboguer les incidents.
**FRs covered:** FR46, FR47, FR48, FR50, FR51, FR52, FR53

### Epic 9: Versioning & Audit
Permettre d'associer des versions aux agents et exécutions pour la traçabilité et l'audit.
**FRs covered:** FR78

### Epic 10: Testing & Quality Assurance (Post-MVP)
Permettre de créer des tests structurés basés sur les traces pour la qualité et la non-régression.
**FRs covered:** FR64, FR65, FR66, FR67, FR68, FR69

### Epic 11: Advanced Observability & Comparison (Post-MVP)
Permettre l'observabilité cognitive avancée et la comparaison d'exécutions pour l'analyse approfondie.
**FRs covered:** FR43, FR44, FR45, FR49, FR54, FR63

## Epic 1: Quick Start & SDK Foundation

Permettre à un développeur de créer son premier agent en moins de 30 minutes avec une API minimale et intuitive.

### Story 1.1: Installation du SDK via npm

As a développeur,
I want installer le SDK via npm avec une seule commande,
So that je peux démarrer rapidement sans configuration complexe.

**Acceptance Criteria:**

**Given** un projet Node.js existant ou nouveau
**When** j'exécute `npm install @sdk-ai-agents/core`
**Then** le package est installé avec succès
**And** les types TypeScript sont disponibles
**And** le package est compatible avec Node.js 20+ LTS
**And** le package supporte ESM et CommonJS

### Story 1.2: Initialisation du SDK avec configuration minimale

As a développeur,
I want initialiser le SDK avec des paramètres de base,
So that je peux commencer à utiliser le SDK immédiatement.

**Acceptance Criteria:**

**Given** le SDK est installé
**When** j'appelle `createSDK({ apiKey: '...' })`
**Then** une instance SDK est créée
**And** l'API est entièrement typée (type-safety complet)
**And** la configuration minimale est validée
**And** les erreurs de configuration sont claires et explicites

### Story 1.3: Création d'un agent avec configuration minimale

As a développeur,
I want créer un agent avec une configuration minimale,
So that je peux avoir un agent fonctionnel rapidement.

**Acceptance Criteria:**

**Given** une instance SDK est initialisée
**When** j'appelle `sdk.createAgent({ name: '...', model: '...' })`
**Then** un agent est créé avec succès
**And** l'agent a une configuration par défaut valide
**And** l'API est intuitive et nécessite moins de 5 paramètres obligatoires
**And** les erreurs de validation sont claires

### Story 1.4: Quick Start - Premier agent fonctionnel en < 30 minutes

As a développeur,
I want créer mon premier agent fonctionnel en moins de 30 minutes,
So that je peux valider rapidement le concept et la valeur du SDK.

**Acceptance Criteria:**

**Given** je suis un développeur nouveau sur le SDK
**When** je suis le Quick Start guide
**Then** je peux créer un agent fonctionnel en moins de 30 minutes
**And** le code nécessaire fait moins de 10 lignes
**And** l'agent peut exécuter au moins une action basique
**And** je comprends les concepts fondamentaux (agent, tool, run)

### Story 1.5: Documentation des concepts clés

As a développeur,
I want comprendre les concepts clés via la documentation,
So that je peux utiliser le SDK efficacement et comprendre le paradigme.

**Acceptance Criteria:**

**Given** je suis nouveau sur le SDK
**When** je consulte la documentation
**Then** les concepts clés sont expliqués clairement (agent ≠ LLM, event-sourcing, replay)
**And** chaque concept explique le problème qu'il résout
**And** la documentation est orientée "mental model" pas "how-to magique"
**And** des exemples illustrent chaque concept

### Story 1.6: Exemple complet fonctionnel

As a développeur,
I want un exemple complet fonctionnel fourni par le SDK,
So that je peux comprendre comment utiliser toutes les fonctionnalités de base.

**Acceptance Criteria:**

**Given** le SDK est installé
**When** je consulte l'exemple fourni
**Then** l'exemple montre un agent complet avec tool + replay
**And** l'exemple est fonctionnel et exécutable
**And** l'exemple démontre les concepts fondamentaux
**And** l'exemple peut être copié et adapté facilement

## Epic 2: Agent Lifecycle & Execution Management

Permettre de démarrer, gérer et contrôler l'exécution d'un agent avec suivi de l'état en temps réel.

### Story 2.1: Démarrer l'exécution d'un agent avec input initial

As a développeur,
I want démarrer l'exécution d'un agent avec un input initial,
So that je peux faire exécuter une tâche à mon agent.

**Acceptance Criteria:**

**Given** un agent est créé et configuré
**When** j'appelle `agent.run({ input: '...' })`
**Then** l'exécution démarre avec succès
**And** un runId unique est généré et retourné
**And** l'état initial de l'exécution est "pending" puis "running"
**And** l'input est validé avant le démarrage

### Story 2.2: Exposer l'état courant d'une exécution

As a développeur,
I want connaître l'état courant d'une exécution,
So that je peux suivre la progression et gérer les erreurs.

**Acceptance Criteria:**

**Given** une exécution est en cours ou terminée
**When** j'interroge l'état de l'exécution
**Then** je reçois l'état actuel (pending, running, completed, failed, cancelled)
**And** l'état est mis à jour en temps réel pendant l'exécution
**And** les transitions d'état sont cohérentes et tracées

### Story 2.3: Interroger l'état d'un run à partir de son runId

As a développeur,
I want interroger l'état d'un run à partir de son runId,
So that je peux vérifier le statut d'une exécution spécifique.

**Acceptance Criteria:**

**Given** un runId existe
**When** j'appelle `sdk.getRunStatus(runId)`
**Then** je reçois l'état actuel du run
**And** les informations incluent l'état, le timestamp, et les métadonnées de base
**And** une erreur claire est retournée si le runId n'existe pas

### Story 2.4: Arrêter une exécution en cours

As a développeur,
I want arrêter une exécution en cours,
So that je peux interrompre un agent qui prend trop de temps ou qui déraille.

**Acceptance Criteria:**

**Given** une exécution est en cours (état "running")
**When** j'appelle `agent.stop()` ou `sdk.stopRun(runId)`
**Then** l'exécution s'arrête proprement
**And** l'état passe à "cancelled"
**And** tous les événements jusqu'à l'arrêt sont persistés
**And** aucun tool call n'est exécuté après l'arrêt

### Story 2.5: Arrêter une exécution à partir de son runId

As a développeur,
I want arrêter une exécution à partir de son runId,
So that je peux interrompre une exécution même si je n'ai plus la référence directe.

**Acceptance Criteria:**

**Given** un runId d'une exécution en cours existe
**When** j'appelle `sdk.stopRun(runId)`
**Then** l'exécution s'arrête si elle est en cours
**And** une erreur appropriée est retournée si l'exécution est déjà terminée
**And** l'état est mis à jour correctement

### Story 2.6: Configurer un agent avec des capabilities spécifiques

As a développeur,
I want configurer un agent avec des capabilities spécifiques,
So that je peux limiter et contrôler ce que l'agent peut faire.

**Acceptance Criteria:**

**Given** un agent est créé
**When** je configure l'agent avec des capabilities spécifiques
**Then** l'agent accepte uniquement les capabilities déclarées
**And** la configuration est validée avant l'exécution
**And** les erreurs de configuration sont claires

### Story 2.7: Définir des contraintes d'exécution (max steps, timeout)

As a développeur,
I want définir des contraintes d'exécution (max steps, timeout),
So that je peux limiter la durée et la complexité d'une exécution.

**Acceptance Criteria:**

**Given** un agent est créé
**When** je définis des contraintes (maxSteps: 10, timeout: 30000)
**Then** l'exécution s'arrête automatiquement si les limites sont atteintes
**And** l'état passe à "failed" avec une raison claire
**And** les contraintes sont appliquées avant chaque étape
**And** les événements de dépassement sont tracés

## Epic 3: Tool & Capability Management

Permettre de définir, déclarer et contrôler les outils disponibles pour un agent avec sécurité deny-by-default.

### Story 3.1: Définir un tool avec un schéma de validation

As a développeur,
I want définir un tool avec un schéma de validation,
So that je peux créer des outils typés et sécurisés pour mes agents.

**Acceptance Criteria:**

**Given** je veux créer un nouveau tool
**When** j'appelle `defineTool({ name: '...', schema: {...}, handler: ... })`
**Then** un tool est créé avec succès
**And** le schéma de validation est appliqué aux inputs
**And** les erreurs de validation sont claires et spécifiques
**And** le tool est typé avec TypeScript

### Story 3.2: Déclarer explicitement les tools disponibles pour un agent

As a développeur,
I want déclarer explicitement les tools disponibles pour un agent,
So that je contrôle précisément ce que l'agent peut utiliser.

**Acceptance Criteria:**

**Given** des tools sont définis
**When** je configure un agent avec `agent.addTools([tool1, tool2])`
**Then** seuls ces tools sont disponibles pour l'agent
**And** tout tool non déclaré est inaccessible (deny by default)
**And** la configuration est validée avant l'exécution

### Story 3.3: Valider les inputs d'un tool avant exécution

As a développeur,
I want que les inputs d'un tool soient validés avant exécution,
So that je peux éviter les erreurs et garantir la sécurité.

**Acceptance Criteria:**

**Given** un tool avec un schéma de validation est défini
**When** l'agent tente d'appeler le tool avec des inputs
**Then** les inputs sont validés contre le schéma avant exécution
**And** une erreur claire est retournée si la validation échoue
**And** le tool n'est pas exécuté si la validation échoue
**And** l'erreur est tracée dans les événements

### Story 3.4: Restreindre les tools autorisés via allowlist

As a développeur,
I want restreindre les tools autorisés via allowlist,
So that je peux limiter les capabilities d'un agent de manière explicite.

**Acceptance Criteria:**

**Given** plusieurs tools sont définis
**When** je configure un agent avec une allowlist de tools
**Then** seuls les tools de l'allowlist sont accessibles
**And** tout tool non dans l'allowlist est bloqué même s'il est déclaré
**And** les tentatives d'utilisation de tools non autorisés sont tracées

### Story 3.5: Organiser les tools en capabilities logiques

As a développeur,
I want organiser les tools en capabilities logiques,
So that je peux gérer et réutiliser des groupes de tools plus facilement.

**Acceptance Criteria:**

**Given** plusieurs tools sont définis
**When** je crée une capability qui regroupe des tools
**Then** je peux assigner la capability à un agent
**And** tous les tools de la capability deviennent disponibles
**And** les capabilities peuvent être réutilisées entre agents

### Story 3.6: Réutiliser des tools entre plusieurs agents

As a développeur,
I want réutiliser des tools entre plusieurs agents,
So that je peux éviter la duplication et maintenir la cohérence.

**Acceptance Criteria:**

**Given** des tools sont définis
**When** je crée plusieurs agents
**Then** je peux assigner les mêmes tools à différents agents
**And** chaque agent a sa propre instance de configuration
**And** les modifications d'un tool n'affectent pas les autres agents

### Story 3.7: Versionner des tools indépendamment

As a développeur,
I want versionner des tools indépendamment,
So that je peux faire évoluer les tools sans casser les agents existants.

**Acceptance Criteria:**

**Given** un tool est défini et utilisé par des agents
**When** je crée une nouvelle version du tool
**Then** les agents existants continuent d'utiliser l'ancienne version
**And** les nouveaux agents peuvent utiliser la nouvelle version
**And** les versions sont traçables et comparables

### Story 3.8: Empêcher l'exécution d'un tool non déclaré (deny by default)

As a développeur,
I want que le système empêche l'exécution d'un tool non déclaré,
So that la sécurité est garantie par design, pas par configuration.

**Acceptance Criteria:**

**Given** un agent est configuré avec des tools spécifiques
**When** l'agent tente d'appeler un tool non déclaré
**Then** l'appel est bloqué immédiatement
**And** une erreur claire est générée
**And** l'événement de blocage est tracé
**And** aucun effet de bord n'est produit

## Epic 4: Policies & Governance

Permettre de définir et appliquer des règles de gouvernance sur les agents pour contrôler leurs actions.

### Story 4.1: Définir une policy globale qui s'applique à tous les agents

As a tech lead,
I want définir une policy globale qui s'applique à tous les agents,
So that je peux établir des règles de gouvernance organisationnelles.

**Acceptance Criteria:**

**Given** je suis un tech lead avec accès à la configuration globale
**When** je définis une policy globale avec `sdk.defineGlobalPolicy({...})`
**Then** cette policy s'applique automatiquement à tous les agents
**And** les agents héritent de cette policy par défaut
**And** la policy peut être surchargée au niveau agent si nécessaire

### Story 4.2: Définir une policy spécifique à un agent

As a développeur,
I want définir une policy spécifique à un agent,
So that je peux personnaliser les règles pour un agent particulier.

**Acceptance Criteria:**

**Given** un agent est créé
**When** je définis une policy spécifique avec `agent.setPolicy({...})`
**Then** cette policy s'applique uniquement à cet agent
**And** la policy spécifique surcharge les policies globales
**And** la configuration est validée avant l'exécution

### Story 4.3: Définir un budget maximum (tokens ou steps) pour un agent

As a développeur,
I want définir un budget maximum (tokens ou steps) pour un agent,
So that je peux contrôler les coûts et la durée d'exécution.

**Acceptance Criteria:**

**Given** un agent est configuré
**When** je définis un budget maximum (maxTokens: 1000 ou maxSteps: 10)
**Then** l'exécution s'arrête automatiquement si le budget est atteint
**And** l'état passe à "failed" avec une raison claire
**And** le budget est vérifié avant chaque étape
**And** les événements de dépassement de budget sont tracés

### Story 4.4: Définir un timeout pour une exécution

As a développeur,
I want définir un timeout pour une exécution,
So that je peux éviter que les agents tournent indéfiniment.

**Acceptance Criteria:**

**Given** un agent est configuré
**When** je définis un timeout (timeout: 30000)
**Then** l'exécution s'arrête automatiquement si le timeout est atteint
**And** l'état passe à "failed" avec une raison "timeout"
**And** le timeout est vérifié régulièrement pendant l'exécution
**And** l'événement de timeout est tracé

### Story 4.5: Définir une allowlist de tools autorisés

As a développeur,
I want définir une allowlist de tools autorisés dans une policy,
So that je peux contrôler précisément quels tools peuvent être utilisés.

**Acceptance Criteria:**

**Given** une policy est définie
**When** je configure une allowlist de tools dans la policy
**Then** seuls les tools de l'allowlist sont autorisés
**And** tout tool non dans l'allowlist est bloqué même s'il est déclaré
**And** les tentatives d'utilisation de tools non autorisés sont tracées

### Story 4.6: Appliquer automatiquement les policies avant chaque action

As a système,
I want appliquer automatiquement les policies avant chaque action,
So that la gouvernance est garantie structurellement, pas optionnellement.

**Acceptance Criteria:**

**Given** des policies sont définies (globales ou spécifiques)
**When** un agent tente d'exécuter une action
**Then** toutes les policies pertinentes sont vérifiées avant l'action
**And** l'action est bloquée si une policy est violée
**And** les vérifications sont tracées dans les événements
**And** aucune action n'est exécutée sans vérification de policy

### Story 4.7: Bloquer une action si elle viole une policy

As a système,
I want bloquer une action si elle viole une policy,
So that la sécurité et la gouvernance sont garanties.

**Acceptance Criteria:**

**Given** une policy est définie et active
**When** un agent tente une action qui viole la policy
**Then** l'action est immédiatement bloquée
**And** une erreur claire indiquant la policy violée est générée
**And** l'événement de blocage est tracé avec la raison
**And** aucun effet de bord partiel n'est produit

### Story 4.8: Consulter les policies appliquées à une exécution

As a développeur,
I want consulter les policies appliquées à une exécution,
So that je peux comprendre pourquoi certaines actions ont été autorisées ou bloquées.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** j'interroge les policies appliquées avec `sdk.getRunPolicies(runId)`
**Then** je reçois la liste complète des policies actives pendant l'exécution
**And** chaque policy inclut sa source (globale ou spécifique)
**And** les vérifications de policy sont associées aux actions correspondantes

### Story 4.9: Tracer chaque vérification de policy dans les événements

As a système,
I want tracer chaque vérification de policy dans les événements,
So that l'audit et la traçabilité sont complets.

**Acceptance Criteria:**

**Given** des policies sont actives
**When** une vérification de policy est effectuée
**Then** un événement est généré avec la policy vérifiée, le résultat, et la raison
**And** l'événement est persisté dans l'event log
**And** l'événement est consultable via les traces

## Epic 5: Runtime Architecture - Séparation Raisonnement/Action

Implémenter l'architecture de séparation raisonnement/action pour garantir la sécurité by design.

### Story 5.1: Séparer le raisonnement (LLM) de l'action (tool execution)

As a système,
I want séparer le raisonnement (LLM) de l'action (tool execution),
So that la sécurité est garantie par architecture, pas par configuration.

**Acceptance Criteria:**

**Given** un agent est configuré
**When** l'agent exécute une tâche
**Then** le LLM génère uniquement des intentions structurées
**And** les intentions sont traitées par un Action Engine séparé
**And** le LLM n'a jamais d'accès direct aux tools
**And** toutes les actions passent par l'Action Engine

### Story 5.2: LLM génère des intentions structurées, jamais d'actions directes

As a système,
I want que le LLM génère des intentions structurées, jamais d'actions directes,
So that aucun effet de bord ne peut provenir directement du LLM.

**Acceptance Criteria:**

**Given** un agent exécute une tâche
**When** le LLM est appelé
**Then** le LLM retourne uniquement des intentions structurées (JSON)
**And** les intentions contiennent l'action souhaitée et les paramètres
**And** aucune action n'est exécutée directement par le LLM
**And** toutes les intentions sont tracées avant traitement

### Story 5.3: Toutes les actions passent par un Action Engine gouverné

As a système,
I want que toutes les actions passent par un Action Engine gouverné,
So that chaque action est validée et contrôlée avant exécution.

**Acceptance Criteria:**

**Given** une intention est générée par le LLM
**When** l'intention est traitée
**Then** l'intention est envoyée à l'Action Engine
**And** l'Action Engine valide l'intention contre les policies
**And** l'Action Engine exécute l'action uniquement si validée
**And** toutes les actions sont tracées après exécution

### Story 5.4: Valider chaque intention avant exécution

As a système,
I want valider chaque intention avant exécution,
So that seules les intentions valides et autorisées sont exécutées.

**Acceptance Criteria:**

**Given** une intention est générée par le LLM
**When** l'intention arrive à l'Action Engine
**Then** l'intention est validée contre le schéma du tool
**And** l'intention est vérifiée contre les policies actives
**And** l'intention est rejetée si elle ne passe pas les validations
**And** la raison du rejet est claire et tracée

### Story 5.5: Rejeter une intention si elle viole une policy

As a système,
I want rejeter une intention si elle viole une policy,
So that la gouvernance est appliquée automatiquement.

**Acceptance Criteria:**

**Given** une intention est générée et des policies sont actives
**When** l'intention viole une policy
**Then** l'intention est rejetée immédiatement
**And** une erreur claire indiquant la policy violée est générée
**And** l'événement de rejet est tracé
**And** aucune action partielle n'est exécutée

### Story 5.6: Tracer chaque intention générée par le LLM

As a système,
I want tracer chaque intention générée par le LLM,
So que l'observabilité du raisonnement est complète.

**Acceptance Criteria:**

**Given** un agent exécute une tâche
**When** le LLM génère une intention
**Then** un événement est créé avec l'intention complète
**And** l'événement inclut le timestamp, le contexte, et les paramètres
**And** l'événement est persisté dans l'event log
**And** l'événement est consultable via les traces

### Story 5.7: Tracer chaque action exécutée par l'Action Engine

As a système,
I want tracer chaque action exécutée par l'Action Engine,
So que l'observabilité des actions est complète.

**Acceptance Criteria:**

**Given** une action est exécutée par l'Action Engine
**When** l'action est complétée (succès ou échec)
**Then** un événement est créé avec le résultat de l'action
**And** l'événement inclut les inputs, outputs, durée, et statut
**And** l'événement est persisté dans l'event log
**And** l'événement est consultable via les traces

### Story 5.8: Comprendre pourquoi une action a été acceptée ou rejetée

As a développeur,
I want comprendre pourquoi une action a été acceptée ou rejetée,
So that je peux déboguer et améliorer la configuration de l'agent.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** je consulte les traces d'une action
**Then** je vois clairement si l'action a été acceptée ou rejetée
**And** la raison de l'acceptation ou du rejet est explicite
**And** les policies appliquées sont listées
**And** les validations effectuées sont documentées

### Story 5.9: Garantir qu'aucun effet de bord ne provient directement du LLM

As a système,
I want garantir qu'aucun effet de bord ne provient directement du LLM,
So que la sécurité est structurelle et non optionnelle.

**Acceptance Criteria:**

**Given** un agent est configuré
**When** le LLM génère une réponse
**Then** aucune action n'est exécutée directement par le LLM
**And** toutes les actions passent par l'Action Engine
**And** cette séparation est garantie par l'architecture, pas par configuration
**And** toute tentative de contournement est bloquée

### Story 5.10: Inspecter la séquence raisonnement → validation → action

As a développeur,
I want inspecter la séquence raisonnement → validation → action,
So that je peux comprendre le flux complet de décision de l'agent.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** je consulte les traces d'une action
**Then** je vois la séquence complète : intention LLM → validation → exécution
**And** chaque étape est tracée avec ses détails
**And** les timestamps montrent l'ordre chronologique
**And** les liens entre les événements sont clairs

## Epic 6: Event Sourcing & Persistence

Implémenter le système d'event-sourcing comme source de vérité pour toutes les exécutions.

### Story 6.1: Générer un événement structuré pour chaque étape d'exécution

As a système,
I want générer un événement structuré pour chaque étape d'exécution,
So que chaque action et décision est traçable.

**Acceptance Criteria:**

**Given** un agent exécute une tâche
**When** une étape d'exécution se produit (intention, validation, action, erreur)
**Then** un événement structuré est généré
**And** l'événement contient tous les détails pertinents (type, timestamp, données)
**And** l'événement suit un schéma cohérent
**And** l'événement est immédiatement disponible pour persistance

### Story 6.2: Persister tous les événements d'une exécution

As a système,
I want persister tous les événements d'une exécution,
So que l'historique complet est disponible pour replay et audit.

**Acceptance Criteria:**

**Given** des événements sont générés pendant une exécution
**When** un événement est créé
**Then** l'événement est immédiatement persisté
**And** la persistance est garantie même en cas d'erreur
**And** aucun événement n'est perdu
**And** la persistance est asynchrone pour ne pas bloquer l'exécution

### Story 6.3: Event log est la source de vérité unique pour une exécution

As a système,
I want que l'event log soit la source de vérité unique pour une exécution,
So que la cohérence et la traçabilité sont garanties.

**Acceptance Criteria:**

**Given** une exécution est effectuée
**When** je consulte l'état ou l'historique d'une exécution
**Then** toutes les informations proviennent de l'event log
**And** aucune logique "cachée" ne modifie l'état sans événement
**And** l'état peut être reconstruit uniquement à partir des événements
**And** l'event log est immuable (append-only)

### Story 6.4: Persister les événements au minimum en mémoire et fichier

As a système,
I want persister les événements au minimum en mémoire et fichier,
So que la persistance est simple et fiable pour le MVP.

**Acceptance Criteria:**

**Given** des événements sont générés
**When** les événements sont persistés
**Then** les événements sont stockés en mémoire pendant l'exécution
**And** les événements sont écrits dans un fichier (JSON ou format structuré)
**And** le fichier est organisé par runId
**And** la persistance fichier est fiable même en cas de crash

### Story 6.5: Reconstruire l'état complet d'une exécution à partir des événements

As a développeur,
I want reconstruire l'état complet d'une exécution à partir des événements,
So que je peux comprendre et rejouer n'importe quelle exécution.

**Acceptance Criteria:**

**Given** un runId existe avec ses événements persistés
**When** je charge les événements pour ce runId
**Then** je peux reconstruire l'état complet de l'exécution
**And** tous les détails (intentions, validations, actions, résultats) sont disponibles
**And** l'ordre chronologique est préservé
**And** l'état reconstruit est identique à l'état original

### Story 6.6: Exporter l'event log complet d'une exécution

As a développeur,
I want exporter l'event log complet d'une exécution,
So que je peux archiver, analyser ou partager l'historique complet.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** j'appelle `sdk.exportEventLog(runId)`
**Then** je reçois l'event log complet dans un format structuré (JSON)
**And** tous les événements sont inclus dans l'ordre chronologique
**And** le format est lisible et parseable
**And** l'export peut être sauvegardé ou transmis

### Story 6.7: Garantir qu'aucun événement n'est perdu pendant une exécution

As a système,
I want garantir qu'aucun événement n'est perdu pendant une exécution,
So que la traçabilité est complète et fiable.

**Acceptance Criteria:**

**Given** une exécution est en cours
**When** des événements sont générés
**Then** tous les événements sont persistés avant la fin de l'exécution
**And** même en cas d'erreur ou de crash, les événements jusqu'au point d'échec sont sauvegardés
**And** aucun événement n'est perdu entre la génération et la persistance
**And** la persistance est transactionnelle ou garantie

### Story 6.8: Interroger les événements par runId

As a développeur,
I want interroger les événements par runId,
So que je peux récupérer l'historique complet d'une exécution spécifique.

**Acceptance Criteria:**

**Given** un runId existe
**When** j'appelle `sdk.getEvents(runId)`
**Then** je reçois tous les événements pour ce runId
**And** les événements sont dans l'ordre chronologique
**And** une erreur claire est retournée si le runId n'existe pas
**And** la requête est performante même avec beaucoup d'événements

### Story 6.9: Filtrer les événements par type ou critère

As a développeur,
I want filtrer les événements par type ou critère,
So que je peux trouver rapidement les événements pertinents.

**Acceptance Criteria:**

**Given** des événements existent pour un runId
**When** j'appelle `sdk.getEvents(runId, { type: 'action' })`
**Then** je reçois uniquement les événements du type spécifié
**And** les filtres peuvent être combinés (type, timestamp, etc.)
**And** les résultats sont toujours dans l'ordre chronologique
**And** les filtres sont performants

## Epic 7: Tracing & Observability

Permettre de voir exactement ce que l'agent a fait et pourquoi il a pris ses décisions.

### Story 7.1: Générer un runId unique et traçable pour chaque exécution

As a système,
I want générer un runId unique et traçable pour chaque exécution,
So que chaque exécution peut être identifiée et suivie.

**Acceptance Criteria:**

**Given** une exécution démarre
**When** l'exécution est initialisée
**Then** un runId unique est généré (UUID ou équivalent)
**And** le runId est retourné immédiatement
**And** le runId est utilisé pour toutes les opérations liées à cette exécution
**And** le runId est persisté avec les événements

### Story 7.2: Récupérer la trace complète d'une exécution via son runId

As a développeur,
I want récupérer la trace complète d'une exécution via son runId,
So que je peux analyser ce qui s'est passé pendant l'exécution.

**Acceptance Criteria:**

**Given** un runId existe
**When** j'appelle `sdk.getTrace(runId)`
**Then** je reçois la trace complète de l'exécution
**And** la trace inclut tous les événements dans l'ordre chronologique
**And** la trace est structurée et lisible
**And** une erreur claire est retournée si le runId n'existe pas

### Story 7.3: Exporter les traces dans un format structuré (JSON)

As a développeur,
I want exporter les traces dans un format structuré (JSON),
So que je peux analyser, archiver ou partager les traces.

**Acceptance Criteria:**

**Given** une trace existe pour un runId
**When** j'appelle `sdk.exportTrace(runId)`
**Then** je reçois la trace dans un format JSON structuré
**And** le format est cohérent et parseable
**And** tous les détails sont inclus
**And** le format peut être importé pour analyse

### Story 7.4: Consulter les traces via console ou fichier

As a développeur,
I want consulter les traces via console ou fichier,
So que je peux voir rapidement ce qui s'est passé.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** je consulte les traces
**Then** je peux les voir dans la console (format lisible)
**And** je peux les exporter dans un fichier
**And** le format console est optimisé pour la lisibilité humaine
**And** le format fichier est structuré pour l'analyse

### Story 7.5: Tracer chaque décision prise par l'agent

As a système,
I want tracer chaque décision prise par l'agent,
So que l'observabilité cognitive est complète.

**Acceptance Criteria:**

**Given** un agent prend une décision pendant l'exécution
**When** une décision est prise (choix de tool, paramètres, etc.)
**Then** un événement est créé avec la décision et son contexte
**And** l'événement inclut les alternatives considérées (si disponibles)
**And** l'événement inclut la raison de la décision
**And** l'événement est persisté dans l'event log

### Story 7.6: Comprendre pourquoi l'agent a pris une décision spécifique

As a développeur,
I want comprendre pourquoi l'agent a pris une décision spécifique,
So que je peux améliorer l'agent et déboguer les problèmes.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** je consulte une décision spécifique dans les traces
**Then** je vois clairement pourquoi cette décision a été prise
**And** le contexte de la décision est disponible
**And** les contraintes qui ont pesé sont listées
**And** la raison est explicite et compréhensible

### Story 7.7: Voir les contraintes qui ont pesé sur une décision

As a développeur,
I want voir les contraintes qui ont pesé sur une décision,
So que je peux comprendre les limitations qui ont influencé le comportement.

**Acceptance Criteria:**

**Given** une exécution a été effectuée
**When** je consulte une décision dans les traces
**Then** je vois toutes les contraintes actives (policies, budgets, timeouts)
**And** les contraintes sont clairement associées à la décision
**And** l'impact de chaque contrainte est explicite
**And** les contraintes sont tracées avec leurs valeurs

## Epic 8: Replay & Debugging

Permettre de rejouer une exécution pour comprendre et déboguer les incidents.

### Story 8.1: Rejouer une exécution complète à partir de son runId

As a développeur,
I want rejouer une exécution complète à partir de son runId,
So que je peux reproduire et comprendre ce qui s'est passé.

**Acceptance Criteria:**

**Given** un runId existe avec ses événements persistés
**When** j'appelle `sdk.replay(runId)`
**Then** l'exécution complète est rejouée
**And** la même séquence d'actions est reproduite
**And** les mêmes tool calls sont exécutés dans le même ordre
**And** un nouveau runId est généré pour le replay

### Story 8.2: Replay fonctionne sans recontacter le LLM (mode replay)

As a système,
I want que le replay fonctionne sans recontacter le LLM,
So que le replay est rapide, déterministe et économique.

**Acceptance Criteria:**

**Given** un replay est effectué
**When** le replay est exécuté
**Then** aucun appel LLM n'est effectué
**And** les intentions originales sont réutilisées depuis les événements
**And** le replay est beaucoup plus rapide que l'exécution originale
**And** le replay est déterministe (même résultat à chaque fois)

### Story 8.3: Replay reproduit la même séquence d'actions et tool calls

As a développeur,
I want que le replay reproduise la même séquence d'actions et tool calls,
So que la reproductibilité est garantie.

**Acceptance Criteria:**

**Given** un replay est effectué
**When** le replay est exécuté
**Then** les mêmes tool calls sont exécutés dans le même ordre
**And** les mêmes paramètres sont utilisés
**And** la séquence logique est identique à l'original
**And** les résultats sont cohérents avec l'original (si les tools sont déterministes)

### Story 8.4: Rejouer une exécution avec des modifications de contexte

As a développeur,
I want rejouer une exécution avec des modifications de contexte,
So que je peux tester des scénarios "et si" pour comprendre l'impact des changements.

**Acceptance Criteria:**

**Given** un runId existe
**When** j'appelle `sdk.replay(runId, { modifications: {...} })`
**Then** le replay utilise les modifications spécifiées
**And** les modifications sont appliquées aux bonnes étapes
**And** le replay montre l'impact des modifications
**And** un nouveau runId est généré pour le replay modifié

### Story 8.5: Tester des scénarios "et si" en rejouant avec des paramètres différents

As a développeur,
I want tester des scénarios "et si" en rejouant avec des paramètres différents,
So que je peux explorer différentes possibilités sans réexécuter complètement.

**Acceptance Criteria:**

**Given** un runId existe
**When** je rejoue avec des paramètres différents (inputs, policies, etc.)
**Then** le replay utilise les nouveaux paramètres
**And** je peux comparer les résultats avec l'original
**And** les différences sont clairement visibles
**And** le replay est rapide car il réutilise les événements

### Story 8.6: Garantir la reproductibilité relative des replays

As a système,
I want garantir la reproductibilité relative des replays,
So que les replays sont fiables et prévisibles.

**Acceptance Criteria:**

**Given** un replay est effectué plusieurs fois
**When** le même replay est exécuté
**Then** la séquence logique est toujours la même
**And** les tool calls sont toujours dans le même ordre
**And** les résultats sont cohérents (si les tools sont déterministes)
**And** les différences sont uniquement dues aux tools externes non déterministes

### Story 8.7: Utiliser le replay pour déboguer un incident

As a développeur,
I want utiliser le replay pour déboguer un incident,
So que je peux comprendre rapidement ce qui a causé un problème.

**Acceptance Criteria:**

**Given** un incident s'est produit (runId avec état "failed")
**When** je rejoue l'exécution
**Then** je peux voir exactement où et pourquoi l'échec s'est produit
**And** je peux inspecter l'état à chaque étape
**And** je peux identifier la cause racine rapidement
**And** le replay me permet de tester des corrections

## Epic 9: Versioning & Audit

Permettre d'associer des versions aux agents et exécutions pour la traçabilité et l'audit.

### Story 9.1: Associer une version (ou hash de configuration) à un agent

As a développeur,
I want associer une version (ou hash de configuration) à un agent,
So que je peux tracker les différentes versions de mes agents.

**Acceptance Criteria:**

**Given** un agent est créé ou modifié
**When** je configure l'agent
**Then** une version (ou hash de configuration) est automatiquement générée
**And** la version est basée sur la configuration complète de l'agent
**And** la version est unique pour chaque configuration unique
**And** la version est traçable et consultable

### Story 9.2: Associer une version à une exécution

As a système,
I want associer une version à une exécution,
So que je peux savoir quelle version de l'agent a été utilisée.

**Acceptance Criteria:**

**Given** un agent avec une version est exécuté
**When** une exécution démarre
**Then** la version de l'agent est associée au runId
**And** la version est persistée avec les événements
**And** la version est consultable via les traces
**And** la version permet de comparer les comportements entre versions

