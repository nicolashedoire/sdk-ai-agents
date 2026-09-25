# Bereitstellen, absichern und Fehler beheben

Ihr Server funktioniert auf Ihrem Rechner ([erster Server](./mcp-first-server), [Rezepte](./mcp-recipes)). Diese Seite behandelt das Teilen über HTTP, das Einbinden von Regeln und Menschen, die Sicherheits-Checkliste und was zu tun ist, wenn etwas nicht funktioniert.

## stdio oder HTTP? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| Wie er läuft | Die KI-Anwendung startet Ihren Server als Programm auf demselben Rechner | Ihr Server läuft irgendwo als Webdienst |
| Wer ihn nutzen kann | Die Person an diesem Rechner | Jeder, dem Sie die Adresse und ein Token geben |
| Netzwerkexposition | Keine | Ein HTTP-Endpunkt, der geschützt werden muss |
| Am besten für | Persönliche Tools, lokale Dateien, Ausprobieren | Ein Team, eine unternehmensweite API oder Datenbank |
| Starten Sie ihn mit | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + dem HTTP-Transport des MCP-SDK |

Beginnen Sie mit stdio. Wechseln Sie zu HTTP, wenn mehrere Personen denselben Server brauchen.

## Über HTTP bereitstellen {#serve-over-http}

Das offizielle MCP-SDK stellt den HTTP-Transport bereit; `createMcpServer` gibt ihm einen kontrollierten Server. Diese vollständige Datei verwendet das eigene Modul `http` von Node – kein Web-Framework – und ist **zustandslos**: Jede Anfrage erhält einen neuen MCP-Server, sodass Sie mehrere Kopien hinter einem Load Balancer betreiben können.

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Wozu jede Prüfung dient:

| Prüfung | Warum |
| --- | --- |
| Pfad `/mcp` | Eine Adresse für MCP; alles andere wird abgelehnt. |
| Header `Host` | Sonst könnte eine Webseite, die Sie besuchen, Ihren Browser einen Server auf `localhost` aufrufen lassen („DNS Rebinding“). Tragen Sie nach der Bereitstellung stattdessen Ihren öffentlichen Hostnamen ein. |
| Bearer-Token | Nur Clients, die das Token kennen, kommen hinein. Der Vergleich erfolgt in konstanter Zeit. Erzeugen Sie ein langes, zufälliges Token; halten Sie es aus Ihrem Code heraus. |
| Nur `POST` | Im zustandslosen Modus gibt es keinen langlebigen Stream, der mit `GET` geöffnet werden könnte. |
| Ein Server pro Anfrage | Zwischen Anfragen wird nichts geteilt; Tool-Definitionen werden einmal erstellt und wiederverwendet (dieselbe Definition erneut zu definieren ist erlaubt). Der Preis: Die „Abbrechen“-Nachricht eines Clients kommt als weitere Anfrage an und kann den Aufruf, den sie abbricht, nicht erreichen – stattdessen beendet ihn das Schließen der Verbindung oder `approvalTimeoutMs`. |

Die Datei lauscht nur auf `127.0.0.1`. Um sie zu veröffentlichen, stellen Sie sie hinter einen Reverse Proxy, der **HTTPS** terminiert (Caddy, nginx, der Load Balancer Ihrer Cloud), und fügen Sie Ihren Hostnamen zu `allowedHosts` hinzu. Senden Sie ein Bearer-Token nie über unverschlüsseltes HTTP in einem Netzwerk.

Eine lauffähige Version liegt als [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) bei (`MCP_TOKEN=… npm run example:mcp-http`). Sie wurde mit einem echten Client geprüft: Ein Aufruf ohne Token erhält `401`, ein gefälschter `Host` erhält `403`, und ein Client mit Token listet die Tools auf und ruft sie auf.

### Clients mit einem HTTP-Server verbinden {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. Schreiben Sie in eine geteilte `.mcp.json` `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`: Claude Code setzt Umgebungsvariablen ein, sodass das Token nicht in der Datei steht.
- **Ihre eigenen Agenten**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` – siehe [MCP einfach erklärt](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **Andere Anwendungen**: Suchen Sie in deren Dokumentation nach „remote MCP server“ oder „custom connector“. Manche akzeptieren nur Server, die eine OAuth-Anmeldung statt eines festen Tokens verwenden.

## Governance: Richtlinien, Budgets, Freigaben {#governance-policies-budgets-approvals}

Jeder MCP-Aufruf läuft unter einer Identität, `mcp:<server name>` (ändern Sie sie mit `agentId`). Richtlinien, Budgets und Benachrichtigungen können sie wie jeden Agenten adressieren. Siehe [Kontrollierte Agenten](./governed-agents) für jede Art von Richtlinie.

**Ein tägliches Budget an Aufrufen** für einen Server:

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

Aufruf 501 des Tages wird unter Angabe des Namens der Richtlinie abgelehnt, und die Ablehnung steht im Ereignisprotokoll. Ein Aufruf wird **beim Start** gezählt – geprüft und gezählt in einem Schritt, sodass nicht 20 gleichzeitige Aufrufe alle unter ein Limit von 2 schlüpfen können – und er zählt **unabhängig von seinem Ausgang**, Fehlschläge eingeschlossen. Budgets werden im Speicher des Prozesses gezählt: Sie beginnen bei einem Neustart des Servers wieder bei null, und jede Kopie eines HTTP-Servers zählt ihre eigenen Aufrufe. Vor jeder Richtlinie und jedem Budget werden die Argumente geprüft: Ein ungültiger Aufruf wird abgelehnt, ohne gezählt zu werden oder auf jemanden zu warten.

### Freigaben: Ein Mensch stimmt zuerst zu {#approvals-a-human-says-yes-first}

Ein Tool wartet vor der Ausführung auf eine menschliche Entscheidung, wenn:

- seine Definition `metadata: { requiresApproval: true }` enthält – der Standard für Schreiboperationen von `openApiTools`;
- oder eine Richtlinie es verlangt, für Tools, die Sie benennen, ohne ihre Definitionen anzutasten:

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

Während er wartet, erscheint der Aufruf in `sdk.getPendingApprovals()`. Ihr Code entscheidet mit `sdk.approveAction(id, who, reason)` oder `sdk.rejectAction(id, who, reason)`; beides wird aufgezeichnet (`approval.requested`, `approval.approved` oder `approval.rejected`). Ein stdio-Server kann nicht in seinem eigenen Terminal nachfragen – die Standardeingabe trägt das Protokoll –, also kommt die Entscheidung über einen anderen Kanal. Zum Beispiel über einen kleinen Admin-Endpunkt auf diesem Rechner, im selben Prozess wie der Server.

**Der Admin-Endpunkt entscheidet, was ausgeführt wird: Schützen Sie ihn wie den MCP-Endpunkt.** Sonst könnte eine in Ihrem Browser geöffnete Seite `localhost` erreichen (DNS Rebinding) und für Sie freigeben. Deshalb lauscht er nur auf `127.0.0.1`, akzeptiert nur seinen eigenen `Host`, lehnt jede Anfrage mit einem `Origin` ab (Browser fügen einen hinzu, Skripte und `curl` nicht) und verlangt einen geheimen Header:

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

Danach listet `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` auf, was wartet, und `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` entscheidet. Ein vollständiger, so gebauter Server liegt als [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts) bei; er wurde von Anfang bis Ende geprüft (ein Aufruf wartet, ein gefälschter `Host`, ein `Origin` oder ein fehlendes Geheimnis erhalten `403`/`401`, die Freigabe führt das Tool aus, und der Prozess endet, wenn der Client geht).

Um benachrichtigt zu werden, wenn eine Freigabe wartet, fügen Sie eine [Incident-Regel](./incidents#rules) für `approval.requested` mit einem Slack- oder E-Mail-Notifier hinzu. Ausstehende Freigaben leben im Speicher des Prozesses, in dem der Aufruf wartet: Bei mehreren Kopien eines HTTP-Servers entscheiden Sie über die Kopie, die ihn hält (oder betreiben Sie für Tools, die eine Freigabe brauchen, eine einzige Kopie).

::: warning Wie lange eine ausstehende Freigabe gilt
Viele Clients brechen einen Aufruf nach etwa einer Minute ab. Eine ausstehende Freigabe wird abgebrochen – und das Tool läuft nie –, wenn:

- der Client den Aufruf abbricht (stdio oder eine zustandsbehaftete HTTP-Sitzung);
- die Verbindung geschlossen wird: ein stdio-Client, der sich beendet, eine HTTP-Anfrage, die geschlossen wird;
- niemand innerhalb von `approvalTimeoutMs` entschieden hat – **standardmäßig 50 Sekunden**, weniger als die meisten Clients warten. Setzen Sie den Wert in `createMcpServer`/`serveMcpOverStdio`, wenn Ihr Client länger wartet (Claude Code mit erhöhtem `MCP_TOOL_TIMEOUT`).

**Auf einem zustandslosen HTTP-Server gelten nur die letzten beiden**: Er kann eine „Abbrechen“-Anfrage nicht dem Aufruf zuordnen, den sie abbricht. Ein Client, der aufgibt, ohne seine Verbindung zu schließen, lässt die Freigabe bis `approvalTimeoutMs` ausstehen – und ein „Ja“, das in diesem Zeitfenster gegeben wird, führt das Tool trotzdem aus, obwohl niemand mehr auf die Antwort wartet. Halten Sie `approvalTimeoutMs` deutlich unter der Zeit, die Ihre Clients warten (das Beispiel verwendet 20 s), oder stellen Sie Tools, die eine Freigabe brauchen, über stdio oder eine zustandsbehaftete Sitzung bereit.

Nach dem Abbruch schlägt ein verspätetes „Ja“ mit „already rejected“ fehl, und der Aufruf wird nach der Freigabe noch einmal geprüft: Ist der Client inzwischen gegangen, läuft das Tool nicht. Freigaben über MCP eignen sich für schnelle Entscheidungen. Für Entscheidungen, die Stunden dauern, lassen Sie das Tool *eine Anfrage einreichen*, die Ihr Team später bearbeitet.
:::

Die meisten MCP-Anwendungen fragen den Nutzer außerdem vor jedem Tool-Aufruf (Claude Desktop tut das standardmäßig). Diese Bestätigung geschieht in der Anwendung; SDK-Freigaben geschehen auf Ihrem Server, nach Ihren Regeln, und werden aufgezeichnet. Nutzen Sie beides für alles, was Daten verändert.

## Fortschrittsbenachrichtigungen {#progress-notifications}

Ein Client kann darum bitten, über den Verlauf eines Aufrufs informiert zu werden: Er sendet mit dem Aufruf ein `progressToken` (das offizielle TypeScript-SDK tut das, wenn Sie `onprogress` übergeben). Der Server sendet dann eine `notifications/progress` für jedes Ereignis des Aufrufs und des Agentenlaufs, den ein `cognitiveAgentTool` oder `governedAgentTool` startet, mit einem `progress`, der jedes Mal um eins steigt, und einer kurzen `message`:

```text
call started
tool ask_support called
agent started
step 1: model chose lookup_customer
step 1: tool lookup_customer called
step 1: tool lookup_customer done
step 2: model answered
agent completed
call completed
```

Die Meldungen nennen die Schritte, die Tools und die kognitiven Operationen: das Tool, das das Modell gewählt hat, und jedes Tool, das der Agent aufruft, einschließlich der Tools des Agenten, die der Server nicht bereitstellt. Ein Tool, das eine [Studie](./studies) mit dem `onEvent` seines Kontexts ausführt, wird Phase für Phase beschrieben (`study started`, `passage changes started`, `search in changes`), nie anhand einer Anfrage. Sie enthalten nie Argumente, Ergebnisse oder Fehlertexte. Es gibt kein `total`: Niemand weiß im Voraus, wie viele Schritte ein Lauf braucht. Jede Benachrichtigung wird vor dem Ergebnis gesendet, nie danach. Über Streamable HTTP laufen sie über den Stream der Antwort (SSE); ein mit `enableJsonResponse: true` erstellter Transport antwortet in reinem JSON und verwirft sie. Ein Client, der kein `progressToken` sendet, erhält keine.

Verfolgt wird nur der Agentenlauf, den ein Tool startet, eine Ebene tief: nicht die Läufe, die dieser Agent über seine eigenen Agenten-Tools startet, und auch kein Agent, der von Hand auf einem Speicher ohne Live-Ereignisse gebaut wurde. Nichts wird zusammengefasst: Jedes Ereignis ist eine Benachrichtigung, und ein langer kognitiver Lauf kann Hunderte davon senden.

Was Fortschrittsbenachrichtigungen ändern und was nicht:

- **Nur Clients, die ihr Timeout bei Fortschritt zurücksetzen, warten länger.** Mit dem TypeScript-SDK: `client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`. Ein Client, der den Fortschritt anzeigt, aber ein festes Timeout behält, gibt zum selben Zeitpunkt auf wie zuvor. Prüfen Sie, was Ihre Anwendung tut, bevor Sie darauf zählen.
- **Bei einem solchen Client zählt die längste Stille**, nicht die Dauer des Aufrufs: ein Modellaufruf, ein langsames Tool oder eine Freigabe. Während ein Tool läuft oder eine Freigabe wartet, wird nichts gesendet; die 50 s von `approvalTimeoutMs` gelten also weiterhin, und jeder einzelne Modell- oder Tool-Aufruf muss in das Timeout des Clients passen.
- **Agenten dürfen dann länger brauchen**: Das `limits.timeoutMs` eines kognitiven Agenten kann das Timeout des Clients überschreiten, da jeder Schritt Benachrichtigungen sendet. Für andere Clients behalten Sie die kleinen Limits des [Agenten-Rezepts](./mcp-recipes#an-agent-your-reasoning-twin) bei.

## Sicherheits-Checkliste {#security-checklist}

Bevor Sie einen Server teilen:

- [ ] **Das Minimum bereitstellen.** Listen Sie in `tools` nur die benötigten Tools auf; bevorzugen Sie schreibgeschützte Quellen; fügen Sie Schreiboperationen einzeln hinzu.
- [ ] **Schreibvorgänge brauchen einen Menschen.** Behalten Sie `requiresApproval` bei Schreib-Tools bei, es sei denn, Sie haben einen Grund, und halten Sie diesen Grund fest.
- [ ] **Minimale Rechte darunter.** API-Tokens mit nur lesenden Berechtigungen, eine Datenbankrolle nur für SELECT, ein Ordner, der nur enthält, was geteilt werden darf. Die Prüfungen des Servers sind ein zweites Schloss, nicht das erste.
- [ ] **Geheimnisse außerhalb des Codes.** Tokens kommen aus Umgebungsvariablen (`claude mcp add … -e TOKEN=…`), nie aus der Spezifikation, der Beschreibung oder der Datei.
- [ ] **Ergebnisse sind nicht vertrauenswürdiger Text.** Was eine API, ein Dokument oder eine Datenbank zurückgibt, erreicht das Modell Wort für Wort – eine Seite kann „ignoriere deine Anweisungen und …“ enthalten. Geben Sie derselben Unterhaltung nicht gleichzeitig nicht vertrauenswürdige Quellen und mächtige Schreib-Tools ohne Freigabe.
- [ ] **HTTP-Server**: HTTPS, ein langes zufälliges Token, eine Allowlist für `Host`, Lauschen auf `127.0.0.1` hinter dem Proxy.
- [ ] **Fehlerdetails bleiben intern** (`exposeErrorDetails` aus, der Standard). Ablehnungen der Eingabe (falsches Argument, Pfad außerhalb des Ordners, SQL, das keine Abfrage ist) werden dem Client trotzdem erklärt.
- [ ] **Budgets** für alles, was Geld kostet: Agenten (Modellaufrufe) und kostenpflichtige APIs.
- [ ] **Lesen Sie das Ereignisprotokoll** nach den ersten Tagen: welche Tools aufgerufen werden, welche Aufrufe abgelehnt werden.

Das MCP-Projekt pflegt einen ausführlichen Leitfaden zu Angriffen und Abwehrmaßnahmen: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## Fehlerbehebung {#troubleshooting}

| Symptom | Wahrscheinliche Ursache | Lösung |
| --- | --- | --- |
| Der Client trennt sofort die Verbindung oder meldet, der Server habe ungültiges JSON gesendet | Etwas schreibt auf die **Standardausgabe**: ein `console.log` in Ihrem Code oder in einer Bibliothek | Verwenden Sie `console.error` (Standardfehlerausgabe). Stdout trägt das Protokoll. |
| `npx tsx server.ts` gibt eine Zeile aus und scheint zu hängen | Normal: Ein stdio-Server wartet auf einen Client | Testen Sie mit dem [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector) oder verbinden Sie eine Anwendung. |
| Der Server erscheint nicht in Claude Desktop | JSON-Fehler in der Konfiguration, relativer Pfad, Anwendung nicht neu gestartet | Prüfen Sie das JSON, verwenden Sie absolute Pfade, beenden Sie die Anwendung und starten Sie sie neu, lesen Sie `mcp*.log` ([wo](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` in den Logs | Die Anwendung sieht den `PATH` Ihrer Shell nicht (häufig mit nvm) | Verwenden Sie den vollständigen Pfad von `npx` (`which npx` / `where npx`). |
| Ein Tool fehlt in der Liste | Es steht nicht in `tools` | Fügen Sie seinen Namen oder seine Definition zu `tools` hinzu: Sonst wird nichts bereitgestellt. |
| `Another tool named "x" is already defined` beim Start | Zwei Quellen erzeugen denselben Tool-Namen | Geben Sie jeder Quelle ein `prefix`. |
| `Tool execution failed: <name>` und sonst nichts | Die Ursache kann interne Details enthalten und wird daher verborgen | Lesen Sie den Lauf im Ereignisprotokoll oder setzen Sie während der Entwicklung `exposeErrorDetails: true`. |
| Aufrufe laufen in eine Zeitüberschreitung | Das Tool ist langsam (oft ein Agent) | Kleinere `limits` für den Agenten; erhöhen Sie das Timeout des Clients (Claude Code: `MCP_TOOL_TIMEOUT`); oder verwenden Sie einen Client, der sein Timeout bei [Fortschrittsbenachrichtigungen](#progress-notifications) zurücksetzt. |
| Ergebnisse sind abgeschnitten | Größenbegrenzungen (`truncated: true`) oder die eigene Begrenzung des Clients | Erhöhen Sie `maxResponseBytes`, `maxRows`, `maxFileBytes`; Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| Ein Schreib-Tool antwortet „Approval no decision within 50000 ms“ | Niemand hat es rechtzeitig freigegeben | Geben Sie es schneller frei (siehe [Freigaben](#approvals-a-human-says-yes-first)), erhöhen Sie `approvalTimeoutMs` oder setzen Sie bewusst `requiresApproval: false`. |
| Ordner wie `events/` oder `golden-traces/` erscheinen an unerwarteten Orten | Kein absoluter Pfad für das Ereignisprotokoll (oder eine ältere SDK-Version) | Übergeben Sie `eventStore: new FileEventStore(<absolute path>)`. Aktuelle Versionen legen ihre anderen Ordner erst an, wenn sie gebraucht werden. |
| `Cannot find module 'node:sqlite'` | Node.js älter als 22.13 | Aktualisieren Sie Node.js oder verwenden Sie `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | Die OpenAPI-Spezifikation ist YAML | Parsen Sie sie (Paket `yaml`) und übergeben Sie das Objekt als `spec`. |
| `cannot resolve the server URL "/v3"` | Die Spezifikation hat einen relativen Server und wurde aus einer Datei geladen | Übergeben Sie `baseUrl`. |
| Der Inspector startet nicht | Seine [Dokumentation](https://modelcontextprotocol.io/docs/tools/inspector) verlangt Node.js 22.19+ (geprüft am 24.09.2026) | Aktualisieren Sie Node.js, um den Inspector auszuführen (Ihr Server kann auf 20+ bleiben). |
| Ein Client, der nur das Protokoll 2026-07-28 spricht, kann sich nicht verbinden | Der Server akzeptiert die Revisionen 2024-10-07 bis 2025-11-25 (MCP-TypeScript-SDK 1.30) | Verwenden Sie einen Client, der die früheren Revisionen unterstützt. Der Inspector handelt laut seiner [Dokumentation](https://modelcontextprotocol.io/docs/tools/inspector) beide „Ären“ aus, die ältere und 2026-07-28 (geprüft am 24.09.2026). |
| Mit aktivierten Incident-Benachrichtigungen wird jeder abgelehnte MCP-Aufruf zu einer Benachrichtigung | Ein fehlgeschlagener MCP-Aufruf ist ein fehlgeschlagener Lauf | Filtern Sie mit `when: (event) => event.metadata?.agentId !== 'mcp:docs'` oder senken Sie seinen Schweregrad. |

### Nachlesen, was passiert ist {#reading-what-happened}

Jeder Aufruf und jedes Lesen einer Ressource ist ein Lauf. Mit dem standardmäßigen Dateispeicher ist jeder Lauf eine JSON-Datei in Ihrem Ordner `events/`; aus dem Code:

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

Ein Tool-Aufruf lautet `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`; das Lesen einer Ressource `run.started → resource.read → run.completed`, wobei `resource.read` die URI, die Größe und den SHA-256 dessen enthält, was ausgeliefert wurde. Siehe den [Ereigniskatalog](../reference/events).
