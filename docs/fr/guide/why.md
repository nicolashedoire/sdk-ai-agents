# Pourquoi ce SDK

**En une phrase :** la plupart des frameworks d'agents aident un modèle de langage à **agir** ; ce SDK l'oblige à **justifier ce qu'il croit** avant de conclure, et peut le faire **raisonner comme le fait une personne donnée**.

Cette page est volontairement honnête : elle dit ce que le SDK fait et que vous ne trouverez pas facilement ailleurs, ce que les autres frameworks font aussi, et ce qu'ils font mieux. La comparaison s'appuie sur la documentation de frameworks largement utilisés à la mi-2026 (LangChain et LangGraph, l'OpenAI Agents SDK, le Vercel AI SDK, CrewAI, AutoGen et son successeur Microsoft Agent Framework, Mastra, DSPy) ; ils évoluent vite, alors consultez leur documentation à jour avant de décider.

## Ce qu'il fait différemment {#what-it-does-differently}

### 1. Des règles de raisonnement écrites dans le code, pas dans le prompt {#_1-reasoning-rules-written-in-code-not-in-the-prompt}

Dans un agent habituel, le « raisonnement » est ce que le modèle écrit : s'il dit être sûr à 90 %, rien ne le vérifie, à moins que vous n'écriviez vous-même cette vérification. Ici :

- l'[état mental](./cognitive-agents#the-mental-state) (faits, hypothèses, prédictions, contradictions) est constitué de données typées, pas de texte libre ;
- le modèle ne peut pas augmenter sa propre confiance : la confiance d'une décision est plafonnée au soutien que les preuves apportent à l'option choisie, jugé lors d'une étape de comparaison distincte (par Jev sans le profil du penseur, ou par le modèle de langage selon ses instructions) ;
- une hypothèse rejetée ne peut pas être sélectionnée, mise à jour ni reformulée ; elle ne peut revenir que sous la forme d'une variante qui dit ce qui a changé (une reformulation avec d'autres mots n'est pas détectée) ;
- une réponse n'est retenue comme **ferme** (`committed`) que si elle passe le [garde-fou de conclusion](./evidence-and-verification#the-conclusion-guard) : critiquée, évaluée depuis la dernière preuve nouvelle, sans contradiction qui la concerne, avec des prédictions testées tant que le budget le permet, et un soutien suffisant. Sinon, l'agent répond **provisoire** (`provisional`), en indiquant ce qui manque, ou **s'abstient** (`abstain`).

« Je ne peux pas conclure » est une issue à part entière, imposée par le code plutôt que demandée dans un prompt.

### 2. C'est le monde qui vérifie les prédictions, pas le modèle {#_2-the-world-checks-the-predictions-not-the-model}

Une pratique courante consiste à faire juger un modèle par un autre. Ici, l'agent énonce **avant** le test ce qu'il devrait observer et ce qui prouverait qu'il a tort, et c'est **votre code** qui tranche : une mesure, un simulateur, une suite de tests, une requête. Une règle réfutée est rejetée, et ne peut revenir que sous la forme d'une variante qui énonce sa différence. Voir [Les prédictions et l'évaluateur de résultats](./evidence-and-verification#predictions-and-the-outcome-evaluator).

Ce que les tests ont répondu est conservé pour les exécutions suivantes du même périmètre : l'exécution suivante démarre avec les règles qui ont tenu et ne peut pas reformuler mot pour mot une règle qui a échoué. Les produits de mémoire retiennent ce qui a été dit ; cette [mémoire entre exécutions](./memory) ne conserve que ce qu'un test a répondu.

### 3. Les preuves et les préférences sont tenues à l'écart l'une de l'autre {#_3-evidence-and-preferences-are-kept-apart}

Ce que le penseur préfère peut changer **l'action choisie**, et permettre qu'une action qu'il préfère clairement soit retenue comme ferme sur la base de preuves plausibles ; dans le code, cela ne rend jamais plus crédible une **affirmation sur le monde**. Avec Jev, la question sur les preuves est même envoyée sans le profil du penseur ; avec un juge qui est un modèle de langage, cette séparation repose sur ses instructions. Voir [Les preuves ne sont pas des préférences](./evidence-and-verification#evidence-is-not-preference).

### 4. Raisonner comme une personne donnée, et le mesurer {#_4-reasoning-like-a-given-person-and-measuring-it}

Les produits de mémoire stockent surtout des faits et des préférences sur un utilisateur (certains réécrivent aussi des instructions à partir des retours) ; les optimiseurs de prompts comme DSPy ajustent des prompts et des exemples en fonction d'une métrique. Ce SDK extrait **la façon dont** une personne raisonne : l'ordre dans lequel elle examine un problème, ses réflexes, ce qui lui fait rejeter une idée. Il versionne ce [profil de penseur](./thinker-profiles), l'inscrit dans chaque étape de raisonnement, ajoute à ses instructions les corrections de la personne, avec un pourcentage d'accord, et exporte les choix d'étape suivante de l'agent, étiquetés avec le verdict de la personne sur chaque exécution, sous forme de jeu de données pour entraîner un petit contrôleur.

### 5. Des décisions calibrées au cœur du raisonnement {#_5-calibrated-decisions-inside-the-reasoning}

[Jev](./typed-decisions) répond à des questions étroites par des probabilités que son éditeur calibre. Il choisit l'étape de raisonnement suivante et note les hypothèses pour une fraction de centime, et un contrôleur déterministe prend le relais quand il n'est pas sûr de lui.

### 6. Un seul journal pour le raisonnement et les actions {#_6-one-log-for-reasoning-and-actions}

Les outils gouvernés, les approbations, les coûts, les nouvelles tentatives et les appels MCP sont enregistrés dans le même journal d'événements que chaque pensée. Vous pouvez reconstruire exactement ce que l'agent « avait en tête » derrière n'importe quelle réponse, des mois plus tard, et rejouer ses actions sans appeler le modèle.

## Ce que les autres frameworks font aussi {#what-other-frameworks-also-do}

- **Outils gouvernés et approbation humaine.** Les *guardrails* de l'OpenAI Agents SDK, le *human-in-the-loop* de LangGraph.
- **Persistance et rejeu.** Les points de contrôle (*checkpoints*) de LangGraph permettent de reprendre, d'inspecter, et de rejouer ou de bifurquer à partir d'états passés.
- **MCP**, le suivi des coûts et les nouvelles tentatives sont largement disponibles.

La différence ici, c'est que ces éléments partagent un seul journal d'événements avec un état de raisonnement explicite.

## Ce que les autres frameworks font mieux {#what-other-frameworks-do-better}

- **L'écosystème.** Des centaines d'intégrations, de grandes communautés, des exemples pour tout.
- **La maturité.** Ce SDK est jeune, n'a qu'un seul mainteneur, n'est pas encore publié sur npm, et n'a été essayé que sur un nombre limité de problèmes réels.
- **L'orchestration multi-agents, le streaming et les kits d'interface** sont plus riches ailleurs.
- **Le coût et la latence.** Une réponse cognitive demande une dizaine d'étapes de raisonnement, chacune avec une ou deux requêtes au modèle (avec gpt-4o et Jev, quelques minutes et environ 0,1 USD par problème lors de nos essais), là où une réponse directe demande un seul appel et un agent utilisant des outils, quelques-uns.
- **La dépendance au modèle.** Les règles tiennent quel que soit le modèle, mais pas la qualité du raisonnement : les petits modèles suivent mal la méthode, et même les modèles puissants finissent souvent sur une réponse provisoire ou une abstention face à des problèmes difficiles.
- **La mémoire et la recherche documentaire.** Les produits de mémoire et les chaînes de recherche documentaire offrent une recherche sémantique sur de grandes collections ; ici, la [mémoire entre exécutions](./memory) rappelle des règles testées par correspondance de mots, au sein d'un périmètre étroit.

## Quand le choisir {#when-to-choose-it}

- **Les décisions que vous devez justifier ou auditer** : recherche, industrie, gouvernance interne, et aide à la décision dans des domaines réglementés (santé, finance, droit) où une personne examine la conclusion et ce sur quoi elle repose.
- **Quand « je ne sais pas » vaut mieux qu'une invention assurée**, et que vous voulez que ce soit imposé.
- **Quand une affirmation peut être vérifiée** : vous disposez d'une mesure, d'un simulateur ou d'une suite de tests auxquels l'agent peut confronter ses prédictions.
- **Un jumeau de raisonnement** : saisir la façon dont un expert ou un fondateur aborde les problèmes, et mesurer à quel point l'imitation s'en approche.

Quand vous avez besoin d'un chatbot rapide, d'un large catalogue d'intégrations prêtes à l'emploi ou d'un seul appel rapide, un framework plus léger convient mieux.
