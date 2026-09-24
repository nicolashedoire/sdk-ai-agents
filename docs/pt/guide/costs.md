# Custos de API

O SDK registra o consumo de tokens de cada chamada ao modelo **na execução que a fez** — seleção de ferramentas, pensamentos cognitivos e decisões tipadas — e o precifica por modelo.

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

Um modelo sem preço continua sendo contabilizado (chamadas e tokens) e listado em `unpricedModels`, e o relatório é marcado com `complete: false` — o SDK nunca inventa um preço.

## De onde vem o consumo {#where-usage-comes-from}

| Evento | Origem | Campos |
| --- | --- | --- |
| `intention.generated` | Raciocínio nativo, seleção de ferramentas | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | Operações cognitivas, incluindo correções e tentativas que falharam | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev e outros backends de decisões tipadas | `model`, `usage.inputTokens`, `usage.outputTokens` |

Como o consumo fica nos eventos, você também pode calcular os custos por conta própria com `computeRunCost(runId, events, pricing)`, agregá-los por agente ou por dia, ou enviá-los ao seu faturamento.

## Orçamentos {#budgets}

O custo é só um lado; as políticas também podem limitar **etapas, tokens e chamadas de ferramentas** por agente, ferramenta e período — veja [Agentes governados](./governed-agents). Os agentes cognitivos têm os seus próprios limites (`maxSteps`, `maxToolCalls`, `timeoutMs`). Um `budgetLimit` com `maxCost` recusa as chamadas de ferramenta de um agente governado assim que as suas chamadas ao modelo custaram mais que o limite no período, com os preços acima: uma chamada ao modelo nunca é recusada, e com `toolName` só essa ferramenta é. Se um modelo não tem preço, ou uma chamada não informa os seus tokens, o limite não pode ser verificado e as chamadas de ferramenta são recusadas.
