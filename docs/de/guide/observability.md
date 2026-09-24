# Nachvollziehbarkeit & Replay

Jeder Lauf – ob kontrolliert, kognitiv, eine direkte typisierte Entscheidung oder ein MCP-Tool-Aufruf – ist ein **Ereignisprotokoll, an das nur angehängt wird**. Nichts geschieht außerhalb des Protokolls, und alles andere wird daraus abgeleitet.

```mermaid
flowchart LR
  subgraph Run[Lauf]
    direction TB
    A[run.started] --> B[cognition.operation_selected]
    B --> C[decision.evaluated]
    C --> D[cognition.thought]
    D --> E[policy.checked]
    E --> F[tool.called]
    F --> G[action.executed]
    G --> H[run.completed]
  end
  Run --> T[getTrace]
  Run --> M[getMentalState]
  Run --> R[replay]
  Run --> K[getRunCost]
  Run --> I[getIncidents]
  Run --> DS[exportControllerDataset]
```

## Speicher {#stores}

| Speicher | Verwenden Sie ihn für |
| --- | --- |
| `FileEventStore` (Standard) | Entwicklung, ein einzelner Prozess – eine JSON-Datei pro Lauf |
| `SQLiteEventStore` | Lokale Persistenz mit Abfragen |
| `PostgreSQLEventStore` | Produktion: indizierte Abfragen, Aggregation, Sicherung und Wiederherstellung |

::: code-group

```ts [File]
import { createSDK, FileEventStore } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey, eventStore: new FileEventStore('./events') });
```

```ts [SQLite]
import Database from 'better-sqlite3';
import { createSDK, SQLiteEventStore } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey, eventStore: new SQLiteEventStore({ db: new Database('events.db') }) });
```

```ts [PostgreSQL]
import pg from 'pg';
import { createSDK, PostgreSQLEventStore } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const sdk = createSDK({ apiKey, eventStore: new PostgreSQLEventStore({ pool }) });
```

:::

Speicher implementieren `IEventStore`; schreiben Sie Ihren eigenen, um jede beliebige Datenbank anzusprechen. Der Dateispeicher puffert Ereignisse und schreibt sie alle 100 ms weg; rufen Sie beim Herunterfahren `await store.destroy()` auf, um noch Ausstehendes zu schreiben. Leser des Protokolls (Rekonstruktion des mentalen Zustands, Kosten, Datensätze) ignorieren Ereignisse, die mit derselben Kennung wiederholt werden.

## Einen Lauf lesen {#read-a-run}

```ts
const trace = await sdk.getTrace(runId);          // status, timeline, summary
const text = await sdk.exportTrace(runId, 'text'); // human-readable timeline
const events = await sdk.getEvents(runId, { type: ['tool.called', 'policy.violated'] });
const state = await sdk.getMentalState(runId);    // cognitive runs
```

Der Status eines Laufs ist das **letzte Lebenszyklusereignis** (`run.completed`, `run.failed`, `run.cancelled`). Danach angehängte Ereignisse – Feedback, Incident-Meldungen – öffnen ihn nie wieder.

## Live-Fortschritt {#live-progress}

Ereignisse erreichen Ihren Code auch **während der Lauf noch im Gange ist**, sobald der Speicher sie angenommen hat: um den Fortschritt in einer Benutzeroberfläche anzuzeigen, ihn an einen Client zu streamen oder ein Dashboard zu speisen. MCP-Clients erhalten sie als [Fortschrittsbenachrichtigungen](./mcp-deploy#progress-notifications).

```ts
const result = await agent.run({
  message: 'Refund order 1234',
  onEvent: (event) => console.log(event.type),
});

const answer = await cognitiveAgent.think({ problem, onEvent: (event) => socket.send(JSON.stringify(event)) });
const replay = await sdk.replay(runId, undefined, { onEvent: (event) => console.log(event.type) });

// Every run of the SDK, for as long as you listen
const unsubscribe = sdk.subscribe((event) => dashboard.push(event), { types: ['run.failed', 'approval.requested'] });
unsubscribe();
```

| Wo | Was der Listener erhält |
| --- | --- |
| `run({ onEvent })`, `think({ onEvent })` | Jedes Ereignis dieses Laufs |
| `replay(runId, modifications, { onEvent })` | Jedes Ereignis des Replays |
| `executeTool(name, params, { onEvent })` | Die Ereignisse des Aufrufs und der Agentenläufe, die sein Tool startet (`governedAgentTool`, `cognitiveAgentTool`) |
| `sdk.subscribe(listener, { runId?, agentId?, types? })` | Jedes Ereignis jedes Laufs, der zum Filter passt, bis Sie die zurückgegebene Funktion aufrufen |

Was garantiert ist:

- **Nur, was der Speicher angenommen hat.** Ein Listener wird aufgerufen, sobald das `append` des Speichers erfolgreich war, nie für ein Ereignis, das der Speicher abgelehnt hat. Bei den SQL-Speichern ist die Zeile festgeschrieben; beim Dateispeicher liegt das Ereignis in seinem Puffer: `getEvents` gibt es sofort zurück, und es erreicht die Festplatte innerhalb von 100 ms (bei einem Absturz dazwischen geht es verloren).
- **In Reihenfolge.** Die Ereignisse eines Laufs kommen in der Reihenfolge an, in der sie aufgezeichnet wurden; die Ereignisse verschiedener Läufe wechseln sich ab.
- **Ein Ereignis nach dem anderen, und der Lauf wartet nie.** Gibt Ihr Listener ein Promise zurück, wartet sein nächstes Ereignis, bis dieses Promise erfüllt oder abgelehnt ist, sodass ein asynchroner Listener die Ereignisse nicht umordnen kann. Der Lauf geht währenddessen weiter: Ein langsamer Listener fällt zurück, er bremst den Agenten nicht. `run()`, `think()`, `replay()` und `executeTool()` werden erst aufgelöst, wenn ihr `onEvent` jedes Ereignis des Laufs fertig verarbeitet hat; wenn sie zurückkehren, haben Sie also alles gesehen. Ein Promise, das nie erfüllt oder abgelehnt wird, hindert sie an der Rückkehr: Für Arbeit nach dem Prinzip „Fire and Forget“ geben Sie das Promise nicht zurück (`onEvent: (event) => { void save(event); }`). Ein synchroner Listener wird aufgerufen, bevor das `append` des Ereignisses zurückkehrt: Halten Sie ihn kurz.
- **Fehler bleiben außerhalb des Laufs.** Ein Listener, der einen Fehler wirft oder dessen Promise abgelehnt wird, wird auf der Standardfehlerausgabe (`console.error`) gemeldet und erhält trotzdem die nächsten Ereignisse. Um diese Fehler selbst zu behandeln, fangen Sie sie im Listener ab oder erstellen Sie das SDK mit `eventStore: new ObservedEventStore(store, { onListenerError })`.
- **Eine Kopie.** Jeder Listener erhält seine eigene Kopie des Ereignisses, so wie der Speicher es zurückliest: Wer sie ändert, ändert nichts im Protokoll.
- **Abmelden wirkt sofort.** Nachdem die von `sdk.subscribe` zurückgegebene Funktion aufgerufen wurde, wird der Listener nicht mehr aufgerufen, auch nicht für bereits wartende Ereignisse; sie kann aus dem Listener selbst heraus aufgerufen werden.

Der Filter `agentId` vergleicht mit dem `metadata.agentId` jedes Ereignisses: Einige Ereignisse tragen keinen Agenten (`provider.retry`, das Ende eines Replays); filtern Sie nach Lauf, um sie zu erhalten. Wiederhergestellte Sicherungen werden nicht zugestellt. Für einen Agenten, den Sie von Hand auf Ihrem eigenen Speicher zusammenbauen (`new AgentImpl(…)`), wickeln Sie den Speicher in einen `ObservedEventStore`, um `onEvent` zu nutzen; `createSDK` erledigt das für Sie.

## Replay ohne das LLM {#replay-without-the-llm}

```ts
const replay = await sdk.replay(runId);
```

Replay führt die aufgezeichneten Intentionen erneut durch die Action Engine aus – Richtlinien eingeschlossen –, **ohne das LLM aufzurufen**. Spielen Sie mit Änderungen erneut ab, um „Was wäre, wenn?“-Szenarien zu testen, zum Beispiel nach einer Richtlinienänderung.

Ein Replay führt die Tools erneut aus, und zwar tatsächlich. Bei Tools, die mit `requiresApproval` markiert sind, wiederholt ein Replay nur die Aufrufe, die im ursprünglichen Lauf von einem Menschen **freigegeben** wurden – dasselbe Tool mit denselben Parametern –, ohne erneut nachzufragen; ein Aufruf, der abgelehnt, abgebrochen oder nie freigegeben wurde, wird verweigert, nicht ausgeführt. Freigaben, die eine *Richtlinie* verlangt, gelten weiterhin und warten auf eine Entscheidung.

## Entscheidungen verstehen {#understand-decisions}

| Methode | Was Sie erhalten |
| --- | --- |
| `getReasoningGraph(runId)` / `exportReasoningGraph(runId, 'graphviz')` | Die Kette Intention → Richtlinie → Aktion als Graph |
| `getAlternatives(runId)` | Alternativen, die der Agent in Betracht gezogen hat |
| `getDecisionPatterns(filters)` | Wiederkehrende Entscheidungsmuster über Läufe hinweg |
| `getTraceVisualization(runId)` | Gruppierte Struktur, bereit für eine Zeitleiste in einer Benutzeroberfläche |
| `getPolicyAuditTrail(runId)` | Jede Auswertung einer Richtlinie und ihr Ergebnis |

## Agenten wie Code testen {#test-agents-like-code}

Machen Sie aus einem guten Lauf einen **Golden Trace** und validieren Sie dann neue Läufe dagegen:

```ts
const golden = await sdk.createGoldenTrace(runId, { name: 'refund flow', description: 'Expected behavior' });
const validation = await sdk.validateAgainstGoldenTrace(newRunId, golden.id);
const regressions = await sdk.detectRegressions(newRunId, golden.id);
```

Regressionssuiten, Verhaltensassertionen, der Vergleich von Läufen und eine Auswirkungsanalyse vor der Bereitstellung sind ebenfalls verfügbar – siehe die [SDK-API](../reference/sdk-api).
