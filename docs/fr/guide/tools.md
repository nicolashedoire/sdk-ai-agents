# Outils

Un **outil** (*tool*) est une fonction qu'un agent peut appeler : consulter une commande, lire un fichier, chercher sur le Web, interroger un autre agent. Vous écrivez les vôtres, ou vous les prenez tout prêts dans une **source d'outils** : un dossier, une base de données, une API web, le Web, un agent ou un serveur MCP.

Quelle que soit son origine, chaque appel est **gouverné**. L'outil doit faire partie de ceux de l'appelant, ses arguments sont vérifiés, les politiques et les budgets s'appliquent, un humain peut être sollicité pour l'approuver, les échecs peuvent donner lieu à de nouvelles tentatives, et tout est inscrit dans le journal d'événements.

## En une ligne {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

L'agent peut maintenant lister, lire et fouiller le manuel, et chercher et lire sur le Web : huit outils, tous en lecture seule.

## Vos propres outils {#your-own-tools}

`sdk.defineTool` enregistre un outil dans le SDK et le renvoie. Le schéma zod décrit les arguments ; le gestionnaire (*handler*) les reçoit validés et typés.

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| Champ | |
| --- | --- |
| `name`, `description` | Ce que voit le modèle, et ce à partir de quoi il décide. Utilisez des lettres, des chiffres, `_` et `-`, jusqu'à 64 caractères : les API des modèles et les clients MCP peuvent refuser d'autres noms. |
| `schema` | Les arguments, sous forme de schéma zod ; les textes de `.describe()` sont montrés au modèle. Un appel qui n'y correspond pas est refusé avant toute politique, toute approbation et tout budget. |
| `handler(params, context?)` | Votre code. `context` contient `runId`, `agentId`, `signal` (interrompu quand l'appelant abandonne) et `onEvent` (défini quand l'appelant suit l'appel en direct). |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category` : voir [Comment les appels sont gouvernés](#how-calls-are-governed). Aucune par défaut. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`, pour les outils idempotents uniquement. |
| `version` | `1.0.0` par défaut. Elle entre dans l'empreinte de configuration de l'agent, si bien que les exécutions d'avant et d'après un changement peuvent être [comparées](../reference/sdk-api#comparisons-and-impact). |
| `capability` | Une étiquette pour regrouper les outils ; les sources intégrées en définissent une (`web:search`, `folder:handbook`…). |

Un nom n'est enregistré qu'une fois par SDK : `sdk.defineTool` lève une erreur pour un nom déjà pris, quelle que soit la version. Donnez un préfixe à chaque source quand deux d'entre elles pourraient entrer en conflit. Tous les champs figurent dans l'[API du SDK](../reference/sdk-api#tools-tooldefinition).

## Les sources d'outils intégrées {#the-built-in-tool-sources}

Chaque source renvoie des définitions d'outils, prêtes pour `sdk.defineTool` (dans sa propriété `tools` pour `connectMcpServer`). Chacune peut renommer ses outils : un préfixe (`prefix` ; `toolPrefix` pour MCP), ou le nom entier de l'outil d'un agent (`name`).

| Source | L'agent peut | Noms des outils | Risque, lecture seule | Ce qu'il faut | Détails |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | Lister, lire et fouiller les fichiers texte d'un dossier, jamais en dehors | `list_files`, `read_file`, `search_files` | faible, lecture seule | Un dossier | [Un dossier de documents](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | Lister les tables, en décrire une, exécuter une requête en lecture seule : `SELECT`, `WITH … SELECT` ou `VALUES` (au plus 100 lignes par défaut) | `list_tables`, `describe_table`, `query` | moyen, lecture seule | `sqliteReadOnly(db)` (`node:sqlite` ou `better-sqlite3`) ou `postgresReadOnly({ pool })` (`pg`) | [Une base de données en lecture seule](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Appeler une API web, un outil par opération : les opérations `GET` par défaut ; `include` les remplace par les opérations qu'il liste, seul moyen d'obtenir des écritures | Le `operationId`, sinon la méthode et le chemin (`get_pets_petId`) | `GET` : faible, lecture seule. Les autres : élevé, approbation requise | Une description OpenAPI 3 (URL, fichier ou objet) | [Une API web](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Chercher sur le Web, lire une page ou un PDF, chercher dans arXiv, Wikipédia et GitHub | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` moyen, les autres faible ; tous en lecture seule | Rien pour commencer (DuckDuckGo) ; `unpdf` pour les PDF ; un jeton GitHub pour chercher dans le code | [Recherche sur le Web](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | Consulter un autre agent : un agent gouverné répond à un `message`, un agent cognitif raisonne sur un `problem` et renvoie sa décision | `ask_<agent name>` | moyen, non marqué en lecture seule | Un agent, donc une clé de modèle | [Un agent](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | Utiliser les outils de n'importe quel serveur MCP | Les noms du serveur, précédés de `toolPrefix` | Rien de défini : `metadata` s'applique à chaque outil importé | `@sdk-ai-agents/core/mcp` et `@modelcontextprotocol/sdk` ; `close()` une fois terminé | [Utiliser les outils d'un serveur MCP](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

Deux choses changent pour les outils MCP : le SDK vérifie seulement que leurs arguments forment un objet (le serveur vérifie le reste), et les indications propres au serveur, comme la lecture seule, ne sont pas importées : définissez `metadata` vous-même.

## Donner des outils à un agent {#giving-tools-to-an-agent}

`createAgent({ tools })` et `createCognitiveAgent({ tools })` prennent des outils : faites donc d'abord passer les définitions d'une source par `sdk.defineTool`, comme ci-dessus. Un agent ne peut exécuter **que ses propres outils**, ceux de `tools` et de ses `capabilities` : tout autre outil que nomme le modèle est refusé (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

`defineTool`, importé du paquet, construit un outil sans l'enregistrer : le SDK l'enregistre à la création d'un agent qui l'utilise. Si un outil de ce nom est déjà enregistré, c'est celui-là qui est gardé et qui s'exécute.

### Capacités {#capabilities}

Une capacité nomme un groupe d'outils à donner à plusieurs agents. L'étiquette `capability` d'un outil n'en est pas une : définissez-la avec `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### En dehors d'un agent {#outside-an-agent}

`sdk.listTools()` renvoie tous les outils enregistrés dans le SDK. `sdk.executeTool(name, parameters, options?)` en appelle un en passant par le même circuit gouverné, comme une exécution à part entière (identifiant d'agent `external`, sauf si vous donnez `agentId`), et renvoie ce qu'a renvoyé le gestionnaire :

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

Ses options : `runId` enregistre l'appel dans une exécution existante, `allowedTools` limite ce que cet appelant peut exécuter, `signal` l'annule, `approvalTimeoutMs` borne l'attente d'une approbation, et `onEvent` suit l'appel en direct. Un refus lève une `PolicyViolationError` ; des arguments invalides et un gestionnaire en échec lèvent une `ToolExecutionError`.

Les mêmes outils servent ailleurs. Une [étude](./studies#research-through-your-sources) prend comme `sources` les **noms** d'outils définis, et un serveur MCP sert à Claude Desktop, à Claude Code ou à n'importe quel client MCP les définitions ou les noms que vous lui donnez (voir [Un serveur MCP pour tout](./mcp-recipes)).

## Comment les appels sont gouvernés {#how-calls-are-governed}

Un appel passe par ces étapes, dans cet ordre, et s'arrête au premier refus :

1. **Les outils de l'appelant.** Un outil qui n'a pas été donné à l'appelant est refusé : les outils d'un agent, les sources d'une étude, la liste d'un serveur MCP, ou `allowedTools`. `executeTool` sans `allowedTools` peut exécuter n'importe quel outil enregistré.
2. **Les arguments**, vérifiés par rapport au schéma, avant que quiconque ne soit sollicité.
3. **Les politiques** : chaque politique globale et chaque politique de l'agent (voir [Agents gouvernés](./governed-agents#_3-policies)).
4. **L'approbation**, quand l'outil ou une politique en demande une. Un appel refusé par une politique, quelle qu'elle soit, est refusé sans qu'une approbation soit demandée : une approbation ne l'emporte jamais sur un refus, une liste d'autorisation ou un budget.
5. **Le budget** : l'appel est décompté dès qu'il commence, quelle qu'en soit l'issue.
6. **L'outil s'exécute**, avec ses nouvelles tentatives.

### Niveaux de risque {#risk-levels}

`riskLevel` est une étiquette : elle indique aux personnes et au code le degré de prudence à observer. **Aucune politique ne la lit**, et elle ne bloque ni ne ralentit aucun appel. Pour qu'elle ait un effet, donnez `requiresApproval` à un outil, ou transformez l'étiquette en politique :

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

La liste est établie au moment où la politique est définie : définissez d'abord les outils.

### Approbations {#approvals}

Un appel attend un humain quand l'outil a `requiresApproval: true` (la valeur par défaut de `openApiTools` pour les opérations d'écriture) ou qu'une règle de politique dit `require_approval`. Il apparaît dans `sdk.getPendingApprovals()` ; `sdk.approveAction(id, who, reason?)` le laisse s'exécuter, `sdk.rejectAction(id, who, reason?)` le refuse. Un appel refusé par une politique, quelle qu'elle soit, est refusé sans qu'une approbation soit demandée : une approbation ne l'emporte jamais sur un refus, une liste d'autorisation ou un budget. Si l'appelant abandonne avant (une exécution arrêtée, un `signal` interrompu, `approvalTimeoutMs`, 50 s par défaut sur les serveurs MCP), l'approbation est annulée et l'outil ne s'exécute jamais. Voir [Approbations](./mcp-deploy#approvals-a-human-says-yes-first).

### Outils en lecture seule {#read-only-tools}

`readOnly: true` indique que l'outil ne modifie rien. Les clients MCP le voient sous la forme `readOnlyHint`, et `openApiTools` ne retente que les opérations en lecture seule. Il n'assouplit aucune politique et n'est pas vérifié : un gestionnaire marqué en lecture seule qui écrit écrit quand même. Les sources qui ne font que lire l'imposent là où elles le peuvent : `folderTools` n'a aucun moyen d'écrire, et `sqliteReadOnly` et `postgresReadOnly` exécutent chaque requête en lecture seule dans la base de données elle-même.

### Nouvelles tentatives {#retries}

`retry` relance un gestionnaire en échec : seulement les erreurs du gestionnaire, jamais des arguments invalides ni un refus. Chaque nouvelle tentative est un événement `tool.retry`, et l'appel ne compte qu'une fois dans son budget. `openApiTools`, `webTools` et `connectMcpServer` acceptent une option `retry` pour leurs outils. Voir [Nouvelles tentatives et repli](./resilience#tools).

### Budgets {#budgets}

Une politique `budget` avec un `budgetLimit` plafonne les appels d'outils par période, pour un agent (`agentId`), un outil (`toolName`) ou tous :

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

Un `budgetLimit` peut aussi plafonner `maxTokens` et `maxCost`, comptés sur les appels au modèle : une fois un plafond dépassé par la consommation de la période, les appels d'outils sont refusés, et `maxCost` les refuse aussi dès que le coût d'un appel est inconnu (un modèle sans tarif, un appel sans nombres de tokens). Voir [Coûts d'API](./costs#budgets).

### Résultats non fiables {#untrusted-output}

Ce que renvoie un outil retourne au modèle, et une page, un fichier ou une réponse d'API peuvent contenir des instructions écrites à son intention (injection de prompt). Les outils Web marquent chaque réponse `untrusted: true`, et leurs descriptions disent au modèle de ne jamais suivre les instructions qu'il y trouve. Les autres sources renvoient leur contenu tel quel. Dites dans le prompt système que les résultats des outils sont des données, ne donnez à chaque agent que les outils dont il a besoin, et protégez par des approbations les outils qui modifient quelque chose. Une étude montre chaque résultat à son modèle comme des données. Voir [les règles de sécurité des outils Web](./web-research#security-rules).

### Ce qu'enregistre un appel {#what-a-call-records}

| Événement | Quand |
| --- | --- |
| `action.executing` | L'appel est proposé, avant toute vérification |
| `policy.checked` | Chaque politique vérifiée, puis le verdict |
| `policy.violated` | Un refus : un outil qui n'a pas été donné à l'appelant (`allowed-tools`), une politique, un budget épuisé |
| `approval.requested`, `approval.approved`, `approval.rejected` | La décision humaine |
| `tool.called` | Le gestionnaire démarre |
| `tool.retry` | Une nouvelle tentative, avec son délai et l'erreur |
| `action.executed`, `action.failed` | Le résultat ou l'erreur (arguments invalides compris), avec la durée |

Un appel fait avec `executeTool` est une exécution à part entière, sauf si vous donnez `runId` : `run.started` (mode `tool`), puis `run.completed` ou `run.failed`. Voir le [catalogue des événements](../reference/events#reasoning-and-actions).

## Choisir une source {#choosing-a-source}

| J'ai besoin de… | Utilisez |
| --- | --- |
| Mon propre code ou mon propre service | `sdk.defineTool` |
| Des documents dans un dossier | `folderTools` |
| Des réponses tirées d'une base de données SQL, en lecture seule | `databaseTools` avec `sqliteReadOnly` ou `postgresReadOnly` ; pour PostgreSQL, connectez-vous aussi avec un rôle qui ne peut que lire |
| Une API web qui publie une description OpenAPI | `openApiTools` |
| Une API web qui n'en publie pas | `sdk.defineTool`, avec `fetch` dans le gestionnaire |
| Le Web, des articles scientifiques, des articles d'encyclopédie, du code sur GitHub | `webTools` |
| La réponse ou la décision d'un autre agent | `governedAgentTool` ou `cognitiveAgentTool` |
| Un système qui a déjà un serveur MCP | `connectMcpServer` |
| Des sources pour une étude | Les outils de recherche de `webTools`, ou ceux d'un serveur MCP |
| Mes outils dans Claude Desktop ou Claude Code | L'autre sens : [un serveur MCP](./mcp-recipes) |
