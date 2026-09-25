# Custos de API

O SDK registra o consumo de tokens de cada chamada ao modelo **na execução que a fez** — seleção de ferramentas, pensamentos cognitivos, decisões tipadas e as chamadas de um estudo — e o precifica por modelo. Uma chamada conta assim que o fornecedor a responde, mesmo que o SDK depois faça a etapa falhar por causa dessa resposta (veja [Chamadas que falham](#failed-calls)).

```ts
const cost = await sdk.getRunCost(runId);
```

```json
{
  "runId": "run_7f3…",
  "currency": "USD",
  "totalUsd": 0.01842,
  "complete": true,
  "unpricedModels": [],
  "unpricedCalls": 0,
  "unmeteredCalls": 0,
  "unmeteredModels": [],
  "lines": [
    { "model": "gpt-4o", "source": "llm", "calls": 9, "inputTokens": 14210, "outputTokens": 2310, "costUsd": 0.0186 },
    { "model": "jev-1.13.0", "source": "decision", "calls": 7, "inputTokens": 5880, "outputTokens": 140, "costUsd": 0.00025 }
  ]
}
```

## Preços {#prices}

Os preços de LLM mudam com frequência e dependem do seu contrato, então eles são **configuração, não código**. Só os preços verificados na documentação dos fornecedores vêm como padrão — hoje, o do Jev (US$ 0,042 por milhão de tokens de entrada, saída gratuita, verificado em 2026-09-23), tanto sob os seus ids da TypeSafe (`jev-*`) quanto pelo Vercel AI Gateway (`typesafe-ai/jev`).

```ts
const sdk = createSDK({
  apiKey,
  pricing: {
    // Illustrative values: use your provider's current prices or your contract.
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
});
```

As chaves são ids exatos de modelo ou prefixos terminados em `*`. Os provedores muitas vezes respondem com um id versionado (`gpt-4o-2024-08-06`) quando você pediu `gpt-4o`: o SDK registra os dois e procura primeiro o id devolvido, depois o nome solicitado — as chaves exatas antes dos prefixos, com o prefixo mais longo prevalecendo. Cuidado com os prefixos: `gpt-4o*` também corresponde a `gpt-4o-mini`, a menos que `gpt-4o-mini*` exista. Cada chamada é precificada pelos seus próprios nomes, incluindo uma resposta que um provedor descartou: as chamadas de um modelo pedido com outro nome, ou sem nenhum, têm uma linha própria.

## Custos desconhecidos {#unknown-costs}

O SDK nunca inventa um preço, nem uma contagem de tokens. O custo de uma chamada é desconhecido em dois casos, e o relatório diz isso:

- **o modelo dela não tem preço**: as chamadas e os tokens continuam sendo contabilizados, o modelo é listado em `unpricedModels`, essas chamadas em `unpricedCalls`, e a linha dele não tem `costUsd`;
- **ela não informou ao mesmo tempo os tokens de entrada e de saída** — como com um provedor que não devolve o consumo, só um total, ou só um dos dois: ela é contada em `unmeteredCalls` (e no `unmeteredCalls` da sua linha), e o modelo em `unmeteredModels`. Ela nunca é tomada como zero token, e uma linha em que nenhuma chamada os informou também não tem `costUsd`.

Uma chamada sem as duas contagens conta como não medida mesmo que o modelo tenha preço, como nos orçamentos. Assim que o custo de alguma chamada é desconhecido, o relatório é marcado com `complete: false` e `totalUsd` soma apenas as chamadas cujo custo é conhecido: é um mínimo, não o custo da execução.

Os tokens de uma chamada medida são os seus tokens de entrada e de saída, qualquer que seja o total que o fornecedor também informe. Os de uma chamada não medida são o maior entre o seu total e os tokens de entrada ou de saída que ela informou, nunca menos do que ela disse ter usado: eles contam como tokens (no `unmeteredTokens` da linha, nos orçamentos e no `maxTokens` de uma execução), nunca como custo. Um valor que não é um número maior ou igual a 0 (`null`, um número negativo) é lido como ausente, e não esconde os outros.

## Chamadas que falham {#failed-calls}

Uma chamada que o fornecedor respondeu é cobrada, seja o que for que o SDK faça depois com a resposta. Ela é registrada e contabilizada — nos eventos da execução, em `getRunCost`, nos orçamentos por período e no `maxTokens` da execução — mesmo quando a etapa falha por causa dela:

- a chamada de ferramenta de um agente governado cujos argumentos não são JSON válido: `intention.generated` é registrado antes de a resposta ser lida;
- um pensamento cognitivo cuja resposta não passa na validação, correções incluídas, e uma operação que `stop()` ou o tempo limite da execução interrompe depois de tentativas cobradas (`cognition.operation_failed` com o `usage` delas, e `decision.evaluated` para as requisições de decisão tipada já respondidas);
- a chamada de um estudo cuja resposta não pode ser usada mesmo depois da sua correção, ou que uma parada ou um tempo limite interrompeu depois de tentativas cobradas: `study.model_called` com `failed` e o `usage` das tentativas respondidas;
- uma decisão tipada cuja resposta não corresponde às perguntas (uma escolha que não está entre as opções, uma resposta ausente ou de outro tipo): `decision.evaluated` com o `error` e `answers` vazio, depois `sdk.decisions` lança o erro, e um agente cognitivo recorre à alternativa como antes;
- uma resposta que um provedor descarta: uma resposta da OpenAI sem nenhuma escolha, que faz a chamada falhar ou passa a vez a um provedor de fallback (`provider.answer_discarded`, tanto nas execuções governadas quanto nos pensamentos cognitivos, ao preço do modelo que a deu).

Uma tentativa que falhou sem resposta — um erro HTTP, um tempo esgotado, uma conexão perdida, o que as novas tentativas e os failovers tratam — não informa consumo e não é contada. Uma resposta que não pôde ser usada de forma alguma (descartada, ou que não é um corpo de decisão válido) só é contada se o fornecedor informou o consumo dela. Uma resposta que chega exatamente quando a execução é cancelada é descartada pelo provedor sem o consumo dela, e também não é contada.

## De onde vem o consumo {#where-usage-comes-from}

| Evento | Origem | Campos |
| --- | --- | --- |
| `intention.generated` | Raciocínio nativo, seleção de ferramentas | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | Uma resposta que o provedor não pôde usar | `provider`, `model`, `requestedModel`, `usage` |
| `cognition.thought` | Operações cognitivas, incluindo correções e tentativas que falharam (uma tentativa anterior respondida, por meio de um provedor de reserva, por outro modelo que não o da última é registrada como um `provider.answer_discarded` quando informou o seu consumo) | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls`, `usage.unmeteredTokens` |
| `cognition.operation_failed` | Uma operação interrompida por uma parada ou um tempo limite depois de tentativas cobradas | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev e outros backends de decisões tipadas, incluindo respostas rejeitadas | `model`, `usage.inputTokens`, `usage.outputTokens` |
| `study.model_called` | As chamadas de um estudo: passagens, pedidos de pesquisa, verificações do guardião, verificações do estado da técnica e emendas, incluindo as correções (um evento para uma chamada e a sua correção; uma resposta que um provedor descartou é um `provider.answer_discarded`) | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls`, `usage.unmeteredTokens` |

A resposta final de uma execução cognitiva também é registrada como um evento `intention.generated` (`source: 'cognition'`): ela não é uma chamada ao modelo e não é contada.

Como o consumo fica nos eventos, você também pode calcular os custos por conta própria com `computeRunCost(runId, events, pricing)`, agregá-los por agente ou por dia, ou enviá-los ao seu faturamento.

## Orçamentos {#budgets}

O custo é só um lado; as políticas também podem limitar **etapas, tokens e chamadas de ferramentas** por agente, ferramenta e período — veja [Agentes governados](./governed-agents). Um `budgetLimit` com `maxCost` recusa as chamadas de ferramenta de um agente assim que as suas chamadas ao modelo custaram mais que o limite no período, com os preços acima, e também a etapa seguinte de um agente cognitivo e a etapa seguinte de um estudo (veja [Limites e políticas](./cognitive-agents#limits-and-policies)): uma chamada ao modelo já iniciada nunca é interrompida, e com `toolName` só essa ferramenta é recusada. Se um modelo não tem preço, ou uma chamada não informa os seus tokens, o limite não pode ser verificado e essas chamadas de ferramenta e essas etapas são recusadas. Um `maxCost` que não seja um número finito ≥ 0 (uma string como `'0.5'` lida de um arquivo de configuração, `NaN`, um valor negativo, `Infinity`, `null`) é recusado assim que a política é aplicada, com um `ValidationError`.

Os orçamentos contam as chamadas ao modelo que `getRunCost` lê, tal como as lê — incluindo as [chamadas que falham](#failed-calls), e uma chamada sem as suas duas contagens de tokens como uma chamada de custo desconhecido: as etapas de raciocínio de um agente governado; os pensamentos de um agente cognitivo (incluindo correções e tentativas que falharam), as suas seleções de ferramenta, as suas decisões tipadas e as suas operações interrompidas depois de tentativas cobradas; nos dois casos, as respostas que o provedor não pôde usar; as chamadas de um estudo (veja [Estudos](./studies#costs-and-budgets)); e as decisões tipadas tomadas com `sdk.decisions`, incluindo as respostas rejeitadas. Um limite com `agentId` conta as chamadas ao modelo desse agente (o `id` de um estudo, para um estudo) — e as chamadas de `sdk.decisions` que o nomeiam com `agentId`; sem `agentId`, conta todas, incluindo as decisões tipadas tomadas sem agente. Um orçamento nunca recusa uma chamada de `sdk.decisions`: ele recusa chamadas de ferramenta, as etapas dos agentes cognitivos e dos estudos, e a classificação da emenda de um estudo.
