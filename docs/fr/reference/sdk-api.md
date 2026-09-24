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
| `providerConfig` | `{ openai?, anthropic? }` | Réglages du fournisseur principal, sous son nom : `apiKey`, `defaultModel` et `baseURL` (un endpoint compatible, comme l'API v1 d'Azure OpenAI ou un serveur de modèles local, ou un proxy) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Essayés dans l'ordre quand le fournisseur principal échoue ; chaque `config` prend ses propres `apiKey`, `defaultModel` et `baseURL` |
| `llmProvider` | `LLMProvider` | Votre propre fournisseur (modèle local, passerelle, doublure de test) |
| `retry` | `Partial<RetryPolicy> \| false` | Politique de nouvelles tentatives pour le LLM, par fournisseur, avant le repli |
| `jev` | `JevClientConfig` | Active TypeSafe Jev pour les décisions typées — directement, ou via [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) avec `baseUrl` et `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | N'importe quel backend de décisions typées (prioritaire sur `jev`) |
| `pricing` | `PricingTable` | USD par million de tokens, fusionné avec les valeurs par défaut |
| `incidents` | `IncidentMonitorOptions` | Notificateurs, règles, seuil de gravité, régulation de fréquence |
| `eventStore` | `IEventStore` | `FileEventStore('./events')` par défaut |
| `defaultPolicies` | `Policy[]` | Politiques globales |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Stockage des artefacts de test |

## Agents {#agents}

| Méthode | Renvoie | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agent gouverné : `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Il ne peut exécuter que ses propres outils (`tools`, `capabilities`), même si le modèle nomme un autre outil enregistré dans le SDK ; `signal` annule l'exécution |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Enregistre un outil ; le gestionnaire est typé à partir de son schéma Zod |
| `defineCapability(definition)` | `Capability` | Regroupe des outils |
| `listTools()` | `Tool[]` | Tous les outils enregistrés |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | Exécution gouvernée en dehors d'un agent (utilisée par le serveur MCP) : arguments, politiques, approbation, budget (décompté au début de l'appel), puis l'outil. `signal` annule une approbation en attente et parvient au gestionnaire ; `approvalTimeoutMs` annule une approbation sur laquelle personne n'a statué |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Exécute `read()` comme une exécution à part entière : `run.started`, `resource.read` (URI, taille, SHA-256), `run.completed` ou `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Arrête une exécution gouvernée ou cognitive |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Option | Valeur par défaut | |
| --- | --- | --- |
| `name`, `model` | — | Obligatoires |
| `profile` | `DEFAULT_THINKER_PROFILE` | La façon dont l'agent raisonne |
| `tools`, `policies` | `[]` | Gouvernés comme partout ailleurs |
| `systemPrompt` | — | Instructions supplémentaires pour chaque prompt |
| `limits` | voir [Agents cognitifs](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` ou un `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0,35), `readinessThreshold` (0,8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` ou votre propre `HypothesisAssessor` pour l'opération `compare` |
| `knowledge` | — | Mémoire entre exécutions : `{ store, scope, recallLimit? (10), record? (true) }`, voir [Mémoire entre exécutions](../guide/memory) |
| `evaluator` | — | Un `OutcomeEvaluator` qui teste les prédictions ; active `test_prediction` |
| `generator` | générateur LLM sur `model` | Votre propre `ThoughtGenerator` (comparaisons d'observations comprises) ; ses pensées passent tout de même par les règles d'admission du moteur |
| `temperature`, `maxTokens` | `0.4`, — | Réglages de la génération des pensées |
| `providerSettings` | — | Réglages de la sélection d'outil (moteur de raisonnement natif) |

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
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — les réponses sont typées à partir des questions |
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

## Traces, rejeu et tests {#traces-replay-and-testing}

| Méthode | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Lire des exécutions |
| `replay(runId, modifications?)` | Exécuter de nouveau sans le LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Comprendre les décisions |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Tester les agents comme du code |

## Outils : `ToolDefinition` {#tools-tooldefinition}

| Champ | |
| --- | --- |
| `name`, `description` | Ce que voit le modèle |
| `schema` | Schéma Zod des arguments ; les appels qui n'y correspondent pas sont refusés |
| `handler(params, context?)` | Reçoit les arguments validés et `{ runId, agentId, signal? }` — `signal` est interrompu quand l'appelant abandonne |
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP qui expose exactement ce que liste `tools` : des noms d'outils définis et/ou des `ToolDefinition` (définies pour vous sur le SDK ; la même définition peut être passée de nouveau, un autre outil portant un nom déjà pris est refusé). `resources` : un ou plusieurs `ResourceProvider` ; chaque lecture est tracée. Les appels s'exécutent sous `mcp:<name>` (ou `agentId`) ; une approbation sur laquelle personne ne statue dans le délai `approvalTimeoutMs` (50 000 ms par défaut) est annulée ; les refus liés à l'entrée sont expliqués au client, les autres causes seulement avec `exposeErrorDetails` |
| `serveMcpOverStdio(sdk, options)` | Identique, connecté à stdin/stdout ; écrit une ligne « ready » sur stderr, et se ferme quand stdin se termine (les appels en cours sont interrompus, les approbations en attente annulées). `approvalTimeoutMs` vaut 50 000 par défaut, comme pour `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — les outils de n'importe quel serveur MCP, sous forme de `ToolDefinition` |

`GovernedToolHost` est ce dont le serveur a besoin de la part du SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`) ; `createSDK()` renvoie un objet qui l'implémente.

## Briques de base {#building-blocks}

Tout ce qu'utilise le SDK est exporté pour les configurations personnalisées : `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, ainsi que tous les types.
