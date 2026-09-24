# SDK-API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Option | Typ | Beschreibung |
| --- | --- | --- |
| `apiKey` | `string` | Schlüssel des primären Anbieters (mit `llmProvider` nicht nötig). Ohne jeden Schlüssel funktionieren Tools und MCP-Server, und Aufrufe, die ein Modell brauchen, schlagen mit einem klaren Fehler fehl |
| `provider` | `'openai' \| 'anthropic'` | Primärer Anbieter, Standard `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | Einstellungen des primären Anbieters, unter seinem Namen: `apiKey`, `defaultModel` und `baseURL` (ein kompatibler Endpunkt wie die v1-API von Azure OpenAI oder ein lokaler Modellserver, oder ein Proxy) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Der Reihe nach versucht, wenn der primäre Anbieter ausfällt; jede `config` hat ihre eigenen `apiKey`, `defaultModel` und `baseURL` |
| `llmProvider` | `LLMProvider` | Ihr eigener Anbieter (lokales Modell, Gateway, Test-Double) |
| `retry` | `Partial<RetryPolicy> \| false` | Wiederholungsrichtlinie für das LLM, pro Anbieter, vor dem Fallback |
| `jev` | `JevClientConfig` | Aktiviert TypeSafe Jev für typisierte Entscheidungen – direkt oder über [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) mit `baseUrl` und `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Jedes beliebige Backend für typisierte Entscheidungen (hat Vorrang vor `jev`) |
| `pricing` | `PricingTable` | USD pro Million Tokens, über die Standardwerte gelegt |
| `incidents` | `IncidentMonitorOptions` | Notifier, Regeln, Schweregradschwelle, Drosselung |
| `eventStore` | `IEventStore` | Standard: `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Globale Richtlinien |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Speicherort der Test-Artefakte |

## Agenten {#agents}

| Methode | Rückgabe | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Kontrollierter Agent: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Er kann nur seine eigenen Tools ausführen (`tools`, `capabilities`), selbst wenn das Modell ein anderes im SDK registriertes Tool nennt; `signal` bricht den Lauf ab |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Registriert ein Tool; der Handler wird aus seinem Zod-Schema typisiert |
| `defineCapability(definition)` | `Capability` | Gruppiert Tools |
| `listTools()` | `Tool[]` | Jedes registrierte Tool |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | Kontrollierte Ausführung außerhalb eines Agenten (vom MCP-Server verwendet): Argumente, Richtlinien, Freigabe, Budget (beim Start des Aufrufs gezählt), dann das Tool. `signal` bricht eine ausstehende Freigabe ab und erreicht den Handler; `approvalTimeoutMs` bricht eine Freigabe ab, über die niemand entschieden hat |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Führt `read()` als eigenen Lauf aus: `run.started`, `resource.read` (URI, Größe, SHA-256), `run.completed` oder `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Hält einen kontrollierten oder kognitiven Lauf an |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Option | Standard | |
| --- | --- | --- |
| `name`, `model` | — | Erforderlich |
| `profile` | `DEFAULT_THINKER_PROFILE` | Wie der Agent denkt |
| `tools`, `policies` | `[]` | Kontrolliert wie überall sonst |
| `systemPrompt` | — | Zusätzliche Anweisungen für jeden Prompt |
| `limits` | siehe [Kognitive Agenten](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` oder ein `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` oder Ihr eigener `HypothesisAssessor` für die Operation `compare` |
| `knowledge` | — | Gedächtnis über Läufe hinweg: `{ store, scope, recallLimit? (10), record? (true) }`, siehe [Gedächtnis über Läufe hinweg](../guide/memory) |
| `evaluator` | — | Ein `OutcomeEvaluator`, der Vorhersagen testet; aktiviert `test_prediction` |
| `generator` | LLM-Generator auf `model` | Ihr eigener `ThoughtGenerator` (Vergleiche von Beobachtungen eingeschlossen); seine Gedanken durchlaufen trotzdem die Aufnahmeregeln der Engine |
| `temperature`, `maxTokens` | `0.4`, — | Einstellungen der Gedankengenerierung |
| `providerSettings` | — | Einstellungen für die Tool-Auswahl (native Reasoning Engine) |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` – `status` ist `completed`, `failed` oder `cancelled`; `decision.status` ist `committed`, `provisional` oder `abstain`, wobei `decision.missing` auflistet, was nicht gesichert ist; `state` ist der endgültige `MentalState`.

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

Siehe [Belege & Verifikation](../guide/evidence-and-verification).

## Denken & Profile {#reasoning-profiles}

| Methode | Rückgabe |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` – aus Ereignissen rekonstruiert |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` – JSON Lines |

## Typisierte Entscheidungen – `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Wirft einen `ValidationError`, wenn kein Backend konfiguriert ist.

| Methode | Rückgabe |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` – Antworten aus den Fragen typisiert |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Hilfsfunktionen für Fragen: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Betrieb {#operations}

| Methode | Rückgabe |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Menschliche Freigaben |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets und Audit der Richtlinien |

## Traces, Replay und Tests {#traces-replay-and-testing}

| Methode | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Läufe lesen |
| `replay(runId, modifications?)` | Ohne das LLM erneut ausführen |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entscheidungen verstehen |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Agenten wie Code testen |

## Tools: `ToolDefinition` {#tools-tooldefinition}

| Feld | |
| --- | --- |
| `name`, `description` | Was das Modell sieht |
| `schema` | Zod-Schema der Argumente; Aufrufe, die nicht passen, werden abgelehnt |
| `handler(params, context?)` | Erhält die validierten Argumente und `{ runId, agentId, signal? }` – `signal` wird abgebrochen, wenn der Aufrufer aufgibt |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` – nur idempotente Tools; ungültige Argumente werden nie wiederholt |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` – `requiresApproval: true` lässt jeden Aufruf auf `approveAction` warten; `readOnly` wird MCP-Clients als `readOnlyHint` angezeigt |
| `inputJsonSchema` | JSON Schema, das anstelle des aus `schema` abgeleiteten angezeigt wird |
| `capability`, `version` | Gruppierung, Version |

## Tool-Quellen {#tool-sources}

Jede liefert fertige `ToolDefinition`s: Übergeben Sie sie an `sdk.defineTool`, an einen Agenten oder direkt an `tools` eines MCP-Servers. Siehe [Ein MCP-Server für alles](../guide/mcp-recipes).

| Funktion | Rückgabe | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | Ein Tool pro Operation einer OpenAPI-3-Beschreibung; nur `GET`, sofern nicht in `include` aufgelistet; andere Methoden erfordern standardmäßig eine Freigabe. Ein Aufruf liefert `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` über einen Ordner, nie außerhalb davon; ein ausgeschlossener Ordner verbirgt alles, was er enthält |
| `folderResources(options)` | `ResourceProvider` | Dieselben Dateien als MCP-Ressourcen `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (eine schreibgeschützte Anweisung, höchstens `maxRows` Zeilen, standardmäßig 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Für `DatabaseSync` von `node:sqlite` oder `better-sqlite3`; führt Abfragen mit `PRAGMA query_only = ON` aus |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Für `pg` (ein dedizierter Client oder ein Pool); jede Abfrage in `BEGIN READ ONLY` (abgelehnt auf einer Verbindung, die sich bereits in einer Transaktion befindet) … `ROLLBACK` + `pg_advisory_unlock_all()`, mit `SET LOCAL statement_timeout` (standardmäßig 10 s); `schemas` begrenzt nur das Auflisten und Beschreiben |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; wird mit dem Aufrufer abgebrochen; `error` ist generisch, außer mit `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | Die Anweisungsprüfung der Datenbankadapter (nur SQLite- und PostgreSQL-Syntax) |

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

## MCP – `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| Funktion | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | MCP-`Server`, der genau das bereitstellt, was `tools` auflistet: Namen definierter Tools und/oder `ToolDefinition`s (für Sie auf dem SDK definiert; dieselbe Definition darf erneut übergeben werden, ein anderes Tool mit einem bereits vergebenen Namen wird abgelehnt). `resources`: ein oder mehrere `ResourceProvider`; jeder Lesevorgang wird nachverfolgt. Aufrufe laufen als `mcp:<name>` (oder `agentId`); eine Freigabe, über die niemand innerhalb von `approvalTimeoutMs` (standardmäßig 50 000 ms) entscheidet, wird abgebrochen; Ablehnungen der Eingabe werden dem Client erklärt, andere Ursachen nur mit `exposeErrorDetails` |
| `serveMcpOverStdio(sdk, options)` | Dasselbe, verbunden mit stdin/stdout; schreibt eine „ready“-Zeile auf stderr und schließt, wenn stdin endet (laufende Aufrufe werden abgebrochen, ausstehende Freigaben aufgehoben). `approvalTimeoutMs` ist standardmäßig 50 000, wie bei `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` – die Tools eines beliebigen MCP-Servers, als `ToolDefinition`s |

`GovernedToolHost` ist das, was der Server vom SDK braucht (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` liefert ein Objekt, das es implementiert.

## Bausteine {#building-blocks}

Alles, was das SDK verwendet, wird für eigene Konfigurationen exportiert: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore` und alle Typen.
