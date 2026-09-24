# Custos de API

O SDK registra o consumo de tokens de cada chamada ao modelo **na execução que a fez** — seleção de ferramentas, pensamentos cognitivos e decisões tipadas — e o precifica por modelo. Uma chamada conta assim que o fornecedor a responde, mesmo que o SDK depois faça a etapa falhar por causa dessa resposta (veja [Chamadas que falham](#failed-calls)).

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

As chaves são ids exatos de modelo ou prefixos terminados em `*`. Os provedores muitas vezes respondem com um id versionado (`gpt-4o-2024-08-06`) quando você pediu `gpt-4o`: o SDK registra os dois e procura primeiro o id devolvido, depois o nome solicitado — as chaves exatas antes dos prefixos, com o prefixo mais longo prevalecendo. Cuidado com os prefixos: `gpt-4o*` também corresponde a `gpt-4o-mini`, a menos que `gpt-4o-mini*` exista.

## Custos desconhecidos {#unknown-costs}

O SDK nunca inventa um preço, nem uma contagem de tokens. O custo de uma chamada é desconhecido em dois casos, e o relatório diz isso:

- **o modelo dela não tem preço**: as chamadas e os tokens continuam sendo contabilizados, o modelo é listado em `unpricedModels`, essas chamadas em `unpricedCalls`, e a linha dele não tem `costUsd`;
- **ela não informou nenhuma contagem de tokens** — nem de entrada nem de saída, como com um provedor que não devolve o consumo, ou só um total: ela é contada em `unmeteredCalls` (e no `unmeteredCalls` da sua linha), e o modelo em `unmeteredModels`. Ela nunca é tomada como zero token, e uma linha em que nenhuma chamada os informou também não tem `costUsd`.

Uma chamada sem contagem de tokens conta como não medida mesmo que o modelo tenha preço, como nos orçamentos. Assim que o custo de alguma chamada é desconhecido, o relatório é marcado com `complete: false` e `totalUsd` soma apenas as chamadas cujo custo é conhecido: é um mínimo, não o custo da execução.

## Chamadas que falham {#failed-calls}

Uma chamada que o fornecedor respondeu é cobrada, seja o que for que o SDK faça depois com a resposta. Ela é registrada e contabilizada — nos eventos da execução, em `getRunCost` e, nos agentes governados, nos orçamentos por período e no `maxTokens` da execução — mesmo quando a etapa falha por causa dela:

- a chamada de ferramenta de um agente governado cujos argumentos não são JSON válido: `intention.generated` é registrado antes de a resposta ser lida;
- um pensamento cognitivo cuja resposta não passa na validação, correções incluídas, e uma operação que `stop()` ou o tempo limite da execução interrompe depois de tentativas cobradas (`cognition.operation_failed` com o `usage` delas, e `decision.evaluated` para as requisições de decisão tipada já respondidas);
- uma decisão tipada cuja resposta não corresponde às perguntas (uma escolha que não está entre as opções, uma resposta ausente ou de outro tipo): `decision.evaluated` com o `error` e `answers` vazio, depois `sdk.decisions` lança o erro, e um agente cognitivo recorre à alternativa como antes;
- uma resposta que um provedor descarta: uma resposta da OpenAI sem nenhuma escolha, que faz a chamada falhar ou passa a vez a um provedor de fallback (`provider.answer_discarded`, tanto nas execuções governadas quanto nos pensamentos cognitivos, ao preço do modelo que a deu).

Uma tentativa que falhou sem resposta — um erro HTTP, um tempo esgotado, uma conexão perdida, o que as novas tentativas e os failovers tratam — não informa consumo e não é contada. Uma resposta que não pôde ser usada de forma alguma (descartada, ou que não é um corpo de decisão válido) só é contada se o fornecedor informou o consumo dela. Uma resposta que chega exatamente quando a execução é cancelada é descartada pelo provedor sem o consumo dela, e também não é contada.

## De onde vem o consumo {#where-usage-comes-from}

| Evento | Origem | Campos |
| --- | --- | --- |
| `intention.generated` | Raciocínio nativo, seleção de ferramentas | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | Uma resposta que o provedor não pôde usar | `provider`, `model`, `usage` |
| `cognition.thought` | Operações cognitivas, incluindo correções e tentativas que falharam | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls` |
| `cognition.operation_failed` | Uma operação interrompida por uma parada ou um tempo limite depois de tentativas cobradas | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev e outros backends de decisões tipadas, incluindo respostas rejeitadas | `model`, `usage.inputTokens`, `usage.outputTokens` |

A resposta final de uma execução cognitiva também é registrada como um evento `intention.generated` (`source: 'cognition'`): ela não é uma chamada ao modelo e não é contada.

Como o consumo fica nos eventos, você também pode calcular os custos por conta própria com `computeRunCost(runId, events, pricing)`, agregá-los por agente ou por dia, ou enviá-los ao seu faturamento.

## Orçamentos {#budgets}

O custo é só um lado; as políticas também podem limitar **etapas, tokens e chamadas de ferramentas** por agente, ferramenta e período — veja [Agentes governados](./governed-agents). Os agentes cognitivos têm os seus próprios limites (`maxSteps`, `maxToolCalls`, `timeoutMs`). Um `budgetLimit` com `maxCost` recusa as chamadas de ferramenta de um agente governado assim que as suas chamadas ao modelo custaram mais que o limite no período, com os preços acima: uma chamada ao modelo nunca é recusada, e com `toolName` só essa ferramenta é. Se um modelo não tem preço, ou uma chamada não informa os seus tokens, o limite não pode ser verificado e as chamadas de ferramenta são recusadas. Um `maxCost` que não seja um número finito ≥ 0 (uma string como `'0.5'` lida de um arquivo de configuração, `NaN`, um valor negativo, `Infinity`, `null`) é recusado assim que a política é aplicada, com um `ValidationError`. Um limite com `agentId` conta as chamadas ao modelo desse agente; sem `agentId`, conta as de todos os agentes governados. Esses orçamentos também contam as [chamadas que falham](#failed-calls) dos agentes governados.
