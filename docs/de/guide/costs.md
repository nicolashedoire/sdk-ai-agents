# API-Kosten

Das SDK zeichnet den Token-Verbrauch jedes Modellaufrufs **in dem Lauf auf, der ihn ausgelöst hat** – Tool-Auswahl, kognitive Gedanken und typisierte Entscheidungen – und bepreist ihn pro Modell.

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

## Preise {#prices}

LLM-Preise ändern sich oft und hängen von Ihrem Vertrag ab, deshalb sind sie **Konfiguration, kein Code**. Nur Preise, die anhand der Dokumentation des Anbieters geprüft wurden, werden als Standardwerte mitgeliefert – derzeit Jev (0,042 $ pro Million Eingabe-Tokens, Ausgabe kostenlos, geprüft am 23.09.2026), sowohl unter seinen TypeSafe-Kennungen (`jev-*`) als auch über Vercel AI Gateway (`typesafe-ai/jev`).

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

Schlüssel sind exakte Modellkennungen oder Präfixe, die auf `*` enden. Anbieter antworten oft mit einer versionierten Kennung (`gpt-4o-2024-08-06`), während Sie `gpt-4o` angefragt haben: Das SDK zeichnet beide auf und sucht zuerst nach der zurückgegebenen Kennung, dann nach dem angefragten Namen – exakte Schlüssel vor Präfixen, wobei das längste Präfix gewinnt. Seien Sie vorsichtig mit Präfixen: `gpt-4o*` passt auch auf `gpt-4o-mini`, sofern es kein `gpt-4o-mini*` gibt.

Ein Modell ohne Preis wird trotzdem gezählt (Aufrufe und Tokens) und in `unpricedModels` aufgeführt, und der Bericht wird mit `complete: false` markiert – das SDK erfindet nie einen Preis.

## Woher der Verbrauch stammt {#where-usage-comes-from}

| Ereignis | Quelle | Felder |
| --- | --- | --- |
| `intention.generated` | Natives Reasoning, Tool-Auswahl | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | Kognitive Operationen, einschließlich Reparaturen und fehlgeschlagener Versuche | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev und andere Backends für typisierte Entscheidungen | `model`, `usage.inputTokens`, `usage.outputTokens` |

Da der Verbrauch in Ereignissen steht, können Sie die Kosten auch selbst mit `computeRunCost(runId, events, pricing)` berechnen, sie pro Agent oder pro Tag aggregieren oder in Ihre Abrechnung einspeisen.

## Budgets {#budgets}

Kosten sind nur eine Seite; Richtlinien können außerdem **Schritte, Tokens und Tool-Aufrufe** pro Agent, Tool und Zeitraum begrenzen – siehe [Kontrollierte Agenten](./governed-agents). Kognitive Agenten haben ihre eigenen Limits (`maxSteps`, `maxToolCalls`, `timeoutMs`).
