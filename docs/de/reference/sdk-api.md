# SDK-API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Option | Typ | Beschreibung |
| --- | --- | --- |
| `apiKey` | `string` | Schlüssel des primären Anbieters (mit `llmProvider` nicht nötig). Ohne jeden Schlüssel funktionieren Tools und MCP-Server, und Aufrufe, die ein Modell brauchen, schlagen mit einem klaren Fehler fehl |
| `provider` | `'openai' \| 'anthropic'` | Primärer Anbieter, Standard `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` und `timeout` jedes Herstellers (`baseURL`: ein kompatibler Endpunkt wie die v1-API von Azure OpenAI oder ein lokaler Modellserver, oder ein Proxy; `timeout`: die längste Wartezeit auf eine Antwort in Millisekunden, standardmäßig 10 Minuten, und bei einer gestreamten Antwort die längste Wartezeit zwischen zwei ihrer Ereignisse). Der primäre Anbieter nutzt den Eintrag seines Herstellers, ein Fallback eines anderen Herstellers den seines eigenen. Standardmodelle: `gpt-5.4` und `claude-opus-5`. Der OpenAI-Eintrag nimmt außerdem `reasoningModels`, `reasoningEffort`, `nativeToolMessages` und `includeStreamUsage`: siehe [OpenAI-Modelle](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Der Reihe nach versucht, wenn der primäre Anbieter ausfällt; eine `config` hat Vorrang vor `providerConfig`. Ein Fallback desselben Herstellers wie der primäre erbt keine seiner Einstellungen (nur den globalen `apiKey`); einer eines anderen Herstellers braucht einen eigenen Schlüssel |
| `llmProvider` | `LLMProvider` | Ihr eigener Anbieter (lokales Modell, Gateway, Test-Double). Er erhält Tool-Aufrufe und ihre Ergebnisse im nativen Format (`LLMMessage`), wenn er `nativeToolMessages` angibt, sonst als Text, und kann seinen Text streamen (siehe [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | Wiederholungsrichtlinie für das LLM, pro Anbieter, vor dem Fallback. Ihre Werte `maxRetries` und `initialDelayMs` sind auch die Standardwerte von `jev.maxRetries` und `jev.retryBaseDelayMs`; ihre übrigen Felder erreichen den Jev-Client nicht, der mit `retry: false` seine eigenen 2 Wiederholungen und 500 ms behält. Gilt für einen eingesetzten `llmProvider` nur, wenn sie ausdrücklich gesetzt ist, und nie für einen als `llmProvider` übergebenen `FallbackProvider` oder dessen Anbieter |
| `jev` | `JevClientConfig` | Aktiviert TypeSafe Jev für typisierte Entscheidungen – direkt oder über [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) mit `baseUrl` und `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Jedes beliebige Backend für typisierte Entscheidungen (hat Vorrang vor `jev`) |
| `pricing` | `PricingTable` | USD pro Million Tokens, über die Standardwerte gelegt |
| `incidents` | `IncidentMonitorOptions` | Notifier, Regeln, Schweregradschwelle, Drosselung |
| `eventStore` | `IEventStore` | Standard: `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Globale Richtlinien |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Speicherort der Test-Artefakte |

### OpenAI-Modelle {#openai-models}

Die Reasoning-Modelle von OpenAI – die o-Serie (`o1`, `o3`, `o4-mini`…) sowie GPT-5 und spätere (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), auch mit Datum oder feinabgestimmt (`ft:o4-mini-…`) – lehnen `max_tokens` ab, und `temperature`, sofern ihr Reasoning-Aufwand nicht `none` ist. Der OpenAI-Anbieter erkennt sie am Namen, unabhängig von der Groß- und Kleinschreibung: Er sendet ihnen `maxTokens` als `max_completion_tokens`, das auch ihre Reasoning-Tokens zählt, und den Reasoning-Aufwand. Da der Standardaufwand je nach Modell verschieden ist, sendet er ihnen nie eine Temperatur: Die Temperatur des Agenten oder der Engine wird für sie ignoriert. Andere Modelle erhalten `temperature` und `max_tokens`, die jeder OpenAI-kompatible Server kennt.

::: warning Tools und Reasoning-Aufwand
Das SDK ruft OpenAI über Chat Completions auf, wo Modelle ab GPT-5.4 Tools nur mit dem Aufwand `none` aufrufen. Das Standardmodell `gpt-5.4` nutzt `none`, solange Sie keinen anderen Aufwand setzen. GPT-5.5, GPT-5.6 sowie GPT-6 Sol und Luna haben standardmäßig `medium`: Ein Agent mit Tools schlägt auf ihnen fehl (`Function tools with reasoning_effort are not supported`), wenn Sie nicht `reasoningEffort: 'none'` setzen. GPT-6 Astra kann über Chat Completions überhaupt keine Tools aufrufen. Das SDK sendet den gesetzten Aufwand unverändert.
:::

| Option | Standard | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Modell einer Anfrage, die keines nennt, und eines Fallbacks, der das Modell des Agenten nicht anbietet |
| `reasoningModels` | Am Namen erkannt | `true` oder `false`: Alle Modelle dieses Anbieters sind Reasoning-Modelle bzw. keines ist eines. Eine Liste: Diese Namen sind es (Azure-Deployments, Gateway-Aliase), die übrigen werden am Namen erkannt |
| `reasoningEffort` | Der des Modells | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` oder `max`, unverändert nur an Reasoning-Modelle gesendet. Jedes Modell akzeptiert einige dieser Werte, die API lehnt die übrigen ab |
| `includeStreamUsage` | Bei der eigenen API von OpenAI | `true`: Bei einer gestreamten Antwort wird ihr Verbrauch angefordert (`stream_options`), sodass ihre Kosten gezählt werden; `false`: nicht. Standardmäßig bei `https://api.openai.com/v1` und regionalen Hosts wie `https://eu.api.openai.com/v1` (aus `baseURL` oder `OPENAI_BASE_URL`), da ein kompatibler Server das Feld ablehnen (die Anfrage wird dann ohne das Feld erneut gesendet, außer an die eigene API von OpenAI, die es annimmt) oder ignorieren kann, und ein gestreamter Aufruf ohne Verbrauchsangabe gilt als nicht gemessen. Mit einem Kostenbudget auf einem kompatiblen Server, der den Verbrauch meldet (die v1-API von Azure OpenAI tut das), setzen Sie `true` |
| `nativeToolMessages` | `true` | `false` für einen kompatiblen Server, der in der Konversation weder `tool_calls` des Assistenten noch `tool`-Nachrichten akzeptiert: Frühere Tool-Aufrufe und ihre Ergebnisse werden dann als Text gesendet, während die Tools weiter angeboten und die Tool-Aufrufe der Antworten weiter gelesen werden. `false` beim primären Anbieter oder bei einem beliebigen Fallback gilt für die ganze Kette |

Diese Optionen gehören in `providerConfig.openai` oder in die `config` eines OpenAI-Fallbacks. Ein Fallback eines anderen Herstellers übernimmt aus `providerConfig.openai` jede Option, die seine `config` nicht setzt; ein Fallback desselben Herstellers wie der primäre Anbieter übernimmt keine. Ein Agent oder ein Lauf setzt seinen eigenen Aufwand in `providerSettings.openai.reasoningEffort`: Der des Laufs hat Vorrang, dann der des Agenten, dann der des Anbieters. Ein kognitiver Agent wendet ihn nur auf die Tool-Auswahl an; seine Gedanken, die keine Tools anbieten, nehmen seine Option `reasoningEffort`.

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

### `LLMProvider` {#llmprovider}

Ihr eigener Anbieter implementiert `generateCompletion(request)`, `supportsModel(model)` und `getProviderName()` und kann `nativeToolMessages` angeben. Zwei Felder der Anfrage betreffen das Streaming:

| Feld von `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | Gesetzt, wenn der Aufrufer den Text will, während er geschrieben wird (ein Lauf mit `onText`). Rufen Sie die Funktion mit jedem Textstück auf, sobald es ankommt, und geben Sie dann wie gewohnt die vollständige `LLMResponse` zurück: Aneinandergefügt müssen die Stücke ihren `content` ergeben. Ein Anbieter, der nicht streamen kann, ignoriert sie, und das SDK gibt den ganzen `content` in einem Stück weiter. Sie darf keinen Fehler werfen (die des SDK tut das nie) |
| `onTextRestart?()` | Rufen Sie die Funktion auf, wenn Sie es nach einem Versuch, der schon Text gestreamt hatte, erneut versuchen (ein eigener Wiederholungsversuch): Dieser Text ist ungültig, und die nächsten Stücke beginnen die Antwort von vorn. `RetryingLLMProvider` und `FallbackProvider` rufen sie im Namen der Anbieter auf, die sie umhüllen |

## Agenten {#agents}

| Methode | Rückgabe | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Kontrollierter Agent: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. Er kann nur seine eigenen Tools ausführen (`tools`, `capabilities`), selbst wenn das Modell ein anderes im SDK registriertes Tool nennt; `signal` bricht den Lauf ab; `onText` erhält den Text, den das Modell schreibt, während es ihn schreibt, und `onTextRestart` den zu verwerfenden Teil, wenn ein fehlgeschlagener Modellaufruf erneut versucht wird (siehe [Die Antwort streamen](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Seine Gedanken sind strukturiert und werden nicht gestreamt |
| `defineTool(definition)` | `Tool` | Registriert ein Tool; der Handler wird aus seinem Zod-Schema typisiert |
| `defineCapability(definition)` | `Capability` | Gruppiert Tools |
| `listTools()` | `Tool[]` | Jedes registrierte Tool |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Kontrollierte Ausführung außerhalb eines Agenten (vom MCP-Server verwendet): Argumente, Richtlinien, Freigabe, Budget (beim Start des Aufrufs gezählt), dann das Tool. `signal` bricht eine ausstehende Freigabe ab und erreicht den Handler; `approvalTimeoutMs` bricht eine Freigabe ab, über die niemand entschieden hat |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Führt `read()` als eigenen Lauf aus: `run.started`, `resource.read` (URI, Größe, SHA-256), `run.completed` oder `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Hält einen kontrollierten oder kognitiven Lauf an |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Option | Standard | |
| --- | --- | --- |
| `name`, `model` | — | Erforderlich |
| `profile` | `DEFAULT_THINKER_PROFILE` | Wie der Agent denkt |
| `tools`, `policies` | `[]` | Kontrolliert wie überall sonst; Budget- und Timeout-Richtlinien werden außerdem vor jedem Schritt geprüft, siehe [Limits und Richtlinien](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | Zusätzliche Anweisungen für jeden Prompt |
| `limits` | siehe [Kognitive Agenten](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` oder ein `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` oder Ihr eigener `HypothesisAssessor` für die Operation `compare` |
| `knowledge` | — | Gedächtnis über Läufe hinweg: `{ store, scope, recallLimit? (10), record? (true) }`, siehe [Gedächtnis über Läufe hinweg](../guide/memory) |
| `evaluator` | — | Ein `OutcomeEvaluator`, der Vorhersagen testet; aktiviert `test_prediction` |
| `generator` | LLM-Generator auf `model` | Ihr eigener `ThoughtGenerator` (Vergleiche von Beobachtungen eingeschlossen); seine Gedanken durchlaufen trotzdem die Aufnahmeregeln der Engine |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Einstellungen der Gedankengenerierung (`reasoningEffort`: nur Reasoning-Modelle von OpenAI) |
| `providerSettings` | — | Einstellungen für die Tool-Auswahl (native Reasoning Engine), einschließlich `openai.reasoningEffort` |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` – `status` ist `completed`, `failed` oder `cancelled`; `decision.status` ist `committed`, `provisional` oder `abstain`, wobei `decision.missing` auflistet, was nicht gesichert ist; `state` ist der endgültige `MentalState`.

### `OutcomeEvaluator` {#outcomeevaluator}

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

Siehe [Belege & Verifikation](../guide/evidence-and-verification).

## Denken & Profile {#reasoning-profiles}

| Methode | Rückgabe |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` – aus Ereignissen rekonstruiert |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` – JSON Lines |

## Typisierte Entscheidungen – `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Wirft einen `ValidationError`, wenn kein Backend konfiguriert ist.

| Methode | Rückgabe |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` – Antworten aus den Fragen typisiert; kein `usage`, wenn das Backend keine Token-Anzahl gemeldet hat |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Hilfsfunktionen für Fragen: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Betrieb {#operations}

| Methode | Rückgabe |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Menschliche Freigaben |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets und Audit der Richtlinien |

### `RunCostReport` {#runcostreport}

Was `getRunCost(runId)` zurückgibt: die Modellaufrufe des Laufs, einschließlich fehlgeschlagener Schritte – siehe [API-Kosten](../guide/costs).

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| Feld | |
| --- | --- |
| `totalUsd` | Kosten der Aufrufe mit bekannten Kosten; nur eine Untergrenze, wenn `complete` `false` ist |
| `complete` | `false`, wenn die Kosten einiger Aufrufe unbekannt sind: `unpricedCalls` oder `unmeteredCalls` über 0 |
| `unpricedModels`, `unpricedCalls` | Modelle ohne Preis in `pricing` und ihre Aufrufe, die ihre Tokens gemeldet haben |
| `unmeteredModels`, `unmeteredCalls` | Modelle der Aufrufe, die nicht sowohl ihre Eingabe- als auch ihre Ausgabe-Tokens gemeldet haben, und diese Aufrufe |
| `lines` | Eine pro Modell, angefragtem Modell und Quelle: Aufrufe, Tokens der gemessenen Aufrufe, `unmeteredCalls`, falls vorhanden, `unmeteredTokens` für deren Tokens, `costUsd`, wenn das Modell einen Preis hat und Aufrufe der Zeile gemessen sind; `model` ist `(unknown)` für einen Aufruf, der keinen Modellnamen aufgezeichnet hat |

## Traces, Replay und Tests {#traces-replay-and-testing}

| Methode | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Läufe lesen |
| `replay(runId, modifications?, { onEvent? })` | Ohne das LLM erneut ausführen |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entscheidungen verstehen |

### Golden Traces {#golden-traces}

| Methode | Rückgabe | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | Behält einen Lauf als Referenz, mit dem Namen des kontrollierten Agenten, der ihn ausgeführt hat (`agentName`) |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: die ID oder der Name eines Agenten |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` oder `partial`, mit jedem Unterschied (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) und seiner Position |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | Dieselben Unterschiede als Regressionen, jede mit einem Schweregrad und einer Auswirkung: `no_regression` oder `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | Spielt den Lauf erneut ab und validiert dann das Replay. Ein Replay ruft kein Modell auf: vergleichen Sie es mit `validateAspects: ['tools', 'policies']` |

Läufe werden **nach der Bedeutung ihrer Ereignisse** verglichen, nie nach Ereignis-IDs (jeder Lauf hat neue). Die Ereignisse werden der Reihe nach einander zugeordnet: zuerst identische Ereignisse, dann Ereignisse desselben Typs und Gegenstands (das Tool, die Operation, die Antwort), deren Daten sich geändert haben, dann Ereignisse, deren Typ sich für denselben Gegenstand geändert hat. Nie verglichen werden: Ereignis-IDs, Zeitpunkte, Metadaten, `incident.reported`-Ereignisse (sie halten Zustellungen und Drosselung fest; das Ereignis, das den Vorfall ausgelöst hat, wird verglichen) sowie die Werte, die das SDK schreibt und die sich von Lauf zu Lauf ändern: die Dauer eines Tool-Aufrufs, der Token-Verbrauch, die Wartezeiten vor Wiederholungen, Freigabe-IDs, der Lauf, von dem ein Replay stammt, Zeitpunkt und Quellereignis einer Beobachtung. Der Text, den ein Modell neben einen Tool-Aufruf schreibt, wird nur in `intention.generated` verglichen. Parameter, Ergebnis und Eingabe eines Tools werden immer verglichen, wie auch immer ihre Schlüssel heißen: Ein Argument `duration`, das von 30 auf 60 ging, ist eine Änderung. Ein Lauf, der dasselbe noch einmal tut, besteht; ein Tool, das mit anderen Argumenten aufgerufen wird, wird dort gemeldet, wo der Aufruf stattfand (`parameters.metric: "churn" → "revenue"`); ein Aufruf, der vor einem identischen eingefügt wurde, ist ein einziger hinzugekommener Aufruf; ein `action.executed`, das zu `action.failed` wurde, ist eine einzige Änderung, kein Verlust plus eine Ergänzung.

| Option | Für | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | Validierung | Weniger Ereignisse vergleichen |
| `tolerance.dataFields` | Validierung | Weitere Datenfelder auslassen, in jeder Tiefe |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | Validierung | Zeitpunkte werden nur mit `timestampMs` verglichen, relativ zum Beginn jedes Laufs |
| `compareStructureOnly` | Validierung | Datenunterschiede ergeben `partial`, nicht `fail`; hinzugekommene, weggefallene, verschobene Ereignisse oder solche eines anderen Typs schlagen weiterhin fehl |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | Regressionen | Weniger Ereignisse vergleichen, Datenfelder auslassen |
| `tolerance.criticalEventTypes` | Regressionen | Typen, deren Auftreten, Wegfall oder Änderung kritisch ist (Standard: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | Regressionen | Bis zu so viele hinzugekommene oder weggefallene Ablaufereignisse (Richtlinienprüfungen, Wiederholungen, Freigaben) werden toleriert; eine Änderung des Ergebnisses nie |
| `tolerance.maxDurationDiff`, `severityThresholds` | Regressionen | Die Dauer wird nur mit einer der beiden Optionen geprüft: Ein Lauf, der um mehr als `maxDurationDiff` ms langsamer ist, ist eine Regression, mit dem Schweregrad der höchsten erreichten Schwelle; ein schnellerer Lauf nie |

### Regressionssuiten {#regression-suites}

| Methode | Rückgabe | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | Gespeichert in `regressionTestSuitesDir`. `agent`: die ID oder der Name eines Agenten dieses SDK. Jeder Golden Trace muss existieren; `input` ist standardmäßig die Eingabe, die der Referenzlauf erhalten hat; eine Suite speichert weder `signal` noch die Callbacks (`onEvent`, `onText`, `onTextRestart`) einer Eingabe |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | Die neuesten zuerst |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | Alle Suiten des Agenten, die älteste zuerst: Jeder Test schickt seine Eingabe an den Agenten und vergleicht den Lauf mit seinem Golden Trace; `suites` enthält ein Ergebnis pro Suite |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | Eine einzelne Suite |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 alle Tests bestanden, 1 ein Test hat eine Regression gefunden, 2 ein Test konnte nicht laufen (Fehler oder Zeitüberschreitung); `exitCode: false` in den Optionen ergibt 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit-XML: ein `<testsuite>` pro Suite; ein Test, der nicht laufen konnte (Fehler oder Zeitüberschreitung), ist ein `<error>`; Zeichen, die XML nicht enthalten kann, werden entfernt |

Agenten-IDs sind in jedem Prozess neu: Eine Suite speichert auch den **Namen** ihres Agenten, und ein anderer Prozess führt sie mit seinem Agenten dieses Namens aus (zuerst mit der Agenten-ID der Suite, wenn dieser Agent im SDK ist). Innerhalb eines SDK gehört die ID eines Agenten nur ihm: Zwei Agenten mit demselben Namen (zum Beispiel zwei Versionen) behalten jeweils ihre Suiten, Assertions und Golden Traces, und ein Name bezeichnet sie alle. Jeder mit `createAgent` erstellte Agent bleibt in seinem SDK; eine Anwendung, die pro Anfrage einen Agenten erstellt, macht den Namen daher mehrdeutig: Übergeben Sie IDs, oder erstellen Sie jeden Agenten einmal und verwenden Sie ihn wieder. Von früheren Versionen gespeicherte Suiten haben keinen Namen: Sie laufen nur in dem Prozess, der sie erstellt hat. Optionen: `parallel` (die Tests einer Suite gleichzeitig), `stopOnFirstFailure` (nur bei sequenziellen Läufen: Nach dem ersten Test, der nicht besteht, läuft nichts mehr, auch keine weitere Suite), `filterTags`, `excludeTags`, `timeout` (ms pro Test, standardmäßig 60 000, höchstens 2 147 483 647; danach wird der Lauf abgebrochen und der Test ist `timeout`) und `detection` (die Regressionsoptionen oben).

### Assertions {#assertions}

| Methode | Rückgabe | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | Für alle Läufe oder für die Läufe eines Agenten; ein Agent dieses SDK, der über `agentId` angegeben wird, speichert auch seinen Namen. Eine Bedingung, die sich nicht auswerten ließe, wird mit einem `ValidationError` abgelehnt |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | Die neuesten zuerst |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | Die angegebenen Assertions (eine unbekannte ID wirft einen Fehler), sonst die für alle Läufe plus die des Agenten des Laufs |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | Braucht | Besteht, wenn |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` oder `eventTypes` | Einer der Typen vorkommt / keiner vorkommt |
| `event_count` | `eventType` oder `eventTypes`, dann `count` oder `minCount` und `maxCount` | Die Anzahl dieser Ereignisse passt |
| `event_order` | `beforeEventType`, `afterEventType` | Das erste des einen vor dem ersten des anderen kommt |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | Jedes Ereignis des Typs passt |
| `custom` | `customEvaluator(events) => boolean` | Die Funktion `true` zurückgibt |

Eine `custom`-Assertion enthält eine Funktion, die sich nicht in eine Datei schreiben lässt: Sie wird **nicht gespeichert** und lebt so lange wie die SDK-Instanz, die sie definiert hat; definieren Sie sie beim Start erneut. Die anderen Typen werden in `assertionsDir` gespeichert.

### Vergleiche und Auswirkungen {#comparisons-and-impact}

| Methode | Rückgabe | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | Die Unterschiede, nach Bedeutung ausgerichtet wie oben: `event_added`, `event_removed`, `event_modified` (Typ geändert), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | Durchschnitte vorher und nachher von `duration` (ms), `cost` (USD der Modellaufrufe mit Preis, wie bei `getRunCost`), `quality` (Anteil der Ereignisse, die keine fehlgeschlagenen Aktionen sind) und `success_rate`, mit den Verhaltensänderungen; gespeichert in `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` auf den Läufen eines kontrollierten Agenten (sein Name oder die ID eines Agenten dieses SDK), die mit jeder Version aufgezeichnet wurden: seiner `version` oder seinem `configHash`. Alle Agenten dieses Namens zählen. Replays bleiben außen vor; die beiden Versionen müssen sich unterscheiden und verschiedene Läufe auswählen; eine unbekannte Version wirft einen Fehler, der die aufgezeichneten auflistet |

Die Lebenszyklusereignisse der Läufe eines kontrollierten Agenten (`run.started`, `run.completed` …) zeichnen seinen `agentName`, seine `agentVersion` und seinen `configHash` auf: Zwei Agenten mit demselben Namen sind ein Agent in zwei Versionen oder in zwei Prozessen. Der Hash umfasst das Modell, den System-Prompt, `maxSteps` und `timeout`, die Provider-Einstellungen, `version`, die Capabilities, die Tools (Name, Beschreibung, Version, Parameterschema, Metadaten, Wiederholungseinstellungen) und die eigenen Richtlinien des Agenten mit ihren Regeln; er ändert sich mit `setPolicy` und `addTools`, und jeder Lauf zeichnet den auf, mit dem er begonnen hat. Läufe, die von früheren Versionen aufgezeichnet wurden, haben nur die ID und die Version.

### Abfragen über alle Läufe {#queries-across-runs}

| Methode | Rückgabe |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: die passenden Ereignisse in zeitlicher Reihenfolge (höchstens `limit`), die Ereignisse im Umfang, die passenden |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

Ein Filter hat einen **Umfang** – `runId` (ohne ihn alle Läufe), `since`, `until` – und **Bedingungen** – `type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) und `metadataFilters` (`{ field, operator, value? }`). Die Bedingungen werden mit `logic` verknüpft (standardmäßig `and`; `or`: mindestens eine) und dann durch `not` verneint; der Umfang nie. Jeder mitgelieferte Speicher antwortet: Der Dateispeicher liest jede Lauf-Datei einmal pro Abfrage, die SQL-Speicher fragen die Datenbank ab. Wenn alle Bedingungen gelten müssen, filtert die Datenbank die Ereignisse selbst nach Typ und IDs; mit `or` oder `not` liefert der Speicher alle Ereignisse im Umfang, und die Bedingungen werden im Speicher geprüft, was bei einer großen Datenbank mehr kostet. Ereignisse derselben Millisekunde behalten die Reihenfolge ihres Laufs: die Läufe nach ID, dann in der Reihenfolge, in der jeder Lauf sie aufgezeichnet hat.

## Live-Ereignisse {#live-events}

Ein Listener ist `(event: Event) => unknown`. Er erhält ein Ereignis nach dem anderen, in der Reihenfolge jedes Laufs, sobald der Speicher es angenommen hat; auf ein Promise, das er zurückgibt, wird vor seinem nächsten Ereignis gewartet. Läufe warten nie auf ihn, und seine Fehler werden gemeldet, nie in den Lauf geworfen. Höchstens `maxQueued` Ereignisse (standardmäßig 10 000) warten auf ihn; darüber hinaus werden neue für ihn verworfen und mit einem `LiveEventsDroppedError` gemeldet. Siehe [Live-Fortschritt](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Jedes Ereignis des Laufs; `run()` wird aufgelöst, sobald der Listener jedes davon fertig verarbeitet hat, oder früher, wenn der Lauf angehalten oder abgebrochen wurde oder `signal` abgebrochen wird (der Listener wird dann abgemeldet). Der Listener wird nicht aufgezeichnet |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | Dasselbe für einen kognitiven Lauf, dessen `limits.timeoutMs` das Warten ebenfalls beendet |
| `replay(runId, modifications?, { onEvent })` | Dasselbe für ein Replay, das nicht abgebrochen werden kann: Es wartet immer |
| `executeTool(name, params, { onEvent })` | Die Ereignisse des Aufrufs und der Läufe, die sein Tool startet, eine Ebene tief: Der Handler erhält den Listener als `context.onEvent`, den `governedAgentTool` und `cognitiveAgentTool` an ihren Agenten weitergeben (ein von Hand auf einem Speicher ohne Live-Ereignisse gebauter Agent läuft ohne ihn). `signal` beendet das Warten |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: jedes Ereignis jedes Laufs, der zum Filter passt (`agentId` ist `metadata.agentId`), bis Sie die zurückgegebene Funktion aufrufen, die die noch nicht zugestellten Ereignisse verwirft. Läufe von Regressionssuiten und Replays sind echte Läufe: Der Listener erhält auch deren Ereignisse (eine Suite speichert weder `onEvent` noch `onText` ihrer Eingabe) |
| `new ObservedEventStore(store, { onListenerError? })` | Die Schicht, die sie zustellt; das SDK wickelt seinen Speicher in eine solche oder verwendet die, die Sie als `eventStore` übergeben, auch innerhalb eines `MonitoredEventStore` (dessen Incident-Meldungen dann ebenfalls zugestellt werden). Ihr `subscribe(listener, options?)` gibt `{ unsubscribe(), close() }` zurück: `close()` wartet, bis der Listener die Ereignisse, die er bereits übernommen hat, fertig verarbeitet hat. `onListenerError` erhält die Fehler der Listener und die Meldungen über verworfene Ereignisse |

## Tools: `ToolDefinition` {#tools-tooldefinition}

| Feld | |
| --- | --- |
| `name`, `description` | Was das Modell sieht |
| `schema` | Zod-Schema der Argumente; Aufrufe, die nicht passen, werden abgelehnt |
| `handler(params, context?)` | Erhält die validierten Argumente und `{ runId, agentId, signal?, onEvent? }` – `signal` wird abgebrochen, wenn der Aufrufer aufgibt; `onEvent` ist gesetzt, wenn der Aufrufer den Aufruf live verfolgt: Übergeben Sie ihn als `onEvent` der Läufe, die das Tool startet |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` – nur idempotente Tools; ungültige Argumente werden nie wiederholt |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` – `requiresApproval: true` lässt jeden Aufruf auf `approveAction` warten; `readOnly` wird MCP-Clients als `readOnlyHint` angezeigt |
| `inputJsonSchema` | JSON Schema, das anstelle des aus `schema` abgeleiteten angezeigt wird |
| `capability`, `version` | Gruppierung, Version |

## Tool-Quellen {#tool-sources}

Jede liefert fertige `ToolDefinition`s: Übergeben Sie sie an `sdk.defineTool`, an einen Agenten oder direkt an `tools` eines MCP-Servers. Siehe [Ein MCP-Server für alles](../guide/mcp-recipes).

| Funktion | Rückgabe | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | Ein Tool pro Operation einer OpenAPI-3-Beschreibung; nur `GET`, sofern nicht in `include` aufgelistet; andere Methoden erfordern standardmäßig eine Freigabe. Ein Aufruf liefert `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` über einen Ordner, nie außerhalb davon; ein ausgeschlossener Ordner verbirgt alles, was er enthält |
| `folderResources(options)` | `ResourceProvider` | Dieselben Dateien als MCP-Ressourcen `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (eine schreibgeschützte Anweisung, höchstens `maxRows` Zeilen, standardmäßig 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Für `DatabaseSync` von `node:sqlite` oder `better-sqlite3`; führt Abfragen mit `PRAGMA query_only = ON` aus |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Für `pg` (ein dedizierter Client oder ein Pool); jede Abfrage in `BEGIN READ ONLY` (abgelehnt auf einer Verbindung, die sich bereits in einer Transaktion befindet) … `ROLLBACK` + `pg_advisory_unlock_all()`, mit `SET LOCAL statement_timeout` (standardmäßig 10 s); `schemas` begrenzt nur das Auflisten und Beschreiben |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; wird mit dem Aufrufer abgebrochen; `error` ist generisch, außer mit `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | Die Anweisungsprüfung der Datenbankadapter (nur SQLite- und PostgreSQL-Syntax) |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

## MCP – `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| Funktion | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | MCP-`Server`, der genau das bereitstellt, was `tools` auflistet: Namen definierter Tools und/oder `ToolDefinition`s (für Sie auf dem SDK definiert; dieselbe Definition darf erneut übergeben werden, ein anderes Tool mit einem bereits vergebenen Namen wird abgelehnt). `resources`: ein oder mehrere `ResourceProvider`; jeder Lesevorgang wird nachverfolgt. Aufrufe laufen als `mcp:<name>` (oder `agentId`); eine Freigabe, über die niemand innerhalb von `approvalTimeoutMs` (standardmäßig 50 000 ms) entscheidet, wird abgebrochen; Ablehnungen der Eingabe werden dem Client erklärt, andere Ursachen nur mit `exposeErrorDetails`. Ein Aufruf mit einem `progressToken` erhält eine `notifications/progress` pro Ereignis, alle vor dem Ergebnis gesendet ([Fortschrittsbenachrichtigungen](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | Dasselbe, verbunden mit stdin/stdout; schreibt eine „ready“-Zeile auf stderr und schließt, wenn stdin endet (laufende Aufrufe werden abgebrochen, ausstehende Freigaben aufgehoben). `approvalTimeoutMs` ist standardmäßig 50 000, wie bei `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` – die Tools eines beliebigen MCP-Servers, als `ToolDefinition`s |

`GovernedToolHost` ist das, was der Server vom SDK braucht (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` liefert ein Objekt, das es implementiert.

## Bausteine {#building-blocks}

Die Bausteine des SDK werden für eigene Konfigurationen exportiert: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore` und ihre wichtigsten Typen.
