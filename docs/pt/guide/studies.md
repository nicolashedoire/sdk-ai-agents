# Estudos

Um estudo é um pesquisador de IA. Ele aplica um único método — **entender um objeto e depois redesenhá-lo com os meios de hoje** — e entrega a você um dossiê: o que o objeto faz, como ele funciona, por que foi construído assim, o que mudou desde então, várias novas concepções e os experimentos que permitiriam decidir entre elas. Ele não constrói nada, não executa nada e não mede nada: ele investiga e propõe.

::: tip Em palavras simples
Escolha um objeto: um navegador Web, um motor de banco de dados, um quadro de horários de trens. O estudo o observa, o desmonta, procura os motivos por trás das suas escolhas antigas, pesquisa os trabalhos científicos e as técnicas que surgiram desde então e cruza as duas coisas para imaginar outra organização. Ele mira uma mudança de princípio que torna possível algo novo, não uma versão mais rápida da mesma coisa. Cada afirmação diz se ela é **estabelecida** por uma fonte que o estudo realmente encontrou, uma **hipótese** ou uma **novidade** ainda a verificar em relação aos trabalhos existentes. E, o tempo todo, vários mecanismos o mantêm no objetivo que você lhe deu, porque os modelos de linguagem tendem a se desviar à medida que as instruções se acumulam. Cada termo é explicado em [Termos-chave em palavras simples](./glossary#studies).
:::

```ts
const study = sdk.createStudy({
  name: 'browser',
  object: 'The Web browser, from 1990 to 2026',
  objective: 'A browser design whose every choice follows from the investigation',
  leads: ['vectorisation', 'weights', 'ReLU'], // your leads: examples to verify, not truths
  analogues: ['Bitcoin'],                      // breakthroughs by assembly to deconstruct
  sources: ['brave_web_search'],               // SDK tools the study searches with
});

const result = await study.run();
result.status;   // 'completed' | 'stopped' | 'failed' | 'cancelled'
result.report;   // the structured report
result.markdown; // the same, as a readable dossier
```

## O que é um estudo {#what-a-study-is}

Um estudo aplica um método em sete passagens: *entender um objeto e depois redesenhá-lo com os conhecimentos e as técnicas de hoje*. A sua pergunta norteadora é: **se tivéssemos de atender às necessidades de hoje com os conhecimentos e as técnicas disponíveis hoje, como organizaríamos este objeto?** A não ser que você forneça a sua própria `question`, o estudo a faz no idioma dele, seguida do alvo descrito em [O alvo: uma nova capacidade](#the-aim-a-new-capability).

Um estudo não é um agente. Ele não tem ferramentas com as quais agir, apenas **fontes** para pesquisar (veja [Pesquisar por meio das suas fontes](#research-through-your-sources)), e o que ele produz é um relatório, não uma ação. Ele é criado com `sdk.createStudy()`, a partir de uma **carta** — o objeto, o objetivo, as suas necessidades e as suas pistas — que nunca muda depois.

A última passagem dele concebe experimentos; ela não os executa. Depois de executar um, você registra o que ele revelou na ficha de mecanismo correspondente (veja [A ficha de mecanismo](#the-mechanism-card)).

## As sete passagens {#the-seven-passages}

Uma execução percorre as sete passagens do método, em ordem. Cada uma produz itens de alguns tipos (as suas **coleções**), e cada item recebe um id que nunca é reutilizado: `O1`, `P2`, `A1`…

| # | Passagem | O que faz | O que guarda |
| --- | --- | --- | --- |
| 1 | `observe` | Olha os comportamentos, os usos, as variações e as falhas do objeto, cada um com as suas condições: quando, onde, para quem, com o quê. Descreve; ainda não explica | `observations` (`O`) |
| 2 | `decompose` | Mapeia as peças: a sua função, entradas, saídas e relações, descendo dentro de uma peça enquanto o funcionamento dela continua opaco, com as incógnitas de cada uma. Define a **cadeia completa** do objeto, etapa por etapa (para um navegador: receber, entender, executar, exibir, interagir) | `pieces` (`P`), `chain` (`C`) |
| 3 | `historicalChoices` | Pesquisa os motivos documentados das escolhas da sua época: hardware, ferramentas, usos, conhecimentos, custos, compatibilidade. Um motivo plausível sem documento continua sendo uma hipótese | `historicalChoices` (`H`) |
| 4 | `changes` | Pesquisa o que surgiu ou se tornou utilizável desde então, no domínio do objeto e em outros, cada avanço com o seu mecanismo, data, evidências, condições de uso e disponibilidade. Dá um veredito sobre cada uma das suas pistas, procura outras ferramentas matemáticas e técnicas além delas, lista as melhores realizações atuais (a referência do que é "melhor") e desconstrói as rupturas por montagem | `advances` (`V`), `leadVerdicts` (`L`), `independentLeads` (`I`), `references` (`R`), `analogues` (`B`) |
| 5 | `cross` | Cruza passado e presente: quais restrições permanecem, quais se enfraqueceram, quais exigências são novas. Deduz as decisões que se tornaram revisáveis, propõe combinações A + B (o que A permite a B fazer, o que elas precisam trocar, quanto isso custa em conversões e sincronização) e nomeia novas capacidades candidatas | `constraints` (`K`), `revisableDecisions` (`D`), `combinations` (`X`), `capabilities` (`Y`) |
| 6 | `design` | Concebe pelo menos duas arquiteturas, pelo menos uma delas visando uma nova capacidade, cada uma cobrindo a cadeia completa, com o seu mecanismo, condições, benefício, custo adicional, um contraexemplo possível e as suas predições. Dá os três estados de cada peça principal e diz o que é novo e o que não é. Depois, pesquisa o estado da técnica das novidades | `architectures` (`A`), `threeStates` (`T`), `noveltyClaims` (`N`) |
| 7 | `confront` | Concebe os experimentos que permitiriam decidir entre as arquiteturas e testar a cadeia completa: protocolo, medidas, critérios e o resultado esperado para cada arquitetura. Preenche uma ficha de mecanismo para cada mecanismo principal | `experiments` (`E`), `cards` (`M`) |

Os resultados que as pesquisas devolvem também são numerados: `S1`, `S2`… Cada passagem recebe os itens das passagens anteriores de que precisa, como registros JSON compactos.

### Um ciclo, não uma linha {#a-loop-not-a-line}

```mermaid
flowchart LR
  O["1 observe"] --> D["2 decompose"] --> H["3 historicalChoices"] --> C["4 changes"]
  C --> X["5 cross"] --> A["6 design"] --> F["7 confront"]
  A -.->|reabre| D
  X -.->|reabre| C
```

As passagens formam um ciclo. Quando uma incógnita bloqueia uma passagem — a concepção precisa saber como uma peça realmente funciona, por exemplo —, ela pode pedir para **reabrir** uma passagem anterior sobre esse ponto. A passagem anterior é executada de novo com esse foco e acrescenta itens aos que já tinha, e depois a passagem que pediu é executada de novo com eles. `limits.maxLoops` limita as reaberturas de uma execução (1 por padrão, 0 para não permitir nenhuma); uma passagem que foi ela mesma reaberta não pode reabrir outra.

### Três estados de cada peça {#three-states-of-each-piece}

A concepção dá a cada peça principal três estados, mantidos separados no relatório (`threeStates`):

- **o objeto na sua época** (`atItsTime`): como a peça foi construída, e em quais condições;
- **as melhores realizações atuais pertinentes** (`currentBest`): a referência com a qual uma melhoria é medida;
- **a nossa proposta** (`proposal`): o que a arquitetura faz com ela.

A idade de uma escolha não a torna errada, e uma técnica recente pode tornar desnecessária uma complicação do passado: os três estados mostram qual condição mudou, qual mecanismo se tornou possível e o que isso faz com o conjunto.

### A ficha de mecanismo {#the-mechanism-card}

A última passagem preenche uma ficha para cada mecanismo principal. Ela tem onze campos: o estudo preenche os nove primeiros, e os dois últimos ficam vazios até que você tenha executado um experimento.

| # | Campo | A pergunta a que responde |
| --- | --- | --- |
| 1 | `observation` | O que o sistema faz, em quais condições? |
| 2 | `mechanism` | Quais peças e relações o explicam? |
| 3 | `unknown` | O que ainda falta abrir, medir ou documentar? |
| 4 | `historicalChoice` | Por que esta organização foi escolhida, com base em quais evidências? |
| 5 | `evolution` | O que mudou desde então, com quais fontes e datas? |
| 6 | `newPossibility` | Qual escolha se torna revisável graças a essa mudança? |
| 7 | `proposedCombination` | Como as técnicas se encaixam, concretamente? |
| 8 | `prediction` | Que efeito esperamos, em quais condições? |
| 9 | `experiment` | Como decidimos entre as propostas e verificamos o conjunto? |
| 10 | `resultAndError` | O que encontramos, e onde a explicação falha? |
| 11 | `conclusionAndMemory` | O que mantemos, o que mudamos, onde este mecanismo poderia ser reutilizado? |

```ts
await study.recordResult('M1', {
  result: 'Layout reuse cut the time to redraw by 40% on the reference pages',
  error: 'No gain on pages whose styles change on every frame',
  conclusion: 'Keep immutable layout results; look again at style invalidation',
});
```

`recordResult(cardId, { result, error?, conclusion? })` preenche os campos 10 e 11 da ficha e registra um evento `study.result_recorded` na execução que escreveu a ficha. Ele lança um `ValidationError` para uma ficha desconhecida ou um `result` vazio. `study.report()` devolve o relatório com a ficha preenchida.

## O alvo: uma nova capacidade {#the-aim-a-new-capability}

Um estudo não procura uma versão mais rápida do mesmo objeto. Ele procura **uma mudança de princípio que torne possível algo difícil hoje, não apenas algo mais rápido**.

### Capacidade, princípio, mecanismo {#capability-principle-mechanism}

Cada arquitetura enuncia três coisas:

- **a capacidade** (`capability`): o que se torna possível, para quem, e a restrição de hoje que ela remove (`what`, `forWhom`, `liftedConstraint`);
- **a mudança de princípio** (`principleChange`): qual princípio muda — `representation`, `distribution` (do trabalho), `responsibility`, `trust`, `verification` ou `other` — e como;
- **o mecanismo** (`mechanism`): como a montagem de técnicas produz a capacidade.

Cada arquitetura declara o seu `kind`: `capability`, ou `improvement` quando ela apenas torna algo mais rápido ou mais barato. Uma arquitetura que não declara nenhum tipo é uma melhoria, a afirmação mais fraca. Uma capacidade precisa enunciar a sua mudança de princípio e a sua montagem, senão o schema a recusa (veja [Cada item diz a que serve](#every-item-says-what-it-serves)).

Você pode nomear na carta a capacidade que visa (`capability`); todo prompt passa então a trazê-la. Sem ela, a passagem `cross` precisa propor pelo menos uma candidata (`capabilities`, `Y1`…), dizendo para quem ela é, por que é difícil hoje e qual princípio mudaria.

O guardião (veja [O guardião](#the-guardian)) também julga cada arquitetura: uma capacidade que ele considera apenas mais rápida ou mais barata se torna uma `improvement`, com `declaredKind: 'capability'` para mostrar o que o modelo afirmou. Uma concepção que fica sem nenhuma capacidade está fora do objetivo como um todo: ela é anotada no registro de deriva e refeita uma vez; se a nova versão ainda não tiver nenhuma, o relatório diz isso (aviso `noCapability`). No relatório, **as capacidades vêm primeiro, as melhorias depois**.

### A novidade está na montagem {#novelty-lies-in-the-assembly}

As rupturas raramente vêm de uma técnica sem precedente. Com mais frequência, elas montam técnicas anteriores de um modo que ninguém tinha feito, e essa montagem abre uma capacidade. Um estudo raciocina da mesma forma:

- uma arquitetura lista os seus **componentes** (`components`): técnicas anteriores, cada uma com o seu enunciado, data e fontes, cada uma com um status verificado como o de qualquer afirmação;
- a sua **montagem** (`assembly`) diz o que cada componente dá aos outros, o que eles trocam e quanto isso custa;
- um componente **nunca é uma novidade**: um componente apresentado como novo é `established` se um resultado que o estudo recuperou o documenta, e uma `hypothesis` caso contrário, com o motivo;
- o status da própria arquitetura é o da sua montagem e da sua capacidade. Quando ela afirma uma novidade, o seu estado da técnica é pesquisado **como uma combinação**: o estudo procura trabalhos que já juntam os mesmos componentes para produzir a mesma capacidade, não cada peça separadamente.

O dossiê mostra o caminho de cada arquitetura: componentes (com os seus status) → montagem (com o seu status) → capacidade.

### Rupturas por montagem {#breakthroughs-by-assembly}

A passagem `changes` também desconstrói rupturas do passado, em qualquer domínio, que vieram da montagem de técnicas anteriores (`analogues`, `B1`…). O Bitcoin é o exemplo que o método dá: assinaturas de chave pública, cadeias de hashes e carimbo de tempo, prova de trabalho, árvores de Merkle e uma rede peer-to-peer já existiam antes; montados, eles deram um livro-razão compartilhado sem um terceiro de confiança.

Para cada ruptura, o estudo registra as técnicas anteriores que ela montou (pelo menos duas, com as suas datas), a restrição que ela removeu, a capacidade que se abriu e o **padrão** da montagem. As passagens `cross` e `design` recebem esses padrões e podem reutilizá-los. Cada ruptura é uma afirmação como qualquer outra: `established` somente com um resultado que o estudo recuperou.

As rupturas que você nomeia em `analogues` precisam, cada uma, ser desconstruídas. Uma resposta que esquece uma delas é devolvida uma vez; se ainda faltar alguma, o relatório a lista em `undeconstructedAnalogues`, com o aviso `analoguesNotDeconstructed`. O estudo pode acrescentar outras rupturas que tenha encontrado.

## Estabelecida, hipótese, novidade {#established-hypothesis-novelty}

Cada item de um estudo é uma **afirmação**: um enunciado com um status, os resultados que ele cita (`sources`) e aquilo a que ele serve no objetivo. O modelo propõe um status; **o código o verifica**, diga o modelo o que disser.

| Status | O que exige | O que o estudo faz caso contrário |
| --- | --- | --- |
| `established` | Cita pelo menos um resultado **que este estudo recuperou** das suas fontes | Ela se torna uma `hypothesis`. `declaredStatus` guarda o status que o modelo deu e `statusReason` diz por quê; os ids que ela citou e que o estudo nunca recuperou são mantidos à parte em `unretrievedSources` e não sustentam nada |
| `hypothesis` | Nada: plausível, não documentada aqui | — |
| `novelty` | Uma ideia que ainda não existe, e uma **pesquisa do seu estado da técnica** | Ela continua sendo uma novidade a verificar (`toVerify: true`), com o motivo, até que o seu estado da técnica tenha sido pesquisado e avaliado |

Um status que o estudo não consegue ler conta como `hypothesis`, nunca como um status mais forte. **Sem fontes, nada pode ser estabelecido**: toda afirmação é no máximo uma hipótese, nenhuma novidade pode ser verificada, e o relatório diz isso no seu primeiro aviso (`noSources`).

### Estado da técnica {#prior-art}

Depois da concepção, o estudo pesquisa o estado da técnica de cada novidade ainda a verificar, tanto as da concepção quanto as das passagens anteriores. O modelo escolhe as pesquisas (para uma arquitetura: a combinação dos seus componentes e a capacidade), o estudo as executa, e depois uma chamada separada nomeia o trabalho existente mais próximo entre os resultados e dá um veredito:

- `novel` ou `partlyNovel`: a afirmação continua sendo uma novidade, não mais a verificar, com o seu `priorArt` (`closest`, `sources`, `verdict`);
- `exists`: a ideia já foi feita; a afirmação se torna uma `hypothesis`, e `statusReason` nomeia o trabalho mais próximo.

Uma novidade cujo estado da técnica não pôde ser pesquisado ou avaliado — sem fonte, com o orçamento de pesquisas esgotado, sem nenhuma pesquisa pedida para ela, ou uma novidade afirmada depois da concepção — continua a verificar, e diz por quê. O relatório as conta (aviso `noveltiesToVerify`).

## Pesquisar por meio das suas fontes {#research-through-your-sources}

O SDK não tem pesquisa na Web embutida. Um estudo pesquisa com **as ferramentas que você lhe dá** como `sources`: os nomes de ferramentas do SDK, tipicamente as ferramentas de pesquisa de um servidor MCP importado com [`connectMcpServer`](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) e definidas com `sdk.defineTool`:

```ts
import { connectMcpServer } from '@sdk-ai-agents/core/mcp';

const search = await connectMcpServer({
  name: 'search',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY ?? '' },
  },
  metadata: { readOnly: true },
});
// Define the tools first: the study checks its sources when it is created.
const sources = search.tools.map((tool) => sdk.defineTool(tool).name);

const study = sdk.createStudy({ name: 'browser', object, objective, sources });
```

- **Verificadas quando o estudo é criado.** `createStudy` lança um `ValidationError` quando uma fonte não é uma ferramenta definida, ou não aceita nenhuma consulta em texto. A consulta vai no parâmetro `query` da ferramenta, ou em outro nome comum (`q`, `search`, `keywords`…), senão no seu único parâmetro de texto obrigatório, senão no seu primeiro parâmetro de texto.
- **Governadas.** Cada pesquisa passa por `sdk.executeTool`, sob o `id` do estudo como id de agente e com as fontes como as suas únicas ferramentas permitidas: allowlists, políticas, orçamentos, aprovações, novas tentativas e traces se aplicam como a qualquer chamada de ferramenta, e os eventos da ferramenta (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) são registrados na execução do estudo. Uma pesquisa que falha, ou que uma política recusa, é registrada com o seu erro, e o estudo continua.
- **Quando ele pesquisa.** Antes de `historicalChoices` e antes de `changes`, o modelo pede as pesquisas de que a passagem precisa — para `changes`: verificar cada uma das suas pistas, encontrar outras ferramentas além delas, encontrar as melhores realizações atuais e documentar as rupturas por montagem. Depois de `design`, ele pesquisa o estado da técnica das novidades. No máximo seis pesquisas são pedidas de uma vez.
- **Resultados numerados.** O estudo lê os resultados qualquer que seja o formato deles (uma lista, um objeto que contém uma lista, como `results` ou `items`, texto JSON, partes de texto MCP, texto simples), guarda um título, uma URL ou outro localizador, uma data quando houver e um trecho, e os numera uma única vez para todo o estudo: o mesmo resultado encontrado de novo, pelo seu localizador, mantém o seu id. Ele guarda `limits.maxResultsPerSearch` resultados de cada pesquisa (5 por padrão).
- **Limitadas.** `limits.maxSearches` (20 por execução por padrão) limita as pesquisas. Depois que esse número se esgota, a execução **não para**: ela continua sem pesquisar, as afirmações que precisavam de uma fonte continuam sendo hipóteses, as novidades continuam a verificar, e o relatório diz quais passagens não puderam pesquisar (aviso `searchesSkipped`).

As suas pistas são exemplos a verificar, não verdades: `changes` precisa dar um veredito a cada uma — `relevant`, `partlyRelevant` ou `notRelevant`, com os motivos —, e uma resposta que esquece uma delas é devolvida uma vez. Uma pista ainda sem veredito é listada em `unverifiedLeads` (aviso `leadsNotVerified`). As ferramentas que o estudo encontra por conta própria são `independentLeads`.

## Manter-se no objetivo {#staying-on-the-objective}

Os modelos de linguagem ficam à deriva. Cada vez que uma instrução é acrescentada, o assunto se afasta um pouco mais e o modelo esquece o que tinha de fazer, até que seja preciso lembrá-lo disso toda vez. Um estudo torna a deriva **estruturalmente difícil**, e **visível** quando ela acontece mesmo assim.

### Uma carta congelada {#a-frozen-charter}

A carta contém o objeto, a pergunta norteadora, o objetivo, as necessidades, as suas pistas, o que está fora do escopo (`scope.exclude`), a capacidade visada e as rupturas a desconstruir. Ela é congelada quando o estudo é criado — `study.charter` não pode ser alterada, nem mesmo por acidente — e o seu hash é calculado com SHA-256 (`study.charterHash`). O hash é registrado quando cada execução começa (`study.started`) e em cada emenda, para que você possa provar que todas as execuções trabalharam sobre a mesma carta. O `name` do estudo não faz parte dela: dois estudos com a mesma carta têm o mesmo hash. **Um novo objetivo é um novo estudo.**

### Um prompt reconstruído a cada chamada {#a-prompt-rebuilt-at-each-call}

Um estudo nunca mantém uma conversa. Cada chamada ao modelo é construída a partir de nada além de:

- a carta, e as emendas aceitas abaixo dela;
- a tarefa da passagem;
- os registros compactos das passagens anteriores de que ela precisa (JSON, não transcrições);
- os resultados de pesquisa que ela pode citar.

Nenhuma resposta anterior chega a um prompt. Até a correção de uma resposta que não pôde ser usada é reconstruída a partir da carta: ela diz por que a resposta foi recusada, nunca o que ela era. Nada se acumula de uma chamada para outra, então nada dilui o objetivo.

### O objetivo nas duas pontas {#the-objective-at-both-ends}

Todo prompt começa com a carta e termina com um lembrete cuja última linha é o objetivo:

```text
STUDY CHARTER (immutable, sha256 3f5a9c0e1b2d4f67)
Object: The Web browser, from 1990 to 2026
Question: If we had to meet today’s needs with the knowledge and techniques available today, how would we organise this object? Which change of principle would make possible something difficult today, not only faster?
Objective: A browser design whose every choice follows from the investigation
…
Accepted amendments (subordinate to the objective):
1. Examine memory safety too

(the task of the passage, the records of earlier passages, the results it may cite)

REMINDER
This step must produce: at least two architectures, at least one aiming at a new capability, …
Out of scope: anything that serves neither the objective nor the needs.
Write every text value in English (en). Reply with the JSON object only.
Objective: A browser design whose every choice follows from the investigation
```

A carta, incluindo o objetivo, é a primeira coisa que o modelo lê, e o objetivo é a última.

### Cada item diz a que serve {#every-item-says-what-it-serves}

Todo item precisa trazer `servesObjective`: em uma frase, qual parte do objetivo ou qual necessidade ele atende. Um item sem ele é **recusado pelo schema** antes mesmo que o guardião o veja, e anotado no registro de deriva (`by: 'schema'`). Um item que não consegue dizer a que serve costuma ser um item que não serve para nada.

### O guardião {#the-guardian}

Depois de cada passagem, uma chamada separada — **o guardião** — vê apenas a carta, as emendas aceitas e os itens dessa passagem: nem a tarefa, nem os registros anteriores, nem as pesquisas. Ele roda com temperatura 0 e julga cada item: no objetivo ou não, e por quê. Para a concepção, ele também julga se cada arquitetura abre uma nova capacidade (veja [Capacidade, princípio, mecanismo](#capability-principle-mechanism)).

- Um item fora do objetivo é removido e anotado no **registro de deriva** (`by: 'guardian'`), com o motivo, e registrado como um evento `study.drift_rejected`.
- Quando os itens rejeitados (pelo guardião ou pelo schema) passam de uma certa parcela do que a passagem produziu — `driftThreshold`, um terço por padrão —, a passagem é **refeita uma vez**, sabendo quais itens foram rejeitados e por quê. Os itens da passagem refeita substituem os da primeira tentativa.
- O relatório guarda cada rejeição (`driftLog`) e conta, em `stats`, as rejeições e as passagens refeitas.

### Emendas {#amendments}

Você pode acrescentar uma instrução depois que o estudo foi criado. Ela nunca entra sem ser notada: o guardião a classifica em relação à carta, em uma execução própria.

```ts
const amendment = await study.amend('Examine memory safety too');
amendment.verdict;  // 'refines' | 'conflicts' | 'changesObjective' | 'unclassified'
amendment.accepted; // true only when it refines the objective
amendment.number;   // 1, 2… for an accepted amendment
amendment.reason;   // why
```

| Veredito | Significado | Resultado |
| --- | --- | --- |
| `refines` | Ela detalha ou restringe o trabalho, ou acrescenta uma necessidade, dentro do objetivo e do escopo | Aceita, numerada e mostrada abaixo da carta em todos os prompts seguintes — incluindo os de uma execução em andamento |
| `conflicts` | Ela contradiz a carta, o escopo ou uma emenda aceita | Recusada, com o motivo; ela nunca chega a um prompt |
| `changesObjective` | Ela muda o objeto ou o objetivo | Recusada: um novo objetivo é um novo estudo, criado com `sdk.createStudy` |
| `unclassified` | A classificação dela falhou | Recusada: o objetivo vem primeiro |

As emendas aceitas e recusadas são registradas (`study.amendment_accepted`, `study.amendment_refused`) e listadas em `study.amendments` e no relatório. As instruções nunca se acumulam em silêncio: cada uma é numerada, subordinada ao objetivo e visível.

### Por que isso funciona {#why-this-works}

A deriva vem de um contexto que cresce: respostas anteriores, instruções empilhadas e discussões paralelas acabam pesando mais que o objetivo. Um estudo elimina esse crescimento. O modelo nunca relê as próprias respostas anteriores, então não pode ser arrastado pela própria deriva. As instruções não se acumulam: só existem emendas aceitas, cada uma numerada e subordinada a uma carta que não pode mudar. A carta abre cada prompt e o objetivo o fecha, onde um modelo presta mais atenção. Todo item precisa se justificar em relação ao objetivo, o que torna fácil identificar um item que se desviou. E um juiz com uma visão estreita — a carta e os itens, nada mais — pega o que ainda escapa, enquanto o registro de deriva mostra a você o que ele removeu e por quê.

Nada disso torna a deriva impossível: o guardião também é um modelo, e pode errar nos dois sentidos. Isso torna a deriva improvável, limitada (cada passagem é refeita no máximo uma vez) e auditável.

## Limites, custos e orçamentos {#limits-costs-and-budgets}

| Limite | Padrão | Quando é atingido |
| --- | --- | --- |
| `maxModelCalls` | 60 | A execução para: status `stopped`, `stoppedBy: 'maxModelCalls'`. Ele conta todas as chamadas da execução: passagens, pedidos de pesquisa, verificações do guardião, verificações do estado da técnica, correções |
| `timeoutMs` | 20 minutos | A execução é interrompida, e uma chamada em andamento recebe o sinal de cancelamento: `stopped`, `stoppedBy: 'timeoutMs'` |
| `maxSearches` | 20 | A execução continua sem pesquisar (veja [Pesquisar por meio das suas fontes](#research-through-your-sources)) |
| `maxLoops` | 1 | Nenhuma outra reabertura é oferecida |
| `maxResultsPerSearch` | 5 | Os outros resultados de uma pesquisa são descartados |

Os limites se aplicam a cada execução. Outras configurações: `driftThreshold` (1/3), `temperature` das passagens e dos pedidos de pesquisa (0,4; o guardião, as emendas e a verificação do estado da técnica rodam a 0), `maxTokens`, `model` (o padrão do provedor quando omitido) e `llmProvider` (um provedor para este estudo em vez do provedor do SDK). Uma configuração fora do intervalo permitido lança um `ValidationError` quando o estudo é criado.

Uma execução que para **guarda tudo o que fez**: as passagens já feitas, os itens da passagem em andamento (os que o guardião ainda não tinha julgado são marcados como `unchecked`, aviso `uncheckedItems`), e um relatório e um dossiê que dizem o que não foi executado.

Uma execução sem correções nem passagens refeitas faz 14 chamadas ao modelo sem fontes — cada passagem e a sua verificação pelo guardião — e até 18 com fontes: as pesquisas pedidas antes de `historicalChoices` e de `changes`, e a pesquisa do estado da técnica das novidades (as suas consultas, depois a sua verificação). Cada correção acrescenta uma chamada, cada passagem refeita pelo menos duas (a passagem e a sua verificação de novo), cada reabertura pelo menos quatro (a passagem reaberta e a que pediu, cada uma com a sua verificação).

### Custos e orçamentos {#costs-and-budgets}

Cada chamada ao modelo de um estudo é registrada como um evento `study.model_called`, com o seu `model`, `requestedModel` e `usage` — um evento para uma chamada e a sua correção —, e uma resposta que um provedor descartou, como um evento `provider.answer_discarded`. Elas contam como qualquer outra chamada ao modelo:

- em `sdk.getRunCost(result.runId)`, e uma emenda na sua própria execução: `sdk.getRunCost(amendment.runId)` (veja [Custos de API](./costs));
- nos orçamentos por período, sob o `id` do estudo: `sdk.getBudgetUsage({ agentId: study.id, period: 'all' })` dá os tokens, o custo e as chamadas de ferramenta de todas as suas execuções.

As políticas de orçamento e de timeout do SDK (`defaultPolicies`, `defineGlobalPolicy`) são verificadas **antes de cada passagem**, como as de um agente cognitivo antes de cada etapa (veja [Limites e políticas](./cognitive-agents#limits-and-policies)): `maxSteps` conta as passagens já executadas, `maxTokens` os tokens das chamadas ao modelo da execução, `maxDuration` o tempo desde o início da execução, e um `budgetLimit` com `maxTokens` ou `maxCost` o seu orçamento por período. Uma política que recusa registra `policy.violated` com a `passage`, e a execução para: `stopped`, `stoppedBy: 'policy'`. As pesquisas, como chamadas de ferramenta, também passam pelas políticas.

## Execuções, retomada e cancelamento {#runs-resume-and-cancellation}

| Status | Quando | Últimos eventos |
| --- | --- | --- |
| `completed` | Todas as passagens foram executadas | `study.completed`, `run.completed` |
| `stopped` | Um limite ou uma política encerrou a execução (`stoppedBy`) | `study.failed`, `run.failed` |
| `failed` | Um erro a encerrou, como uma resposta que não pôde ser usada mesmo depois da sua correção, ou uma concepção com menos de duas arquiteturas válidas (`error`) | `study.failed`, `run.failed` |
| `cancelled` | O seu `signal` foi abortado | `study.failed`, `run.cancelled` |

```ts
const controller = new AbortController();
const first = await study.run({ signal: controller.signal });

// Later: resume at the first passage not complete, with what was done kept.
const second = await study.run();

// Or run every passage again.
const fresh = await study.run({ restart: true });
```

- **Retomada.** `run()` começa na primeira passagem que não está completa, então uma execução parada, com falha ou cancelada pode ser retomada chamando `run()` de novo. As passagens já completas são mantidas; `study.started` registra onde a execução foi retomada (`resumeAt`). `restart: true` executa todas as passagens de novo (os ids continuam de onde estavam: `O3` vem depois de `O2`).
- **Uma execução por vez.** Um segundo `run()` enquanto uma execução está em andamento lança um `ValidationError`. `amend()` pode ser chamado durante uma execução.
- **Em memória.** O estado de um estudo vive no seu objeto `Study`, e o seu `id` muda de um processo para outro: a retomada funciona sobre o mesmo objeto. Os eventos registram os itens de cada passagem, cada pesquisa e cada veredito para auditoria, mas o SDK não reconstrói um estudo a partir deles.
- **Relatório.** `result.report` é uma cópia feita quando a execução terminou; `study.report()` devolve o relatório tal como está, com os resultados registrados desde então.

### Eventos em tempo real {#live-events}

`run({ onEvent })` chama o seu listener com cada evento da execução, em ordem, assim que o armazenamento de eventos o aceita, exatamente como `agent.run` faz (veja [Progresso em tempo real](./observability#live-progress)). `run()` retorna quando o listener tiver sido concluído para cada evento, ou antes, quando a execução foi cancelada ou esgotou o seu tempo.

```ts
const result = await study.run({
  onEvent: (event) => {
    if (event.type === 'study.passage_started') console.log(`→ ${event.data.passage}`);
    if (event.type === 'study.drift_rejected') console.log(`  off the objective: ${event.data.reason}`);
  },
});

// Every run of the study, amendments included: its events carry its id as agentId.
const unsubscribe = sdk.subscribe(listener, { agentId: study.id });
```

Um estudo registra onze tipos de evento: `study.started`, `study.passage_started`, `study.passage_completed`, `study.search`, `study.model_called`, `study.drift_rejected`, `study.amendment_accepted`, `study.amendment_refused`, `study.result_recorded`, `study.completed` e `study.failed`. O [catálogo de eventos](../reference/events#studies) dá os dados deles.

## Um exemplo completo {#a-complete-example}

`examples/study.ts` estuda o navegador Web de 1990 a 2026, em francês. Ele dá três pistas a verificar — vetorização, pesos (`poids`) e ReLU, exemplos que nada indica que se apliquem a um navegador —, não nomeia nenhuma capacidade, de modo que o estudo propõe candidatas, e pede a desconstrução do Bitcoin como uma ruptura por montagem. O núcleo dele, com o servidor de pesquisa Brave como fonte:

```ts
import { writeFileSync } from 'node:fs';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { connectMcpServer } from '@sdk-ai-agents/core/mcp';

const eventStore = new FileEventStore('./events');
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore,
  // Illustrative prices: use your provider's current prices or your contract.
  pricing: { 'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 } },
});

// The study searches only with the tools you give it, run through the governed pipeline.
const search = await connectMcpServer({
  name: 'search',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: process.env.BRAVE_API_KEY ?? '' },
  },
  metadata: { readOnly: true },
});
const sources = search.tools.map((tool) => sdk.defineTool(tool).name);

const study = sdk.createStudy({
  name: 'navigateur',
  object: 'Le navigateur Web, de 1990 à 2026',
  objective: "Une conception de navigateur dont chaque choix découle de l'enquête",
  needs: ['interactions', 'accessibilité', 'compatibilité attendue avec le Web existant'],
  leads: ['vectorisation', 'poids', 'ReLU'],
  // No capability named: the study proposes candidates (set `capability` to aim at one).
  analogues: ['Bitcoin'],
  sources,
  model: 'gpt-4o',
  language: 'fr',
  limits: { maxModelCalls: 60, maxSearches: 20, timeoutMs: 20 * 60_000 },
});

const result = await study.run({
  onEvent: (event) => {
    if (event.type === 'study.passage_started') console.log(`→ ${event.data.passage}`);
    if (event.type === 'study.search') console.log(`  search: ${event.data.query}`);
  },
});

writeFileSync('study-navigateur.md', result.markdown);
const { stats } = result.report;
console.log(`${result.status}: ${stats.byStatus.established} established, ${stats.byStatus.hypothesis} hypotheses`);
// Capabilities first, then improvements (only faster or cheaper).
for (const { id, kind, name, capability } of result.report.architectures) {
  console.log(`${id} [${kind}] ${name}: ${capability.what}`);
}
console.log(await sdk.getRunCost(result.runId));

await search.close();
await eventStore.destroy();
```

O próprio exemplo aceita o comando de qualquer servidor de pesquisa MCP: execute-o com `OPENAI_API_KEY=… SEARCH_MCP="npx -y @modelcontextprotocol/server-brave-search" BRAVE_API_KEY=… npm run example:study` (`SEARCH_TOOLS` escolhe algumas das ferramentas do servidor, `MODEL` o modelo). Ele escreve o dossiê em `examples/study-navigateur.md`. Sem `SEARCH_MCP`, ele roda sem fontes: tudo continua sendo hipótese, e o dossiê diz isso em primeiro lugar.

O que esperar do dossiê:

- **as pistas julgadas**: vetorização, pesos e ReLU recebem cada uma um veredito com os seus motivos, e o estudo lista outras ferramentas que encontrou além delas;
- **o Bitcoin desconstruído**: os seus componentes anteriores e as suas datas, a restrição que ele removeu (um terceiro de confiança), a capacidade que se abriu e o padrão de montagem, reutilizado pelo cruzamento e pela concepção;
- **capacidades candidatas** no cruzamento, depois pelo menos duas arquiteturas de navegador, as capacidades primeiro, cada uma com o seu caminho componentes → montagem → capacidade, a sua cobertura da cadeia completa (receber, entender, executar, exibir, interagir) e as suas predições;
- **os experimentos** que permitiriam decidir entre elas, e as fichas de mecanismo, com os campos 10 e 11 a preencher depois que você os tiver executado.

## Ler o relatório {#reading-the-report}

```ts
const { report } = result;
report.notices;       // read first: no sources, a stop, leads without a verdict…
report.architectures; // capabilities first, then improvements
report.experiments;   // what would decide between the architectures
report.cards;         // one mechanism card per main mechanism
report.driftLog;      // what left the objective, and why
report.results;       // every result retrieved, S1, S2…
report.stats;         // model calls, searches, items by status, rejections, redos, loops
```

O relatório também contém a carta e o seu hash, as emendas, o estado de cada passagem (`complete`, `partial`, `unchecked` ou `notRun`, com as suas tentativas e as passagens que a reabriram), todas as coleções das passagens, os três estados agrupados por peça, as pesquisas e as execuções do estudo (`runIds`, incluindo as execuções das emendas). A [referência da API do SDK](../reference/sdk-api#studies) lista os seus tipos.

Os **avisos** dizem o que o leitor precisa saber antes de confiar no resto:

| Código | Significado |
| --- | --- |
| `noSources` | O estudo não tinha nenhuma fonte: nada pôde ser estabelecido, e nenhuma novidade foi verificada |
| `stopped`, `failed`, `cancelled` | Como a última execução terminou; o relatório guarda o que foi feito |
| `passagesNotRun` | Passagens que a última execução não alcançou |
| `uncheckedItems` | Itens que o guardião não julgou, porque a execução parou antes |
| `searchesSkipped` | O orçamento de pesquisas se esgotou, e em quais passagens |
| `leadsNotVerified` | Pistas sem veredito |
| `analoguesNotDeconstructed` | Rupturas nomeadas que não foram desconstruídas |
| `noCapability` | Nenhuma arquitetura visa uma nova capacidade: só melhorias |
| `noveltiesToVerify` | Novidades ainda a verificar em relação ao estado da técnica |

### O dossiê {#the-dossier}

`result.markdown` é o relatório como um dossiê legível, no `language` do estudo. `renderStudyMarkdown(report)` escreve o mesmo a partir de qualquer relatório — por exemplo `renderStudyMarkdown(study.report())` depois que você registrou um resultado. Ele segue o método:

1. a carta (objeto, pergunta, objetivo, necessidades, pistas, escopo, capacidade visada, rupturas a desconstruir, hash) e as emendas;
2. os avisos;
3. o princípio do método, e o estado de cada passagem;
4. os itens de cada passagem: observações, peças e a cadeia completa, escolhas históricas, avanços, vereditos sobre as pistas, pistas independentes, referências atuais, restrições, decisões revisáveis e capacidades candidatas;
5. os três estados de cada peça, as combinações e as rupturas por montagem;
6. as pistas de concepção: cada arquitetura rotulada como nova capacidade ou melhoria, com para quem, a restrição removida, a mudança de princípio, o mecanismo, o caminho componentes → montagem → capacidade, as suas condições, benefício, custo adicional, contraexemplo, cobertura da cadeia e predições; depois, o que é novo e o que não é;
7. os experimentos, e as fichas de mecanismo;
8. o registro de deriva, as fontes e as estatísticas.

Cada afirmação mostra o seu status e os resultados que cita (`S1, S3`); um status que o estudo rebaixou diz o que o modelo declarou e por quê; uma novidade mostra o seu estado da técnica, ou que ainda está a verificar. As palavras do dossiê existem nos onze idiomas desta documentação; outro idioma recebe rótulos em inglês, enquanto o modelo continua escrevendo os seus textos nesse idioma. A `message` de cada aviso no relatório está em inglês; o dossiê a escreve no seu próprio idioma.

## O que um estudo não faz {#what-a-study-does-not-do}

- **Ele não constrói, não executa e não mede nada.** As suas predições são predições até que você execute os experimentos.
- **Ele só sabe o que as suas fontes devolvem.** O SDK não tem uma pesquisa na Web própria; sem fontes, toda afirmação é uma hipótese.
- **Uma citação é verificada, não o seu conteúdo.** O código verifica que um resultado citado por uma afirmação `established` foi recuperado por este estudo, não que o resultado diz o que a afirmação diz. O dossiê lista cada fonte com o seu link: leia-as.
- **O guardião e a verificação do estado da técnica são julgamentos de um modelo.** O registro de deriva e as notas sobre o estado da técnica os mostram, para que você possa discordar.
- **O que ele lê não é confiável.** Os resultados de pesquisa podem conter instruções dirigidas ao modelo (prompt injection). Um estudo só pode chamar as suas fontes, passando pelas políticas, e o texto do modelo e das fontes é escapado no dossiê; os status e as regras de deriva são garantidos em código, não pelo prompt.
