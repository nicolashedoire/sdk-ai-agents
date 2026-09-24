# Les termes clés expliqués simplement

Tous les termes employés dans cette documentation, expliqués sans jargon, avec un lien vers la page qui les détaille. Chaque terme est donné en français, suivi entre parenthèses du terme anglais quand l'API utilise le mot anglais. Les termes sont regroupés par thème ; utilisez le champ de recherche (<kbd>/</kbd>) pour accéder directement à l'un d'eux.

## Les bases {#the-basics}

| Terme | En termes simples |
| --- | --- |
| **SDK** | Une boîte à outils pour les développeurs : du code que vous ajoutez à votre propre application au lieu de tout écrire vous-même. Celui-ci est écrit en TypeScript ; il n'est pas encore publié sur npm et s'installe depuis GitHub (voir [Premiers pas](./getting-started)). |
| **Modèle de langage** (LLM, *large language model*) | L'IA qui lit et écrit du texte (GPT-4o, Claude…). Ici, c'est un composant parmi d'autres : il propose, le SDK vérifie et décide de ce qui est autorisé. |
| **Prompt** | Les instructions textuelles envoyées à un modèle de langage avec chaque requête. |
| **Token** (jeton) | Un morceau de mot. Les fournisseurs de modèles facturent au token lu et écrit, c'est pourquoi les [coûts](./costs) se comptent en tokens. |
| **Agent** | Un programme qui utilise un modèle de langage pour atteindre un objectif, étape par étape. Le SDK en propose deux sortes : les [agents gouvernés](./governed-agents), qui agissent avec des outils, et les [agents cognitifs](./cognitive-agents), qui raisonnent avant de conclure. |
| **Exécution** (*run*) | Une exécution d'un agent sur un problème, du début à la fin. Elle a un identifiant (`runId`) qui vous sert à la lire, à la rejouer ou à en calculer le coût. |
| **Outil** (*tool*) | Une fonction que votre code confie à un agent (lire une base de données, envoyer un e-mail…). L'agent ne peut utiliser que les outils qui lui ont été explicitement donnés. Voir [Concepts fondamentaux](./concepts#_2-tool). |
| **Capacité** (*capability*) | Un groupe nommé d'outils que vous pouvez donner à plusieurs agents à la fois. |
| **Politique** (*policy*) | Une règle vérifiée **avant** chaque action : un budget, un délai maximal, une liste d'outils autorisés, ou votre propre vérification. |
| **Approbation** (*approval*) | Une pause avant une action risquée, jusqu'à ce qu'un humain dise oui. Une politique peut la demander, ou l'outil lui-même (`requiresApproval`) ; si l'appelant abandonne avant, l'action ne s'exécute jamais. |
| **Intention** | Ce que le modèle d'un agent gouverné *veut* faire (appeler un outil, répondre…), consigné mais pas exécuté : le SDK la valide d'abord. |
| **Schéma** (*schema*, Zod) | Une description précise de la forme que doivent avoir des données. Les appels d'outils et les réponses structurées des étapes de raisonnement sont vérifiés par rapport à un schéma ; une réponse qui n'y correspond pas est refusée. |
| **JSON** | Un format texte simple pour les données structurées. Les profils, les événements et les réponses des modèles sont en JSON. |

## Traçabilité {#traceability}

| Terme | En termes simples |
| --- | --- |
| **Événement** (*event*) | Une ligne du journal de bord : « ceci s'est produit, à tel moment ». Chaque étape de chaque exécution est enregistrée comme un événement. Voir le [catalogue des événements](../reference/events). |
| **Magasin d'événements** (*event store*) | L'endroit où le journal de bord est conservé : un dossier de fichiers, SQLite ou PostgreSQL. |
| **Event sourcing** | La règle selon laquelle le journal de bord fait foi : l'état d'une exécution, y compris son état mental, est reconstruit en relisant ses événements, jamais stocké à part. C'est ce qui rend chaque exécution auditable des mois plus tard. Un profil de penseur fait exception : les événements n'enregistrent que son identifiant et sa version, donc sauvegardez le profil lui-même. |
| **Trace** | Tous les événements d'une exécution, dans l'ordre. |
| **Rejeu** (*replay*) | Relancer une exécution enregistrée à partir de ses événements : les actions qu'elle avait décidées sont exécutées de nouveau, en passant par les mêmes politiques, sans réinterroger le modèle de langage. Utile pour auditer une exécution ou pour tester un scénario « et si » après avoir modifié une politique. Voir [Traçabilité et rejeu](./observability). |
| **Trace de référence** (*golden trace*) | Une bonne exécution que vous conservez comme référence ; les nouvelles exécutions sont comparées à elle, si bien qu'un changement de comportement est détecté comme un test qui échoue. |

## Comment raisonne un agent cognitif {#how-a-cognitive-agent-reasons}

| Terme | En termes simples |
| --- | --- |
| **État mental** (*mental state*) | Tout ce que l'agent « a en tête » à un moment donné à propos du problème, consigné sous forme de données : ce qu'il a observé, ce qu'il sait, ce qu'il suppose, ce qu'il ignore, et les options qu'il envisage. Voir [l'état mental](./cognitive-agents#the-mental-state). |
| **Observation** (`O1`…) | Quelque chose de constaté : une mesure ou un document que vous avez fourni avec le problème, le résultat d'un outil ou le résultat d'un test. |
| **Fait** (*fact*, `F1`…) | Une affirmation que l'agent tient pour vraie, avec son origine. Un fait n'est jamais supprimé : il est *retiré* (*retracted*) ou *remplacé* (*superseded*), avec la raison. |
| **Supposition** (*assumption*, `A1`…) | Ce que le raisonnement tient pour acquis sans preuve. |
| **Contrainte** (*constraint*, `K1`…) | Ce que toute réponse doit respecter (« avant le 4e trimestre », « moins de 10 000 EUR »). |
| **Inconnue** (*unknown*, `U1`…) | Une question ouverte. Elle peut être *résolue* (*resolved* : on y a répondu) ou *abandonnée* (*dropped* : aucun moyen d'y répondre). |
| **Hypothèse** (*hypothesis*, `H1`…) | Une option à l'étude. Elle est de l'un de ces trois types : une **proposition** (*proposal* : un choix d'action, « décliner le poste »), une **règle** (*rule* : une régularité, « le temps de roulement ne dépend pas de la masse ») ou une **explication** (*explanation* : une cause). |
| **Induction, abduction, déduction** | Trois façons d'aboutir à une hypothèse : de cas répétés à une règle ; d'une surprise à sa cause la plus probable ; d'une règle à ce qui doit s'ensuivre. L'étiquette est déclarée, elle ne rend pas l'affirmation vraie. |
| **Opération** (*operation*) | Un mouvement de raisonnement : représenter le problème, formuler des hypothèses, simuler, critiquer, comparer, décider… Il y en a dix. Voir [les opérations](./cognitive-agents#the-operations). |
| **Contrôleur** (*controller*) | Ce qui choisit l'opération suivante. Le contrôleur **heuristique** suit un ordre fixe, gratuit et prévisible ; le contrôleur **typé** interroge Jev à chaque étape. |
| **Patch de pensée** (*thought patch*) | Ce qu'une opération a modifié dans l'état mental, enregistré sous la forme d'un événement. L'état mental est l'ensemble des patchs appliqués dans l'ordre. |
| **Simulation** | Imaginer ce qui se passerait si une hypothèse était vraie : les effets immédiats, puis les effets indirects. |
| **Critique** | L'agent qui attaque sa propre option : la raison la plus forte pour laquelle elle pourrait échouer. Une critique **fatale** (*fatal*) restée sans réponse rejette l'option. |
| **Contradiction** (`C1`…) | Deux choses qui ne peuvent pas être vraies en même temps. Elle reste ouverte jusqu'à ce qu'on la tranche en citant les observations ou les faits qui la tranchent. |
| **Variante** (*variant*) | Une version corrigée d'une hypothèse que les preuves ont contredite, avec un périmètre plus étroit ou une condition ajoutée, et une phrase qui dit ce qui a changé. |
| **Limites** (*limits*) | Le budget d'une exécution : nombre d'étapes, temps, appels d'outils, tests, et les seuils pour conclure. Voir [Limites](./cognitive-agents#limits). |

## Preuves et conclusions {#evidence-and-conclusions}

| Terme | En termes simples |
| --- | --- |
| **Provenance** | L'origine d'un élément de preuve : fourni par vous, renvoyé par un outil ou mesuré par un test, avec l'événement qui en contient l'original. |
| **Groupe d'origine** (`originGroup`) | Une étiquette qui signifie « même source ». Deux observations de même origine ne sont pas deux confirmations indépendantes. |
| **Doublon** (*duplicate*) | Le même contenu, de la même origine, vu une nouvelle fois. Il n'ajoute aucun poids. |
| **Prédiction** (*prediction*, `P1`…) | Ce qu'on devrait observer si une hypothèse est juste, enregistré **avant** de la tester. |
| **Falsificateur** (*falsifier*) | L'observation qui prouverait que l'hypothèse est fausse. Une affirmation dont on ne peut pas prouver la fausseté ne peut pas être testée. |
| **Connaissance** (*knowledge*, `M1`…) | Ce que des exécutions antérieures ont établi par de vrais tests, rappelé au début d'une exécution : *vérifiée* (*verified*), *réfutée* (*refuted*), ou *contestée* (*contested*) quand les tests divergent. Voir [Mémoire entre exécutions](./memory). |
| **Périmètre** (*scope*) | La frontière d'une mémoire : les exécutions ne partagent ce qu'elles ont appris qu'au sein d'un même périmètre, par exemple un banc d'essai ou un produit. |
| **Évaluateur de résultats** (*outcome evaluator*) | Votre code, qui confronte une prédiction au monde réel (une mesure, un simulateur, une suite de tests) et répond *confirmée* (*confirmed*), *réfutée* (*refuted*) ou *non concluante* (*inconclusive*). Le modèle de langage ne note jamais ses propres prédictions. Voir [Prédictions](./evidence-and-verification#predictions-and-the-outcome-evaluator). |
| **Soutien** (*support*) | À quel point les preuves appuient une hypothèse, de 0 (réfutée) à 1 (établie). C'est un jugement, pas une probabilité mesurée. Le code n'y mêle jamais les préférences ; avec un juge qui est un modèle de langage, cela repose sur ses instructions (voir [Les preuves ne sont pas des préférences](./evidence-and-verification#evidence-is-not-preference)). |
| **Adéquation aux préférences** (`preferenceFit`) | À quel point un choix d'action convient au penseur, de 0 (il remplit l'un de ses critères de rejet) à 1 (idéal). Seuls les choix d'action en reçoivent une. |
| **Classement** (*ranking*) | L'ordre des options. Les affirmations sont classées d'après leur seul soutien ; les choix d'action, par défaut, à 60 % d'après le soutien et à 40 % d'après l'adéquation aux préférences. |
| **Périmée** (*stale*) | Se dit d'une évaluation faite avant le dernier changement des preuves. Elle doit être refaite avant de conclure. |
| **Garde-fou de conclusion** (*conclusion guard*) | Les vérifications, écrites en code, qu'une réponse doit passer pour être retenue comme ferme : avoir été critiquée, avoir été évaluée depuis la dernière preuve nouvelle, n'être concernée par aucune contradiction ouverte, n'avoir aucune prédiction non testée tant qu'il reste des tests dans le budget, et avoir un soutien suffisant. Voir [Le garde-fou de conclusion](./evidence-and-verification#the-conclusion-guard). |
| **Seuil de décision** (*decision threshold*) | Le soutien dont une réponse ferme a besoin : 0,75 par défaut, « fortement soutenue ». Un choix d'action que le penseur préfère clairement n'a besoin que de 0,35. |
| **Ferme** (*committed*) | Une réponse sur laquelle l'agent s'engage, parce qu'elle a passé le garde-fou de conclusion. |
| **Provisoire** (*provisional*) | La meilleure réponse disponible quand le budget a été épuisé, avec la liste de ce qui n'est pas encore établi (`missing`). |
| **Abstention** (*abstain*) | « Je ne peux pas conclure », avec les raisons. Une issue valable, pas une erreur. |
| **Confiance** (*confidence*) | À quel point la décision est sûre ; jamais plus élevée que le soutien que les preuves apportent à l'option choisie. |

## Imiter le raisonnement d'une personne {#imitating-a-person-s-reasoning}

| Terme | En termes simples |
| --- | --- |
| **Profil de penseur** (*thinker profile*) | Une description de **la façon dont** une personne donnée raisonne : l'ordre dans lequel elle examine un problème, ses priorités, ses réflexes, ses critères de rejet et son appétence pour le risque. Il est inscrit dans les instructions de chaque étape de raisonnement ; c'est ainsi que l'agent imite le raisonnement de cette personne. Voir [Profils de penseur](./thinker-profiles). |
| **Échantillon** (*sample*) | Un sujet que la personne a expliqué avec ses propres mots : le sujet, la façon dont elle a raisonné, ce qu'elle a conclu. |
| **Distiller** (*distill*) | Extraire un profil à partir d'échantillons : trouver ce qui se répète dans la façon de raisonner de la personne, d'un sujet à l'autre. |
| **Ordre d'attention** (`reasoningSequence`) | Les étapes par lesquelles passe la personne, dans l'ordre. |
| **Heuristique** (*heuristic*) | Un réflexe, écrit sous la forme « quand …, alors … ». |
| **Critère de rejet** (*rejection criterion*) | Une raison pour laquelle la personne abandonne une idée. |
| **Verdict** | Le jugement de la personne sur une exécution : `match` (il a raisonné comme moi), `partial` ou `mismatch`. |
| **Degré d'accord** (*agreement*) | La part d'une exécution avec laquelle la personne est d'accord, de 0 à 1 : `0.8` signifie « juste à 80 % ». C'est ainsi que vous mesurez à quel point l'imitation s'approche de la personne. |
| **Exemple de calibrage** (*calibration example*) | Une exécution que la personne a validée, montrée au modèle comme une réponse modèle. |
| **Correction** | Une leçon tirée d'une exécution avec laquelle la personne était en désaccord, montrée au modèle comme sa priorité la plus haute. |

## Décisions typées et connecteurs {#typed-decisions-and-connectors}

| Terme | En termes simples |
| --- | --- |
| **Jev** | Un modèle de TypeSafe qui répond à des questions étroites (oui/non, un choix, une note) par des probabilités que votre code peut exploiter, rapidement et à faible coût. Voir [Décisions typées](./typed-decisions). |
| **Noul, Choice, Score** | Les trois types de questions de Jev : oui ou non ; une option parmi une liste ; un niveau sur une échelle. Choisir plusieurs options revient à poser une question oui/non par option. |
| **Calibrée** (*calibrated*) | Se dit d'une probabilité qui correspond à la réalité en moyenne : parmi les réponses données avec 80 % de confiance, environ 80 % sont justes. |
| **AI Gateway** | Un service de Vercel qui donne accès à plusieurs modèles, dont Jev, avec une seule clé. |
| **MCP** | Model Context Protocol : une « prise » standard unique entre les applications d'IA (Claude Desktop, Claude Code, assistants d'IDE, agents) et vos systèmes. Le SDK peut transformer une fonction, une API web, un dossier, une base de données ou un agent en serveur MCP, et utiliser les outils de n'importe quel serveur MCP. Voir [MCP expliqué simplement](./mcp). |
| **Serveur MCP** (*MCP server*) | Un petit programme placé devant l'un de vos systèmes, qui indique aux applications d'IA ce qu'il propose et fait le travail quand on le lui demande. Voir [Votre premier serveur MCP](./mcp-first-server). |
| **Client MCP, hôte** (*MCP client, host*) | L'hôte est l'application d'IA avec laquelle l'utilisateur échange ; à l'intérieur, un client MCP maintient la connexion avec un serveur. |
| **Ressource** (*resource*) | Un document qu'un serveur MCP propose à la lecture, comme un fichier d'un dossier partagé. Contrairement à un outil, c'est l'utilisateur ou l'application qui la choisit, pas le modèle. |
| **Transport** | La façon dont une application MCP et un serveur échangent des messages : **stdio** (l'application lance le serveur comme un programme sur le même ordinateur et communique par son entrée et sa sortie) ou **Streamable HTTP** (le serveur est un service web). Voir [stdio ou HTTP ?](./mcp-deploy#stdio-or-http). |
| **OpenAPI** | Une description standard, lisible par une machine, d'une API web : ses adresses, ses paramètres et ses réponses, souvent publiée sous le nom `openapi.json`. À partir de celle-ci, le SDK crée un outil par opération. Voir [Une API web](./mcp-recipes#a-web-api-from-its-openapi-description). |
| **JSON Schema** | Une description de la forme de certaines données — ici, des arguments d'un outil — que les modèles et les applications MCP lisent pour appeler l'outil correctement. Le SDK l'écrit à partir de votre schéma Zod ou de la description OpenAPI. |
| **Lecture seule** (*read-only*) | Peut consulter, ne peut pas modifier. Les sources dossier et base de données sont en lecture seule par construction ; les API web le sont par défaut (seulement les opérations `GET`). |
| **Source d'outils** (*tool source*) | Une fonction qui construit des outils prêts à l'emploi à partir d'un système : `openApiTools`, `folderTools`, `databaseTools`, `cognitiveAgentTool`. Servez-les en MCP en une ligne, ou donnez-les à vos propres agents. Voir [Un serveur MCP pour tout](./mcp-recipes). |

## Exploiter en production {#operating-in-production}

| Terme | En termes simples |
| --- | --- |
| **Nouvelle tentative** (*retry*) | Réessayer une requête qui a échoué, après une courte attente, quand l'échec est temporaire. Voir [Nouvelles tentatives et repli](./resilience). |
| **Repli, basculement** (*fallback, failover*) | Passer à un autre modèle ou à un autre fournisseur quand le premier continue d'échouer. |
| **Incident** | Une exécution en échec, une action bloquée ou un basculement, transformé en alerte qui vous est envoyée par e-mail ou par webhook. Voir [Alertes d'incident](./incidents). |
| **Webhook** | Une adresse que vous fournit votre outil de messagerie ou de supervision, et à laquelle le SDK envoie les alertes. |
