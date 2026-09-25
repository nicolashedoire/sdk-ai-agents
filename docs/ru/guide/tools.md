# Инструменты

**Инструмент** — это функция, которую может вызвать агент: найти заказ, прочитать файл, поискать в интернете, спросить другого агента. Вы пишете инструменты сами или берёте готовые из **источника инструментов**: папки, базы данных, веб-API, интернета, агента или сервера MCP.

Откуда бы ни взялся инструмент, каждый его вызов **управляется**. Инструмент должен быть среди инструментов вызывающей стороны, его аргументы проверяются, применяются политики и бюджеты, человека можно попросить одобрить вызов, неудавшийся вызов можно повторить, и всё записывается в журнал событий.

## Одной строкой {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

Теперь агент может перечислять файлы справочника, читать их и искать в них, а также искать в интернете и читать веб-страницы: восемь инструментов, все только для чтения.

## Ваши собственные инструменты {#your-own-tools}

`sdk.defineTool` регистрирует инструмент в SDK и возвращает его. Схема zod описывает аргументы; обработчик получает их уже проверенными и типизированными.

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| Поле | |
| --- | --- |
| `name`, `description` | То, что видит модель и на основании чего принимает решение. Используйте буквы, цифры, `_` и `-`, не более 64 символов: API моделей и клиенты MCP могут отклонять другие имена. |
| `schema` | Аргументы в виде схемы zod; тексты `.describe()` показываются модели. Вызов, который ей не соответствует, отклоняется до любой политики, одобрения или бюджета. |
| `handler(params, context?)` | Ваш код. `context` содержит `runId`, `agentId`, `signal` (прерывается, когда вызывающая сторона сдаётся) и `onEvent` (задан, когда вызывающая сторона следит за вызовом в реальном времени). |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`: см. [Как управляются вызовы](#how-calls-are-governed). По умолчанию ничего не задано. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5000), retryOn? }`, только для идемпотентных инструментов. |
| `version` | По умолчанию `1.0.0`. Версия входит в хеш конфигурации агента, поэтому запуски до и после изменения можно [сравнить](../reference/sdk-api#comparisons-and-impact). |
| `capability` | Метка для группировки; встроенные источники задают её сами (`web:search`, `folder:handbook`…). |

Имя регистрируется в SDK один раз: `sdk.defineTool` выбрасывает ошибку для уже занятого имени, какой бы ни была версия. Если имена инструментов двух источников могут совпасть, дайте каждому источнику свой префикс. Все поля описаны в [API SDK](../reference/sdk-api#tools-tooldefinition).

## Встроенные источники инструментов {#the-built-in-tool-sources}

Каждый источник возвращает определения инструментов, готовые для `sdk.defineTool` (у `connectMcpServer` они находятся в его `tools`). Каждый может переименовать свои инструменты: задать префикс (`prefix`; `toolPrefix` для MCP) или всё имя инструмента агента (`name`).

| Источник | Что может агент | Имена инструментов | Риск, только для чтения | Что нужно | Подробности |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | Перечислять, читать и искать текстовые файлы одной папки, никогда не выходя за её пределы | `list_files`, `read_file`, `search_files` | низкий, только для чтения | Папка | [Папка с документами](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | Перечислять таблицы, описывать одну из них, выполнять один запрос только для чтения: `SELECT`, `WITH … SELECT` или `VALUES` (по умолчанию не более 100 строк) | `list_tables`, `describe_table`, `query` | средний, только для чтения | `sqliteReadOnly(db)` (`node:sqlite` или `better-sqlite3`) или `postgresReadOnly({ pool })` (`pg`) | [База данных только для чтения](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Вызывать веб-API, по одному инструменту на операцию: по умолчанию операции `GET`; `include` заменяет их операциями, которые в нём перечислены, — единственный способ получить операции записи | `operationId`, иначе метод и путь (`get_pets_petId`) | `GET`: низкий, только для чтения. Остальные: высокий, требуется одобрение | Описание OpenAPI 3 (URL, файл или объект) | [Веб-API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Искать в интернете, читать страницу или PDF, искать в arXiv, Wikipedia и GitHub | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` — средний, остальные — низкий; все только для чтения | Для начала ничего (DuckDuckGo); `unpdf` для PDF; токен GitHub для поиска по коду | [Поиск в интернете](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | Спрашивать другого агента: управляемый агент отвечает на `message`, когнитивный агент рассуждает о `problem` и возвращает своё решение | `ask_<agent name>` | средний, не помечен как только для чтения | Агент, а значит, ключ модели | [Агент](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | Использовать инструменты любого сервера MCP | Имена, заданные сервером, с префиксом `toolPrefix` | Не заданы: `metadata` применяется к каждому импортированному инструменту | `@sdk-ai-agents/core/mcp` и `@modelcontextprotocol/sdk`; `close()` по окончании работы | [Инструменты сервера MCP](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

Для инструментов MCP отличаются две вещи: SDK проверяет только то, что их аргументы образуют объект (остальное проверяет сервер), а собственные подсказки сервера, например «только для чтения», не импортируются: задайте `metadata` сами.

## Как дать инструменты агенту {#giving-tools-to-an-agent}

`createAgent({ tools })` и `createCognitiveAgent({ tools })` принимают инструменты, поэтому сначала пропустите определения источника через `sdk.defineTool`, как выше. Агент может запускать **только собственные инструменты** — из `tools` и из своих `capabilities`: любой другой инструмент, который назовёт модель, отклоняется (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

`defineTool`, импортированный из пакета, создаёт инструмент, не регистрируя его: SDK регистрирует его, когда создаётся агент, который его использует. Если инструмент с таким именем уже зарегистрирован, сохраняется и выполняется зарегистрированный.

### Возможности {#capabilities}

Возможность — это имя группы инструментов, которую можно дать нескольким агентам. Метка `capability` у инструмента возможностью не является: возможность определяется через `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### Вне агента {#outside-an-agent}

`sdk.listTools()` возвращает все инструменты, зарегистрированные в SDK. `sdk.executeTool(name, parameters, options?)` вызывает один из них через тот же управляемый конвейер, как отдельный запуск (с id агента `external`, если вы не передали `agentId`), и возвращает то, что вернул обработчик:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

Его параметры: `runId` записывает вызов внутри существующего запуска, `allowedTools` ограничивает то, что может запускать эта вызывающая сторона, `signal` отменяет вызов, `approvalTimeoutMs` ограничивает время ожидания одобрения, а `onEvent` позволяет следить за вызовом в реальном времени. Отказ выбрасывает `PolicyViolationError`; некорректные аргументы и сбой обработчика выбрасывают `ToolExecutionError`.

Те же инструменты служат и в других местах. [Исследование](./studies#research-through-your-sources) принимает в качестве своих `sources` **имена** определённых инструментов, а сервер MCP предоставляет определения или имена инструментов, которые вы ему передали, Claude Desktop, Claude Code или любому клиенту MCP (см. [Сервер MCP для чего угодно](./mcp-recipes)).

## Как управляются вызовы {#how-calls-are-governed}

Вызов проходит следующие шаги в этом порядке и останавливается на первом отказе:

1. **Инструменты вызывающей стороны.** Отклоняется инструмент, которого вызывающей стороне не дали, то есть которого нет среди инструментов агента, источников исследования, в списке сервера MCP или в `allowedTools`. `executeTool` без `allowedTools` может запустить любой зарегистрированный инструмент.
2. **Аргументы** проверяются по схеме, прежде чем кого-либо о чём-либо спросят.
3. **Политики**: все глобальные политики и все политики агента (см. [Управляемые агенты](./governed-agents#_3-policies)).
4. **Одобрение**, если его требует инструмент или политика. Вызов, который отклоняет любая политика, отклоняется без запроса одобрения: одобрение никогда не отменяет запрет (deny), список разрешённых инструментов или бюджет.
5. **Бюджет**: вызов засчитывается в момент начала, каким бы ни был его исход.
6. **Инструмент выполняется**, со своими повторными попытками.

### Уровни риска {#risk-levels}

`riskLevel` — это метка: она говорит людям и коду, насколько осторожно нужно обращаться с инструментом. **Ни одна политика её не читает**, и она не блокирует и не замедляет вызов. Чтобы метка на что-то влияла, задайте инструменту `requiresApproval` или превратите метку в политику:

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

Список составляется в момент определения политики: сначала определите инструменты.

### Одобрения {#approvals}

Вызов ждёт человека, когда у инструмента есть `requiresApproval: true` (значение по умолчанию у `openApiTools` для операций записи) или правило политики говорит `require_approval`. Такой вызов появляется в `sdk.getPendingApprovals()`; `sdk.approveAction(id, who, reason?)` разрешает его выполнить, `sdk.rejectAction(id, who, reason?)` отклоняет его. Вызов, который отклоняет любая политика, отклоняется без запроса одобрения: одобрение никогда не отменяет запрет (deny), список разрешённых инструментов или бюджет. Если вызывающая сторона сдаётся раньше (запуск остановлен, `signal` прерван, истёк `approvalTimeoutMs` — на серверах MCP по умолчанию 50 с), одобрение отменяется, и инструмент так и не выполняется. См. [Одобрения](./mcp-deploy#approvals-a-human-says-yes-first).

### Инструменты только для чтения {#read-only-tools}

`readOnly: true` говорит, что инструмент ничего не изменяет. Клиенты MCP видят это как `readOnlyHint`, а `openApiTools` делает повторные попытки лишь для операций, которые только читают. Эта пометка не ослабляет ни одной политики и не проверяется: обработчик, помеченный как только для чтения, который что-то записывает, всё равно записывает. Источники, которые только читают, обеспечивают это там, где могут: у `folderTools` нет никакого способа записи, а `sqliteReadOnly` и `postgresReadOnly` выполняют каждый запрос в режиме только для чтения на уровне самой базы данных.

### Повторные попытки {#retries}

`retry` снова запускает обработчик, который дал сбой: только при ошибках самого обработчика, никогда при некорректных аргументах или отказе. Каждая повторная попытка — это событие `tool.retry`, а в бюджете вызов засчитывается один раз. `openApiTools`, `webTools` и `connectMcpServer` принимают параметр `retry` для своих инструментов. См. [Повторные попытки и резерв](./resilience#tools).

### Бюджеты {#budgets}

Политика `budget` с `budgetLimit` ограничивает число вызовов инструментов за период — для одного агента (`agentId`), одного инструмента (`toolName`) или для всех:

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

`budgetLimit` может также ограничивать `maxTokens` и `maxCost`, которые учитываются по вызовам модели: как только расход за период превышает ограничение, вызовы инструментов отклоняются, а `maxCost` отклоняет их и тогда, когда стоимость вызова неизвестна (модель без цены, вызов без числа токенов). См. [Затраты на API](./costs#budgets).

### Недоверенные результаты {#untrusted-output}

То, что возвращает инструмент, попадает обратно к модели, а страница, файл или ответ API могут содержать инструкции, написанные для неё (внедрение промпта, prompt injection). Веб-инструменты помечают каждый свой ответ как `untrusted: true`, а их описания велят модели никогда не выполнять инструкции, найденные в нём. Остальные источники возвращают своё содержимое как есть. Напишите в системном промпте, что результаты инструментов — это данные, давайте каждому агенту только нужные ему инструменты и защищайте одобрениями инструменты, которые что-то изменяют. Исследование показывает своей модели каждый результат как данные. См. [правила безопасности веб-инструментов](./web-research#security-rules).

### Что записывает вызов {#what-a-call-records}

| Событие | Когда |
| --- | --- |
| `action.executing` | Вызов предложен, ещё до любой проверки |
| `policy.checked` | По событию на каждую проверенную политику, затем вердикт |
| `policy.violated` | Отказ: инструмент, которого вызывающей стороне не дали (`allowed-tools`), политика, исчерпанный бюджет |
| `approval.requested`, `approval.approved`, `approval.rejected` | Решение человека |
| `tool.called` | Обработчик начинает работу |
| `tool.retry` | Повторная попытка, с её задержкой и ошибкой |
| `action.executed`, `action.failed` | Результат или ошибка (включая некорректные аргументы), с длительностью |

Вызов через `executeTool` — это отдельный запуск, если вы не передали `runId`: `run.started` (режим `tool`), затем `run.completed` или `run.failed`. См. [каталог событий](../reference/events#reasoning-and-actions).

## Как выбрать источник {#choosing-a-source}

| Мне нужно… | Что использовать |
| --- | --- |
| Мой собственный код или сервис | `sdk.defineTool` |
| Документы в папке | `folderTools` |
| Ответы из базы данных SQL, только для чтения | `databaseTools` с `sqliteReadOnly` или `postgresReadOnly`; для PostgreSQL также подключайтесь под ролью, которая может только читать |
| Веб-API, который публикует описание OpenAPI | `openApiTools` |
| Веб-API без такого описания | `sdk.defineTool` с `fetch` в обработчике |
| Интернет, научные статьи, статьи энциклопедии, код на GitHub | `webTools` |
| Ответ или решение другого агента | `governedAgentTool` или `cognitiveAgentTool` |
| Система, у которой уже есть сервер MCP | `connectMcpServer` |
| Источники для исследования | Поисковые инструменты `webTools` или сервера MCP |
| Мои инструменты в Claude Desktop или Claude Code | Обратное направление: [сервер MCP](./mcp-recipes) |
