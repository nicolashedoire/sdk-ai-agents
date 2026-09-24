# Decisiones tipadas (Jev)

Algunas preguntas no necesitan prosa. *¿Es urgente? ¿Qué equipo? ¿Qué nivel de riesgo?* Una **decisión tipada** hace a un modelo una pregunta acotada sobre un contexto y devuelve una respuesta estructurada y calibrada sobre la que tu código puede actuar.

El SDK integra [TypeSafe Jev](https://docs.typesafe.ai), el primer modelo "System One", y cualquier backend que exponga el mismo contrato (`POST /v1/systemone`) — incluidos los clones de código abierto autoalojados.

![Decisiones tipadas](/images/typed-decisions.svg){.illustration}

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

| Opción | Por defecto | |
| --- | --- | --- |
| `apiKey` | — | Una clave de TypeSafe para `api.typesafe.ai`, o una clave de AI Gateway para la pasarela (ver más abajo); opcional para un clon autoalojado sin clave |
| `baseUrl` | `https://api.typesafe.ai` | Cualquier servidor que exponga `POST /v1/systemone` |
| `model` | `jev-latest` | Fija un identificador versionado para congelar el comportamiento |
| `timeoutMs` | `30000` | Por intento |
| `maxRetries` | `2` | Ante 408, 429, 5xx, 529 y errores de red, respetando `retry-after` |
| `retryBaseDelayMs` | `500` | Primera espera, duplicada en cada reintento |
| `maxRetryDelayMs` | `30000` | Límite de cada espera, incluido `retry-after` |
| `fetch` | `fetch` global | Inyecta un transporte compatible con proxies |

### A través de Vercel AI Gateway {#through-vercel-ai-gateway}

Jev también se sirve a través de [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) con el nombre `typesafe-ai/jev`, con una API compatible con TypeSafe. Usa una clave de AI Gateway en lugar de una clave de TypeSafe; las solicitudes se facturan en tu cuenta de Vercel al mismo precio (0,042 $ por millón de tokens de entrada, salida gratuita). AI Gateway también tiene un nivel gratuito con un crédito mensual para un subconjunto de modelos: consulta [sus precios](https://vercel.com/docs/ai-gateway/pricing) para saber si Jev está incluido.

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

No cambia nada más: `sdk.decisions`, el controlador tipado y el valorador tipado funcionan igual, y los costes se notifican bajo `typesafe-ai/jev`.

O trae cualquier backend que implemente `TypedDecisionClient` con `decisionClient`.

## Inyecta tu contexto {#inject-your-context}

El `context` es lo que evalúa el modelo: texto plano o datos estructurados — un ticket, el registro de un chat, un registro de base de datos, el estado de tu aplicación. Refiérete a sus campos por su nombre, entre comillas invertidas, en tus preguntas.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## Opción única {#single-choice}

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

`confident` se calcula **en tu código** a partir de la confianza de la respuesta. Cuando es `false`, deriva a una persona o a un modelo más potente — es el patrón de *enrutamiento condicionado por la confianza* (confidence-gated routing).

## Opción múltiple {#multiple-choice}

¿Pueden aplicarse varias opciones a la vez? `selectMany` convierte cada opción en su propia pregunta de sí/no, las envía **en una sola solicitud** y aplica tu umbral:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## Sí / no y valoraciones {#yes-no-and-ratings}

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

## Muchas preguntas, una sola solicitud {#many-questions-one-request}

Jev lee el contexto una vez y responde a todas las preguntas en paralelo. Usa `ask` con los helpers `noul`, `choice` y `score` — los tipos de respuesta se infieren:

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

## Dentro de los agentes cognitivos {#inside-cognitive-agents}

Con un backend de decisiones configurado, los agentes cognitivos lo usan automáticamente:

- **controlador** — en cada paso, una solicitud pregunta qué operación disponible viene a continuación (Choice) y si el razonamiento está listo para decidir (Noul);
- **comparación** — `compare` pide el respaldo de la evidencia de cada hipótesis en una solicitud **sin** el perfil del pensador y después, solo para las propuestas, su ajuste al pensador en una segunda solicitud. Las dos puntuaciones se mantienen separadas: el ajuste reordena las propuestas (`limits.preferenceWeight`, 0,4 por defecto) y permite que una propuesta que el pensador prefiere claramente se adopte en firme con una evidencia plausible (`limits.minProposalSupport`), nunca cambia la credibilidad de una afirmación — consulta [Evidencia y verificación](./evidence-and-verification#evidence-is-not-preference).

Ambos recurren al LLM o al controlador heurístico cuando Jev no está seguro o no está disponible.

## Trazabilidad y coste {#traceability-and-cost}

Cada decisión tipada se escribe como un evento `decision.evaluated` con su contexto, sus preguntas, sus respuestas y su consumo de tokens — en el `runId` que pases, o en un flujo `decision_*` dedicado. Jev cuesta **0,042 $ por millón de tokens de entrada, salida gratuita** (según la documentación a 2026-09-23), así que `sdk.getRunCost(runId)` lo incluye desde el primer momento. Cada decisión cuenta también en los presupuestos por periodo — para el `agentId` que nombra, y en los límites que no nombran ningún agente — y un presupuesto nunca la rechaza (consulta [Costes de API](./costs#budgets)).

Una respuesta que no corresponde a las preguntas (una opción que no está entre las ofrecidas, una respuesta ausente o de otro tipo) se facturó igualmente: también se registra, con su `error` y `answers` vacío, antes de lanzar el error. Cuando el backend no informa de ningún número de tokens, el evento no tiene `usage` y el coste de la llamada se indica como desconocido, nunca como 0 $ — consulta [Costes de API](./costs#unknown-costs).

## Buenas prácticas {#good-practice}

Jev lee de forma literal y es flojo en aritmética, recuentos y comparación de fechas. Mantén los números en el código, haz una sola pregunta atómica cada vez, escribe criterios que describan con precisión cada opción, y filtra el contexto a lo que necesita la pregunta. Consulta las [limitaciones conocidas](https://docs.typesafe.ai/model-jaggedness/jev-1.13) de TypeSafe.
