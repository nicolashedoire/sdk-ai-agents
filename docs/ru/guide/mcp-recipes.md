# Сервер MCP для чего угодно

Каждый рецепт превращает один вид системы в сервер MCP **одной строкой** и безопасно. Все они работают одинаково: **источник инструментов** создаёт инструменты (а иногда и ресурсы), а `serveMcpOverStdio` их предоставляет.

| Что вы хотите открыть | Строка | Инструменты, которые получает модель |
| --- | --- | --- |
| [Функцию, которую вы пишете](#a-function) | `sdk.defineTool({ … })` | ваши |
| [Веб-API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | по одному на операцию, по умолчанию только для чтения |
| [Папку с документами](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ ресурсы) |
| [Базу данных только для чтения](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [Агента](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |

Впервые имеете дело с MCP? Начните со страницы [Ваш первый сервер MCP за 5 минут](./mcp-first-server): там показано, как запустить сервер, проверить его с помощью Inspector и подключить к Claude Desktop или Claude Code. Каждый файл ниже запускается и подключается так же.

## Каркас, общий для всех рецептов {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

`tools` принимает **определения инструментов** (то, что возвращают источники ниже, — SDK определяет их за вас) и **имена** инструментов, которые вы определили сами через `sdk.defineTool`. Ничего другого никогда не открывается. `resources` (необязательно) принимает поставщиков документов; используется в рецепте с папкой.

Каким бы ни был источник, каждый вызов проходит одни и те же проверки в таком порядке — аргументы, [политики](./mcp-deploy#governance-policies-budgets-approvals), одобрение, бюджет — и записывается в журнал событий. Некорректный вызов отклоняется до того, как кого-либо попросят его одобрить.

## Функция {#a-function}

Самый простой источник: функция, которую вы пишете, как в [первом сервере](./mcp-first-server).

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| Поле | Для чего |
| --- | --- |
| `name` | Что вызывает модель. Используйте буквы, цифры, `_` и `-`, не более 64 символов (клиенты MCP могут отклонять другие имена). |
| `description` | Когда использовать инструмент, простыми словами. Модель принимает решение по нему. |
| `schema` | Аргументы в виде схемы zod. Тексты `.describe()` показываются модели. Вызовы, которые ей не соответствуют, отклоняются. |
| `handler` | Ваш код. Он получает проверенные аргументы и контекст с `signal` (прерывается, когда клиент сдаётся). |
| `metadata.readOnly` | «Этот инструмент ничего не изменяет»: показывается клиентам как `readOnlyHint`. |
| `metadata.requiresApproval` | Каждый вызов ждёт человека (см. [одобрения](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | Повторные попытки при сбое, только для идемпотентных инструментов (`retryOn` сужает круг сбоев; некорректные аргументы никогда не повторяются). |

## Веб-API по его описанию OpenAPI {#a-web-api-from-its-openapi-description}

**Что делает.** Многие API публикуют машиночитаемое описание своих конечных точек — документ **OpenAPI** (часто `openapi.json`). `openApiTools` читает его и превращает **каждую операцию в инструмент**: модель видит её краткое описание и параметры, а вызов инструмента вызывает API.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**По умолчанию только для чтения.** Инструментами становятся только операции `GET`. Чтобы добавить операцию, которая что-то изменяет (`POST`, `PUT`, `PATCH`, `DELETE`), перечислите её по `operationId`:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

Перечисленная операция записи помечается как **высокорисковая** и **требует одобрения**: каждый вызов ждёт, пока его не одобрит человек (см. [одобрения](./mcp-deploy#approvals-a-human-says-yes-first)). Чтобы доверять ей без одобрения, скажите об этом явно: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### Параметры {#options}

| Параметр | По умолчанию | |
| --- | --- | --- |
| `spec` | — | URL (`https://…`), путь к файлу или уже разобранный вами объект. Только JSON; YAML разберите сами (например, пакетом `yaml`) и передайте объект. |
| `baseUrl` | первая запись `servers` | Куда отправляются запросы. Относительный URL сервера разрешается относительно URL спецификации. |
| `headers` | — | Добавляются к каждому запросу (аутентификация). Никогда не показываются модели и переопределяют любой аргумент-заголовок. Требуют `baseUrl` (если только спецификация не загружена с того же источника, что и API) и https для API и спецификации (http — только на этой машине). |
| `include` | операции GET | `operationId`, которые нужно открыть. Если параметр задан, он **заменяет** значение по умолчанию (GET): инструментами становятся только перечисленные операции. Это единственный способ открыть операцию записи. Неизвестный идентификатор — ошибка. |
| `exclude` | — | `operationId`, которые нужно исключить. |
| `tags` | — | Только операции с одним из этих тегов. |
| `prefix` | — | Префикс имён инструментов (`crm_getCustomer`), чтобы сочетать несколько API. |
| `metadata` | GET: низкий риск, только чтение · остальные: высокий риск, одобрение | `(operation) => ToolMetadata`. Каждое заданное вами поле заменяет поле по умолчанию; пропущенное поле — или `undefined` — сохраняет его, поэтому одобрение снимает только явное `requiresApproval: false`. |
| `retry` | — | Повторные попытки только для операций только для чтения (GET, если `metadata` не говорит иначе) при ошибках сервера (5xx), 429, тайм-аутах и сетевых сбоях — никогда при ответах 4xx или некорректных аргументах. |
| `timeoutMs` | `30000` | На один запрос (и на загрузку спецификации). |
| `maxResponseBytes` | `100000` | Более длинные ответы обрезаются и помечаются `truncated: true`. |
| `maxSpecBytes` | `10000000` | Наибольший принимаемый размер спецификации. |
| `fetch` | глобальный `fetch` | Ваша собственная функция HTTP (прокси, тесты). |

### Что видит модель {#what-the-model-sees}

Для `getPetById` из Petstore клиенты получают:

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

Имена инструментов берутся из `operationId` (с приведением к допустимому виду: `show pet!` становится `show_pet`; операция без него становится `get_pets_petId`; дубликаты получают `_2`). Аргументы плоские: по одному на каждый параметр пути, запроса и заголовка, плюс `body` для тела запроса в JSON. Вызов возвращает HTTP-статус и разобранное тело:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### Правила безопасности {#security-rules}

1. **По умолчанию только чтение**: только `GET`; всё остальное должно быть перечислено в `include` и тогда требует одобрения, если вы не укажете иное.
2. **Модель не может сменить хост или подняться вверх по пути.** Базовый URL задаёте вы. Значение пути не может содержать `/`, `\` или сегмент `.` / `..` — даже в процентной кодировке, однократной или многократной, рядом с некорректными escape-последовательностями или нет, поскольку некоторые серверы и прокси декодируют `%2F`, — поэтому `../../admin` отклоняется; итоговый URL также проверяется на то, что он остаётся под базовым URL. В этих пределах значения выбирает модель: какой клиент, какой заказ.
3. **Аргументы проверяются прежде всего остального**: до политик и одобрений (некорректный вызов никогда не ждёт человека), а затем ещё раз при построении запроса. Неизвестные аргументы и отсутствующие обязательные отклоняются; значения должны быть строками, числами или булевыми значениями (для параметров запроса — списками таких значений); значения заголовков не могут содержать переносы строк.
4. **Ваши учётные данные попадают только туда, куда решили вы**: `headers` добавляет сервер, они переопределяют аргументы-заголовки и нигде не видны модели. С `headers` сервер, указанный в файле спецификации, отклоняется — передайте `baseUrl`, — если только спецификация не загружена с того же источника, что и API; а `http:` отклоняется везде, кроме этой машины (`localhost`, `127.0.0.1`, `[::1]`), — для API и для загрузки спецификации, поскольку спецификация, изменённая по дороге, может добавить операции, которые авторизовали бы ваши учётные данные.
5. **Ограничения**: тайм-аут на каждый запрос, ответы обрезаются на `maxResponseBytes`, размер спецификации ограничен.
6. **Перенаправления не выполняются** (перенаправление может унести ваш заголовок `Authorization` на другой сайт): ответ `3xx` — это ошибка, как и перенаправление, которое всё же выполнил пользовательский `fetch`.
7. **Ошибки остаются ошибками**: статус не из `2xx` приводит к неудаче вызова с этим статусом и началом тела ответа. Клиенты MCP видят только «Tool execution failed», если вы не зададите `exposeErrorDetails: true` (тела ответов могут содержать внутренние подробности); в журнале событий всегда есть полная ошибка.
8. **Каждый GET объявляется только для чтения** (`readOnlyHint`). В некоторых API есть GET с побочными эффектами (`GET /send-reminder`): исключите их с помощью `exclude` или задайте для них в `metadata` `readOnly: false, requiresApproval: true`.
9. **Большие описания остаются ограниченными**: у раскрытия `$ref` есть бюджет на операцию и на всю спецификацию, а схема инструмента длиннее 64 000 символов заменяется его описаниями.

### Полный файл {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), с импортами установленного пакета:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

Передавайте токен через окружение клиента, никогда не в файле: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### Чего он не делает {#what-it-does-not-do}

- **Только OpenAPI 3.x**: Swagger 2.0 отклоняется (преобразуйте его, например, с помощью `swagger2openapi`). YAML за вас не разбирается.
- **Только тела в JSON**: операция, которой требуется тело `multipart/form-data` или тело формы, исключается (или отклоняется, если вы её перечислите); необязательное тело другого типа не предлагается. Параметры cookie исключаются.
- **Никаких процедур входа**: передавайте токен в `headers`; OAuth не поддерживается.
- **Только локальные ссылки**: `$ref` на другие файлы или URL не разрешаются (они становятся «любым значением»); схема, ссылающаяся сама на себя, обрезается на цикле.
- Ответы не проверяются по спецификации, постраничная навигация не выполняется, и используется только первый сервер спецификации, если вы не передадите `baseUrl`.

## Папка с документами {#a-folder-of-documents}

**Что делает.** Предлагает текстовые файлы одной папки — справочник, заметки, кодовую базу, экспортированные документы — с тремя инструментами: **перечислить** файлы, **прочитать** один из них, **найти** в них текст. Те же файлы предлагаются и как **ресурсы**, которые пользователи могут сами прикрепить к разговору.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### Параметры {#options-1}

`folderTools` и `folderResources` принимают одни и те же параметры (плюс `prefix` для инструментов):

| Параметр | По умолчанию | |
| --- | --- | --- |
| `root` | — | Папка. Используйте абсолютный путь: клиенты запускают серверы из любого рабочего каталога. |
| `name` | имя папки | Используется в описаниях и URI ресурсов (`folder://<name>/…`). |
| `prefix` | — | Префикс имён инструментов (`handbook_read_file`), чтобы предоставлять несколько папок. |
| `extensions` | текстовые форматы | Предлагаемые расширения, без точки (`['md', 'txt']`). По умолчанию: `md`, `txt`, `csv`, `json`, `yaml`, `html`, исходный код… (`DEFAULT_TEXT_EXTENSIONS`). Добавьте `''` для файлов без расширения. |
| `include` | всё разрешённое | Glob-шаблоны предлагаемых файлов: `guide/**`, `**/*.md`. `*` соответствует в пределах одной папки, `**` — через папки. Папки всё равно перечисляются, даже если в них нет подходящих файлов. |
| `exclude` | — | Glob-шаблоны файлов и папок, скрываемых везде: `drafts`, `private/*`, `**/node_modules`. Скрытая папка скрывает всё, что в ней находится. |
| `includeHidden` | `false` | Предлагать имена, начинающиеся с точки (`.env`, `.git`…). Не включайте. |
| `maxFileBytes` | `200000` | Байты, читаемые из одного файла; более длинные файлы обрезаются (`truncated: true`). |
| `maxEntries` | `500` | Число записей, возвращаемых одним перечислением, включая ресурсы. |
| `maxDepth` | `8` | Глубина просматриваемых вложенных папок. |
| `maxMatches` | `50` | Число совпадений, возвращаемых одним поиском. |
| `maxSearchBytes` | `20000000` | Байты, читаемые одним поиском, по всем файлам вместе. |
| `maxExaminedEntries` | `50000` | Число имён, просматриваемых одним перечислением или поиском, предлагаемых или нет; при превышении результат содержит `truncated: true`. |

### Что видит модель {#what-the-model-sees-1}

Инструмент поиска, в сокращённом виде:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

Поиск возвращает `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. Чтение возвращает `{ "path", "size", "content", "truncated" }`.

**Ресурсы**: каждый файл перечисляется как `folder://handbook/guide/onboarding.md` с размером и типом (`text/markdown`, `text/csv`…). Приложения, поддерживающие ресурсы, позволяют пользователю выбирать их, например, из меню вложений; как именно — зависит от приложения.

### Правила безопасности {#security-rules-1}

1. **Только относительные пути**; абсолютные пути отклоняются.
2. **Ничего за пределами папки**: каждый путь разрешается в его реальное расположение — включая сегменты `..` и символические ссылки — и отклоняется, если выходит за пределы папки. Ссылка на уже посещённую папку пропускается, поэтому петля из ссылок не может подвесить перечисление.
3. **Скрытые имена невидимы**: `.env`, `.git`, `.ssh`… ведут себя так, будто их не существует, даже через ссылку.
4. **Только текст**: предлагаются только разрешённые расширения, а файл, первые 8 КБ которого содержат нулевой байт (двоичный), отклоняется.
5. **Ограничения**: чтение, перечисления, глубина, совпадения поиска, просмотренные байты и просмотренные имена (`maxExaminedEntries`, 50 000) — всё ограничено; перечисление или поиск, остановленные досрочно, сообщают `truncated: true`.
6. **Только чтение**: ничего никогда не записывается, не перемещается и не удаляется.
7. **Трассировка**: каждое чтение ресурса — это запуск в журнале событий с URI, размером и отпечатком SHA-256 отданного содержимого.
8. **Исключено — значит исключено**: исключение папки (`private`, `private/*`, `**/node_modules`) скрывает всё внутри неё — при перечислении, поиске, чтении по пути или чтении как ресурса.
9. **Устойчивость**: вложенная папка, которую нельзя прочитать, пропускается, а сообщения об ошибках называют общую папку, но никогда — её абсолютный путь.

### Полный файл {#complete-file-1}

Адаптировано из [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (который по умолчанию предоставляет эту документацию):

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### Чего он не делает {#what-it-does-not-do-1}

- **Никакой записи** в каком бы то ни было виде.
- **Никаких PDF, Word или изображений**: только текстовые файлы. Сначала преобразуйте документы в Markdown или текст.
- **Только поиск подстроки**: никакого поиска по смыслу («семантического»), никакого ранжирования.
- **Никаких уведомлений об изменениях**: клиенты видят файлы такими, какими они были на момент перечисления.
- **Папка не должна быть доступна для записи людям, которым вы не доверяете**: пути проверяются, а затем файл открывается; тот, кто сможет подменить папку ссылкой именно в этот момент, теоретически сможет проскользнуть.
- **С `include` папки всё равно перечисляются**, даже если в них нет подходящих файлов (для проверки пришлось бы читать каждую вложенную папку).
- Чтение ресурсов записывается в трассу, но не проверяется политиками инструментов: предлагайте только те папки, которыми готовы поделиться.

## База данных только для чтения {#a-read-only-database}

**Что делает.** Позволяет модели исследовать базу данных — перечислить таблицы, описать одну из них, выполнить запрос `SELECT` — и **никогда её не изменять**. Работает с **SQLite** (встроенный `node:sqlite` в Node.js 22.13+ или `better-sqlite3`) и **PostgreSQL** (`pg`).

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### Параметры {#options-2}

| Параметр `databaseTools` | По умолчанию | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` или `postgresReadOnly({ client })`, либо ваша собственная `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | Как её называют модели: «the shop database». |
| `prefix` | — | Префикс имён инструментов (`shop_query`), чтобы предоставлять несколько баз данных. |
| `maxRows` | `100` (не более `1000`) | Число строк, возвращаемых одним запросом; `truncated: true` означает, что их было больше. |
| `maxTextLength` | `2000` | Число символов, сохраняемых для каждого текстового значения. |
| `maxTables` | `500` | Число перечисляемых таблиц. |
| `maxSqlLength` | `20000` | Наибольшая принимаемая длина SQL. |

| Параметр `postgresReadOnly` | По умолчанию | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL останавливает любой запрос, который выполняется дольше. |
| `schemas` | все, кроме системных | Схемы, **перечисляемые и описываемые** инструментами `list_tables` и `describe_table`. Этот параметр не ограничивает то, что может прочитать `query`: это задача роли. |

С `{ client }` дайте адаптеру **выделенный** `pg.Client`: тот, который ваше приложение не использует для собственных транзакций (пул здесь отклоняется; передайте его как `{ pool }`).

У `sqliteReadOnly(db)` нет параметров: откройте файл только для чтения (`{ readOnly: true }` с `node:sqlite`, `{ readonly: true }` с better-sqlite3). Он опирается только на `prepare`, `exec` и методы подготовленных запросов, общие для обоих драйверов; набор тестов проверяет его на реальной базе данных `node:sqlite`, а не на better-sqlite3.

### Что видит модель {#what-the-model-sees-2}

Три инструмента: `list_tables`, `describe_table { table }` и `query { sql }`, описанный как *«Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first.»* Запрос возвращает:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

Значения приводятся к читаемому виду по мере поступления строк: очень большие целые числа становятся строками, даты — строками ISO, двоичные данные — пометкой вроде `<binary data, 3 bytes>`, длинные тексты обрезаются, массивы сохраняют 100 элементов (`… 400 more items`). Когда сама база данных отклоняет запрос («no such column», «read-only», тайм-аут), модель получает причину, чтобы исправить свой SQL; ошибки соединения и сервера остаются на вашей стороне.

### Правила безопасности: четыре замка, а не один {#security-rules-four-locks-not-one}

Проверки того, что запрос «начинается с SELECT», недостаточно: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` начинается с `WITH` и удаляет данные. Поэтому запрос должен пройти четыре замка:

1. **Проверка оператора**: ровно один оператор (точки с запятой внутри строк, имена в кавычках, комментарии, кавычки `$$` PostgreSQL и строки с escape-последовательностями `E'…'` распознаются), начинающийся с `SELECT`, `WITH` или `VALUES`, без параметров `$1`, со сбалансированными скобками. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… отклоняются.
2. **Сама база данных отклоняет запись**:
   - SQLite: каждый запрос выполняется с `PRAGMA query_only = ON` (после этого значение восстанавливается), а с better-sqlite3 оператор, который пишет, отклоняется до выполнения;
   - PostgreSQL: каждый запрос выполняется в собственной транзакции `BEGIN READ ONLY` — соединение, уже находящееся внутри другой транзакции, сначала обнаруживается (`transaction_timestamp()` старше оператора) и отклоняется без вмешательства в эту транзакцию — с `SET LOCAL statement_timeout` и всегда завершается `ROLLBACK`, а затем `SELECT pg_advisory_unlock_all()` (рекомендательные блокировки переживают откат; соединение, которое не может их снять, повторно не используется). Запрос отправляется как подзапрос со связанным параметром, поэтому сервер принимает только один оператор. Транзакции никогда не используют одно соединение одновременно.
3. **Ограничения**: читается не более `maxRows` строк (SQLite никогда не читает остальное; PostgreSQL останавливается на `LIMIT`), значения по мере поступления строк обрезаются в короткие копии (каждое исходное значение всё же загружается целиком, прежде чем будет обрезано), у запросов PostgreSQL есть тайм-аут.
4. **Вы**: открывайте файлы SQLite только для чтения; подключайтесь к PostgreSQL ролью, которая может читать только то, что вы хотите показать, — это и есть настоящая граница, потому что транзакция только для чтения не мешает тому, что функция может сделать за пределами базы данных (например, `dblink` или HTTP-расширение). Такая роль всё равно может читать системный каталог (`pg_catalog`) и вызывать функции, разрешённые для `PUBLIC`; отзовите права на функции расширений, которые выходят вовне (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;` и подобные):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### Полные файлы {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite; создаёт демонстрационную базу данных магазина, если вы не укажете файл) и [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### Чего он не делает {#what-it-does-not-do-2}

- **Никакой записи** — это сделано намеренно. Чтобы позволить модели изменять данные, напишите отдельный инструмент для этого конкретного изменения, с одобрением.
- **Никакого фильтра по таблицам внутри запросов**: запрос может прочитать всё, что может прочитать соединение. Используйте роль (PostgreSQL) или копию файла только с нужными таблицами (SQLite); открывайте представления, а не исходные таблицы.
- **SQLite: поверхность атаки — это запрос, а не файл.** Запросы выполняются внутри процесса вашего сервера, синхронно, без тайм-аута и без ограничения памяти: тот, кто пишет SQL, — модель или тот, кто ею управляет, — может написать запрос, который никогда не завершится (рекурсивный `WITH`) или строит огромные значения, и заблокировать или исчерпать сервер. Строки читаются по одной, и каждое значение по мере поступления обрезается в короткую копию, поэтому результат остаётся небольшим, а оригиналы могут быть освобождены, — но каждое исходное значение сначала загружается целиком, и ничто не ограничивает работу, которую SQLite выполняет, чтобы получить строку. Предоставляйте SQLite себе или людям, которым доверяете; не открывайте его по HTTP для недоверенных клиентов. Выполнение запросов в рабочем потоке, который можно остановить, сняло бы это ограничение; это пока не сделано.
- **Функции SQLite, зарегистрированные в соединении, могут быть вызваны** из SQL модели (`db.function(…)`): регистрируйте в предоставляемом соединении только безобидные функции.
- **Никаких связанных параметров**: модель пишет значения прямо в SQL.
- Из двух столбцов с одинаковым именем в результате остаётся только последний: дайте им псевдонимы.
- Другие базы данных (MySQL, SQL Server…): реализуйте небольшой интерфейс `ReadOnlyDatabase` сами и сделайте так, чтобы он сам отклонял запись. `assertSingleQuery(sql, dialect)` понимает только синтаксис SQLite и PostgreSQL; для MySQL (экранирование обратной косой чертой в каждой строке, комментарии `#`) нужна собственная проверка.

## Агент: ваш двойник по рассуждению {#an-agent-your-reasoning-twin}

**Что делает.** Открывает целого агента как один инструмент. Самое впечатляющее применение — [когнитивный агент с вашим профилем мыслителя](./thinker-profiles): тогда из Claude Desktop кто угодно может спросить *«что думает Nicolas о том, чтобы платить за Jev?»* и получить ответ, построенный **так, как рассуждает Nicolas**, с обоснованием и тем, чего ещё не хватает.

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

Этому рецепту нужен ключ модели (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): агент думает с помощью языковой модели.

### Шаг 1 — зафиксируйте, как вы рассуждаете {#step-1-—-capture-how-you-reason}

Объясните несколько тем своими словами, один раз выделите из них профиль и сохраните его:

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

Что содержит профиль и как со временем его поправлять, см. на странице [Рассуждать как конкретный человек](./thinker-profiles).

### Шаг 2 — предоставьте его {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) загружает профиль из `PROFILE_FILE` (с проверкой по схеме профиля) или использует встроенный пример и предоставляет `ask_nicolas`:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### Что видит модель и что получает в ответ {#what-the-model-sees-and-gets-back}

Инструмент принимает `problem` (вопрос, до 4000 символов) и необязательный объект `context` (факты и ограничения, до 20 000 символов в виде JSON). Он возвращает решение, а не всё ментальное состояние:

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

`decisionStatus` — это `committed` (твёрдый ответ), `provisional` (лучший ответ на данный момент, с `missing`: что не установлено) или `abstain`. Полное рассуждение остаётся в журнале событий под `runId`: `sdk.getMentalState(runId)` показывает каждую гипотезу и каждую критику. Когда запуск завершается ошибкой, `error` говорит только о том, что он не завершился, и где искать причину (`exposeErrors: true` помещает в результат само сообщение: оно может содержать подробности провайдера).

### Параметры {#options-3}

| Параметр | По умолчанию | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | Имя инструмента. |
| `description` | общее | Скажите, когда стоит обращаться к этому агенту: модель принимает решение по этому описанию. |
| `metadata` | средний риск | Метаданные управления, объединяемые поле за полем со значениями по умолчанию; добавьте `requiresApproval: true`, чтобы подтверждать каждое обращение. |
| `maxInputLength` | `4000` | Наибольшая принимаемая длина задачи (или сообщения). |
| `maxContextLength` | `20000` | Наибольшая длина `context` в виде текста JSON. |
| `exposeErrors` | `false` | Помещать сообщение об ошибке неудавшегося запуска в результат. |

`governedAgentTool(agent, options)` делает то же самое для агента, созданного через `sdk.createAgent`: он принимает `message` (и `context`) и возвращает `{ runId, status, output, error }`.

### Полезно знать {#good-to-know}

- **Это занимает время.** Когнитивный запуск делает несколько вызовов модели: рассчитывайте на десятки секунд, иногда минуты. Многие клиенты отменяют вызов примерно через минуту (по умолчанию в официальном TypeScript SDK — 60 секунд; в Claude Code это значение можно увеличить с помощью `MCP_TOOL_TIMEOUT`). Для интерактивного использования держите `limits` небольшими. **Когда клиент сдаётся, запуск останавливается** (как для когнитивных, так и для управляемых агентов) и записывается как отменённый: дальнейших вызовов модели не происходит, а одобрение, которого ждал агент, отменяется.
- **Это стоит денег**: каждое обращение — это несколько вызовов модели. Задайте для него [бюджет](./mcp-deploy#governance-policies-budgets-approvals) и проверяйте `sdk.getRunCost(runId)`.
- **Он подражает способу рассуждать, а не знаниям человека.** Двойник знает то, что есть в профиле, вопросе и контексте, — но не память человека. Воспринимайте его ответы как «как бы он подошёл к этому» и позвольте настоящему человеку поправлять его через `learnFromFeedback`.

## Несколько источников в одном сервере {#several-sources-in-one-server}

Объединяйте источники с префиксами, чтобы имена никогда не конфликтовали:

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

Два инструмента с одинаковым именем отклоняются при запуске с сообщением, в котором указано, какой именно.

## Те же инструменты в ваших собственных агентах {#the-same-tools-in-your-own-agents}

Источники — это обычные определения инструментов: ваши агенты могут использовать их без MCP.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

Действуют те же правила: перечисленные вами операции записи ждут одобрения, каждый вызов проверяется и записывается.

Далее: [развёртывание, безопасность и диагностика](./mcp-deploy).
