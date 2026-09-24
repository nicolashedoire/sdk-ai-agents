# Architektur

![Architektur des SDK](/images/architecture.svg){.illustration}

## Kognitive Schicht (v0.2) {#cognitive-layer-v0-2}

Version 0.2 fügt über der unten beschriebenen kontrollierten Laufzeitumgebung eine Denkschicht hinzu. Sie besteht aus kleinen, austauschbaren Teilen:

| Teil | Modul | Verantwortung |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | Laufschleife, Abbruch, Timeout, Feedback |
| `OperationSelector` | `src/cognition/operation-selector.ts` | Berechnet die verfügbaren Operationen, fragt den Controller, erzwingt die abschließende Entscheidung |
| Controller | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | Heuristische und von Jev gestützte Wahl der nächsten Operation |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | Leitet an den Gedankengenerator, den Informationssucher, den Vorhersagetester oder den Assessor weiter |
| Aufnahme der Patches | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | Einziger Eingang jedes Gedankens: pro Operation erlaubte Felder, Felder nur für die Engine, Festlegung der Entscheidung |
| Belege | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | Herkunft der Beobachtungen, Revisionen von Fakten, Vergleiche, Testergebnisse, Widersprüche und ihre Auflösungen |
| Zustandsansicht | `src/cognition/mental-state-view.ts` | Kompakte Ansicht des Zustands für Gedanken-Prompts und Controller-Datensätze: Bereitschaft, Rangfolge, bereits durchgeführte Experimente |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | Führt Ihren `OutcomeEvaluator` auf einer ausstehenden Vorhersage aus und zeichnet den Bericht auf |
| Abschlussprüfung | `src/cognition/decision-readiness.ts` | Rangfolge, Bereitschaftsprüfung, verbindlich / vorläufig / Enthaltung |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | Ein Prompt pro Operation, striktes JSON, Zod-Validierung, eine Reparatur |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | Tool-Auswahl mit der nativen Reasoning Engine, Ausführung durch die Action Engine |
| Reducer | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | Reine, deterministische Anwendung von Gedanken-Patches mit Invarianten, versioniert über `schemaVersion` |
| Replay | `src/cognition/mental-state-replay.ts` | Rekonstruktion des mentalen Zustands und Controller-Datensatz aus Ereignissen |
| Profile | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | Profilschema, Darstellung, Verfeinerung, Destillation |
| Assessoren | `src/cognition/hypothesis-assessor.ts` | `compare` mit typisierten Entscheidungen: Belege ohne den Denker abgefragt, Passung nur für Vorschläge abgefragt |
| Recorder & Factory | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | Ereignisformen eines kognitiven Laufs; Zusammenbau eines Agenten aus seiner Konfiguration und den Diensten des SDK |

Darum herum: `src/decisions` (typisierte Entscheidungen, Jev-Client, Entscheidungsdienst), `src/costs` (Preise und Laufkosten), `src/resilience` (Wiederholungsrichtlinie und wiederholender Anbieter), `src/incidents` (Regeln, Notifier, überwachter Ereignisspeicher) und `src/mcp` (Server und Client, veröffentlicht als `@sdk-ai-agents/core/mcp`).

Der Rest dieser Seite dokumentiert die kontrollierte Laufzeitumgebung (v0.1).

## Zusammenfassung {#executive-summary}

SDK_AI_Agents folgt einer Event-Sourcing-Architektur mit strikter Trennung zwischen Denken und Handeln. Das SDK verbirgt die interne Komplexität hinter einer einfachen, intuitiven API.

## Architekturmuster {#architecture-pattern}

**Hauptmuster:** Event Sourcing mit Trennung der Verantwortlichkeiten (Separation of Concerns)

- **Reasoning Engine**: Erzeugt Intentionen aus dem LLM (keine Seiteneffekte)
- **Action Engine**: Führt Intentionen nach der Validierung aus
- **Policy Engine**: Validiert Intentionen gegen die Richtlinien
- **Event Store**: Einzige Quelle der Wahrheit für alle Ereignisse

## Überblick über die Komponenten {#component-overview}

### 1. SDK-API-Schicht (Fassade) {#_1-sdk-api-layer-facade}

**Verantwortlichkeiten:**
- Einfache, intuitive öffentliche Schnittstelle
- Abbildung API → interne Ereignisse
- Intelligente Standardkonfiguration
- Verwaltung des Lebenszyklus von SDK und Agenten

**Dateien:**
- `src/sdk.ts`: Hauptimplementierung (`SDKImpl`)
- `src/agent.ts`: Implementierung des Agenten (`AgentImpl`)
- `src/index.ts`: Öffentliche Exporte

**Wichtigste Schnittstellen:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. Reasoning Engine {#_2-reasoning-engine}

**Verantwortlichkeiten:**
- Integration mit dem LLM-Anbieter (OpenAI/Anthropic)
- Erzeugung strukturierter Intentionen aus den Antworten des LLM
- Verwaltung des Gesprächskontexts
- Ausgabe von Denk-Ereignissen

**Datei:** `src/engines/reasoning-engine.ts`

**Einschränkungen:**
- Kann nie direkt ein Tool ausführen
- Kann nie einen Seiteneffekt auslösen
- Erzeugt nur strukturierte Intentionen

**Abhängigkeiten:**
- LLM-Anbieter (Strategy Pattern)
- Event Store (Ausgabe von Ereignissen)

### 3. Action Engine {#_3-action-engine}

**Verantwortlichkeiten:**
- Empfang und Validierung von Intentionen
- Ausführung von Tools über die Tool Registry
- Anwendung von Richtlinien über die Policy Engine
- Ausgabe von Aktionsereignissen

**Datei:** `src/engines/action-engine.ts`

**Einschränkungen:**
- Jede Aktion muss durch die Action Engine laufen
- Validierung vor der Ausführung erforderlich
- Für jede Aktion wird ein Ereignis ausgegeben

**Abhängigkeiten:**
- Policy Engine (Validierung)
- Tool Registry (Ausführung)
- Event Store (Ausgabe von Ereignissen)
- Approval Manager (optional)
- Budget Tracker (optional)

### 4. Policy Engine {#_4-policy-engine}

**Verantwortlichkeiten:**
- Validierung von Intentionen gegen die aktiven Richtlinien
- Anwendung globaler und spezifischer Richtlinien
- Prüfung von Budgets, Timeouts, Allowlists
- Ausgabe von Validierungsereignissen

**Datei:** `src/engines/policy-engine.ts`

**Einschränkungen:**
- Deny-by-default: Alles ist verboten, sofern nicht ausdrücklich erlaubt
- Verpflichtende Prüfung vor jeder Aktion

**Abhängigkeiten:**
- Event Store (Ausgabe von Validierungsereignissen)
- Budget Tracker (optional)
- Condition Evaluator

### 5. Replay Engine {#_5-replay-engine}

**Verantwortlichkeiten:**
- Erneutes Abspielen von Ausführungen aus persistierten Ereignissen
- Deterministisches Replay ohne LLM-Aufruf
- Erzeugung neuer Replay-Ereignisse

**Datei:** `src/engines/replay-engine.ts`

**Einschränkungen:**
- Replay verwendet nur persistierte Ereignisse
- Kein LLM-Aufruf während des Replays
- Replay reproduziert dieselbe logische Abfolge

**Abhängigkeiten:**
- Event Store (Lesen von Ereignissen)
- Action Engine (Ausführung von Intentionen)

### 6. Event Store {#_6-event-store}

**Verantwortlichkeiten:**
- Persistieren von Ereignissen (nur anhängend)
- Abrufen von Ereignissen nach runId
- Filtern und Abfragen von Ereignissen
- Abstraktion für verschiedene Implementierungen

**Dateien:**
- `src/stores/event-store.ts`: Schnittstelle `IEventStore`
- `src/stores/file-event-store.ts`: Dateibasierte Implementierung
- `src/stores/sql-event-store.ts`: Generische SQL-Implementierung
- `src/stores/sqlite-event-store.ts`: SQLite-Implementierung
- `src/stores/postgresql-event-store.ts`: PostgreSQL-Implementierung

**Schnittstelle:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
}
```

### 7. Tool Registry {#_7-tool-registry}

**Verantwortlichkeiten:**
- Verwaltung der deklarierten Tools
- Validierung des Eingabeschemas (Zod)
- Ausführung von Tools mit Validierung
- Strikte Allowlist (deny-by-default)

**Datei:** `src/registry/tool-registry.ts`

**Einschränkungen:**
- Automatische Ablehnung nicht deklarierter Tools
- Verpflichtende Validierung vor der Ausführung
- Strikte Allowlist

**Abhängigkeiten:**
- Zod (Schemavalidierung)

### 8. Capability Registry {#_8-capability-registry}

**Verantwortlichkeiten:**
- Verwaltung der Fähigkeiten (Gruppen von Tools)
- Zuordnung Tool ↔ Fähigkeit

**Datei:** `src/registry/capability-registry.ts`

### 9. Abstraktion der LLM-Anbieter {#_9-llm-provider-abstraction}

**Verantwortlichkeiten:**
- Unterschiede zwischen LLM-Anbietern abstrahieren
- Formate von Anfragen/Antworten normalisieren
- Unterstützung mehrerer Anbieter (OpenAI, Anthropic)
- Automatischer Fallback

**Dateien:**
- `src/providers/llm-provider.ts`: Schnittstelle `LLMProvider`
- `src/providers/openai-provider.ts`: OpenAI-Implementierung
- `src/providers/anthropic-provider.ts`: Anthropic-Implementierung
- `src/providers/fallback-provider.ts`: Anbieter mit Fallback
- `src/providers/provider-factory.ts`: Factory zum Erstellen von Anbietern

**Schnittstelle:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
}
```

### 10. Manager-Klassen {#_10-manager-classes}

**Verantwortlichkeiten:**
- Verwaltung erweiterter Funktionen
- Koordination zwischen Komponenten

**Dateien:**
- `src/managers/approval-manager.ts`: Verwaltung menschlicher Freigaben
- `src/managers/budget-tracker.ts`: Verfolgung von Budget und Verbrauch
- `src/managers/golden-trace-manager.ts`: Verwaltung der Golden Traces
- `src/managers/regression-test-manager.ts`: Verwaltung der Testsuiten
- `src/managers/assertion-manager.ts`: Verwaltung der Assertionen
- `src/managers/impact-analysis-manager.ts`: Verwaltung der Auswirkungsanalysen

## Datenarchitektur {#data-architecture}

### Ereignistypen {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'intention.generated'
  | 'intention.rejected'
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed'
  | 'provider.fallback'
  | 'error.occurred';
```

### Struktur eines Ereignisses {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### Implementierungen des Event Store {#event-store-implementations}

1. **FileEventStore** (MVP)
   - Dateibasierte Persistenz
   - Eine JSON-Datei pro runId
   - Automatisches Schreiben in Stapeln

2. **SQLEventStore** (Produktion)
   - Generische SQL-Implementierung
   - Unterstützung für SQLite und PostgreSQL
   - Indizes für die Performance

3. **PostgreSQLEventStore** (fortgeschrittene Produktion)
   - Verwendet JSONB für effiziente Speicherung
   - GIN-Indizes für JSON-Abfragen
   - Unterstützung erweiterter Abfragen

## API-Design {#api-design}

### Initialisierung des SDK {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Erstellung eines Agenten {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Definition eines Tools {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Ausführung eines Agenten {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Teststrategie {#testing-strategy}

### Unit-Tests {#unit-tests}

- Unit-Tests für jedes Modul
- Verwendet Vitest
- Mocking externer Abhängigkeiten

### Integrationstests {#integration-tests}

- Integrationstests für vollständige Arbeitsabläufe
- Tests mit verschiedenen Event Stores
- Replay-Tests

### Golden Traces {#golden-traces}

- Referenz-Traces für Regressionstests
- Verhaltensvalidierung per Replay
- Automatische Erkennung von Regressionen

## Bereitstellungsarchitektur {#deployment-architecture}

### Paketverteilung {#package-distribution}

- **Paketname**: `@sdk-ai-agents/core`
- **Verteilung**: npm
- **Einstiegspunkt**: `dist/index.js`
- **Typdefinitionen**: `dist/index.d.ts`

### Build-Prozess {#build-process}

1. TypeScript-Kompilierung (`tsc`)
2. Source Maps werden erzeugt
3. Deklarationsdateien werden erzeugt
4. Ausgabe in `dist/`

### Abhängigkeiten {#dependencies}

**Laufzeit:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Peer-Abhängigkeiten:**
- `pg`: ^8.11.0 (für PostgreSQLEventStore)

**Entwicklungsabhängigkeiten:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Sicherheitsaspekte {#security-considerations}

### Deny-by-default {#deny-by-default}

- Alle Tools müssen explizit deklariert werden
- Alle Aktionen müssen durch die Policy Engine laufen
- Verpflichtende Validierung vor der Ausführung

### Trennung der Verantwortlichkeiten {#separation-of-concerns}

- Die Reasoning Engine kann keine Tools ausführen
- Die Action Engine validiert vor der Ausführung
- Die Policy Engine prüft alle Aktionen

### Audit-Trail {#audit-trail}

- Alle Ereignisse werden persistiert
- Vollständige Nachvollziehbarkeit der Entscheidungen
- Audit-Trail der Richtlinien

## Performance-Aspekte {#performance-considerations}

### Performance des Event Store {#event-store-performance}

- FileEventStore: Schreiben in Stapeln (10 Ereignisse oder 100 ms)
- SQLEventStore: Indizes für schnelle Abfragen
- PostgreSQLEventStore: JSONB + GIN-Indizes

### Overhead des SDK {#sdk-overhead}

- Minimaler Overhead (< 5–10 ms ohne LLM/Tools)
- Asynchrone Ausgabe von Ereignissen
- Schreiben in Stapeln für die Performance

## Künftige Überlegungen {#future-considerations}

### Skalierbarkeit {#scalability}

- Migration zu einem verteilten Event Store (im Stil von Kafka)
- Unterstützung mehrerer Instanzen
- Clustering des Event Store

### Funktionen {#features}

- Unterstützung weiterer LLM-Anbieter
- Event Store in der Cloud (S3 usw.)
- Monitoring-Dashboard
