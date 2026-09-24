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
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` y `timeout` de cada fabricante (`baseURL`: un endpoint compatible, como la API v1 de Azure OpenAI o un servidor de modelos local, o un proxy; `timeout`: la espera máxima de una respuesta en milisegundos, 10 minutos por defecto, y para una respuesta en streaming la espera máxima entre dos de sus eventos). El principal usa la entrada de su fabricante, y uno de respaldo de otro fabricante la del suyo. Modelos por defecto: `gpt-5.4` y `claude-opus-5`. La entrada de OpenAI también admite `reasoningModels`, `reasoningEffort`, `nativeToolMessages` y `includeStreamUsage`: ver [Modelos de OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Se prueban en orden cuando falla el principal; un `config` prevalece sobre `providerConfig`. Uno de respaldo del mismo fabricante que el principal no hereda ninguno de sus ajustes (solo la `apiKey` global); uno de otro fabricante necesita su propia clave |
| `llmProvider` | `LLMProvider` | Tu propio proveedor (modelo local, pasarela, doble de prueba). Recibe las llamadas a herramientas y sus resultados en el formato nativo (`LLMMessage`) si declara `nativeToolMessages`, y como texto si no; puede transmitir su texto en streaming (consulta [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | Política de reintentos del LLM, por proveedor, antes de la conmutación. Sus `maxRetries` e `initialDelayMs` son también los valores por defecto de `jev.maxRetries` y `jev.retryBaseDelayMs`; sus demás campos no llegan al cliente Jev, que conserva sus propios 2 reintentos y 500 ms con `retry: false`. Se aplica a un `llmProvider` inyectado solo si se fija explícitamente, y nunca a un `FallbackProvider` pasado como `llmProvider` ni a sus proveedores |
| `jev` | `JevClientConfig` | Activa TypeSafe Jev para las decisiones tipadas — directamente, o a través de [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) con `baseUrl` y `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Cualquier backend de decisiones tipadas (tiene prioridad sobre `jev`) |
| `pricing` | `PricingTable` | USD por millón de tokens, combinados sobre los valores por defecto |
| `incidents` | `IncidentMonitorOptions` | Notificadores, reglas, umbral de gravedad, limitación de frecuencia |
| `eventStore` | `IEventStore` | `FileEventStore('./events')` por defecto |
| `defaultPolicies` | `Policy[]` | Políticas globales |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Almacenamiento de los artefactos de prueba |

### Modelos de OpenAI {#openai-models}

Los modelos de razonamiento de OpenAI (la serie o: `o1`, `o3`, `o4-mini`…; y GPT-5 y posteriores: `gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…; también con fecha o ajustados, como `ft:o4-mini-…`) rechazan `max_tokens`, y `temperature` salvo cuando su esfuerzo de razonamiento es `none`. El proveedor de OpenAI los reconoce por su nombre, sin importar mayúsculas y minúsculas: les envía `maxTokens` como `max_completion_tokens`, que también cuenta sus tokens de razonamiento, junto con el esfuerzo de razonamiento. Como el esfuerzo por defecto varía de un modelo a otro, nunca les envía una temperatura: la del agente o la del motor se ignora para ellos. Los demás modelos reciben `temperature` y `max_tokens`, que todo servidor compatible con OpenAI conoce.

::: warning Herramientas y esfuerzo de razonamiento
El SDK llama a OpenAI a través de Chat Completions, donde los modelos GPT-5.4 y posteriores solo llaman a herramientas con el esfuerzo `none`. El modelo por defecto, `gpt-5.4`, usa `none` mientras no fijes otro esfuerzo. GPT-5.5, GPT-5.6 y GPT-6 Sol y Luna tienen `medium` por defecto: un agente con herramientas falla con ellos (`Function tools with reasoning_effort are not supported`) salvo que fijes `reasoningEffort: 'none'`. GPT-6 Astra no puede llamar a herramientas a través de Chat Completions en absoluto. El SDK envía el esfuerzo que fijas tal cual.
:::

| Opción | Por defecto | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Modelo de una petición que no nombra ninguno, y de un proveedor de respaldo que no sirve el modelo del agente |
| `reasoningModels` | Deducido del nombre | `true` o `false`: todos los modelos de este proveedor son, o no son, modelos de razonamiento. Una lista: esos nombres lo son (despliegues de Azure, alias de pasarela), y los demás se reconocen por su nombre |
| `reasoningEffort` | El del modelo | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` o `max`, enviado tal cual solo a los modelos de razonamiento. Cada modelo acepta algunos de estos valores, y la API rechaza los demás |
| `includeStreamUsage` | En la propia API de OpenAI | `true`: se pide el consumo de una respuesta en streaming (`stream_options`), así que su coste se cuenta; `false`: no se pide. Por defecto en `https://api.openai.com/v1` y en hosts regionales como `https://eu.api.openai.com/v1` (en `baseURL` o `OPENAI_BASE_URL`), ya que un servidor compatible puede rechazar el campo (la petición se vuelve a enviar entonces sin él) o ignorarlo, y una llamada en streaming sin consumo cuenta como no medida. Con un presupuesto de coste en un servidor compatible que devuelve el consumo (la API v1 de Azure OpenAI lo hace), fija `true` |
| `nativeToolMessages` | `true` | `false` para un servidor compatible que no acepta, en la conversación, los `tool_calls` del asistente ni los mensajes `tool`: las llamadas a herramientas anteriores y sus resultados se envían entonces como texto, mientras que las herramientas se siguen ofreciendo y las llamadas a herramientas de las respuestas se siguen leyendo. `false` en el principal o en cualquier proveedor de respaldo se aplica a toda la cadena |

Estas opciones van en `providerConfig.openai` o en el `config` de un proveedor de respaldo de OpenAI. Uno de respaldo de otro fabricante toma de `providerConfig.openai` cada opción que su `config` no fija; uno del mismo fabricante que el principal no toma ninguna. Un agente o una ejecución fija su propio esfuerzo en `providerSettings.openai.reasoningEffort`: prevalece el de la ejecución, luego el del agente y luego el del proveedor. Un agente cognitivo solo lo aplica a la selección de herramientas; sus pensamientos, que no ofrecen herramientas, usan su opción `reasoningEffort`.

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

Tu propio proveedor implementa `generateCompletion(request)`, `supportsModel(model)` y `getProviderName()`, y puede declarar `nativeToolMessages`. Dos campos de la solicitud tienen que ver con el streaming:

| Campo de `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | Está definido cuando quien llama quiere el texto a medida que se escribe (una ejecución con `onText`). Llámalo con cada fragmento de texto en cuanto llegue y después devuelve como siempre la `LLMResponse` completa: los fragmentos unidos deben formar su `content`. Un proveedor que no admite streaming lo ignora, y el SDK pasa todo el `content` de una sola vez. No debe lanzar excepciones (el del SDK nunca lo hace) |
| `onTextRestart?()` | Llámalo cuando vuelvas a intentarlo después de un intento que ya había transmitido texto (un reintento propio): ese texto deja de valer, y los fragmentos siguientes empiezan de nuevo la respuesta. `RetryingLLMProvider` y `FallbackProvider` lo llaman para los proveedores que envuelven |

## Agentes {#agents}

| Método | Devuelve | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agente gobernado: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Solo puede ejecutar sus propias herramientas (`tools`, `capabilities`), aunque el modelo nombre otra herramienta registrada en el SDK; `signal` cancela la ejecución; `onText` recibe el texto que escribe el modelo a medida que lo escribe, y `onTextRestart` la parte que hay que descartar cuando se vuelve a intentar una llamada al modelo que falló (consulta [Recibir la respuesta en streaming](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Sus pensamientos son estructurados y no se transmiten en streaming |
| `defineTool(definition)` | `Tool` | Registra una herramienta; el manejador se tipa a partir de su esquema Zod |
| `defineCapability(definition)` | `Capability` | Agrupa herramientas |
| `listTools()` | `Tool[]` | Todas las herramientas registradas |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Ejecución gobernada fuera de un agente (la usa el servidor MCP): argumentos, políticas, aprobación, presupuesto (contabilizado cuando empieza la llamada), y después la herramienta. `signal` cancela una aprobación pendiente y llega al manejador; `approvalTimeoutMs` cancela una aprobación que nadie decidió |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Ejecuta `read()` como su propia ejecución: `run.started`, `resource.read` (URI, tamaño, SHA-256), `run.completed` o `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Detiene una ejecución gobernada o cognitiva |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Opción | Por defecto | |
| --- | --- | --- |
| `name`, `model` | — | Obligatorios |
| `profile` | `DEFAULT_THINKER_PROFILE` | Cómo razona el agente |
| `tools`, `policies` | `[]` | Gobernados como en cualquier otro sitio; las políticas de presupuesto y de tiempo límite también se comprueban antes de cada paso, consulta [Límites y políticas](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | Instrucciones adicionales para cada prompt |
| `limits` | consulta [Agentes cognitivos](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` o un `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` o tu propio `HypothesisAssessor` para la operación `compare` |
| `knowledge` | — | Memoria entre ejecuciones: `{ store, scope, recallLimit? (10), record? (true) }`, consulta [Memoria entre ejecuciones](../guide/memory) |
| `evaluator` | — | Un `OutcomeEvaluator` que pone a prueba las predicciones; activa `test_prediction` |
| `generator` | generador LLM sobre `model` | Tu propio `ThoughtGenerator` (comparaciones de observaciones incluidas); sus pensamientos siguen pasando por las reglas de admisión del motor |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Ajustes de la generación de pensamientos (`reasoningEffort`: solo modelos de razonamiento de OpenAI) |
| `providerSettings` | — | Ajustes para la selección de herramientas (motor de razonamiento nativo), incluido `openai.reasoningEffort` |

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
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — respuestas tipadas a partir de las preguntas; sin `usage` cuando el backend no informó de ningún número de tokens |
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

### `RunCostReport` {#runcostreport}

Lo que devuelve `getRunCost(runId)`: las llamadas al modelo de la ejecución, pasos fallidos incluidos — consulta [Costes de API](../guide/costs).

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

| Campo | |
| --- | --- |
| `totalUsd` | Coste de las llamadas cuyo coste se conoce; solo un mínimo cuando `complete` es `false` |
| `complete` | `false` cuando el coste de algunas llamadas es desconocido: `unpricedCalls` o `unmeteredCalls` mayor que 0 |
| `unpricedModels`, `unpricedCalls` | Modelos sin precio en `pricing`, y sus llamadas que informaron de sus tokens |
| `unmeteredModels`, `unmeteredCalls` | Modelos de las llamadas que no informaron de ningún número de tokens de entrada o de salida, y esas llamadas |
| `lines` | Una por modelo y origen: llamadas, tokens de las llamadas que informaron de ellos, `unmeteredCalls` si las hay, `costUsd` cuando el modelo tiene precio y alguna llamada de la línea informó de sus tokens; `model` es `(unknown)` para una llamada que no registró ningún nombre de modelo |

## Trazas, repetición y pruebas {#traces-replay-and-testing}

| Método | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Leer las ejecuciones |
| `replay(runId, modifications?, { onEvent? })` | Volver a ejecutar sin el LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entender las decisiones |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Probar los agentes como si fueran código |

## Eventos en tiempo real {#live-events}

Un listener es `(event: Event) => unknown`. Recibe los eventos de uno en uno, en el orden de cada ejecución, una vez que el almacén los ha aceptado; una promesa que devuelva se espera antes de su siguiente evento. Las ejecuciones nunca lo esperan, y sus errores se notifican, nunca se lanzan dentro de la ejecución. Como máximo `maxQueued` eventos (10 000 por defecto) lo esperan; por encima de esa cifra, los nuevos se descartan para él y se notifican con un `LiveEventsDroppedError`. Consulta [Progreso en tiempo real](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Todos los eventos de la ejecución; `run()` se resuelve una vez que el listener ha terminado con cada uno de ellos, o antes si la ejecución se detuvo o se canceló o si `signal` se aborta (entonces se cancela la suscripción del listener). El listener no se guarda en el registro de eventos |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | Lo mismo para una ejecución cognitiva, cuyo `limits.timeoutMs` también termina la espera |
| `replay(runId, modifications?, { onEvent })` | Lo mismo para una repetición, que no se puede cancelar: siempre espera |
| `executeTool(name, params, { onEvent })` | Los eventos de la llamada, y los de las ejecuciones que inicia su herramienta, a un solo nivel de profundidad: el manejador recibe el listener como `context.onEvent`, que `governedAgentTool` y `cognitiveAgentTool` pasan a su agente (un agente construido a mano sobre un almacén sin eventos en tiempo real se ejecuta sin él). `signal` termina la espera |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: todos los eventos de todas las ejecuciones que coinciden con el filtro (`agentId` es `metadata.agentId`), hasta que llamas a la función devuelta, que descarta los eventos aún no entregados |
| `new ObservedEventStore(store, { onListenerError? })` | La capa que los entrega; el SDK envuelve su almacén en una, o usa la que pases como `eventStore`, también dentro de un `MonitoredEventStore` (cuyos informes de incidentes se entregan entonces también). Su `subscribe(listener, options?)` devuelve `{ unsubscribe(), close() }`: `close()` espera a que el listener haya terminado con los eventos que ya tomó. `onListenerError` recibe los errores de los listeners y los descartes de eventos |

## Herramientas: `ToolDefinition` {#tools-tooldefinition}

| Campo | |
| --- | --- |
| `name`, `description` | Lo que ve el modelo |
| `schema` | Esquema Zod de los argumentos; las llamadas que no encajan se rechazan |
| `handler(params, context?)` | Recibe los argumentos validados y `{ runId, agentId, signal?, onEvent? }` — `signal` se aborta cuando quien llama se rinde; `onEvent` está definido cuando quien llama sigue la llamada en tiempo real: pásalo como el `onEvent` de las ejecuciones que inicia la herramienta |
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP que expone exactamente lo que enumera `tools`: nombres de herramientas definidas y/o `ToolDefinition` (definidas en el SDK por ti; se puede volver a pasar la misma definición, y se rechaza otra herramienta con un nombre ya usado). `resources`: uno o varios `ResourceProvider`; cada lectura se traza. Las llamadas se ejecutan como `mcp:<name>` (o `agentId`); una aprobación que nadie decide dentro de `approvalTimeoutMs` (50 000 ms por defecto) se cancela; los rechazos de la entrada se explican al cliente, las demás causas solo con `exposeErrorDetails`. Una llamada con un `progressToken` recibe una notificación `notifications/progress` por evento, todas enviadas antes del resultado ([notificaciones de progreso](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | Lo mismo, conectado a stdin/stdout; escribe una línea "ready" en stderr y se cierra cuando termina stdin (las llamadas en curso se abortan y las aprobaciones pendientes se cancelan). `approvalTimeoutMs` vale 50 000 por defecto, como en `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — las herramientas de cualquier servidor MCP, como `ToolDefinition` |

`GovernedToolHost` es lo que el servidor necesita del SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` devuelve un objeto que lo implementa.

## Piezas de base {#building-blocks}

Las piezas del SDK se exportan para configuraciones personalizadas: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, y sus tipos principales.
