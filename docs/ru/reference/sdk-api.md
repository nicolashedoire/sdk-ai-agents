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

## Исследования {#studies}

Исследование работает как исследователь: оно понимает объект, затем предлагает, как перепроектировать его с помощью знаний и техник сегодняшнего дня, и проектирует эксперименты, которые позволили бы сделать выбор. См. [Исследования](../guide/studies).

| Метод | Возвращает | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | Проверяет конфигурацию, сопоставляет источники с инструментами и замораживает устав. Выбрасывает `ValidationError` при неверной конфигурации или для источника, который не является определённым инструментом или не принимает текстовый запрос |

### `StudyConfig` {#studyconfig}

| Параметр | По умолчанию | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | Обязательные, непустые. `name` записывается вместе с событиями исследования (`metadata.studyName`); цель никогда не меняется: новая цель — это новое исследование |
| `question` | Направляющий вопрос метода и ориентир на новую возможность, на языке `language` | Направляющий вопрос |
| `needs`, `leads`, `analogues` | `[]` | Потребности и критерии сегодняшнего дня; ваши направления — примеры для проверки, каждое из которых получает вердикт; прорывы за счёт сборки, которые нужно разобрать (`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | Что лежит вне рамок |
| `capability` | — | Новая возможность, на которую нацелено исследование; без неё исследование предлагает кандидатов |
| `sources` | `[]` | Имена инструментов SDK, с помощью которых ищет исследование, определённых до создания исследования (например, инструменты `connectMcpServer`); без источников ничего нельзя установить |
| `model` | Модель провайдера по умолчанию | Модель каждого вызова |
| `llmProvider` | Провайдер SDK | Провайдер для этого исследования |
| `language` | `'en'` | Язык текстов и досье в виде языкового тега (`fr`, `pt-BR`…) |
| `limits` | См. [`StudyLimits`](#studylimits) | Опущенный лимит сохраняет значение по умолчанию |
| `driftThreshold` | `1/3` (`DEFAULT_DRIFT_THRESHOLD`) | Доля элементов этапа, от 0 до 1, которую можно отклонить, прежде чем этап будет переделан один раз |
| `temperature`, `maxTokens` | `0.4`, — | Для этапов и запросов на поиск; страж, дополнения и проверка предшествующих работ работают при 0 |

Устав (`StudyCharter`) содержит `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability` и `analogues`; повторяющиеся элементы списков (без учёта регистра) удаляются. Он заморожен и хеширован; `name` в него не входит.

### `StudyLimits` {#studylimits}

На один запуск. `DEFAULT_STUDY_LIMITS` содержит значения по умолчанию; значение вне допустимого диапазона выбрасывает `ValidationError`.

| Лимит | По умолчанию | Диапазон | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | от 1 до 10 000 | Вызовы модели, включая исправления и проверки; при достижении лимита запуск останавливается (`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | от 0 до 10 000 | Поиски; когда лимит исчерпан, запуск продолжается без поиска (предупреждение `searchesSkipped`) |
| `maxLoops` | 1 | от 0 до 10 | Сколько более ранних этапов запуск может вновь открыть |
| `timeoutMs` | 1 200 000 (20 минут) | от 1 до 2 147 483 647 | Длительность запуска; при достижении лимита запуск прерывается (`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | от 1 до 50 | Сколько результатов сохраняется из одного поиска |

### `Study` {#study}

| Член | |
| --- | --- |
| `id` | `study_…`, новый для каждого исследования: `metadata.agentId` его событий и id агента для его бюджетов, политик и вызовов инструментов |
| `name`, `language`, `charter`, `charterHash` | Имя, язык, замороженный `StudyCharter` и его SHA-256 (в шестнадцатеричном виде), который записывается в `study.started` и с каждым дополнением |
| `amendments` | `StudyAmendment[]`: принятые и отклонённые, по порядку |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. Продолжает с того места, где остановился последний запуск: сначала страж оценивает то, что этот запуск оставил неоценённым; этап, который оценён, но не закончен, только заканчивается; затем выполняются незавершённые этапы. `restart` начинает исследование заново: этапы, результаты, поиски, журнал дрейфа, нумерация и запуски очищаются; устав и дополнения остаются. Лимит, политика, отмена или ошибка завершают запуск с соответствующим статусом и отчётом о том, что было сделано; исключение выбрасывается только для уже идущего запуска, для `onEvent`, который нельзя обслужить, или при сбое хранилища событий. `onEvent` работает так же, как с `agent.run` |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. Классифицируется только относительно устава, никогда относительно более ранних дополнений (два противоречащих друг другу дополнения могут быть приняты оба), по одному в порядке запроса, в отдельном запуске (`mode: 'study-amendment'`), где сначала проверяются политики бюджета; принимается только `refines`, и тогда оно показывается в каждом последующем промпте. `timeoutMs` (по умолчанию 60 000, отсчитывается с момента, когда подходит его очередь) и `signal` ограничивают классификацию: если они срабатывают или политика её отклоняет, дополнение отклоняется как `unclassified`. Выбрасывает `ValidationError` для пустого текста, текста длиннее `MAX_AMENDMENT_LENGTH` (500 символов) или если, когда подходит его очередь, уже было принято `MAX_AMENDMENTS` (10) дополнений |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. Заполняет поля 10 и 11 карточки и записывает `study.result_recorded` в запуск, который её написал; `ValidationError` для неизвестной карточки или пустого `result` |
| `report()` | `StudyReport`: отчёт в текущем виде, включая результаты, записанные после последнего запуска |

Исследование создаётся через `sdk.createStudy`: класс `Study` экспортируется ради своего типа, а то, из чего оно собирается, остаётся внутренним. `MAX_AMENDMENTS` и `MAX_AMENDMENT_LENGTH` экспортируются, как и `StudyAmendOptions` — тип параметров `amend`.

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status` равен `completed`; `stopped`, когда запуск завершил лимит или политика бюджета или тайм-аута, со `stoppedBy` (`maxModelCalls`, `timeoutMs` или `policy`); `failed`, когда его завершила ошибка; или `cancelled`. `error` — это `Error`, завершивший запуск, `report` — `StudyReport` на момент окончания, а `markdown` — то же самое в виде досье.

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

Каждая причина в отчёте — это `StudyReason`: `statusReason` утверждений и компонентов, `priorArtReason` возможности, которая не является новшеством, `reason` записей журнала дрейфа и дополнений, а также `kindReason` пониженной архитектуры. Досье выводит её `code` на языке исследования (`studyLabels(language).reasons`); у текста, который написал страж или модель, код `judged`, а сам текст — в `params.text`. Коды (`StudyReasonCode`):

| Коды | Почему |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | Утверждение или компонент `established` понижены до `hypothesis`: нет источника или нет ни одного идентификатора, перечисленного в его промпте |
| `priorArtNotSearchedYet`, `priorArtNoSource`, `priorArtSearchBudget`, `priorArtNotSearched`, `priorArtSearchFailed`, `priorArtNoResult`, `priorArtNotAssessed`, `priorArtUnsupported` | Почему предшествующие работы для новшества или для сборки возможности всё ещё требуют проверки (их английский текст начинается с «To verify against prior art:») |
| `priorArtExists` | Новшество понижено до `hypothesis`: наиболее близкая работа уже это делает |
| `assemblyExists` | Возможность, которая не является новшеством и сборка которой уже существует (в её `priorArtReason`) |
| `componentDocumented`, `componentUndocumented` | Компонент, представленный как новый |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead` | Элемент, отклонённый схемой |
| `leadAlreadyJudged` | Повторный вердикт по уже оценённому направлению: отбрасывается, это не дрейф (`duplicates` в `study.passage_completed`) |
| `designWithoutCapability` | Проектирование без единой новой возможности |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | Дополнение, которое не удалось классифицировать |
| `judged` | Собственные слова стража или модели |

Каждый элемент — это `StudyClaim` с собственными полями:

| Тип | Собственные поля |
| --- | --- |
| `StudyObservation` | `kind` (`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?` (часть, которую она детализирует) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors` (`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain` (`object` или `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead` (в том виде, в каком его записывает устав), `verdict` (`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind` (`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?` (номер прорыва из устава, который он разбирает), `domain?`, `date?`, `components` (два или больше `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state` (`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because` (условие, которое изменилось), `opens` |
| `StudyCombination` | `a`, `b`, `enables` (что A позволяет делать B), `exchange`, `cost`, `changes` (`representation`, `distribution`, `responsibilities`, `trust`, `verification`, `other`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind` (`capability` или `improvement`), `declaredKind?` и `kindReason?` (возможность, которую страж признал лишь более быстрой или более дешёвой), `capability` (`what`, `forWhom`, `liftedConstraint`), `principleChange?` (`principle`: `representation`, `distribution`, `responsibility`, `trust`, `verification` или `other`; `change`), `mechanism`, `components` (`StudyComponent[]`: `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?`, а также `StudyTrace`), `assembly` (`component`, `gives`, `exchanges`, `cost`, а также `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain` (`stage`, `how`), `uncoveredStages` (звенья всей цепочки, которые она не охватывает, по проверке исследования), `predictions` |
| `StudyThreeState` | `piece`, `state` (`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected` (`architecture`, `result`), `wholeChain` |
| `MechanismCard` | Поля с 1 по 9: `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment`; поля 10 и 11 — после того как вы их записали: `resultAndError?` (`result`, `error?`), `conclusionAndMemory?`, а также `resultRecordedAt?` |

Остальные записи отчёта утверждениями не являются:

| Тип | Поля |
| --- | --- |
| `StudyAmendment` | `number?` (только у принятых, начиная с 1), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`StudyReason`), `by` (`guardian`: вне цели; `schema`: отклонён раньше, например без `servesObjective`), `attempt` (2 при переделке), `runId` |
| `StudySearchResult` | `id` (`S1`…, сохраняется, когда тот же результат найден снова, до перезапуска), `title`, `locator` (URL или другой указатель), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose` (`research` или `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `throttled?` (завершился ошибкой из-за ограничения частоты запросов), `retry?` (вторая попытка поиска предшествующих работ, упёршегося в ограничение частоты запросов), `skipped?` (`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state` (`complete`; `partial`: оценён, но не закончен — ждёт завершения своего цикла или его поиск предшествующих работ был прерван; `unchecked`: элементы, которые страж не оценил; `notRun`), `attempts` (2 после переделки), `keptAttempt?` и `discarded?` (`attempt`, `items`: переделка, отброшенная ради лучшей первой попытки), `reopenedBy`, `runId?` |
| `StudyNotice` | `code` (`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `passagesOutdated`, `capabilitiesToVerify`, `capabilitiesExist`, `noveltiesToVerify`), `params?` (`limit`, `error`, `count`), `details?` (затронутые этапы, пары `passage.collection`, направления, прорывы или архитектуры), `message` (по-английски; досье выводит код на своём языке) |
| `StudyStats` | С последнего перезапуска: `runs` и `modelCalls` (запуски `run()` и вызовы в них, на которые ответил поставщик), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus` (по статусам), `downgraded` (утверждения, статус которых исследование понизило), `noveltiesToVerify`, `redos`, `loops`. А также `amendments` (`count`, `modelCalls`): все дополнения исследования, учтённые отдельно |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

Возвращает отчёт в виде читаемого досье в формате Markdown на языке отчёта: это `markdown` из `StudyResult`. Вызовите его для `study.report()`, чтобы включить результаты, записанные с тех пор. Его слова берутся из `studyLabels(language)` (`StudyLabels`), которые существуют на одиннадцати языках этой документации (`StudyLabelLanguage`); другой или неизвестный язык получает английские слова, а `fr-CA` — французские.

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

Запуски сравниваются **по смыслу их событий**, а не по id событий (у каждого запуска они новые). События сопоставляются по порядку: сначала одинаковые события, затем события того же типа и предмета (инструмент, операция, этап исследования, ответ), у которых изменились данные, затем события, у которых для того же предмета сменился тип. Никогда не сравниваются: id событий, время, метаданные, события `incident.reported` (они записывают отправку уведомлений и их ограничение; событие, вызвавшее инцидент, сравнивается) и значения, которые записывает SDK и которые меняются от запуска к запуску: длительность вызова инструмента, расход токенов, паузы перед повторами, id одобрений, исходный запуск воспроизведения, время и исходное событие наблюдения. Текст, который модель пишет рядом с вызовом инструмента, сравнивается только в `intention.generated`. Параметры, результат и вход инструмента сравниваются всегда, как бы ни назывались их ключи: аргумент `duration`, изменившийся с 30 на 60, — это изменение. Запуск, который снова делает то же самое, проходит; инструмент, вызванный с другими аргументами, отмечается там, где произошёл вызов (`parameters.metric: "churn" → "revenue"`); вызов, вставленный перед таким же, — это один добавленный вызов; `action.executed`, ставший `action.failed`, — это одно изменение, а не пропажа плюс добавление.

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
| `StudyRunOptions.onEvent`: `study.run({ onEvent })` | То же самое для запуска исследования, у которого ожидание прекращает и `limits.timeoutMs` |
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

Каждая функция возвращает готовые `ToolDefinition`: пропустите их через `sdk.defineTool`, прежде чем давать агенту (агенты принимают `Tool[]`), или передайте напрямую в `tools` сервера MCP. См. [Инструменты](../guide/tools) и [Сервер MCP для чего угодно](../guide/mcp-recipes).

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
| `webTools({ include?, prefix?, search?, circuitBreaker?, throttleWaitMs?, language?, userAgent?, timeoutMs?, callTimeoutMs?, maxResponseBytes?, maxRedirects?, hostIntervalMs?, robots?, allowPrivateNetwork?, lookup?, maxPdfBytes?, maxPdfPages?, cache?, retry?, arxiv?, wikipedia?, github? })` | `ToolDefinition[]` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search`, только для чтения (`web_fetch` — средний риск, остальные — низкий). Результаты поиска `{ id, title, url, date?, excerpt, source }`; страница `{ url, finalUrl, title?, date?, language?, contentType, content, truncated, untrusted: true, hint? }`. Никаких адресов вне публичного интернета, если не задан `allowPrivateNetwork`; robots.txt соблюдается; каждый вызов укладывается в `callTimeoutMs` (60 с). См. [Поиск в интернете](../guide/web-research) |
| `duckDuckGo({ region?, minIntervalMs?, baseUrl? })` | `SearchProvider` | Провайдер `web_search` по умолчанию, без ключа: HTML-страница DuckDuckGo, 4 с между поисками, считая от окончания предыдущего |
| `searxng({ baseUrl, engines?, categories?, minIntervalMs? })` | `SearchProvider` | JSON API экземпляра SearXNG; результаты называются `searxng:<engine>` и датируются по `publishedDate` |
| `brave({ apiKey, baseUrl?, minIntervalMs? })`, `tavily(…)`, `serper(…)` | `SearchProvider` | API Brave Search, Tavily и Serper, с их ключом |
| `citableUrl(url)`, `normalizeUrl(url)` | `string \| undefined` | URL, по которому результат поиска цитируется (без параметров отслеживания и фрагмента), и URL, по которому он узнаётся для своего id и поиска дубликатов (вдобавок хост в нижнем регистре, без завершающей косой черты); `undefined` для всего, кроме http(s) |
| `isPublicAddress(address)` | `boolean` | Находится ли IP-адрес в публичном интернете (проверка, стоящая за `allowPrivateNetwork`) |

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

`web_search` опрашивает своих провайдеров по порядку; провайдер, выбросивший ошибку, передаёт очередь следующему. Тот, что выбросил `SearchThrottledError` (`retryAfterMs?` — запрошенная им пауза) или ответил HTTP 429, получает ещё одну попытку после этой паузы или `throttleWaitMs` (10 с), если крайний срок вызова это позволяет, и никакой, если он запросил больше 30 с; если ограничение сохраняется (или он дал сбой три раза подряд), он пропускается на `circuitBreaker.cooldownMs` (2 минуты) или на столько, сколько он запросил, если это дольше. Запросы к хосту идут по одному, каждый — через `minIntervalMs` после окончания предыдущего, для всего процесса (DuckDuckGo: 4 с по умолчанию). Веб-инструменты выбрасывают `WebRequestRefusedError` для того, что они отклоняют намеренно (`reason`: `private-address`, `scheme`, `downgrade`, `redirects`, `robots`, `content-type`, `too-large`, `unreadable`, `pacing`), `WebHttpError` для ответа не из 2xx (`status`), `WebTimeoutError` (истёк запрос, крайний срок вызова или бюджет времени на извлечение), `WebConfigurationError` при недостающей настройке (`unpdf`, токен GitHub) и `SearchUnavailableError`, когда не ответил ни один провайдер (`failures`; `throttled`, когда все упёрлись в ограничение частоты запросов, `retryAfterMs?`, когда пропущенный провайдер получит новую попытку). `retry` никогда не повторяет отклонённый запрос, недостающую настройку, поиск, на который не ответил ни один провайдер, или ограничение частоты запросов (HTTP 429, `SearchThrottledError`).

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

| Функция | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP, открывающий ровно то, что перечислено в `tools`: имена определённых инструментов и/или `ToolDefinition` (SDK определяет их за вас; одно и то же определение можно передать повторно, а другой инструмент с уже занятым именем отклоняется). `resources`: один или несколько `ResourceProvider`; каждое чтение записывается в трассу. Вызовы выполняются от имени `mcp:<name>` (или `agentId`); одобрение, по которому никто не принял решения за `approvalTimeoutMs` (по умолчанию 50 000 мс), отменяется; отказы из-за входных данных объясняются клиенту, остальные причины — только при `exposeErrorDetails`. Вызов с `progressToken` получает по одному `notifications/progress` на каждое событие, и все они отправляются до результата ([уведомления о ходе выполнения](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | То же самое, подключённое к stdin/stdout; пишет одну строку «ready» в stderr и закрывается, когда заканчивается stdin (выполняющиеся вызовы прерываются, ожидающие одобрения отменяются). `approvalTimeoutMs` по умолчанию 50 000, как и для `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — инструменты любого сервера MCP в виде `ToolDefinition` |

`GovernedToolHost` — это то, что нужно серверу от SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` возвращает объект, который его реализует.

## Строительные блоки {#building-blocks}

Строительные блоки SDK экспортируются для пользовательских конфигураций: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, а также их основные типы.
