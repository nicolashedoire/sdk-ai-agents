# Termos-chave em palavras simples

Todos os termos usados nesta documentação, explicados sem jargão, com um link para a página que os detalha. Os termos estão agrupados por tema; use a caixa de pesquisa (<kbd>/</kbd>) para ir direto a um deles.

## O básico {#the-basics}

| Termo | Em palavras simples |
| --- | --- |
| **SDK** | Uma caixa de ferramentas para desenvolvedores: código que você adiciona à sua própria aplicação em vez de escrever tudo você mesmo. Este é escrito em TypeScript; ainda não está no npm e é instalado a partir do GitHub (veja [Primeiros passos](./getting-started)). |
| **Modelo de linguagem** (LLM) | A IA que lê e escreve texto (GPT-4o, Claude…). Aqui ela é um componente entre outros: ela propõe, e o SDK verifica e decide o que é permitido. |
| **Prompt** | As instruções em texto enviadas a um modelo de linguagem a cada requisição. |
| **Token** | Um pedaço de palavra. Os fornecedores de modelos cobram por token lido e escrito, e é por isso que os [custos](./costs) são contados em tokens. |
| **Agente** (agent) | Um programa que usa um modelo de linguagem para atingir um objetivo, etapa por etapa. O SDK tem dois tipos: [agentes governados](./governed-agents), que agem com ferramentas, e [agentes cognitivos](./cognitive-agents), que raciocinam antes de concluir. |
| **Execução** (run) | Uma execução de um agente sobre um problema, do início ao fim. Ela tem um id (`runId`) que você usa para lê-la, fazer o replay dela ou calcular o seu custo. |
| **Ferramenta** (tool) | Uma função que o seu código entrega a um agente (ler um banco de dados, enviar um e-mail…). O agente só pode usar as ferramentas que recebeu explicitamente. Veja [Conceitos fundamentais](./concepts#_2-tool). |
| **Capacidade** (capability) | Um grupo nomeado de ferramentas que você pode entregar a vários agentes de uma vez. |
| **Política** (policy) | Uma regra verificada **antes** de cada ação: um orçamento, um tempo limite, uma lista de ferramentas permitidas ou a sua própria verificação. |
| **Aprovação** (approval) | Uma pausa antes de uma ação arriscada, até que um humano diga sim. Uma política pode pedi-la, ou a própria ferramenta (`requiresApproval`); se quem chamou desistir antes, a ação nunca é executada. |
| **Intenção** (intention) | O que o modelo de um agente governado *quer* fazer (chamar uma ferramenta, responder…), anotado mas não executado: o SDK o valida primeiro. |
| **Schema (Zod)** | Uma descrição precisa do formato que os dados devem ter. As chamadas de ferramentas e as respostas estruturadas das etapas de raciocínio são verificadas em relação a um schema; uma resposta que não se encaixa é recusada. |
| **JSON** | Um formato de texto simples para dados estruturados. Perfis, eventos e respostas dos modelos são JSON. |

## Rastreabilidade {#traceability}

| Termo | Em palavras simples |
| --- | --- |
| **Evento** (event) | Uma linha no diário de bordo: "isto aconteceu, neste momento". Cada etapa de cada execução é registrada como um evento. Veja o [catálogo de eventos](../reference/events). |
| **Armazenamento de eventos** (event store) | Onde o diário de bordo é guardado: uma pasta de arquivos, SQLite ou PostgreSQL. |
| **Event sourcing** | A regra de que o diário de bordo é a verdade: o estado de uma execução, incluindo o estado mental, é reconstruído relendo seus eventos, nunca armazenado separadamente. É isso que torna cada execução auditável meses depois. Um perfil de pensador é a exceção: os eventos registram apenas o id e a versão dele, então salve o próprio perfil. |
| **Trace** | Todos os eventos de uma execução, em ordem. |
| **Replay** | Reexecutar uma execução registrada a partir de seus eventos: as ações que ela decidiu são executadas de novo, passando pelas mesmas políticas, sem perguntar novamente ao modelo de linguagem. Útil para auditar uma execução ou para testar "e se" depois de mudar uma política. Veja [Rastreabilidade e replay](./observability). |
| **Trace de referência** (golden trace) | Uma boa execução que você guarda como referência; as novas execuções são verificadas em relação a ela, de modo que uma mudança de comportamento é detectada como um teste que falha. |

## Como um agente cognitivo raciocina {#how-a-cognitive-agent-reasons}

| Termo | Em palavras simples |
| --- | --- |
| **Estado mental** (mental state) | Tudo o que o agente "tem em mente" no momento sobre o problema, anotado como dados: o que ele observou, sabe, supõe, não sabe, e as opções que está considerando. Veja [o estado mental](./cognitive-agents#the-mental-state). |
| **Observação** (observation, `O1`…) | Algo que foi visto: uma medição ou um documento que você forneceu com o problema, um resultado de ferramenta ou um resultado de teste. |
| **Fato** (fact, `F1`…) | Uma afirmação que o agente considera verdadeira, com a indicação de onde ela vem. Um fato nunca é apagado: ele é *retirado* (retracted) ou *substituído* (superseded, trocado por outro), com o motivo. |
| **Suposição** (assumption, `A1`…) | Algo que o raciocínio toma como certo sem prova. |
| **Restrição** (constraint, `K1`…) | Algo que qualquer resposta deve respeitar ("antes do 4º trimestre", "abaixo de 10 mil EUR"). |
| **Incógnita** (unknown, `U1`…) | Uma pergunta em aberto. Ela pode ser *resolvida* (resolved, respondida) ou *abandonada* (dropped, sem como respondê-la). |
| **Hipótese** (hypothesis, `H1`…) | Uma opção em consideração. Ela é de um de três tipos: uma **proposta** (proposal, uma escolha de ação: "recusar o emprego"), uma **regra** (rule, uma regularidade: "o tempo de rolagem não depende da massa") ou uma **explicação** (explanation, uma causa). |
| **Indução, abdução, dedução** | Três maneiras de chegar a uma hipótese: de casos repetidos a uma regra; de uma surpresa à sua causa mais provável; de uma regra ao que deve decorrer dela. O rótulo é declarado; ele não torna a afirmação verdadeira. |
| **Operação** (operation) | Um movimento de raciocínio: representar o problema, formular hipóteses, simular, criticar, comparar, decidir… São dez. Veja [as operações](./cognitive-agents#the-operations). |
| **Controlador** (controller) | O que escolhe a próxima operação. O controlador **heurístico** segue uma ordem fixa e é gratuito e previsível; o controlador **tipado** consulta o Jev a cada etapa. |
| **Patch de pensamento** (thought patch) | O que uma operação mudou no estado mental, registrado como um evento. O estado mental é o conjunto de todos os patches aplicados em ordem. |
| **Simulação** (simulation) | Imaginar o que aconteceria se uma hipótese fosse verdadeira: efeitos imediatos, depois os indiretos. |
| **Crítica** (critique) | O agente atacando a própria opção: o motivo mais forte pelo qual ela poderia falhar. Uma crítica **fatal** sem resposta rejeita a opção. |
| **Contradição** (contradiction, `C1`…) | Duas coisas que não podem ser verdadeiras ao mesmo tempo. Ela fica em aberto até ser resolvida com a citação das observações ou dos fatos que a resolvem. |
| **Variante** (variant) | Uma versão corrigida de uma hipótese que as evidências contradisseram, com um escopo mais estreito ou uma condição adicional, e uma frase dizendo o que mudou. |
| **Limites** (limits) | O orçamento de uma execução: número de etapas, tempo, chamadas de ferramentas, testes, e os limiares para concluir. Veja [Limites](./cognitive-agents#limits). |

## Evidências e conclusões {#evidence-and-conclusions}

| Termo | Em palavras simples |
| --- | --- |
| **Proveniência** (provenance) | De onde vem uma evidência: fornecida por você, devolvida por uma ferramenta ou medida por um teste, com o evento que guarda o original. |
| **Grupo de origem** (`originGroup`) | Um rótulo para "mesma fonte". Duas observações da mesma origem não são duas confirmações independentes. |
| **Duplicata** (duplicate) | O mesmo conteúdo, da mesma origem, visto de novo. Ela não acrescenta peso. |
| **Predição** (prediction, `P1`…) | O que deveria ser observado se uma hipótese estiver certa, registrado **antes** de testá-la. |
| **Falseador** (falsifier) | A observação que provaria que a hipótese está errada. Uma afirmação que não pode ser provada errada não pode ser testada. |
| **Conhecimento** (knowledge, `M1`…) | O que execuções anteriores estabeleceram com testes reais, recuperado no início de uma execução: *verificado* (verified), *refutado* (refuted) ou *contestado* (contested) quando os testes discordam. Veja [Memória entre execuções](./memory). |
| **Escopo** (scope) | A fronteira de uma memória: as execuções compartilham o que aprenderam apenas dentro do mesmo escopo, por exemplo uma bancada de testes ou um produto. |
| **Avaliador de resultados** (outcome evaluator) | O seu código que confronta uma predição com o mundo (uma medição, um simulador, uma suíte de testes) e responde *confirmada* (confirmed), *refutada* (refuted) ou *inconclusiva* (inconclusive). O modelo de linguagem nunca avalia as próprias predições. Veja [Predições](./evidence-and-verification#predictions-and-the-outcome-evaluator). |
| **Suporte** (support) | O quanto as evidências sustentam uma hipótese, de 0 (refutada) a 1 (estabelecida). É um julgamento, não uma probabilidade medida. O código nunca mistura preferências a ele; com um juiz que é um modelo de linguagem, isso depende das instruções dele (veja [Evidência não é preferência](./evidence-and-verification#evidence-is-not-preference)). |
| **Adequação às preferências** (`preferenceFit`) | O quanto uma escolha de ação convém ao pensador, de 0 (atende a um dos seus critérios de rejeição) a 1 (ideal). Só as escolhas de ação recebem essa nota. |
| **Classificação** (ranking) | A ordem das opções. As afirmações são classificadas apenas pelo suporte; as escolhas de ação, por 60% de suporte e 40% de adequação às preferências, por padrão. |
| **Desatualizada** (stale) | Uma avaliação feita antes da última mudança nas evidências. Ela precisa ser refeita antes de concluir. |
| **Salvaguarda de conclusão** (conclusion guard) | As verificações, escritas em código, pelas quais uma resposta precisa passar para ser firmada: criticada, avaliada desde a última evidência nova, nenhuma contradição em aberto que a envolva, nenhuma predição sem teste enquanto restarem testes no orçamento, e suporte suficiente. Veja [A salvaguarda de conclusão](./evidence-and-verification#the-conclusion-guard). |
| **Limiar de decisão** (decision threshold) | O suporte de que uma resposta firme precisa: 0,75 por padrão, "fortemente sustentada". Uma escolha de ação que o pensador claramente prefere precisa de apenas 0,35. |
| **Firmada** (committed) | Uma resposta firme que passou pela salvaguarda de conclusão. |
| **Provisória** (provisional) | A melhor resposta disponível quando o orçamento se esgotou, com a lista do que ainda não está estabelecido (`missing`). |
| **Abstenção** (abstain) | "Não consigo concluir", com os motivos. Um resultado válido, não um erro. |
| **Confiança** (confidence) | O quanto a decisão é segura, nunca mais do que o suporte das evidências da opção escolhida. |

## Imitar o raciocínio de uma pessoa {#imitating-a-person-s-reasoning}

| Termo | Em palavras simples |
| --- | --- |
| **Perfil de pensador** (thinker profile) | Uma descrição de **como** uma pessoa específica raciocina: a ordem em que ela olha para um problema, suas prioridades, reflexos, critérios de rejeição e apetite por risco. Ele é escrito nas instruções de cada etapa do raciocínio, e é assim que o agente imita o raciocínio dessa pessoa. Veja [Perfis de pensador](./thinker-profiles). |
| **Amostra** (sample) | Um tema que a pessoa explicou com suas próprias palavras: o tema, como ela raciocinou, o que ela concluiu. |
| **Destilar** (distill) | Extrair um perfil de amostras: encontrar o que se repete no modo como a pessoa raciocina de um tema para outro. |
| **Ordem de atenção** (`reasoningSequence`) | As etapas pelas quais a pessoa passa, em ordem. |
| **Heurística** (heuristic) | Um reflexo, escrito na forma "quando …, então …". |
| **Critério de rejeição** (rejection criterion) | Um motivo pelo qual a pessoa abandona uma ideia. |
| **Veredito** (verdict) | O julgamento da pessoa sobre uma execução: `match` (raciocinou como eu), `partial` ou `mismatch`. |
| **Concordância** (agreement) | O quanto da execução a pessoa aprova, de 0 a 1: `0.8` significa "80% certo". É assim que você mede o quanto a imitação chega perto. |
| **Exemplo de calibração** (calibration example) | Uma execução que a pessoa validou, mostrada ao modelo como uma resposta modelo. |
| **Correção** (correction) | Uma lição de uma execução com a qual a pessoa não concordou, mostrada ao modelo como sua prioridade máxima. |

## Estudos {#studies}

| Termo | Em palavras simples |
| --- | --- |
| **Estudo** (study) | Um pesquisador de IA (`sdk.createStudy`): ele entende um objeto, depois propõe como redesenhá-lo com os conhecimentos e as técnicas de hoje, e concebe os experimentos que permitiriam decidir. Ele não constrói nem mede nada. Veja [Estudos](./studies). |
| **Passagem** (passage) | Uma das sete fases de um estudo: observar, decompor, entender as escolhas da sua época, examinar o que mudou, cruzar passado e presente, conceber, confrontar. Uma passagem pode reabrir uma anterior. |
| **Carta** (charter) | O quadro de um estudo: o objeto, a pergunta norteadora, o objetivo, as necessidades, as suas pistas, o que está fora do escopo. Ela é congelada quando o estudo é criado, e todo prompt começa com ela. |
| **Pista** (lead) | Uma ideia que você dá ao estudo para ele examinar. É um exemplo a verificar, não uma verdade: o estudo diz se ela é pertinente, com os motivos, e procura além dela. |
| **Status de uma afirmação** (claim status) | O que vale um enunciado de um estudo: **estabelecida** (sustentada por uma fonte que o estudo realmente encontrou), **hipótese** (plausível, não documentada) ou **novidade** (uma ideia nova, a verificar em relação aos trabalhos existentes). Quem o verifica é o código, não o modelo. Veja [Estabelecida, hipótese, novidade](./studies#established-hypothesis-novelty). |
| **Estado da técnica** (prior art) | Os trabalhos existentes mais próximos de uma ideia apresentada como nova. Uma novidade continua "a verificar" até que o estudo o tenha pesquisado. |
| **Guardião** (guardian) | Uma verificação separada depois de cada passagem de um estudo: ela vê apenas a carta e o que a passagem produziu, e remove o que se desvia do objetivo. Veja [O guardião](./studies#the-guardian). |
| **Deriva, registro de deriva** (drift, drift log) | A deriva é um modelo que se afasta aos poucos do seu assunto. O registro de deriva lista tudo o que um estudo removeu por esse motivo, e por quê. |
| **Emenda** (amendment) | Uma instrução acrescentada a um estudo depois que ele foi criado. Ela só é aceita quando refina o objetivo; uma emenda que contradiz a carta ou muda o objetivo é recusada. |
| **Nova capacidade** (new capability) | Algo difícil ou impossível hoje que se torna possível graças a uma mudança de princípio — em oposição a uma **melhoria** (improvement), que apenas torna algo mais rápido ou mais barato. |
| **Ruptura por montagem** (breakthrough by assembly) | Uma ruptura feita de técnicas que já existiam, juntadas de um modo novo. O Bitcoin é uma delas: assinaturas, cadeias de hashes, prova de trabalho e uma rede peer-to-peer já eram conhecidas antes. |
| **Ficha de mecanismo** (mechanism card) | Onze perguntas sobre um mecanismo, do que foi observado ao que foi concluído. Um estudo responde às nove primeiras; você responde às duas últimas depois de executar o experimento. |

## Decisões tipadas e conectores {#typed-decisions-and-connectors}

| Termo | Em palavras simples |
| --- | --- |
| **Jev** | Um modelo da TypeSafe que responde a perguntas bem delimitadas (sim/não, uma escolha, uma avaliação em escala) com probabilidades que o seu código pode usar, de forma rápida e barata. Veja [Decisões tipadas](./typed-decisions). |
| **Noul, Choice, Score** | Os três tipos de pergunta do Jev: sim ou não; uma opção dentro de uma lista; um nível em uma escala. Escolher várias opções faz uma pergunta de sim/não por opção. |
| **Calibrado** (calibrated) | Uma probabilidade que corresponde à realidade em média: das respostas dadas com 80% de confiança, cerca de 80% estão certas. |
| **AI Gateway** | Um serviço da Vercel que dá acesso a vários modelos, incluindo o Jev, com uma única chave. |
| **MCP** | Model Context Protocol: um "plugue" padrão único entre as aplicações de IA (Claude Desktop, Claude Code, assistentes de IDE, agentes) e os seus sistemas. O SDK pode transformar uma função, uma API web, uma pasta, um banco de dados ou um agente em um servidor MCP, e usar as ferramentas de qualquer servidor MCP. Veja [MCP em palavras simples](./mcp). |
| **Servidor MCP** (MCP server) | Um pequeno programa na frente de um dos seus sistemas, que diz às aplicações de IA o que ele oferece e faz o trabalho quando solicitado. Veja [Seu primeiro servidor MCP](./mcp-first-server). |
| **Cliente MCP, host** | O host é a aplicação de IA com a qual o usuário conversa; dentro dele, um cliente MCP mantém a conexão com um servidor. |
| **Recurso** (resource) | Um documento que um servidor MCP oferece para leitura, como um arquivo de uma pasta compartilhada. Diferentemente de uma ferramenta, quem o escolhe é o usuário ou a aplicação, não o modelo. |
| **Transporte** (transport) | Como uma aplicação MCP e um servidor trocam mensagens: **stdio** (a aplicação inicia o servidor como um programa no mesmo computador e conversa por meio da entrada e da saída dele) ou **Streamable HTTP** (o servidor é um serviço web). Veja [stdio ou HTTP?](./mcp-deploy#stdio-or-http). |
| **OpenAPI** | Uma descrição padrão, legível por máquina, de uma API web: seus endereços, parâmetros e respostas, muitas vezes publicada como `openapi.json`. A partir dela, o SDK cria uma ferramenta por operação. Veja [Uma API web](./mcp-recipes#a-web-api-from-its-openapi-description). |
| **JSON Schema** | Uma descrição do formato de determinados dados — aqui, dos argumentos de uma ferramenta — que os modelos e as aplicações MCP leem para chamar a ferramenta corretamente. O SDK a escreve a partir do seu schema Zod ou da descrição OpenAPI. |
| **Somente leitura** (read-only) | Pode olhar, não pode alterar. As fontes de pasta e de banco de dados são somente leitura por construção; as APIs web são somente leitura por padrão (apenas operações `GET`). |
| **Fonte de ferramentas** (tool source) | Uma função que constrói ferramentas prontas a partir de um sistema: `openApiTools`, `folderTools`, `databaseTools`, `cognitiveAgentTool`. Sirva-as por MCP com uma linha, ou entregue-as aos seus próprios agentes. Veja [Um servidor MCP para qualquer coisa](./mcp-recipes). |

## Operar em produção {#operating-in-production}

| Termo | Em palavras simples |
| --- | --- |
| **Nova tentativa** (retry) | Tentar de novo uma requisição que falhou, depois de uma breve espera, quando a falha é temporária. Veja [Novas tentativas e fallback](./resilience). |
| **Fallback, failover** | Mudar para outro modelo ou provedor quando o primeiro continua falhando. |
| **Incidente** (incident) | Uma execução com falha, uma ação bloqueada ou um failover, transformados em um alerta enviado a você por e-mail ou webhook. Veja [Alertas de incidentes](./incidents). |
| **Webhook** | Um endereço que a sua ferramenta de chat ou de monitoramento fornece, para o qual o SDK envia os alertas. |
