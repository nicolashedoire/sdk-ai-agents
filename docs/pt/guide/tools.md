# Ferramentas

Uma **ferramenta** é uma função que um agente pode chamar: consultar um pedido, ler um arquivo, pesquisar na Web, perguntar a outro agente. Você escreve as suas, ou as pega prontas de uma **fonte de ferramentas**: uma pasta, um banco de dados, uma API web, a Web, um agente ou um servidor MCP.

Qualquer que seja a sua origem, toda chamada é **governada**. A ferramenta precisa ser uma das ferramentas de quem chama, os seus argumentos são verificados, as políticas e os orçamentos se aplicam, um humano pode ser solicitado a aprová-la, as falhas podem ter novas tentativas, e tudo é gravado no log de eventos.

## Em uma linha {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

Agora o agente pode listar, ler e pesquisar o manual, e pesquisar na Web e ler as suas páginas: oito ferramentas, todas somente leitura.

## As suas próprias ferramentas {#your-own-tools}

`sdk.defineTool` registra uma ferramenta no SDK e a devolve. O schema zod descreve os argumentos; o handler os recebe validados e tipados.

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

| Campo | |
| --- | --- |
| `name`, `description` | O que o modelo vê e a partir do que ele decide. Use letras, dígitos, `_` e `-`, até 64 caracteres: as APIs de modelos e os clientes MCP podem recusar outros nomes. |
| `schema` | Os argumentos, como um schema zod; os textos de `.describe()` são mostrados ao modelo. Uma chamada que não corresponde a ele é recusada antes de qualquer outra coisa. |
| `handler(params, context?)` | O seu código. `context` contém `runId`, `agentId` e `signal`, abortado quando quem chama desiste. |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`: veja [Como as chamadas são governadas](#how-calls-are-governed). Nenhum por padrão. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`, apenas para ferramentas idempotentes. |
| `version` | `1.0.0` por padrão. Ela faz parte do hash de configuração do agente, então as execuções de antes e de depois de uma mudança podem ser [comparadas](../reference/sdk-api#comparisons-and-impact). |
| `capability` | Um rótulo para agrupar; as fontes integradas definem um (`web:search`, `folder:handbook`…). |

Um nome é registrado uma única vez por SDK: `sdk.defineTool` lança um erro para um nome já usado, qualquer que seja a versão. Dê um prefixo a cada fonte quando duas delas puderem colidir. Todos os campos estão na [API do SDK](../reference/sdk-api#tools-tooldefinition).

## As fontes de ferramentas integradas {#the-built-in-tool-sources}

Cada fonte devolve definições de ferramentas, prontas para `sdk.defineTool` (no caso de `connectMcpServer`, na sua propriedade `tools`). Cada uma pode renomear as suas ferramentas: com um prefixo (`prefix`; `toolPrefix` para MCP), ou com o nome inteiro da ferramenta de um agente (`name`).

| Fonte | O agente pode | Nomes das ferramentas | Risco, somente leitura | Precisa de | Detalhes |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | Listar, ler e pesquisar os arquivos de texto de uma pasta, nunca fora dela | `list_files`, `read_file`, `search_files` | baixo, somente leitura | Uma pasta | [Uma pasta de documentos](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | Listar as tabelas, descrever uma delas, executar um `SELECT` (100 linhas por padrão) | `list_tables`, `describe_table`, `query` | médio, somente leitura | `sqliteReadOnly(db)` (`node:sqlite` ou `better-sqlite3`) ou `postgresReadOnly({ pool })` (`pg`) | [Um banco de dados somente leitura](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Chamar uma API web, uma ferramenta por operação; apenas `GET`, exceto o que estiver listado em `include` | O `operationId`, senão o método e o caminho (`get_pets_petId`) | `GET`: baixo, somente leitura. As outras: alto, aprovação exigida | Uma descrição OpenAPI 3 (URL, arquivo ou objeto) | [Uma API web](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Pesquisar na Web, ler uma página ou um PDF, pesquisar no arXiv, na Wikipedia e no GitHub | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` médio, as outras baixo; todas somente leitura | Nada para começar (DuckDuckGo); `unpdf` para os PDFs; um token do GitHub para pesquisar código | [Pesquisa na Web](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | Perguntar a outro agente: um agente governado responde a uma `message`, um agente cognitivo raciocina sobre um `problem` e devolve a sua decisão | `ask_<agent name>` | médio, não marcada como somente leitura | Um agente, portanto uma chave de modelo | [Um agente](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | Usar as ferramentas de qualquer servidor MCP | Os nomes do servidor, precedidos de `toolPrefix` | Nada definido: `metadata` se aplica a todas as ferramentas importadas | `@sdk-ai-agents/core/mcp` e `@modelcontextprotocol/sdk`; `close()` ao terminar | [Usar as ferramentas de um servidor MCP](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

Duas coisas são diferentes para as ferramentas MCP: o SDK só verifica que os seus argumentos formam um objeto (o servidor verifica o resto), e as indicações do próprio servidor, como somente leitura, não são importadas: defina `metadata` você mesmo.

## Dar ferramentas a um agente {#giving-tools-to-an-agent}

`createAgent({ tools })` e `createCognitiveAgent({ tools })` recebem ferramentas, então passe primeiro as definições de uma fonte por `sdk.defineTool`, como acima. Um agente só pode executar **as suas próprias ferramentas**, as de `tools` e as das suas `capabilities`: qualquer outra ferramenta que o modelo nomear é recusada (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

`defineTool`, importada do pacote, constrói uma ferramenta sem registrá-la: o SDK a registra quando um agente que a usa é criado. Se uma ferramenta com esse nome já estiver registrada, a registrada é mantida, e é ela que é executada.

### Capacidades {#capabilities}

Uma capacidade dá um nome a um grupo de ferramentas para entregar a vários agentes. O rótulo `capability` de uma ferramenta não é uma capacidade: defina-a com `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### Fora de um agente {#outside-an-agent}

`sdk.listTools()` devolve todas as ferramentas registradas no SDK. `sdk.executeTool(name, parameters, options?)` chama uma delas pelo mesmo pipeline governado, como uma execução própria (id de agente `external`, a menos que você informe `agentId`), e devolve o que o handler devolveu:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

As suas opções: `runId` registra a chamada dentro de uma execução existente, `allowedTools` limita o que quem chama pode executar, `signal` a cancela, `approvalTimeoutMs` limita a espera por uma aprovação, e `onEvent` acompanha a chamada ao vivo. Uma recusa lança um `PolicyViolationError`; argumentos inválidos e um handler que falha lançam um `ToolExecutionError`.

As mesmas ferramentas servem em outros lugares. Um [estudo](./studies#research-through-your-sources) recebe os **nomes** de ferramentas definidas como as suas `sources`, e um servidor MCP serve as definições ou os nomes que você lhe dá ao Claude Desktop, ao Claude Code ou a qualquer cliente MCP (veja [Um servidor MCP para qualquer coisa](./mcp-recipes)).

## Como as chamadas são governadas {#how-calls-are-governed}

Uma chamada passa por estas etapas, nesta ordem, e para na primeira recusa:

1. **As ferramentas de quem chama.** Uma ferramenta que não foi dada a quem chama é recusada: as ferramentas de um agente, as fontes de um estudo, a lista de um servidor MCP, ou `allowedTools`. `executeTool` sem `allowedTools` pode executar qualquer ferramenta registrada.
2. **Os argumentos**, verificados em relação ao schema, antes de perguntar qualquer coisa a alguém.
3. **As políticas**: todas as políticas globais e todas as políticas do agente (veja [Agentes governados](./governed-agents#_3-policies)).
4. **A aprovação**, quando a ferramenta ou uma política pede uma.
5. **O orçamento**: a chamada é contada quando começa, qualquer que seja o resultado.
6. **A ferramenta é executada**, com as suas novas tentativas.

### Níveis de risco {#risk-levels}

`riskLevel` é um rótulo: ele diz às pessoas e ao código quanto cuidado tomar. **Nenhuma política o lê**, e ele não bloqueia nem atrasa nenhuma chamada. Para agir com base nele, dê `requiresApproval` a uma ferramenta, ou transforme o rótulo em uma política:

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

A lista é montada no momento em que a política é definida: defina as ferramentas primeiro.

### Aprovações {#approvals}

Uma chamada aguarda um humano quando a ferramenta tem `requiresApproval: true` (o padrão de `openApiTools` para as operações de escrita) ou quando uma regra de política diz `require_approval`. Ela aparece em `sdk.getPendingApprovals()`; `sdk.approveAction(id, who, reason?)` a deixa ser executada, `sdk.rejectAction(id, who, reason?)` a recusa. Se quem chama desistir antes (uma execução interrompida, um `signal` abortado, `approvalTimeoutMs`, 50 s por padrão nos servidores MCP), a aprovação é cancelada e a ferramenta nunca é executada. Veja [Aprovações](./mcp-deploy#approvals-a-human-says-yes-first).

### Ferramentas somente leitura {#read-only-tools}

`readOnly: true` diz que a ferramenta não altera nada. Os clientes MCP o veem como `readOnlyHint`, e `openApiTools` só faz novas tentativas das operações somente leitura. Ele não flexibiliza nenhuma política e não é verificado: um handler marcado como somente leitura que escreve continua escrevendo. As fontes que só leem o garantem onde podem: `folderTools` não tem nenhuma forma de escrever, e `sqliteReadOnly` e `postgresReadOnly` executam cada consulta em modo somente leitura no próprio banco de dados.

### Novas tentativas {#retries}

`retry` executa de novo um handler que falha: apenas os erros do handler, nunca argumentos inválidos ou uma recusa. Cada nova tentativa é um evento `tool.retry`, e a chamada conta uma única vez no seu orçamento. `openApiTools`, `webTools` e `connectMcpServer` aceitam uma opção `retry` para as suas ferramentas. Veja [Novas tentativas e fallback](./resilience#tools).

### Orçamentos {#budgets}

Uma política `budget` com um `budgetLimit` limita as chamadas de ferramentas por período, para um agente (`agentId`), para uma ferramenta (`toolName`) ou para todos:

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

`maxTokens` e `maxCost` contam as chamadas ao modelo e, uma vez esgotados, recusam as chamadas de ferramentas. Veja [Custos de API](./costs#budgets).

### Resultados não confiáveis {#untrusted-output}

O que uma ferramenta devolve volta para o modelo, e uma página, um arquivo ou uma resposta de API pode conter instruções escritas para ele (prompt injection). As ferramentas Web marcam cada resposta como `untrusted: true`, e as suas descrições dizem ao modelo que nunca siga instruções encontradas nela. As outras fontes devolvem o seu conteúdo tal como está. Diga no prompt de sistema que os resultados das ferramentas são dados, dê a cada agente apenas as ferramentas de que ele precisa, e proteja com aprovações as ferramentas que alteram coisas. Um estudo mostra cada resultado ao seu modelo como dados. Veja [as regras de segurança das ferramentas Web](./web-research#security-rules).

### O que uma chamada registra {#what-a-call-records}

| Evento | Quando |
| --- | --- |
| `action.executing` | A chamada é proposta, antes de qualquer verificação |
| `policy.checked` | Cada política verificada, depois o veredito |
| `policy.violated` | Uma recusa: uma ferramenta que não foi dada a quem chama (`allowed-tools`), uma política, um orçamento esgotado |
| `approval.requested`, `approval.approved`, `approval.rejected` | A decisão humana |
| `tool.called` | O handler começa |
| `tool.retry` | Uma nova tentativa, com a sua espera e o erro |
| `action.executed`, `action.failed` | O resultado ou o erro (argumentos inválidos incluídos), com a duração |

Uma chamada feita com `executeTool` é uma execução própria, a menos que você informe `runId`: `run.started` (modo `tool`), depois `run.completed` ou `run.failed`. Veja o [catálogo de eventos](../reference/events#reasoning-and-actions).

## Escolher uma fonte {#choosing-a-source}

| Eu preciso de… | Use |
| --- | --- |
| O meu próprio código ou serviço | `sdk.defineTool` |
| Documentos em uma pasta | `folderTools` |
| Respostas de um banco de dados SQL, sem nenhum risco de escrita | `databaseTools` com `sqliteReadOnly` ou `postgresReadOnly` |
| Uma API web que publica uma descrição OpenAPI | `openApiTools` |
| Uma API web que não publica | `sdk.defineTool`, com `fetch` no handler |
| A Web, artigos científicos, verbetes de enciclopédia, código no GitHub | `webTools` |
| A resposta ou a decisão de outro agente | `governedAgentTool` ou `cognitiveAgentTool` |
| Um sistema que já tem um servidor MCP | `connectMcpServer` |
| Fontes para um estudo | As ferramentas de pesquisa de `webTools`, ou as de um servidor MCP |
| As minhas ferramentas no Claude Desktop ou no Claude Code | O sentido inverso: [um servidor MCP](./mcp-recipes) |
