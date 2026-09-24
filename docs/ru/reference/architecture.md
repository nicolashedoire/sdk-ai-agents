# Архитектура

![Архитектура SDK](/images/architecture.svg){.illustration}

## Когнитивный слой (v0.2) {#cognitive-layer-v0-2}

Версия 0.2 добавляет слой рассуждения поверх управляемой среды выполнения, описанной ниже. Он построен из небольших заменяемых частей:

| Часть | Модуль | Ответственность |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | Цикл запуска, отмена, тайм-аут, обратная связь |
| `OperationSelector` | `src/cognition/operation-selector.ts` | Вычисляет доступные операции, опрашивает контроллер, принудительно запускает итоговое решение |
| Контроллеры | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | Эвристический выбор следующей операции и выбор на основе Jev |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | Передаёт работу генератору мыслей, искателю информации, проверяющему предсказаний или оценщику гипотез |
| Допуск патчей | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | Единая точка входа каждой мысли: поля, разрешённые для каждой операции, поля, которые пишет только движок, определение статуса решения |
| Доказательства | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | Происхождение наблюдений, пересмотр фактов, сравнения, результаты тестов, противоречия и их разрешение |
| Представление состояния | `src/cognition/mental-state-view.ts` | Компактное представление состояния для промптов мыслей и наборов данных контроллера: готовность, ранжирование, уже проведённые эксперименты |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | Запускает ваш `OutcomeEvaluator` на ожидающем предсказании и записывает отчёт |
| Страж вывода | `src/cognition/decision-readiness.ts` | Ранжирование, проверка готовности, committed / provisional / abstain |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | Один промпт на операцию, строгий JSON, валидация Zod, одно исправление |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | Выбор инструмента встроенным движком рассуждения, выполнение через движок действий |
| Редьюсер | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | Чистое детерминированное применение патчей мыслей с инвариантами, версионируемое через `schemaVersion` |
| Воспроизведение | `src/cognition/mental-state-replay.ts` | Восстановление ментального состояния и набор данных контроллера из событий |
| Профили | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | Схема профиля, отображение, уточнение, выделение |
| Оценщики гипотез | `src/cognition/hypothesis-assessor.ts` | `compare` с типизированными решениями: доказательства запрашиваются без мыслителя, соответствие — только для предложений |
| Регистратор и фабрика | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | Структура событий когнитивного запуска; сборка агента из его конфигурации и сервисов SDK |

Вокруг него: `src/decisions` (типизированные решения, клиент Jev, сервис решений), `src/costs` (цены и затраты запусков), `src/resilience` (политика повторных попыток и провайдер с повторными попытками), `src/incidents` (правила, уведомители, хранилище событий с мониторингом) и `src/mcp` (сервер и клиент, публикуются как `@sdk-ai-agents/core/mcp`).

Остальная часть этой страницы описывает управляемую среду выполнения (v0.1).

## Краткое изложение {#executive-summary}

SDK_AI_Agents следует архитектуре event sourcing со строгим разделением рассуждения и действия. SDK скрывает внутреннюю сложность за простым и интуитивно понятным API.

## Архитектурный шаблон {#architecture-pattern}

**Основной шаблон:** event sourcing с разделением ответственности

- **Движок рассуждения** (Reasoning Engine): генерирует намерения из LLM (без побочных эффектов)
- **Движок действий** (Action Engine): выполняет намерения после проверки
- **Движок политик** (Policy Engine): проверяет намерения по политикам
- **Хранилище событий** (Event Store): единственный источник истины для всех событий

## Обзор компонентов {#component-overview}

### 1. Слой API SDK (фасад) {#_1-sdk-api-layer-facade}

**Ответственность:**
- Простой и интуитивно понятный публичный интерфейс
- Отображение API → внутренние события
- Разумная конфигурация по умолчанию
- Управление жизненным циклом SDK и агентов

**Файлы:**
- `src/sdk.ts`: основная реализация (`SDKImpl`)
- `src/agent.ts`: реализация агента (`AgentImpl`)
- `src/index.ts`: публичные экспорты

**Основные интерфейсы:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. Движок рассуждения {#_2-reasoning-engine}

**Ответственность:**
- Интеграция с провайдером LLM (OpenAI/Anthropic)
- Генерация структурированных намерений из ответов LLM
- Управление контекстом диалога
- Порождение событий рассуждения

**Файл:** `src/engines/reasoning-engine.ts`

**Ограничения:**
- Никогда не может напрямую выполнить инструмент
- Никогда не может вызвать побочный эффект
- Только генерирует структурированные намерения

**Зависимости:**
- Провайдер LLM (шаблон «Стратегия»)
- Хранилище событий (порождение событий)

### 3. Движок действий {#_3-action-engine}

**Ответственность:**
- Получение и проверка намерений
- Выполнение инструментов через реестр инструментов
- Применение политик через движок политик
- Порождение событий действий

**Файл:** `src/engines/action-engine.ts`

**Ограничения:**
- Каждое действие должно проходить через движок действий
- Перед выполнением обязательна проверка
- Для каждого действия порождается событие

**Зависимости:**
- Движок политик (проверка)
- Реестр инструментов (выполнение)
- Хранилище событий (порождение событий)
- Менеджер одобрений (необязательно)
- Трекер бюджета (необязательно)

### 4. Движок политик {#_4-policy-engine}

**Ответственность:**
- Проверка намерений по активным политикам
- Применение глобальных и частных политик
- Проверка бюджетов, тайм-аутов, списков разрешённых инструментов
- Порождение событий проверки

**Файл:** `src/engines/policy-engine.ts`

**Ограничения:**
- По умолчанию всё запрещено: запрещено всё, что явно не разрешено
- Обязательная проверка перед каждым действием

**Зависимости:**
- Хранилище событий (порождение событий проверки)
- Трекер бюджета (необязательно)
- Вычислитель условий

### 5. Движок воспроизведения {#_5-replay-engine}

**Ответственность:**
- Воспроизведение выполнений по сохранённым событиям
- Детерминированное воспроизведение без вызова LLM
- Порождение новых событий воспроизведения

**Файл:** `src/engines/replay-engine.ts`

**Ограничения:**
- Воспроизведение использует только сохранённые события
- Во время воспроизведения LLM не вызывается
- Воспроизведение повторяет ту же логическую последовательность

**Зависимости:**
- Хранилище событий (чтение событий)
- Движок действий (выполнение намерений)

### 6. Хранилище событий {#_6-event-store}

**Ответственность:**
- Сохранение событий (только дописывание)
- Получение событий по runId
- Фильтрация событий и запросы к ним
- Абстракция для разных реализаций

**Файлы:**
- `src/stores/event-store.ts`: интерфейс `IEventStore`
- `src/stores/file-event-store.ts`: реализация на файлах
- `src/stores/sql-event-store.ts`: обобщённая реализация на SQL
- `src/stores/sqlite-event-store.ts`: реализация на SQLite
- `src/stores/postgresql-event-store.ts`: реализация на PostgreSQL
- `src/stores/observed-event-store.ts`: передаёт каждое добавленное событие слушателям в реальном времени (`onEvent`, `sdk.subscribe`)

**Интерфейс:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
  subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): EventSubscription
}
```

### 7. Реестр инструментов {#_7-tool-registry}

**Ответственность:**
- Управление объявленными инструментами
- Проверка входных данных по схеме (Zod)
- Выполнение инструментов с проверкой
- Строгий список разрешённых (по умолчанию всё запрещено)

**Файл:** `src/registry/tool-registry.ts`

**Ограничения:**
- Автоматическое отклонение необъявленных инструментов
- Обязательная проверка перед выполнением
- Строгий список разрешённых

**Зависимости:**
- Zod (проверка схем)

### 8. Реестр возможностей {#_8-capability-registry}

**Ответственность:**
- Управление возможностями (группами инструментов)
- Связь инструмент ↔ возможность

**Файл:** `src/registry/capability-registry.ts`

### 9. Абстракция провайдеров LLM {#_9-llm-provider-abstraction}

**Ответственность:**
- Сглаживание различий между провайдерами LLM
- Нормализация форматов запросов и ответов
- Поддержка нескольких провайдеров (OpenAI, Anthropic)
- Автоматическое переключение на резерв

**Файлы:**
- `src/providers/llm-provider.ts`: интерфейс `LLMProvider`
- `src/providers/openai-provider.ts`: реализация для OpenAI
- `src/providers/anthropic-provider.ts`: реализация для Anthropic
- `src/providers/fallback-provider.ts`: провайдер с резервом
- `src/providers/provider-factory.ts`: фабрика для создания провайдеров

**Интерфейс:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. Классы-менеджеры {#_10-manager-classes}

**Ответственность:**
- Управление расширенными возможностями
- Координация между компонентами

**Файлы:**
- `src/managers/approval-manager.ts`: управление одобрениями человеком
- `src/managers/budget-tracker.ts`: отслеживание бюджета и расхода
- `src/managers/golden-trace-manager.ts`: управление эталонными трассами
- `src/managers/regression-test-manager.ts`: управление наборами тестов
- `src/managers/assertion-manager.ts`: управление проверками поведения
- `src/managers/impact-analysis-manager.ts`: управление анализом влияния

## Архитектура данных {#data-architecture}

### Типы событий {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';
```

### Структура события {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### Реализации хранилища событий {#event-store-implementations}

1. **FileEventStore** (для MVP)
   - Хранение в файлах
   - Один JSON-файл на каждый runId
   - Автоматический пакетный сброс на диск

2. **SQLEventStore** (для продакшена)
   - Обобщённая реализация на SQL
   - Поддержка SQLite и PostgreSQL
   - Индексы для производительности

3. **PostgreSQLEventStore** (для продвинутого продакшена)
   - Использует JSONB для эффективного хранения
   - Индексы GIN для запросов к JSON
   - Поддержка сложных запросов

## Проектирование API {#api-design}

### Инициализация SDK {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Создание агента {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Определение инструмента {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Выполнение агента {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Стратегия тестирования {#testing-strategy}

### Модульные тесты {#unit-tests}

- Модульные тесты для каждого модуля
- Используется Vitest
- Имитация внешних зависимостей

### Интеграционные тесты {#integration-tests}

- Интеграционные тесты для полных сценариев работы
- Тесты с разными хранилищами событий
- Тесты воспроизведения

### Эталонные трассы {#golden-traces}

- Эталонные трассы для регрессионных тестов
- Проверка поведения через воспроизведение
- Автоматическое обнаружение регрессий

## Архитектура развёртывания {#deployment-architecture}

### Распространение пакета {#package-distribution}

- **Имя пакета**: `@sdk-ai-agents/core`
- **Распространение**: npm
- **Точка входа**: `dist/index.js`
- **Определения типов**: `dist/index.d.ts`

### Процесс сборки {#build-process}

1. Компиляция TypeScript (`tsc`)
2. Генерируются карты исходников (source maps)
3. Генерируются файлы объявлений
4. Результат в `dist/`

### Зависимости {#dependencies}

**Среда выполнения:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Одноранговые зависимости (peer dependencies):**
- `pg`: ^8.11.0 (для PostgreSQLEventStore)

**Зависимости для разработки:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Вопросы безопасности {#security-considerations}

### По умолчанию всё запрещено {#deny-by-default}

- Все инструменты должны быть явно объявлены
- Все действия должны проходить через движок политик
- Перед выполнением обязательна проверка

### Разделение ответственности {#separation-of-concerns}

- Движок рассуждения не может выполнять инструменты
- Движок действий проверяет перед выполнением
- Движок политик проверяет все действия

### Журнал аудита {#audit-trail}

- Все события сохраняются
- Полная прослеживаемость решений
- Журнал аудита политик

## Вопросы производительности {#performance-considerations}

### Производительность хранилища событий {#event-store-performance}

- FileEventStore: пакетный сброс (10 событий или 100 мс)
- SQLEventStore: индексы для быстрых запросов
- PostgreSQLEventStore: JSONB + индексы GIN

### Накладные расходы SDK {#sdk-overhead}

- Минимальные накладные расходы (< 5–10 мс без учёта LLM и инструментов)
- Асинхронное порождение событий
- Пакетный сброс для производительности

## Планы на будущее {#future-considerations}

### Масштабируемость {#scalability}

- Переход на распределённое хранилище событий (в стиле Kafka)
- Поддержка нескольких экземпляров
- Кластеризация хранилища событий

### Возможности {#features}

- Поддержка дополнительных провайдеров LLM
- Облачное хранилище событий (S3 и т. п.)
- Панель мониторинга
