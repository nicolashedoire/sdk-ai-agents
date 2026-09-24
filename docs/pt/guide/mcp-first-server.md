# Seu primeiro servidor MCP em 5 minutos

Vamos construir um pequeno servidor MCP que responde "quem cuida do faturamento?" a partir de uma lista da equipe, testá-lo sem nenhuma IA e depois conectá-lo ao Claude Desktop e ao Claude Code. Todos os comandos são dados; nada é pressuposto. Se alguma palavra não estiver clara, veja [MCP em palavras simples](./mcp).

## Do que você precisa {#what-you-need}

- **Node.js 20.11 ou posterior** — verifique com `node --version`. (A receita de SQLite precisa do 22.13+. A documentação do MCP Inspector pede o 22.19+.)
- Um terminal.
- Para usar o servidor a partir de uma aplicação de IA: o [Claude Desktop](https://claude.ai/download) ou o [Claude Code](https://code.claude.com/docs). Não é necessário nos primeiros passos.

Nenhuma chave de API é necessária: este servidor não chama um modelo de linguagem. A aplicação de IA que o usa tem o seu próprio.

## 1. Crie o projeto {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

O que cada linha faz:

| Comando | Por quê |
| --- | --- |
| `npm init -y` | Cria o `package.json`, o arquivo que lista as dependências do seu projeto. |
| `npm pkg set type=module` | Usa os módulos JavaScript modernos (`import`). O SDK exige isso. |
| `npm install github:nicolashedoire/sdk-ai-agents …` | Instala este SDK (ainda não está no npm, então vem do GitHub; ele se compila sozinho), o zod (para descrever os argumentos) e o SDK oficial do MCP, versão 1.30 ou posterior dentro da 1.x (a versão com que este SDK é testado). |
| `npm install --save-dev tsx` | Executa arquivos TypeScript diretamente, sem etapa de build. |

## 2. Escreva o servidor {#_2-write-the-server}

Crie um arquivo chamado `server.ts`:

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

Leia-o de cima para baixo:

1. **Os dados** — aqui, uma lista no arquivo; na vida real, a sua API, os seus arquivos ou o seu banco de dados.
2. **O SDK** — ele faz cada chamada passar pelo pipeline governado e a grava no log de eventos. O log fica ao lado do arquivo (`import.meta.dirname`) porque as aplicações de IA iniciam os servidores a partir de um diretório de trabalho que você não escolhe.
3. **A ferramenta** — o **nome** e a **descrição** são o que o modelo lê para decidir quando chamá-la, então escreva-os para um leitor que não sabe nada sobre o seu código. O **schema** lista os argumentos; o SDK o transforma no JSON Schema que os clientes MCP veem e recusa as chamadas que não correspondem a ele. `readOnly: true` informa aos clientes que a ferramenta não altera nada.
4. **O servidor** — `serveMcpOverStdio` fala MCP pela entrada e pela saída padrão. A lista `tools` é obrigatória: uma ferramenta que você não listou nunca fica visível, mesmo que esteja definida.

## 3. Execute-o {#_3-run-it}

```sh
npx tsx server.ts
```

Você deve ver isto, e nada mais:

```text
MCP server "team" ready on stdio, waiting for a client
```

**Parece travado — é normal.** Um servidor stdio espera que uma aplicação de IA converse com ele pela sua entrada. Pressione <kbd>Ctrl</kbd>+<kbd>C</kbd> para pará-lo. Você raramente vai iniciá-lo você mesmo: é a aplicação de IA que faz isso.

::: danger Nunca escreva no stdout
Em um servidor stdio, a saída padrão **é** o protocolo. Um `console.log` no seu código corrompe as mensagens e o cliente se desconecta. Use `console.error` para as suas próprias mensagens: elas vão para a saída de erro padrão, que os clientes guardam nos seus logs.
:::

## 4. Teste-o com o MCP Inspector {#_4-test-it-with-the-mcp-inspector}

O [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) é a ferramenta de teste oficial: uma página web (ou uma linha de comando) que age como um cliente MCP, para que você possa experimentar o seu servidor sem nenhuma IA. A documentação dele pede o Node.js 22.19 ou posterior (verificado em 2026-09-24).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

O comando exibe um endereço com um token de uso único; abra-o no navegador, clique em **Connect**, abra **Tools**, clique em **List Tools**, escolha `find_colleague`, digite `billing` e execute. Você obtém Ada.

Prefere o terminal? As mesmas verificações pela linha de comando:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

Tudo o que vem depois de `inspector` (ou depois de `--cli`) é o comando que inicia o seu servidor.

## 5. Conecte-o ao Claude Desktop {#_5-connect-it-to-claude-desktop}

O Claude Desktop lê os servidores a iniciar em um arquivo de configuração. Abra-o a partir da aplicação: **menu Claude → Settings… → Developer → Edit Config**. O arquivo é:

| Sistema | Caminho |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Adicione o seu servidor em `mcpServers`, com o **caminho absoluto** de `server.ts` (execute `pwd` na pasta do projeto para obtê-lo; no Windows, `cd`):

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

Depois, **feche o Claude Desktop completamente e abra-o de novo**: ele só lê o arquivo na inicialização. O seu servidor aparece na lista de conectores (o botão "+" da caixa de mensagem, depois **Connectors**). Pergunte: *"Quem cuida do faturamento na minha equipe?"* — o Claude pede a sua permissão para usar `find_colleague` e depois responde "Ada".

Se ele não aparecer:

- verifique o JSON (uma vírgula faltando basta para quebrá-lo) e se o caminho é absoluto;
- se o log disser que `npx` ou `node` não foi encontrado (comum quando o Node.js foi instalado com o nvm), substitua `"npx"` pelo caminho completo dado por `which npx` (macOS) ou `where npx` (Windows);
- leia os logs: `~/Library/Logs/Claude/mcp*.log` no macOS, `%APPDATA%\Claude\logs\mcp*.log` no Windows. `mcp-server-team.log` contém o que o seu servidor escreveu na saída de erro padrão.

Esses caminhos e menus vêm da documentação do MCP ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) em setembro de 2026; consulte essa página se o Claude Desktop tiver mudado.

## 6. Conecte-o ao Claude Code {#_6-connect-it-to-claude-code}

Um único comando, a partir de qualquer pasta (substitua o caminho):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- Tudo o que vem depois de `--` é o comando que inicia o seu servidor.
- O servidor é adicionado apenas para o projeto atual (`--scope local`, o padrão). Use `--scope user` para todos os seus projetos, ou `--scope project` para gravá-lo em um arquivo `.mcp.json` que você pode versionar e compartilhar.
- Variáveis de ambiente (por exemplo, um token de API de que o seu servidor precisa): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- Verifique com `claude mcp list`, ou digite `/mcp` dentro do Claude Code.

Verificado em 2026-09-24 com `claude mcp add --help` (Claude Code 2.1.173) e a [documentação de MCP do Claude Code](https://code.claude.com/docs/en/mcp).

## 7. Outras aplicações {#_7-other-applications}

A maioria das aplicações MCP pede as mesmas três coisas: um **comando** (`npx`), os seus **argumentos** (`-y`, `tsx`, o caminho absoluto de `server.ts`) e, opcionalmente, **variáveis de ambiente**. Consulte a documentação delas, por exemplo a do [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) ou a do [Cursor](https://cursor.com/docs/context/mcp).

## 8. Veja o que aconteceu {#_8-see-what-happened}

Cada chamada é gravada no log de eventos: abra a pasta `events/` ao lado de `server.ts`. Cada arquivo é uma chamada — uma **execução** da identidade `mcp:team` — com as suas etapas:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

As mesmas execuções podem ser lidas, reproduzidas por replay, precificadas e transformadas em alertas com o restante do SDK: veja [Rastreabilidade e replay](./observability).

## Para onde ir agora {#where-to-go-next}

- Substitua a lista da equipe por algo real: [uma API web, uma pasta, um banco de dados ou um agente — uma linha para cada](./mcp-recipes).
- Compartilhe o servidor com a sua equipe via HTTP, adicione aprovações e orçamentos: [Implantar, proteger e resolver problemas](./mcp-deploy).
