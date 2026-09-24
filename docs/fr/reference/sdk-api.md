# API du SDK

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Option | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | Clé du fournisseur principal (inutile avec `llmProvider`). Sans aucune clé, les outils et les serveurs MCP fonctionnent, et les appels qui ont besoin d'un modèle échouent avec une erreur explicite |
| `provider` | `'openai' \| 'anthropic'` | Fournisseur principal, `openai` par défaut |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` et `timeout` de chaque éditeur (`baseURL` : un endpoint compatible, comme l'API v1 d'Azure OpenAI ou un serveur de modèles local, ou un proxy ; `timeout` : l'attente maximale d'une réponse en millisecondes, 10 minutes par défaut, et pour une réponse en streaming l'attente maximale entre deux de ses événements). Le fournisseur principal utilise l'entrée de son éditeur, et un repli d'un autre éditeur celle du sien. Modèles par défaut : `gpt-5.4` et `claude-opus-5`. L'entrée OpenAI accepte aussi `reasoningModels`, `reasoningEffort`, `nativeToolMessages` et `includeStreamUsage` : voir [Modèles OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Essayés dans l'ordre quand le fournisseur principal échoue ; un `config` l'emporte sur `providerConfig`. Un repli du même éditeur que le principal n'hérite d'aucun de ses réglages (seulement de l'`apiKey` globale) ; un repli d'un autre éditeur a besoin de sa propre clé |
| `llmProvider` | `LLMProvider` | Votre propre fournisseur (modèle local, passerelle, doublure de test). Il reçoit les appels d'outils et leurs résultats au format natif (`LLMMessage`) s'il déclare `nativeToolMessages`, en texte sinon, et il peut transmettre son texte en streaming (voir [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | Politique de nouvelles tentatives pour le LLM, par fournisseur, avant le repli. Ses `maxRetries` et `initialDelayMs` sont aussi les valeurs par défaut de `jev.maxRetries` et `jev.retryBaseDelayMs` ; ses autres champs n'atteignent pas le client Jev, qui garde ses propres 2 nouvelles tentatives et 500 ms avec `retry: false`. Appliquée à un `llmProvider` injecté seulement si elle est définie explicitement, et jamais à un `FallbackProvider` passé comme `llmProvider` ni à ses fournisseurs |
| `jev` | `JevClientConfig` | Active TypeSafe Jev pour les décisions typées — directement, ou via [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) avec `baseUrl` et `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | N'importe quel backend de décisions typées (prioritaire sur `jev`) |
| `pricing` | `PricingTable` | USD par million de tokens, fusionné avec les valeurs par défaut |
| `incidents` | `IncidentMonitorOptions` | Notificateurs, règles, seuil de gravité, régulation de fréquence |
| `eventStore` | `IEventStore` | `FileEventStore('./events')` par défaut |
| `defaultPolicies` | `Policy[]` | Politiques globales |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Stockage des artefacts de test |

### Modèles OpenAI {#openai-models}

Les modèles de raisonnement d'OpenAI — la série o (`o1`, `o3`, `o4-mini`…) et GPT-5 et les suivants (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), y compris datés ou affinés (`ft:o4-mini-…`) — refusent `max_tokens`, et `temperature` sauf quand leur effort de raisonnement est `none`. Le fournisseur OpenAI les reconnaît à leur nom, quelle que soit la casse : il leur envoie `maxTokens` sous la forme de `max_completion_tokens`, qui compte aussi leurs tokens de raisonnement, ainsi que l'effort de raisonnement. Comme l'effort par défaut varie d'un modèle à l'autre, il ne leur envoie jamais de température : celle de l'agent ou du moteur est ignorée pour eux. Les autres modèles reçoivent `temperature` et `max_tokens`, que tout serveur compatible avec OpenAI connaît.

::: warning Outils et effort de raisonnement
Le SDK appelle OpenAI par Chat Completions, où les modèles GPT-5.4 et suivants n'appellent des outils qu'avec l'effort `none`. Le modèle par défaut, `gpt-5.4`, utilise `none` tant que vous ne fixez pas un autre effort. GPT-5.5, GPT-5.6 et GPT-6 Sol et Luna ont `medium` par défaut : un agent doté d'outils échoue sur eux (`Function tools with reasoning_effort are not supported`) à moins de fixer `reasoningEffort: 'none'`. GPT-6 Astra ne peut pas du tout appeler d'outils par Chat Completions. Le SDK envoie l'effort que vous fixez tel quel.
:::

| Option | Valeur par défaut | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Modèle d'une requête qui n'en nomme aucun, et d'un repli qui ne sert pas le modèle de l'agent |
| `reasoningModels` | Déduit du nom | `true` ou `false` : tous les modèles de ce fournisseur sont, ou ne sont pas, des modèles de raisonnement. Une liste : ces noms en sont (déploiements Azure, alias de passerelle), les autres sont reconnus à leur nom |
| `reasoningEffort` | Celui du modèle | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` ou `max`, envoyé tel quel aux seuls modèles de raisonnement. Chaque modèle accepte certaines de ces valeurs, et l'API refuse les autres |
| `includeStreamUsage` | Sur l'API d'OpenAI elle-même | `true` : la consommation d'une réponse en streaming est demandée (`stream_options`), si bien que son coût est compté ; `false` : elle ne l'est pas. Par défaut sur `https://api.openai.com/v1` et sur les hôtes régionaux comme `https://eu.api.openai.com/v1` (dans `baseURL` ou `OPENAI_BASE_URL`), car un serveur compatible peut refuser ce champ (la requête est alors envoyée à nouveau sans lui) ou l'ignorer, et un appel en streaming sans consommation compte comme non mesuré. Avec un budget de coût sur un serveur compatible qui fournit la consommation (c'est le cas de l'API v1 d'Azure OpenAI), fixez `true` |
| `nativeToolMessages` | `true` | `false` pour un serveur compatible qui n'accepte pas, dans la conversation, les `tool_calls` de l'assistant ni les messages `tool` : les appels d'outils précédents et leurs résultats sont alors envoyés en texte, tandis que les outils restent proposés et que les appels d'outils des réponses sont toujours lus. `false` sur le fournisseur principal ou sur n'importe quel repli s'applique à toute la chaîne |

Ces options se placent dans `providerConfig.openai` ou dans le `config` d'un repli OpenAI. Un repli d'un autre éditeur prend dans `providerConfig.openai` chaque option que son `config` ne fixe pas ; un repli du même éditeur que le principal n'en prend aucune. Un agent ou une exécution fixe son propre effort dans `providerSettings.openai.reasoningEffort` : celui de l'exécution l'emporte, puis celui de l'agent, puis celui du fournisseur. Un agent cognitif ne l'applique qu'à la sélection d'outil ; ses pensées, qui ne proposent pas d'outils, prennent son option `reasoningEffort`.

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

### `LLMProvider` {#llmprovider}

Votre propre fournisseur implémente `generateCompletion(request)`, `supportsModel(model)` et `getProviderName()`, et peut déclarer `nativeToolMessages`. Deux champs de la requête concernent le streaming :

| Champ de `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | Défini quand l'appelant veut le texte à mesure qu'il est écrit (une exécution avec `onText`). Appelez-le avec chaque fragment de texte dès qu'il arrive, puis renvoyez comme d'habitude la `LLMResponse` complète : les fragments mis bout à bout doivent former son `content`. Un fournisseur qui ne gère pas le streaming l'ignore, et le SDK transmet tout le `content` d'un seul bloc. Il ne doit pas lever d'exception (celui que fournit le SDK n'en lève jamais) |
| `onTextRestart?()` | Appelez-le quand vous réessayez après une tentative qui avait déjà transmis du texte (une nouvelle tentative que vous faites vous-même) : ce texte n'est plus valable, et les fragments suivants recommencent la réponse. `RetryingLLMProvider` et `FallbackProvider` l'appellent pour les fournisseurs qu'ils enveloppent |

## Agents {#agents}

| Méthode | Renvoie | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agent gouverné : `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Il ne peut exécuter que ses propres outils (`tools`, `capabilities`), même si le modèle nomme un autre outil enregistré dans le SDK ; `signal` annule l'exécution ; `onText` reçoit le texte que le modèle écrit à mesure qu'il l'écrit, et `onTextRestart` la partie à retirer quand un appel au modèle en échec est retenté (voir [Recevoir la réponse en streaming](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Ses pensées sont structurées et ne sont pas transmises en streaming |
| `defineTool(definition)` | `Tool` | Enregistre un outil ; le gestionnaire est typé à partir de son schéma Zod |
| `defineCapability(definition)` | `Capability` | Regroupe des outils |
| `listTools()` | `Tool[]` | Tous les outils enregistrés |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Exécution gouvernée en dehors d'un agent (utilisée par le serveur MCP) : arguments, politiques, approbation, budget (décompté au début de l'appel), puis l'outil. `signal` annule une approbation en attente et parvient au gestionnaire ; `approvalTimeoutMs` annule une approbation sur laquelle personne n'a statué |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Exécute `read()` comme une exécution à part entière : `run.started`, `resource.read` (URI, taille, SHA-256), `run.completed` ou `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Arrête une exécution gouvernée ou cognitive |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Option | Valeur par défaut | |
| --- | --- | --- |
| `name`, `model` | — | Obligatoires |
| `profile` | `DEFAULT_THINKER_PROFILE` | La façon dont l'agent raisonne |
| `tools`, `policies` | `[]` | Gouvernés comme partout ailleurs ; les politiques de budget et de durée sont aussi vérifiées avant chaque étape, voir [Limites et politiques](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | Instructions supplémentaires pour chaque prompt |
| `limits` | voir [Agents cognitifs](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` ou un `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0,35), `readinessThreshold` (0,8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` ou votre propre `HypothesisAssessor` pour l'opération `compare` |
| `knowledge` | — | Mémoire entre exécutions : `{ store, scope, recallLimit? (10), record? (true) }`, voir [Mémoire entre exécutions](../guide/memory) |
| `evaluator` | — | Un `OutcomeEvaluator` qui teste les prédictions ; active `test_prediction` |
| `generator` | générateur LLM sur `model` | Votre propre `ThoughtGenerator` (comparaisons d'observations comprises) ; ses pensées passent tout de même par les règles d'admission du moteur |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Réglages de la génération des pensées (`reasoningEffort` : modèles de raisonnement d'OpenAI uniquement) |
| `providerSettings` | — | Réglages de la sélection d'outil (moteur de raisonnement natif), `openai.reasoningEffort` compris |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` vaut `completed`, `failed` ou `cancelled` ; `decision.status` vaut `committed`, `provisional` ou `abstain`, et `decision.missing` liste ce qui n'est pas établi ; `state` est le `MentalState` final.

### `OutcomeEvaluator` {#outcomeevaluator}

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

Voir [Preuves et vérification](../guide/evidence-and-verification).

## Raisonnement et profils {#reasoning-profiles}

| Méthode | Renvoie |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — reconstruit à partir des événements |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Décisions typées — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Lève une `ValidationError` quand aucun backend n'est configuré.

| Méthode | Renvoie |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — les réponses sont typées à partir des questions ; pas de `usage` quand le backend n'a rapporté aucun nombre de tokens |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Fonctions utilitaires pour les questions : `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Exploitation {#operations}

| Méthode | Renvoie |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Approbations humaines |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets et audit des politiques |

### `RunCostReport` {#runcostreport}

Ce que renvoie `getRunCost(runId)` : les appels au modèle de l'exécution, étapes échouées comprises — voir [Coûts d'API](../guide/costs).

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}
```

| Champ | |
| --- | --- |
| `totalUsd` | Coût des appels dont le coût est connu ; seulement un minimum quand `complete` vaut `false` |
| `complete` | `false` quand le coût de certains appels est inconnu : `unpricedCalls` ou `unmeteredCalls` supérieur à 0 |
| `unpricedModels`, `unpricedCalls` | Modèles sans tarif dans `pricing`, et ceux de leurs appels qui ont rapporté leurs tokens |
| `unmeteredModels`, `unmeteredCalls` | Modèles des appels qui n'ont rapporté aucun nombre de tokens en entrée ou en sortie, et ces appels |
| `lines` | Une par modèle et par source : appels, tokens des appels qui les ont rapportés, `unmeteredCalls` s'il y en a, `costUsd` quand le modèle a un tarif et qu'une partie des appels de la ligne ont rapporté leurs tokens ; `model` vaut `(unknown)` pour un appel qui n'a enregistré aucun nom de modèle |

## Traces, rejeu et tests {#traces-replay-and-testing}

| Méthode | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Lire des exécutions |
| `replay(runId, modifications?, { onEvent? })` | Exécuter de nouveau sans le LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Comprendre les décisions |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Tester les agents comme du code |

## Événements en direct {#live-events}

Un écouteur est de la forme `(event: Event) => unknown`. Il reçoit un événement à la fois, dans l'ordre de chaque exécution, une fois que le magasin l'a accepté ; une promesse qu'il renvoie est attendue avant son événement suivant. Les exécutions ne l'attendent jamais, et ses erreurs sont signalées, jamais propagées dans l'exécution. Au plus `maxQueued` événements (10 000 par défaut) l'attendent ; au-delà, les nouveaux sont abandonnés pour lui et signalés par une `LiveEventsDroppedError`. Voir [Progression en direct](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent` : `agent.run({ message, onEvent })` | Tous les événements de l'exécution ; `run()` se résout une fois que l'écouteur a fini de traiter chacun d'eux, ou plus tôt quand l'exécution a été arrêtée ou annulée ou que `signal` est interrompu (l'écouteur est alors désabonné). L'écouteur n'est pas enregistré |
| `ThinkInput.onEvent` : `agent.think({ problem, onEvent })` | De même pour une exécution cognitive, dont le `limits.timeoutMs` met aussi fin à l'attente |
| `replay(runId, modifications?, { onEvent })` | De même pour un rejeu, qui ne peut pas être annulé : il attend toujours |
| `executeTool(name, params, { onEvent })` | Les événements de l'appel, et ceux des exécutions que lance son outil, sur un seul niveau : le gestionnaire reçoit l'écouteur sous la forme `context.onEvent`, que `governedAgentTool` et `cognitiveAgentTool` transmettent à leur agent (un agent construit à la main sur un magasin sans événements en direct s'exécute sans lui). `signal` met fin à l'attente |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void` : tous les événements de toutes les exécutions qui correspondent au filtre (`agentId` est `metadata.agentId`), jusqu'à ce que vous appeliez la fonction renvoyée, qui abandonne les événements pas encore transmis |
| `new ObservedEventStore(store, { onListenerError? })` | La couche qui les transmet ; le SDK enveloppe son magasin dans une telle couche, ou utilise celle que vous passez comme `eventStore`, y compris à l'intérieur d'un `MonitoredEventStore` (dont les rapports d'incident sont alors transmis eux aussi). Son `subscribe(listener, options?)` renvoie `{ unsubscribe(), close() }` : `close()` attend que l'écouteur ait fini de traiter les événements qu'il a déjà pris en charge. `onListenerError` reçoit les erreurs des écouteurs et les abandons |

## Outils : `ToolDefinition` {#tools-tooldefinition}

| Champ | |
| --- | --- |
| `name`, `description` | Ce que voit le modèle |
| `schema` | Schéma Zod des arguments ; les appels qui n'y correspondent pas sont refusés |
| `handler(params, context?)` | Reçoit les arguments validés et `{ runId, agentId, signal?, onEvent? }` — `signal` est interrompu quand l'appelant abandonne ; `onEvent` est défini quand l'appelant suit l'appel en direct : passez-le comme `onEvent` des exécutions que l'outil lance |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — outils idempotents uniquement ; les arguments invalides ne donnent jamais lieu à une nouvelle tentative |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` fait attendre `approveAction` à chaque appel ; `readOnly` est montré aux clients MCP sous la forme `readOnlyHint` |
| `inputJsonSchema` | JSON Schema montré à la place de celui qui est dérivé de `schema` |
| `capability`, `version` | Regroupement, version |

## Sources d'outils {#tool-sources}

Chacune renvoie des `ToolDefinition` prêtes à l'emploi : passez-les à `sdk.defineTool`, à un agent, ou directement à la liste `tools` d'un serveur MCP. Voir [Un serveur MCP pour tout](../guide/mcp-recipes).

| Fonction | Renvoie | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | Un outil par opération d'une description OpenAPI 3 ; uniquement `GET`, sauf opérations listées dans `include` ; les autres méthodes nécessitent une approbation par défaut. Un appel renvoie `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` sur un dossier, jamais en dehors ; un dossier exclu masque tout ce qu'il contient |
| `folderResources(options)` | `ResourceProvider` | Les mêmes fichiers sous forme de ressources MCP `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (une seule instruction en lecture seule, au plus `maxRows` lignes, 100 par défaut) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Pour `DatabaseSync` de `node:sqlite` ou pour `better-sqlite3` ; exécute les requêtes avec `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Pour `pg` (un client dédié, ou un pool) ; chaque requête dans `BEGIN READ ONLY` (refusée sur une connexion déjà engagée dans une transaction) … `ROLLBACK` + `pg_advisory_unlock_all()`, avec `SET LOCAL statement_timeout` (10 s par défaut) ; `schemas` ne limite que le listage et la description |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>` : `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }` ; annulé avec l'appelant ; `error` est générique sauf avec `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | La vérification d'instruction utilisée par les adaptateurs de bases de données (syntaxes SQLite et PostgreSQL uniquement) |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| Fonction | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP qui expose exactement ce que liste `tools` : des noms d'outils définis et/ou des `ToolDefinition` (définies pour vous sur le SDK ; la même définition peut être passée de nouveau, un autre outil portant un nom déjà pris est refusé). `resources` : un ou plusieurs `ResourceProvider` ; chaque lecture est tracée. Les appels s'exécutent sous `mcp:<name>` (ou `agentId`) ; une approbation sur laquelle personne ne statue dans le délai `approvalTimeoutMs` (50 000 ms par défaut) est annulée ; les refus liés à l'entrée sont expliqués au client, les autres causes seulement avec `exposeErrorDetails`. Un appel muni d'un `progressToken` reçoit une `notifications/progress` par événement, toutes envoyées avant le résultat ([notifications de progression](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | Identique, connecté à stdin/stdout ; écrit une ligne « ready » sur stderr, et se ferme quand stdin se termine (les appels en cours sont interrompus, les approbations en attente annulées). `approvalTimeoutMs` vaut 50 000 par défaut, comme pour `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — les outils de n'importe quel serveur MCP, sous forme de `ToolDefinition` |

`GovernedToolHost` est ce dont le serveur a besoin de la part du SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`) ; `createSDK()` renvoie un objet qui l'implémente.

## Briques de base {#building-blocks}

Les briques du SDK sont exportées pour les configurations personnalisées : `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, ainsi que leurs principaux types.
