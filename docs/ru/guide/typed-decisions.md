# Типизированные решения (Jev)

Некоторым вопросам не нужна проза. *Это срочно? Какая команда? Насколько это рискованно?* **Типизированное решение** задаёт модели узкий вопрос о контексте и возвращает структурированный откалиброванный ответ, на основе которого может действовать ваш код.

SDK интегрирует [TypeSafe Jev](https://docs.typesafe.ai), первую модель класса «System One», и любой бэкенд, предоставляющий тот же контракт (`POST /v1/systemone`), — включая самостоятельно размещённые клоны с открытым исходным кодом.

![Типизированные решения](/images/typed-decisions.svg){.illustration}

## Настройка {#configure}

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

| Параметр | По умолчанию | |
| --- | --- | --- |
| `apiKey` | — | Ключ TypeSafe для `api.typesafe.ai` или ключ AI Gateway для шлюза (см. ниже); необязателен для самостоятельно размещённого клона без ключа |
| `baseUrl` | `https://api.typesafe.ai` | Любой сервер, предоставляющий `POST /v1/systemone` |
| `model` | `jev-latest` | Закрепите идентификатор с версией, чтобы зафиксировать поведение |
| `timeoutMs` | `30000` | На одну попытку |
| `maxRetries` | `2` | При 408, 429, 5xx, 529 и сетевых ошибках, с учётом `retry-after` |
| `fetch` | глобальный `fetch` | Передайте транспорт, поддерживающий прокси |

### Через Vercel AI Gateway {#through-vercel-ai-gateway}

Jev также доступен через [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) под именем `typesafe-ai/jev`, с API, совместимым с TypeSafe. Используйте ключ AI Gateway вместо ключа TypeSafe; запросы оплачиваются с вашего аккаунта Vercel по той же цене ($0,042 за миллион входных токенов, выходные бесплатно). У AI Gateway также есть бесплатный тариф с ежемесячным кредитом для части моделей: входит ли в него Jev, смотрите на странице [его тарифов](https://vercel.com/docs/ai-gateway/pricing).

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

Больше ничего не меняется: `sdk.decisions`, типизированный контроллер и типизированный оценщик гипотез работают так же, а затраты отображаются под именем `typesafe-ai/jev`.

Или подключите через `decisionClient` любой бэкенд, реализующий `TypedDecisionClient`.

## Передайте свой контекст {#inject-your-context}

`context` — это то, что оценивает модель: простой текст или структурированные данные — тикет, журнал чата, запись, состояние вашего приложения. В вопросах ссылайтесь на его поля по имени в обратных кавычках.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## Одиночный выбор {#single-choice}

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

`confident` вычисляется **в вашем коде** по уверенности ответа. Когда оно равно `false`, направьте запрос человеку или более сильной модели — это шаблон *маршрутизации по уверенности* (confidence-gated routing).

## Множественный выбор {#multiple-choice}

Могут подойти сразу несколько вариантов? `selectMany` превращает каждый вариант в отдельный вопрос «да/нет», отправляет их **одним запросом** и применяет ваш порог:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## «Да/нет» и оценки по шкале {#yes-no-and-ratings}

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

## Много вопросов, один запрос {#many-questions-one-request}

Jev читает контекст один раз и отвечает на все вопросы параллельно. Используйте `ask` с помощниками `noul`, `choice` и `score` — типы ответов выводятся автоматически:

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

## Внутри когнитивных агентов {#inside-cognitive-agents}

Если бэкенд решений настроен, когнитивные агенты используют его автоматически:

- **контроллер** — на каждом шаге один запрос спрашивает, какая доступная операция идёт следующей (Choice), и готово ли рассуждение к решению (Noul);
- **сравнение** — `compare` запрашивает поддержку каждой гипотезы доказательствами в запросе **без** профиля мыслителя, затем, только для предложений, их соответствие мыслителю во втором запросе. Две оценки хранятся раздельно: соответствие меняет порядок предложений (`limits.preferenceWeight`, по умолчанию 0,4) и позволяет зафиксировать предложение, которое мыслитель явно предпочитает, при правдоподобных доказательствах (`limits.minProposalSupport`), но никогда не влияет на правдоподобие утверждения — см. [Доказательства и проверка](./evidence-and-verification#evidence-is-not-preference).

Оба при неуверенности или недоступности Jev переходят на LLM или эвристический контроллер.

## Прослеживаемость и стоимость {#traceability-and-cost}

Каждое типизированное решение записывается как событие `decision.evaluated` с контекстом, вопросами, ответами и расходом токенов — в переданный вами `runId` или в отдельный поток `decision_*`. Jev стоит **$0,042 за миллион входных токенов, выходные бесплатно** (согласно документации на 2026-09-23), поэтому `sdk.getRunCost(runId)` учитывает его сразу.

## Рекомендации {#good-practice}

Jev понимает всё буквально и слаб в арифметике, подсчёте и сравнении дат. Держите числа в коде, задавайте по одному атомарному вопросу за раз, пишите критерии, которые точно описывают каждый вариант, и оставляйте в контексте только то, что нужно для вопроса. См. [известные ограничения](https://docs.typesafe.ai/model-jaggedness/jev-1.13) TypeSafe.
