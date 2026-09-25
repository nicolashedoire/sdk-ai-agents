# Ereigniskatalog

Jedes Ereignis hat dieselbe Hülle:

```ts
interface Event {
  id: string;
  runId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: { agentId?: string; agentVersion?: string; profileId?: string; profileVersion?: string; … };
}
```

## Lebenszyklus eines Laufs {#run-lifecycle}

| Typ | Daten |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`, `study` für den Lauf einer Studie, `study-amendment` für den Lauf, der einen Nachtrag einordnet, `tool` für einen Aufruf außerhalb eines Agenten wie einen MCP-Aufruf, `resource` für das Lesen einer MCP-Ressource, oder nicht vorhanden bei kontrollierten Läufen), `replayOf?` |
| `run.completed` | `output`, `decision?` (kognitiv) |
| `run.failed` | `error`, `steps?`, `uri?` (fehlgeschlagenes Lesen einer Ressource) |
| `run.cancelled` / `run.stopped` | `reason` |

## Denken und Aktionen {#reasoning-and-actions}

| Typ | Daten |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` – oder `intention` für eine kognitive endgültige Antwort |
| `policy.checked` | `intention`, `validation`: das Urteil der Action Engine über einen Tool-Aufruf. Die Policy Engine zeichnet außerdem ein Ereignis pro geprüfter Richtlinie auf – `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true`, wenn die Richtlinie galt und abgelehnt hat) und `reason` –, vor einem Tool-Aufruf und vor jedem Schritt eines kognitiven Laufs für die Budget- und Timeout-Richtlinien, die für einen Schritt gelten können (`intention` ist dann `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools`, wenn ein Aufrufer ein Tool verwendet hat, das ihm nicht gegeben wurde; die Kennung der Budgetrichtlinie, wenn ihr Aufrufbudget aufgebraucht ist), und `step`, wenn eine Budget- oder Timeout-Richtlinie einen Schritt eines kognitiven Laufs abgelehnt hat, oder `passage`, wenn sie eine Phase einer Studie abgelehnt hat (sein `intention` ist dann `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval`, wenn das eigene `metadata.requiresApproval` des Tools sie verlangt hat), `reason?` (`cancelled before a decision`, wenn der Aufrufer aufgegeben hat oder der Lauf angehalten wurde, `no decision within N ms` nach `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` – `action.failed` zeichnet auch einen Aufruf auf, der wegen ungültiger Argumente (vor jeder Richtlinie) abgelehnt wurde oder weil sein Aufrufer nach einer Freigabe gegangen war |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — eine Antwort, die der Hersteller berechnet hat, mit dem gemeldeten Verbrauch, die der Anbieter nicht verwenden konnte (eine OpenAI-Antwort ohne jede Auswahl); zählt in den Kosten und in den Budgets pro Zeitraum |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` des ausgelieferten Inhalts (der Inhalt selbst wird nicht gespeichert) |

`tool.failed`, `intention.rejected` und `error.occurred` gehören zum Typ `EventType`, werden vom SDK aber nie aufgezeichnet: Ein fehlgeschlagener Tool-Aufruf ist ein Ereignis `action.failed`, ein von einer Richtlinie abgelehnter ein Ereignis `policy.violated` und ein bei der Freigabe abgelehnter ein Ereignis `approval.rejected`.

## Kognition {#cognition}

| Typ | Daten |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; bei älteren Läufen nicht vorhanden), `goal`, `context?`, `observations` (mit dem Problem übergeben), `commitRules`, `knowledge?` (`scope`, `items`, die aus früheren Läufen abgerufen wurden, `error?`, wenn der Speicher fehlgeschlagen ist), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (die Engine hat eine Entscheidung erzwungen), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — Aufrufe, die nicht sowohl ihre Eingabe- als auch ihre Ausgabe-Tokens gemeldet haben, `unmeteredTokens?` — deren Tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — dazu `model?`, `requestedModel?`, `usage?` für eine Operation, die ein Stopp oder ein Zeitlimit nach berechneten Versuchen abgebrochen hat |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` – der vollständige Bericht eines Vorhersagetests |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (Aussage, Art, Geltungsbereich, `revises?`, `difference?`, `evidence`: jeder Test mit `runId`, `predictionId`, `verdict`, `expected`, `observed`, Evaluator), `error?`, wenn der Speicher fehlgeschlagen ist. Angehängt nach `run.completed`, `run.failed` oder `run.cancelled`, und nur, wenn der Lauf etwas getestet hat |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (leer, wenn die Antwort abgelehnt wurde), `usage?` (fehlt, wenn das Backend keine Token-Anzahl gemeldet hat), `error?` (warum eine berechnete Antwort abgelehnt wurde), `step?` |

## Studien {#studies}

Die Läufe einer Studie (`mode: 'study'`) und die Läufe, die ihre Nachträge einordnen (`mode: 'study-amendment'`), zeichnen diese Ereignisse auf. Jedes trägt die `id` der Studie als `metadata.agentId` und ihren Namen als `metadata.studyName`. Die Suchen zeichnen außerdem die Ereignisse ihrer kontrollierten Tool-Aufrufe (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) im Lauf der Studie auf. Siehe [Studien](../guide/studies).

| Typ | Daten |
| --- | --- |
| `study.started` | `name`, `charter` (`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash` (SHA-256), `language`, `model?`, `sources` (Tool-Namen), `limits`, `driftThreshold`, `amendments` (die angenommenen: `number`, `text`), `resumeAt?` (wenn ein Lauf fortgesetzt wird: die erste Phase, bei der noch Arbeit übrig ist) |
| `study.passage_started` | `passage`, `number` (1 bis 7), `amendments` (Nummern der geltenden angenommenen Nachträge), `reopenedBy?`, `focus?`, `reason?`, wenn eine spätere Phase sie wieder geöffnet hat, `redo?` und `resumed?` für die Wiederholung, die ein fortgesetzter Lauf ihr schuldete, `outdated?`, wenn sie für Elemente erneut läuft, die der Wächter verspätet beurteilt hat |
| `study.passage_completed` | `passage`, `attempts` (2, wenn der Wächter sie wiederholen ließ), `keptAttempt?` (1, wenn der erste Versuch besser als die Wiederholung war und behalten wurde), `discarded?` (`attempt`, `items`: die dann verworfene Wiederholung), `items` (jedes mit seiner `collection`, `id`, `statement`, `status`, `sources`, `servesObjective`, den übrigen Feldern einer Behauptung und seinen eigenen Feldern), `reopenedBy?`, `reopen?` (`passage`, `focus`, `reason`: die frühere Phase, deren Wiederöffnung sie verlangt; sie ist nicht abgeschlossen, bis sie erneut läuft), `resumed?` (ein Lauf hat sie nur fortgesetzt, um sie zu beenden), `duplicates?` (erneut abgegebene Urteile zu bereits beurteilten Spuren: verworfen, keine Drift) |
| `study.search` | `passage`, `purpose` (`research` oder `priorArt` für den Stand der Technik der Neuheiten), `tool`, `query`, `servesObjective`, `claims?` (die Neuheiten, nach denen sie sucht), `resultIds`, `results` (`id`, `title`, `locator`, `date?`), `error?` (die Suche ist fehlgeschlagen), `throttled?` (sie ist an einer Drosselung gescheitert), `retry?` (der zweite Versuch einer gedrosselten Recherche zum Stand der Technik), `skipped?` (`maxSearches`: nicht ausgeführt) |
| `study.model_called` | `purpose` (`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?`: ein Ereignis für einen Aufruf und seine Reparatur), `failed?` (warum die Antwort nicht verwendet werden konnte), `usedAttempt?` (1, wenn die Reparatur nicht verwendet werden konnte und die erste Antwort, tolerant gelesen, verwendet wurde) – zählt in den Kosten und in den Budgets pro Zeitraum |
| `study.drift_rejected` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`code`, `params?`, `message`), `by` (`guardian`: als vom Ziel abweichend beurteilt; `schema`: vorher abgelehnt, zum Beispiel ohne `servesObjective`), `attempt` (2 bei einer Wiederholung) |
| `study.capability_demoted` | `passage`, `item` (die Kennung der Architektur), `name`, `reason` (`code`, `params?`, `message`): eine Fähigkeit, die der Wächter nur für schneller oder günstiger hielt und die nun eine Verbesserung ist |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (nur angenommene), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`code`, `params?`, `message`; bei `unclassified`: `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` oder `amendmentPolicy`), `charterHash` – im eigenen Lauf des Nachtrags |
| `study.result_recorded` | `card`, `resultAndError` (`result`, `error?`), `conclusionAndMemory?` – an den Lauf angehängt, der die Karte geschrieben hat, nach dessen Ende |
| `study.completed` | `status`, `passages` (`passage`, `state`), `stats` dieses Laufs (`modelCalls`, die der Anbieter beantwortet hat, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status` (`stopped`, `failed` oder `cancelled`), `stoppedBy?`, `error`, `passages`, `stats` dieses Laufs, `partial: true` – danach `run.failed` oder `run.cancelled` |

`study.model_called` ist das, was `getRunCost` und die Budgets für eine Studie lesen. Wenn zwei Läufe verglichen werden, werden die Ereignisse einer Studie nach Phase einander zugeordnet (`study.model_called` nach Zweck und Phase), und das `usage` von `study.model_called` wird nicht verglichen. Der Lauf eines Nachtrags enthält `run.started`, `policy.violated`, wenn eine Budget-Richtlinie die Einordnung abgelehnt hat, `study.model_called`, wenn der Anbieter geantwortet hat, das Ereignis des Nachtrags und `run.completed`.

## Betrieb {#operations}

| Typ | Daten |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

Der mentale Zustand eines kognitiven Laufs ist die Faltung seiner `cognition.thought`-Patches in der Reihenfolge von `step`, ausgehend vom Ziel und den Beobachtungen aus `cognition.started`. Beobachtungen, die während des Laufs entstehen, werden von den Gedanken-Patches getragen, wobei `sourceEventId` auf das Ereignis `action.executed` oder `cognition.evaluated` verweist, das die vollständigen Nutzdaten enthält. Läufe ohne `schemaVersion` werden mit den Regeln rekonstruiert, mit denen sie aufgezeichnet wurden.
