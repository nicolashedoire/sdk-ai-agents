# Projektüberblick

**Typ:** Bibliothek (TypeScript-SDK)
**Architektur:** Event Sourcing mit Trennung der Verantwortlichkeiten

## Zusammenfassung {#executive-summary}

SDK_AI_Agents ist eine Governance-Infrastruktur für KI-Agenten mit nativem Event Sourcing, Replay und Security by Design. Das SDK macht aus KI-Agenten, die bisher experimentelle Werkzeuge waren, kontrollierbare, erklärbare und produktionsreife Entscheidungssysteme.

## Einordnung des Projekts {#project-classification}

- **Art des Repositorys:** Monolith (eine einzige zusammenhängende Codebasis)
- **Projekttyp:** Bibliothek (TypeScript-SDK)
- **Hauptsprache:** TypeScript 5.x
- **Architekturmuster:** Event Sourcing mit Trennung der Verantwortlichkeiten (Reasoning Engine ≠ Action Engine)

## Überblick über den Technologie-Stack {#technology-stack-summary}

| Kategorie | Technologie | Version | Begründung |
|----------|-----------|---------|---------------|
| Sprache | TypeScript | 5.3.2+ | Strikte Typsicherheit, ESM-Unterstützung |
| Laufzeitumgebung | Node.js | 20.0.0+ | LTS-Unterstützung, moderne Funktionen |
| Paketmanager | npm | - | Standard-Paketmanager von Node.js |
| Build-Werkzeug | TypeScript Compiler | 5.3.2 | Native TypeScript-Kompilierung |
| Tests | Vitest | 1.0.4 | Schneller, auf Vite basierender Test-Runner |
| Linting/Formatierung | Biome | 1.7.0 | Schnelles All-in-one-Werkzeug |
| LLM-Anbieter | OpenAI SDK | 4.20.0 | Integration der OpenAI-API |
| LLM-Anbieter | Anthropic SDK | 0.71.2 | Integration der Claude-API |
| Validierung | Zod | 3.22.4 | Schemavalidierung der Tool-Eingaben |
| UUID | uuid | 9.0.1 | Erzeugung eindeutiger Kennungen |
| Datenbank (optional) | PostgreSQL | 8.11.0+ | Event Store für die Produktion (Peer-Abhängigkeit) |

## Wichtigste Funktionen {#key-features}

### Kernfähigkeiten {#core-capabilities}

1. **Natives Event Sourcing**
   - Alle Ereignisse werden in einem Event Store persistiert
   - Deterministisches Replay ohne LLM-Aufruf
   - Vollständige Nachvollziehbarkeit jeder Entscheidung

2. **Trennung von Denken und Handeln**
   - Reasoning Engine: erzeugt Intentionen (keine Seiteneffekte)
   - Action Engine: führt Intentionen nach der Validierung aus
   - Security by Design: Das LLM löst nie direkt einen Seiteneffekt aus

3. **Eingebaute Governance**
   - Policy Engine: validiert Intentionen vor der Ausführung
   - Budget Tracker: verfolgt Kosten und Verbrauch pro Agent/Tool/Zeitraum
   - Approval Manager: Ablauf menschlicher Freigaben für kritische Aktionen
   - Audit-Trail: vollständige Nachvollziehbarkeit der Richtlinienentscheidungen

4. **LLM mit mehreren Anbietern**
   - Abstraktion LLMProvider für OpenAI und Anthropic
   - Automatischer Fallback zwischen Anbietern
   - Konfiguration pro Anbieter (temperature, maxTokens)

5. **Kognitive Beobachtbarkeit**
   - Reasoning Graph: Visualisierung des Denkprozesses
   - Alternatives Analysis: vom Agenten in Betracht gezogene Alternativen
   - Decision Patterns: Entscheidungsmuster über mehrere Läufe hinweg
   - Trace Visualization: Aufbereitung von Traces für die Visualisierung

6. **Tests & Qualitätssicherung**
   - Golden Traces: Referenz-Traces für Tests
   - Regression Detection: automatische Erkennung von Regressionen
   - Assertions: Verhaltensassertionen auf Traces
   - CI/CD-Integration: Export der Testergebnisse (JUnit XML, JSON)

7. **Erweiterte Beobachtbarkeit**
   - Run Comparison: Vergleich zweier Ausführungen
   - Impact Analysis: Auswirkungsanalyse vor/nach der Bereitstellung
   - Advanced Event Filtering: erweiterte Filterung von Ereignissen mit JSON-Pfaden

## Architektur im Überblick {#architecture-highlights}

### Abstraktion des Event Store {#event-store-abstraction}

- **IEventStore**: Gemeinsame Schnittstelle für alle Event Stores
- **FileEventStore**: Dateibasierte Implementierung (MVP)
- **SQLEventStore**: Generische SQL-Implementierung
- **SQLiteEventStore**: SQLite-Implementierung
- **PostgreSQLEventStore**: PostgreSQL-Implementierung mit JSONB

### Architektur der Engines {#engine-architecture}

- **ReasoningEngine**: Erzeugt Intentionen aus dem LLM
- **ActionEngine**: Führt Intentionen nach der Validierung aus
- **PolicyEngine**: Validiert Intentionen gegen die Richtlinien
- **ReplayEngine**: Spielt Ausführungen aus Ereignissen erneut ab

### Registry-System {#registry-system}

- **ToolRegistry**: Verwaltet die verfügbaren Tools
- **CapabilityRegistry**: Verwaltet die Fähigkeiten (Gruppen von Tools)

### Manager-System {#manager-system}

- **ApprovalManager**: Verwaltung menschlicher Freigaben
- **BudgetTracker**: Verfolgung von Budget und Verbrauch
- **GoldenTraceManager**: Verwaltung der Golden Traces
- **RegressionTestManager**: Verwaltung der Regressionstestsuiten
- **AssertionManager**: Verwaltung der Verhaltensassertionen
- **ImpactAnalysisManager**: Verwaltung der Auswirkungsanalysen

## Überblick über die Entwicklung {#development-overview}

### Voraussetzungen {#prerequisites}

- Node.js 20.0.0+ (LTS)
- npm oder gleichwertig
- TypeScript 5.3.2+ (lokal installiert)

### Erste Schritte {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### Wichtige Befehle {#key-commands}

- **Installieren:** `npm install`
- **Build:** `npm run build`
- **Entwicklung:** `npm run dev` (Watch-Modus)
- **Test:** `npm test`
- **Test im Watch-Modus:** `npm run test:watch`
- **Testabdeckung:** `npm run test:coverage`
- **Lint:** `npm run lint`
- **Formatieren:** `npm run format`
- **Prüfen:** `npm run check` (Lint + Formatierung)

## Struktur des Repositorys {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

Siehe [Quellcodestruktur](../contributing/source-tree) für die Einzelheiten von `src/`.

## Dokumentationsübersicht {#documentation-map}

Ausführliche Informationen finden Sie hier:

- [Einführung](../guide/introduction) – Wofür das SDK da ist
- [Quellcodestruktur](../contributing/source-tree) – Verzeichnisstruktur
- [Architektur](./architecture) – Ausführliche Architektur
- [Entwicklerleitfaden](../contributing/development) – Entwicklungsablauf
