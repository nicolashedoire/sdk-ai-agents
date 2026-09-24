# 5분 만에 만드는 첫 번째 MCP 서버

팀 목록을 보고 "결제 담당은 누구인가?"에 답하는 아주 작은 MCP 서버를 만들고, AI 없이 테스트한 다음, Claude Desktop과 Claude Code에 연결해 보겠습니다. 모든 명령을 제공하며, 아무것도 미리 안다고 가정하지 않습니다. 모르는 용어가 있으면 [쉽게 풀어 쓴 MCP](./mcp)를 보세요.

## 필요한 것 {#what-you-need}

- **Node.js 20.11 이상** — `node --version`으로 확인하세요. (SQLite 레시피에는 22.13+가 필요합니다. MCP Inspector 문서는 22.19+를 요구합니다.)
- 터미널.
- AI 앱에서 서버를 쓰려면: [Claude Desktop](https://claude.ai/download) 또는 [Claude Code](https://code.claude.com/docs). 처음 몇 단계에는 필요하지 않습니다.

API 키는 필요 없습니다. 이 서버는 언어 모델을 호출하지 않습니다. 서버를 사용하는 AI 애플리케이션이 자신의 키를 가지고 있습니다.

## 1. 프로젝트 만들기 {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

각 줄이 하는 일은 다음과 같습니다.

| 명령 | 이유 |
| --- | --- |
| `npm init -y` | 프로젝트의 의존성을 나열하는 파일인 `package.json`을 만듭니다. |
| `npm pkg set type=module` | 최신 JavaScript 모듈(`import`)을 사용합니다. SDK가 이를 요구합니다. |
| `npm install github:nicolashedoire/sdk-ai-agents …` | 이 SDK(아직 npm에 없으므로 GitHub에서 가져오며, 스스로 빌드됩니다), zod(인자를 기술하기 위해), 그리고 공식 MCP SDK 1.x 안의 1.30 이상 버전(이 SDK가 테스트된 버전)을 설치합니다. |
| `npm install --save-dev tsx` | 빌드 단계 없이 TypeScript 파일을 바로 실행합니다. |

## 2. 서버 작성하기 {#_2-write-the-server}

`server.ts`라는 파일을 만드세요.

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

위에서 아래로 읽어 보세요.

1. **데이터** — 여기서는 파일 안의 목록이지만, 실제로는 여러분의 API, 파일 또는 데이터베이스입니다.
2. **SDK** — 모든 호출을 통제된 파이프라인으로 실행하고 이벤트 로그에 기록합니다. AI 앱은 여러분이 고르지 않은 작업 디렉터리에서 서버를 시작하므로, 로그는 파일 옆(`import.meta.dirname`)에 둡니다.
3. **도구** — **이름**과 **설명**은 모델이 언제 이 도구를 호출할지 결정하기 위해 읽는 것이므로, 여러분의 코드에 대해 전혀 모르는 독자를 위해 쓰세요. **스키마**는 인자를 나열합니다. SDK는 이를 MCP 클라이언트가 보는 JSON Schema로 바꾸고, 맞지 않는 호출을 거부합니다. `readOnly: true`는 이 도구가 아무것도 바꾸지 않는다고 클라이언트에게 알려 줍니다.
4. **서버** — `serveMcpOverStdio`는 표준 입력과 출력으로 MCP를 주고받습니다. `tools` 목록은 필수입니다. 나열하지 않은 도구는 정의되어 있더라도 절대 보이지 않습니다.

## 3. 실행하기 {#_3-run-it}

```sh
npx tsx server.ts
```

다음 한 줄만 보여야 합니다.

```text
MCP server "team" ready on stdio, waiting for a client
```

**멈춘 것처럼 보이지만 정상입니다.** stdio 서버는 AI 앱이 입력을 통해 말을 걸어 오기를 기다립니다. 멈추려면 <kbd>Ctrl</kbd>+<kbd>C</kbd>를 누르세요. 직접 시작할 일은 거의 없습니다. AI 앱이 대신 시작합니다.

::: danger 절대 stdout에 출력하지 마세요
stdio 서버에서는 표준 출력이 **곧** 프로토콜입니다. 코드에 `console.log`가 있으면 메시지가 망가지고 클라이언트 연결이 끊깁니다. 여러분의 메시지는 `console.error`를 쓰세요. 이는 표준 오류로 가며, 클라이언트가 로그에 보관합니다.
:::

## 4. MCP Inspector로 테스트하기 {#_4-test-it-with-the-mcp-inspector}

[MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)는 공식 테스트 도구입니다. MCP 클라이언트 역할을 하는 웹 페이지(또는 명령줄)로, AI 없이 서버를 시험해 볼 수 있습니다. 그 문서는 Node.js 22.19 이상을 요구합니다(2026-09-24 확인).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

명령은 일회용 토큰이 붙은 주소를 출력합니다. 브라우저에서 열고, **Connect**를 클릭하고, **Tools**를 연 다음, **List Tools**를 클릭하고, `find_colleague`를 골라 `billing`을 입력하고 실행하세요. Ada가 나옵니다.

터미널이 더 편한가요? 명령줄에서 같은 검사를 할 수 있습니다.

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

`inspector` 뒤(또는 `--cli` 뒤)에 오는 모든 것은 여러분의 서버를 시작하는 명령입니다.

## 5. Claude Desktop에 연결하기 {#_5-connect-it-to-claude-desktop}

Claude Desktop은 시작할 서버들을 구성 파일에서 읽습니다. 앱에서 여세요: **Claude 메뉴 → Settings… → Developer → Edit Config**. 파일 위치는 다음과 같습니다.

| 시스템 | 경로 |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

`mcpServers` 아래에 서버를 추가하고, `server.ts`의 **절대 경로**를 적으세요(프로젝트 폴더에서 `pwd`를 실행하면 얻을 수 있습니다. Windows에서는 `cd`).

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

그다음 **Claude Desktop을 완전히 종료했다가 다시 시작하세요**. 앱은 시작할 때만 이 파일을 읽습니다. 여러분의 서버가 커넥터 목록에 나타납니다(메시지 상자의 "+" 버튼, 그다음 **Connectors**). *"우리 팀에서 결제 담당은 누구인가요?"*라고 물어보세요. Claude가 `find_colleague`를 사용해도 되는지 허락을 구한 다음 "Ada"라고 답합니다.

나타나지 않는다면:

- JSON을 확인하고(쉼표 하나만 빠져도 망가집니다), 경로가 절대 경로인지 확인하세요.
- 로그에 `npx`나 `node`를 찾을 수 없다고 나오면(Node.js를 nvm으로 설치했을 때 흔합니다), `"npx"`를 `which npx`(macOS)나 `where npx`(Windows)가 알려 주는 전체 경로로 바꾸세요.
- 로그를 읽으세요. macOS에서는 `~/Library/Logs/Claude/mcp*.log`, Windows에서는 `%APPDATA%\Claude\logs\mcp*.log`입니다. `mcp-server-team.log`에는 여러분의 서버가 표준 오류로 쓴 내용이 담겨 있습니다.

이 경로와 메뉴는 2026년 9월 기준 MCP 문서([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers))에서 가져왔습니다. Claude Desktop이 바뀌었다면 그 페이지를 확인하세요.

## 6. Claude Code에 연결하기 {#_6-connect-it-to-claude-code}

어떤 폴더에서든 명령 한 줄이면 됩니다(경로는 바꾸세요).

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- `--` 뒤에 오는 모든 것은 여러분의 서버를 시작하는 명령입니다.
- 서버는 현재 프로젝트에만 추가됩니다(`--scope local`, 기본값). 모든 프로젝트에 쓰려면 `--scope user`를, 커밋해서 공유할 수 있는 `.mcp.json` 파일에 적으려면 `--scope project`를 쓰세요.
- 환경 변수(예를 들어 서버에 필요한 API 토큰): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- `claude mcp list`로 확인하거나, Claude Code 안에서 `/mcp`를 입력하세요.

2026-09-24에 `claude mcp add --help`(Claude Code 2.1.173)와 [Claude Code MCP 문서](https://code.claude.com/docs/en/mcp)로 확인했습니다.

## 7. 다른 애플리케이션 {#_7-other-applications}

대부분의 MCP 애플리케이션은 같은 세 가지를 묻습니다. **명령**(`npx`), 그 **인자**(`-y`, `tsx`, `server.ts`의 절대 경로), 그리고 선택적인 **환경 변수**입니다. 각 애플리케이션의 문서를 보세요. 예를 들어 [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)나 [Cursor](https://cursor.com/docs/context/mcp)가 있습니다.

## 8. 무슨 일이 있었는지 보기 {#_8-see-what-happened}

모든 호출은 이벤트 로그에 기록됩니다. `server.ts` 옆의 `events/` 폴더를 여세요. 파일 하나가 호출 하나, 즉 `mcp:team` 신원의 **실행** 하나이며, 그 단계들이 담겨 있습니다.

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

같은 실행을 SDK의 다른 기능으로 읽고, 리플레이하고, 비용을 계산하고, 알림으로 만들 수 있습니다. [추적성과 리플레이](./observability)를 보세요.

## 다음으로 갈 곳 {#where-to-go-next}

- 팀 목록을 실제 무언가로 바꾸세요: [웹 API, 폴더, 데이터베이스 또는 에이전트 — 각각 한 줄](./mcp-recipes).
- HTTP로 팀과 서버를 공유하고, 승인과 예산을 추가하세요: [배포, 보안, 문제 해결](./mcp-deploy).
