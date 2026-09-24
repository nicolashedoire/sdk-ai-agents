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
| `run.started` | `input`, `mode` (`cognitive`, `tool` für einen Aufruf außerhalb eines Agenten wie einen MCP-Aufruf, `resource` für das Lesen einer MCP-Ressource, oder nicht vorhanden bei kontrollierten Läufen), `replayOf?` |
| `run.completed` | `output`, `decision?` (kognitiv) |
| `run.failed` | `error`, `steps?`, `uri?` (fehlgeschlagenes Lesen einer Ressource) |
| `run.cancelled` / `run.stopped` | `reason` |

## Denken und Aktionen {#reasoning-and-actions}

| Typ | Daten |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` – oder `intention` für eine kognitive endgültige Antwort |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies` (`allowed-tools`, wenn ein Aufrufer ein Tool verwendet hat, das ihm nicht gegeben wurde; die Kennung der Budgetrichtlinie, wenn ihr Aufrufbudget aufgebraucht ist) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval`, wenn das eigene `metadata.requiresApproval` des Tools sie verlangt hat), `reason?` (`cancelled before a decision`, wenn der Aufrufer aufgegeben hat oder der Lauf angehalten wurde, `no decision within N ms` nach `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` – `action.failed` zeichnet auch einen Aufruf auf, der wegen ungültiger Argumente (vor jeder Richtlinie) abgelehnt wurde oder weil sein Aufrufer nach einer Freigabe gegangen war |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `usage`, `reason` — eine Antwort, die der Hersteller berechnet hat, mit dem gemeldeten Verbrauch, die der Anbieter nicht verwenden konnte (eine OpenAI-Antwort ohne jede Auswahl); zählt in den Kosten und, bei kontrollierten Agenten, in den Budgets pro Zeitraum |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` des ausgelieferten Inhalts (der Inhalt selbst wird nicht gespeichert) |

`tool.failed`, `intention.rejected` und `error.occurred` gehören zum Typ `EventType`, werden vom SDK aber nie aufgezeichnet: Ein fehlgeschlagener Tool-Aufruf ist ein Ereignis `action.failed`, ein von einer Richtlinie abgelehnter ein Ereignis `policy.violated` und ein bei der Freigabe abgelehnter ein Ereignis `approval.rejected`.

## Kognition {#cognition}

| Typ | Daten |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; bei älteren Läufen nicht vorhanden), `goal`, `context?`, `observations` (mit dem Problem übergeben), `commitRules`, `knowledge?` (`scope`, `items`, die aus früheren Läufen abgerufen wurden, `error?`, wenn der Speicher fehlgeschlagen ist), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (die Engine hat eine Entscheidung erzwungen), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — Aufrufe, die keine Token-Anzahl gemeldet haben) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — dazu `model?`, `requestedModel?`, `usage?` für eine Operation, die ein Stopp oder ein Zeitlimit nach berechneten Versuchen abgebrochen hat |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` – der vollständige Bericht eines Vorhersagetests |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (Aussage, Art, Geltungsbereich, `revises?`, `difference?`, `evidence`: jeder Test mit `runId`, `predictionId`, `verdict`, `expected`, `observed`, Evaluator), `error?`, wenn der Speicher fehlgeschlagen ist. Angehängt nach `run.completed`, `run.failed` oder `run.cancelled`, und nur, wenn der Lauf etwas getestet hat |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (leer, wenn die Antwort abgelehnt wurde), `usage?` (fehlt, wenn das Backend keine Token-Anzahl gemeldet hat), `error?` (warum eine berechnete Antwort abgelehnt wurde), `step?` |

## Betrieb {#operations}

| Typ | Daten |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

Der mentale Zustand eines kognitiven Laufs ist die Faltung seiner `cognition.thought`-Patches in der Reihenfolge von `step`, ausgehend vom Ziel und den Beobachtungen aus `cognition.started`. Beobachtungen, die während des Laufs entstehen, werden von den Gedanken-Patches getragen, wobei `sourceEventId` auf das Ereignis `action.executed` oder `cognition.evaluated` verweist, das die vollständigen Nutzdaten enthält. Läufe ohne `schemaVersion` werden mit den Regeln rekonstruiert, mit denen sie aufgezeichnet wurden.
