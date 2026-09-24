# API SDK

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Параметр | Тип | Описание |
| --- | --- | --- |
| `apiKey` | `string` | Ключ основного провайдера (не нужен при `llmProvider`). Без ключа инструменты и серверы MCP работают, а вызовы, которым нужна модель, завершаются понятной ошибкой |
| `provider` | `'openai' \| 'anthropic'` | Основной провайдер, по умолчанию `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel` и `baseURL` каждого поставщика (`baseURL`: совместимая конечная точка, например API v1 Azure OpenAI или локальный сервер моделей, либо прокси). Основной провайдер берёт запись своего поставщика, резервный провайдер другого поставщика — запись своего. Модели по умолчанию: `gpt-5.4` и `claude-opus-5`. Запись OpenAI также принимает `reasoningModels`, `reasoningEffort` и `nativeToolMessages`: см. [Модели OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Пробуются по порядку, когда основной провайдер даёт сбой; `config` имеет приоритет над `providerConfig`. Резервный провайдер того же поставщика, что и основной, не наследует его настроек (только общий `apiKey`); провайдеру другого поставщика нужен собственный ключ |
| `llmProvider` | `LLMProvider` | Ваш собственный провайдер (локальная модель, шлюз, тестовый дублёр). Он получает вызовы инструментов и их результаты в нативном формате (`LLMMessage`), если объявляет `nativeToolMessages`, а иначе — текстом |
| `retry` | `Partial<RetryPolicy> \| false` | Политика повторных попыток LLM, для каждого провайдера, до переключения на резерв. Её `maxRetries` и `initialDelayMs` также служат значениями по умолчанию для `jev.maxRetries` и `jev.retryBaseDelayMs`; остальные её поля до клиента Jev не доходят, и при `retry: false` он сохраняет свои 2 повторные попытки и 500 ms. К внедрённому `llmProvider` применяется, только если задана явно, и никогда — к `FallbackProvider`, переданному как `llmProvider`, и к его провайдерам |
| `jev` | `JevClientConfig` | Включает TypeSafe Jev для типизированных решений — напрямую или через [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) с `baseUrl` и `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Любой бэкенд типизированных решений (имеет приоритет над `jev`) |
| `pricing` | `PricingTable` | USD за миллион токенов, объединяется поверх значений по умолчанию |
| `incidents` | `IncidentMonitorOptions` | Уведомители, правила, порог серьёзности, ограничение частоты |
| `eventStore` | `IEventStore` | По умолчанию `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Глобальные политики |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Хранилище артефактов тестирования |

### Модели OpenAI {#openai-models}

Модели рассуждения OpenAI — серия o (`o1`, `o3`, `o4-mini`…) и GPT-5 и более поздние (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), в том числе с датой в имени или дообученные (`ft:o4-mini-…`), — отклоняют `max_tokens`, а `temperature` — если их уровень рассуждения не `none`. Провайдер OpenAI распознаёт их по имени без учёта регистра: он передаёт им `maxTokens` как `max_completion_tokens`, куда входят и их токены рассуждения, и уровень рассуждения. Поскольку уровень по умолчанию у моделей разный, он никогда не передаёт им температуру: температура агента или движка для них игнорируется. Остальные модели получают `temperature` и `max_tokens`, которые знает любой OpenAI-совместимый сервер.

::: warning Инструменты и уровень рассуждения
SDK обращается к OpenAI через Chat Completions, где модели начиная с GPT-5.4 вызывают инструменты только при уровне `none`. Модель по умолчанию, `gpt-5.4`, использует `none`, пока вы не зададите другой уровень. У GPT-5.5, GPT-5.6 и GPT-6 Sol и Luna по умолчанию `medium`: агент с инструментами на них завершается ошибкой (`Function tools with reasoning_effort are not supported`), если не задать `reasoningEffort: 'none'`. GPT-6 Astra вообще не может вызывать инструменты через Chat Completions. SDK передаёт заданный вами уровень без изменений.
:::

| Параметр | По умолчанию | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Модель запроса, в котором модель не указана, и резервного провайдера, который не обслуживает модель агента |
| `reasoningModels` | Определяется по имени | `true` или `false`: все модели этого провайдера являются (или не являются) моделями рассуждения. Список: перечисленные имена ими являются (развёртывания Azure, псевдонимы шлюза), остальные определяются по имени |
| `reasoningEffort` | Уровень самой модели | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` или `max`; передаётся без изменений и только моделям рассуждения. Каждая модель принимает лишь часть этих значений, остальные API отклоняет |
| `nativeToolMessages` | `true` | `false` для совместимого сервера, который не принимает в диалоге `tool_calls` ассистента и сообщения `tool`: прежние вызовы инструментов и их результаты тогда передаются текстом, а инструменты по-прежнему предлагаются и вызовы инструментов в ответах по-прежнему читаются. `false` у основного провайдера или у любого резервного действует на всю цепочку |

Эти параметры задаются в `providerConfig.openai` или в `config` резервного провайдера OpenAI. Резервный провайдер другого поставщика берёт из `providerConfig.openai` каждый параметр, который не задан в его `config`; резервный провайдер того же поставщика, что и основной, не берёт ни одного. Агент или запуск задаёт собственный уровень в `providerSettings.openai.reasoningEffort`: приоритет у запуска, затем у агента, затем у провайдера. Когнитивный агент применяет его только к выбору инструмента; его мысли, которые не предлагают инструментов, берут его параметр `reasoningEffort`.

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

## Агенты {#agents}

| Метод | Возвращает | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Управляемый агент: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Он может запускать только собственные инструменты (`tools`, `capabilities`), даже если модель называет другой инструмент, зарегистрированный в SDK; `signal` отменяет запуск |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Регистрирует инструмент; обработчик типизируется по его схеме Zod |
| `defineCapability(definition)` | `Capability` | Группирует инструменты |
| `listTools()` | `Tool[]` | Все зарегистрированные инструменты |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | Управляемое выполнение вне агента (используется сервером MCP): аргументы, политики, одобрение, бюджет (засчитывается в момент начала вызова), затем инструмент. `signal` отменяет ожидающее одобрение и передаётся обработчику; `approvalTimeoutMs` отменяет одобрение, по которому никто не принял решения |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Выполняет `read()` как отдельный запуск: `run.started`, `resource.read` (URI, размер, SHA-256), `run.completed` или `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Останавливает управляемый или когнитивный запуск |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Параметр | По умолчанию | |
| --- | --- | --- |
| `name`, `model` | — | Обязательные |
| `profile` | `DEFAULT_THINKER_PROFILE` | Как рассуждает агент |
| `tools`, `policies` | `[]` | Под управлением, как и везде |
| `systemPrompt` | — | Дополнительные инструкции для каждого промпта |
| `limits` | см. [Когнитивные агенты](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` или `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0,35), `readinessThreshold` (0,8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` или ваш собственный `HypothesisAssessor` для операции `compare` |
| `knowledge` | — | Память между запусками: `{ store, scope, recallLimit? (10), record? (true) }`, см. [Память между запусками](../guide/memory) |
| `evaluator` | — | `OutcomeEvaluator`, который проверяет предсказания; включает `test_prediction` |
| `generator` | генератор LLM на `model` | Ваш собственный `ThoughtGenerator` (включая сравнения наблюдений); его мысли всё равно проходят через правила допуска движка |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Параметры генерации мыслей (`reasoningEffort`: только модели рассуждения OpenAI) |
| `providerSettings` | — | Параметры выбора инструмента (встроенный движок рассуждения), включая `openai.reasoningEffort` |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` принимает значения `completed`, `failed` или `cancelled`; `decision.status` — `committed`, `provisional` или `abstain`, а `decision.missing` перечисляет то, что не установлено; `state` — итоговое `MentalState`.

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

См. [Доказательства и проверка](../guide/evidence-and-verification).

## Рассуждение и профили {#reasoning-profiles}

| Метод | Возвращает |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — восстанавливается из событий |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Типизированные решения — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Выбрасывает `ValidationError`, если бэкенд не настроен.

| Метод | Возвращает |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — ответы типизируются по вопросам; без `usage`, если бэкенд не сообщил число токенов |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Помощники для вопросов: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Эксплуатация {#operations}

| Метод | Возвращает |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Одобрения человеком |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Бюджеты и аудит политик |

### `RunCostReport` {#runcostreport}

Что возвращает `getRunCost(runId)`: вызовы модели в запуске, включая шаги, завершившиеся ошибкой, — см. [Затраты на API](../guide/costs).

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

| Поле | |
| --- | --- |
| `totalUsd` | Стоимость вызовов с известной стоимостью; когда `complete` равно `false`, это лишь нижняя граница |
| `complete` | `false`, когда стоимость некоторых вызовов неизвестна: `unpricedCalls` или `unmeteredCalls` больше 0 |
| `unpricedModels`, `unpricedCalls` | Модели без цены в `pricing` и их вызовы, сообщившие свои токены |
| `unmeteredModels`, `unmeteredCalls` | Модели вызовов, не сообщивших число ни входных, ни выходных токенов, и сами эти вызовы |
| `lines` | По одной на модель и источник: вызовы, токены вызовов, которые их сообщили, `unmeteredCalls`, если такие есть, `costUsd`, если у модели есть цена и какие-то вызовы строки сообщили свои токены; `model` равно `(unknown)` для вызова, не записавшего имя модели |

## Трассы, воспроизведение и тестирование {#traces-replay-and-testing}

| Метод | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Чтение запусков |
| `replay(runId, modifications?)` | Повторное выполнение без LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Понимание решений |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Тестирование агентов как кода |

## Инструменты: `ToolDefinition` {#tools-tooldefinition}

| Поле | |
| --- | --- |
| `name`, `description` | То, что видит модель |
| `schema` | Схема Zod аргументов; вызовы, которые ей не соответствуют, отклоняются |
| `handler(params, context?)` | Получает проверенные аргументы и `{ runId, agentId, signal? }` — `signal` прерывается, когда вызывающая сторона сдаётся |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — только для идемпотентных инструментов; некорректные аргументы никогда не повторяются |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` заставляет каждый вызов ждать `approveAction`; `readOnly` показывается клиентам MCP как `readOnlyHint` |
| `inputJsonSchema` | JSON Schema, показываемая вместо той, что выводится из `schema` |
| `capability`, `version` | Группировка, версия |

## Источники инструментов {#tool-sources}

Каждая функция возвращает готовые `ToolDefinition`: передайте их в `sdk.defineTool`, агенту или напрямую в `tools` сервера MCP. См. [Сервер MCP для чего угодно](../guide/mcp-recipes).

| Функция | Возвращает | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | По одному инструменту на каждую операцию описания OpenAPI 3; только `GET`, если операция не перечислена в `include`; остальные методы по умолчанию требуют одобрения. Вызов возвращает `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` по одной папке, никогда за её пределами; исключённая папка скрывает всё своё содержимое |
| `folderResources(options)` | `ResourceProvider` | Те же файлы как ресурсы MCP `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (один оператор только для чтения, не более `maxRows` строк, по умолчанию 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Для `DatabaseSync` из `node:sqlite` или `better-sqlite3`; выполняет запросы с `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Для `pg` (выделенный клиент или пул); каждый запрос в `BEGIN READ ONLY` (отклоняется на соединении, которое уже находится внутри транзакции) … `ROLLBACK` + `pg_advisory_unlock_all()`, с `SET LOCAL statement_timeout` (по умолчанию 10 с); `schemas` ограничивает только перечисление и описание |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; отменяется вместе с вызывающей стороной; `error` — общее сообщение, если не задан `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | Проверка оператора, используемая адаптерами баз данных (только синтаксис SQLite и PostgreSQL) |

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

| Функция | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP, открывающий ровно то, что перечислено в `tools`: имена определённых инструментов и/или `ToolDefinition` (SDK определяет их за вас; одно и то же определение можно передать повторно, а другой инструмент с уже занятым именем отклоняется). `resources`: один или несколько `ResourceProvider`; каждое чтение записывается в трассу. Вызовы выполняются от имени `mcp:<name>` (или `agentId`); одобрение, по которому никто не принял решения за `approvalTimeoutMs` (по умолчанию 50 000 мс), отменяется; отказы из-за входных данных объясняются клиенту, остальные причины — только при `exposeErrorDetails` |
| `serveMcpOverStdio(sdk, options)` | То же самое, подключённое к stdin/stdout; пишет одну строку «ready» в stderr и закрывается, когда заканчивается stdin (выполняющиеся вызовы прерываются, ожидающие одобрения отменяются). `approvalTimeoutMs` по умолчанию 50 000, как и для `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — инструменты любого сервера MCP в виде `ToolDefinition` |

`GovernedToolHost` — это то, что нужно серверу от SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` возвращает объект, который его реализует.

## Строительные блоки {#building-blocks}

Строительные блоки SDK экспортируются для пользовательских конфигураций: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, а также их основные типы.
