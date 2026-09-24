# API del SDK

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Opción | Tipo | Descripción |
| --- | --- | --- |
| `apiKey` | `string` | Clave del proveedor principal (no hace falta con `llmProvider`). Sin ninguna clave, las herramientas y los servidores MCP funcionan, y las llamadas que necesitan un modelo fallan con un error claro |
| `provider` | `'openai' \| 'anthropic'` | Proveedor principal, `openai` por defecto |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel` y `baseURL` de cada fabricante (`baseURL`: un endpoint compatible, como la API v1 de Azure OpenAI o un servidor de modelos local, o un proxy). El principal usa la entrada de su fabricante, y uno de respaldo de otro fabricante la del suyo |
| `fallbackProviders` | `Array<{ provider, config? }>` | Se prueban en orden cuando falla el principal; un `config` prevalece sobre `providerConfig`. Uno de respaldo del mismo fabricante que el principal no hereda ninguno de sus ajustes (solo la `apiKey` global); uno de otro fabricante necesita su propia clave |
| `llmProvider` | `LLMProvider` | Tu propio proveedor (modelo local, pasarela, doble de prueba). Recibe las llamadas a herramientas y sus resultados en el formato nativo (`LLMMessage`) si declara `nativeToolMessages`, y como texto si no |
| `retry` | `Partial<RetryPolicy> \| false` | Política de reintentos del LLM, por proveedor, antes de la conmutación |
| `jev` | `JevClientConfig` | Activa TypeSafe Jev para las decisiones tipadas — directamente, o a través de [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) con `baseUrl` y `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Cualquier backend de decisiones tipadas (tiene prioridad sobre `jev`) |
| `pricing` | `PricingTable` | USD por millón de tokens, combinados sobre los valores por defecto |
| `incidents` | `IncidentMonitorOptions` | Notificadores, reglas, umbral de gravedad, limitación de frecuencia |
| `eventStore` | `IEventStore` | `FileEventStore('./events')` por defecto |
| `defaultPolicies` | `Policy[]` | Políticas globales |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Almacenamiento de los artefactos de prueba |

## Agentes {#agents}

| Método | Devuelve | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agente gobernado: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Solo puede ejecutar sus propias herramientas (`tools`, `capabilities`), aunque el modelo nombre otra herramienta registrada en el SDK; `signal` cancela la ejecución |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Registra una herramienta; el manejador se tipa a partir de su esquema Zod |
| `defineCapability(definition)` | `Capability` | Agrupa herramientas |
| `listTools()` | `Tool[]` | Todas las herramientas registradas |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | Ejecución gobernada fuera de un agente (la usa el servidor MCP): argumentos, políticas, aprobación, presupuesto (contabilizado cuando empieza la llamada), y después la herramienta. `signal` cancela una aprobación pendiente y llega al manejador; `approvalTimeoutMs` cancela una aprobación que nadie decidió |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Ejecuta `read()` como su propia ejecución: `run.started`, `resource.read` (URI, tamaño, SHA-256), `run.completed` o `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Detiene una ejecución gobernada o cognitiva |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Opción | Por defecto | |
| --- | --- | --- |
| `name`, `model` | — | Obligatorios |
| `profile` | `DEFAULT_THINKER_PROFILE` | Cómo razona el agente |
| `tools`, `policies` | `[]` | Gobernados como en cualquier otro sitio |
| `systemPrompt` | — | Instrucciones adicionales para cada prompt |
| `limits` | consulta [Agentes cognitivos](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` o un `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` o tu propio `HypothesisAssessor` para la operación `compare` |
| `knowledge` | — | Memoria entre ejecuciones: `{ store, scope, recallLimit? (10), record? (true) }`, consulta [Memoria entre ejecuciones](../guide/memory) |
| `evaluator` | — | Un `OutcomeEvaluator` que pone a prueba las predicciones; activa `test_prediction` |
| `generator` | generador LLM sobre `model` | Tu propio `ThoughtGenerator` (comparaciones de observaciones incluidas); sus pensamientos siguen pasando por las reglas de admisión del motor |
| `temperature`, `maxTokens` | `0.4`, — | Ajustes de la generación de pensamientos |
| `providerSettings` | — | Ajustes para la selección de herramientas (motor de razonamiento nativo) |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` es `completed`, `failed` o `cancelled`; `decision.status` es `committed`, `provisional` o `abstain`, y `decision.missing` enumera lo que no está establecido; `state` es el `MentalState` final.

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

Consulta [Evidencia y verificación](../guide/evidence-and-verification).

## Razonamiento y perfiles {#reasoning-profiles}

| Método | Devuelve |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — reconstruido a partir de los eventos |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Decisiones tipadas — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Lanza un `ValidationError` cuando no hay ningún backend configurado.

| Método | Devuelve |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage, runId }` — respuestas tipadas a partir de las preguntas |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Helpers de preguntas: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Operación en producción {#operations}

| Método | Devuelve |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Aprobaciones humanas |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Presupuestos y auditoría de políticas |

## Trazas, repetición y pruebas {#traces-replay-and-testing}

| Método | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Leer las ejecuciones |
| `replay(runId, modifications?)` | Volver a ejecutar sin el LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entender las decisiones |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Probar los agentes como si fueran código |

## Herramientas: `ToolDefinition` {#tools-tooldefinition}

| Campo | |
| --- | --- |
| `name`, `description` | Lo que ve el modelo |
| `schema` | Esquema Zod de los argumentos; las llamadas que no encajan se rechazan |
| `handler(params, context?)` | Recibe los argumentos validados y `{ runId, agentId, signal? }` — `signal` se aborta cuando quien llama se rinde |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — solo herramientas idempotentes; los argumentos no válidos nunca se reintentan |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` hace que cada llamada espere a `approveAction`; `readOnly` se muestra a los clientes MCP como `readOnlyHint` |
| `inputJsonSchema` | JSON Schema que se muestra en lugar del derivado de `schema` |
| `capability`, `version` | Agrupación, versión |

## Fuentes de herramientas {#tool-sources}

Cada una devuelve `ToolDefinition` listas para usar: pásalas a `sdk.defineTool`, a un agente, o directamente a las `tools` de un servidor MCP. Consulta [Un servidor MCP para cualquier cosa](../guide/mcp-recipes).

| Función | Devuelve | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | Una herramienta por operación de una descripción OpenAPI 3; solo `GET` salvo lo que se enumere en `include`; los demás métodos requieren aprobación por defecto. Una llamada devuelve `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` sobre una carpeta, nunca fuera de ella; una carpeta excluida oculta todo lo que contiene |
| `folderResources(options)` | `ResourceProvider` | Los mismos archivos como recursos MCP `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (una sentencia de solo lectura, como máximo `maxRows` filas, 100 por defecto) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Para `DatabaseSync` de `node:sqlite` o para `better-sqlite3`; ejecuta las consultas con `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Para `pg` (un cliente dedicado o un pool); cada consulta en `BEGIN READ ONLY` (se rechaza en una conexión que ya está dentro de una transacción) … `ROLLBACK` + `pg_advisory_unlock_all()`, con `SET LOCAL statement_timeout` (10 s por defecto); `schemas` solo limita el listado y la descripción |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; se cancela junto con quien llama; `error` es genérico salvo con `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | La comprobación de sentencias que usan los adaptadores de base de datos (solo sintaxis de SQLite y PostgreSQL) |

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

| Función | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP que expone exactamente lo que enumera `tools`: nombres de herramientas definidas y/o `ToolDefinition` (definidas en el SDK por ti; se puede volver a pasar la misma definición, y se rechaza otra herramienta con un nombre ya usado). `resources`: uno o varios `ResourceProvider`; cada lectura se traza. Las llamadas se ejecutan como `mcp:<name>` (o `agentId`); una aprobación que nadie decide dentro de `approvalTimeoutMs` (50 000 ms por defecto) se cancela; los rechazos de la entrada se explican al cliente, las demás causas solo con `exposeErrorDetails` |
| `serveMcpOverStdio(sdk, options)` | Lo mismo, conectado a stdin/stdout; escribe una línea "ready" en stderr y se cierra cuando termina stdin (las llamadas en curso se abortan y las aprobaciones pendientes se cancelan). `approvalTimeoutMs` vale 50 000 por defecto, como en `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — las herramientas de cualquier servidor MCP, como `ToolDefinition` |

`GovernedToolHost` es lo que el servidor necesita del SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` devuelve un objeto que lo implementa.

## Piezas de base {#building-blocks}

Las piezas del SDK se exportan para configuraciones personalizadas: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, y todos los tipos.
