# Grundkonzepte

## Überblick {#overview}

SDK AI Agents ist eine Governance-Infrastruktur für KI-Agenten, die das Denken vom Handeln trennt und natives Event Sourcing für Replay und Audit bereitstellt. Darauf aufbauend fügen [kognitive Agenten](./cognitive-agents) eine explizite Denkschicht hinzu und [typisierte Entscheidungen](./typed-decisions) kalibrierte, strukturierte Antworten.

::: info Diese Seite behandelt die Grundlagen
Agenten, Tools, Fähigkeiten, Richtlinien, Intentionen, der Ereignisspeicher, Traces und Replay. Sie gelten für kontrollierte und kognitive Agenten gleichermaßen.
:::

## Grundlegende Konzepte {#fundamental-concepts}

### 1. Agent {#_1-agent}

Ein **Agent** ist ein kontrolliertes Entscheidungssystem, das ein LLM verwendet, um Intentionen zu erzeugen, wobei aber alle Aktionen durch eine kontrollierte Action Engine laufen.

**Merkmale:**
- Minimale Konfiguration (Name, LLM-Modell)
- Explizit deklarierte Tools
- Richtlinien für die Governance
- Versionierung zur Nachverfolgung
- Fähigkeiten (Capabilities) zur Organisation der Tools

**Beispiel:**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. Tool {#_2-tool}

Ein **Tool** ist eine explizit deklarierte Fähigkeit, die der Agent nutzen kann. Alle Tools müssen vor der Verwendung registriert werden (deny-by-default).

**Merkmale:**
- Verpflichtendes Zod-Validierungsschema
- Asynchroner Handler
- Versionierung
- Zuordnung zu einer Fähigkeit (optional)

**Beispiel:**
```typescript
const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    // Implementation
  },
  version: '1.0.0',
  capability: 'math'
})
```

### 3. Fähigkeit (Capability) {#_3-capability}

Eine **Fähigkeit** (Capability) ist eine logische Gruppe von Tools, die sich in mehreren Agenten wiederverwenden lässt.

**Merkmale:**
- Name und Beschreibung
- Liste der zugeordneten Tools
- Versionierung
- Optionale Metadaten

**Beispiel (mit Tool-Namen):**
```typescript
const calculatorTool = sdk.defineTool({ /* ... */ });
const scientificTool = sdk.defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

**Beispiel (direkt mit Tool-Objekten):**
```typescript
const calculatorTool = defineTool({ /* ... */ });
const scientificTool = defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

### 4. Richtlinie (Policy) {#_4-policy}

Eine **Richtlinie** (Policy) legt die Governance-Regeln fest, die vor jeder Aktion angewendet werden.

**Arten von Richtlinien:**
- **Budget**: Begrenzung der Schritte oder Tokens
- **Timeout**: Maximale Ausführungsdauer
- **Allowlist**: Liste der erlaubten Tools
- **Custom**: Eigener Validator

**Beispiel:**
```typescript
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 }
  }],
  scope: 'global',
  enabled: true
})
```

### 5. Intention {#_5-intention}

Eine **Intention** ist eine vom LLM erzeugte Struktur, die beschreibt, was der Agent tun möchte, ohne es direkt auszuführen.

**Arten:**
- `tool_call`: Aufruf eines bestimmten Tools
- `final_answer`: Endgültige Antwort an den Nutzer
- `continue`: Weiter nachdenken

**Sicherheit:**
- Alle Intentionen werden von der Policy Engine validiert
- Keine direkte Aktion durch das LLM
- Vollständige Nachvollziehbarkeit

### 6. Ereignisspeicher (Event Store) {#_6-event-store}

Der **Ereignisspeicher** (Event Store) ist die einzige Quelle der Wahrheit für alle Ausführungen.

**Merkmale:**
- Automatische Persistenz (standardmäßig JSON-Dateien)
- Stapelverarbeitung (Batching) für die Performance
- Vollständiger Export
- Filterung nach Typ, Datum usw.

**Wichtigste Ereignisse:**
- `run.started`: Beginn der Ausführung
- `intention.generated`: Vom LLM erzeugte Intention
- `policy.checked`: Prüfung der Richtlinien
- `action.executed`: Ausgeführte Aktion
- `tool.called`: Aufgerufenes Tool
- `run.completed`: Ausführung abgeschlossen
- `run.failed`: Ausführung fehlgeschlagen
- `run.cancelled`: Ausführung abgebrochen

### 7. Trace {#_7-trace}

Ein **Trace** ist die für Menschen lesbare Darstellung einer vollständigen Ausführung.

**Inhalt:**
- Zeitlicher Ablauf der Ereignisse
- Statistische Zusammenfassung
- Endzustand
- Metadaten

**Beispiel:**
```typescript
const trace = await sdk.getTrace(runId)
console.log(trace.summary)
// {
//   totalEvents: 15,
//   duration: 1234,
//   intentionsGenerated: 3,
//   actionsExecuted: 2,
//   policiesChecked: 2,
//   toolsCalled: 2
// }
```

### 8. Replay {#_8-replay}

Mit **Replay** spielen Sie eine vollständige Ausführung erneut ab, ohne das LLM erneut anzufragen.

**Merkmale:**
- Deterministisch (gleiche Abfolge von Aktionen)
- Änderungen möglich (Eingabe, Richtlinien, Tools)
- Fehlersuche bei Incidents
- Regressionstests

**Beispiel:**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## Architekturprinzipien {#architectural-principles}

### 1. Trennung von Denken und Handeln {#_1-reasoning-action-separation}

Das LLM erzeugt Intentionen, niemals direkte Aktionen. Alle Aktionen laufen durch die Action Engine.

### 2. Deny-by-default {#_2-deny-by-default}

Standardmäßig ist nichts erlaubt. Alle Tools müssen explizit deklariert (registriert) werden, bevor irgendetwas sie ausführen kann.

::: warning Reichweite eines kontrollierten Agenten
Ein kontrollierter Agent kann **jedes im SDK registrierte Tool** ausführen, das das Modell nennt: Die Liste `tools` des Agenten legt fest, was dem Modell angeboten wird, nicht, was es aufrufen darf. Schränken Sie das mit einer `allowlist`-Richtlinie ein – jedes andere Tool wird dann vor der Ausführung abgelehnt:

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

Kognitive Agenten und MCP-Server sind automatisch auf ihre Tool-Liste beschränkt.
:::

### 3. Natives Event Sourcing {#_3-native-event-sourcing}

Dank Event Sourcing ist jede Ausführung nachvollziehbar und wiederholbar.

### 4. Eingebaute Governance {#_4-built-in-governance}

Richtlinien werden strukturell angewendet, nicht als Option.

### 5. Vollständige Versionierung {#_5-full-versioning}

Agenten, Tools und Fähigkeiten werden zur Nachverfolgung und Nachvollziehbarkeit versioniert.

## Typischer Arbeitsablauf {#typical-workflow}

1. **Initialisierung**: Das SDK mit dem API-Schlüssel erstellen
2. **Definition**: Tools und Fähigkeiten definieren
3. **Konfiguration**: Den Agenten mit Tools und Richtlinien erstellen
4. **Ausführung**: Den Agenten mit einer Eingabe starten
5. **Beobachtung**: Den Trace der Ausführung prüfen
6. **Replay**: Zur Fehlersuche oder zum Testen erneut abspielen

## Bewährte Vorgehensweisen {#best-practices}

### Tools {#tools}
- Strikte Zod-Schemas verwenden
- Jedes Tool klar dokumentieren
- Tools versionieren, wenn sie sich ändern

### Richtlinien {#policies}
- Vernünftige Budgets festlegen
- Strikte Allowlists verwenden
- Richtlinien vor der Produktion testen

### Fähigkeiten {#capabilities}
- Tools logisch gruppieren
- Fähigkeiten in mehreren Agenten wiederverwenden
- Fähigkeiten dokumentieren
- **Empfohlener Ablauf:** Sie können `defineCapability()` entweder Tool-Namen (Strings) oder direkt Tool-Objekte übergeben. Wenn Sie Tool-Objekte übergeben, werden diese automatisch registriert.

### Versionierung {#versioning}
- Semantische Versionierung verwenden
- Versionsänderungen dokumentieren
- Versionen in den Ereignissen nachverfolgen

## Sicherheit {#security}

- **Deny-by-default**: Kein nicht deklariertes Tool kann ausgeführt werden
- **Validierung**: Alle Eingaben werden mit Zod validiert
- **Richtlinien**: Vor jeder Aktion geprüft
- **Nachvollziehbarkeit**: Alle Aktionen werden nachverfolgt
- **Audit**: Replay für ein vollständiges Audit verfügbar
