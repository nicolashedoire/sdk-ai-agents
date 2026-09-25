# Um servidor MCP para qualquer coisa

Cada receita transforma um tipo de sistema em um servidor MCP **em uma linha**, com segurança. Todas funcionam da mesma forma: uma **fonte de ferramentas** constrói as ferramentas (e às vezes recursos), e `serveMcpOverStdio` as serve.

| Você quer expor | A linha | Ferramentas que o modelo recebe |
| --- | --- | --- |
| [Uma função que você escreve](#a-function) | `sdk.defineTool({ … })` | as suas |
| [Uma API web](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | uma por operação, somente leitura por padrão |
| [Uma pasta de documentos](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ recursos) |
| [Um banco de dados, somente leitura](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [Um agente](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |
| [A Web](./web-research) | `webTools()` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` |

Novo no MCP? Comece por [Seu primeiro servidor MCP em 5 minutos](./mcp-first-server): ele mostra como executar um servidor, testá-lo com o Inspector e conectá-lo ao Claude Desktop ou ao Claude Code. Todos os arquivos abaixo são executados e conectados da mesma forma.

## O esqueleto comum a todas as receitas {#the-skeleton-every-recipe-shares}

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

`tools` recebe **definições de ferramentas** (o que as fontes abaixo devolvem — o SDK as define para você) e **nomes** de ferramentas que você mesmo definiu com `sdk.defineTool`. Nada mais é exposto, nunca. `resources` (opcional) recebe provedores de documentos, usados pela receita de pasta.

Qualquer que seja a fonte, cada chamada passa pelas mesmas verificações, nesta ordem — argumentos, [políticas](./mcp-deploy#governance-policies-budgets-approvals), aprovação, orçamento — e é gravada no log de eventos. Uma chamada inválida é recusada antes que alguém seja solicitado a aprová-la.

## Uma função {#a-function}

A fonte mais simples: uma função que você escreve, como no [primeiro servidor](./mcp-first-server).

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

| Campo | Para que serve |
| --- | --- |
| `name` | O que o modelo chama. Use letras, dígitos, `_` e `-`, até 64 caracteres (os clientes MCP podem rejeitar outros nomes). |
| `description` | Quando usar a ferramenta, em palavras simples. O modelo decide a partir dela. |
| `schema` | Os argumentos, como um schema zod. Os textos de `.describe()` são mostrados ao modelo. As chamadas que não correspondem são recusadas. |
| `handler` | O seu código. Ele recebe os argumentos validados e um contexto com `signal` (abortado quando o cliente desiste). |
| `metadata.readOnly` | "Esta ferramenta não altera nada": mostrado aos clientes como `readOnlyHint`. |
| `metadata.requiresApproval` | Cada chamada aguarda um humano (veja [aprovações](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | Novas tentativas em caso de falha, apenas para ferramentas idempotentes (`retryOn` restringe quais falhas; argumentos inválidos nunca geram nova tentativa). |

## Uma API web, a partir da sua descrição OpenAPI {#a-web-api-from-its-openapi-description}

**O que faz.** Muitas APIs publicam uma descrição legível por máquina dos seus endpoints, chamada de documento **OpenAPI** (muitas vezes `openapi.json`). `openApiTools` a lê e transforma **cada operação em uma ferramenta**: o modelo vê o resumo e os parâmetros dela, e chamar a ferramenta chama a API.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**Somente leitura por padrão.** Apenas as operações `GET` se tornam ferramentas. Para adicionar uma operação que altera algo (`POST`, `PUT`, `PATCH`, `DELETE`), liste-a pelo seu `operationId`:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

Uma operação de escrita listada é marcada como de **alto risco** e **exige aprovação**: cada chamada aguarda até que um humano a aprove (veja [aprovações](./mcp-deploy#approvals-a-human-says-yes-first)). Para confiar nela sem aprovação, diga isso explicitamente: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### Opções {#options}

| Opção | Padrão | |
| --- | --- | --- |
| `spec` | — | Uma URL (`https://…`), um caminho de arquivo ou um objeto que você já interpretou. Apenas JSON; para YAML, interprete-o você mesmo (por exemplo, com o pacote `yaml`) e passe o objeto. |
| `baseUrl` | primeira entrada de `servers` | Para onde vão as requisições. Uma URL de servidor relativa é resolvida em relação à URL da spec. |
| `headers` | — | Adicionados a cada requisição (autenticação). Nunca mostrados ao modelo, e eles sobrescrevem qualquer argumento de cabeçalho. Exige `baseUrl` (a menos que a spec seja baixada da própria origem da API) e https para a API e para a spec (http apenas nesta máquina). |
| `include` | operações GET | `operationId`s a expor. Quando informado, ele **substitui** o padrão GET: apenas as operações listadas se tornam ferramentas. É a única forma de expor uma operação de escrita. Um id desconhecido é um erro. |
| `exclude` | — | `operationId`s a deixar de fora. |
| `tags` | — | Apenas as operações com uma dessas tags. |
| `prefix` | — | Prefixo dos nomes das ferramentas (`crm_getCustomer`), para combinar várias APIs. |
| `metadata` | GET: baixo risco, somente leitura · outras: alto risco, aprovação | `(operation) => ToolMetadata`. Cada campo que você define substitui o padrão; um campo omitido — ou `undefined` — o mantém, então só um `requiresApproval: false` explícito remove uma aprovação. |
| `retry` | — | Novas tentativas apenas para operações somente leitura (os GETs, a menos que `metadata` diga o contrário), em erros de servidor (5xx), 429, timeouts e falhas de rede — nunca em respostas 4xx nem em argumentos inválidos. |
| `timeoutMs` | `30000` | Por requisição (e para baixar a spec). |
| `maxResponseBytes` | `100000` | Respostas mais longas são cortadas e marcadas com `truncated: true`. |
| `maxSpecBytes` | `10000000` | Maior spec aceita. |
| `fetch` | `fetch` global | A sua própria função HTTP (proxy, testes). |

### O que o modelo vê {#what-the-model-sees}

Para o `getPetById` da Petstore, os clientes recebem:

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

Os nomes das ferramentas vêm do `operationId` (tornados válidos: `show pet!` vira `show_pet`; uma operação sem `operationId` vira `get_pets_petId`; duplicatas recebem `_2`). Os argumentos são planos: um por parâmetro de caminho, de query e de cabeçalho, mais `body` para um corpo de requisição JSON. Uma chamada devolve o status HTTP e o corpo interpretado:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### Regras de segurança {#security-rules}

1. **Somente leitura por padrão**: apenas `GET`; qualquer outra coisa precisa estar listada em `include` e, então, exige aprovação, a menos que você diga o contrário.
2. **O modelo não pode mudar o host nem subir no caminho.** A URL base é sua. Um valor de caminho não pode conter `/`, `\` nem um segmento `.` / `..` — mesmo codificado em porcentagem, uma ou várias vezes, junto de sequências de escape malformadas ou não, já que alguns servidores e proxies decodificam `%2F` — então `../../admin` é recusado; a URL final também é verificada para garantir que fica sob a URL base. Dentro desses limites, o modelo escolhe os valores: qual cliente, qual pedido.
3. **Os argumentos são verificados antes de qualquer outra coisa**: antes das políticas e das aprovações (uma chamada inválida nunca espera por um humano), e de novo quando a requisição é montada. Argumentos desconhecidos e obrigatórios ausentes são recusados; os valores precisam ser strings, números ou booleanos (listas deles para parâmetros de query); os valores de cabeçalho não podem conter quebras de linha.
4. **As suas credenciais só vão para onde você decidiu**: os `headers` são adicionados pelo servidor, sobrescrevem os argumentos de cabeçalho e não aparecem em nenhum lugar que o modelo possa ler. Com `headers`, um servidor indicado por um arquivo de spec é recusado — passe `baseUrl` — a menos que a spec tenha sido baixada da própria origem da API; e `http:` é recusado, exceto nesta máquina (`localhost`, `127.0.0.1`, `[::1]`) — para a API, e para baixar a spec, já que uma spec alterada no caminho poderia adicionar operações que as suas credenciais autorizariam.
5. **Limitado**: um timeout por requisição, respostas cortadas em `maxResponseBytes`, um limite de tamanho para a spec.
6. **Os redirecionamentos não são seguidos** (um redirecionamento poderia levar o seu cabeçalho `Authorization` para outro site): uma resposta `3xx` é um erro, e o mesmo vale para um redirecionamento que um `fetch` personalizado tenha seguido mesmo assim.
7. **Erros são erros**: um status que não seja `2xx` faz a chamada falhar com o status e o início do corpo. Os clientes MCP veem apenas "Tool execution failed", a menos que você defina `exposeErrorDetails: true` (os corpos podem conter detalhes internos); o log de eventos sempre tem o erro completo.
8. **Todo GET é anunciado como somente leitura** (`readOnlyHint`). Algumas APIs têm GETs com efeitos colaterais (`GET /send-reminder`): deixe-os de fora com `exclude`, ou defina `metadata` como `readOnly: false, requiresApproval: true` para eles.
9. **Descrições grandes continuam limitadas**: a expansão de `$ref` tem um orçamento por operação e para a spec inteira, e o schema de uma ferramenta com mais de 64.000 caracteres é substituído pelas suas descrições.

### Arquivo completo {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), com os imports de um pacote instalado:

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

Passe o token pelo ambiente do cliente, nunca no arquivo: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### O que ela não faz {#what-it-does-not-do}

- **Apenas OpenAPI 3.x**: Swagger 2.0 é recusado (converta-o, por exemplo, com `swagger2openapi`). O YAML não é interpretado para você.
- **Apenas corpos JSON**: uma operação que exige um corpo `multipart/form-data` ou de formulário é deixada de fora (ou recusada, se você a listar); um corpo opcional de outro tipo não é oferecido. Os parâmetros de cookie são deixados de fora.
- **Sem fluxos de login**: passe um token em `headers`; o OAuth não é tratado.
- **Apenas referências locais**: `$ref`s para outros arquivos ou URLs não são resolvidos (eles viram "qualquer valor"); um schema que se refere a si mesmo é cortado no ciclo.
- As respostas não são verificadas em relação à spec, as páginas não são seguidas, e apenas o primeiro servidor da spec é usado, a menos que você passe `baseUrl`.

## Uma pasta de documentos {#a-folder-of-documents}

**O que faz.** Oferece os arquivos de texto de uma pasta — um manual, anotações, uma base de código, documentação exportada — com três ferramentas: **listar** os arquivos, **ler** um deles, **procurar** um texto neles. Os mesmos arquivos também são oferecidos como **recursos**, que os usuários podem anexar a uma conversa por conta própria.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### Opções {#options-1}

`folderTools` e `folderResources` recebem as mesmas opções (mais `prefix` para as ferramentas):

| Opção | Padrão | |
| --- | --- | --- |
| `root` | — | A pasta. Use um caminho absoluto: os clientes iniciam os servidores a partir de qualquer diretório de trabalho. |
| `name` | o nome da pasta | Usado nas descrições e nas URIs dos recursos (`folder://<name>/…`). |
| `prefix` | — | Prefixo dos nomes das ferramentas (`handbook_read_file`), para servir várias pastas. |
| `extensions` | formatos de texto | Extensões oferecidas, sem o ponto (`['md', 'txt']`). Padrão: `md`, `txt`, `csv`, `json`, `yaml`, `html`, código-fonte… (`DEFAULT_TEXT_EXTENSIONS`). Adicione `''` para arquivos sem extensão. |
| `include` | tudo o que é permitido | Globs dos arquivos a oferecer: `guide/**`, `**/*.md`. `*` corresponde dentro de uma pasta, `**` atravessa pastas. As pastas continuam sendo listadas, mesmo quando não contêm nenhum arquivo correspondente. |
| `exclude` | — | Globs de arquivos e pastas a ocultar em todo lugar: `drafts`, `private/*`, `**/node_modules`. Uma pasta oculta oculta tudo o que está dentro dela. |
| `includeHidden` | `false` | Oferecer nomes que começam com um ponto (`.env`, `.git`…). Deixe desativado. |
| `maxFileBytes` | `200000` | Bytes lidos de um arquivo; arquivos mais longos são cortados (`truncated: true`). |
| `maxEntries` | `500` | Entradas devolvidas por uma listagem, incluindo os recursos. |
| `maxDepth` | `8` | Profundidade de subpastas explorada. |
| `maxMatches` | `50` | Correspondências devolvidas por uma busca. |
| `maxSearchBytes` | `20000000` | Bytes lidos por uma busca, somando todos os arquivos. |
| `maxExaminedEntries` | `50000` | Nomes examinados por uma listagem ou busca, oferecidos ou não; além disso, o resultado indica `truncated: true`. |

### O que o modelo vê {#what-the-model-sees-1}

A ferramenta de busca, resumida:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

Uma busca devolve `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. Uma leitura devolve `{ "path", "size", "content", "truncated" }`.

**Recursos**: cada arquivo é listado como `folder://handbook/guide/onboarding.md` com o seu tamanho e tipo (`text/markdown`, `text/csv`…). As aplicações que suportam recursos permitem que o usuário os escolha, por exemplo em um menu de anexos; o modo varia conforme a aplicação.

### Regras de segurança {#security-rules-1}

1. **Apenas caminhos relativos**; caminhos absolutos são recusados.
2. **Nada fora da pasta**: cada caminho é resolvido para a sua localização real — incluindo segmentos `..` e links simbólicos — e recusado se sair da pasta. Um link para uma pasta já visitada é ignorado, então um ciclo de links não consegue travar uma listagem.
3. **Nomes ocultos são invisíveis**: `.env`, `.git`, `.ssh`… se comportam como se não existissem, mesmo através de um link.
4. **Apenas texto**: só as extensões permitidas são oferecidas, e um arquivo cujos primeiros 8 KB contenham um byte zero (binário) é recusado.
5. **Limitado**: leituras, listagens, profundidade, correspondências de busca, bytes percorridos e nomes examinados (`maxExaminedEntries`, 50.000) são todos limitados; uma listagem ou busca que parou antes do fim indica `truncated: true`.
6. **Somente leitura**: nada é jamais gravado, movido ou apagado.
7. **Rastreado**: cada leitura de recurso é uma execução no log de eventos, com a URI, o tamanho e a impressão digital SHA-256 do que foi servido.
8. **Excluído significa excluído**: excluir uma pasta (`private`, `private/*`, `**/node_modules`) oculta tudo o que está dentro dela, seja na listagem, na busca, na leitura por caminho ou na leitura como recurso.
9. **Robusto**: uma subpasta que não pode ser lida é ignorada, e as mensagens de erro citam a pasta compartilhada, nunca o seu caminho absoluto.

### Arquivo completo {#complete-file-1}

Adaptado de [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (que serve esta documentação por padrão):

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

### O que ela não faz {#what-it-does-not-do-1}

- **Nenhuma escrita**, de nenhum tipo.
- **Nada de PDF, Word ou imagens**: apenas arquivos de texto. Converta os documentos para Markdown ou texto antes.
- **Apenas busca por substring**: nenhuma busca por significado ("semântica"), nenhuma classificação por relevância.
- **Nenhuma notificação de mudança**: os clientes veem os arquivos como eles estão no momento em que os listam.
- **A pasta não deve ser gravável por pessoas em quem você não confia**: os caminhos são verificados e só então o arquivo é aberto; alguém capaz de substituir uma pasta por um link exatamente nesse instante poderia, em teoria, passar.
- **Com `include`, as pastas continuam sendo listadas** mesmo quando não contêm nenhum arquivo correspondente (verificar exigiria ler cada subpasta).
- As leituras de recursos são rastreadas, mas não são verificadas pelas políticas de ferramentas: ofereça apenas pastas que você aceita compartilhar.

## Um banco de dados somente leitura {#a-read-only-database}

**O que faz.** Permite que o modelo explore um banco de dados — listar as tabelas, descrever uma, executar uma consulta `SELECT` — e **nunca o altere**. Funciona com **SQLite** (o `node:sqlite` integrado do Node.js 22.13+, ou `better-sqlite3`) e **PostgreSQL** (`pg`).

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

### Opções {#options-2}

| Opção de `databaseTools` | Padrão | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` ou `postgresReadOnly({ client })`, ou o seu próprio `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | Como o modelo ouve falar dele: "the shop database". |
| `prefix` | — | Prefixo dos nomes das ferramentas (`shop_query`), para servir vários bancos de dados. |
| `maxRows` | `100` (no máximo `1000`) | Linhas devolvidas por uma consulta; `truncated: true` indica que havia mais. |
| `maxTextLength` | `2000` | Caracteres mantidos por valor de texto. |
| `maxTables` | `500` | Tabelas listadas. |
| `maxSqlLength` | `20000` | SQL mais longo aceito. |

| Opção de `postgresReadOnly` | Padrão | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | O PostgreSQL interrompe qualquer consulta que demore mais. |
| `schemas` | todos, exceto os do sistema | Schemas **listados e descritos** por `list_tables` e `describe_table`. Ele não restringe o que `query` pode ler: isso é papel da role. |

Com `{ client }`, entregue ao adaptador um `pg.Client` **dedicado**: um que a sua aplicação não use para as próprias transações (um pool é recusado aí; passe-o como `{ pool }`).

`sqliteReadOnly(db)` não tem opções: abra o arquivo em modo somente leitura (`{ readOnly: true }` com `node:sqlite`, `{ readonly: true }` com better-sqlite3). Ele depende apenas de `prepare`, `exec` e dos métodos de statement que os dois drivers compartilham; a suíte de testes o executa em um banco de dados `node:sqlite` real, não no better-sqlite3.

### O que o modelo vê {#what-the-model-sees-2}

Três ferramentas: `list_tables`, `describe_table { table }` e `query { sql }`, descrita como *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."* Uma consulta devolve:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

Os valores são tornados legíveis à medida que as linhas chegam: inteiros muito grandes viram strings, datas viram strings ISO, dados binários viram uma nota como `<binary data, 3 bytes>`, textos longos são cortados, arrays mantêm 100 itens (`… 400 more items`). Quando o próprio banco de dados recusa a consulta ("no such column", "read-only", um timeout), o modelo recebe o motivo para poder corrigir o seu SQL; os erros de conexão e de servidor ficam do seu lado.

### Regras de segurança: quatro travas, não uma {#security-rules-four-locks-not-one}

Verificar que uma consulta "começa com SELECT" não basta: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` começa com `WITH` e apaga. Por isso, uma consulta precisa passar por quatro travas:

1. **A verificação do statement**: exatamente um statement (pontos e vírgulas dentro de strings, nomes entre aspas, comentários, aspas `$$` do PostgreSQL e strings de escape `E'…'` são compreendidos), começando com `SELECT`, `WITH` ou `VALUES`, sem parâmetros `$1`, com parênteses balanceados. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… são recusados.
2. **O próprio banco de dados recusa as escritas**:
   - SQLite: cada consulta é executada com `PRAGMA query_only = ON` (restaurado depois), e com better-sqlite3 um statement que escreve é recusado antes de ser executado;
   - PostgreSQL: cada consulta é executada na sua própria transação `BEGIN READ ONLY` — uma conexão que já está dentro de outra transação é detectada antes (`transaction_timestamp()` mais antigo que o statement) e recusada sem tocar nessa transação — com `SET LOCAL statement_timeout`, e sempre termina com `ROLLBACK` seguido de `SELECT pg_advisory_unlock_all()` (os advisory locks sobrevivem a um rollback; uma conexão que não consegue liberá-los não é reutilizada). A consulta é enviada como uma subconsulta com um parâmetro vinculado, então o servidor só aceita um statement. As transações nunca compartilham uma conexão ao mesmo tempo.
3. **Limites**: no máximo `maxRows` linhas são lidas (o SQLite nunca lê o resto; o PostgreSQL para no `LIMIT`), os valores são cortados em cópias curtas à medida que as linhas chegam (cada valor bruto ainda é carregado inteiro antes de ser cortado), as consultas no PostgreSQL têm timeout.
4. **Você**: abra os arquivos SQLite em modo somente leitura; conecte o PostgreSQL com uma role que só pode ler o que você quer mostrar — essa é a fronteira real, porque uma transação somente leitura não impede o que uma função poderia fazer fora do banco de dados (por exemplo, `dblink` ou uma extensão HTTP). Essa role ainda consegue ler o catálogo do sistema (`pg_catalog`) e chamar funções concedidas a `PUBLIC`; revogue as de extensões que alcançam o exterior (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;`, e similares):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### Arquivos completos {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite, cria um banco de dados de loja de demonstração quando você não fornece nenhum arquivo) e [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

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

### O que ela não faz {#what-it-does-not-do-2}

- **Nenhuma escrita**, por concepção. Para permitir que um modelo altere dados, escreva uma ferramenta dedicada a essa única alteração, com aprovação.
- **Nenhum filtro por tabela dentro das consultas**: uma consulta pode ler tudo o que a conexão pode ler. Use uma role (PostgreSQL) ou uma cópia do arquivo apenas com as tabelas certas (SQLite); exponha views em vez de tabelas brutas.
- **SQLite: a superfície de ataque é a consulta, não o arquivo.** As consultas são executadas dentro do processo do seu servidor, de forma síncrona, sem timeout e sem limite de memória: quem escreve o SQL — o modelo, ou quem o manipula — pode escrever uma consulta que nunca termina (um `WITH` recursivo) ou que monta valores enormes, e bloquear ou esgotar o servidor. As linhas são lidas uma de cada vez e cada valor é cortado em uma cópia curta à medida que chega, para que o resultado continue pequeno e os originais possam ser liberados — mas cada valor bruto é carregado inteiro primeiro, e nada limita o trabalho que o SQLite faz para produzir uma linha. Sirva o SQLite para você mesmo ou para pessoas em quem você confia; não o exponha via HTTP a clientes não confiáveis. Executar as consultas em uma worker thread que possa ser interrompida eliminaria essa limitação; isso ainda não foi feito.
- **As funções SQLite registradas na conexão podem ser chamadas** pelo SQL do modelo (`db.function(…)`): registre apenas funções inofensivas em uma conexão que você serve.
- **Nenhum parâmetro vinculado**: o modelo escreve os valores no SQL.
- Duas colunas com o mesmo nome em um resultado mantêm apenas a última: dê aliases a elas.
- Outros bancos de dados (MySQL, SQL Server…): implemente você mesmo a pequena interface `ReadOnlyDatabase`, e faça com que ela recuse as escritas por conta própria. `assertSingleQuery(sql, dialect)` só entende a sintaxe do SQLite e do PostgreSQL; o MySQL (escapes com barra invertida em todas as strings, comentários `#`) precisa da sua própria verificação.

## Um agente: o seu gêmeo de raciocínio {#an-agent-your-reasoning-twin}

**O que faz.** Expõe um agente inteiro como uma única ferramenta. O uso mais marcante: um [agente cognitivo com o seu perfil de pensador](./thinker-profiles), para que, a partir do Claude Desktop, qualquer pessoa possa perguntar *"o que o Nicolas pensaria de pagar pelo Jev?"* e receber uma resposta raciocinada **do jeito que o Nicolas raciocina**, com a sua justificativa e o que ainda está faltando.

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

Esta receita precisa de uma chave de modelo (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): o agente pensa com um modelo de linguagem.

### Passo 1 — capture como você raciocina {#step-1-—-capture-how-you-reason}

Explique alguns temas com suas próprias palavras, destile-os em um perfil uma vez e salve-o:

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

Veja [Raciocinar como uma pessoa específica](./thinker-profiles) para saber o que um perfil contém e como corrigi-lo ao longo do tempo.

### Passo 2 — sirva-o {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) carrega o perfil a partir de `PROFILE_FILE` (verificado em relação ao schema do perfil) ou usa um exemplo integrado, e serve `ask_nicolas`:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### O que o modelo vê e recebe de volta {#what-the-model-sees-and-gets-back}

A ferramenta recebe `problem` (a pergunta, até 4.000 caracteres) e um objeto `context` opcional (fatos e restrições, até 20.000 caracteres em JSON). Ela devolve a decisão, não o estado mental inteiro:

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

`decisionStatus` é `committed` (uma resposta firme), `provisional` (a melhor resposta até agora, com `missing`: o que não está estabelecido) ou `abstain`. O raciocínio completo fica no log de eventos sob o `runId`: `sdk.getMentalState(runId)` mostra cada hipótese e cada crítica. Quando uma execução falha, `error` diz apenas que ela não foi concluída e onde procurar (`exposeErrors: true` coloca a própria mensagem no resultado: ela pode conter detalhes do provedor).

### Opções {#options-3}

| Opção | Padrão | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | O nome da ferramenta. |
| `description` | genérica | Diga quando consultar este agente: o modelo decide a partir dela. |
| `metadata` | risco médio | Metadados de governança, mesclados campo a campo sobre o padrão; adicione `requiresApproval: true` para confirmar cada consulta. |
| `maxInputLength` | `4000` | Problema (ou mensagem) mais longo aceito. |
| `maxContextLength` | `20000` | `context` mais longo, como texto JSON. |
| `exposeErrors` | `false` | Colocar no resultado a mensagem de erro de uma execução que falhou. |

`governedAgentTool(agent, options)` faz o mesmo para um agente criado com `sdk.createAgent`: ela recebe `message` (e `context`) e devolve `{ runId, status, output, error }`.

### Bom saber {#good-to-know}

- **Leva tempo.** Uma execução cognitiva faz várias chamadas ao modelo: conte dezenas de segundos, às vezes minutos. Muitos clientes cancelam uma chamada depois de cerca de um minuto (o padrão do SDK TypeScript oficial é de 60 segundos; o Claude Code permite aumentá-lo com `MCP_TOOL_TIMEOUT`). Mantenha os `limits` pequenos para uso interativo, a menos que o seu cliente reinicie o timeout a cada [notificação de progresso](./mcp-deploy#progress-notifications): cada etapa do agente envia uma. **Quando o cliente desiste, a execução é interrompida** (tanto para agentes cognitivos quanto para governados) e registrada como cancelada: nenhuma outra chamada ao modelo é feita, e uma aprovação que o agente estava aguardando é cancelada.
- **Custa dinheiro**: cada consulta são várias chamadas ao modelo. Coloque um [orçamento](./mcp-deploy#governance-policies-budgets-approvals) nela e verifique `sdk.getRunCost(runId)`.
- **Ele imita um modo de raciocinar, não o que a pessoa sabe.** O gêmeo conhece o que está no perfil, na pergunta e no contexto — não a memória da pessoa. Trate as respostas dele como "como ela abordaria isto", e deixe a pessoa real corrigi-lo com `learnFromFeedback`.

## Várias fontes em um único servidor {#several-sources-in-one-server}

Combine as fontes com prefixos para que os nomes nunca colidam:

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

Duas ferramentas com o mesmo nome são recusadas na inicialização, com uma mensagem que diz qual delas.

## As mesmas ferramentas nos seus próprios agentes {#the-same-tools-in-your-own-agents}

As fontes são simples definições de ferramentas: os seus agentes podem usá-las sem MCP.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

As mesmas regras se aplicam: as operações de escrita que você listou aguardam aprovação, e cada chamada é verificada e registrada.

Próximo: [implantar, proteger e resolver problemas](./mcp-deploy).
