# Decisões tipadas (Jev)

Algumas perguntas não precisam de texto corrido. *Isto é urgente? Qual equipe? Qual o nível de risco?* Uma **decisão tipada** faz a um modelo uma pergunta bem delimitada sobre um contexto e devolve uma resposta estruturada e calibrada com a qual o seu código pode agir.

O SDK integra o [TypeSafe Jev](https://docs.typesafe.ai), o primeiro modelo "System One", e qualquer backend que exponha o mesmo contrato (`POST /v1/systemone`) — incluindo clones open source auto-hospedados.

![Decisões tipadas](/images/typed-decisions.svg){.illustration}

## Configurar {#configure}

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: 'jev-latest',        // pin 'jev-1.13.0' once you tune thresholds
    // baseUrl: 'http://localhost:8080', // a compatible self-hosted clone (no key needed)
  },
});
```

| Opção | Padrão | |
| --- | --- | --- |
| `apiKey` | — | Uma chave da TypeSafe para `api.typesafe.ai`, ou uma chave do AI Gateway para o gateway (veja abaixo); opcional para um clone auto-hospedado sem chave |
| `baseUrl` | `https://api.typesafe.ai` | Qualquer servidor que exponha `POST /v1/systemone` |
| `model` | `jev-latest` | Fixe um id versionado para congelar o comportamento |
| `timeoutMs` | `30000` | Por tentativa |
| `maxRetries` | `2` | Em 408, 429, 5xx, 529 e erros de rede, respeitando `retry-after` |
| `fetch` | `fetch` global | Injete um transporte compatível com proxy |

### Pelo Vercel AI Gateway {#through-vercel-ai-gateway}

O Jev também é servido pelo [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) com o nome `typesafe-ai/jev`, com uma API compatível com a da TypeSafe. Use uma chave do AI Gateway em vez de uma chave da TypeSafe; as requisições são cobradas na sua conta da Vercel pelo mesmo preço (US$ 0,042 por milhão de tokens de entrada, saída gratuita). O AI Gateway também tem um plano gratuito com um crédito mensal para um subconjunto de modelos: veja [os preços dele](https://vercel.com/docs/ai-gateway/pricing) para saber se o Jev está incluído.

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseUrl: 'https://ai-gateway.vercel.sh/typesafe',
    model: 'typesafe-ai/jev',
  },
});
```

Nada mais muda: `sdk.decisions`, o controlador tipado e o avaliador de hipóteses tipado funcionam da mesma forma, e os custos são relatados sob `typesafe-ai/jev`.

Ou traga qualquer backend que implemente `TypedDecisionClient`, com `decisionClient`.

## Injete o seu contexto {#inject-your-context}

O `context` é o que o modelo avalia: texto simples ou dados estruturados — um ticket, um histórico de chat, um registro, o estado da sua aplicação. Nas suas perguntas, refira-se aos campos dele pelo nome, entre crases.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## Escolha única {#single-choice}

```ts
const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle `messages`?',
  options: {
    billing: 'Payments, invoices, refunds',
    technical: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades',
  },
  minConfidence: 0.5,
});
// { choice: 'billing', confidence: 0.81, probabilities: { billing: 0.88, … }, confident: true, runId }
```

`confident` é calculado **no seu código** a partir da confiança da resposta. Quando é `false`, encaminhe para um humano ou para um modelo mais forte — é o padrão de *roteamento condicionado à confiança* (confidence-gated routing).

## Múltipla escolha {#multiple-choice}

Várias opções podem valer ao mesmo tempo? `selectMany` transforma cada opção em uma pergunta de sim/não própria, envia todas **em uma única requisição** e aplica o seu limiar:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## Sim / não e avaliações em escala {#yes-no-and-ratings}

```ts
const refund = await sdk.decisions.check({
  context: ticket,
  question: 'Is the customer asking for a refund?',
  criteria: { true: 'Explicitly asks for money back', false: 'No refund requested' },
  threshold: 0.8,
});

const urgency = await sdk.decisions.rate({
  context: ticket,
  question: 'How urgent is this ticket?',
  levels: ['Can wait', 'This week', 'Today'], // lowest first, 2 to 10 levels
});
// { score: 1.82, normalized: 0.91, level: 'Today', confidence: 0.9 }
```

## Muitas perguntas, uma requisição {#many-questions-one-request}

O Jev lê o contexto uma vez e responde a todas as perguntas em paralelo. Use `ask` com os helpers `noul`, `choice` e `score` — os tipos das respostas são inferidos:

```ts
import { choice, noul, score } from '@sdk-ai-agents/core';

const { answers } = await sdk.decisions.ask({
  context: ticket,
  questions: {
    urgent: noul('Does `messages` convey urgency?'),
    team: choice('Which team should handle it?', { billing: null, technical: null }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Annoyed', 'Angry']),
  },
});
answers.urgent.noul;          // number
answers.team.choice;          // 'billing' | 'technical'
answers.frustration.score;    // number
```

## Dentro dos agentes cognitivos {#inside-cognitive-agents}

Com um backend de decisões configurado, os agentes cognitivos o usam automaticamente:

- **controlador** — a cada etapa, uma requisição pergunta qual operação disponível vem em seguida (Choice) e se o raciocínio está pronto para decidir (Noul);
- **comparação** — `compare` pergunta o suporte das evidências de cada hipótese em uma requisição **sem** o perfil do pensador e depois, apenas para as propostas, a adequação delas ao pensador em uma segunda requisição. As duas notas são mantidas separadas: a adequação reordena as propostas (`limits.preferenceWeight`, 0,4 por padrão) e permite que uma proposta que o pensador claramente prefere seja firmada com evidências plausíveis (`limits.minProposalSupport`), nunca a credibilidade de uma afirmação — veja [Evidências e verificação](./evidence-and-verification#evidence-is-not-preference).

Ambos recorrem ao LLM ou ao controlador heurístico quando o Jev não tem certeza ou está indisponível.

## Rastreabilidade e custo {#traceability-and-cost}

Cada decisão tipada é gravada como um evento `decision.evaluated` com o seu contexto, perguntas, respostas e consumo de tokens — no `runId` que você passar, ou em um fluxo `decision_*` dedicado. O Jev custa **US$ 0,042 por milhão de tokens de entrada, com saída gratuita** (conforme documentado em 2026-09-23), então `sdk.getRunCost(runId)` já o inclui desde o início.

## Boas práticas {#good-practice}

O Jev lê de forma literal e é fraco em aritmética, contagem e comparação de datas. Mantenha os números no código, faça uma pergunta atômica por vez, escreva critérios que descrevam cada opção com precisão e filtre o contexto para o que a pergunta precisa. Veja as [limitações conhecidas](https://docs.typesafe.ai/model-jaggedness/jev-1.13) documentadas pela TypeSafe.
