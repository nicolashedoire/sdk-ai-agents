# Por que este SDK

**Em uma frase:** a maioria dos frameworks de agentes ajuda um modelo de linguagem a **agir**; este SDK faz com que ele **justifique aquilo em que acredita** antes de concluir, e pode fazer com que ele **raciocine do jeito que uma pessoa específica raciocina**.

Esta página é honesta de propósito: ela diz o que o SDK faz e que você não encontrará facilmente em outro lugar, o que outros frameworks também fazem e o que eles fazem melhor. A comparação se baseia na documentação de frameworks amplamente usados em meados de 2026 (LangChain e LangGraph, o OpenAI Agents SDK, o Vercel AI SDK, CrewAI, AutoGen e seu sucessor Microsoft Agent Framework, Mastra, DSPy); eles evoluem rápido, então consulte a documentação atual deles antes de decidir.

## O que ele faz de diferente {#what-it-does-differently}

### 1. Regras de raciocínio escritas em código, não no prompt {#_1-reasoning-rules-written-in-code-not-in-the-prompt}

Em um agente comum, o "raciocínio" é o que quer que o modelo escreva: se ele diz que tem 90% de certeza, nada verifica isso, a menos que você escreva essa verificação. Aqui:

- o [estado mental](./cognitive-agents#the-mental-state) (fatos, hipóteses, predições, contradições) é composto de dados tipados, não de texto livre;
- o modelo não pode aumentar a própria confiança: a confiança de uma decisão é limitada ao suporte das evidências da opção escolhida, julgado em uma etapa de comparação separada (pelo Jev sem o perfil do pensador, ou pelo modelo de linguagem seguindo instruções);
- uma hipótese rejeitada não pode ser selecionada, atualizada nem reformulada; ela só volta como uma variante que diz o que mudou (uma reformulação com outras palavras não é detectada);
- uma resposta só é **firmada** quando passa pela [salvaguarda de conclusão](./evidence-and-verification#the-conclusion-guard): criticada, avaliada desde a última evidência nova, sem contradição que a envolva, predições testadas enquanto o orçamento permitir, suporte suficiente. Caso contrário, o agente responde **provisória**, com o que está faltando, ou **se abstém**.

"Não consigo concluir" é um resultado de primeira classe, garantido pelo código em vez de solicitado em um prompt.

### 2. O mundo verifica as predições, não o modelo {#_2-the-world-checks-the-predictions-not-the-model}

Um padrão comum é fazer um modelo julgar outro. Aqui, o agente declara **antes** do teste o que deveria observar e o que provaria que ele está errado, e **o seu código** decide: uma medição, um simulador, uma suíte de testes, uma consulta. Uma regra refutada é rejeitada e só pode voltar como uma variante que declara a sua diferença. Veja [Predições e o avaliador de resultados](./evidence-and-verification#predictions-and-the-outcome-evaluator).

O que os testes responderam é guardado para as execuções seguintes do mesmo escopo: a próxima execução começa com as regras que se sustentaram e não pode reformular, palavra por palavra, uma que falhou. Produtos de memória lembram o que foi dito; esta [memória entre execuções](./memory) guarda apenas o que um teste respondeu.

### 3. Evidências e preferências são mantidas separadas {#_3-evidence-and-preferences-are-kept-apart}

O que o pensador prefere pode mudar **qual ação é escolhida**, e permitir que uma ação que ele claramente prefere seja firmada com evidências plausíveis; no código, isso nunca torna uma **afirmação sobre o mundo** mais crível. Com o Jev, a pergunta sobre as evidências é inclusive enviada sem o perfil do pensador; com um juiz que é um modelo de linguagem, essa separação depende das instruções dele. Veja [Evidência não é preferência](./evidence-and-verification#evidence-is-not-preference).

### 4. Raciocinar como uma pessoa específica, e medir isso {#_4-reasoning-like-a-given-person-and-measuring-it}

Os produtos de memória armazenam principalmente fatos e preferências sobre um usuário (alguns também reescrevem instruções a partir de feedback); otimizadores de prompt como o DSPy ajustam prompts e exemplos em relação a uma métrica. Este SDK extrai **como** uma pessoa raciocina: a ordem em que ela examina um problema, seus reflexos, o que a faz rejeitar uma ideia. Ele versiona esse [perfil de pensador](./thinker-profiles), o escreve em cada etapa do raciocínio, acrescenta às instruções as correções da pessoa, com uma porcentagem de concordância, e exporta as escolhas de próxima etapa do agente, rotuladas com o veredito da pessoa sobre cada execução, como um conjunto de dados para treinar um pequeno controlador.

### 5. Decisões calibradas dentro do raciocínio {#_5-calibrated-decisions-inside-the-reasoning}

O [Jev](./typed-decisions) responde a perguntas bem delimitadas com probabilidades que o seu fornecedor calibra. Ele escolhe a próxima etapa do raciocínio e pontua as hipóteses por uma fração de centavo, e um controlador determinístico assume quando ele não tem certeza.

### 6. Um único log para o raciocínio e as ações {#_6-one-log-for-reasoning-and-actions}

Ferramentas governadas, aprovações, custos, novas tentativas e chamadas MCP são registrados no mesmo log de eventos que cada pensamento. Você pode reconstruir exatamente o que o agente "tinha em mente" por trás de qualquer resposta, meses depois, e fazer o replay das ações dele sem chamar o modelo.

## O que outros frameworks também fazem {#what-other-frameworks-also-do}

- **Ferramentas governadas e aprovação humana.** Guardrails no OpenAI Agents SDK, human-in-the-loop no LangGraph.
- **Persistência e replay.** Os checkpoints do LangGraph permitem retomar, inspecionar e reproduzir estados passados ou ramificar a partir deles.
- **MCP**, acompanhamento de custos e novas tentativas estão amplamente disponíveis.

A diferença aqui é que essas peças compartilham um único log de eventos com um estado de raciocínio explícito.

## O que outros frameworks fazem melhor {#what-other-frameworks-do-better}

- **Ecossistema.** Centenas de integrações, grandes comunidades, exemplos para tudo.
- **Maturidade.** Este SDK é jovem, tem um único mantenedor, ainda não está publicado no npm e foi testado em um número limitado de problemas reais.
- **Orquestração multiagente, streaming e kits de interface** são mais ricos em outros lugares.
- **Custo e latência.** Uma resposta cognitiva leva cerca de dez etapas de raciocínio, cada uma com uma ou duas requisições ao modelo (com gpt-4o e Jev, alguns minutos e cerca de 0,1 USD por problema nos nossos testes), enquanto uma resposta direta exige uma única chamada e um agente com ferramentas, algumas.
- **Dependência do modelo.** As regras valem qualquer que seja o modelo, mas a qualidade do raciocínio não: modelos pequenos seguem mal o método, e mesmo os fortes muitas vezes terminam com uma resposta provisória ou se abstêm em problemas difíceis.
- **Memória e recuperação de informação.** Produtos de memória e pipelines de recuperação oferecem busca semântica sobre grandes coleções; a [memória entre execuções](./memory) daqui recupera regras testadas por correspondência de palavras dentro de um escopo estreito.

## Quando escolhê-lo {#when-to-choose-it}

- **Decisões que você precisa justificar ou auditar**: pesquisa, indústria, governança interna e apoio à decisão em áreas regulamentadas (saúde, finanças, jurídico) em que uma pessoa revisa a conclusão e seus fundamentos.
- **Quando "não sei" é melhor do que uma invenção confiante**, e você quer que isso seja garantido.
- **Quando uma afirmação pode ser verificada**: você tem uma medição, um simulador ou uma suíte de testes com que o agente pode confrontar as predições dele.
- **Um gêmeo de raciocínio**: capturar como um especialista ou um fundador aborda problemas, e medir o quanto a imitação chega perto.

Quando você precisa de um chatbot rápido, de um grande catálogo de integrações prontas ou de uma única chamada rápida, um framework mais leve é mais adequado.
