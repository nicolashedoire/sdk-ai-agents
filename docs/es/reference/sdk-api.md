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
| `includeStreamUsage` | En la propia API de OpenAI | `true`: se pide el consumo de una respuesta en streaming (`stream_options`), así que su coste se cuenta; `false`: no se pide. Por defecto en `https://api.openai.com/v1` y en hosts regionales como `https://eu.api.openai.com/v1` (en `baseURL` o `OPENAI_BASE_URL`), ya que un servidor compatible puede rechazar el campo (la petición se vuelve a enviar entonces sin él, salvo a la propia API de OpenAI, que lo acepta) o ignorarlo, y una llamada en streaming sin consumo cuenta como no medida. Con un presupuesto de coste en un servidor compatible que devuelve el consumo (la API v1 de Azure OpenAI lo hace), fija `true` |
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
| `createAgent(config)` | `AgentImpl` | Agente gobernado: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. Solo puede ejecutar sus propias herramientas (`tools`, `capabilities`), aunque el modelo nombre otra herramienta registrada en el SDK; `signal` cancela la ejecución; `onText` recibe el texto que escribe el modelo a medida que lo escribe, y `onTextRestart` la parte que hay que descartar cuando se vuelve a intentar una llamada al modelo que falló (consulta [Recibir la respuesta en streaming](../guide/governed-agents#_7-streaming-the-answer)) |
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

## Estudios {#studies}

Un estudio es un investigador: comprende un objeto, después propone cómo rediseñarlo con los conocimientos y las técnicas de hoy, y diseña los experimentos que permitirían decidir. Consulta [Estudios](../guide/studies).

| Método | Devuelve | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | Comprueba la configuración, resuelve las fuentes y congela la carta. Lanza un `ValidationError` ante una configuración incorrecta, o ante una fuente que no es una herramienta definida o que no acepta una consulta de texto |

### `StudyConfig` {#studyconfig}

| Opción | Por defecto | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | Obligatorios y no vacíos. `name` se registra con los eventos del estudio (`metadata.studyName`); el objetivo nunca cambia: un objetivo nuevo es un estudio nuevo |
| `question` | La pregunta guía del método y la meta de capacidad, en `language` | La pregunta guía |
| `needs`, `leads`, `analogues` | `[]` | Necesidades y criterios de hoy; tus pistas, ejemplos por verificar, cada una con un veredicto; rupturas por ensamblaje por deconstruir (`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | Lo que queda fuera del alcance |
| `capability` | — | La nueva capacidad buscada; sin ella, el estudio propone candidatas |
| `sources` | `[]` | Nombres de las herramientas del SDK con las que busca el estudio, definidas antes que el estudio (por ejemplo, las herramientas de `connectMcpServer`); sin fuentes no se puede establecer nada |
| `model` | El modelo por defecto del proveedor | Modelo de todas las llamadas |
| `llmProvider` | El proveedor del SDK | Un proveedor para este estudio |
| `language` | `'en'` | Idioma de los textos y del dosier, como etiqueta de idioma (`fr`, `pt-BR`…) |
| `limits` | consulta [`StudyLimits`](#studylimits) | Un límite omitido conserva su valor por defecto |
| `driftThreshold` | `1/3` (`DEFAULT_DRIFT_THRESHOLD`) | Proporción de los elementos de un pasaje, de 0 a 1, que pueden rechazarse antes de que el pasaje se rehaga una vez |
| `temperature`, `maxTokens` | `0.4`, — | De los pasajes y de las peticiones de búsqueda; el guardián, las enmiendas y la comprobación de lo existente se ejecutan a 0 |

La carta (`StudyCharter`) contiene `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability` y `analogues`, sin las entradas repetidas de las listas (sin distinguir mayúsculas de minúsculas). Se congela y se calcula su huella; `name` no forma parte de ella.

### `StudyLimits` {#studylimits}

Por ejecución. `DEFAULT_STUDY_LIMITS` contiene los valores por defecto; un valor fuera de rango lanza un `ValidationError`.

| Límite | Por defecto | Rango | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1 a 10 000 | Llamadas al modelo, reparaciones y comprobaciones incluidas; al alcanzarse, la ejecución se detiene (`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | 0 a 10 000 | Búsquedas; una vez agotadas, la ejecución continúa sin buscar (aviso `searchesSkipped`) |
| `maxLoops` | 1 | 0 a 10 | Pasajes anteriores que la ejecución puede reabrir |
| `timeoutMs` | 1 200 000 (20 minutos) | 1 a 2 147 483 647 | Duración de la ejecución; al alcanzarse, la ejecución se interrumpe (`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | 1 a 50 | Resultados que se conservan de una búsqueda |

### `Study` {#study}

| Miembro | |
| --- | --- |
| `id` | `study_…`, nuevo para cada estudio: el `metadata.agentId` de sus eventos y el id de agente de sus presupuestos, de sus políticas y de sus llamadas a herramientas |
| `name`, `language`, `charter`, `charterHash` | El nombre, el idioma, el `StudyCharter` congelado y su SHA-256 (hexadecimal), registrado en `study.started` y con cada enmienda |
| `amendments` | `StudyAmendment[]`: aceptadas y rechazadas, en orden |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. Reanuda donde se detuvo la última ejecución: el guardián juzga primero lo que esa ejecución dejó sin juzgar, un pasaje juzgado pero no terminado se limita a terminar, y después se ejecutan los pasajes no completos. `restart` vuelve a empezar el estudio desde cero: se borran los pasajes, los resultados, las búsquedas, el registro de desvíos, la numeración y las ejecuciones; la carta y las enmiendas se quedan. Un límite, una política, una cancelación o un error terminan la ejecución con su estado y el informe de lo que se hizo; solo lanza una excepción ante una ejecución que ya está en curso, un `onEvent` que no se puede atender o un almacén de eventos que falla. `onEvent` funciona como con `agent.run` |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. Se clasifica frente a la carta sola, nunca frente a enmiendas anteriores (dos que se contradicen pueden aceptarse las dos), una a una en el orden en que se pidieron, en una ejecución propia (`mode: 'study-amendment'`) en la que antes se comprueban las políticas de presupuesto; solo se acepta `refines`, que aparece en todos los prompts posteriores. `timeoutMs` (60 000 por defecto, contado desde su turno) y `signal` acotan la clasificación: si se superan, o si una política la rechaza, la enmienda se rechaza como `unclassified`. Lanza un `ValidationError` para un texto vacío, un texto de más de `MAX_AMENDMENT_LENGTH` (500 caracteres), o cuando le llega su turno una vez aceptadas `MAX_AMENDMENTS` (10) enmiendas |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. Rellena los campos 10 y 11 de una ficha y registra `study.result_recorded` en la ejecución que la escribió; un `ValidationError` para una ficha desconocida o un `result` vacío |
| `report()` | `StudyReport`: el informe tal como está, incluidos los resultados registrados desde la última ejecución |

Un estudio se crea con `sdk.createStudy`: la clase `Study` se exporta por su tipo, y aquello con lo que se construye es interno. `MAX_AMENDMENTS` y `MAX_AMENDMENT_LENGTH` se exportan, y también `StudyAmendOptions`, el tipo de las opciones de `amend`.

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status` es `completed`; `stopped` cuando un límite o una política de presupuesto o de tiempo límite terminó la ejecución, con `stoppedBy` (`maxModelCalls`, `timeoutMs` o `policy`); `failed` cuando la terminó un error; o `cancelled`. `error` es el `Error` que terminó la ejecución, `report` el `StudyReport` en el momento en que terminó, y `markdown` lo mismo en forma de dosier.

### `StudyReport` {#studyreport}

```ts
interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  amendments: StudyAmendment[];
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];                       // { code, message, details? }
  passages: StudyPassageState[];                // { passage, state, attempts, reopenedBy, runId? }
  observations: StudyObservation[];             // O1…
  pieces: StudyPiece[];                         // P1…
  chain: StudyChainStage[];                     // C1…
  threeStates: StudyPieceStates[];              // { piece, atItsTime, currentBest, proposal }
  historicalChoices: StudyHistoricalChoice[];   // H1…
  advances: StudyAdvance[];                     // V1…
  leadVerdicts: StudyLeadVerdict[];             // L1…
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];     // I1…
  references: StudyReference[];                 // R1…
  analogues: StudyAnalogue[];                   // B1…
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];               // K1…
  revisableDecisions: StudyRevisableDecision[]; // D1…
  combinations: StudyCombination[];             // X1…
  capabilities: StudyCapability[];              // Y1…
  architectures: StudyArchitecture[];           // A1…: new capabilities, existing ones, improvements
  noveltyClaims: StudyNoveltyClaim[];           // N1…
  experiments: StudyExperiment[];               // E1…
  cards: MechanismCard[];                       // M1…
  results: StudySearchResult[];                 // S1…
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  runIds: string[];                             // runs of run() since the last restart, oldest first
}

interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  status: 'established' | 'hypothesis' | 'novelty'; // after the study's checks
  declaredStatus?: StudyClaimStatus;                // the model's, when the study changed it
  statusReason?: StudyReason;
  sources: string[];                                // results listed in the prompt that wrote it
  unlistedSources?: string[];                       // cited, not listed in that prompt: they support nothing
  servesObjective: string;
  toVerify?: boolean;                               // prior art not assessed: a novelty, or a capability's assembly
  priorArtReason?: StudyReason;                     // a capability that is not a novelty: why not checked, or assemblyExists
  priorArt?: { closest: string; sources: string[]; verdict: 'novel' | 'partlyNovel' | 'exists' };
  unchecked?: boolean;                              // not judged by the guardian: kept out of later prompts
  runId: string;
}

interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  message: string;                                  // the same reason, in English
}

interface StudyTrace {
  from: string[];                                   // records of the investigation it comes from
  unknownFrom?: string[];                           // cited, not listed in the design's prompt
  untraced?: boolean;                               // it cites none of the listed records
}
```

Cada motivo del informe es un `StudyReason`: el `statusReason` de las afirmaciones y de los componentes, el `priorArtReason` de una capacidad que no es una novedad, el `reason` de las entradas del registro de desvíos y de las enmiendas, y el `kindReason` de una arquitectura rebajada. El dosier presenta su `code` en el idioma del estudio (`studyLabels(language).reasons`); un texto que escribió el guardián o el modelo tiene el código `judged`, en `params.text`. Los códigos (`StudyReasonCode`):

| Códigos | Por qué |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | Una afirmación o un componente `established` rebajado a `hypothesis`: ninguna fuente, o ningún identificador enumerado en su prompt |
| `priorArtNotSearchedYet`, `priorArtNoSource`, `priorArtSearchBudget`, `priorArtNotSearched`, `priorArtSearchFailed`, `priorArtNoResult`, `priorArtNotAssessed`, `priorArtUnsupported` | Por qué lo existente sobre una novedad, o sobre el ensamblaje de una capacidad, sigue por verificar (su texto en inglés empieza por "To verify against prior art:") |
| `priorArtExists` | Una novedad rebajada a `hypothesis`: el trabajo existente más cercano ya lo hace |
| `assemblyExists` | Una capacidad que no es una novedad, cuyo ensamblaje ya existe (en su `priorArtReason`) |
| `componentDocumented`, `componentUndocumented` | Un componente presentado como nuevo |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead` | Un elemento rechazado por el esquema |
| `leadAlreadyJudged` | Un veredicto dado de nuevo sobre una pista ya juzgada: se descarta, no es un desvío (`duplicates` de `study.passage_completed`) |
| `designWithoutCapability` | Un diseño sin ninguna nueva capacidad |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | Una enmienda que no se pudo clasificar |
| `judged` | Las propias palabras del guardián o del modelo |

Cada elemento es un `StudyClaim` con campos propios:

| Tipo | Sus campos propios |
| --- | --- |
| `StudyObservation` | `kind` (`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?` (la pieza que detalla) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors` (`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain` (`object` u `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead` (tal como la escribe la carta), `verdict` (`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind` (`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?` (el número de la ruptura de la carta que deconstruye), `domain?`, `date?`, `components` (dos o más `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state` (`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because` (la condición que cambió), `opens` |
| `StudyCombination` | `a`, `b`, `enables` (lo que A permite hacer a B), `exchange`, `cost`, `changes` (`representation`, `distribution`, `responsibilities`, `trust`, `verification`, `other`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind` (`capability` o `improvement`), `declaredKind?` y `kindReason?` (una capacidad que el guardián juzgó solo más rápida o más barata), `capability` (`what`, `forWhom`, `liftedConstraint`), `principleChange?` (`principle`: `representation`, `distribution`, `responsibility`, `trust`, `verification` u `other`; `change`), `mechanism`, `components` (`StudyComponent[]`: `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?`, y un `StudyTrace`), `assembly` (`component`, `gives`, `exchanges`, `cost`, y un `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain` (`stage`, `how`), `uncoveredStages` (etapas de la cadena completa que deja fuera, según la comprobación del estudio), `predictions` |
| `StudyThreeState` | `piece`, `state` (`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected` (`architecture`, `result`), `wholeChain` |
| `MechanismCard` | Campos 1 a 9: `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment`; campos 10 y 11 una vez que los hayas registrado: `resultAndError?` (`result`, `error?`), `conclusionAndMemory?`, y `resultRecordedAt?` |

Las demás entradas del informe no son afirmaciones:

| Tipo | Campos |
| --- | --- |
| `StudyAmendment` | `number?` (solo las aceptadas, a partir de 1), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`StudyReason`), `by` (`guardian`: fuera del objetivo; `schema`: rechazado antes, por ejemplo por no tener `servesObjective`), `attempt` (2 en un pasaje rehecho), `runId` |
| `StudySearchResult` | `id` (`S1`…, que se conserva cuando se vuelve a encontrar el mismo resultado, hasta un reinicio), `title`, `locator` (una URL u otro localizador), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose` (`research` o `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `skipped?` (`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state` (`complete`; `partial`: juzgado pero no terminado, a la espera de su bucle o con su búsqueda de lo existente interrumpida; `unchecked`: elementos que el guardián no ha juzgado; `notRun`), `attempts` (2 tras rehacerlo), `keptAttempt?` y `discarded?` (`attempt`, `items`: un segundo intento descartado en favor de un primer intento mejor), `reopenedBy`, `runId?` |
| `StudyNotice` | `code` (`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `passagesOutdated`, `capabilitiesToVerify`, `capabilitiesExist`, `noveltiesToVerify`), `params?` (`limit`, `error`, `count`), `details?` (los pasajes, pares `passage.collection`, pistas, rupturas o arquitecturas afectados), `message` (en inglés; el dosier presenta el código en su idioma) |
| `StudyStats` | Desde el último reinicio: `runs` y `modelCalls` (ejecuciones de `run()`, y las llamadas que respondió el proveedor en ellas), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus` (por estado), `downgraded` (afirmaciones cuyo estado rebajó el estudio), `noveltiesToVerify`, `redos`, `loops`. Y `amendments` (`count`, `modelCalls`): todas las enmiendas del estudio, contadas aparte |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

Devuelve el informe como un dosier Markdown legible, en el idioma del informe: el `markdown` de un `StudyResult`. Llámala sobre `study.report()` para incluir los resultados registrados desde entonces. Sus palabras vienen de `studyLabels(language)` (`StudyLabels`), que existen en los once idiomas de esta documentación (`StudyLabelLanguage`); otro idioma, o uno desconocido, recibe las palabras en inglés, y `fr-CA` recibe las francesas.

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
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| Campo | |
| --- | --- |
| `totalUsd` | Coste de las llamadas cuyo coste se conoce; solo un mínimo cuando `complete` es `false` |
| `complete` | `false` cuando el coste de algunas llamadas es desconocido: `unpricedCalls` o `unmeteredCalls` mayor que 0 |
| `unpricedModels`, `unpricedCalls` | Modelos sin precio en `pricing`, y sus llamadas que informaron de sus tokens |
| `unmeteredModels`, `unmeteredCalls` | Modelos de las llamadas que no informaron a la vez de sus tokens de entrada y de salida, y esas llamadas |
| `lines` | Una por modelo, modelo pedido y origen: llamadas, tokens de las llamadas medidas, `unmeteredCalls` si las hay, `unmeteredTokens` para los tokens de estas, `costUsd` cuando el modelo tiene precio y alguna llamada de la línea está medida; `model` es `(unknown)` para una llamada que no registró ningún nombre de modelo |

## Trazas, repetición y pruebas {#traces-replay-and-testing}

| Método | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Leer las ejecuciones |
| `replay(runId, modifications?, { onEvent? })` | Volver a ejecutar sin el LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entender las decisiones |

### Trazas de referencia {#golden-traces}

| Método | Devuelve | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | Guarda una ejecución como referencia, con el nombre del agente gobernado que la hizo (`agentName`) |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: el id o el nombre de un agente |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` o `partial`, con cada diferencia (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) y su posición |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | Las mismas diferencias como regresiones, cada una con una gravedad y un impacto: `no_regression` o `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | Repite la ejecución y luego valida la repetición. Una repetición no llama a ningún modelo: compárala con `validateAspects: ['tools', 'policies']` |

Las ejecuciones se comparan **por lo que significan sus eventos**, nunca por el id de los eventos (cada ejecución tiene ids nuevos). Los eventos se emparejan en orden: primero los eventos idénticos, después los del mismo tipo y tema (la herramienta, la operación, el pasaje de un estudio, la respuesta) cuyos datos cambiaron, y después aquellos cuyo tipo cambió para el mismo tema. Nunca se comparan: los ids de los eventos, las horas, los metadatos, los eventos `incident.reported` (registran los envíos y la limitación de alertas; el evento que provocó el incidente sí se compara) y los valores que escribe el SDK y que cambian de una ejecución a otra: la duración de una llamada a herramienta, el consumo de tokens, las esperas entre reintentos, los ids de aprobación, la ejecución de origen de una repetición, la hora y el evento de origen de una observación. El texto que un modelo escribe junto a una llamada a herramienta solo se compara en `intention.generated`. Los parámetros, el resultado y la entrada de una herramienta se comparan siempre, se llamen como se llamen sus claves: un argumento `duration` que pasó de 30 a 60 es un cambio. Una ejecución que vuelve a hacer lo mismo pasa; una herramienta llamada con otros argumentos se señala allí donde ocurrió (`parameters.metric: "churn" → "revenue"`); una llamada insertada antes de otra idéntica es una sola llamada añadida; un `action.executed` que pasó a ser `action.failed` es un solo cambio, no una pérdida más un añadido.

| Opción | Para | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | Validación | Comparar menos eventos |
| `tolerance.dataFields` | Validación | Más campos de datos que se dejan fuera, a cualquier profundidad |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | Validación | Los tiempos se comparan, respecto al inicio de cada ejecución, solo con `timestampMs` |
| `compareStructureOnly` | Validación | Las diferencias de datos dan `partial`, no `fail`; los eventos añadidos, quitados, movidos o de otro tipo siguen fallando |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | Regresiones | Comparar menos eventos, dejar campos de datos fuera |
| `tolerance.criticalEventTypes` | Regresiones | Tipos cuya aparición, pérdida o cambio es crítico (por defecto: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | Regresiones | Se toleran hasta este número de eventos de proceso añadidos o quitados (comprobaciones de políticas, reintentos, aprobaciones); un cambio del resultado nunca se tolera |
| `tolerance.maxDurationDiff`, `severityThresholds` | Regresiones | La duración solo se comprueba con una de ellas: una ejecución más lenta en más de `maxDurationDiff` ms es una regresión, con la gravedad del umbral más alto alcanzado; una ejecución más rápida nunca lo es |

### Baterías de regresión {#regression-suites}

| Método | Devuelve | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | Se guarda en `regressionTestSuitesDir`. `agent`: el id o el nombre de un agente de este SDK. Cada traza de referencia debe existir; `input` es por defecto la entrada que recibió la ejecución de referencia; una suite no guarda el `signal` ni los callbacks (`onEvent`, `onText`, `onTextRestart`) de una entrada |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | Las más recientes primero |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | Todas las baterías del agente, la más antigua primero: cada prueba envía su entrada al agente y compara la ejecución con su traza de referencia; `suites` tiene un resultado por batería |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | Una sola batería |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 todas las pruebas pasaron, 1 una prueba encontró una regresión, 2 una prueba no pudo ejecutarse (error o tiempo agotado); `exitCode: false` en las opciones da 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML: un `<testsuite>` por batería; una prueba que no pudo ejecutarse (error o tiempo agotado) es un `<error>`; se quitan los caracteres que XML no puede contener |

Los ids de los agentes son nuevos en cada proceso: una batería también guarda el **nombre** de su agente, y otro proceso la ejecuta con su agente de ese nombre (primero con el id de agente de la batería, cuando ese agente está en el SDK). Dentro de un mismo SDK, el id de un agente es solo suyo: dos agentes con el mismo nombre (dos versiones, por ejemplo) conservan cada uno sus baterías, sus aserciones y sus trazas de referencia, y un nombre los designa a todos. Todo agente creado con `createAgent` permanece en su SDK, así que una aplicación que crea un agente por petición vuelve ambiguo el nombre: pasa ids, o crea cada agente una sola vez y reutilízalo. Las baterías guardadas por versiones anteriores no tienen nombre: solo se ejecutan en el proceso que las creó. Opciones: `parallel` (las pruebas de una batería a la vez), `stopOnFirstFailure` (solo ejecuciones secuenciales: no se ejecuta nada después de la primera prueba que no pasa, baterías siguientes incluidas), `filterTags`, `excludeTags`, `timeout` (ms por prueba, 60 000 por defecto, 2 147 483 647 como máximo; pasado ese tiempo, la ejecución se cancela y la prueba queda en `timeout`) y `detection` (las opciones de regresión de arriba).

### Aserciones {#assertions}

| Método | Devuelve | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | Para todas las ejecuciones o para las de un agente; un agente de este SDK dado por `agentId` también guarda su nombre. Una condición que no se podría evaluar se rechaza con un `ValidationError` |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | Las más recientes primero |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | Las aserciones indicadas (un id desconocido lanza un error) o, si no, las de todas las ejecuciones más las del agente de la ejecución |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | Necesita | Pasa cuando |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` o `eventTypes` | Aparece uno de los tipos / no aparece ninguno |
| `event_count` | `eventType` o `eventTypes`, y luego `count`, o `minCount` y `maxCount` | El número de esos eventos encaja |
| `event_order` | `beforeEventType`, `afterEventType` | El primero de uno llega antes que el primero del otro |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | Todos los eventos del tipo coinciden |
| `custom` | `customEvaluator(events) => boolean` | La función devuelve `true` |

Una aserción `custom` contiene una función, que no se puede escribir en un archivo: **no se guarda** y dura lo que dure la instancia del SDK que la definió, así que vuelve a definirla al arrancar. Los demás tipos se guardan en `assertionsDir`.

### Comparaciones e impacto {#comparisons-and-impact}

| Método | Devuelve | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | Las diferencias, alineadas por significado como arriba: `event_added`, `event_removed`, `event_modified` (tipo cambiado), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | Promedios de antes y después de `duration` (ms), `cost` (USD de las llamadas al modelo que tienen precio, como `getRunCost`), `quality` (proporción de eventos que no son acciones fallidas) y `success_rate`, con los cambios de comportamiento; se guarda en `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` sobre las ejecuciones de un agente gobernado (su nombre, o el id de un agente de este SDK) registradas con cada versión: su `version` o su `configHash`. Cuentan todos los agentes con ese nombre. Las repeticiones quedan fuera; las dos versiones deben ser distintas y seleccionar ejecuciones distintas; una versión desconocida lanza un error que lista las registradas |

Los eventos del ciclo de vida de las ejecuciones de un agente gobernado (`run.started`, `run.completed`…) registran su `agentName`, su `agentVersion` y su `configHash`: dos agentes con el mismo nombre son un mismo agente en dos versiones, o en dos procesos. El hash abarca el modelo, el prompt de sistema, `maxSteps` y `timeout`, los ajustes del proveedor, `version`, las capacidades, las herramientas (nombre, descripción, versión, esquema de parámetros, metadatos, ajustes de reintento) y las políticas propias del agente con sus reglas; cambia con `setPolicy` y `addTools`, y cada ejecución registra el que tenía al empezar. Las ejecuciones registradas por versiones anteriores solo tienen el id y la versión.

### Consultas sobre todas las ejecuciones {#queries-across-runs}

| Método | Devuelve |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: los eventos que coinciden, en orden cronológico (como mucho `limit`), los eventos del ámbito, los que coinciden |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

Un filtro tiene un **ámbito** —`runId` (sin él, todas las ejecuciones), `since`, `until`— y unas **condiciones** —`type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) y `metadataFilters` (`{ field, operator, value? }`)—. Las condiciones se combinan con `logic` (`and` por defecto; `or`: al menos una) y luego `not` las niega; el ámbito nunca se niega. Todos los almacenes incluidos responden: el almacén de archivos lee cada archivo de ejecución una vez por consulta y los almacenes SQL consultan la base de datos. Cuando todas las condiciones deben cumplirse, la base de datos filtra ella misma los eventos por tipo e ids; con `or` o `not`, el almacén devuelve todos los eventos del ámbito y las condiciones se comprueban en memoria, lo que cuesta más en una base de datos grande. Los eventos del mismo milisegundo conservan el orden de su ejecución: las ejecuciones por id y, dentro de cada una, en el orden en que los registró.

## Eventos en tiempo real {#live-events}

Un listener es `(event: Event) => unknown`. Recibe los eventos de uno en uno, en el orden de cada ejecución, una vez que el almacén los ha aceptado; una promesa que devuelva se espera antes de su siguiente evento. Las ejecuciones nunca lo esperan, y sus errores se notifican, nunca se lanzan dentro de la ejecución. Como máximo `maxQueued` eventos (10 000 por defecto) lo esperan; por encima de esa cifra, los nuevos se descartan para él y se notifican con un `LiveEventsDroppedError`. Consulta [Progreso en tiempo real](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Todos los eventos de la ejecución; `run()` se resuelve una vez que el listener ha terminado con cada uno de ellos, o antes si la ejecución se detuvo o se canceló o si `signal` se aborta (entonces se cancela la suscripción del listener). El listener no se guarda en el registro de eventos |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | Lo mismo para una ejecución cognitiva, cuyo `limits.timeoutMs` también termina la espera |
| `StudyRunOptions.onEvent`: `study.run({ onEvent })` | Lo mismo para la ejecución de un estudio, cuyo `limits.timeoutMs` también termina la espera |
| `replay(runId, modifications?, { onEvent })` | Lo mismo para una repetición, que no se puede cancelar: siempre espera |
| `executeTool(name, params, { onEvent })` | Los eventos de la llamada, y los de las ejecuciones que inicia su herramienta, a un solo nivel de profundidad: el manejador recibe el listener como `context.onEvent`, que `governedAgentTool` y `cognitiveAgentTool` pasan a su agente (un agente construido a mano sobre un almacén sin eventos en tiempo real se ejecuta sin él). `signal` termina la espera |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: todos los eventos de todas las ejecuciones que coinciden con el filtro (`agentId` es `metadata.agentId`), hasta que llamas a la función devuelta, que descarta los eventos aún no entregados. Las ejecuciones de las baterías de regresión y las repeticiones son ejecuciones reales: el listener también recibe sus eventos (una batería no guarda el `onEvent` ni el `onText` de su entrada) |
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
| `webTools({ include?, prefix?, search?, circuitBreaker?, language?, userAgent?, timeoutMs?, callTimeoutMs?, maxResponseBytes?, maxRedirects?, hostIntervalMs?, robots?, allowPrivateNetwork?, lookup?, maxPdfBytes?, maxPdfPages?, cache?, retry?, arxiv?, wikipedia?, github? })` | `ToolDefinition[]` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search`, de solo lectura (`web_fetch` de riesgo medio, las demás bajo). Resultados de búsqueda `{ id, title, url, date?, excerpt, source }`; una página `{ url, finalUrl, title?, date?, language?, contentType, content, truncated, untrusted: true, hint? }`. Ninguna dirección fuera de Internet público salvo con `allowPrivateNetwork`; se respeta robots.txt, y cada llamada dura como máximo `callTimeoutMs` (60 s). Consulta [Investigación web](../guide/web-research) |
| `duckDuckGo({ region?, minIntervalMs?, baseUrl? })` | `SearchProvider` | El proveedor por defecto de `web_search`, sin clave: la página HTML de DuckDuckGo, 1,5 s entre búsquedas |
| `searxng({ baseUrl, engines?, categories?, minIntervalMs? })` | `SearchProvider` | La API JSON de una instancia de SearXNG; resultados con el nombre `searxng:<engine>`, fechados por `publishedDate` |
| `brave({ apiKey, baseUrl?, minIntervalMs? })`, `tavily(…)`, `serper(…)` | `SearchProvider` | Las API de Brave Search, Tavily y Serper, con su clave |
| `citableUrl(url)`, `normalizeUrl(url)` | `string \| undefined` | La URL con la que se cita un resultado de búsqueda (sin parámetros de seguimiento ni fragmento), y aquella por la que se reconoce para su id y sus duplicados (además, host en minúsculas y sin barra final); `undefined` para todo lo que no sea http(s) |
| `isPublicAddress(address)` | `boolean` | Si una dirección IP está en Internet público (la comprobación que hay detrás de `allowPrivateNetwork`) |

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

`web_search` consulta a sus proveedores en orden; un proveedor que lanza un error pasa el relevo al siguiente, y uno que lanza `SearchThrottledError` (o falla tres veces seguidas) se omite durante `circuitBreaker.cooldownMs` (2 minutos). Las herramientas web lanzan `WebRequestRefusedError` para lo que rechazan a propósito (`reason`: `private-address`, `scheme`, `downgrade`, `redirects`, `robots`, `content-type`, `too-large`, `unreadable`, `pacing`), `WebHttpError` para una respuesta que no es 2xx (`status`), `WebTimeoutError` (una solicitud, el plazo de la llamada o el presupuesto de tiempo de una extracción), `WebConfigurationError` para una configuración que falta (`unpdf`, un token de GitHub) y `SearchUnavailableError` cuando ningún proveedor respondió (`failures`). `retry` nunca reintenta un rechazo, una configuración que falta ni una búsqueda que ningún proveedor respondió.

```ts
interface SearchProvider {
  readonly name: string;
  /** The origin of a baseUrl you gave it: its requests there may reach a private network. */
  readonly configuredOrigin?: string;
  /** Send every request through `web`: timeouts, byte caps, pacing and address checks. */
  search(request: SearchRequest, web: WebClient): Promise<SearchHit[]>;
}

interface SearchRequest {
  query: string;
  maxResults: number;
  site?: string;
  freshness?: 'day' | 'week' | 'month' | 'year';
  language?: string;
  signal?: AbortSignal;
}

interface SearchHit { title: string; url: string; excerpt: string; date?: string; source?: string }

interface WebClient {
  request(url: string, init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    minIntervalMs?: number;
    signal?: AbortSignal;
    maxBytes?: number;
  }): Promise<{ status: number; url: string; headers: Record<string, string>; body: Buffer; truncated: boolean }>;
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
