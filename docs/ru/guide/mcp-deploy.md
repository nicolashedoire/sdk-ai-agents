# Развёртывание, безопасность и диагностика

Ваш сервер работает на вашей машине ([первый сервер](./mcp-first-server), [рецепты](./mcp-recipes)). На этой странице рассказывается, как поделиться им по HTTP, как подключить правила и людей к процессу, приводится чек-лист безопасности и объясняется, что делать, если что-то не работает.

## stdio или HTTP? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| Как он работает | ИИ-приложение запускает ваш сервер как программу на том же компьютере | Ваш сервер работает где-то как веб-сервис |
| Кто может им пользоваться | Человек за этим компьютером | Любой, кому вы дадите адрес и токен |
| Доступ из сети | Нет | HTTP-эндпоинт, который нужно защищать |
| Лучше всего подходит для | Личных инструментов, локальных файлов, экспериментов | Команды, API или базы данных уровня всей компании |
| Как запустить | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + HTTP-транспорт MCP SDK |

Начните со stdio. Переходите на HTTP, когда одним и тем же сервером должны пользоваться несколько человек.

## Предоставление по HTTP {#serve-over-http}

HTTP-транспорт предоставляет официальный MCP SDK; `createMcpServer` даёт ему управляемый сервер. Этот полный файл использует собственный модуль Node `http` — без веб-фреймворка — и **не хранит состояние**: каждый запрос получает новый сервер MCP, поэтому можно запускать несколько копий за балансировщиком нагрузки.

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Для чего нужна каждая проверка:

| Проверка | Зачем |
| --- | --- |
| Путь `/mcp` | Один адрес для MCP; всё остальное отклоняется. |
| Заголовок `Host` | Иначе веб-страница, которую вы открыли, могла бы заставить ваш браузер обратиться к серверу на `localhost` («DNS rebinding»). При развёртывании укажите вместо этого своё публичное имя хоста. |
| Bearer-токен | Внутрь попадают только клиенты, знающие токен. Сравнивается за постоянное время. Сгенерируйте длинный случайный токен и не храните его в коде. |
| Только `POST` | В режиме без состояния нет долгоживущего потока, который открывался бы через `GET`. |
| Сервер на каждый запрос | Между запросами ничего не разделяется; определения инструментов создаются один раз и используются повторно (повторное определение того же определения допускается). Цена: сообщение клиента «отмена» приходит отдельным запросом и не может дойти до вызова, который оно отменяет, — вместо этого вызов завершает закрытие соединения или `approvalTimeoutMs`. |

Файл слушает только `127.0.0.1`. Чтобы опубликовать сервер, поставьте его за обратный прокси, который завершает **HTTPS** (Caddy, nginx, балансировщик нагрузки вашего облака), и добавьте своё имя хоста в `allowedHosts`. Никогда не передавайте bearer-токен по обычному HTTP через сеть.

Готовая к запуску версия поставляется как [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) (`MCP_TOKEN=… npm run example:mcp-http`). Она проверена с реальным клиентом: вызов без токена получает `401`, поддельный `Host` — `403`, а клиент с токеном получает список инструментов и вызывает их.

### Подключение клиентов к HTTP-серверу {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. В общем файле `.mcp.json` напишите `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`: Claude Code подставляет переменные окружения, поэтому токен не попадает в файл.
- **Ваши собственные агенты**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — см. [MCP простыми словами](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **Другие приложения**: ищите в их документации «remote MCP server» или «custom connector». Некоторые принимают только серверы с входом через OAuth, а не с фиксированным токеном.

## Управление: политики, бюджеты, одобрения {#governance-policies-budgets-approvals}

Каждый вызов MCP выполняется от имени одной идентичности, `mcp:<server name>` (её можно изменить через `agentId`). Политики, бюджеты и оповещения могут нацеливаться на неё, как на любого агента. Все виды политик описаны на странице [Управляемые агенты](./governed-agents).

**Дневной бюджет вызовов** для одного сервера:

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

501-й вызов за день отклоняется с указанием имени политики, и отказ попадает в журнал событий. Вызов засчитывается **в момент начала** — проверка и учёт происходят за один шаг, поэтому 20 одновременных вызовов не могут все проскользнуть под лимит в 2, — и засчитывается **при любом исходе**, включая сбои. Бюджеты считаются в памяти процесса: при перезапуске сервера они начинаются с нуля, и каждая копия HTTP-сервера считает свои вызовы. До любой политики или бюджета проверяются аргументы: некорректный вызов отклоняется, не засчитываясь и никого не дожидаясь.

### Одобрения: сначала «да» говорит человек {#approvals-a-human-says-yes-first}

Инструмент ждёт решения человека перед запуском, когда:

- в его определении есть `metadata: { requiresApproval: true }` — значение по умолчанию для операций записи `openApiTools`;
- или этого требует политика — для инструментов, которые вы называете, без изменения их определений:

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

Пока вызов ждёт, он отображается в `sdk.getPendingApprovals()`. Ваш код принимает решение через `sdk.approveAction(id, who, reason)` или `sdk.rejectAction(id, who, reason)`; оба записываются (`approval.requested`, `approval.approved` или `approval.rejected`). Сервер stdio не может спросить в собственном терминале — стандартный ввод занят протоколом, — поэтому решение приходит по другому каналу. Например, через небольшой административный эндпоинт на этой машине, в том же процессе, что и сервер.

**Административный эндпоинт решает, что будет выполнено: защищайте его так же, как эндпоинт MCP.** Иначе страница, открытая в вашем браузере, могла бы обратиться к `localhost` (DNS rebinding) и одобрить что-то за вас. Поэтому он слушает только `127.0.0.1`, принимает только собственный `Host`, отклоняет любой запрос с заголовком `Origin` (браузеры его добавляют, скрипты и `curl` — нет) и требует секретный заголовок:

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

Затем `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` показывает, что ждёт решения, а `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` принимает решение. Полный сервер, построенный таким образом, поставляется как [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts); он проверен от начала до конца (вызов ждёт, поддельный `Host`, заголовок `Origin` или отсутствие секрета дают `403`/`401`, одобрение запускает инструмент, а процесс завершается, когда клиент уходит).

Чтобы получать уведомление, когда одобрение ждёт решения, добавьте [правило инцидентов](./incidents#rules) для `approval.requested` с уведомлением в Slack или по электронной почте. Ожидающие одобрения хранятся в памяти процесса, в котором ждёт вызов: при нескольких копиях HTTP-сервера принимайте решение через ту копию, в которой оно находится (или запускайте одну копию для инструментов, которым нужно одобрение).

::: warning Сколько живёт ожидающее одобрение
Многие клиенты отменяют вызов примерно через минуту. Ожидающее одобрение отменяется — и инструмент так и не запускается, — когда:

- клиент отменяет вызов (stdio или HTTP-сессия с состоянием);
- соединение закрывается: клиент stdio завершается, HTTP-запрос закрывается;
- никто не принял решения в течение `approvalTimeoutMs` — **по умолчанию 50 секунд**, меньше, чем ждёт большинство клиентов. Задайте это значение в `createMcpServer`/`serveMcpOverStdio`, если ваш клиент ждёт дольше (Claude Code с увеличенным `MCP_TOOL_TIMEOUT`).

**На HTTP-сервере без состояния действуют только два последних условия**: он не может связать запрос «отмена» с вызовом, который тот отменяет. Клиент, который сдаётся, не закрывая соединения, оставляет одобрение ожидающим до истечения `approvalTimeoutMs` — и «да», данное в этом промежутке, всё равно запускает инструмент, хотя ответа уже никто не ждёт. Держите `approvalTimeoutMs` значительно меньше времени ожидания ваших клиентов (в примере — 20 с) или предоставляйте инструменты, которым нужно одобрение, через stdio или сессию с состоянием.

После отмены запоздалое «да» завершается ошибкой «already rejected», а после одобрения вызов проверяется ещё раз: если клиент за это время ушёл, инструмент не запускается. Одобрения через MCP подходят для быстрых решений. Для решений, которые занимают часы, сделайте так, чтобы инструмент *отправлял заявку*, которую ваша команда обработает позже.
:::

Большинство приложений MCP также спрашивают пользователя перед каждым вызовом инструмента (Claude Desktop делает это по умолчанию). Это подтверждение происходит в приложении; одобрения SDK происходят на вашем сервере, по вашим правилам, и записываются. Для всего, что изменяет данные, используйте и то, и другое.

## Чек-лист безопасности {#security-checklist}

Прежде чем делиться сервером:

- [ ] **Открывайте минимум.** Перечисляйте в `tools` только нужные инструменты; предпочитайте источники только для чтения; добавляйте операции записи по одной.
- [ ] **Запись требует человека.** Оставляйте `requiresApproval` у инструментов записи, если у вас нет причины поступить иначе, и записывайте эту причину.
- [ ] **Минимальные привилегии на нижнем уровне.** Токены API с правами только на чтение, роль базы данных только с SELECT, папка, содержащая лишь то, чем можно делиться. Проверки сервера — второй замок, а не первый.
- [ ] **Секреты вне кода.** Токены берутся из переменных окружения (`claude mcp add … -e TOKEN=…`), никогда из спецификации, описания или файла.
- [ ] **Результаты — недоверенный текст.** То, что возвращает API, документ или база данных, доходит до модели дословно — на странице может быть написано «игнорируй свои инструкции и…». Не давайте одному и тому же разговору одновременно недоверенные источники и мощные инструменты записи без одобрения.
- [ ] **HTTP-серверы**: HTTPS, длинный случайный токен, список разрешённых `Host`, прослушивание `127.0.0.1` за прокси.
- [ ] **Подробности ошибок остаются внутри** (`exposeErrorDetails` выключен, это значение по умолчанию). Отказы из-за входных данных (неверный аргумент, путь за пределами папки, SQL, который не является запросом) по-прежнему объясняются клиенту.
- [ ] **Бюджеты** для всего, что стоит денег: агентов (вызовы модели) и платных API.
- [ ] **Читайте журнал событий** в первые дни: какие инструменты вызываются, какие вызовы отклоняются.

Проект MCP ведёт подробное руководство по атакам и защите: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## Диагностика {#troubleshooting}

| Симптом | Вероятная причина | Решение |
| --- | --- | --- |
| Клиент сразу отключается или сообщает, что сервер прислал некорректный JSON | Что-то пишет в **стандартный вывод**: `console.log` в вашем коде или в библиотеке | Используйте `console.error` (стандартный поток ошибок). Stdout занят протоколом. |
| `npx tsx server.ts` выводит одну строку и как будто зависает | Это нормально: сервер stdio ждёт клиента | Проверьте с помощью [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector) или подключите приложение. |
| Сервер не появляется в Claude Desktop | Ошибка JSON в конфигурации, относительный путь, приложение не перезапущено | Проверьте JSON, используйте абсолютные пути, закройте и перезапустите приложение, прочитайте `mcp*.log` ([где](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` в логах | Приложение не видит `PATH` вашей оболочки (часто бывает с nvm) | Используйте полный путь к `npx` (`which npx` / `where npx`). |
| Инструмента нет в списке | Его нет в `tools` | Добавьте его имя или определение в `tools`: иначе ничего не открывается. |
| `Another tool named "x" is already defined` при запуске | Два источника создают инструмент с одинаковым именем | Задайте каждому источнику `prefix`. |
| `Tool execution failed: <name>` и больше ничего | Причина может содержать внутренние подробности, поэтому она скрыта | Прочитайте запуск в журнале событий или задайте `exposeErrorDetails: true` на время разработки. |
| Вызовы завершаются по тайм-ауту | Инструмент медленный (часто это агент) | Уменьшите `limits` агента; увеличьте тайм-аут клиента (Claude Code: `MCP_TOOL_TIMEOUT`). |
| Результаты обрезаны | Ограничения размера (`truncated: true`) или собственное ограничение клиента | Увеличьте `maxResponseBytes`, `maxRows`, `maxFileBytes`; Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| Инструмент записи отвечает «Approval no decision within 50000 ms» | Никто не одобрил его вовремя | Одобряйте быстрее (см. [одобрения](#approvals-a-human-says-yes-first)), увеличьте `approvalTimeoutMs` или осознанно задайте `requiresApproval: false`. |
| Папки вроде `events/` или `golden-traces/` появляются в неожиданных местах | Для журнала событий не задан абсолютный путь (или используется старая версия SDK) | Передайте `eventStore: new FileEventStore(<absolute path>)`. Текущие версии создают остальные свои папки, только когда они используются. |
| `Cannot find module 'node:sqlite'` | Node.js старше 22.13 | Обновите Node.js или используйте `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | Спецификация OpenAPI в формате YAML | Разберите её (пакет `yaml`) и передайте объект как `spec`. |
| `cannot resolve the server URL "/v3"` | В спецификации указан относительный сервер, и она загружена из файла | Передайте `baseUrl`. |
| Inspector не запускается | Его [документация](https://modelcontextprotocol.io/docs/tools/inspector) требует Node.js 22.19+ (проверено 2026-09-24) | Обновите Node.js, чтобы запустить Inspector (ваш сервер может остаться на 20+). |
| Клиент, который говорит только на протоколе 2026-07-28, не может подключиться | Сервер принимает ревизии с 2024-10-07 по 2025-11-25 (MCP TypeScript SDK 1.30) | Используйте клиент, поддерживающий более ранние ревизии. Inspector, согласно его [документации](https://modelcontextprotocol.io/docs/tools/inspector) (проверено 2026-09-24), поддерживает обе «эпохи»: прежнюю и 2026-07-28. |
| При включённых оповещениях об инцидентах каждый отклонённый вызов MCP становится оповещением | Неудавшийся вызов MCP — это неудавшийся запуск | Отфильтруйте через `when: (event) => event.metadata?.agentId !== 'mcp:docs'` или понизьте его серьёзность. |

### Как прочитать, что произошло {#reading-what-happened}

Каждый вызов и каждое чтение ресурса — это запуск. С файловым хранилищем по умолчанию каждый запуск — это один JSON-файл в вашей папке `events/`; из кода:

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

Вызов инструмента выглядит как `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`; чтение ресурса — как `run.started → resource.read → run.completed`, где `resource.read` содержит URI, размер и SHA-256 отданного содержимого. См. [каталог событий](../reference/events).
