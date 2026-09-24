# Implantar, proteger e resolver problemas

O seu servidor funciona na sua máquina ([primeiro servidor](./mcp-first-server), [receitas](./mcp-recipes)). Esta página trata de compartilhá-lo via HTTP, de colocar regras e humanos no circuito, da lista de verificação de segurança e do que fazer quando algo não funciona.

## stdio ou HTTP? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| Como é executado | A aplicação de IA inicia o seu servidor como um programa no mesmo computador | O seu servidor roda em algum lugar como um serviço web |
| Quem pode usá-lo | A pessoa naquele computador | Qualquer pessoa a quem você der o endereço e um token |
| Exposição na rede | Nenhuma | Um endpoint HTTP a proteger |
| Ideal para | Ferramentas pessoais, arquivos locais, experimentos | Uma equipe, uma API ou um banco de dados de toda a empresa |
| Inicie-o com | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + o transporte HTTP do SDK do MCP |

Comece com stdio. Passe para HTTP quando várias pessoas precisarem do mesmo servidor.

## Servir via HTTP {#serve-over-http}

O SDK oficial do MCP fornece o transporte HTTP; `createMcpServer` entrega a ele um servidor governado. Este arquivo completo usa o próprio módulo `http` do Node — sem framework web — e é **stateless** (sem estado): cada requisição recebe um servidor MCP novo, então você pode executar várias cópias atrás de um balanceador de carga.

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

Para que serve cada verificação:

| Verificação | Por quê |
| --- | --- |
| Caminho `/mcp` | Um único endereço para o MCP; todo o resto é recusado. |
| Cabeçalho `Host` | Caso contrário, uma página web que você visita poderia fazer o seu navegador chamar um servidor em `localhost` ("DNS rebinding"). Quando implantado, liste no lugar o nome do seu host público. |
| Token bearer | Só entram os clientes que conhecem o token. Comparado em tempo constante. Gere um token longo e aleatório; mantenha-o fora do seu código. |
| Apenas `POST` | No modo stateless, não há um fluxo de longa duração a abrir com `GET`. |
| Um servidor por requisição | Nada é compartilhado entre requisições; as definições de ferramentas são construídas uma vez e reutilizadas (definir de novo a mesma definição é permitido). O preço: a mensagem de "cancelar" de um cliente chega como outra requisição e não consegue alcançar a chamada que ela cancela — é o fechamento da conexão, ou `approvalTimeoutMs`, que a encerra. |

O arquivo escuta apenas em `127.0.0.1`. Para publicá-lo, coloque-o atrás de um proxy reverso que termine o **HTTPS** (Caddy, nginx, o balanceador de carga da sua nuvem) e adicione o nome do seu host a `allowedHosts`. Nunca envie um token bearer por HTTP simples em uma rede.

Uma versão executável acompanha o projeto: [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) (`MCP_TOKEN=… npm run example:mcp-http`). Ela foi verificada com um cliente real: uma chamada sem o token recebe `401`, um `Host` forjado recebe `403`, e um cliente com o token lista e chama as ferramentas.

### Conectar clientes a um servidor HTTP {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. Em um `.mcp.json` compartilhado, escreva `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`: o Claude Code expande as variáveis de ambiente, então o token fica fora do arquivo.
- **Os seus próprios agentes**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — veja [MCP em palavras simples](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **Outras aplicações**: procure "remote MCP server" ou "custom connector" na documentação delas. Algumas só aceitam servidores que usam login OAuth em vez de um token fixo.

## Governança: políticas, orçamentos, aprovações {#governance-policies-budgets-approvals}

Cada chamada MCP é executada sob uma identidade, `mcp:<server name>` (mude-a com `agentId`). Políticas, orçamentos e alertas podem visá-la como qualquer agente. Veja [Agentes governados](./governed-agents) para todos os tipos de política.

**Um orçamento diário de chamadas** para um servidor:

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

A 501ª chamada do dia é recusada com o nome da política, e a recusa fica no log de eventos. Uma chamada é contada **quando começa** — verificada e contada em uma única etapa, para que 20 chamadas simultâneas não passem todas por baixo de um limite de 2 — e ela conta **qualquer que seja o resultado**, incluindo as falhas. Os orçamentos são contados na memória do processo: eles recomeçam do zero quando o servidor reinicia, e cada cópia de um servidor HTTP conta as próprias chamadas. Antes de qualquer política ou orçamento, os argumentos são verificados: uma chamada inválida é recusada sem ser contada nem esperar por ninguém.

### Aprovações: um humano diz sim primeiro {#approvals-a-human-says-yes-first}

Uma ferramenta aguarda uma decisão humana antes de ser executada quando:

- a sua definição tem `metadata: { requiresApproval: true }` — o padrão para as operações de escrita de `openApiTools`;
- ou uma política pede isso, para as ferramentas que você nomear, sem mexer nas definições delas:

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

Enquanto aguarda, a chamada aparece em `sdk.getPendingApprovals()`. O seu código decide com `sdk.approveAction(id, who, reason)` ou `sdk.rejectAction(id, who, reason)`; as duas decisões são registradas (`approval.requested`, `approval.approved` ou `approval.rejected`). Um servidor stdio não pode perguntar no próprio terminal — a entrada padrão transporta o protocolo —, então a decisão vem por outro canal. Por exemplo, um pequeno endpoint de administração nesta máquina, no mesmo processo que o servidor.

**O endpoint de administração decide o que é executado: proteja-o como o endpoint MCP.** Caso contrário, uma página aberta no seu navegador poderia alcançar `localhost` (DNS rebinding) e aprovar por você. Por isso, ele escuta apenas em `127.0.0.1`, aceita apenas o próprio `Host`, recusa qualquer requisição que traga um `Origin` (os navegadores adicionam um; scripts e `curl` não) e exige um cabeçalho secreto:

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

Depois, `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` lista o que está aguardando, e `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` decide. Um servidor completo construído dessa forma acompanha o projeto: [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts); ele foi verificado de ponta a ponta (uma chamada aguarda, um `Host` forjado, um `Origin` ou um segredo ausente recebem `403`/`401`, a aprovação executa a ferramenta, e o processo termina quando o cliente sai).

Para ser avisado quando uma aprovação estiver aguardando, adicione uma [regra de incidente](./incidents#rules) sobre `approval.requested` com um notificador de Slack ou de e-mail. As aprovações pendentes vivem na memória do processo em que a chamada aguarda: com várias cópias de um servidor HTTP, decida pela cópia que a mantém (ou execute uma única cópia para as ferramentas que exigem aprovação).

::: warning Quanto tempo dura uma aprovação pendente
Muitos clientes cancelam uma chamada depois de cerca de um minuto. Uma aprovação pendente é cancelada — e a ferramenta nunca é executada — quando:

- o cliente cancela a chamada (stdio, ou uma sessão HTTP com estado);
- a conexão é fechada: um cliente stdio que termina, uma requisição HTTP que é fechada;
- ninguém decidiu dentro de `approvalTimeoutMs` — **50 segundos por padrão**, abaixo do que a maioria dos clientes espera. Defina-o em `createMcpServer`/`serveMcpOverStdio` se o seu cliente esperar mais (o Claude Code com um `MCP_TOOL_TIMEOUT` aumentado).

**Em um servidor HTTP stateless, apenas os dois últimos casos se aplicam**: ele não consegue associar uma requisição de "cancelar" à chamada que ela cancela. Um cliente que desiste sem fechar a conexão deixa a aprovação pendente até `approvalTimeoutMs` — e um "sim" dado nesse intervalo ainda executa a ferramenta, embora ninguém esteja esperando a resposta. Mantenha `approvalTimeoutMs` bem abaixo do tempo que os seus clientes esperam (o exemplo usa 20 s), ou sirva as ferramentas que exigem aprovação por stdio ou por uma sessão com estado.

Depois de cancelada, um "sim" tardio falha com "already rejected", e a chamada é verificada mais uma vez depois da aprovação: se o cliente saiu nesse meio-tempo, a ferramenta não é executada. As aprovações via MCP são adequadas para decisões rápidas. Para decisões que levam horas, faça a ferramenta *registrar um pedido* que a sua equipe processa depois.
:::

A maioria das aplicações MCP também pergunta ao usuário antes de cada chamada de ferramenta (o Claude Desktop faz isso por padrão). Essa confirmação acontece na aplicação; as aprovações do SDK acontecem no seu servidor, sob as suas regras, e são registradas. Use as duas para qualquer coisa que altere dados.

## Lista de verificação de segurança {#security-checklist}

Antes de compartilhar um servidor:

- [ ] **Exponha o mínimo.** Liste em `tools` apenas as ferramentas necessárias; prefira fontes somente leitura; adicione as operações de escrita uma a uma.
- [ ] **Escritas precisam de um humano.** Mantenha `requiresApproval` nas ferramentas de escrita, a menos que você tenha um motivo, e registre esse motivo.
- [ ] **Privilégio mínimo na base.** Tokens de API com escopos somente leitura, uma role de banco de dados que só faz SELECT, uma pasta que contém apenas o que pode ser compartilhado. As verificações do servidor são uma segunda trava, não a primeira.
- [ ] **Segredos fora do código.** Os tokens vêm de variáveis de ambiente (`claude mcp add … -e TOKEN=…`), nunca da spec, da descrição ou do arquivo.
- [ ] **Os resultados são texto não confiável.** O que uma API, um documento ou um banco de dados devolve chega ao modelo palavra por palavra — uma página pode conter "ignore suas instruções e…". Não dê à mesma conversa fontes não confiáveis e ferramentas de escrita poderosas sem aprovação.
- [ ] **Servidores HTTP**: HTTPS, um token longo e aleatório, uma allowlist de `Host`, escuta em `127.0.0.1` atrás do proxy.
- [ ] **Os detalhes dos erros ficam do lado de dentro** (`exposeErrorDetails` desativado, o padrão). As recusas de entrada (argumento errado, caminho fora da pasta, SQL que não é uma consulta) continuam sendo explicadas ao cliente.
- [ ] **Orçamentos** em tudo o que custa dinheiro: agentes (chamadas ao modelo) e APIs pagas.
- [ ] **Leia o log de eventos** depois dos primeiros dias: quais ferramentas são chamadas, quais chamadas são recusadas.

O projeto MCP mantém um guia detalhado de ataques e defesas: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## Solução de problemas {#troubleshooting}

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| O cliente se desconecta imediatamente, ou diz que o servidor enviou um JSON inválido | Algo escreve na **saída padrão**: um `console.log` no seu código ou em uma biblioteca | Use `console.error` (saída de erro padrão). O stdout transporta o protocolo. |
| `npx tsx server.ts` exibe uma linha e parece travado | Normal: um servidor stdio espera por um cliente | Teste com o [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector), ou conecte uma aplicação. |
| O servidor não aparece no Claude Desktop | Erro de JSON na configuração, caminho relativo, aplicação não reiniciada | Verifique o JSON, use caminhos absolutos, feche e reabra a aplicação, leia `mcp*.log` ([onde](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` nos logs | A aplicação não vê o `PATH` do seu shell (comum com o nvm) | Use o caminho completo do `npx` (`which npx` / `where npx`). |
| Falta uma ferramenta na lista | Ela não está em `tools` | Adicione o nome ou a definição dela a `tools`: caso contrário, nada é exposto. |
| `Another tool named "x" is already defined` na inicialização | Duas fontes produzem o mesmo nome de ferramenta | Dê um `prefix` a cada fonte. |
| `Tool execution failed: <name>` e nada mais | A causa pode conter detalhes internos, então fica oculta | Leia a execução no log de eventos, ou defina `exposeErrorDetails: true` durante o desenvolvimento. |
| As chamadas estouram o tempo limite | A ferramenta é lenta (muitas vezes um agente) | `limits` menores para o agente; aumente o timeout do cliente (Claude Code: `MCP_TOOL_TIMEOUT`). |
| Os resultados são cortados | Limites de tamanho (`truncated: true`) ou o limite do próprio cliente | Aumente `maxResponseBytes`, `maxRows`, `maxFileBytes`; Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| Uma ferramenta de escrita responde "Approval no decision within 50000 ms" | Ninguém a aprovou a tempo | Aprove mais rápido (veja [aprovações](#approvals-a-human-says-yes-first)), aumente `approvalTimeoutMs`, ou defina `requiresApproval: false` deliberadamente. |
| Pastas como `events/` ou `golden-traces/` aparecem em lugares inesperados | Nenhum caminho absoluto para o log de eventos (ou uma versão mais antiga do SDK) | Passe `eventStore: new FileEventStore(<absolute path>)`. As versões atuais só criam as outras pastas quando elas são usadas. |
| `Cannot find module 'node:sqlite'` | Node.js anterior ao 22.13 | Atualize o Node.js, ou use `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | A spec OpenAPI está em YAML | Interprete-a (pacote `yaml`) e passe o objeto como `spec`. |
| `cannot resolve the server URL "/v3"` | A spec tem um servidor relativo e foi carregada de um arquivo | Passe `baseUrl`. |
| O Inspector se recusa a iniciar | A sua [documentação](https://modelcontextprotocol.io/docs/tools/inspector) pede o Node.js 22.19+ (verificado em 2026-09-24) | Atualize o Node.js para executar o Inspector (o seu servidor pode continuar no 20+). |
| Um cliente que só fala o protocolo 2026-07-28 não consegue se conectar | O servidor aceita as revisões de 2024-10-07 a 2025-11-25 (SDK TypeScript do MCP 1.30) | Use um cliente que suporte as revisões anteriores. O Inspector negocia as duas "eras", a legada e a 2026-07-28, segundo a sua [documentação](https://modelcontextprotocol.io/docs/tools/inspector) (verificado em 2026-09-24). |
| Com os alertas de incidentes ativados, cada chamada MCP recusada vira um alerta | Uma chamada MCP que falhou é uma execução que falhou | Filtre com `when: (event) => event.metadata?.agentId !== 'mcp:docs'`, ou reduza a severidade dela. |

### Ler o que aconteceu {#reading-what-happened}

Cada chamada e cada leitura de recurso é uma execução. Com o armazenamento em arquivos padrão, cada execução é um arquivo JSON na sua pasta `events/`; a partir do código:

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

Uma chamada de ferramenta se lê `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`; uma leitura de recurso, `run.started → resource.read → run.completed`, em que `resource.read` contém a URI, o tamanho e o SHA-256 do que foi servido. Veja o [catálogo de eventos](../reference/events).
