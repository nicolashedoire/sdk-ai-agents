---
stepsCompleted: [1, 2, 3, 4, 6, 7, 8, 9]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief-SDK_AI_Agents-2026-01-06.md
  - _bmad-output/planning-artifacts/research/technical-ecosysteme-sdks-frameworks-agents-ia-research-2026-01-06.md
  - _bmad-output/analysis/brainstorming-session-2026-01-06.md
briefCount: 1
researchCount: 1
brainstormingCount: 1
projectDocsCount: 0
workflowType: 'prd'
lastStep: 8
---

# Product Requirements Document - SDK_AI_Agents

**Author:** Nicolashedoire
**Date:** 2026-01-06

## Executive Summary

SDK_AI_Agents crée la confiance opérationnelle nécessaire pour déployer des agents IA en production. Alors que les équipes savent faire "parler" une IA, elles ne savent pas faire agir une IA de manière fiable, contrôlée, explicable et sécurisée en production.

Le problème n'est pas le LLM, mais l'architecture autour du LLM. Les équipes techniques bricolent des agents fragiles, réinventent leurs propres frameworks, et gèrent la sécurité "à la confiance" avec des logs pauvres et des tests quasi inexistants.

SDK_AI_Agents transforme les agents IA d'outils expérimentaux en systèmes décisionnels gouvernables, explicables et prêts pour la production. Il ne cherche pas à être un meilleur prompt framework ou un wrapper de LLM, mais l'infrastructure de gouvernance des agents IA où l'agent propose et le système décide.

**Vision en une phrase :** SDK_AI_Agents crée la confiance opérationnelle nécessaire pour déployer des agents IA en production.

### Ce qui rend ce produit spécial

SDK_AI_Agents se distingue par huit différenciateurs stratégiques qui convergent vers la confiance opérationnelle :

#### Différenciateurs techniques fondamentaux

1. **Event-sourcing natif** → Replay, audit et comparaison de comportements en une commande
   - Chaque exécution est traçable, rejouable et comparable
   - Unique sur le marché : impossible avec LangChain ou autres frameworks

2. **Séparation raisonnement/action** → Sécurité par design (le LLM ne provoque jamais d'effet de bord)
   - Le LLM génère des intentions structurées, jamais d'actions directes
   - Toutes les actions passent par un Action Engine gouverné

3. **Gouvernance intégrée by design** → Policies, budgets, garde-fous natifs
   - La gouvernance n'est pas une option ni un plugin : elle est structurelle, intégrée au runtime
   - Sécurité "deny by default" avec contrats explicites pour chaque capability

4. **Testabilité native des agents** → Golden traces, replay déterministe, non-régression
   - Les agents deviennent des objets logiciels testables, pas des comportements probabilistes
   - QA, CI/CD, rollback et amélioration continue possibles

#### Différenciateurs stratégiques profonds

5. **Agent ≠ LLM** → Changement de paradigme fondamental
   - Un agent n'est pas un LLM avec des tools
   - Un agent est un système décisionnel gouverné, dont le LLM n'est qu'un composant
   - Justifie l'existence d'une infrastructure dédiée, au-delà des frameworks d'orchestration

6. **Agent comme artefact logiciel** → Versionnable, comparable, testable, auditable
   - Chaque run est un artefact logiciel industriel, pas une magie probabiliste
   - Permet QA structurée, CI/CD, rollback et amélioration continue
   - Peu d'outils vont aussi loin structurellement

7. **Observabilité cognitive** → Observer le raisonnement, pas seulement l'exécution
   - Pas seulement logs, métriques, spans
   - Comprendre pourquoi cette décision, quelles contraintes ont pesé, quelles alternatives ont été envisagées
   - Observer comment l'agent raisonne sous contrainte, pas seulement ce qu'il fait

8. **Sécurité par impossibilité** → Propriété structurelle, pas feature
   - Pas de tool sans déclaration explicite
   - Pas d'action sans policy vérifiée
   - Pas d'exécution sans trace complète
   - La sécurité n'est pas une feature, c'est une propriété structurelle

**Positionnement clair :**
- ❌ Pas un meilleur LangChain
- ❌ Pas un wrapper LLM
- ✅ Infrastructure de gouvernance de l'intelligence agissante
- ✅ Couche structurante entre IA et monde réel (comparable à Terraform pour infra, Prisma pour données)

**Évolution de la vision :**
SDK_AI_Agents n'est pas un outil pour créer des agents, c'est une infrastructure de gouvernance de l'intelligence agissante. La vision a évolué :
- Du "comment faire" au "comment assumer" — assumer les conséquences des agents
- Du runtime au système de preuves — prouver ce qu'ils ont fait, pourquoi, sous quelles règles
- Du dev tool à l'infrastructure stratégique — standard potentiel, pas simple SDK

## Project Classification

**Technical Type:** `developer_tool`
- SDK/package TypeScript/Node.js pour développeurs backend et tech leads
- Focus sur gouvernance, observabilité et testabilité des agents IA

**Domain:** `general`
- Outil général pour développeurs travaillant avec des agents IA
- Applicable à tous les domaines nécessitant des agents IA en production

**Complexity:** `low` (avec aspects techniques avancés)
- API simple par défaut (Quick Start en 10 lignes)
- Architecture sophistiquée sous-jacente (event-sourcing, séparation raisonnement/action)
- Complexité gérée par le SDK, pas exposée au développeur

**Project Context:** Greenfield — nouveau projet

## Success Criteria

**Principe directeur :**

Le succès de SDK_AI_Agents ne se mesure pas au nombre d'agents créés, mais au niveau de confiance que les équipes accordent aux agents en production.

**Succès = les équipes osent confier de vraies actions à des agents.**

### User Success

#### Métriques Time-to-Value

Ces métriques mesurent la friction d'entrée et la vitesse d'appropriation :

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Temps pour premier agent fonctionnel | < 30 minutes | Depuis installation jusqu'à premier `agent.run()` réussi |
| Temps pour premier agent en prod | < 1 journée | Depuis création agent jusqu'à déploiement production |
| Temps pour comprendre un incident agent | < 5 minutes | Depuis signalement incident jusqu'à compréhension via replay |
| Temps pour rejouer un run | < 10 secondes | Commande `sdk.replay(runId)` jusqu'à résultat |

#### Métriques de Confiance Acquise

Ces métriques valident que l'utilisateur ne se contente pas d'essayer, mais s'engage :

| Axe | Métrique | Cible MVP |
|-----|----------|-----------|
| **Confiance** | % d'agents autorisés à effectuer des actions réelles | > 50% des agents en prod |
| **Maîtrise** | % d'incidents reproduits avec succès via replay | 100% des incidents reproductibles |
| **Adoption profonde** | % de projets utilisant policies + replay (pas juste run()) | > 60% des projets |

#### Moments de Succès Utilisateur (Aha Moments)

**Moment Aha #1 - Développeur (Alex) :**
"J'ai reproduit un incident en 30 secondes et compris exactement pourquoi l'agent a fait ça."

**Moment Aha #2 - Tech Lead (Sarah) :**
"Je peux valider ce PR d'agent sans stress, car tout est tracé et contrôlé."

**Moment Aha #3 - Product Engineer (Jordan) :**
"Je peux améliorer l'agent sans casser ce qui marchait."

**Moment Aha #4 - Tech Lead (Gouvernance) :**
"Je peux définir une règle globale et elle s'applique à tous les agents."
➡️ Valide la gouvernance transversale.

**Moment Aha #5 - Product (Comparaison) :**
"Je peux comparer deux versions d'un agent comme je comparerais deux features."
➡️ Valide que l'agent devient un objet produit, pas un comportement magique.

#### Adoption des Fonctionnalités Différenciantes

| Feature | Signal de succès | Objectif MVP |
|---------|------------------|--------------|
| Event tracing | > 70% des agents | Agents avec tracing activé |
| Policies actives | > 60% des projets | Projets avec au moins une policy définie |
| Tool scopes / allowlist | > 50% | Agents avec capabilities contrôlées |
| Replay utilisé | > 40% | Utilisateurs ayant utilisé replay au moins une fois |
| Tests d'agents (golden traces) | > 30% | Projets avec tests structurés d'agents |

👉 **Ces chiffres sont volontairement ambitieux : ce sont des features "qui font mal" si inutiles.**

#### Personas et Résultats Attendus

**Alex - Développeur Backend :**
- Agent en production stable depuis > 1 semaine
- Temps de debugging incidents < 5 minutes (vs 4 heures avant)
- Confiance tech lead obtenue

**Sarah - Tech Lead / Architecte :**
- 100% des agents utilisent SDK_AI_Agents (standardisation)
- 0 incidents non auditables
- Conformité réglementaire atteinte

**Jordan - Product / Platform Engineer :**
- Comparaison de versions fonctionnelle
- 0 régressions après améliorations
- Métriques d'amélioration mesurables

### Business Success

#### Succès à 3 Mois - Validation du Problème

**Objectif :** Valider l'adéquation problème / solution

**Indicateurs clés (preuves, pas volumes) :**
- ≥ 3 équipes utilisant le SDK en production
- ≥ 1 incident réel rejoué et compris
- Feedback utilisateur explicitant : "C'est le replay / tracing / policies qui nous a convaincus"

**Métriques :**
- **Projets actifs** avec agents en prod : ≥ 3 projets
- **Nombre de runs tracés / replays** : > 1000 runs tracés
- **Feedback qualitatif fort** : Témoignages utilisateurs, cas d'usage documentés
- **Adoption volontaire** : > 50% utilisateurs activent features gouvernance

**Critères de succès :**
- ✅ Validation que le problème est réel et que la solution fonctionne
- ✅ Early adopters satisfaits et recommandent le SDK
- ✅ Preuve de valeur mesurable (temps économisé, incidents évités)

#### Succès à 12 Mois - Validation du Positionnement

**Objectif :** Devenir un standard de facto pour gouvernance agents IA

**Indicateurs (validation du changement de pratiques) :**
- SDK utilisé comme socle standard (pas juste une lib parmi d'autres)
- Cas d'usage à enjeu réel (actions non triviales)
- Adoption volontaire des garde-fous (pas imposée)

**Métriques :**
- **Rétention des équipes** : > 80% équipes continuent après 6 mois
- **Nombre moyen d'agents par projet** : > 3 agents par projet
- **Adoption des features avancées** : > 40% utilisent gouvernance avancée
- **Cas d'usage critiques** : > 20% agents avec actions réelles (pas chat)

**Critères de succès :**
- ✅ Positionnement comme infrastructure de gouvernance standard
- ✅ Adoption par entreprises réglementées (finance, santé)
- ✅ Communauté active avec contributions

#### Métriques à Suivre (sans optimiser au MVP)

À suivre pour comprendre la profondeur d'usage :
- Nombre d'agents par projet (profondeur d'usage)
- Rétention équipe → projet suivant
- Nombre de runs / replays par agent

À garder pour plus tard (post-MVP) :
- Revenus
- Pricing
- ARR

👉 **Au MVP, la crédibilité technique et la confiance priment sur la monétisation.**

### Technical Success

#### Critères Techniques MVP

**Performance :**
- Overhead SDK (hors LLM/tools) < 5–10 ms
- Replay sans appel LLM

**Fiabilité :**
- Aucun tool exécuté sans event correspondant
- Aucune action non traçable
- Aucun run "orphelin" (sans trace complète)

**Déterminisme relatif :**
- Replay = même séquence logique
- Même tool calls dans le même ordre
- 👉 **La reproductibilité est plus importante que la vitesse brute.**

#### Contraintes Techniques Non Négociables

1. **Event log = source de vérité**
   - Pas de logique "cachée"
   - Tout est traçable et rejouable

2. **Deny by default**
   - Tool, action, capability : tout doit être explicitement autorisé
   - Sécurité par impossibilité, pas par configuration

3. **API stable et minimaliste**
   - Peu de concepts, mais solides
   - Type-safe, documentée, prévisible

#### KPIs de Validation MVP (Priorisation Stricte)

**Priorité 1 - Critiques (si ces 3 sont vrais → concept validé) :**
1. 🔁 **Replay fonctionnel et utilisé** : 100% des runs rejouables
2. 🔍 **Tracing compréhensible sans effort** : > 80% utilisateurs comprennent traces
3. 🔐 **Policies réellement actives** : > 60% projets avec policies

**Priorité 2 - Optimisables :**
4. ⏱️ **Time-to-first-agent acceptable** : < 30 minutes

👉 **Si 1, 2 et 3 sont vrais → le concept est validé. Le reste est optimisable.**

### Measurable Outcomes

#### Qualité & Fiabilité

| Métrique | Objectif MVP | Mesure |
|----------|--------------|--------|
| Incidents agents en prod | ↓ significative | Nombre d'incidents par mois |
| Incidents non reproductibles | ≈ 0 | Incidents où replay impossible |
| Rollback / hotfix agents | ↓ | Nombre de rollbacks nécessaires |
| Désactivation d'agents par peur | ↓ | Agents désactivés par manque de confiance |

#### Impact Business (Post-MVP)

| KPI | Cible 3 mois | Cible 12 mois | Mesure |
|-----|--------------|---------------|--------|
| Temps développement | -40% | -60% | vs solution maison |
| Coûts IA | -20% | -30% | vs baseline sans monitoring |
| Time to production | -30% | -50% | vs solution maison |

## Product Scope

### MVP - Minimum Viable Product

**Principe directeur :**
Le MVP doit prouver qu'un agent peut agir en production de manière contrôlée, explicable et rejouable.

**Le MVP en une phrase :**
Un runtime d'agent événementiel capable d'exécuter des tools de façon contrôlée, avec tracing et replay natifs.

**Le MVP doit démontrer :**
👉 **"Je peux comprendre, rejouer et sécuriser le comportement de mon agent."**

#### Core Features MVP

1. **Runtime d'Agent Événementiel (CORE)**
   - Exécuter un agent via une boucle simple (max steps)
   - Émettre des événements structurés à chaque étape
   - Persister ces événements (au moins in-memory + file)

2. **Tool Calling Typé et Contrôlé**
   - Définition explicite des tools (`defineTool`)
   - Validation des inputs (Zod / schema)
   - Tool registry avec allowlist
   - Tool call visible dans les events

3. **Policies Minimales (Sécurité by Design)**
   - Allowlist tools (deny by default)
   - Budget max (tokens ou steps)
   - Timeout / max steps

4. **Observabilité Native (Tracing First-Class)**
   - Traces lisibles (JSON structuré)
   - Chaque run a un `runId`
   - Chaque décision, tool call, erreur est tracée
   - Export possible (console + fichier)

5. **Replay d'Exécution (Killer Feature MVP)**
   - Rejouer un run à partir des events
   - Sans recontacter le LLM (mode "replay")
   - Même séquence, mêmes tool calls

6. **DX Minimale mais Solide**
   - Quickstart en < 10 lignes
   - 1 exemple complet (agent + tool + replay)
   - API TypeScript claire et typée
   - Documentation essentielle

**MVP Checklist :**
- ✅ Agent runtime événementiel
- ✅ Tool calling typé + allowlist
- ✅ Policies simples (budget, steps, timeout)
- ✅ Tracing structuré
- ✅ Replay d'exécution
- ✅ 1 provider LLM (OpenAI ou Anthropic)
- ✅ 1 exemple réel complet
- ✅ Tests basés sur traces

### Growth Features (Post-MVP)

**Phase 2 - Production-Ready (3-4 mois) :**
- Policies avancées (approval humaine, budgets complexes)
- Observabilité cognitive (graphe raisonnement)
- Capabilities system complet
- Multi-providers LLM

**Phase 3 - Advanced Features (6-12 mois) :**
- Mémoire causale et temporelle
- Time travel debugging
- Multi-agent orchestration
- Conformité sectorielle (finance, santé)

### Vision (Future)

**Phase 4 - Platform (12-24 mois) :**
- Marketplace de plugins
- UI/Dashboard web
- Support multi-langages (Python)
- Écosystème et communauté

**Hors MVP explicite :**
- ❌ Multi-agent orchestration
- ❌ Mémoire vectorielle / RAG avancé
- ❌ UI / dashboard web
- ❌ Marketplace de plugins
- ❌ Approval humaine interactive (structure existe, pas l'UI)
- ❌ Fine-tuning / training
- ❌ Optimisation avancée des coûts
- ❌ Support multi-langages (TypeScript uniquement pour MVP)

👉 **Si on les inclut, on rate le MVP.**

## User Journeys

### Journey 1 : Alex - Du doute à la confiance opérationnelle

**Le héros :** Alex, développeur backend senior dans une SaaS B2B de 20 personnes. Stack : Node.js, TypeScript, PostgreSQL. Il doit intégrer un agent qui automatise des actions client dans l'application existante.

**Scène d'ouverture - Vendredi 18h30 :**
Un bug en production lié à l'agent. L'agent a modifié des données critiques de manière inattendue. Alex ne peut pas reproduire le problème. Il passe 4 heures à chercher dans les logs console, sans résultat. Son tech lead lui demande des explications qu'il ne peut pas donner. Il se sent impuissant et frustré.

**Action montante - Lundi matin :**
Il découvre SDK_AI_Agents via un article technique qui mentionne "replay natif en 1 commande". Intrigué, il installe le package : `npm install @sdk-ai-agents/core`. Il suit le Quick Start et crée son premier agent fonctionnel en moins de 30 minutes. Il est surpris par la simplicité de l'API.

Il migre progressivement son code existant. Il définit ses premières capabilities avec `defineTool()`, et il comprend immédiatement que chaque tool doit être explicitement autorisé. Il configure des policies simples : budget max de tokens, timeout, allowlist de tools. Il voit que la sécurité est "deny by default" — c'est exactement ce dont il avait besoin.

**Climax - Deux semaines plus tard, 14h23 :**
Un incident similaire se produit. Cette fois, il exécute `sdk.replay(runId)` et voit exactement ce qui s'est passé. Il comprend pourquoi l'agent a pris cette décision, quelles contraintes ont pesé, et quelles alternatives ont été envisagées. Il corrige le problème en 5 minutes au lieu de 4 heures.

Son tech lead valide le PR sans stress, car tout est tracé. Alex peut expliquer chaque décision, chaque tool call, chaque contrainte. Il se sent enfin en contrôle.

**Résolution - Trois mois plus tard :**
Son agent tourne en production sans incidents majeurs. Il peut rejouer n'importe quel run, comprendre chaque décision, et itérer en confiance. Il recommande SDK_AI_Agents à ses collègues. Il a gagné la confiance de son tech lead et se sent serein.

**Ce que révèle ce journey :**
- Quick Start en < 30 minutes
- API claire et intuitive
- Replay natif pour debugging
- Sécurité "deny by default" avec capabilities
- Policies simples mais efficaces
- Observabilité complète

---

### Journey 2 : Sarah - De la peur à la gouvernance organisationnelle

**Le héros :** Sarah, Tech Lead dans une scale-up de 50-200 personnes. Plusieurs équipes développent des agents IA, chacune avec son propre framework. Elle est responsable de la sécurité, de la fiabilité et du contrôle des coûts.

**Scène d'ouverture - Réunion d'urgence :**
Elle découvre qu'un agent a modifié des données critiques sans traçabilité. Elle ne peut pas expliquer ce qui s'est passé ni prouver la conformité. Elle bloque temporairement tous les agents en production. Les équipes sont frustrées, l'innovation est bloquée.

**Action montante - Semaine suivante :**
Elle évalue SDK_AI_Agents pendant 2 semaines. Elle teste la gouvernance native, l'audit trail complet, et la séparation raisonnement/action. Elle comprend que le LLM ne provoque jamais d'effet de bord direct — toutes les actions passent par un Action Engine gouverné.

Elle configure des policies globales qui s'appliquent automatiquement à tous les agents de l'organisation. Elle définit des budgets max, des allowlists de capabilities, et des contraintes de sécurité. Elle voit que la gouvernance n'est pas une option ni un plugin — elle est structurelle, intégrée au runtime.

**Climax - Audit de conformité, 2 mois plus tard :**
Lors d'un audit réglementaire, elle exporte l'audit trail complet de tous les agents. Elle démontre que chaque action est traçable, chaque décision explicable, et que les policies de sécurité sont appliquées automatiquement. L'auditeur valide la conformité sans surcouches complexes.

Elle montre comment elle peut définir une règle globale et elle s'applique à tous les agents. Elle montre comment chaque run est un artefact signable, archivable, comparable. L'auditeur est impressionné par la traçabilité complète.

**Résolution - Six mois plus tard :**
SDK_AI_Agents est le standard pour tous les agents de l'organisation. Elle peut définir des règles globales qui s'appliquent automatiquement, et elle a une visibilité complète sur tous les agents. L'innovation IA est autorisée avec gouvernance. Elle se sent enfin en contrôle.

**Ce que révèle ce journey :**
- Gouvernance native avec policies centralisées
- Audit trail complet pour conformité
- Visibilité sur tous les agents et leurs actions
- Contrôle des coûts et budgets
- Standardisation sans bloquer l'innovation
- Séparation raisonnement/action pour sécurité

---

### Journey 3 : Jordan - De l'incertitude à l'itération produit confiante

**Le héros :** Jordan, Product Engineer dans une SaaS avec forte composante IA. Il doit améliorer le comportement d'un agent existant, mais chaque changement de prompt est risqué et il ne peut pas comparer les versions.

**Scène d'ouverture - Sprint planning :**
Il modifie le prompt pour améliorer l'agent, mais une régression apparaît en production. Il ne peut pas comparer les deux versions ni comprendre ce qui a changé. Il doit rollback et perdre l'amélioration. Il se sent frustré et découragé.

**Action montante - Semaine suivante :**
Il migre l'agent vers SDK_AI_Agents. Il configure les capabilities et active le tracing. Il modifie le prompt et exécute des tests avec des scénarios réels. Il compare les runs avant/après avec `sdk.compare(runId1, runId2)`.

Il voit exactement ce qui a changé : quelles décisions ont été prises différemment, quelles contraintes ont pesé, quelles alternatives ont été envisagées. Il comprend pourquoi certaines améliorations fonctionnent et pourquoi certaines régressions apparaissent.

**Climax - Feature launch, 1 mois plus tard :**
Il identifie précisément les améliorations et les régressions. Il ajuste le prompt pour garder les améliorations tout en évitant les régressions. Il déploie avec confiance, car il a mesuré l'impact avant la mise en production.

Il peut comparer deux versions d'un agent comme il comparerait deux features. Il peut tester des scénarios avant mise en prod. Il peut améliorer l'agent sans régression. Il se sent enfin en contrôle de l'évolution de l'agent.

**Résolution - Trois mois plus tard :**
Il peut maintenant itérer sur l'agent comme sur une feature produit classique. Il compare les versions, mesure les améliorations, et évite les régressions. L'agent évolue de manière prévisible et mesurable. Il se sent serein et productif.

**Ce que révèle ce journey :**
- Comparaison de runs pour mesurer améliorations
- Tests structurés avant déploiement
- Observabilité cognitive pour comprendre comportement
- Itération rapide sans risques
- Agent comme artefact logiciel versionnable

---

### Journey 4 : Maya - Sécurité & Conformité - De la méfiance à l'approbation confiante

**Le héros :** Maya, responsable Sécurité & Conformité dans une entreprise réglementée (finance). Elle doit valider la sécurité et la conformité des agents IA avant déploiement, mais elle ne peut pas auditer les comportements IA avec les outils actuels.

**Scène d'ouverture - Réunion de validation :**
Une équipe produit veut déployer un agent pour automatiser des actions critiques. Maya ne peut pas valider la sécurité ni prouver la conformité. Elle bloque le déploiement, frustrant l'équipe produit et ralentissant l'innovation. Elle se sent coincée entre sécurité et innovation.

**Action montante - Évaluation, 2 semaines :**
Elle découvre SDK_AI_Agents via une recommandation de Sarah (Tech Lead). Elle évalue l'audit trail complet, les policies centralisées vérifiables, et la traçabilité de chaque décision. Elle teste la séparation raisonnement/action et la sécurité "deny by default".

Elle comprend que chaque tool doit être explicitement autorisé, chaque action doit passer par une policy vérifiée, et chaque exécution doit être tracée. Elle voit que la sécurité n'est pas une feature — c'est une propriété structurelle.

**Climax - Audit réglementaire, 3 mois plus tard :**
Lors d'un audit réglementaire, elle exporte l'audit trail complet de tous les agents. Elle démontre que chaque action est traçable, chaque décision explicable, et que les policies de sécurité sont appliquées automatiquement. L'auditeur valide la conformité sans surcouches complexes.

Elle montre comment elle peut définir des policies de sécurité globales qui s'appliquent automatiquement à tous les agents. Elle montre comment chaque run est un artefact signable, archivable, comparable. L'auditeur est impressionné par la gouvernance native.

**Résolution - Six mois plus tard :**
Elle peut maintenant approuver les agents IA avec confiance. Elle définit des policies de sécurité globales qui s'appliquent automatiquement à tous les agents. Elle ne bloque plus l'innovation IA grâce à la gouvernance native, et la conformité est atteinte sans complexité supplémentaire. Elle se sent enfin alignée avec l'innovation.

**Ce que révèle ce journey :**
- Audit trail complet pour conformité réglementaire
- Policies centralisées et vérifiables
- Traçabilité de chaque décision et action
- Sécurité "deny by default" avec capabilities contrôlées
- Agents certifiables pour domaines réglementés

---

### Journey 5 : Sam - Product Manager - De l'hésitation à la confiance produit

**Le héros :** Sam, Product Manager dans une SaaS avec forte composante IA. Il doit définir des features IA et mesurer l'impact utilisateur, mais il ne peut pas faire confiance aux agents pour des features critiques à cause de leur imprévisibilité.

**Scène d'ouverture - Post-mortem d'incident :**
Il lance une feature IA qui génère des incidents utilisateurs. Il ne peut pas comprendre pourquoi l'agent agit d'une certaine manière ni mesurer l'impact réel. Il doit désactiver la feature, frustrant les utilisateurs et l'équipe technique. Il se sent impuissant.

**Action montante - Découverte, 1 semaine :**
Il découvre SDK_AI_Agents via Jordan (Product Engineer). Il explore l'observabilité cognitive, le contrôle des coûts IA, et la réduction des incidents. Il comprend que les agents peuvent être fiables et prévisibles avec la bonne infrastructure.

Il voit comment l'observabilité cognitive permet de comprendre pourquoi l'agent agit, pas seulement ce qu'il fait. Il voit comment le contrôle des coûts IA permet de gérer les budgets. Il comprend que les agents peuvent être observables et contrôlables.

**Climax - Nouvelle feature launch, 2 mois plus tard :**
Il lance une nouvelle feature IA avec SDK_AI_Agents. Il peut observer le comportement des utilisateurs via l'observabilité cognitive, mesurer l'impact réel, et contrôler les coûts IA. Quand un incident survient, il peut le comprendre et le corriger rapidement grâce au replay.

Il peut comparer deux versions d'un agent comme il comparerait deux features. Il peut tester des scénarios avant mise en prod. Il peut améliorer l'agent sans régression. Il se sent enfin en contrôle de l'évolution des features IA.

**Résolution - Six mois plus tard :**
Il peut maintenant faire confiance aux agents pour des features critiques. Il comprend mieux l'impact des agents grâce à l'observabilité, et les incidents sont réduits. Il peut itérer sur les features IA comme sur des features produit classiques. Il se sent serein et productif.

**Ce que révèle ce journey :**
- Agents fiables et prévisibles
- Réduction des incidents utilisateurs
- Observabilité pour comprendre comportement utilisateurs
- Contrôle des coûts IA
- Agents comme features produit itérables

---

### Journey 6 : Dr. Chen - Data Scientist - Du support infrastructure à la valeur métier

**Le héros :** Dr. Chen, Data Scientist dans une entreprise tech. Il supporte les équipes produit avec son expertise ML/IA, mais il passe trop de temps sur l'infrastructure des agents au lieu de se concentrer sur la valeur métier.

**Scène d'ouverture - Sprint rétrospective :**
Il passe des heures à aider les développeurs à intégrer des agents IA, à déboguer des problèmes d'infrastructure, et à réinventer des solutions maison. Il ne peut pas se concentrer sur l'amélioration des modèles ni sur la valeur métier. Il se sent frustré et épuisé.

**Action montante - Migration, 1 mois :**
Il découvre SDK_AI_Agents via une recommandation technique. Il apprécie le framework standardisé, la gouvernance native, et la simplicité d'intégration. Il migre progressivement les agents existants vers SDK_AI_Agents.

Il voit que le framework standardisé réduit drastiquement le besoin de support. Il voit que la gouvernance native simplifie l'intégration. Il comprend que les développeurs peuvent maintenant intégrer des agents IA sans son aide constante.

**Climax - Focus sur la valeur, 2 mois plus tard :**
Il réduit drastiquement le temps passé sur l'infrastructure. Les développeurs peuvent intégrer des agents IA sans son aide constante, et il peut se concentrer sur l'amélioration des modèles et la valeur métier. Le support est simplifié grâce à la standardisation.

Il passe maintenant 80% de son temps sur la valeur métier au lieu de l'infrastructure. Il peut se concentrer sur l'amélioration des modèles, l'optimisation des performances, et l'innovation ML. Il se sent enfin aligné avec sa mission.

**Résolution - Six mois plus tard :**
Il passe maintenant la majorité de son temps sur la valeur métier. Il peut se concentrer sur l'amélioration des modèles, l'optimisation des performances, et l'innovation ML. Le framework standardisé réduit le besoin de support constant. Il se sent productif et épanoui.

**Ce que révèle ce journey :**
- Framework standardisé pour agents IA
- Moins de support nécessaire pour intégration
- Focus sur la valeur métier plutôt que l'infrastructure
- Standardisation simplifie le support

---

### Journey 7 : Taylor - DevOps/SRE - De l'opérationnel réactif au monitoring intelligent

**Le héros :** Taylor, DevOps/SRE dans une entreprise tech. Il doit opérer et monitorer les agents IA en production, mais il ne peut pas comprendre les incidents ni les reproduire avec les outils actuels.

**Scène d'ouverture - Incident critique, 3h du matin :**
Un agent IA cause un incident en production. Taylor ne peut pas comprendre ce qui s'est passé ni reproduire le problème. Il passe des heures à chercher dans les logs sans résultat, et l'incident se répète. Il se sent impuissant et épuisé.

**Action montante - Découverte, 1 semaine :**
Il découvre SDK_AI_Agents via une recommandation de Sarah (Tech Lead). Il explore le replay natif, l'observabilité complète, et la traçabilité de chaque décision. Il configure le monitoring et les alertes basés sur les événements.

Il voit comment le replay natif permet de rejouer n'importe quelle exécution en quelques secondes. Il voit comment l'observabilité complète permet de comprendre chaque décision. Il comprend que les agents peuvent être observables et reproductibles.

**Climax - Résolution d'incident, 1 mois plus tard :**
Quand un incident survient, il peut rejouer l'exécution complète en quelques secondes. Il comprend immédiatement ce qui s'est passé, pourquoi l'agent a pris cette décision, et comment corriger le problème. Il peut même simuler des scénarios "et si" pour prévenir les futurs incidents.

Il peut maintenant opérer les agents IA avec confiance. Il comprend chaque incident grâce au replay, et il peut prévenir les problèmes grâce à l'observabilité complète. Le temps de résolution des incidents est réduit de 80%.

**Résolution - Trois mois plus tard :**
Il peut maintenant opérer les agents IA avec confiance. Il comprend chaque incident grâce au replay, et il peut prévenir les problèmes grâce à l'observabilité complète. Le temps de résolution des incidents est réduit de 80%, et la fiabilité globale s'améliore. Il se sent enfin en contrôle.

**Ce que révèle ce journey :**
- Replay natif pour résolution d'incidents
- Observabilité complète pour monitoring
- Traçabilité de chaque décision
- Simulation de scénarios "et si"
- Réduction drastique du temps de résolution

---

### Journey 8 : Jamie - Développeur Junior - De l'intimidation à la maîtrise progressive

**Le héros :** Jamie, développeur junior dans une startup tech. Il veut apprendre à créer des agents IA, mais il trouve les frameworks existants trop complexes et intimidants. Il a peur de faire des erreurs qui pourraient impacter la production.

**Scène d'ouverture - Premier essai, week-end :**
Il essaie de créer son premier agent avec LangChain, mais il est submergé par la complexité. Il ne comprend pas comment tester son agent ni comment sécuriser les tools. Il abandonne, frustré et découragé. Il se sent incompétent.

**Action montante - Découverte, 1 semaine :**
Il découvre SDK_AI_Agents via un tutoriel. Il suit le Quick Start et crée son premier agent fonctionnel en moins de 30 minutes. Il est surpris par la simplicité de l'API. Il comprend rapidement les concepts grâce à l'API simple et la documentation claire.

Il définit ses premières capabilities avec `defineTool()`, et il comprend immédiatement que chaque tool doit être explicitement autorisé. Il configure des policies simples : budget max, timeout, allowlist. Il voit que la sécurité est "deny by default" — c'est rassurant.

**Climax - Premier agent en prod, 1 mois plus tard :**
Il crée un agent qui automatise une tâche répétitive. Quand il teste son agent, il peut voir exactement ce qui se passe grâce au tracing. Quand il fait une erreur, il peut la comprendre et la corriger rapidement grâce au replay. Il déploie son agent en production avec confiance.

Il peut maintenant créer des agents fiables et sécurisés. Il comprend les concepts de gouvernance, d'observabilité, et de testabilité. Il se sent compétent et confiant.

**Résolution - Trois mois plus tard :**
Il devient compétent dans la création d'agents IA. Il comprend les concepts de gouvernance, d'observabilité, et de testabilité. Il peut créer des agents fiables et sécurisés, et il contribue activement à l'innovation IA de son équipe. Il se sent épanoui et productif.

**Ce que révèle ce journey :**
- Quick Start accessible pour débutants
- API simple et intuitive
- Documentation claire et exemples concrets
- Sécurité "deny by default" rassurante
- Apprentissage progressif des concepts

---

### Journey Requirements Summary

Ces 8 user journeys révèlent les capacités nécessaires pour SDK_AI_Agents :

**Capacités Core (MVP) :**
- Quick Start en < 30 minutes
- API TypeScript claire et intuitive
- Replay natif pour debugging et audit
- Tracing structuré et compréhensible
- Policies simples mais efficaces
- Sécurité "deny by default" avec capabilities
- Observabilité complète de chaque décision

**Capacités Gouvernance :**
- Policies centralisées et vérifiables
- Audit trail complet pour conformité
- Visibilité sur tous les agents et leurs actions
- Contrôle des coûts et budgets
- Standardisation sans bloquer l'innovation

**Capacités Produit :**
- Comparaison de runs pour mesurer améliorations
- Tests structurés avant déploiement
- Observabilité cognitive pour comprendre comportement
- Itération rapide sans risques
- Agent comme artefact logiciel versionnable

**Capacités Opérationnelles :**
- Monitoring et alertes basés sur événements
- Simulation de scénarios "et si"
- Résolution d'incidents rapide grâce au replay
- Support simplifié grâce à standardisation

**Capacités Apprentissage :**
- Documentation claire et exemples concrets
- Apprentissage progressif des concepts
- Accessibilité pour développeurs de tous niveaux

## Innovation & Novel Patterns

### Innovation Principale #1 : Agent ≠ LLM (Changement de Paradigme)

**Nature de l'innovation :**
Ce n'est pas une feature ni une architecture, mais un nouveau modèle mental.

**Pourquoi c'est radical :**
- On change ce qu'est un agent, pas comment on l'implémente
- On justifie l'existence d'une infrastructure dédiée
- On rend obsolètes des comparaisons directes avec LangChain

**Positionnement :**
Tant que le marché pense "agent = LLM + tools", SDK_AI_Agents joue sur un autre plan : un agent est un système décisionnel gouverné, dont le LLM n'est qu'un composant.

**Validation :**
- Signal fort : l'utilisateur adopte le vocabulaire (runs, policies, replay, décisions, traces)
- Quand il ne parle plus de "prompt magique", c'est gagné

**Risque :** Complexité perçue — "c'est trop compliqué"
**Mitigation :** API simple, Quickstart ultra court, couches avancées opt-in

---

### Innovation Principale #2 : Event-Sourcing Natif Appliqué aux Agents

**Nature de l'innovation :**
Innovation concrète et démontrable, unique sur le marché.

**Capacités uniques :**
- Replay réel en 1 commande
- Audit réel complet
- Comparaison de comportements
- Testabilité native

**Pourquoi c'est décisif :**
- Immédiatement observable
- Immédiatement utile
- Extrêmement difficile à copier sans redesign complet

**Validation :**
- Signal fort : un utilisateur rejoue un incident réel
- "Sans le replay, on n'aurait jamais compris" = validation irréfutable

**Innovation implicite :** Le replay comme primitive produit
- Pas un outil de debug ou un hack
- Primitive centrale utilisable par dev, produit, QA
- Permet non-régression comportementale, amélioration continue, certification future

---

### Innovation Principale #3 : Sécurité par Impossibilité

**Nature de l'innovation :**
Innovation structurelle, invisible mais puissante.

**Propriétés structurelles :**
- Pas de tool non déclaré
- Pas d'action sans policy vérifiée
- Pas d'exécution sans trace complète

**Pourquoi c'est puissant :**
- Parle aux tech leads et aux entreprises
- Réduit drastiquement le risque perçu
- Transforme "outil IA" → "infrastructure acceptable"

**Validation :**
- Signal fort : le tech lead autorise des actions plus critiques
- Moins de "feature flags de peur"
- Moins de désactivation d'agents en prod
- Le succès est le relâchement de la peur

---

### Innovation Bonus : Observabilité Cognitive

**Nature de l'innovation :**
Moins immédiatement comprise, mais très différenciante à moyen terme.

**Capacités uniques :**
- Pas juste ce que l'agent a fait
- Mais pourquoi, sous quelles contraintes, avec quelles alternatives

**Pourquoi c'est différenciant :**
- Innovation de deuxième lecture : elle devient évidente après usage, pas au pitch
- Permet de comprendre le raisonnement, pas seulement l'exécution

**Validation :**
- Signal fort : l'utilisateur utilise les traces pour améliorer l'agent
- Pas seulement pour debug
- Quand les traces deviennent un outil produit, c'est validé

---

### Innovations Implicites

#### Innovation Implicite #1 : L'Agent comme Artefact Logiciel

**Transformation fondamentale :**
Avec SDK_AI_Agents, un agent devient :
- Versionnable
- Testable
- Comparable
- Auditable
- Déployable

**Impact :**
- Passage d'un comportement émergent à un objet logiciel industriel
- Fondamental pour CI/CD, QA, produit

#### Innovation Implicite #2 : Trust Layer pour l'IA

**Positionnement stratégique :**
SDK_AI_Agents est en réalité une couche de confiance entre l'IA et le monde réel.

**Pourquoi c'est fort :**
- Positionnement très fort, notamment B2B
- Répond au besoin de confiance opérationnelle
- Justifie l'existence d'une infrastructure dédiée

---

### Market Context & Competitive Landscape

**Positionnement concurrentiel :**

**vs LangChain :**
- LangChain : orchestration et tool calling
- SDK_AI_Agents : gouvernance native, replay natif, séparation raisonnement/action
- Différenciation : "LangChain ne peut pas faire X, Y, Z structurellement"

**vs Semantic Kernel :**
- Semantic Kernel : filtres basiques, pas d'event-sourcing
- SDK_AI_Agents : event-sourcing natif, observabilité cognitive
- Différenciation : architecture événementielle complète

**vs AutoGPT/LangGraph :**
- AutoGPT/LangGraph : focus orchestration
- SDK_AI_Agents : gouvernance native, testabilité structurée
- Différenciation : agents comme artefacts logiciels

**Avantage concurrentiel durable :**
- Architecture cohérente pensée ensemble, pas des features ajoutées
- Difficile à copier sans refonte complète
- Le modèle mental (agent ≠ chatbot) est difficile à adopter pour les concurrents

---

### Validation Approach

**Principe directeur :**
Validation par l'usage, pas par le discours.

**Métriques de validation :**

1. **Paradigme Agent ≠ LLM :**
   - Adoption du vocabulaire (runs, policies, replay, décisions, traces)
   - Abandon du vocabulaire "prompt magique"

2. **Event-sourcing / Replay :**
   - Utilisation réelle du replay pour résoudre des incidents
   - Témoignages : "Sans le replay, on n'aurait jamais compris"

3. **Sécurité by design :**
   - Autorisation d'actions plus critiques par les tech leads
   - Réduction des "feature flags de peur"
   - Réduction des désactivations d'agents en prod

4. **Observabilité cognitive :**
   - Utilisation des traces pour améliorer l'agent (pas seulement debug)
   - Traces comme outil produit

**Approche de validation :**
- Parler de problèmes concrets
- Montrer des avant / après
- Éviter le discours "philosophique" en front
- Démontrer, pas argumenter

---

### Risk Mitigation

#### Risque #1 : Complexité Perçue

**Risque :**
Le paradigme est plus riche → risque de "c'est trop compliqué" ou "j'ai juste besoin d'un agent simple"

**Mitigation :**
- API simple par défaut
- Quickstart ultra court (< 30 minutes)
- Couches avancées opt-in
- Documentation progressive par niveau

#### Risque #2 : Innovation Trop en Avance

**Risque :**
Le marché n'est pas encore totalement mûr pour ce niveau de gouvernance

**Mitigation :**
- Parler de problèmes concrets (incidents, debugging, sécurité)
- Montrer des avant / après mesurables
- Éviter le discours "philosophique" en front
- Focus sur les early adopters (tech leads, entreprises réglementées)

#### Risque #3 : Comparaison Injuste avec Frameworks Existants

**Risque :**
"Pourquoi pas LangChain + X ?"

**Mitigation :**
- Réponse clé : "Parce que LangChain ne peut pas faire X, Y, Z structurellement"
- Démontrer, pas argumenter
- Focus sur les différenciateurs concrets (replay, audit, gouvernance native)
- Cas d'usage concrets où SDK_AI_Agents est indispensable

#### Risque #4 : Adoption Lente du Nouveau Paradigme

**Risque :**
Les développeurs sont habitués au modèle "LLM + tools"

**Mitigation :**
- Migration progressive depuis frameworks existants
- Adapters pour compatibilité
- Quick wins immédiats (replay fonctionnel dès le premier run)
- ROI visible rapidement

## Developer Tool Specific Requirements

### Project-Type Overview

SDK_AI_Agents est un SDK/package TypeScript/Node.js pour développeurs backend et tech leads. C'est une infrastructure conceptuelle avant d'être multi-langages ou multi-IDE. Le MVP se concentre sur TypeScript/Node.js pour valider le paradigme avant d'étendre à d'autres langages.

**Décision stratégique clé :**
SDK_AI_Agents est d'abord une infrastructure conceptuelle avant d'être multi-langages ou multi-IDE.

### Language Support Matrix

#### MVP - TypeScript/Node.js (Priorité Absolue)

**Décision :** Support exclusif TypeScript/Node.js pour le MVP.

**Justification :**
- Écosystème dominant pour les outils agents
- DX exceptionnelle (typing, autocomplétion, ergonomie)
- Cohérent avec la cible (backend/fullstack/platform engineers)
- Accélère le feedback des early adopters

**Spécifications techniques :**
- TypeScript 5.x avec mode strict
- Node.js 20+ (LTS)
- Support ESM et CommonJS
- Type-safety complet pour toute l'API

**Aucun autre langage dans le MVP.** C'est une décision stratégique, pas un manque.

#### Post-MVP - Python

**Timing :** Après validation du paradigme et PMF.

**Justification :**
- Python est très orienté ML/recherche
- Le paradigme vise l'industrialisation, pas l'expérimentation
- Risque de dilution trop tôt

**Approche :**
- Python doit hériter du design, pas l'influencer
- Migration progressive après stabilisation de l'API TypeScript
- Support pip + poetry si nécessaire

#### Autres Langages (Go, Rust, etc.)

**Décision :** Pas à court/moyen terme.

**Justification :**
- Complexité inutile
- Faible ROI initial
- Risque de fragmentation de l'API mentale

**Envisagé uniquement si :** SDK_AI_Agents devient un standard mature.

### Installation Methods

#### MVP - npm (Standard)

**Méthode principale :**
```bash
npm install @sdk-ai-agents/core
```

**Compatibilité :**
- Compatible yarn et pnpm automatiquement (pas besoin de choix explicite)
- Ne jamais mentionner "support yarn/pnpm" : c'est implicite, pas un argument produit

**Spécifications :**
- Package publié sur npm registry
- Versioning sémantique strict
- Support des workspaces monorepo

#### Post-MVP - Python

**Méthodes :**
- pip (standard)
- poetry (si besoin)

**Timing :** Uniquement après PMF et validation du paradigme.

### API Surface

#### Principes de Design API

**API claire et typée :**
- TypeScript strict pour type-safety complet
- Autocomplétion native via types
- API minimale mais puissante

**Structure API MVP :**

**Core SDK :**
- `createSDK()` - Initialisation du SDK
- `createAgent()` - Création d'un agent
- `defineTool()` - Définition d'une capability/tool
- `agent.run()` - Exécution d'un agent

**Replay & Observabilité :**
- `sdk.replay(runId)` - Rejouer une exécution
- `sdk.compare(runId1, runId2)` - Comparer deux runs
- `sdk.getTrace(runId)` - Récupérer la trace complète

**Policies :**
- `sdk.definePolicy()` - Définition d'une policy globale
- Policies intégrées : budgets, timeouts, allowlists

**Caractéristiques API :**
- Peu de concepts, mais solides
- Type-safe, documentée, prévisible
- API stable et minimaliste

#### Documentation API

**Via TypeDoc :**
- Documentation complète générée depuis les types
- Exemples intégrés dans la documentation
- Navigation facile entre concepts

### Code Examples

#### MVP - 3 Exemples Obligatoires (Pas Plus)

**Exemple 1 - Quick Start Minimal**

**Objectif :**
- Créer un agent
- Déclarer 1 tool
- Exécuter
- Voir les events
- Rejouer

**Spécifications :**
- 1 fichier, < 100 lignes
- Fonctionnel en < 30 minutes
- Montre les concepts fondamentaux

**Exemple 2 - Cas Réel : Agent avec Action**

**Objectif :**
- Montrer le tool calling contrôlé
- Montrer les policies
- Montrer la trace

**Cas d'usage suggérés :**
- Support client automatisé
- Automation simple (API call)
- Agent avec actions réelles

**C'est là que le "moment aha" arrive.**

**Exemple 3 - Replay & Debug**

**Objectif :**
- Rejouer un incident
- Comparer deux runs
- Comprendre une décision

**Spécifications :**
- Montre le replay natif
- Montre la comparaison de runs
- Montre l'observabilité cognitive

**Cet exemple vend le produit à lui seul.**

#### Hors MVP - Exemples de Migration

**Décision :** Pas dans le MVP.

**Justification :**
- Trop tôt
- Risque de comparaison défavorable avant que le paradigme soit compris
- À ajouter post-MVP quand le paradigme est adopté

**Exemples futurs :**
- Migration depuis LangChain
- Migration depuis Semantic Kernel
- Migration depuis autres frameworks

### Documentation Structure

#### MVP - Documentation Texte + Code (Pas Marketing)

**Structure recommandée :**

**1. Quick Start (10 minutes, 10 lignes)**
- Premier agent fonctionnel rapidement
- Concepts minimaux nécessaires
- Exemple concret simple

**2. Concepts Clés**
- Agent ≠ LLM
- Event log
- Tool calling gouverné
- Replay
- Policies

**Style :** Orientée "mental model", pas "how-to magique"
- Chaque concept doit répondre à : "Pourquoi ça existe ? Quel problème ça évite ?"
- Crucial pour faire passer le changement de paradigme

**3. API Reference**
- Via TypeDoc
- Documentation complète générée depuis les types
- Exemples intégrés

**4. Guides Pratiques**
- "Ajouter un tool"
- "Activer le replay"
- "Limiter un agent"
- "Définir des policies"

**Style :**
- Pas de vidéos, pas de blabla
- Focus sur la compréhension conceptuelle
- Exemples concrets et démonstratifs

#### Post-MVP - Documentation Avancée

**À ajouter plus tard :**
- Guides de migration depuis frameworks existants
- Cas d'usage avancés
- Patterns et best practices
- Troubleshooting approfondi

### IDE Integration

#### MVP - Aucune Intégration IDE Dédiée

**Décision :** Aucune intégration IDE dans le MVP.

**Justification :**
- Trop tôt
- Faible valeur sans adoption réelle
- Détourne l'effort du core (runtime, replay, policies)

**Ce qui suffit au MVP :**
- Autocomplétion TypeScript native (via types)
- Support TypeScript standard dans VS Code/WebStorm
- Pas besoin d'extension dédiée

#### Post-MVP - VS Code Extension

**Timing :**
- Quand les concepts sont stables
- Quand l'API est figée
- Quand les utilisateurs le demandent explicitement

**Fonctionnalités pertinentes (plus tard) :**
- Inspection des traces
- Visualisation des runs
- Replay local
- Debugging intégré

### Migration Guide

#### MVP - Pas de Guide de Migration

**Décision :** Aucun guide de migration dans le MVP.

**Justification :**
- Trop tôt pour comparer avec d'autres frameworks
- Risque de comparaison défavorable avant adoption du paradigme
- Focus sur la validation du concept, pas sur la migration

#### Post-MVP - Guides de Migration

**À ajouter après PMF :**
- Migration depuis LangChain
- Migration depuis Semantic Kernel
- Migration depuis solutions maison
- Patterns de migration progressive

### Technical Architecture Considerations

#### Priorités MVP (Ordre Strict)

1. **TypeScript/Node.js** - Support exclusif
2. **API claire et typée** - Type-safety complet
3. **Documentation conceptuelle forte** - Mental model avant tout
4. **Exemples réels et démonstratifs** - 3 exemples obligatoires
5. **Replay comme feature centrale** - Killer feature du MVP

#### Post-MVP Priorités

- Python support
- VS Code extension
- UI de visualisation
- Exemples de migration

### Implementation Considerations

#### Principes d'Implémentation

**Infrastructure conceptuelle d'abord :**
- Valider le paradigme avant d'étendre
- TypeScript/Node.js comme fondation solide
- API stable avant multi-langages

**DX moderne mais prod-first :**
- Simple à utiliser, robuste par conception
- Type-safety partout
- Documentation complète mais concise

**Focus MVP :**
- Core runtime (event-sourcing, replay, policies)
- API minimale mais puissante
- Exemples démonstratifs
- Documentation conceptuelle

## Project Scoping & Phased Development

### Principes Non Négociables

Ces 5 principes servent de garde-fou produit, de filtre de scope et de boussole pour toutes les décisions futures.

**Principe #1 : Toute action est un événement**
- Chaque action de l'agent génère un événement structuré
- L'event log est la source de vérité unique
- Sans événement, pas de traçabilité, pas de replay, pas de différenciation

**Principe #2 : Aucune action sans policy**
- Toute action doit passer par une policy vérifiée
- Sécurité "deny by default" : tout est interdit sauf ce qui est explicitement autorisé
- Pas de tool sans déclaration, pas d'action sans validation

**Principe #3 : Le LLM ne provoque jamais d'effet de bord**
- Le LLM génère des intentions structurées, jamais d'actions directes
- Séparation stricte raisonnement/action : Reasoning Engine ≠ Action Engine
- Toutes les actions passent par un Action Engine gouverné

**Principe #4 : Le replay doit être possible sans LLM**
- Replay natif à partir des événements uniquement
- Pas besoin de recontacter le LLM pour rejouer
- Même séquence, mêmes tool calls, déterminisme relatif

**Principe #5 : La sécurité est deny-by-default**
- Sécurité par impossibilité, pas par configuration
- Propriété structurelle, pas feature optionnelle
- Pas d'exécution sans trace complète

**Utilisation de ces principes :**
- Garde-fou contre la dilution du scope
- Filtre pour évaluer toute nouvelle feature
- Boussole pour les décisions architecturales
- Validation de cohérence du produit

### MVP Strategy & Philosophy

**Approche MVP :** Problem-Solving MVP avec architecture de Platform

**Justification :**
- Résout un problème critique : comprendre, rejouer et sécuriser un agent en production
- Pose une fondation irréversible pour l'expansion future
- Équilibre entre valeur immédiate et architecture durable

**Objectif MVP :**
Démontrer : "Je peux comprendre, rejouer et sécuriser le comportement de mon agent."

**Critères de sortie MVP :**
1. Replay fonctionnel : 100% des runs rejouables
2. Tracing compréhensible : > 80% utilisateurs comprennent traces
3. Policies actives : > 60% projets avec policies
4. Time-to-first-agent : < 30 minutes

### MVP Feature Set (Phase 1)

#### Must-Have MVP (Non Négociables)

**1. Runtime Événementiel (CORE)**
- **Pourquoi must-have :** Sans ça → pas de replay, pas de différenciation
- **Spécifications :**
  - Exécuter un agent via une boucle simple (max steps)
  - Émettre des événements structurés à chaque étape
  - Persister ces événements (in-memory + file)
  - Event schema minimal, 1 projection simple, pas de DSL

**2. Replay Fonctionnel**
- **Pourquoi must-have :** Killer feature, preuve immédiate
- **Spécifications :**
  - Rejouer un run à partir des events
  - Sans recontacter le LLM (mode "replay")
  - Même séquence, mêmes tool calls
  - Déterminisme relatif

**3. Tool Calling Contrôlé**
- **Pourquoi must-have :** Cœur du risque réel
- **Spécifications :**
  - Définition explicite des tools (`defineTool`)
  - Validation des inputs (Zod / schema)
  - Tool registry avec allowlist
  - Tool call visible dans les events

**4. Policies Simples mais Actives**
- **Pourquoi must-have :** Gouvernance réelle, pas décorative
- **Spécifications :**
  - Allowlist tools (deny by default)
  - Budget max (tokens ou steps)
  - Timeout / max steps
  - Policies réellement appliquées, pas cosmétiques

**5. Tracing Structuré**
- **Pourquoi must-have :** Compréhension humaine, pas debug à l'aveugle
- **Spécifications :**
  - Traces lisibles (JSON structuré)
  - Chaque run a un `runId`
  - Chaque décision, tool call, erreur est tracée
  - Export possible (console + fichier)

**Si un seul de ces éléments manque, le MVP ne valide pas la promesse centrale.**

#### Core User Journeys Supported (MVP)

**Journeys essentiels pour MVP :**
1. **Alex (Développeur)** - Premier agent en production avec replay
2. **Sarah (Tech Lead)** - Gouvernance organisationnelle avec policies
3. **Jordan (Product Engineer)** - Itération produit avec comparaison de runs

### Post-MVP Features

#### Phase 2 - Production-Ready (3-4 mois post-MVP)

**Features :**
- Policies avancées (approval humaine, budgets complexes)
- Observabilité cognitive (graphe raisonnement)
- Capabilities system complet
- Multi-providers LLM (Anthropic, autres)
- Event Store SQL-based (scalabilité)
- Performance optimizations

#### Phase 3 - Advanced Features (6-12 mois)

**Features :**
- Mémoire causale et temporelle
- Time travel debugging
- Multi-agent orchestration
- Conformité sectorielle (finance, santé)
- Event Store distribué (Kafka-style)
- Observabilité cognitive complète

#### Phase 4 - Platform (12-24 mois)

**Features :**
- Marketplace de plugins
- UI/Dashboard web
- Support multi-langages (Python)
- Écosystème et communauté
- Intégrations cloud providers
- Outils développeurs avancés (CLI, extensions IDE)

### Risk Mitigation Strategy

#### Risque #1 : Adoption du Nouveau Paradigme (LE PLUS CRITIQUE)

**Risque :**
"Agent ≠ LLM" est une force… et un risque. Incompréhension possible, rejet par habitude, comparaison injuste avec LangChain.

**Mitigation MVP (Indispensable) :**
- API simple malgré le core complexe
- Quickstart qui fonctionne sans expliquer toute la philosophie
- Exemples orientés avant / après, pas "théorie"
- Documentation conceptuelle mais accessible

**Critère de succès :**
👉 **Si l'utilisateur n'atteint pas le replay en 10 minutes, tu perds.**

#### Risque #2 : Complexité de l'Architecture Événementielle

**Risque :**
Sur-design possible, tentation d'abstraction prématurée.

**Mitigation MVP :**
- Event schema minimal
- 1 projection simple
- Pas de DSL
- Pas de config magique
- L'event-sourcing doit être invisible côté utilisateur

#### Risque #3 : Performance de l'Event-Sourcing

**Risque :**
Performance de l'event-sourcing (risque secondaire au MVP).

**Mitigation MVP :**
- Event store in-memory / file (simple)
- Pas d'optimisation prématurée
- Les appels LLM et tools dominent le coût
- Le replay est offline / async

**Classement des risques (ordre réel) :**
1. ❗ **Adoption du paradigme** (critique)
2. ⚠️ **Complexité interne** (maîtrisable)
3. 🟡 **Performance** (non bloquant MVP)

### Resource Requirements

#### MVP Team Size & Skills

**Équipe minimale recommandée :**
- 1-2 développeurs backend TypeScript (full-time)
- 1 architecte (part-time)
- 1 expert sécurité (consultant)

**Compétences requises :**
- TypeScript/Node.js avancé
- Event-sourcing et CQRS patterns
- Architecture distribuée
- LLM integration et optimization
- Sécurité et gouvernance

**Timeline MVP :**
- 2-3 mois pour MVP fonctionnel
- Focus sur validation du paradigme

### Success Gates & Decision Points

#### Gate 1 : MVP Validation (Mois 3)

**Critères de validation :**
- ✅ Replay fonctionnel : 100% des runs rejouables
- ✅ Tracing compréhensible : > 80% utilisateurs comprennent traces
- ✅ Policies actives : > 60% projets avec policies
- ✅ Time-to-first-agent : < 30 minutes
- ✅ ≥ 3 équipes utilisent le SDK en production
- ✅ ≥ 1 incident réel rejoué et compris

**Décision :**
- Si critères atteints → Proceed avec Phase 2
- Si critères non atteints → Itérer sur MVP, pas ajouter features

#### Gate 2 : Production-Ready (Mois 7)

**Critères de validation :**
- ✅ > 10 projets en production
- ✅ > 70% adoption features gouvernance
- ✅ -60% réduction incidents
- ✅ Feedback utilisateur positif

**Décision :**
- Si critères atteints → Proceed avec Phase 3
- Si critères non atteints → Itérer sur Phase 2

#### Gate 3 : Traction Réelle (Mois 12)

**Critères de validation :**
- ✅ > 100 projets actifs
- ✅ > 80% rétention équipes
- ✅ Adoption entreprises réglementées
- ✅ Communauté active

**Décision :**
- Si critères atteints → Proceed avec Phase 4 (Platform)
- Si critères non atteints → Focus sur adoption et amélioration

## Functional Requirements

### Segmentation MVP vs Post-MVP

**Principe directeur :**
Le MVP doit être jugé sur ≈ 5 promesses fondamentales, pas sur 78 FR. Ces 5 promesses sont :
1. Je peux créer un agent simplement
2. Je peux contrôler ce qu'il a le droit de faire
3. Je peux voir exactement ce qu'il a fait
4. Je peux rejouer ce qui s'est passé
5. Je peux expliquer un incident

**Tout le reste est accélérateur, pas fondation.**

### Agent Lifecycle Management

**FR1:** Un développeur peut créer un agent avec une configuration minimale
**FR2:** Un développeur peut initialiser un SDK avec des paramètres de base
**FR3:** Un développeur peut démarrer l'exécution d'un agent avec un input initial
**FR4:** Un développeur peut arrêter une exécution en cours
**FR5:** Un développeur peut arrêter une exécution à partir de son runId
**FR6:** Un développeur peut configurer un agent avec des capabilities spécifiques
**FR7:** Un développeur peut définir des contraintes d'exécution (max steps, timeout)

### Tool & Capability Management

**FR8:** Un développeur peut définir un tool avec un schéma de validation
**FR9:** Un développeur peut déclarer explicitement les tools disponibles pour un agent
**FR10:** Un développeur peut valider les inputs d'un tool avant exécution
**FR11:** Un développeur peut restreindre les tools autorisés via allowlist
**FR12:** Un développeur peut organiser les tools en capabilities logiques
**FR13:** Un développeur peut réutiliser des tools entre plusieurs agents
**FR14:** Un développeur peut versionner des tools indépendamment
**FR15:** Le système empêche l'exécution d'un tool non déclaré (deny by default)

### Policies & Governance

**FR16:** Un développeur peut définir une policy globale qui s'applique à tous les agents
**FR17:** Un développeur peut définir une policy spécifique à un agent
**FR18:** Un développeur peut définir un budget maximum (tokens ou steps) pour un agent
**FR19:** Un développeur peut définir un timeout pour une exécution
**FR20:** Un développeur peut définir une allowlist de tools autorisés
**FR21:** Le système applique automatiquement les policies avant chaque action
**FR22:** Le système bloque une action si elle viole une policy
**FR23:** Un développeur peut consulter les policies appliquées à une exécution
**FR24:** Le système trace chaque vérification de policy dans les événements

### Runtime - Séparation Raisonnement/Action

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

### Tracing & Observabilité

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

### Replay & Comparaison

**FR46:** Un développeur peut rejouer une exécution complète à partir de son runId
**FR47:** Le replay fonctionne sans recontacter le LLM (mode replay)
**FR48:** Le replay reproduit la même séquence d'actions et tool calls
**FR49:** Un développeur peut comparer deux exécutions pour identifier les différences *(Post-MVP)*
**FR50:** Un développeur peut rejouer une exécution avec des modifications de contexte
**FR51:** Un développeur peut tester des scénarios "et si" en rejouant avec des paramètres différents
**FR52:** Le système garantit la reproductibilité relative des replays
**FR53:** Un développeur peut utiliser le replay pour déboguer un incident
**FR54:** Un développeur peut analyser l'impact d'un changement avant/après déploiement *(Post-MVP)*

### Event Sourcing & Persistence

**FR55:** Le système persiste tous les événements d'une exécution
**FR56:** L'event log est la source de vérité unique pour une exécution
**FR57:** Un développeur peut reconstruire l'état complet d'une exécution à partir des événements
**FR58:** Le système persiste les événements au minimum en mémoire et fichier
**FR59:** Un développeur peut exporter l'event log complet d'une exécution
**FR60:** Le système garantit qu'aucun événement n'est perdu pendant une exécution
**FR61:** Un développeur peut interroger les événements par runId
**FR62:** Le système peut filtrer les événements par type ou critère

### Testing & Quality Assurance

**FR63:** Un développeur peut filtrer les événements par critères avancés *(Post-MVP)*
**FR64:** Un développeur peut créer des tests basés sur des traces (golden traces)
**FR65:** Un développeur peut valider qu'un agent se comporte de manière attendue via replay
**FR66:** Un développeur peut détecter des régressions en comparant des traces
**FR67:** Un développeur peut exécuter des tests de non-régression sur des agents
**FR68:** Le système supporte l'intégration de tests dans un pipeline CI/CD
**FR69:** Un développeur peut définir des assertions sur le comportement d'un agent

### Developer Experience & Quick Start

**FR70:** Un développeur peut créer son premier agent fonctionnel en moins de 30 minutes
**FR71:** Un développeur peut utiliser le SDK avec une API minimale (< 10 lignes pour Quick Start)
**FR72:** L'API est entièrement typée avec TypeScript (type-safety complet)
**FR73:** Un développeur peut comprendre les concepts clés via la documentation
**FR74:** Le SDK fournit au moins un exemple complet fonctionnel
**FR75:** Un développeur peut installer le SDK via npm avec une seule commande

### Run Lifecycle Management

**FR76:** Le système peut exposer l'état courant d'une exécution (pending, running, completed, failed, cancelled)
**FR77:** Un développeur peut interroger l'état d'un run à partir de son runId

### Versioning & Audit

**FR78:** Un développeur peut associer une version (ou hash de configuration) à un agent ou à une exécution

### MVP Scope Summary

#### 🟢 MVP - Must-Have Absolus (≈ 40 FR)

Ces FR doivent fonctionner parfaitement, sans compromis :

**Agent lifecycle basique:** FR1-FR7
**Tool & capability management:** FR8-FR15
**Policies simples mais actives:** FR16-FR24
**Runtime séparation raisonnement/action:** FR25-FR34
**Tracing structuré lisible:** FR35-FR40, FR41-FR42
**Replay fonctionnel sans LLM:** FR46-FR48, FR50-FR53
**Event sourcing comme source de vérité:** FR55-FR62
**DX minimale + Quick Start:** FR70-FR75
**Run lifecycle management:** FR76-FR77
**Versioning basique:** FR78

👉 **Si ces FR sont solides → le MVP est validé.**

#### 🟡 Post-MVP (Phase 1.5 / V1)

Ces FR sont extrêmement puissants, mais peuvent venir ensuite :

**Observabilité cognitive avancée:** FR43-FR45
**Comparaison détaillée:** FR49, FR54
**Filtrage avancé d'événements:** FR63
**Testing avancé, golden traces à grande échelle:** FR64-FR69

👉 **Ils transforment le SDK en plateforme mature, mais ne sont pas requis pour prouver la valeur.**

### Validation Checklist

**Checklist de validation (honnête et exacte) :**

✔️ Toutes les capacités du MVP sont couvertes
✔️ Les user journeys critiques sont bien adressés
✔️ Les innovations clés ne sont pas "marketing", mais fonctionnelles
✔️ Les principes non négociables sont respectés structurellement
✔️ La liste est implementation-agnostic (excellent point)

👉 **Ce document est déjà un socle d'architecture, pas juste une liste de features.**

