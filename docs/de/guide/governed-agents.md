# Kontrollierte Agenten

Ein kontrollierter Agent führt die klassische Tool-Calling-Schleife aus – mit einem Unterschied: **Das LLM schlägt nur Intentionen vor**. Die Action Engine validiert jede Intention gegen Schemas und Richtlinien, bevor irgendetwas passiert, und zeichnet jeden Schritt auf. Diese Seite führt durch Tools, Fähigkeiten, Richtlinien, Traces, Replay und das Anhalten eines Laufs.

::: tip Nachdenken vor dem Handeln
Für offene Entscheidungen sind [kognitive Agenten](./cognitive-agents) vorzuziehen: Sie teilen dieselben Tools, Richtlinien und Traces.
:::

## Voraussetzungen {#prerequisites}

- Node.js 20+ installiert
- OpenAI-API-Schlüssel (oder ein anderer LLM-Anbieter)
- Grundkenntnisse in TypeScript/JavaScript

## Installation {#installation}

```bash
npm install @sdk-ai-agents/core zod@^3.25.28
```

## Erster Agent in 5 Minuten {#first-agent-in-5-minutes}

### Schritt 1: Das SDK initialisieren {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Schritt 2: Ein Tool definieren {#step-2-define-a-tool}

Ein Tool ist eine Fähigkeit, die der Agent nutzen kann. Es muss explizit deklariert werden.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### Schritt 3: Einen Agenten erstellen {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
});
```

### Schritt 4: Den Agenten ausführen {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### Schritt 5: Den Trace ansehen {#step-5-view-the-trace}

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## Vollständiges Beispiel (10 Zeilen) {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-5.4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## Wichtige Konzepte {#key-concepts}

### 1. Tools {#_1-tools}

Tools sind die einzigen Aktionen, die der Agent ausführen kann. **Standardmäßig ist nichts erlaubt** (deny-by-default): Ein Tool muss registriert sein, bevor irgendetwas es ausführen kann.

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

**Merkmale:**
- Explizite Definition mit einem Zod-Schema
- Automatische Validierung der Eingaben
- Versionierung unterstützt
- Vollständige Nachvollziehbarkeit

**Beispiel:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. Fähigkeiten {#_2-capabilities}

Mit Fähigkeiten (Capabilities) gruppieren Sie Tools logisch und verwenden sie wieder.

**Beispiel:**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  capabilities: ['math'],
});
```

### 3. Richtlinien {#_3-policies}

Richtlinien (Policies) steuern, was der Agent tun darf.

**Arten von Richtlinien:**
- **Budget**: Begrenzung der Schritte oder Tokens
- **Timeout**: Maximale Ausführungsdauer
- **Allowlist**: Liste der erlaubten Tools
- **Custom**: Eigener Validator

**Beispiel:**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

Budget- und Zeitlimits werden vor jedem Tool-Aufruf eines Laufs eines kontrollierten Agenten geprüft, anhand des Fortschritts des Laufs: `maxSteps` zählt die bereits erledigten Schritte (der erste Aufruf liegt bei Schritt 0), `maxTokens` die Tokens seiner Modellaufrufe, `maxDuration` die Zeit seit dem Start des Laufs. Ein Limit lehnt den Tool-Aufruf ab, wodurch der Lauf fehlschlägt; einen Modellaufruf unterbricht es nie. Token- und Kostenbudgets pro Zeitraum (`budgetLimit` mit `maxTokens` oder `maxCost`) zählen die Tokens und Kosten der Modellaufrufe kontrollierter Agenten, und ein Replay wendet `maxSteps`, `maxTokens` und `maxDuration` wie der ursprüngliche Lauf an (Budgets pro Zeitraum sehen den Verbrauch des aktuellen Zeitraums). Kognitive Agenten haben eigene Limits (`maxSteps`, `maxToolCalls`, `timeoutMs`). Eine Richtlinie wird geprüft, wenn sie angewendet wird (`defaultPolicies`, `defineGlobalPolicy`, die `policies` eines Agenten, `setPolicy`): Eine Regel `maxSteps` oder `maxTokens` gehört in eine Richtlinie vom Typ `budget` und eine Regel `maxDuration` in eine vom Typ `timeout`, mit einem `value`, der eine endliche Zahl größer als 0 ist; ein `budgetLimit` (ebenfalls in einer Richtlinie vom Typ `budget`) braucht eine `period` (`hour`, `day`, `week`, `month` oder `all`), `agentId` und `toolName` als Zeichenketten, falls angegeben, und mindestens eine Grenze (`maxTokens`, `maxToolCalls`, `maxCost`), jede eine endliche Zahl ≥ 0 (`maxToolCalls: 0` lehnt jeden Aufruf ab; eine Token- oder Kostengrenze von 0 lehnt sie ab, sobald etwas gezählt wurde). Alles andere, etwa eine aus einer Konfigurationsdatei gelesene Zeichenkette (`'10'`), `NaN`, `0` für ein Laufzeitlimit oder eine negative Zahl, löst einen `ValidationError` aus, der das Feld nennt.

### 4. Traces {#_4-traces}

Jede Ausführung erzeugt einen vollständigen, wiederholbaren Trace.

**Einen Trace abrufen:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Einen Trace exportieren:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Replay {#_5-replay}

Spielen Sie eine Ausführung erneut ab, ohne das LLM erneut anzufragen.

**Einfaches Replay:**
```typescript
const replayResult = await sdk.replay(runId);
```

**Replay mit Änderungen:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Eine Ausführung anhalten {#_6-stopping-execution}

Halten Sie eine laufende Ausführung an.

**Über den Agenten:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**Über das SDK:**
```typescript
await sdk.stopRun(runId);
```

## Typischer Arbeitsablauf {#typical-workflow}

1. **Das SDK initialisieren** mit Ihrem API-Schlüssel
2. **Die Tools definieren**, die Ihr Anwendungsfall braucht
3. **Fähigkeiten erstellen** (optional, zur Organisation)
4. **Richtlinien konfigurieren** für die Governance
5. **Den Agenten erstellen** mit Tools und Richtlinien
6. **Den Agenten ausführen** mit einer Eingabe
7. **Den Trace analysieren**, um zu verstehen, was passiert ist
8. **Bei Bedarf erneut abspielen** zur Fehlersuche

## Bewährte Vorgehensweisen {#best-practices}

### Tools {#tools}
- ✅ Strikte Zod-Schemas verwenden
- ✅ Jedes Tool klar dokumentieren
- ✅ Fehler sauber behandeln
- ✅ Tools versionieren, wenn sie sich ändern

### Richtlinien {#policies}
- ✅ Vernünftige Budgets festlegen
- ✅ Strikte Allowlists verwenden
- ✅ Richtlinien vor der Produktion testen
- ✅ Richtlinien dokumentieren

### Fähigkeiten {#capabilities}
- ✅ Tools logisch gruppieren
- ✅ Fähigkeiten in mehreren Agenten wiederverwenden
- ✅ Fähigkeiten dokumentieren

### Sicherheit {#security}
- ✅ **Deny-by-default**: Kein nicht deklariertes Tool kann ausgeführt werden
- ✅ Validierung: Alle Eingaben werden mit Zod validiert
- ✅ Richtlinien: Vor jeder Aktion geprüft
- ✅ Nachvollziehbarkeit: Alle Aktionen werden nachverfolgt

## Beispiele {#examples}

### Minimales Beispiel {#minimal-example}
Siehe [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### Vollständiges Beispiel {#complete-example}
Siehe [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) für alle Funktionen

## Nächste Schritte {#next-steps}

- 📚 [Grundkonzepte](./concepts) – Die Architektur verstehen
- 🏗️ [Architektur](../reference/architecture) – Technische Details
- 📖 [SDK-API](../reference/sdk-api) – Jede Option und jede Methode

## Support {#support}

- Dokumentation: `docs/`
- Beispiele: `examples/`
- Issues: GitHub Issues

## Fehlerbehebung {#troubleshooting}

### Fehler: „Tool not found“ {#error-tool-not-found}
→ Stellen Sie sicher, dass Sie das Tool mit `defineTool()` registriert haben, bevor Sie es in einem Agenten verwenden.

### Fehler: „Policy violation“ {#error-policy-violation}
→ Prüfen Sie Ihre Richtlinien (Budget, Timeout, Allowlist).

### Fehler: „Run cancelled“ {#error-run-cancelled}
→ Die Ausführung wurde angehalten. Prüfen Sie mit `getTrace()`, warum.

### Leere Traces {#empty-traces}
→ Prüfen Sie, ob der Ereignisspeicher korrekt funktioniert und die Ereignisse persistiert werden.

## Zeit bis zum ersten Agenten {#time-to-first-agent}

**MVP-Ziel:** < 30 Minuten

**Geschätzte Zeit:**
- Installation: 2 Minuten
- Erstes Tool: 5 Minuten
- Erster Agent: 3 Minuten
- Erste Ausführung: 5 Minuten
- Traces verstehen: 10 Minuten
- **Gesamt: ~25 Minuten** ✅
