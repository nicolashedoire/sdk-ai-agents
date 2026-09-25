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

## Studien {#studies}

Eine Studie ist ein Forscher: Sie versteht ein Objekt, schlägt dann vor, wie es mit dem Wissen und den Techniken von heute neu zu entwerfen ist, und entwirft die Experimente, die entscheiden würden. Siehe [Studien](../guide/studies).

| Methode | Rückgabe | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | Prüft die Konfiguration, löst die Quellen auf und friert die Charta ein. Wirft einen `ValidationError` bei einer fehlerhaften Konfiguration oder bei einer Quelle, die kein definiertes Tool ist oder keine Textanfrage annimmt |

### `StudyConfig` {#studyconfig}

| Option | Standard | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | Erforderlich, nicht leer. `name` wird mit den Ereignissen der Studie aufgezeichnet (`metadata.studyName`); das Ziel ändert sich nie: Ein neues Ziel ist eine neue Studie |
| `question` | Die Leitfrage der Methode und der Anspruch auf eine neue Fähigkeit, in `language` | Die Leitfrage |
| `needs`, `leads`, `analogues` | `[]` | Bedürfnisse und Kriterien von heute; Ihre Spuren, zu prüfende Beispiele, die jeweils ein Urteil erhalten; zu zerlegende Durchbrüche durch Zusammensetzung (`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | Was außerhalb des Rahmens liegt |
| `capability` | — | Die angestrebte neue Fähigkeit; ohne sie schlägt die Studie Kandidaten vor |
| `sources` | `[]` | Namen von SDK-Tools, mit denen die Studie sucht, vor der Studie definiert (zum Beispiel die Tools von `connectMcpServer`); ohne Quellen lässt sich nichts belegen |
| `model` | Das Standardmodell des Anbieters | Modell jedes Aufrufs |
| `llmProvider` | Der Anbieter des SDK | Ein Anbieter für diese Studie |
| `language` | `'en'` | Sprache der Texte und des Dossiers, als Sprach-Tag (`fr`, `pt-BR`…) |
| `limits` | Siehe [`StudyLimits`](#studylimits) | Ein weggelassenes Limit behält seinen Standardwert |
| `driftThreshold` | `1/3` (`DEFAULT_DRIFT_THRESHOLD`) | Anteil der Elemente einer Phase, von 0 bis 1, der abgelehnt werden darf, bevor die Phase einmal wiederholt wird |
| `temperature`, `maxTokens` | `0.4`, — | Für die Phasen und Suchanfragen; der Wächter, die Nachträge und die Prüfung des Stands der Technik laufen mit 0 |

Die Charta (`StudyCharter`) enthält `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability` und `analogues`, wobei wiederholte Listeneinträge (unabhängig von Groß- und Kleinschreibung) entfernt werden. Sie ist eingefroren und gehasht; `name` gehört nicht dazu.

### `StudyLimits` {#studylimits}

Pro Lauf. `DEFAULT_STUDY_LIMITS` enthält die Standardwerte; ein Wert außerhalb des Bereichs wirft einen `ValidationError`.

| Limit | Standard | Bereich | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1 bis 10 000 | Modellaufrufe, einschließlich Reparaturen und Prüfungen; ist es erreicht, hält der Lauf an (`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | 0 bis 10 000 | Suchen; sind sie aufgebraucht, geht der Lauf ohne Suchen weiter (Hinweis `searchesSkipped`) |
| `maxLoops` | 1 | 0 bis 10 | Frühere Phasen, die der Lauf wieder öffnen darf |
| `timeoutMs` | 1 200 000 (20 Minuten) | 1 bis 2 147 483 647 | Dauer des Laufs; ist sie erreicht, wird der Lauf abgebrochen (`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | 1 bis 50 | Ergebnisse, die von einer Suche behalten werden |

### `Study` {#study}

| Member | |
| --- | --- |
| `id` | `study_…`, für jede Studie neu: das `metadata.agentId` ihrer Ereignisse und die Agenten-ID ihrer Budgets, Richtlinien und Tool-Aufrufe |
| `name`, `language`, `charter`, `charterHash` | Der Name, die Sprache, die eingefrorene `StudyCharter` und ihr SHA-256 (hexadezimal), aufgezeichnet in `study.started` und bei jedem Nachtrag |
| `amendments` | `StudyAmendment[]`: angenommene und abgelehnte, der Reihe nach |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. Setzt dort fort, wo der letzte Lauf angehalten hat: Der Wächter beurteilt zuerst, was dieser Lauf unbeurteilt gelassen hat, eine beurteilte, aber nicht beendete Phase wird nur noch beendet, dann laufen die nicht abgeschlossenen Phasen. `restart` beginnt die Studie von vorn: Phasen, Ergebnisse, Suchen, Drift-Protokoll, Nummerierung und Läufe werden gelöscht; die Charta und die Nachträge bleiben. Ein Limit, eine Richtlinie, ein Abbruch oder ein Fehler beendet den Lauf mit seinem Status und dem Bericht über das bereits Erledigte; es wirft nur bei einem bereits laufenden Lauf, einem `onEvent`, das nicht bedient werden kann, oder einem fehlschlagenden Ereignisspeicher. `onEvent` funktioniert wie bei `agent.run` |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. Allein gegenüber der Charta eingeordnet, nie gegenüber früheren Nachträgen, in einem eigenen Lauf (`mode: 'study-amendment'`), in dem zuerst die Budget-Richtlinien geprüft werden; nur `refines` wird angenommen und erscheint in jedem späteren Prompt. `timeoutMs` (Standard 60 000) und `signal` begrenzen die Einordnung: Darüber hinaus, oder wenn eine Richtlinie sie ablehnt, wird der Nachtrag als `unclassified` abgelehnt. Wirft einen `ValidationError` bei einem leeren Text, einem Text von mehr als `MAX_AMENDMENT_LENGTH` (500 Zeichen) oder sobald `MAX_AMENDMENTS` (10) Nachträge angenommen wurden |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. Füllt die Felder 10 und 11 einer Karte aus und zeichnet `study.result_recorded` in dem Lauf auf, der sie geschrieben hat; ein `ValidationError` bei einer unbekannten Karte oder einem leeren `result` |
| `report()` | `StudyReport`: der Bericht in seinem aktuellen Stand, einschließlich der seit dem letzten Lauf erfassten Ergebnisse |

Eine Studie wird mit `sdk.createStudy` erstellt: Die Klasse `Study` wird wegen ihres Typs exportiert, und das, womit sie gebaut wird, ist intern. `MAX_AMENDMENTS` und `MAX_AMENDMENT_LENGTH` werden exportiert, ebenso `StudyAmendOptions`, der Typ der Optionen von `amend`.

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` – `status` ist `completed`; `stopped`, wenn ein Limit oder eine Budget- oder Timeout-Richtlinie den Lauf beendet hat, mit `stoppedBy` (`maxModelCalls`, `timeoutMs` oder `policy`); `failed`, wenn ein Fehler ihn beendet hat; oder `cancelled`. `error` ist der `Error`, der den Lauf beendet hat, `report` der `StudyReport` zum Zeitpunkt seines Endes und `markdown` dasselbe als Dossier.

### `StudyReport` {#studyreport}

```ts
interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  amendments: StudyAmendment[];
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];                       // { code, message, details? }
  passages: StudyPassageState[];                // { passage, state, attempts, reopenedBy, runId? }
  observations: StudyObservation[];             // O1…
  pieces: StudyPiece[];                         // P1…
  chain: StudyChainStage[];                     // C1…
  threeStates: StudyPieceStates[];              // { piece, atItsTime, currentBest, proposal }
  historicalChoices: StudyHistoricalChoice[];   // H1…
  advances: StudyAdvance[];                     // V1…
  leadVerdicts: StudyLeadVerdict[];             // L1…
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];     // I1…
  references: StudyReference[];                 // R1…
  analogues: StudyAnalogue[];                   // B1…
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];               // K1…
  revisableDecisions: StudyRevisableDecision[]; // D1…
  combinations: StudyCombination[];             // X1…
  capabilities: StudyCapability[];              // Y1…
  architectures: StudyArchitecture[];           // A1…, capabilities first
  noveltyClaims: StudyNoveltyClaim[];           // N1…
  experiments: StudyExperiment[];               // E1…
  cards: MechanismCard[];                       // M1…
  results: StudySearchResult[];                 // S1…
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  runIds: string[];                             // runs of run() since the last restart, oldest first
}

interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  status: 'established' | 'hypothesis' | 'novelty'; // after the study's checks
  declaredStatus?: StudyClaimStatus;                // the model's, when the study changed it
  statusReason?: StudyReason;
  sources: string[];                                // results listed in the prompt that wrote it
  unlistedSources?: string[];                       // cited, not listed in that prompt: they support nothing
  servesObjective: string;
  toVerify?: boolean;                               // a novelty whose prior art is not assessed yet
  priorArt?: { closest: string; sources: string[]; verdict: 'novel' | 'partlyNovel' | 'exists' };
  unchecked?: boolean;                              // not judged by the guardian: kept out of later prompts
  runId: string;
}

interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  message: string;                                  // the same reason, in English
}

interface StudyTrace {
  from: string[];                                   // records of the investigation it comes from
  unknownFrom?: string[];                           // cited, not listed in the design's prompt
  untraced?: boolean;                               // it cites none of the listed records
}
```

Jede Begründung des Berichts ist ein `StudyReason`: das `statusReason` von Behauptungen und Komponenten, der `reason` von Drift-Einträgen und Nachträgen und das `kindReason` einer herabgestuften Architektur. Das Dossier gibt seinen `code` in der Sprache der Studie wieder (`studyLabels(language).reasons`); ein Text, den der Wächter oder das Modell geschrieben hat, hat den Code `judged` und steht in `params.text`. Die Codes (`StudyReasonCode`):

| Codes | Warum |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | Eine `established`-Behauptung oder -Komponente, zur `hypothesis` herabgestuft: keine Quelle oder keine in ihrem Prompt aufgeführte Kennung |
| `noveltyNotSearchedYet`, `noveltyNoSource`, `noveltySearchBudget`, `noveltyNotSearched`, `noveltySearchFailed`, `noveltyNoResult`, `noveltyNotAssessed`, `noveltyUnsupported` | Warum eine Neuheit noch zu prüfen ist |
| `priorArtExists` | Eine Neuheit, zur `hypothesis` herabgestuft: Die nächstliegende Arbeit tut das bereits |
| `componentDocumented`, `componentUndocumented` | Eine als neu dargestellte Komponente |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead`, `leadAlreadyJudged` | Ein vom Schema abgelehntes Element |
| `designWithoutCapability` | Ein Entwurf ganz ohne neue Fähigkeit |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | Ein Nachtrag, der nicht eingeordnet werden konnte |
| `judged` | Die eigenen Worte des Wächters oder des Modells |

Jedes Element ist ein `StudyClaim` mit eigenen Feldern:

| Typ | Eigene Felder |
| --- | --- |
| `StudyObservation` | `kind` (`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?` (das Teil, das es genauer beschreibt) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors` (`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain` (`object` oder `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead` (so, wie die Charta sie schreibt), `verdict` (`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind` (`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?` (die Nummer des Durchbruchs der Charta, den es zerlegt), `domain?`, `date?`, `components` (zwei oder mehr `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state` (`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because` (die Bedingung, die sich geändert hat), `opens` |
| `StudyCombination` | `a`, `b`, `enables` (was A B ermöglicht), `exchange`, `cost`, `changes` (`representation`, `distribution`, `responsibilities`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind` (`capability` oder `improvement`), `declaredKind?` und `kindReason?` (eine Fähigkeit, die der Wächter nur für schneller oder günstiger hielt), `capability` (`what`, `forWhom`, `liftedConstraint`), `principleChange?` (`principle`: `representation`, `distribution`, `responsibility`, `trust`, `verification` oder `other`; `change`), `mechanism`, `components` (`StudyComponent[]`: `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?` sowie ein `StudyTrace`), `assembly` (`component`, `gives`, `exchanges`, `cost` sowie ein `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain` (`stage`, `how`), `uncoveredStages` (Stufen der gesamten Kette, die sie auslässt, wie die Studie sie geprüft hat), `predictions` |
| `StudyThreeState` | `piece`, `state` (`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected` (`architecture`, `result`), `wholeChain` |
| `MechanismCard` | Felder 1 bis 9: `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment`; Felder 10 und 11, sobald Sie sie erfasst haben: `resultAndError?` (`result`, `error?`), `conclusionAndMemory?` und `resultRecordedAt?` |

Die übrigen Einträge des Berichts sind keine Behauptungen:

| Typ | Felder |
| --- | --- |
| `StudyAmendment` | `number?` (nur angenommene, ab 1), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`StudyReason`), `by` (`guardian`: vom Ziel abgewichen; `schema`: vorher abgelehnt, zum Beispiel ohne `servesObjective`), `attempt` (2 bei einer Wiederholung), `runId` |
| `StudySearchResult` | `id` (`S1`…, beibehalten, wenn dasselbe Ergebnis erneut gefunden wird, bis zu einem Neustart), `title`, `locator` (eine URL oder eine andere Fundstelle), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose` (`research` oder `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `skipped?` (`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state` (`complete`; `partial`: beurteilt, aber nicht beendet, weil sie auf ihre Schleife wartet oder ihre Recherche zum Stand der Technik unterbrochen wurde; `unchecked`: Elemente, die der Wächter nicht beurteilt hat; `notRun`), `attempts` (2 nach einer Wiederholung), `reopenedBy`, `runId?` |
| `StudyNotice` | `code` (`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `noveltiesToVerify`), `params?` (`limit`, `error`, `count`), `details?` (die betroffenen Phasen, Paare `passage.collection`, Spuren, Durchbrüche oder Architekturen), `message` (auf Englisch; das Dossier gibt den Code in seiner Sprache wieder) |
| `StudyStats` | Seit dem letzten Neustart: `runs` und `modelCalls` (die Läufe von `run()` und die darin vom Anbieter beantworteten Aufrufe), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus` (pro Status), `downgraded` (Behauptungen, deren Status die Studie herabgestuft hat), `noveltiesToVerify`, `redos`, `loops`. Dazu `amendments` (`count`, `modelCalls`): alle Nachträge der Studie, getrennt gezählt |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

Gibt den Bericht als lesbares Markdown-Dossier zurück, in der Sprache des Berichts: das `markdown` eines `StudyResult`. Rufen Sie es mit `study.report()` auf, um die seitdem erfassten Ergebnisse einzuschließen. Seine Wörter stammen aus `studyLabels(language)` (`StudyLabels`), die es in den elf Sprachen dieser Dokumentation gibt (`StudyLabelLanguage`); eine andere oder eine unbekannte Sprache erhält die englischen Wörter, und `fr-CA` die französischen.

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

Läufe werden **nach der Bedeutung ihrer Ereignisse** verglichen, nie nach Ereignis-IDs (jeder Lauf hat neue). Die Ereignisse werden der Reihe nach einander zugeordnet: zuerst identische Ereignisse, dann Ereignisse desselben Typs und Gegenstands (das Tool, die Operation, die Phase einer Studie, die Antwort), deren Daten sich geändert haben, dann Ereignisse, deren Typ sich für denselben Gegenstand geändert hat. Nie verglichen werden: Ereignis-IDs, Zeitpunkte, Metadaten, `incident.reported`-Ereignisse (sie halten Zustellungen und Drosselung fest; das Ereignis, das den Vorfall ausgelöst hat, wird verglichen) sowie die Werte, die das SDK schreibt und die sich von Lauf zu Lauf ändern: die Dauer eines Tool-Aufrufs, der Token-Verbrauch, die Wartezeiten vor Wiederholungen, Freigabe-IDs, der Lauf, von dem ein Replay stammt, Zeitpunkt und Quellereignis einer Beobachtung. Der Text, den ein Modell neben einen Tool-Aufruf schreibt, wird nur in `intention.generated` verglichen. Parameter, Ergebnis und Eingabe eines Tools werden immer verglichen, wie auch immer ihre Schlüssel heißen: Ein Argument `duration`, das von 30 auf 60 ging, ist eine Änderung. Ein Lauf, der dasselbe noch einmal tut, besteht; ein Tool, das mit anderen Argumenten aufgerufen wird, wird dort gemeldet, wo der Aufruf stattfand (`parameters.metric: "churn" → "revenue"`); ein Aufruf, der vor einem identischen eingefügt wurde, ist ein einziger hinzugekommener Aufruf; ein `action.executed`, das zu `action.failed` wurde, ist eine einzige Änderung, kein Verlust plus eine Ergänzung.

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
| `StudyRunOptions.onEvent`: `study.run({ onEvent })` | Dasselbe für den Lauf einer Studie, dessen `limits.timeoutMs` das Warten ebenfalls beendet |
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
