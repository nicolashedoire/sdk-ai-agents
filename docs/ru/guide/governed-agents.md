# Управляемые агенты

Управляемый агент выполняет классический цикл вызова инструментов — с одной особенностью: **LLM только предлагает намерения**. Движок действий проверяет каждое намерение по схемам и политикам, прежде чем что-либо произойдёт, и записывает каждый шаг. На этой странице рассматриваются инструменты, возможности, политики, трассы, воспроизведение и остановка запуска.

::: tip Рассуждать, прежде чем действовать
Для решений с открытым исходом предпочтительнее [когнитивные агенты](./cognitive-agents): они используют те же инструменты, политики и трассы.
:::

## Предварительные требования {#prerequisites}

- Установленный Node.js 20+
- Ключ API OpenAI (или другого провайдера LLM)
- Базовые знания TypeScript/JavaScript

## Установка {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## Первый агент за 5 минут {#first-agent-in-5-minutes}

### Шаг 1: инициализируйте SDK {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Шаг 2: определите инструмент {#step-2-define-a-tool}

Инструмент — это возможность, которую может использовать агент. Он должен быть явно объявлен.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### Шаг 3: создайте агента {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
});
```

### Шаг 4: запустите агента {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### Шаг 5: посмотрите трассу {#step-5-view-the-trace}

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## Полный пример (10 строк) {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-5.4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## Ключевые понятия {#key-concepts}

### 1. Инструменты {#_1-tools}

Инструменты — единственные действия, которые может выполнять агент. **По умолчанию ничего не разрешено** (deny-by-default): инструмент должен быть зарегистрирован, прежде чем что-либо сможет его запустить.

::: warning Область действия управляемого агента
Управляемый агент может выполнить **любой инструмент, зарегистрированный в SDK**, который назовёт модель: список `tools` агента определяет, что модели предлагается, а не то, что она может вызвать. Ограничьте его политикой `allowlist` — любой другой инструмент будет отклонён до выполнения:

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

Когнитивные агенты и серверы MCP ограничены своим списком инструментов автоматически.
:::

**Характеристики:**
- Явное определение со схемой Zod
- Автоматическая проверка входных данных
- Поддержка версионирования
- Полная прослеживаемость

**Пример:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. Возможности {#_2-capabilities}

Возможности позволяют логически группировать инструменты и повторно их использовать.

**Пример:**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  capabilities: ['math'],
});
```

### 3. Политики {#_3-policies}

Политики определяют, что может делать агент.

**Типы политик:**
- **Бюджет** (budget): ограничение числа шагов или токенов
- **Тайм-аут** (timeout): максимальная длительность выполнения
- **Список разрешённых** (allowlist): список авторизованных инструментов
- **Пользовательская** (custom): собственный валидатор

**Пример:**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

Ограничения бюджета и времени проверяются перед каждым вызовом инструмента в запуске управляемого агента, по ходу этого запуска: `maxSteps` считает уже сделанные шаги (первый вызов — на шаге 0), `maxTokens` — токены, израсходованные вызовами модели, `maxDuration` — время с начала запуска. Ограничение отклоняет вызов инструмента, и запуск завершается ошибкой; вызов модели оно никогда не прерывает. Бюджеты токенов и стоимости за период (`budgetLimit` с `maxTokens` или `maxCost`) учитывают токены и стоимость вызовов модели управляемых и когнитивных агентов, а также типизированных решений, принятых через `sdk.decisions` (см. [Затраты на API](./costs#budgets)), а воспроизведение применяет `maxSteps`, `maxTokens` и `maxDuration` так же, как исходный запуск (бюджеты за период видят расход текущего периода). Эти политики действуют и для когнитивных агентов: они проверяются перед каждым шагом, а не только перед каждым вызовом инструмента, наряду с собственными ограничениями этих агентов (`maxSteps`, `maxToolCalls`, `timeoutMs`) — см. [Лимиты и политики](./cognitive-agents#limits-and-policies). Политика проверяется при применении (`defaultPolicies`, `defineGlobalPolicy`, `policies` агента, `setPolicy`): правило `maxSteps` или `maxTokens` должно быть в политике `budget`, а правило `maxDuration` — в политике `timeout`, и его `value` должно быть конечным числом больше 0; для `budgetLimit` (тоже в политике `budget`) нужны `period` (`hour`, `day`, `week`, `month` или `all`), строковые `agentId` и `toolName`, если они заданы, и хотя бы одно ограничение (`maxTokens`, `maxToolCalls`, `maxCost`), каждое — конечное число ≥ 0 (`maxToolCalls: 0` отклоняет все вызовы; ограничение токенов или стоимости, равное 0, отклоняет их, как только что-то учтено). Любое другое значение, например строка (`'10'`), прочитанная из файла конфигурации, `NaN`, `0` для лимита запуска или отрицательное число, вызывает ошибку `ValidationError` с именем поля.

### 4. Трассы {#_4-traces}

Каждое выполнение порождает полную трассу, которую можно воспроизвести.

**Получить трассу:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Экспортировать трассу:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Воспроизведение {#_5-replay}

Воспроизведите выполнение без повторного обращения к LLM.

**Простое воспроизведение:**
```typescript
const replayResult = await sdk.replay(runId);
```

**Воспроизведение с изменениями:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Остановка выполнения {#_6-stopping-execution}

Остановите выполняющийся запуск.

**Из агента:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**Из SDK:**
```typescript
await sdk.stopRun(runId);
```

### 7. Потоковая передача ответа {#_7-streaming-the-answer}

Показывайте ответ, пока модель его пишет: `onText` получает его текст по частям, дельта за дельтой.

```typescript
let shown = '';
const result = await agent.run({
  message: 'Summarize the incident report',
  onText: (delta) => {
    shown += delta;
    render(shown);
  },
  onTextRestart: (discarded) => {
    shown = shown.slice(0, shown.length - discarded.length);
    render(shown);
  },
});
```

- С `onText` встроенные провайдеры OpenAI и Anthropic вызывают потоковый API своего поставщика, а результат запуска и его события остаются такими же, как без него. Со стоимостью так же, кроме случая с сервером, совместимым с OpenAI (`baseURL` или `OPENAI_BASE_URL`): расход потокового ответа запрашивается только у собственного API OpenAI, включая региональные хосты, если не задан `providerConfig.openai.includeStreamUsage`, а вызов без данных о расходе учитывается в бюджетах как неизмеренный. Если на совместимом сервере, который сообщает расход (API v1 Azure OpenAI это делает), действует бюджет стоимости, задайте `includeStreamUsage: true`.
- Передаётся текст каждого вызова модели в запуске, один вызов за другим: то, что модель пишет перед вызовом инструмента, затем её ответ, причём перед текстом вызова стоит пустая строка (`\n\n`), если более ранний вызов уже что-то написал. Аргументы инструментов и размышления (thinking) Claude не передаются.
- Провайдер без потоковой передачи (ваш собственный `llmProvider`, если он не читает `onTextDelta`) отдаёт весь текст каждого вызова модели одним куском, когда вызов завершается. Так же поступает OpenAI с моделью, которую он отказывается передавать потоком (организация не прошла для неё верификацию): провайдер запрашивает снова без потоковой передачи и для этой модели её больше не использует. Совместимый сервер, который отклоняет `stream_options`, получает повторный запрос без этого поля (собственный API OpenAI это поле принимает: отклонённый им запрос снова не отправляется).
- Когда вызов модели даёт сбой после того, как часть его текста уже передана, и его пробуют снова (повторная попытка или резервный провайдер), `onTextRestart` получает эту часть (`discarded`, конец того, что получил `onText`, включая пустую строку): отбросьте её, следующая попытка напишет ответ заново. Запуск по-прежнему записывает `provider.retry` или `provider.fallback`. Вызов, который окончательно не удался, оставляет свой текст как есть, и запуск завершается ошибкой. Поток, который обрывается или замирает после полного ответа (его конца и, если его запрашивали, расхода), — не сбой: ответ используется.
- Исключения, которые выбрасывают колбэки (или отклонённые промисы, если колбэки асинхронные), игнорируются: запуск продолжается. Чтобы остановить запуск, прервите его через `signal`. Ни один из колбэков не записывается в запуск.

Когнитивные агенты не используют потоковую передачу: каждый их вызов модели возвращает структурированную мысль (JSON), которую движок проверяет и принимает целиком, а половина мысли пока ничего не значит.

## Типичный порядок работы {#typical-workflow}

1. **Инициализируйте SDK** своим ключом API
2. **Определите инструменты**, нужные для вашей задачи
3. **Создайте возможности** (необязательно, для организации)
4. **Настройте политики** для управления
5. **Создайте агента** с инструментами и политиками
6. **Запустите агента** с входными данными
7. **Проанализируйте трассу**, чтобы понять, что произошло
8. **При необходимости воспроизведите** для отладки

## Рекомендации {#best-practices}

### Инструменты {#tools}
- ✅ Используйте строгие схемы Zod
- ✅ Чётко документируйте каждый инструмент
- ✅ Правильно обрабатывайте ошибки
- ✅ Меняйте версию инструментов при их изменении

### Политики {#policies}
- ✅ Задавайте разумные бюджеты
- ✅ Используйте строгие списки разрешённых инструментов
- ✅ Проверяйте политики до выхода в продакшен
- ✅ Документируйте политики

### Возможности {#capabilities}
- ✅ Группируйте инструменты логически
- ✅ Повторно используйте возможности в разных агентах
- ✅ Документируйте возможности

### Безопасность {#security}
- ✅ **По умолчанию всё запрещено**: ни один необъявленный инструмент не может быть выполнен
- ✅ Валидация: все входные данные проверяются с помощью Zod
- ✅ Политики: проверяются перед каждым действием
- ✅ Прослеживаемость: все действия записываются в трассу

## Примеры {#examples}

### Минимальный пример {#minimal-example}
См. [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### Полный пример {#complete-example}
Все возможности показаны в [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts)

## Следующие шаги {#next-steps}

- 📚 [Основные понятия](./concepts) — разберитесь в архитектуре
- 🏗️ [Архитектура](../reference/architecture) — технические подробности
- 📖 [API SDK](../reference/sdk-api) — все параметры и методы

## Поддержка {#support}

- Документация: `docs/`
- Примеры: `examples/`
- Проблемы: GitHub Issues

## Устранение неполадок {#troubleshooting}

### Ошибка: "Tool not found" {#error-tool-not-found}
→ Убедитесь, что вы зарегистрировали инструмент с помощью `defineTool()`, прежде чем использовать его в агенте.

### Ошибка: "Policy violation" {#error-policy-violation}
→ Проверьте свои политики (бюджет, тайм-аут, список разрешённых инструментов).

### Ошибка: "Run cancelled" {#error-run-cancelled}
→ Выполнение было остановлено. Чтобы узнать причину, проверьте с помощью `getTrace()`.

### Пустые трассы {#empty-traces}
→ Проверьте, что хранилище событий работает правильно и события сохраняются.

## Время до первого агента {#time-to-first-agent}

**Цель MVP:** < 30 минут

**Оценка времени:**
- Установка: 2 минуты
- Первый инструмент: 5 минут
- Первый агент: 3 минуты
- Первое выполнение: 5 минут
- Разбор трасс: 10 минут
- **Итого: ~25 минут** ✅
