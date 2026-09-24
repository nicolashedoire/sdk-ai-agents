# Quellcodestruktur

## Überblick {#overview}

Das SDK ist in eine klare modulare Struktur mit getrennten Verantwortlichkeiten gegliedert. Der Hauptquellcode liegt in `src/`, mit Unterordnern für jeden fachlichen Bereich.

## Vollständige Verzeichnisstruktur {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## Zentrale Verzeichnisse {#critical-directories}

### `src/engines/` {#src-engines}

**Zweck:** Enthält die Haupt-Engines des SDK, die den Lebenszyklus eines Agenten orchestrieren.

**Enthält:**
- `reasoning-engine.ts`: Erzeugt Intentionen aus dem LLM (keine Seiteneffekte)
- `action-engine.ts`: Führt Intentionen nach der Validierung durch die Policy Engine aus
- `policy-engine.ts`: Validiert Intentionen gegen die konfigurierten Richtlinien
- `replay-engine.ts`: Spielt Ausführungen aus persistierten Ereignissen erneut ab

**Einstiegspunkte:** Verwendet von `AgentImpl` und `SDKImpl`

**Integration:** Die Engines werden über den Konstruktor in `AgentImpl` und `SDKImpl` injiziert

### `src/stores/` {#src-stores}

**Zweck:** Implementierungen der Schnittstelle `IEventStore` für die Persistenz von Ereignissen.

**Enthält:**
- `event-store.ts`: Gemeinsame Schnittstelle `IEventStore`
- `file-event-store.ts`: Dateibasierte Implementierung (MVP)
- `sql-event-store.ts`: Generische SQL-Implementierung
- `sqlite-event-store.ts`: SQLite-Implementierung
- `postgresql-event-store.ts`: PostgreSQL-Implementierung mit JSONB

**Einstiegspunkte:** Verwendet von `SDKImpl` und `ReplayEngine`

**Integration:** Über die Konfiguration in `SDKImpl` injiziert

### `src/providers/` {#src-providers}

**Zweck:** Implementierungen der Schnittstelle `LLMProvider` für verschiedene LLM-Anbieter.

**Enthält:**
- `llm-provider.ts`: Gemeinsame Schnittstelle `LLMProvider`
- `openai-provider.ts`: OpenAI-Implementierung
- `anthropic-provider.ts`: Anthropic-Implementierung
- `fallback-provider.ts`: Anbieter mit automatischem Fallback
- `provider-factory.ts`: Factory zum Erstellen von Anbietern

**Einstiegspunkte:** Verwendet von `ReasoningEngine`

**Integration:** Über den Konstruktor in `ReasoningEngine` injiziert

### `src/managers/` {#src-managers}

**Zweck:** Verwaltungsklassen für erweiterte Funktionen (Freigaben, Budgets, Tests usw.).

**Enthält:**
- `approval-manager.ts`: Verwaltung menschlicher Freigaben
- `budget-tracker.ts`: Verfolgung von Budget und Verbrauch
- `golden-trace-manager.ts`: Verwaltung der Golden Traces
- `regression-test-manager.ts`: Verwaltung der Regressionstestsuiten
- `assertion-manager.ts`: Verwaltung der Verhaltensassertionen
- `impact-analysis-manager.ts`: Verwaltung der Auswirkungsanalysen

**Einstiegspunkte:** Verwendet von `SDKImpl` und `PolicyEngine`

**Integration:** Über den Konstruktor in `SDKImpl` und `PolicyEngine` injiziert

### `src/registry/` {#src-registry}

**Zweck:** Registries zur Verwaltung der verfügbaren Tools und Fähigkeiten.

**Enthält:**
- `tool-registry.ts`: Verwaltung der verfügbaren Tools (deny-by-default)
- `capability-registry.ts`: Verwaltung der Fähigkeiten (Gruppen von Tools)

**Einstiegspunkte:** Verwendet von `SDKImpl` und `ActionEngine`

**Integration:** Über den Konstruktor in `SDKImpl` und `ActionEngine` injiziert

### `src/types/` {#src-types}

**Zweck:** TypeScript-Definitionen für alle Typen des SDK.

**Enthält:**
- Typen für Agent, Tool, Policy, Event, Run, SDK
- Typen für erweiterte Funktionen (Reasoning Graph, Alternatives usw.)
- Typen für Tests (Golden Trace, Regression, Assertion usw.)

**Einstiegspunkte:** Von allen Modulen importiert

**Integration:** In der gesamten Codebasis für die Typsicherheit verwendet

### `src/utils/` {#src-utils}

**Zweck:** Hilfsfunktionen.

**Enthält:**
- `constants.ts`: Globale Konstanten
- `id.ts`: Erzeugung eindeutiger Kennungen
- `zod-to-json-schema.ts`: Umwandlung Zod → JSON Schema
- Hilfsfunktionen für Reasoning Graph, Alternatives, Patterns usw.
- Hilfsfunktionen für Tests (Validierung, Regression, Assertion usw.)

**Einstiegspunkte:** Von den Modulen importiert, die sie brauchen

**Integration:** Von den Engines, Managern und anderen Modulen verwendet

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**Zweck:** Kognitive Agenten – expliziter mentaler Zustand, kognitive Operationen, Controller, Denkerprofile.

**Enthält:** `cognitive-agent.ts` (Laufschleife), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (heuristisch), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` und `thought-prompts.ts`, `mental-state.ts` (Schemas und Typen), `mental-state-reducer.ts` und `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**Zweck:** Typisierte Entscheidungen – der Vertrag Noul/Choice/Score, der HTTP-Client für TypeSafe Jev und der `DecisionService` hinter `sdk.decisions`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**Zweck:** Preise und Kostenberichte pro Lauf; Wiederholungsrichtlinie und wiederholender LLM-Anbieter; Incident-Regeln, Notifier (E-Mail, Webhook, Resend) und der überwachte Event Store.

### `src/mcp/` und `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**Zweck:** MCP-Server, der kontrollierte Tools und Ressourcen bereitstellt (`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`), und MCP-Client, der Tools importiert (`mcp-client.ts`). Veröffentlicht als Einstiegspunkt `@sdk-ai-agents/core/mcp`, damit der Kern nicht von `@modelcontextprotocol/sdk` abhängt.

### `src/tools/` {#src-tools}

**Zweck:** Tool-Quellen, die `ToolDefinition`s aus einem System erstellen, ohne Abhängigkeit von MCP: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (Web-APIs), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (Ordner und Ressourcen), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (schreibgeschützte Datenbanken), `agent-tools.ts` (Agenten als Tools), dazu `tool-names.ts` und `bounded-text.ts`.

### `src/__tests__/support/` {#src-tests-support}

**Zweck:** Test-Doubles, die die Ports des SDK implementieren (skriptgesteuerter LLM-Anbieter, Entscheidungsclient im Speicher, lokaler HTTP-Server, aufzeichnender PostgreSQL-Client, Loader für `node:sqlite`) – keine Modul-Mocks.

## Einstiegspunkte {#entry-points}

### Haupteinstieg {#main-entry}

- **`src/index.ts`**: Öffentlicher Einstiegspunkt des SDK, exportiert alle öffentlichen APIs

### Einstiegspunkte der Anwendung {#application-entry-points}

- **`src/sdk.ts`**: Hauptimplementierung des SDK (`SDKImpl`)
- **`src/agent.ts`**: Implementierung des Agenten (`AgentImpl`)

## Muster der Dateiorganisation {#file-organization-patterns}

### Namenskonventionen {#naming-conventions}

- **Dateien**: kebab-case für Dateien (z. B. `reasoning-engine.ts`)
- **Klassen**: PascalCase (z. B. `ReasoningEngine`)
- **Schnittstellen**: PascalCase, bei Bedarf mit Präfix `I` (z. B. `IEventStore`)
- **Typen**: PascalCase (z. B. `EventType`, `RunStatus`)
- **Funktionen**: camelCase (z. B. `generateCompletion`)

### Modulorganisation {#module-organization}

- **Eine Klasse/Schnittstelle pro Datei**: Jede Datei enthält eine Hauptklasse oder -schnittstelle
- **Typen am selben Ort**: Zugehörige Typen in derselben Datei oder in `types/`
- **Barrel-Exporte**: `index.ts` zum Exportieren der öffentlichen APIs

## Konfigurationsdateien {#configuration-files}

- **`package.json`**: Abhängigkeiten und npm-Skripte
- **`tsconfig.json`**: TypeScript-Konfiguration (Strict-Modus, ESM)
- **`biome.json`**: Biome-Konfiguration (Linting/Formatierung)
- **`vitest.config.ts`**: Vitest-Konfiguration (Tests)

## Hinweise für die Entwicklung {#notes-for-development}

### Neue Funktionen hinzufügen {#adding-new-features}

1. **Neue Engine**: In `src/engines/` anlegen, in `SDKImpl` oder `AgentImpl` injizieren
2. **Neuer Speicher**: `IEventStore` in `src/stores/` implementieren
3. **Neuer Anbieter**: `LLMProvider` in `src/providers/` implementieren
4. **Neuer Manager**: In `src/managers/` anlegen, in `SDKImpl` injizieren
5. **Neue Typen**: Zu `src/types/` hinzufügen, aus `types/index.ts` exportieren

### Tests {#testing}

- Unit-Tests in `src/__tests__/`
- Eine Testdatei pro Quellmodul
- Vitest für Tests verwenden

### Build {#build}

- TypeScript kompiliert `src/` → `dist/`
- Source Maps für das Debugging erzeugt
- TypeScript-Deklarationen (`.d.ts`) erzeugt
