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
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` и `timeout` каждого поставщика (`baseURL`: совместимая конечная точка, например API v1 Azure OpenAI или локальный сервер моделей, либо прокси; `timeout`: наибольшее время ожидания ответа в миллисекундах, по умолчанию 10 минут, а для потокового ответа — наибольшее время ожидания между двумя его событиями). Основной провайдер берёт запись своего поставщика, резервный провайдер другого поставщика — запись своего. Модели по умолчанию: `gpt-5.4` и `claude-opus-5`. Запись OpenAI также принимает `reasoningModels`, `reasoningEffort`, `nativeToolMessages` и `includeStreamUsage`: см. [Модели OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Пробуются по порядку, когда основной провайдер даёт сбой; `config` имеет приоритет над `providerConfig`. Резервный провайдер того же поставщика, что и основной, не наследует его настроек (только общий `apiKey`); провайдеру другого поставщика нужен собственный ключ |
| `llmProvider` | `LLMProvider` | Ваш собственный провайдер (локальная модель, шлюз, тестовый дублёр). Он получает вызовы инструментов и их результаты в нативном формате (`LLMMessage`), если объявляет `nativeToolMessages`, а иначе — текстом, и может передавать свой текст потоком (см. [`LLMProvider`](#llmprovider)) |
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
| `includeStreamUsage` | Включён на собственном API OpenAI | `true`: у потокового ответа запрашивается его расход (`stream_options`), поэтому его стоимость учитывается; `false`: не запрашивается. По умолчанию включён для `https://api.openai.com/v1` и региональных хостов, например `https://eu.api.openai.com/v1` (из `baseURL` или `OPENAI_BASE_URL`), поскольку совместимый сервер может отклонить это поле (тогда запрос отправляется снова без него, кроме собственного API OpenAI, который его принимает) или проигнорировать его, а потоковый вызов без данных о расходе учитывается как неизмеренный. Если на совместимом сервере, который сообщает расход (API v1 Azure OpenAI это делает), действует бюджет стоимости, задайте `true` |
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

### `LLMProvider` {#llmprovider}

Ваш собственный провайдер реализует `generateCompletion(request)`, `supportsModel(model)` и `getProviderName()` и может объявлять `nativeToolMessages`. Два поля запроса относятся к потоковой передаче:

| Поле `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | Задаётся, когда вызывающая сторона хочет получать текст по мере его написания (запуск с `onText`). Вызывайте его с каждым куском текста по мере поступления, а затем, как обычно, верните полный `LLMResponse`: куски, соединённые вместе, должны составлять его `content`. Провайдер без потоковой передачи его игнорирует, и SDK передаёт весь `content` одним куском. Эта функция не должна выбрасывать исключений (функция самого SDK никогда этого не делает) |
| `onTextRestart?()` | Вызывайте его, когда пробуете снова после попытки, которая уже передала текст потоком (ваша собственная повторная попытка): этот текст недействителен, и следующие куски начинают ответ заново. `RetryingLLMProvider` и `FallbackProvider` вызывают его для провайдеров, которые они оборачивают |

## Агенты {#agents}

| Метод | Возвращает | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Управляемый агент: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. Он может запускать только собственные инструменты (`tools`, `capabilities`), даже если модель называет другой инструмент, зарегистрированный в SDK; `signal` отменяет запуск; `onText` получает текст, который пишет модель, по мере его написания, а `onTextRestart` — часть, которую нужно отбросить, когда неудавшийся вызов модели пробуют снова (см. [Потоковая передача ответа](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Его мысли структурированы и не передаются потоком |
| `defineTool(definition)` | `Tool` | Регистрирует инструмент; обработчик типизируется по его схеме Zod |
| `defineCapability(definition)` | `Capability` | Группирует инструменты |
| `listTools()` | `Tool[]` | Все зарегистрированные инструменты |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Управляемое выполнение вне агента (используется сервером MCP): аргументы, политики, одобрение, бюджет (засчитывается в момент начала вызова), затем инструмент. `signal` отменяет ожидающее одобрение и передаётся обработчику; `approvalTimeoutMs` отменяет одобрение, по которому никто не принял решения |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Выполняет `read()` как отдельный запуск: `run.started`, `resource.read` (URI, размер, SHA-256), `run.completed` или `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Останавливает управляемый или когнитивный запуск |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Параметр | По умолчанию | |
| --- | --- | --- |
| `name`, `model` | — | Обязательные |
| `profile` | `DEFAULT_THINKER_PROFILE` | Как рассуждает агент |
| `tools`, `policies` | `[]` | Под управлением, как и везде; политики бюджета и тайм-аута проверяются ещё и перед каждым шагом, см. [Лимиты и политики](../guide/cognitive-agents#limits-and-policies) |
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
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| Поле | |
| --- | --- |
| `totalUsd` | Стоимость вызовов с известной стоимостью; когда `complete` равно `false`, это лишь нижняя граница |
| `complete` | `false`, когда стоимость некоторых вызовов неизвестна: `unpricedCalls` или `unmeteredCalls` больше 0 |
| `unpricedModels`, `unpricedCalls` | Модели без цены в `pricing` и их вызовы, сообщившие свои токены |
| `unmeteredModels`, `unmeteredCalls` | Модели вызовов, не сообщивших и входные, и выходные токены, и сами эти вызовы |
| `lines` | По одной на модель, запрошенную модель и источник: вызовы, токены измеренных вызовов, `unmeteredCalls`, если такие есть, `unmeteredTokens` для токенов этих вызовов, `costUsd`, если у модели есть цена и какие-то вызовы строки измерены; `model` равно `(unknown)` для вызова, не записавшего имя модели |

## Трассы, воспроизведение и тестирование {#traces-replay-and-testing}

| Метод | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Чтение запусков |
| `replay(runId, modifications?, { onEvent? })` | Повторное выполнение без LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Понимание решений |

### Эталонные трассы {#golden-traces}

| Метод | Возвращает | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | Сохраняет запуск как эталон вместе с именем управляемого агента, который его выполнил (`agentName`) |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: id или имя агента |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` или `partial` с каждым различием (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) и его позицией |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | Те же различия в виде регрессий, у каждой — серьёзность и влияние: `no_regression` или `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | Воспроизводит запуск, затем проверяет воспроизведение. Воспроизведение не вызывает модель: сравнивайте его с `validateAspects: ['tools', 'policies']` |

Запуски сравниваются **по смыслу их событий**, а не по id событий (у каждого запуска они новые). События сопоставляются по порядку: сначала одинаковые события, затем события того же типа и предмета (инструмент, операция, ответ), у которых изменились данные, затем события, у которых для того же предмета сменился тип. Никогда не сравниваются: id событий, время, метаданные, события `incident.reported` (они записывают отправку уведомлений и их ограничение; событие, вызвавшее инцидент, сравнивается) и значения, которые записывает SDK и которые меняются от запуска к запуску: длительность вызова инструмента, расход токенов, паузы перед повторами, id одобрений, исходный запуск воспроизведения, время и исходное событие наблюдения. Текст, который модель пишет рядом с вызовом инструмента, сравнивается только в `intention.generated`. Параметры, результат и вход инструмента сравниваются всегда, как бы ни назывались их ключи: аргумент `duration`, изменившийся с 30 на 60, — это изменение. Запуск, который снова делает то же самое, проходит; инструмент, вызванный с другими аргументами, отмечается там, где произошёл вызов (`parameters.metric: "churn" → "revenue"`); вызов, вставленный перед таким же, — это один добавленный вызов; `action.executed`, ставший `action.failed`, — это одно изменение, а не пропажа плюс добавление.

| Параметр | Для | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | Проверка | Сравнивать меньше событий |
| `tolerance.dataFields` | Проверка | Дополнительные поля данных, исключаемые на любой глубине |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | Проверка | Время сравнивается, относительно начала каждого запуска, только при `timestampMs` |
| `compareStructureOnly` | Проверка | Различия в данных дают `partial`, а не `fail`; добавленные, удалённые, перемещённые события или события другого типа по-прежнему дают провал |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | Регрессии | Сравнивать меньше событий, исключать поля данных |
| `tolerance.criticalEventTypes` | Регрессии | Типы, появление, пропажа или изменение которых критичны (по умолчанию: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | Регрессии | До стольких добавленных или удалённых служебных событий (проверки политик, повторы, одобрения) допускается; изменение результата — никогда |
| `tolerance.maxDurationDiff`, `severityThresholds` | Регрессии | Длительность проверяется только с одним из них: запуск, ставший медленнее более чем на `maxDurationDiff` мс, — регрессия с серьёзностью наивысшего достигнутого порога; более быстрый запуск регрессией не бывает |

### Наборы регрессионных тестов {#regression-suites}

| Метод | Возвращает | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | Сохраняется в `regressionTestSuitesDir`. `agent`: id или имя агента этого SDK. Каждая эталонная трасса должна существовать; `input` по умолчанию — вход, который получил эталонный запуск; набор не сохраняет `signal` и колбэки (`onEvent`, `onText`, `onTextRestart`) входа |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | Сначала самые новые |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | Все наборы агента, начиная с самого старого: каждый тест отправляет свой вход агенту и сравнивает запуск со своей эталонной трассой; в `suites` — по одному результату на набор |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | Один набор |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 — все тесты прошли, 1 — тест нашёл регрессию, 2 — тест не смог выполниться (ошибка или тайм-аут); `exitCode: false` в параметрах даёт 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML: по одному `<testsuite>` на набор; тест, который не смог выполниться (ошибка или тайм-аут), записывается как `<error>`; символы, недопустимые в XML, удаляются |

Id агентов новые в каждом процессе, поэтому набор записывает и **имя** своего агента, а другой процесс запускает его со своим агентом с этим именем (сначала по id агента из набора, если такой агент есть в SDK). Внутри одного SDK id агента принадлежит только ему: два агента с одинаковым именем (например, две версии) сохраняют каждый свои наборы, проверки и эталонные трассы, а имя обозначает их всех. Каждый агент, созданный через `createAgent`, остаётся в своём SDK, поэтому приложение, создающее агента на каждый запрос, делает имя неоднозначным: передавайте id или создавайте каждого агента один раз и используйте повторно. Наборы, сохранённые прежними версиями, не содержат имени: они запускаются только в создавшем их процессе. Параметры: `parallel` (тесты набора одновременно), `stopOnFirstFailure` (только при последовательном запуске: после первого непрошедшего теста ничего больше не запускается, включая следующие наборы), `filterTags`, `excludeTags`, `timeout` (мс на тест, по умолчанию 60 000, не больше 2 147 483 647; после него запуск отменяется, а тест получает `timeout`) и `detection` (параметры регрессий выше).

### Проверки {#assertions}

| Метод | Возвращает | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | Для всех запусков или для запусков одного агента; для агента этого SDK, заданного через `agentId`, записывается и его имя. Условие, которое нельзя было бы вычислить, отклоняется с `ValidationError` |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | Сначала самые новые |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | Указанные проверки (неизвестный id вызывает ошибку), иначе проверки для всех запусков плюс проверки агента этого запуска |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | Нужно | Проходит, когда |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` или `eventTypes` | Встречается один из типов / не встречается ни один |
| `event_count` | `eventType` или `eventTypes`, затем `count` либо `minCount` и `maxCount` | Число таких событий подходит |
| `event_order` | `beforeEventType`, `afterEventType` | Первое событие одного типа идёт раньше первого события другого |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | Каждое событие этого типа подходит |
| `custom` | `customEvaluator(events) => boolean` | Функция возвращает `true` |

Проверка `custom` содержит функцию, а функцию нельзя записать в файл: такая проверка **не сохраняется** и живёт, пока живёт экземпляр SDK, который её определил, — определяйте её заново при запуске. Остальные типы сохраняются в `assertionsDir`.

### Сравнения и влияние {#comparisons-and-impact}

| Метод | Возвращает | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | Различия, сопоставленные по смыслу, как выше: `event_added`, `event_removed`, `event_modified` (сменился тип), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | Средние до и после для `duration` (мс), `cost` (USD вызовов модели, у которых есть цена, как в `getRunCost`), `quality` (доля событий, которые не являются неудавшимися действиями) и `success_rate`, с изменениями поведения; сохраняется в `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` по запускам управляемого агента (его имя или id агента этого SDK), записанным с каждой версией: его `version` или его `configHash`. Учитываются все агенты с этим именем. Воспроизведения не учитываются; две версии должны различаться и выбирать разные запуски; неизвестная версия вызывает ошибку со списком записанных |

События жизненного цикла запусков управляемого агента (`run.started`, `run.completed`…) записывают его `agentName`, `agentVersion` и `configHash`: два агента с одним именем — это один агент в двух версиях или в двух процессах. Хеш охватывает модель, системный промпт, `maxSteps` и `timeout`, настройки провайдера, `version`, возможности, инструменты (имя, описание, версия, схема параметров, метаданные, настройки повторов) и собственные политики агента с их правилами; он меняется при `setPolicy` и `addTools`, а каждый запуск записывает тот, с которым начался. Запуски, записанные прежними версиями, содержат только id и версию.

### Запросы по всем запускам {#queries-across-runs}

| Метод | Возвращает |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: подходящие события в порядке времени (не больше `limit`), число событий в области, число подходящих |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

У фильтра есть **область** — `runId` (без него — все запуски), `since`, `until` — и **условия** — `type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) и `metadataFilters` (`{ field, operator, value? }`). Условия объединяются через `logic` (`and` по умолчанию; `or` — хотя бы одно), затем инвертируются через `not`; область не инвертируется никогда. Отвечает любое встроенное хранилище: файловое читает каждый файл запуска один раз за запрос, SQL-хранилища обращаются к базе данных. Когда должны выполняться все условия, база сама отбирает события по типу и id; с `or` или `not` хранилище возвращает все события области, а условия проверяются в памяти, что на большой базе обходится дороже. События одной миллисекунды сохраняют порядок своего запуска: запуски по id, а внутри каждого — в том порядке, в каком он их записал.

## События в реальном времени {#live-events}

Слушатель — это `(event: Event) => unknown`. Он получает по одному событию за раз, в порядке каждого запуска, после того как хранилище приняло событие; возвращённый им промис ожидается до его следующего события. Запуски никогда его не ждут, а о его ошибках сообщается, но они никогда не выбрасываются в запуск. Его ждут не более `maxQueued` событий (по умолчанию 10 000); сверх этого новые события для него отбрасываются, и об этом сообщается через `LiveEventsDroppedError`. См. [Ход выполнения в реальном времени](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Каждое событие запуска; `run()` завершается, когда слушатель закончил обработку каждого из них, или раньше, если запуск был остановлен или отменён или прерывается `signal` (тогда подписка слушателя отменяется). Слушатель не записывается |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | То же самое для когнитивного запуска, у которого ожидание прекращает и `limits.timeoutMs` |
| `replay(runId, modifications?, { onEvent })` | То же самое для воспроизведения, которое нельзя отменить: оно всегда ждёт |
| `executeTool(name, params, { onEvent })` | События вызова, а также запусков, которые начинает его инструмент, только на один уровень: обработчик получает слушателя как `context.onEvent`, и `governedAgentTool` и `cognitiveAgentTool` передают его своему агенту (агент, собранный вручную на хранилище без событий в реальном времени, работает без него). `signal` прекращает ожидание |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: каждое событие каждого запуска, подходящего под фильтр (`agentId` — это `metadata.agentId`), пока вы не вызовете возвращённую функцию, которая отбрасывает ещё не доставленные события. Запуски наборов регрессионных тестов и воспроизведения — настоящие запуски: слушатель получает и их события (набор не сохраняет `onEvent` и `onText` своего входа) |
| `new ObservedEventStore(store, { onListenerError? })` | Слой, который их доставляет; SDK оборачивает в него своё хранилище или использует тот, что вы передали как `eventStore`, в том числе внутри `MonitoredEventStore` (тогда его отчёты об инцидентах тоже доставляются). Его `subscribe(listener, options?)` возвращает `{ unsubscribe(), close() }`: `close()` ждёт, пока слушатель не закончит обработку событий, которые он уже взял. `onListenerError` получает ошибки слушателей и сообщения об отброшенных событиях |

## Инструменты: `ToolDefinition` {#tools-tooldefinition}

| Поле | |
| --- | --- |
| `name`, `description` | То, что видит модель |
| `schema` | Схема Zod аргументов; вызовы, которые ей не соответствуют, отклоняются |
| `handler(params, context?)` | Получает проверенные аргументы и `{ runId, agentId, signal?, onEvent? }` — `signal` прерывается, когда вызывающая сторона сдаётся; `onEvent` задан, когда вызывающая сторона следит за вызовом в реальном времени: передайте его как `onEvent` запусков, которые начинает инструмент |
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
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP, открывающий ровно то, что перечислено в `tools`: имена определённых инструментов и/или `ToolDefinition` (SDK определяет их за вас; одно и то же определение можно передать повторно, а другой инструмент с уже занятым именем отклоняется). `resources`: один или несколько `ResourceProvider`; каждое чтение записывается в трассу. Вызовы выполняются от имени `mcp:<name>` (или `agentId`); одобрение, по которому никто не принял решения за `approvalTimeoutMs` (по умолчанию 50 000 мс), отменяется; отказы из-за входных данных объясняются клиенту, остальные причины — только при `exposeErrorDetails`. Вызов с `progressToken` получает по одному `notifications/progress` на каждое событие, и все они отправляются до результата ([уведомления о ходе выполнения](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | То же самое, подключённое к stdin/stdout; пишет одну строку «ready» в stderr и закрывается, когда заканчивается stdin (выполняющиеся вызовы прерываются, ожидающие одобрения отменяются). `approvalTimeoutMs` по умолчанию 50 000, как и для `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — инструменты любого сервера MCP в виде `ToolDefinition` |

`GovernedToolHost` — это то, что нужно серверу от SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` возвращает объект, который его реализует.

## Строительные блоки {#building-blocks}

Строительные блоки SDK экспортируются для пользовательских конфигураций: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, а также их основные типы.
