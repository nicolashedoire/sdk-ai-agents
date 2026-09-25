# API-Kosten

Das SDK zeichnet den Token-Verbrauch jedes Modellaufrufs **in dem Lauf auf, der ihn ausgelöst hat** – Tool-Auswahl, kognitive Gedanken, typisierte Entscheidungen und die Aufrufe einer Studie – und bepreist ihn pro Modell. Ein Aufruf zählt, sobald der Hersteller ihn beantwortet hat, auch wenn das SDK den Schritt danach an dieser Antwort scheitern lässt (siehe [Fehlgeschlagene Aufrufe](#failed-calls)).

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

Schlüssel sind exakte Modellkennungen oder Präfixe, die auf `*` enden. Anbieter antworten oft mit einer versionierten Kennung (`gpt-4o-2024-08-06`), während Sie `gpt-4o` angefragt haben: Das SDK zeichnet beide auf und sucht zuerst nach der zurückgegebenen Kennung, dann nach dem angefragten Namen – exakte Schlüssel vor Präfixen, wobei das längste Präfix gewinnt. Seien Sie vorsichtig mit Präfixen: `gpt-4o*` passt auch auf `gpt-4o-mini`, sofern es kein `gpt-4o-mini*` gibt. Jeder Aufruf wird nach seinen eigenen Namen bepreist, auch eine Antwort, die ein Anbieter verworfen hat: Aufrufe eines Modells, das unter einem anderen Namen oder ohne Namen angefragt wurde, haben eine eigene Zeile.

## Unbekannte Kosten {#unknown-costs}

Das SDK erfindet nie einen Preis und nie eine Token-Anzahl. Die Kosten eines Aufrufs sind in zwei Fällen unbekannt, und der Bericht sagt es:

- **sein Modell hat keinen Preis**: Seine Aufrufe und Tokens werden trotzdem gezählt, das Modell wird in `unpricedModels` aufgeführt, diese Aufrufe in `unpricedCalls`, und seine Zeile hat kein `costUsd`;
- **er hat nicht sowohl seine Eingabe- als auch seine Ausgabe-Tokens gemeldet** – etwa bei einem Anbieter, der keinen Verbrauch zurückgibt, nur eine Summe oder nur eine der beiden Zahlen: Er wird in `unmeteredCalls` gezählt (und im `unmeteredCalls` seiner Zeile), sein Modell in `unmeteredModels`. Er wird nie als null Tokens gewertet, und eine Zeile, von deren Aufrufen keiner sie gemeldet hat, hat ebenfalls kein `costUsd`.

Ein Aufruf ohne diese beiden Zahlen gilt als ungemessen, auch wenn sein Modell einen Preis hat, so wie Budgets ihn zählen. Sobald die Kosten eines Aufrufs unbekannt sind, wird der Bericht mit `complete: false` markiert, und `totalUsd` addiert nur die Aufrufe mit bekannten Kosten: eine Untergrenze, nicht die Kosten des Laufs.

Die Tokens eines gemessenen Aufrufs sind seine Eingabe- und Ausgabe-Tokens, gleich welche Summe der Hersteller außerdem angibt. Die eines ungemessenen Aufrufs sind das Größere aus seiner Summe und den Eingabe- oder Ausgabe-Tokens, die er gemeldet hat, nie weniger, als er nach eigener Angabe verbraucht hat: Sie zählen als Tokens (im `unmeteredTokens` der Zeile, in den Budgets und im `maxTokens` eines Laufs), nie als Kosten. Ein Wert, der keine Zahl größer oder gleich 0 ist (`null`, eine negative Zahl), gilt als fehlend und verdeckt die anderen nicht.

## Fehlgeschlagene Aufrufe {#failed-calls}

Ein Aufruf, den der Hersteller beantwortet hat, wird berechnet, was auch immer das SDK danach mit der Antwort macht. Er wird aufgezeichnet und gezählt – in den Ereignissen des Laufs, in `getRunCost`, in den Budgets pro Zeitraum und im `maxTokens` des Laufs –, auch wenn der Schritt an ihm scheitert:

- ein Tool-Aufruf eines kontrollierten Agenten, dessen Argumente kein gültiges JSON sind: `intention.generated` wird aufgezeichnet, bevor die Antwort gelesen wird;
- ein kognitiver Gedanke, dessen Antwort die Validierung nicht besteht, einschließlich Reparaturen, und eine Operation, die `stop()` oder das Zeitlimit des Laufs nach berechneten Versuchen abbricht (`cognition.operation_failed` mit ihrem `usage`, und `decision.evaluated` für die bereits beantworteten Anfragen typisierter Entscheidungen);
- ein Aufruf einer Studie, dessen Antwort selbst nach ihrer Reparatur nicht verwendbar ist oder den ein Stopp oder ein Zeitlimit nach berechneten Versuchen abgebrochen hat: `study.model_called` mit `failed` und dem `usage` der beantworteten Versuche;
- eine typisierte Entscheidung, deren Antwort nicht zu ihren Fragen passt (eine Wahl, die keine der Optionen ist, eine fehlende Antwort oder eine vom falschen Typ): `decision.evaluated` mit dem `error` und leeren `answers`, danach wirft `sdk.decisions` den Fehler, und ein kognitiver Agent weicht wie bisher auf seine Alternative aus;
- eine Antwort, die ein Anbieter verwirft: eine OpenAI-Antwort ohne jede Auswahl, an der der Aufruf scheitert oder nach der ein Fallback-Anbieter übernimmt (`provider.answer_discarded`, in kontrollierten Läufen wie in kognitiven Gedanken, zum Preis des Modells, das sie gegeben hat).

Ein Versuch, der ohne Antwort fehlschlug – ein HTTP-Fehler, eine Zeitüberschreitung, eine verlorene Verbindung, also das, was Wiederholungsversuche und Failover behandeln –, meldet keinen Verbrauch und wird nicht gezählt. Eine Antwort, die überhaupt nicht verwendbar war (verworfen, oder kein gültiger Entscheidungs-Body), wird nur gezählt, wenn der Hersteller ihren Verbrauch gemeldet hat. Eine Antwort, die genau beim Abbruch des Laufs eintrifft, verwirft der Anbieter ohne ihren Verbrauch; auch sie wird nicht gezählt.

## Woher der Verbrauch stammt {#where-usage-comes-from}

| Ereignis | Quelle | Felder |
| --- | --- | --- |
| `intention.generated` | Natives Reasoning, Tool-Auswahl | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | Eine Antwort, die der Anbieter nicht verwenden konnte | `provider`, `model`, `requestedModel`, `usage` |
| `cognition.thought` | Kognitive Operationen, einschließlich Reparaturen und fehlgeschlagener Versuche (ein früherer Versuch, den über einen Ausweichanbieter ein anderes Modell als das des letzten beantwortet hat, wird als `provider.answer_discarded` aufgezeichnet, wenn er seinen Verbrauch gemeldet hat) | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls`, `usage.unmeteredTokens` |
| `cognition.operation_failed` | Eine Operation, die ein Stopp oder ein Zeitlimit nach berechneten Versuchen abgebrochen hat | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev und andere Backends für typisierte Entscheidungen, einschließlich abgelehnter Antworten | `model`, `usage.inputTokens`, `usage.outputTokens` |
| `study.model_called` | Die Aufrufe einer Studie: Phasen, Suchanfragen, Prüfungen durch den Wächter, Prüfungen des Stands der Technik und Nachträge, einschließlich Reparaturen (ein Ereignis für einen Aufruf und seine Reparatur; eine Antwort, die ein Anbieter verworfen hat, ist ein `provider.answer_discarded`) | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls`, `usage.unmeteredTokens` |

Die endgültige Antwort eines kognitiven Laufs wird ebenfalls als Ereignis `intention.generated` aufgezeichnet (`source: 'cognition'`): Sie ist kein Modellaufruf und wird nicht gezählt.

Da der Verbrauch in Ereignissen steht, können Sie die Kosten auch selbst mit `computeRunCost(runId, events, pricing)` berechnen, sie pro Agent oder pro Tag aggregieren oder in Ihre Abrechnung einspeisen.

## Budgets {#budgets}

Kosten sind nur eine Seite; Richtlinien können außerdem **Schritte, Tokens und Tool-Aufrufe** pro Agent, Tool und Zeitraum begrenzen – siehe [Kontrollierte Agenten](./governed-agents). Ein `budgetLimit` mit `maxCost` lehnt die Tool-Aufrufe eines Agenten ab, sobald seine Modellaufrufe im Zeitraum mehr als die Grenze gekostet haben, zu den obigen Preisen, und ebenso den nächsten Schritt eines kognitiven Agenten und die nächste Phase einer Studie (siehe [Limits und Richtlinien](./cognitive-agents#limits-and-policies)): Ein bereits gestarteter Modellaufruf wird nie unterbrochen, und mit `toolName` wird nur dieses Tool abgelehnt. Hat ein Modell keinen Preis oder meldet ein Aufruf keine Token-Zahlen, lässt sich die Grenze nicht prüfen, und diese Tool-Aufrufe und Schritte werden abgelehnt. Ein `maxCost`, der keine endliche Zahl ≥ 0 ist (eine aus einer Konfigurationsdatei gelesene Zeichenkette wie `'0.5'`, `NaN`, ein negativer Betrag, `Infinity`, `null`), wird schon beim Anwenden der Richtlinie mit einem `ValidationError` abgelehnt.

Budgets zählen die Modellaufrufe, die `getRunCost` liest, so wie es sie liest – einschließlich der [fehlgeschlagenen Aufrufe](#failed-calls), und einen Aufruf ohne seine beiden Token-Zahlen als Aufruf mit unbekannten Kosten: die Reasoning-Schritte eines kontrollierten Agenten; die Gedanken eines kognitiven Agenten (einschließlich Reparaturen und fehlgeschlagener Versuche), seine Tool-Auswahl, seine typisierten Entscheidungen und seine nach berechneten Versuchen abgebrochenen Operationen; bei beiden die Antworten, die der Anbieter nicht verwenden konnte; die Aufrufe einer Studie (siehe [Studien](./studies#costs-and-budgets)); sowie die mit `sdk.decisions` getroffenen typisierten Entscheidungen, abgelehnte Antworten eingeschlossen. Eine Grenze mit `agentId` zählt die Modellaufrufe dieses Agenten (bei einer Studie die ihrer `id`) – und die Aufrufe von `sdk.decisions`, die ihn mit `agentId` nennen; eine ohne `agentId` zählt sie alle, auch typisierte Entscheidungen ohne Agenten. Ein Budget lehnt nie einen Aufruf von `sdk.decisions` ab: Es lehnt Tool-Aufrufe, die Schritte kognitiver Agenten und die Phasen von Studien ab.
