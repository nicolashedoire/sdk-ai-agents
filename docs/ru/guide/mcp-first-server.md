# Ваш первый сервер MCP за 5 минут

Мы создадим крошечный сервер MCP, который по списку команды отвечает на вопрос «кто отвечает за биллинг?», проверим его без всякого ИИ, а затем подключим к Claude Desktop и Claude Code. Все команды приведены; ничего не подразумевается. Если какое-то слово непонятно, см. [MCP простыми словами](./mcp).

## Что вам понадобится {#what-you-need}

- **Node.js 20.11 или новее** — проверьте с помощью `node --version`. (Рецепту с SQLite нужна версия 22.13+. Документация MCP Inspector требует 22.19+.)
- Терминал.
- Чтобы пользоваться сервером из ИИ-приложения: [Claude Desktop](https://claude.ai/download) или [Claude Code](https://code.claude.com/docs). Для первых шагов не нужно.

Ключ API не нужен: этот сервер не обращается к языковой модели. У ИИ-приложения, которое его использует, есть своя.

## 1. Создайте проект {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

Что делает каждая строка:

| Команда | Зачем |
| --- | --- |
| `npm init -y` | Создаёт `package.json` — файл, в котором перечислены зависимости вашего проекта. |
| `npm pkg set type=module` | Включает современные модули JavaScript (`import`). Этого требует SDK. |
| `npm install github:nicolashedoire/sdk-ai-agents …` | Устанавливает этот SDK (его ещё нет в npm, поэтому с GitHub; он собирается сам), zod (для описания аргументов) и официальный MCP SDK версии 1.30 или новее в пределах 1.x (версия, с которой тестируется этот SDK). |
| `npm install --save-dev tsx` | Запускает файлы TypeScript напрямую, без шага сборки. |

## 2. Напишите сервер {#_2-write-the-server}

Создайте файл с именем `server.ts`:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

Прочитайте его сверху вниз:

1. **Данные** — здесь это список в файле; в реальной жизни — ваш API, файлы или база данных.
2. **SDK** — он пропускает каждый вызов через управляемый конвейер и записывает его в журнал событий. Журнал хранится рядом с файлом (`import.meta.dirname`), потому что ИИ-приложения запускают серверы из рабочего каталога, который выбираете не вы.
3. **Инструмент** — **имя** и **описание** — это то, что читает модель, чтобы решить, когда его вызвать, поэтому пишите их для читателя, который ничего не знает о вашем коде. **Схема** перечисляет аргументы; SDK превращает её в JSON Schema, которую видят клиенты MCP, и отклоняет вызовы, которые ей не соответствуют. `readOnly: true` сообщает клиентам, что инструмент ничего не изменяет.
4. **Сервер** — `serveMcpOverStdio` общается по MCP через стандартный ввод и вывод. Список `tools` обязателен: инструмент, который вы не перечислили, никогда не будет виден, даже если он определён.

## 3. Запустите его {#_3-run-it}

```sh
npx tsx server.ts
```

Вы должны увидеть только это:

```text
MCP server "team" ready on stdio, waiting for a client
```

**Кажется, что он завис, — это нормально.** Сервер stdio ждёт, пока ИИ-приложение заговорит с ним через его ввод. Нажмите <kbd>Ctrl</kbd>+<kbd>C</kbd>, чтобы его остановить. Сами вы будете запускать его редко: это делает ИИ-приложение.

::: danger Никогда не печатайте в stdout
В сервере stdio стандартный вывод **и есть** протокол. `console.log` в вашем коде портит сообщения, и клиент отключается. Для собственных сообщений используйте `console.error`: он пишет в стандартный поток ошибок, который клиенты сохраняют в своих логах.
:::

## 4. Проверьте его с помощью MCP Inspector {#_4-test-it-with-the-mcp-inspector}

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) — официальный инструмент для тестирования: веб-страница (или командная строка), которая действует как клиент MCP, чтобы вы могли опробовать свой сервер без всякого ИИ. Его документация требует Node.js 22.19 или новее (проверено 2026-09-24).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

Команда выводит адрес с одноразовым токеном; откройте его в браузере, нажмите **Connect**, откройте **Tools**, нажмите **List Tools**, выберите `find_colleague`, введите `billing` и запустите. Вы получите Ada.

Предпочитаете терминал? Те же проверки из командной строки:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

Всё, что идёт после `inspector` (или после `--cli`), — это команда, которая запускает ваш сервер.

## 5. Подключите его к Claude Desktop {#_5-connect-it-to-claude-desktop}

Claude Desktop берёт список запускаемых серверов из файла конфигурации. Откройте его из приложения: **меню Claude → Settings… → Developer → Edit Config**. Файл находится здесь:

| Система | Путь |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Добавьте свой сервер в `mcpServers` с **абсолютным путём** к `server.ts` (чтобы его узнать, выполните `pwd` в папке проекта; в Windows — `cd`):

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

Затем **полностью закройте Claude Desktop и запустите его снова**: он читает файл только при запуске. Ваш сервер появится в списке коннекторов (кнопка «+» в поле сообщения, затем **Connectors**). Спросите: *«Кто в моей команде отвечает за биллинг?»* — Claude запросит у вас разрешение использовать `find_colleague`, а затем ответит «Ada».

Если он не появился:

- проверьте JSON (достаточно одной пропущенной запятой, чтобы его сломать) и что путь абсолютный;
- если в логе сказано, что `npx` или `node` не найдены (часто бывает, когда Node.js установлен через nvm), замените `"npx"` полным путём, который выдаёт `which npx` (macOS) или `where npx` (Windows);
- прочитайте логи: `~/Library/Logs/Claude/mcp*.log` в macOS, `%APPDATA%\Claude\logs\mcp*.log` в Windows. В `mcp-server-team.log` находится то, что ваш сервер писал в стандартный поток ошибок.

Эти пути и меню взяты из документации MCP ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) по состоянию на сентябрь 2026 года; сверьтесь с этой страницей, если Claude Desktop изменился.

## 6. Подключите его к Claude Code {#_6-connect-it-to-claude-code}

Одна команда из любой папки (замените путь):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- Всё, что идёт после `--`, — это команда, которая запускает ваш сервер.
- Сервер добавляется только для текущего проекта (`--scope local`, значение по умолчанию). Используйте `--scope user` для всех своих проектов или `--scope project`, чтобы записать его в файл `.mcp.json`, который можно закоммитить и которым можно поделиться.
- Переменные окружения (например, токен API, нужный вашему серверу): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- Проверьте с помощью `claude mcp list` или введите `/mcp` внутри Claude Code.

Проверено 2026-09-24 с помощью `claude mcp add --help` (Claude Code 2.1.173) и [документации Claude Code по MCP](https://code.claude.com/docs/en/mcp).

## 7. Другие приложения {#_7-other-applications}

Большинство приложений MCP запрашивают одни и те же три вещи: **команду** (`npx`), её **аргументы** (`-y`, `tsx`, абсолютный путь к `server.ts`) и необязательные **переменные окружения**. См. их документацию, например [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) или [Cursor](https://cursor.com/docs/context/mcp).

## 8. Посмотрите, что произошло {#_8-see-what-happened}

Каждый вызов записывается в журнал событий: откройте папку `events/` рядом с `server.ts`. Каждый файл — это один вызов, один **запуск** идентичности `mcp:team`, со своими шагами:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

Эти же запуски можно читать, воспроизводить, узнавать их стоимость и превращать в оповещения с помощью остальных возможностей SDK: см. [Прослеживаемость и воспроизведение](./observability).

## Что дальше {#where-to-go-next}

- Замените список команды чем-нибудь настоящим: [веб-API, папка, база данных или агент — по одной строке на каждый](./mcp-recipes).
- Поделитесь сервером с командой по HTTP, добавьте одобрения и бюджеты: [Развёртывание, безопасность и диагностика](./mcp-deploy).
