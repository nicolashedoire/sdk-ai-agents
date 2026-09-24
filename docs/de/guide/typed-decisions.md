# Typisierte Entscheidungen (Jev)

Manche Fragen brauchen keine Prosa. *Ist das dringend? Welches Team? Wie riskant?* Eine **typisierte Entscheidung** stellt einem Modell eine eng gefasste Frage zu einem Kontext und liefert eine strukturierte, kalibrierte Antwort, auf die Ihr Code reagieren kann.

Das SDK integriert [TypeSafe Jev](https://docs.typesafe.ai), das erste „System One“-Modell, und jedes Backend, das denselben Vertrag bereitstellt (`POST /v1/systemone`) – einschließlich selbst gehosteter Open-Source-Klone.

![Typisierte Entscheidungen](/images/typed-decisions.svg){.illustration}

## Konfigurieren {#configure}

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

| Option | Standard | |
| --- | --- | --- |
| `apiKey` | — | Ein TypeSafe-Schlüssel für `api.typesafe.ai` oder ein AI-Gateway-Schlüssel für das Gateway (siehe unten); optional für einen selbst gehosteten Klon ohne Schlüssel |
| `baseUrl` | `https://api.typesafe.ai` | Jeder Server, der `POST /v1/systemone` bereitstellt |
| `model` | `jev-latest` | Eine versionierte Kennung festlegen, um das Verhalten einzufrieren |
| `timeoutMs` | `30000` | Pro Versuch |
| `maxRetries` | `2` | Bei 408, 429, 5xx, 529 und Netzwerkfehlern, unter Beachtung von `retry-after` |
| `retryBaseDelayMs` | `500` | Erste Wartezeit, bei jeder Wiederholung verdoppelt |
| `maxRetryDelayMs` | `30000` | Obergrenze jeder Wartezeit, auch für `retry-after` |
| `fetch` | globales `fetch` | Einen proxyfähigen Transport einsetzen |

### Über Vercel AI Gateway {#through-vercel-ai-gateway}

Jev wird auch von [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) unter dem Namen `typesafe-ai/jev` angeboten, mit einer TypeSafe-kompatiblen API. Verwenden Sie einen AI-Gateway-Schlüssel statt eines TypeSafe-Schlüssels; die Anfragen werden über Ihr Vercel-Konto zum selben Preis abgerechnet (0,042 $ pro Million Eingabe-Tokens, Ausgabe kostenlos). AI Gateway hat außerdem eine kostenlose Stufe mit einem monatlichen Guthaben für eine Auswahl von Modellen: Ob Jev dazugehört, entnehmen Sie [der Preisübersicht](https://vercel.com/docs/ai-gateway/pricing).

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

Sonst ändert sich nichts: `sdk.decisions`, der typisierte Controller und der typisierte Assessor funktionieren genauso, und die Kosten werden unter `typesafe-ai/jev` ausgewiesen.

Oder bringen Sie mit `decisionClient` ein beliebiges Backend mit, das `TypedDecisionClient` implementiert.

## Ihren Kontext übergeben {#inject-your-context}

Der `context` ist das, was das Modell bewertet: einfacher Text oder strukturierte Daten – ein Ticket, ein Chatverlauf, ein Datensatz, der Zustand Ihrer Anwendung. Verweisen Sie in Ihren Fragen mit Backticks und Namen auf seine Felder.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## Einfachauswahl {#single-choice}

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

`confident` wird **in Ihrem Code** aus der Konfidenz der Antwort berechnet. Ist es `false`, leiten Sie an einen Menschen oder ein stärkeres Modell weiter – das ist das Muster des *konfidenzgesteuerten Routings* (confidence-gated routing).

## Mehrfachauswahl {#multiple-choice}

Können mehrere Optionen gleichzeitig zutreffen? `selectMany` macht aus jeder Option eine eigene Ja/Nein-Frage, sendet sie **in einer Anfrage** und wendet Ihre Schwelle an:

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## Ja / Nein und Bewertungen {#yes-no-and-ratings}

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

## Viele Fragen, eine Anfrage {#many-questions-one-request}

Jev liest den Kontext einmal und beantwortet alle Fragen parallel. Verwenden Sie `ask` mit den Hilfsfunktionen `noul`, `choice` und `score` – die Antworttypen werden abgeleitet:

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

## In kognitiven Agenten {#inside-cognitive-agents}

Ist ein Entscheidungs-Backend konfiguriert, verwenden kognitive Agenten es automatisch:

- **Controller** – bei jedem Schritt fragt eine Anfrage, welche verfügbare Operation als Nächstes kommt (Choice) und ob das Denken bereit für eine Entscheidung ist (Noul);
- **Vergleich** – `compare` fragt die Evidenzstützung jeder Hypothese in einer Anfrage **ohne** das Profil des Denkers ab, dann, nur für Vorschläge, ihre Passung zum Denker in einer zweiten Anfrage. Die beiden Werte bleiben getrennt: Die Passung ordnet Vorschläge neu (`limits.preferenceWeight`, standardmäßig 0,4) und lässt einen Vorschlag, den der Denker klar bevorzugt, auf Grundlage plausibler Belege verbindlich werden (`limits.minProposalSupport`), nie aber die Glaubwürdigkeit einer Aussage – siehe [Belege & Verifikation](./evidence-and-verification#evidence-is-not-preference).

Beide fallen auf das LLM oder den heuristischen Controller zurück, wenn Jev unsicher oder nicht verfügbar ist.

## Nachvollziehbarkeit und Kosten {#traceability-and-cost}

Jede typisierte Entscheidung wird als Ereignis `decision.evaluated` mit ihrem Kontext, ihren Fragen, Antworten und dem Token-Verbrauch geschrieben – in der `runId`, die Sie übergeben, oder in einem eigenen Strom `decision_*`. Jev kostet **0,042 $ pro Million Eingabe-Tokens, Ausgabe kostenlos** (Stand der Dokumentation vom 23.09.2026), sodass `sdk.getRunCost(runId)` es von Haus aus einbezieht.

## Gute Praxis {#good-practice}

Jev liest wörtlich und ist schwach bei Arithmetik, Zählen und Datumsvergleichen. Behalten Sie Zahlen im Code, stellen Sie jeweils eine atomare Frage, schreiben Sie Kriterien, die jede Option genau beschreiben, und filtern Sie den Kontext auf das, was die Frage braucht. Siehe die [bekannten Einschränkungen](https://docs.typesafe.ai/model-jaggedness/jev-1.13) von TypeSafe.
