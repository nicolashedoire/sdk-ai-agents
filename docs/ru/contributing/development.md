# Руководство разработчика

## Предварительные требования {#prerequisites}

### Обязательно {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: входит в состав Node.js
- **TypeScript**: 5.3.2+ (устанавливается локально через npm)

### Необязательно {#optional}

- **PostgreSQL**: 8.11.0+ (для PostgreSQLEventStore, peer-зависимость)
- **Git**: для контроля версий

## Настройка окружения {#environment-setup}

### 1. Клонируйте репозиторий {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Установите зависимости {#_2-install-dependencies}

```bash
npm install
```

### 3. Настройте переменные окружения {#_3-configure-environment-variables}

Создайте файл `.env` в корне (необязательно, для примеров):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Локальная разработка {#local-development}

### Сборка {#build}

Скомпилируйте TypeScript:

```bash
npm run build
```

Скомпилированный код будет находиться в `dist/`.

### Режим наблюдения {#watch-mode}

Компилируйте в режиме наблюдения (автоматическая перекомпиляция):

```bash
npm run dev
```

### Запуск примеров {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## Тестирование {#testing}

### Запуск всех тестов {#run-all-tests}

```bash
npm test
```

### Режим наблюдения {#watch-mode-1}

```bash
npm run test:watch
```

### Покрытие {#coverage}

```bash
npm run test:coverage
```

### Запуск отдельного файла тестов {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## Качество кода {#code-quality}

### Линтинг {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Форматирование {#formatting}

```bash
# Format code
npm run format
```

### Полная проверка (линтинг + форматирование) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## Типичные задачи разработки {#common-development-tasks}

### Добавление нового инструмента {#adding-a-new-tool}

1. Определите инструмент с помощью `sdk.defineTool()`:

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. Добавьте инструмент агенту:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### Добавление новой политики {#adding-a-new-policy}

1. Определите политику:

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. Примените политику:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Добавление нового хранилища событий {#adding-a-new-event-store}

1. Реализуйте `IEventStore`:

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. Используйте его в SDK:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Добавление нового провайдера LLM {#adding-a-new-llm-provider}

1. Реализуйте `LLMProvider`:

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

2. Добавьте его в `ProviderFactory`:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Процесс сборки {#build-process}

### Компиляция TypeScript {#typescript-compilation}

Сборка использует компилятор TypeScript напрямую:

```bash
tsc
```

Конфигурация в `tsconfig.json`:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Strict Mode**: включён
- **Source Maps**: включены
- **Declaration Files**: включены

### Структура результата {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## Стратегия тестирования {#testing-strategy}

### Модульные тесты {#unit-tests}

- Модульные тесты для каждого модуля
- Используется Vitest
- Ни один тест не обращается к настоящему платному сервису и не подменяет модули или функции: порты SDK реализуются тестовыми дублёрами из `src/__tests__/support/`, а HTTP-адаптеры, включая провайдеры OpenAI и Anthropic, работают с локальными серверами. `no-mocks.test.ts` отклоняет `vi.mock`, `vi.fn` и `vi.spyOn`

### Интеграционные тесты {#integration-tests}

- Интеграционные тесты для полных сценариев работы
- Модель — это провайдер, действующий по сценарию, или настоящий клиент OpenAI либо Anthropic, который обращается к локальному серверу, отвечающему в формате поставщика; ни один тест не обращается к настоящему API
- Тесты с разными хранилищами событий

### Пример структуры теста {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## Отладка {#debugging}

### Карты исходников {#source-maps}

Карты исходников (source maps) генерируются автоматически во время сборки. Они позволяют отлаживать код TypeScript напрямую.

### Отладка в VS Code {#vs-code-debugging}

Конфигурация `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Стиль кода {#code-style}

### Рекомендации по TypeScript {#typescript-best-practices}

- **Строгий режим**: всегда включён
- **Типобезопасность**: используйте явные типы
- **Никакого `any`**: избегайте `any`, при необходимости используйте `unknown`
- **Интерфейсы и типы**: для объектов предпочитайте интерфейсы, для объединений и пересечений — типы

### Соглашения об именовании {#naming-conventions}

- **Файлы**: kebab-case (`my-file.ts`)
- **Классы**: PascalCase (`MyClass`)
- **Функции**: camelCase (`myFunction`)
- **Константы**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Типы и интерфейсы**: PascalCase (`MyType`)

### Организация кода {#code-organization}

- **Один класс или интерфейс на файл**
- **Типы рядом с кодом**: типы в том же файле или в `types/`
- **Реэкспорт через barrel-файлы**: `index.ts` для публичных экспортов

## Частые проблемы {#common-issues}

### Ошибки TypeScript {#typescript-errors}

Если вы получаете ошибки TypeScript:

1. Проверьте, что `tsconfig.json` корректен
2. Проверьте, что все зависимости установлены
3. Очистите и пересоберите: `npm run clean && npm run build`

### Падения тестов {#test-failures}

Если тесты падают:

1. Проверьте, что тестовые дублёры из `src/__tests__/support/` по-прежнему соответствуют интерфейсам, которые они заменяют
2. Проверьте, что зависимости обновлены
3. Запустите тесты в режиме наблюдения, чтобы видеть ошибки в реальном времени

### Ошибки сборки {#build-errors}

Если сборка не проходит:

1. Проверьте ошибки TypeScript: `npm run build`
2. Проверьте ошибки линтинга: `npm run lint`
3. Очистите папку `dist/`: `npm run clean`

## Процесс выпуска {#release-process}

### Версионирование {#versioning}

Проект использует семантическое версионирование (SemVer):
- **MAJOR**: несовместимые изменения
- **MINOR**: новые обратно совместимые возможности
- **PATCH**: обратно совместимые исправления ошибок

### Чек-лист перед выпуском {#pre-release-checklist}

- [ ] Все тесты проходят
- [ ] Код проверен линтером и отформатирован
- [ ] Документация актуальна
- [ ] CHANGELOG.md обновлён
- [ ] Версия в `package.json` обновлена

### Сборка для выпуска {#build-for-release}

```bash
# Clean
npm run clean

# Build
npm run build

# Test
npm test

# Check
npm run check
```

## Ресурсы {#resources}

- **Документация**: `docs/`
- **Примеры**: `examples/`
- **Определения типов**: `src/types/`
- **Тесты**: `src/__tests__/`

## Сайт документации {#documentation-site}

Документация — это сайт VitePress в `docs/`, проиллюстрированный SVG-изображениями из `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

Рабочий процесс GitHub Actions `Docs` публикует её на GitHub Pages при каждом push в `main`.
