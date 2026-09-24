# Evidências e verificação

Um agente cognitivo deveria acreditar no que consegue justificar, testar o que prevê e mudar suas regras quando o mundo discorda. Por isso, o ciclo cognitivo acompanha **de onde vem cada evidência**, mantém **evidências e preferências separadas**, confronta as predições com **testes reais** e só se **compromete** com uma resposta que passa por uma verificação de prontidão escrita em código.

::: tip Em palavras simples
Pense em um investigador cuidadoso. Ele anota **de onde vem cada pista** e não conta o mesmo boato duas vezes. A partir de vários casos, ele tira uma **regra**, depois diz de antemão **o que deveria ver** se a regra estiver certa, e **o que provaria que ela está errada**. Em seguida, ele verifica, com uma medição real em vez da própria opinião. Quando a verificação falha, ele não finge: ele **corrige a regra** e diz o que mudou. E ele só dá uma **resposta firme** quando ela se sustenta; caso contrário, ele diz "ainda não tenho certeza, falta isto", ou "não consigo concluir". Todos os termos usados abaixo são explicados em [Termos-chave em palavras simples](./glossary#evidence-and-conclusions).
:::

![Observar, comparar, deduzir, testar, revisar — depois a salvaguarda de conclusão](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## Forneça o que você observou {#give-it-what-you-observed}

Passe com o problema as medições, os casos ou os documentos que você já tem. Cada um se torna uma **observação** com um id (`O1`, `O2`…) que o raciocínio pode citar.

```ts
const result = await agent.think({
  problem: 'Does the rolling time on our plane depend on the ball?',
  observations: [
    {
      content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
      summary: 'Steel ball, 100 g: 1.07 s',
      originGroup: 'bench',
    },
    {
      content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
      summary: 'Steel ball, 400 g: 1.07 s',
      originGroup: 'bench',
    },
  ],
});
```

Resultados de ferramentas e resultados de testes também se tornam observações. A proveniência deles é escrita pelo motor, nunca pelo modelo:

| Campo | Significado |
| --- | --- |
| `sourceKind` | `input` (fornecida com o problema), `tool` (uma chamada de ferramenta governada) ou `evaluation` (um teste de predição) |
| `source`, `sourceEventId` | A ferramenta ou o avaliador, e o evento que guarda o conteúdo completo (`action.executed`, `cognition.evaluated`) |
| `observedAt`, `context` | Quando, e em que situação, foi observada |
| `summary` | Texto de tamanho limitado mostrado ao modelo |
| `fingerprint` | Hash do conteúdo completo |
| `originGroup` | Observações com a mesma origem **não** são confirmações independentes |
| `duplicateOf` | Definido quando o mesmo conteúdo, da mesma origem, já foi observado |

Os fatos citam as observações de onde foram lidos (`observationRefs`); um fato extraído de um resultado de ferramenta é vinculado a ele automaticamente, e um fato já conhecido não é adicionado duas vezes — a nova fonte é acrescentada a ele como corroboração. O modelo é instruído a ler uma fonte que afirma X como *a fonte afirma X*, e não como prova de X. O código garante que repetir a mesma evidência não acrescenta peso: uma duplicata não conta como mudança de evidências, e fatos ou testes que repetem uma observação anterior apontam para a original.

## Comparar observações {#compare-observations}

`compare_observations` relaciona as observações (e os fatos) entre si. Ela é oferecida quando existem pelo menos duas observações comparáveis — fornecidas com o problema ou devolvidas por ferramentas, excluindo duplicatas e resultados de teste — e chegaram novas desde a última comparação.

| Relação | Significado | O que o código faz |
| --- | --- | --- |
| `similarity` | Mesmo valor ou comportamento em um aspecto | Registra — uma semelhança não é uma causa |
| `difference` | Uma diferença explicada pelo contexto | Registra |
| `evolution` | Uma mudança ao longo do tempo | Registra |
| `incompatibility` | Não podem valer ao mesmo tempo | Abre uma contradição (`source_disagreement` entre origens diferentes), uma vez |
| `counterexample` | Um caso que derruba uma hipótese | Mantém como contraevidência dessa hipótese, abre uma contradição, uma vez |

## Regras, explicações e propostas {#rules-explanations-and-proposals}

Uma hipótese declara que tipo de afirmação ela é, como foi inferida e em que se apoia:

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind` é `proposal` (uma ação ou uma escolha a fazer, o padrão), `rule` (uma regularidade) ou `explanation` (uma causa). Uma afirmação sobre o que é ou foi verdade nunca é uma proposta: o modelo é avisado disso, porque a [salvaguarda de conclusão](#the-conclusion-guard) deixa as preferências do pensador ajudarem uma escolha, nunca uma afirmação. `inference` é `induction`, `abduction` ou `deduction`; o rótulo nunca torna a afirmação verdadeira.

## Predições e o avaliador de resultados {#predictions-and-the-outcome-evaluator}

`simulate` deduz **predições** que podem falhar: o que deveria ser observado (`expected`), qual observação provaria que a hipótese está errada (`falsifier`), em que `context`, e os parâmetros estruturados de `test` de que um avaliador precisa. Uma predição é registrada **antes** de ser testada, e é testada uma única vez. O modelo vê os experimentos já realizados e seus resultados (`experiments` na visão do estado) e é orientado a não repetir nenhum, mas a escolher um teste sobre o qual as hipóteses em jogo discordem.

Um `OutcomeEvaluator` a confronta com o mundo — um simulador, uma medição, uma suíte de testes, uma consulta:

```ts
import type { OutcomeEvaluator } from '@sdk-ai-agents/core';

const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const run = await rollOnTheBench(prediction.test); // your measurement
    if (!run) return { verdict: 'inconclusive', reason: 'the bench is busy' };
    const refuted = Math.abs(run.seconds - run.expectedSeconds) / run.expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: run,
      summary: `${run.material} ball: ${run.seconds} s`,
      metrics: { seconds: run.seconds },
      ...(refuted ? { causeCandidates: ['material deforms', 'surface grip'] } : {}),
    };
  },
};

const agent = sdk.createCognitiveAgent({ name: 'physicist', model: 'gpt-4o', evaluator: bench });
```

Com um avaliador, `test_prediction` fica disponível. Ela chama **o seu avaliador, não o modelo de linguagem**, registra o relatório completo como um evento `cognition.evaluated` e adiciona o que foi observado como uma observação `evaluation` que aponta para esse evento.

| Veredito | Efeito |
| --- | --- |
| `confirmed` | A observação é adicionada às `evidenceRefs` da hipótese |
| `refuted` | O falseador foi observado: a hipótese é **rejeitada**, a observação é mantida como contraevidência e a refutação é registrada como uma contradição `refuted_prediction` resolvida |
| `inconclusive` | Registrado; o que foi observado, se houver algo, é uma nova evidência; nada mais muda |

Cada teste consome um dos `limits.maxPredictionTests`. Um avaliador que lança uma exceção ou devolve um relatório inválido dá `inconclusive`, e o mesmo acontece com um relatório `refuted` que não diz o que foi observado — uma medição que falhou nunca refuta nada. Não use como avaliador um modelo que julga o próprio raciocínio: a autocrítica pode preparar um teste, mas não pode substituí-lo.

## Revisão {#revision}

Quando as evidências contradizem uma hipótese, `revise` pede uma **variante**: uma nova hipótese com `parentId`, um `scope` mais estreito ou uma variável adicional, e a `difference` que ela introduz — uma variante que não declara a sua diferença é recusada. A original mantém o seu id, o seu motivo de rejeição e o seu contraexemplo; reformular uma hipótese já considerada, rejeitada ou não, é recusado. No teste do plano inclinado, a regra refutada *"o tempo de rolagem não depende da bola"* se torna *"para bolas rígidas, o tempo de rolagem não depende da massa"*, o que um segundo teste confirma.

## Evidência não é preferência {#evidence-is-not-preference}

| Nota | Pergunta | Quem vê o perfil do pensador? |
| --- | --- | --- |
| `support` | O quanto as observações, os fatos, as predições e as críticas a sustentam? | Jev: ninguém — as perguntas sobre as evidências são enviadas sem o perfil. LLM: o modelo é instruído a ignorar as preferências |
| `preferenceFit` | O quanto esta proposta convém ao pensador? (apenas propostas) | Sim, esse é o objetivo dela |

O código nunca mistura as duas notas. As hipóteses são classificadas apenas por `support` no caso de regras e explicações; as propostas são classificadas por `(1 − w) · support + w · preferenceFit`, com `w = limits.preferenceWeight` (0,4 por padrão). Mudar o perfil pode, portanto, mudar **qual ação é escolhida**, e se uma escolha que o pensador claramente prefere pode ser firmada com evidências plausíveis (veja [a salvaguarda de conclusão](#the-conclusion-guard)); com o Jev, isso não pode mudar **o quanto uma afirmação é crível**, e com um juiz LLM essa separação depende das instruções dele. A `confidence` do estado acompanha o suporte das evidências da hipótese mais bem classificada: a `confidence` que um modelo escreve em um pensamento é ignorada.

`support` é um julgamento feito por um modelo, não uma probabilidade calibrada. O que se mede é o histórico: quais predições foram confirmadas ou refutadas.

## Avaliações desatualizadas {#stale-assessments}

O estado mantém um contador `evidenceRevision`. Ele aumenta quando chega uma nova observação (que não seja duplicata), um novo fato, uma revisão de fato, uma contradição, um contraexemplo ou um resultado de teste conclusivo. As avaliações feitas antes ficam **desatualizadas**: `compare` é oferecida de novo, e uma hipótese desatualizada não pode ser firmada. Uma comparação precisa reavaliar **todas** as hipóteses em jogo — o modelo é solicitado a corrigir uma comparação que pula uma hipótese, e uma que ainda pula uma hipótese, ou que falha, não conta como feita.

## Contradições e revisões de fatos {#contradictions-and-fact-revisions}

As contradições têm uma `category`: `source_disagreement`, `temporal_change`, `context_difference`, `logical_incompatibility` ou `refuted_prediction`. Uma contradição é resolvida **uma única vez**, e apenas quando a resolução **cita observações ou fatos** que a resolvem (`basisRefs` — outras referências são relatadas e ignoradas); ela pode dizer o que foi feito (`retracted`, `restricted`, `replaced`, ou `explained` por padrão). A resolução é mantida junto com a contradição. Os fatos nunca são apagados: eles são `retracted` (retirados) ou `superseded` (substituídos) por um substituto, com o motivo.

## A salvaguarda de conclusão {#the-conclusion-guard}

Uma resposta só pode ser **firmada** quando a sua hipótese:

- foi criticada;
- foi avaliada desde a última mudança nas evidências;
- não é envolvida por uma contradição não resolvida (uma que não cita nada envolve tudo);
- não tem predição sem teste enquanto o orçamento de testes permitir testá-la;
- tem um `support` de evidências de pelo menos `limits.decisionThreshold` — ou, no caso de uma **proposta** (uma escolha de ação), é claramente a escolha do pensador (`preferenceFit` de pelo menos `limits.decisionThreshold`) enquanto o seu suporte de evidências atinge `limits.minProposalSupport` (0,35 por padrão).

O segundo caminho existe porque uma pergunta como *"você aceitaria este emprego?"* tem poucas evidências a pesar: uma pessoa decide isso com as suas prioridades, desde que os fatos não falem contra a escolha, ou seja, desde que o seu suporte de evidências fique no piso ou acima dele. Regras e explicações nunca o seguem: as preferências nunca tornam uma afirmação verdadeira. [Raciocinar como uma pessoa específica](./thinker-profiles#how-a-choice-is-ranked-and-committed) percorre um exemplo com números. `minProposalSupport` não pode ser maior que `decisionThreshold`; defina-o igual a `decisionThreshold` para desativar esse caminho.

`decide` só é oferecida quando uma hipótese passa. Uma decisão que seleciona outra hipótese, ou nenhuma, é **adiada** enquanto o orçamento durar; um adiamento conta como uma tentativa fracassada, e `decide` deixa de ser oferecida depois de dois seguidos. Na última etapa, ou quando nada mais é possível, o motor ainda assim pede uma decisão, e a resolve:

| `decision.status` | Quando | `decision.missing` |
| --- | --- | --- |
| `committed` | A verificação de prontidão passa | `[]` |
| `provisional` | O orçamento se esgotou com uma hipótese ainda viva | O que ainda não está estabelecido |
| `abstain` | Nenhuma hipótese foi selecionada, a selecionada foi rejeitada, ou o modelo não conseguiu produzir decisão alguma | O motivo — uma abstenção tem confiança 0, e a sua resposta é escrita pelo motor (o que o modelo escreveu é mantido em `rationale`) |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

O status da execução continua `completed`: uma abstenção explícita é um resultado válido. A confiança de uma decisão é limitada ao suporte das evidências da sua hipótese.

## Um orçamento que não é desperdiçado {#a-budget-that-is-not-wasted}

Uma etapa que não mudou nada do que deveria mudar — nenhuma hipótese nova (todas as propostas recusadas), nada simulado ou criticado pela primeira vez, nenhuma comparação registrada —, uma comparação que pula uma hipótese e uma decisão adiada contam, todas, como tentativas fracassadas da sua operação. Quando `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `compare` ou `decide` falhou duas vezes seguidas, ela deixa de ser oferecida **até que outra etapa traga novas evidências** — uma etapa bem-sucedida, ou um resultado de ferramenta ou de teste que o motor registrou; o que as próprias etapas que falharam escreveram não conta —, de modo que a execução avança em vez de se repetir. `seek_information` funciona por pergunta em aberto: uma pergunta que nenhuma ferramenta disponível pode responder é abandonada imediatamente (com o motivo), e uma chamada de ferramenta que falha conta para as duas tentativas a que cada pergunta tem direito, para que as outras perguntas também tenham a sua vez. `test_prediction` é limitada pelo seu orçamento de testes.

`limits.maxConsecutiveFailures` conta as falhas do modelo ou das suas ferramentas, incluindo uma comparação que ainda pula uma hipótese depois da correção. Decisões adiadas e etapas que não mudaram nada são registradas como etapas que falharam, mas nunca contam para esse limite. Os componentes (gerador de pensamentos, avaliador de hipóteses, avaliador de resultados) recebem uma cópia do estado: eles não podem alterar o que está registrado, e um pensamento inválido vindo de um componente personalizado é registrado como uma operação que falhou, em vez de interromper a execução.

## Os testes são a sua especificação {#tests-are-your-specification}

`src/__tests__/rule-discovery.test.ts` executa o ciclo inteiro com um modelo roteirizado e uma bancada de física determinística — induzir, prever, ser refutado, revisar, verificar, firmar — e verifica cada evento. `src/__tests__/epistemic-state.test.ts`, `epistemic-guards.test.ts` e `epistemic-liveness.test.ts` verificam cada regra acima isoladamente, e um trace gravado pela versão anterior verifica que execuções mais antigas são reconstruídas sem alteração.

## Execuções mais antigas {#older-runs}

As execuções registram a versão destas regras (`schemaVersion: 2` em `cognition.started`). As execuções registradas antes disso não têm versão: `getMentalState` as reconstrói com as suas regras originais, e as suas novas coleções ficam vazias.

## Ainda não disponível {#not-there-yet}

- **Memória semântica.** A [memória entre execuções](./memory) recupera o que testes anteriores estabeleceram por correspondência de palavras; regras relacionadas, escritas de outra forma, podem passar despercebidas.
- **Desatualização direcionada.** Uma nova evidência torna desatualizadas todas as avaliações, não só as que ela envolve — conservador, e simples de auditar.
- **Escolher o que explorar.** Os controladores escolhem uma operação; o alvo (qual incógnita, qual predição) é o primeiro elegível.
- **Calibração.** Ainda não existe uma confiança preditiva calibrada: `support` é um julgamento, e o que se mede é o histórico das predições.
- **Inferência verificada.** O rótulo de inferência (indução, abdução, dedução) é declarado, não verificado por um verificador formal.
- **Tipos declarados.** Se uma hipótese é uma afirmação ou uma escolha de ação é declarado pelo modelo quando ele a propõe, e uma hipótese sem tipo é uma proposta. O prompt proíbe chamar de proposta uma afirmação sobre o mundo, mas nada verifica isso: uma afirmação rotulada de forma errada poderia ser firmada com base na preferência do pensador.
- **Testar as causas por trás de uma escolha.** Quando o objetivo pergunta o que fazer, as hipóteses são linhas de ação e só as regras e explicações recebem predições, então o avaliador de resultados não é usado nesses objetivos.
- **Verificações estruturadas.** As restrições são texto livre e não são verificadas pela salvaguarda de conclusão; os conflitos não são detectados por regras sobre dados estruturados; uma ação de resolução não altera fatos nem hipóteses por si só.
