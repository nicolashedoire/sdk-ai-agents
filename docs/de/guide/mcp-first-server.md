# Ihr erster MCP-Server in 5 Minuten

Wir bauen einen winzigen MCP-Server, der anhand einer Teamliste die Frage „Wer ist für die Abrechnung zuständig?“ beantwortet, testen ihn ganz ohne KI und verbinden ihn dann mit Claude Desktop und Claude Code. Jeder Befehl ist angegeben; nichts wird vorausgesetzt. Wenn ein Begriff unklar ist, siehe [MCP einfach erklärt](./mcp).

## Was Sie brauchen {#what-you-need}

- **Node.js 20.11 oder neuer** – prüfen Sie das mit `node --version`. (Das SQLite-Rezept braucht 22.13+. Die Dokumentation des MCP Inspector verlangt 22.19+.)
- Ein Terminal.
- Um den Server aus einer KI-Anwendung zu nutzen: [Claude Desktop](https://claude.ai/download) oder [Claude Code](https://code.claude.com/docs). Für die ersten Schritte nicht nötig.

Es wird kein API-Schlüssel benötigt: Dieser Server ruft kein Sprachmodell auf. Die KI-Anwendung, die ihn nutzt, hat ihren eigenen.

## 1. Das Projekt anlegen {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

Was jede Zeile tut:

| Befehl | Warum |
| --- | --- |
| `npm init -y` | Erstellt `package.json`, die Datei, die die Abhängigkeiten Ihres Projekts auflistet. |
| `npm pkg set type=module` | Verwendet moderne JavaScript-Module (`import`). Das SDK setzt das voraus. |
| `npm install github:nicolashedoire/sdk-ai-agents …` | Installiert dieses SDK (noch nicht auf npm, daher von GitHub; es baut sich selbst), zod (um Argumente zu beschreiben) und das offizielle MCP-SDK in Version 1.30 oder neuer innerhalb von 1.x (die Version, mit der dieses SDK getestet ist). |
| `npm install --save-dev tsx` | Führt TypeScript-Dateien direkt aus, ohne Build-Schritt. |

## 2. Den Server schreiben {#_2-write-the-server}

Legen Sie eine Datei namens `server.ts` an:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

Lesen Sie sie von oben nach unten:

1. **Die Daten** – hier eine Liste in der Datei; im echten Leben Ihre API, Ihre Dateien oder Ihre Datenbank.
2. **Das SDK** – es schickt jeden Aufruf durch die kontrollierte Pipeline und schreibt ihn ins Ereignisprotokoll. Das Protokoll liegt neben der Datei (`import.meta.dirname`), weil KI-Anwendungen Server aus einem Arbeitsverzeichnis starten, das Sie nicht selbst wählen.
3. **Das Tool** – **Name** und **Beschreibung** liest das Modell, um zu entscheiden, wann es das Tool aufruft; schreiben Sie sie also für einen Leser, der nichts über Ihren Code weiß. Das **Schema** listet die Argumente auf; das SDK macht daraus das JSON Schema, das MCP-Clients sehen, und lehnt Aufrufe ab, die nicht passen. `readOnly: true` teilt Clients mit, dass das Tool nichts verändert.
4. **Der Server** – `serveMcpOverStdio` spricht MCP über Standardein- und -ausgabe. Die Liste `tools` ist erforderlich: Ein Tool, das Sie nicht aufgelistet haben, ist nie sichtbar, auch wenn es definiert ist.

## 3. Ihn ausführen {#_3-run-it}

```sh
npx tsx server.ts
```

Sie sollten Folgendes sehen, und sonst nichts:

```text
MCP server "team" ready on stdio, waiting for a client
```

**Er scheint zu hängen – das ist normal.** Ein stdio-Server wartet darauf, dass eine KI-Anwendung über seine Eingabe mit ihm spricht. Drücken Sie <kbd>Ctrl</kbd>+<kbd>C</kbd>, um ihn anzuhalten. Sie werden ihn selten selbst starten: Das erledigt die KI-Anwendung.

::: danger Niemals auf stdout schreiben
In einem stdio-Server **ist** die Standardausgabe das Protokoll. Ein `console.log` in Ihrem Code beschädigt die Nachrichten, und der Client trennt die Verbindung. Verwenden Sie `console.error` für Ihre eigenen Meldungen: Das geht auf die Standardfehlerausgabe, die Clients in ihren Logs aufbewahren.
:::

## 4. Ihn mit dem MCP Inspector testen {#_4-test-it-with-the-mcp-inspector}

Der [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) ist das offizielle Testwerkzeug: eine Webseite (oder eine Kommandozeile), die als MCP-Client auftritt, sodass Sie Ihren Server ganz ohne KI ausprobieren können. Seine Dokumentation verlangt Node.js 22.19 oder neuer (geprüft am 24.09.2026).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

Der Befehl gibt eine Adresse mit einem Einmal-Token aus; öffnen Sie sie in Ihrem Browser, klicken Sie auf **Connect**, öffnen Sie **Tools**, klicken Sie auf **List Tools**, wählen Sie `find_colleague`, geben Sie `billing` ein und führen Sie es aus. Sie erhalten Ada.

Lieber im Terminal? Dieselben Prüfungen über die Kommandozeile:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

Alles nach `inspector` (oder nach `--cli`) ist der Befehl, der Ihren Server startet.

## 5. Ihn mit Claude Desktop verbinden {#_5-connect-it-to-claude-desktop}

Claude Desktop liest die zu startenden Server aus einer Konfigurationsdatei. Öffnen Sie sie aus der Anwendung heraus: **Menü Claude → Settings… → Developer → Edit Config**. Die Datei liegt hier:

| System | Pfad |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Fügen Sie Ihren Server unter `mcpServers` hinzu, mit dem **absoluten Pfad** von `server.ts` (führen Sie `pwd` im Projektordner aus, um ihn zu erhalten; unter Windows `cd`):

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

Dann **beenden Sie Claude Desktop vollständig und starten es neu**: Die Anwendung liest die Datei nur beim Start. Ihr Server erscheint in der Liste der Konnektoren (die Schaltfläche „+“ im Nachrichtenfeld, dann **Connectors**). Fragen Sie: *„Wer ist in meinem Team für die Abrechnung zuständig?“* – Claude bittet um Ihre Erlaubnis, `find_colleague` zu verwenden, und antwortet dann „Ada“.

Wenn er nicht erscheint:

- prüfen Sie das JSON (ein fehlendes Komma genügt, um es zu zerstören) und dass der Pfad absolut ist;
- wenn das Log meldet, dass `npx` oder `node` nicht gefunden wird (häufig, wenn Node.js mit nvm installiert wurde), ersetzen Sie `"npx"` durch den vollständigen Pfad, den `which npx` (macOS) oder `where npx` (Windows) liefert;
- lesen Sie die Logs: `~/Library/Logs/Claude/mcp*.log` unter macOS, `%APPDATA%\Claude\logs\mcp*.log` unter Windows. `mcp-server-team.log` enthält, was Ihr Server auf die Standardfehlerausgabe geschrieben hat.

Diese Pfade und Menüs stammen aus der MCP-Dokumentation ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) mit Stand September 2026; prüfen Sie diese Seite, falls sich Claude Desktop geändert hat.

## 6. Ihn mit Claude Code verbinden {#_6-connect-it-to-claude-code}

Ein Befehl, aus einem beliebigen Ordner (ersetzen Sie den Pfad):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- Alles nach `--` ist der Befehl, der Ihren Server startet.
- Der Server wird nur für das aktuelle Projekt hinzugefügt (`--scope local`, der Standard). Verwenden Sie `--scope user` für all Ihre Projekte oder `--scope project`, um ihn in eine Datei `.mcp.json` zu schreiben, die Sie committen und teilen können.
- Umgebungsvariablen (zum Beispiel ein API-Token, das Ihr Server braucht): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- Prüfen Sie ihn mit `claude mcp list` oder geben Sie in Claude Code `/mcp` ein.

Geprüft am 24.09.2026 mit `claude mcp add --help` (Claude Code 2.1.173) und der [MCP-Dokumentation von Claude Code](https://code.claude.com/docs/en/mcp).

## 7. Andere Anwendungen {#_7-other-applications}

Die meisten MCP-Anwendungen fragen nach denselben drei Dingen: einem **Befehl** (`npx`), seinen **Argumenten** (`-y`, `tsx`, der absolute Pfad von `server.ts`) und optionalen **Umgebungsvariablen**. Siehe ihre Dokumentation, zum Beispiel für [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) oder [Cursor](https://cursor.com/docs/context/mcp).

## 8. Nachsehen, was passiert ist {#_8-see-what-happened}

Jeder Aufruf wird ins Ereignisprotokoll geschrieben: Öffnen Sie den Ordner `events/` neben `server.ts`. Jede Datei ist ein Aufruf – ein **Lauf** der Identität `mcp:team` – mit seinen Schritten:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

Dieselben Läufe lassen sich mit dem Rest des SDK lesen, erneut abspielen, bepreisen und in Benachrichtigungen verwandeln: siehe [Nachvollziehbarkeit & Replay](./observability).

## Wie es weitergeht {#where-to-go-next}

- Ersetzen Sie die Teamliste durch etwas Echtes: [eine Web-API, einen Ordner, eine Datenbank oder einen Agenten – jeweils eine Zeile](./mcp-recipes).
- Teilen Sie den Server über HTTP mit Ihrem Team, fügen Sie Freigaben und Budgets hinzu: [Bereitstellen, absichern und Fehler beheben](./mcp-deploy).
