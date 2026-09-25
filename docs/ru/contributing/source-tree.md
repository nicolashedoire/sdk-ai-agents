# Структура исходного кода

## Обзор {#overview}

SDK организован в понятную модульную структуру с разделением ответственности. Основной исходный код находится в `src/`, с подпапками для каждой функциональной области.

## Полная структура каталогов {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## Ключевые каталоги {#critical-directories}

### `src/engines/` {#src-engines}

**Назначение:** содержит основные движки SDK, которые управляют жизненным циклом агента.

**Содержит:**
- `reasoning-engine.ts`: генерирует намерения из LLM (без побочных эффектов)
- `action-engine.ts`: выполняет намерения после проверки движком политик
- `policy-engine.ts`: проверяет намерения по настроенным политикам
- `replay-engine.ts`: воспроизводит выполнения по сохранённым событиям

**Точки входа:** используется в `AgentImpl` и `SDKImpl`

**Интеграция:** движки внедряются в `AgentImpl` и `SDKImpl` через конструктор

### `src/stores/` {#src-stores}

**Назначение:** реализации интерфейса `IEventStore` для сохранения событий.

**Содержит:**
- `event-store.ts`: общий интерфейс `IEventStore`
- `file-event-store.ts`: реализация на файлах (MVP)
- `sql-event-store.ts`: обобщённая реализация на SQL
- `sqlite-event-store.ts`: реализация на SQLite
- `postgresql-event-store.ts`: реализация на PostgreSQL с JSONB
- `observed-event-store.ts`: передаёт каждое добавленное событие слушателям в реальном времени (`onEvent`, `sdk.subscribe`)

**Точки входа:** используется в `SDKImpl` и `ReplayEngine`

**Интеграция:** внедряется в `SDKImpl` через конфигурацию

### `src/providers/` {#src-providers}

**Назначение:** реализации интерфейса `LLMProvider` для разных провайдеров LLM.

**Содержит:**
- `llm-provider.ts`: общий интерфейс `LLMProvider`
- `openai-provider.ts`: реализация для OpenAI
- `anthropic-provider.ts`: реализация для Anthropic
- `fallback-provider.ts`: провайдер с автоматическим переключением на резерв
- `provider-factory.ts`: фабрика для создания провайдеров

**Точки входа:** используется в `ReasoningEngine`

**Интеграция:** внедряется в `ReasoningEngine` через конструктор

### `src/managers/` {#src-managers}

**Назначение:** классы управления расширенными возможностями (одобрения, бюджеты, тесты и т. д.).

**Содержит:**
- `approval-manager.ts`: управление одобрениями человеком
- `budget-tracker.ts`: отслеживание бюджета и расхода
- `golden-trace-manager.ts`: управление эталонными трассами
- `regression-test-manager.ts`: управление наборами регрессионных тестов
- `assertion-manager.ts`: управление проверками поведения
- `impact-analysis-manager.ts`: управление анализом влияния

**Точки входа:** используется в `SDKImpl` и `PolicyEngine`

**Интеграция:** внедряется в `SDKImpl` и `PolicyEngine` через конструктор

### `src/registry/` {#src-registry}

**Назначение:** реестры для управления доступными инструментами и возможностями.

**Содержит:**
- `tool-registry.ts`: управление доступными инструментами (по умолчанию всё запрещено)
- `capability-registry.ts`: управление возможностями (группами инструментов)

**Точки входа:** используется в `SDKImpl` и `ActionEngine`

**Интеграция:** внедряется в `SDKImpl` и `ActionEngine` через конструктор

### `src/types/` {#src-types}

**Назначение:** определения TypeScript для всех типов SDK.

**Содержит:**
- Типы для Agent, Tool, Policy, Event, Run, SDK
- Типы для расширенных возможностей (граф рассуждения, альтернативы и т. д.)
- Типы для тестирования (эталонная трасса, регрессия, проверка поведения и т. д.)

**Точки входа:** импортируется всеми модулями

**Интеграция:** используется по всей кодовой базе для типобезопасности

### `src/utils/` {#src-utils}

**Назначение:** служебные функции и помощники.

**Содержит:**
- `constants.ts`: глобальные константы
- `id.ts`: генерация уникальных идентификаторов
- `zod-to-json-schema.ts`: преобразование Zod → JSON Schema
- Утилиты для графа рассуждения, альтернатив, закономерностей и т. д.
- Утилиты для тестирования (проверка, регрессии, проверки поведения и т. д.)

**Точки входа:** импортируется модулями, которым это нужно

**Интеграция:** используется движками, менеджерами и другими модулями

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**Назначение:** когнитивные агенты — явное ментальное состояние, когнитивные операции, контроллеры, профили мыслителя.

**Содержит:** `cognitive-agent.ts` (цикл запуска), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (эвристический), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` и `thought-prompts.ts`, `mental-state.ts` (схемы и типы), `mental-state-reducer.ts` и `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/study/` {#src-study}

**Назначение:** исследования (`sdk.createStudy`) — исследователь, который понимает объект, затем предлагает, как его перепроектировать, отдельно от когнитивного движка.

**Содержит:** `study.ts` (класс `Study`: запуски, страж, дополнения, поиск предшествующих работ), `passages.ts` (семь этапов, их коллекции и схемы), `study-config.ts` (конфигурация, замороженный устав и его хеш), `study-prompts.ts` и `study-replies.ts` (промпты, собираемые заново при каждом вызове, ответы, читаемые по их схемам), `study-claims.ts` (статусы утверждений, проверяемые в коде), `study-sources.ts` (источники, параметры запроса, результаты), `study-model.ts` и `study-run.ts` (вызовы модели, лимиты, события), `study-report.ts`, `study-markdown.ts` и `study-labels.ts` (отчёт и досье на одиннадцати языках), `study-types.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**Назначение:** типизированные решения — контракт Noul/Choice/Score, HTTP-клиент TypeSafe Jev и `DecisionService`, стоящий за `sdk.decisions`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**Назначение:** цены и отчёты о затратах по запуску; политика повторных попыток и провайдер LLM с повторными попытками; правила инцидентов, уведомители (электронная почта, вебхук, Resend) и хранилище событий с мониторингом.

### `src/mcp/` и `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**Назначение:** сервер MCP, открывающий управляемые инструменты и ресурсы (`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`), и клиент MCP, импортирующий инструменты (`mcp-client.ts`). Публикуется как точка входа `@sdk-ai-agents/core/mcp`, чтобы ядро не зависело от `@modelcontextprotocol/sdk`.

### `src/tools/` {#src-tools}

**Назначение:** источники инструментов, которые создают `ToolDefinition` из системы без зависимости от MCP: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (веб-API), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (папки и ресурсы), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (базы данных только для чтения), `agent-tools.ts` (агенты как инструменты), а также `tool-names.ts` и `bounded-text.ts`.

### `src/__tests__/support/` {#src-tests-support}

**Назначение:** тестовые дублёры, реализующие порты SDK (провайдер LLM, действующий по сценарию, клиент решений в памяти, локальный HTTP-сервер, записывающий клиент PostgreSQL, загрузчик `node:sqlite`), — без подмены модулей.

## Точки входа {#entry-points}

### Основная точка входа {#main-entry}

- **`src/index.ts`**: публичная точка входа SDK, экспортирует все публичные API

### Точки входа приложения {#application-entry-points}

- **`src/sdk.ts`**: основная реализация SDK (`SDKImpl`)
- **`src/agent.ts`**: реализация агента (`AgentImpl`)

## Шаблоны организации файлов {#file-organization-patterns}

### Соглашения об именовании {#naming-conventions}

- **Файлы**: kebab-case для файлов (например, `reasoning-engine.ts`)
- **Классы**: PascalCase (например, `ReasoningEngine`)
- **Интерфейсы**: PascalCase с префиксом `I` при необходимости (например, `IEventStore`)
- **Типы**: PascalCase (например, `EventType`, `RunStatus`)
- **Функции**: camelCase (например, `generateCompletion`)

### Организация модулей {#module-organization}

- **Один класс или интерфейс на файл**: каждый файл содержит один основной класс или интерфейс
- **Типы рядом с кодом**: связанные типы в том же файле или в `types/`
- **Реэкспорт через barrel-файлы**: `index.ts` для экспорта публичных API

## Файлы конфигурации {#configuration-files}

- **`package.json`**: зависимости и скрипты npm
- **`tsconfig.json`**: конфигурация TypeScript (строгий режим, ESM)
- **`biome.json`**: конфигурация Biome (линтинг и форматирование)
- **`vitest.config.ts`**: конфигурация Vitest (тестирование)

## Заметки для разработки {#notes-for-development}

### Добавление новых возможностей {#adding-new-features}

1. **Новый движок**: создайте в `src/engines/`, внедрите в `SDKImpl` или `AgentImpl`
2. **Новое хранилище**: реализуйте `IEventStore` в `src/stores/`
3. **Новый провайдер**: реализуйте `LLMProvider` в `src/providers/`
4. **Новый менеджер**: создайте в `src/managers/`, внедрите в `SDKImpl`
5. **Новые типы**: добавьте в `src/types/`, экспортируйте из `types/index.ts`

### Тестирование {#testing}

- Модульные тесты в `src/__tests__/`
- Один файл тестов на каждый модуль исходного кода
- Используйте Vitest для тестов

### Сборка {#build}

- TypeScript компилирует `src/` → `dist/`
- Для отладки генерируются карты исходников
- Генерируются объявления TypeScript (`.d.ts`)
