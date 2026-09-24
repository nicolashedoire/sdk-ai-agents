# Entwicklerleitfaden

## Voraussetzungen {#prerequisites}

### Erforderlich {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: In Node.js enthalten
- **TypeScript**: 5.3.2+ (lokal über npm installiert)

### Optional {#optional}

- **PostgreSQL**: 8.11.0+ (für PostgreSQLEventStore, Peer-Abhängigkeit)
- **Git**: Für die Versionsverwaltung

## Einrichtung der Umgebung {#environment-setup}

### 1. Das Repository klonen {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Die Abhängigkeiten installieren {#_2-install-dependencies}

```bash
npm install
```

### 3. Umgebungsvariablen konfigurieren {#_3-configure-environment-variables}

Legen Sie im Stammverzeichnis eine Datei `.env` an (optional, für die Beispiele):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Lokale Entwicklung {#local-development}

### Build {#build}

TypeScript kompilieren:

```bash
npm run build
```

Der kompilierte Code liegt anschließend in `dist/`.

### Watch-Modus {#watch-mode}

Im Watch-Modus kompilieren (automatische Neukompilierung):

```bash
npm run dev
```

### Beispiele ausführen {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## Tests {#testing}

### Alle Tests ausführen {#run-all-tests}

```bash
npm test
```

### Watch-Modus {#watch-mode-1}

```bash
npm run test:watch
```

### Testabdeckung {#coverage}

```bash
npm run test:coverage
```

### Eine bestimmte Testdatei ausführen {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## Codequalität {#code-quality}

### Linting {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Formatierung {#formatting}

```bash
# Format code
npm run format
```

### Vollständige Prüfung (Lint + Formatierung) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## Häufige Entwicklungsaufgaben {#common-development-tasks}

### Ein neues Tool hinzufügen {#adding-a-new-tool}

1. Definieren Sie das Tool mit `sdk.defineTool()`:

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. Fügen Sie das Tool einem Agenten hinzu:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### Eine neue Richtlinie hinzufügen {#adding-a-new-policy}

1. Definieren Sie die Richtlinie:

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. Wenden Sie die Richtlinie an:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Einen neuen Event Store hinzufügen {#adding-a-new-event-store}

1. Implementieren Sie `IEventStore`:

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. Verwenden Sie ihn im SDK:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Einen neuen LLM-Anbieter hinzufügen {#adding-a-new-llm-provider}

1. Implementieren Sie `LLMProvider`:

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

2. Fügen Sie ihn der `ProviderFactory` hinzu:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Build-Prozess {#build-process}

### TypeScript-Kompilierung {#typescript-compilation}

Der Build verwendet direkt den TypeScript-Compiler:

```bash
tsc
```

Konfiguration in `tsconfig.json`:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Strict-Modus**: Aktiviert
- **Source Maps**: Aktiviert
- **Deklarationsdateien**: Aktiviert

### Struktur der Ausgabe {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## Teststrategie {#testing-strategy}

### Unit-Tests {#unit-tests}

- Unit-Tests für jedes Modul
- Verwendet Vitest
- Kein Test ruft einen echten kostenpflichtigen Dienst auf, und keiner verwendet Modul-Mocks oder Spies: Die Ports des SDK werden von den Test-Doubles in `src/__tests__/support/` implementiert, und HTTP-Adapter, einschließlich der OpenAI- und Anthropic-Anbieter, laufen gegen lokale Server. `no-mocks.test.ts` lehnt `vi.mock`, `vi.fn` und `vi.spyOn` ab

### Integrationstests {#integration-tests}

- Integrationstests für vollständige Arbeitsabläufe
- Das Modell ist ein skriptgesteuerter Anbieter oder der echte OpenAI- bzw. Anthropic-Client, der mit einem lokalen Server im Format des Anbieters spricht; kein Test ruft eine echte API auf
- Tests mit verschiedenen Event Stores

### Beispielstruktur eines Tests {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## Debugging {#debugging}

### Source Maps {#source-maps}

Source Maps werden beim Build automatisch erzeugt. Mit ihnen können Sie den TypeScript-Code direkt debuggen.

### Debugging in VS Code {#vs-code-debugging}

Konfiguration in `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Codestil {#code-style}

### Bewährte Vorgehensweisen für TypeScript {#typescript-best-practices}

- **Strict-Modus**: Immer aktiviert
- **Typsicherheit**: Explizite Typen verwenden
- **Kein `any`**: `any` vermeiden, bei Bedarf `unknown` verwenden
- **Interfaces vs. Types**: Interfaces für Objekte bevorzugen, Types für Unions/Intersections

### Namenskonventionen {#naming-conventions}

- **Dateien**: kebab-case (`my-file.ts`)
- **Klassen**: PascalCase (`MyClass`)
- **Funktionen**: camelCase (`myFunction`)
- **Konstanten**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Types/Interfaces**: PascalCase (`MyType`)

### Codeorganisation {#code-organization}

- **Eine Klasse/Schnittstelle pro Datei**
- **Typen am selben Ort**: Typen in derselben Datei oder in `types/`
- **Barrel-Exporte**: `index.ts` für öffentliche Exporte

## Häufige Probleme {#common-issues}

### TypeScript-Fehler {#typescript-errors}

Wenn Sie TypeScript-Fehler erhalten:

1. Prüfen Sie, ob `tsconfig.json` korrekt ist
2. Prüfen Sie, ob alle Abhängigkeiten installiert sind
3. Bereinigen und neu bauen: `npm run clean && npm run build`

### Fehlschlagende Tests {#test-failures}

Wenn Tests fehlschlagen:

1. Prüfen Sie, ob die Test-Doubles in `src/__tests__/support/` noch zu den Schnittstellen passen, die sie ersetzen
2. Prüfen Sie, ob die Abhängigkeiten aktuell sind
3. Führen Sie die Tests im Watch-Modus aus, um Fehler in Echtzeit zu sehen

### Build-Fehler {#build-errors}

Wenn der Build fehlschlägt:

1. Prüfen Sie die TypeScript-Fehler: `npm run build`
2. Prüfen Sie die Linting-Fehler: `npm run lint`
3. Bereinigen Sie den Ordner `dist/`: `npm run clean`

## Release-Prozess {#release-process}

Versionen werden vom Workflow `Release` auf npm veröffentlicht, sobald ein Versions-Tag gepusht wird: Die Schritte stehen auf der Seite [Ein Release veröffentlichen](./releasing).

### Versionierung {#versioning}

Das Projekt verwendet semantische Versionierung (SemVer):
- **MAJOR**: Inkompatible Änderungen
- **MINOR**: Abwärtskompatible neue Funktionen
- **PATCH**: Abwärtskompatible Fehlerbehebungen

Solange die Version mit `0.` beginnt, erhöht eine inkompatible Änderung stattdessen MINOR (`0.2.0` → `0.3.0`) und alles andere PATCH: siehe [Ein Release veröffentlichen](./releasing#release-a-version).

### Checkliste vor dem Release {#pre-release-checklist}

- [ ] Alle Tests bestehen
- [ ] Code gelintet und formatiert
- [ ] Dokumentation aktuell
- [ ] CHANGELOG.md aktualisiert
- [ ] Version in `package.json` aktualisiert
- [ ] In der Dokumentation angezeigte Version aktualisiert (`const version` in `docs/.vitepress/config.mts`)

### Build für das Release {#build-for-release}

```bash
# The checks of the CI but coverage and the docs build, on a fresh dist/
# (what prepublishOnly runs before npm publish)
npm run clean && npm run verify

# The files that would be published
npm pack --dry-run
```

## Ressourcen {#resources}

- **Dokumentation**: `docs/`
- **Beispiele**: `examples/`
- **Typdefinitionen**: `src/types/`
- **Tests**: `src/__tests__/`

## Dokumentationswebsite {#documentation-site}

Die Dokumentation ist eine VitePress-Website in `docs/`, illustriert mit SVGs in `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

Der GitHub-Actions-Workflow `Docs` veröffentlicht sie bei jedem Push auf `main` auf GitHub Pages.
