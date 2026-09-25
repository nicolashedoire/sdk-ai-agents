# Ein MCP-Server für alles

Jedes Rezept macht aus einer Art von System **mit einer Zeile** einen MCP-Server, und zwar sicher. Alle funktionieren gleich: Eine **Tool-Quelle** erstellt die Tools (und manchmal Ressourcen), und `serveMcpOverStdio` stellt sie bereit.

| Sie wollen bereitstellen | Die Zeile | Tools, die das Modell erhält |
| --- | --- | --- |
| [Eine Funktion, die Sie schreiben](#a-function) | `sdk.defineTool({ … })` | Ihre eigenen |
| [Eine Web-API](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | eines pro Operation, standardmäßig schreibgeschützt |
| [Einen Dokumentenordner](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ Ressourcen) |
| [Eine Datenbank, schreibgeschützt](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [Einen Agenten](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |
| [Das Web](./web-research) | `webTools()` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` |

Neu bei MCP? Beginnen Sie mit [Ihr erster MCP-Server in 5 Minuten](./mcp-first-server): Dort sehen Sie, wie Sie einen Server ausführen, ihn mit dem Inspector testen und mit Claude Desktop oder Claude Code verbinden. Jede der folgenden Dateien wird auf die gleiche Weise ausgeführt und verbunden.

## Das Gerüst, das alle Rezepte teilen {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

`tools` nimmt **Tool-Definitionen** entgegen (das, was die Quellen unten liefern – das SDK definiert sie für Sie) und **Namen** von Tools, die Sie selbst mit `sdk.defineTool` definiert haben. Sonst wird nie etwas bereitgestellt. `resources` (optional) nimmt Dokumentanbieter entgegen, die das Rezept für Ordner verwendet.

Unabhängig von der Quelle durchläuft jeder Aufruf dieselben Prüfungen in dieser Reihenfolge – Argumente, [Richtlinien](./mcp-deploy#governance-policies-budgets-approvals), Freigabe, Budget – und wird ins Ereignisprotokoll geschrieben. Ein ungültiger Aufruf wird abgelehnt, bevor jemand gebeten wird, ihn freizugeben.

## Eine Funktion {#a-function}

Die einfachste Quelle: eine Funktion, die Sie schreiben, wie beim [ersten Server](./mcp-first-server).

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| Feld | Wofür es da ist |
| --- | --- |
| `name` | Was das Modell aufruft. Verwenden Sie Buchstaben, Ziffern, `_` und `-`, bis zu 64 Zeichen (MCP-Clients können andere Namen ablehnen). |
| `description` | Wann das Tool zu verwenden ist, in einfachen Worten. Das Modell entscheidet danach. |
| `schema` | Die Argumente als zod-Schema. Die Texte aus `.describe()` werden dem Modell gezeigt. Aufrufe, die nicht passen, werden abgelehnt. |
| `handler` | Ihr Code. Er erhält die validierten Argumente und einen Kontext mit `signal` (abgebrochen, wenn der Client aufgibt). |
| `metadata.readOnly` | „Dieses Tool ändert nichts“: Clients als `readOnlyHint` angezeigt. |
| `metadata.requiresApproval` | Jeder Aufruf wartet auf einen Menschen (siehe [Freigaben](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | Wiederholungsversuche bei Fehlschlag, nur für idempotente Tools (`retryOn` grenzt ein, welche Fehler; ungültige Argumente werden nie wiederholt). |

## Eine Web-API, anhand ihrer OpenAPI-Beschreibung {#a-web-api-from-its-openapi-description}

**Was es tut.** Viele APIs veröffentlichen eine maschinenlesbare Beschreibung ihrer Endpunkte, ein sogenanntes **OpenAPI**-Dokument (oft `openapi.json`). `openApiTools` liest es und macht **aus jeder Operation ein Tool**: Das Modell sieht deren Zusammenfassung und Parameter, und ein Aufruf des Tools ruft die API auf.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**Standardmäßig schreibgeschützt.** Nur `GET`-Operationen werden zu Tools. Um eine Operation hinzuzufügen, die etwas ändert (`POST`, `PUT`, `PATCH`, `DELETE`), listen Sie sie mit ihrer `operationId` auf:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

Eine aufgelistete Schreiboperation wird als **hohes Risiko** markiert und **erfordert eine Freigabe**: Jeder Aufruf wartet, bis ein Mensch ihn freigibt (siehe [Freigaben](./mcp-deploy#approvals-a-human-says-yes-first)). Um ihr ohne Freigabe zu vertrauen, sagen Sie das ausdrücklich: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### Optionen {#options}

| Option | Standard | |
| --- | --- | --- |
| `spec` | — | Eine URL (`https://…`), ein Dateipfad oder ein Objekt, das Sie bereits geparst haben. Nur JSON; bei YAML parsen Sie selbst (zum Beispiel mit dem Paket `yaml`) und übergeben das Objekt. |
| `baseUrl` | erster Eintrag von `servers` | Wohin die Anfragen gehen. Eine relative Server-URL wird relativ zur URL der Spezifikation aufgelöst. |
| `headers` | — | Werden jeder Anfrage hinzugefügt (Authentifizierung). Nie dem Modell gezeigt, und sie überschreiben jedes Header-Argument. Erfordert `baseUrl` (es sei denn, die Spezifikation wird vom eigenen Ursprung der API heruntergeladen) und https für die API und die Spezifikation (http nur auf diesem Rechner). |
| `include` | GET-Operationen | `operationId`s, die bereitgestellt werden. Wenn angegeben, **ersetzt** es den GET-Standard: Nur die aufgelisteten Operationen werden zu Tools. Das ist der einzige Weg, eine Schreiboperation bereitzustellen. Eine unbekannte Kennung ist ein Fehler. |
| `exclude` | — | `operationId`s, die ausgelassen werden. |
| `tags` | — | Nur Operationen mit einem dieser Tags. |
| `prefix` | — | Präfix der Tool-Namen (`crm_getCustomer`), um mehrere APIs zu kombinieren. |
| `metadata` | GET: niedriges Risiko, schreibgeschützt · andere: hohes Risiko, Freigabe | `(operation) => ToolMetadata`. Jedes Feld, das Sie setzen, ersetzt das Standardfeld; ein weggelassenes Feld – oder `undefined` – behält es bei, sodass nur ein ausdrückliches `requiresApproval: false` eine Freigabe entfernt. |
| `retry` | — | Wiederholungsversuche nur für schreibgeschützte Operationen (die GETs, sofern `metadata` nichts anderes sagt), bei Serverfehlern (5xx), 429, Zeitüberschreitungen und Netzwerkfehlern – nie bei 4xx-Antworten oder ungültigen Argumenten. |
| `timeoutMs` | `30000` | Pro Anfrage (und für das Herunterladen der Spezifikation). |
| `maxResponseBytes` | `100000` | Längere Antworten werden abgeschnitten und mit `truncated: true` markiert. |
| `maxSpecBytes` | `10000000` | Größte akzeptierte Spezifikation. |
| `fetch` | globales `fetch` | Ihre eigene HTTP-Funktion (Proxy, Tests). |

### Was das Modell sieht {#what-the-model-sees}

Für `getPetById` des Petstore erhalten Clients:

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

Die Tool-Namen stammen aus `operationId` (gültig gemacht: `show pet!` wird zu `show_pet`; eine Operation ohne eine solche Kennung wird zu `get_pets_petId`; Duplikate erhalten `_2`). Die Argumente sind flach: eines pro Pfad-, Query- und Header-Parameter, dazu `body` für einen JSON-Request-Body. Ein Aufruf liefert den HTTP-Status und den geparsten Body:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### Sicherheitsregeln {#security-rules}

1. **Standardmäßig schreibgeschützt**: nur `GET`; alles andere muss in `include` aufgelistet werden und erfordert dann eine Freigabe, sofern Sie nichts anderes angeben.
2. **Das Modell kann weder den Host ändern noch im Pfad nach oben wandern.** Die Basis-URL gehört Ihnen. Ein Pfadwert darf kein `/`, `\` und kein Segment `.` / `..` enthalten – auch nicht prozentkodiert, ein- oder mehrfach, neben fehlerhaften Escapes oder nicht, da manche Server und Proxys `%2F` dekodieren –, sodass `../../admin` abgelehnt wird; außerdem wird geprüft, dass die endgültige URL unterhalb der Basis-URL bleibt. Innerhalb dieser Grenzen wählt das Modell die Werte: welcher Kunde, welche Bestellung.
3. **Argumente werden vor allem anderen geprüft**: vor Richtlinien und Freigaben (ein ungültiger Aufruf wartet nie auf einen Menschen), dann erneut beim Aufbau der Anfrage. Unbekannte Argumente und fehlende Pflichtargumente werden abgelehnt; Werte müssen Strings, Zahlen oder Booleans sein (bei Query-Parametern Listen davon); Header-Werte dürfen keine Zeilenumbrüche enthalten.
4. **Ihre Zugangsdaten gehen nur dorthin, wohin Sie es entschieden haben**: `headers` werden vom Server hinzugefügt, überschreiben Header-Argumente und erscheinen nirgends, wo das Modell sie lesen kann. Mit `headers` wird ein Server, den eine Spezifikationsdatei benennt, abgelehnt – übergeben Sie `baseUrl` –, es sei denn, die Spezifikation wurde vom eigenen Ursprung der API heruntergeladen; und `http:` wird außer auf diesem Rechner (`localhost`, `127.0.0.1`, `[::1]`) abgelehnt – für die API und für das Herunterladen der Spezifikation, da eine unterwegs veränderte Spezifikation Operationen hinzufügen könnte, die Ihre Zugangsdaten autorisieren würden.
5. **Begrenzt**: ein Timeout pro Anfrage, Antworten abgeschnitten bei `maxResponseBytes`, eine Größenbegrenzung für die Spezifikation.
6. **Weiterleitungen werden nicht verfolgt** (eine Weiterleitung könnte Ihren `Authorization`-Header zu einer anderen Website tragen): Eine `3xx`-Antwort ist ein Fehler, ebenso eine Weiterleitung, der ein eigenes `fetch` trotzdem gefolgt ist.
7. **Fehler sind Fehler**: Ein Status außerhalb von `2xx` lässt den Aufruf mit dem Status und dem Anfang des Bodys fehlschlagen. MCP-Clients sehen nur „Tool execution failed“, es sei denn, Sie setzen `exposeErrorDetails: true` (Bodys können interne Details enthalten); das Ereignisprotokoll enthält immer den vollständigen Fehler.
8. **Jedes GET wird als schreibgeschützt angekündigt** (`readOnlyHint`). Manche APIs haben GETs mit Nebenwirkungen (`GET /send-reminder`): Lassen Sie diese mit `exclude` weg oder setzen Sie für sie `metadata` auf `readOnly: false, requiresApproval: true`.
9. **Große Beschreibungen bleiben begrenzt**: Die Auflösung von `$ref` hat ein Budget pro Operation und für die gesamte Spezifikation, und ein Tool-Schema mit mehr als 64.000 Zeichen wird durch seine Beschreibungen ersetzt.

### Vollständige Datei {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), mit den Importen eines installierten Pakets:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

Übergeben Sie das Token über die Umgebung des Clients, nie in der Datei: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### Was es nicht tut {#what-it-does-not-do}

- **Nur OpenAPI 3.x**: Swagger 2.0 wird abgelehnt (konvertieren Sie es, zum Beispiel mit `swagger2openapi`). YAML wird nicht für Sie geparst.
- **Nur JSON-Bodys**: Eine Operation, die einen Body vom Typ `multipart/form-data` oder ein Formular verlangt, wird ausgelassen (oder abgelehnt, wenn Sie sie auflisten); ein optionaler Body anderen Typs wird nicht angeboten. Cookie-Parameter werden ausgelassen.
- **Keine Anmeldeabläufe**: Übergeben Sie ein Token in `headers`; OAuth wird nicht unterstützt.
- **Nur lokale Verweise**: `$ref`s auf andere Dateien oder URLs werden nicht aufgelöst (sie werden zu „beliebiger Wert“); ein Schema, das auf sich selbst verweist, wird am Zyklus abgeschnitten.
- Antworten werden nicht gegen die Spezifikation geprüft, Seiten werden nicht weiterverfolgt, und nur der erste Server der Spezifikation wird verwendet, es sei denn, Sie übergeben `baseUrl`.

## Ein Dokumentenordner {#a-folder-of-documents}

**Was es tut.** Bietet die Textdateien eines Ordners an – ein Handbuch, Notizen, eine Codebasis, exportierte Dokumentation – mit drei Tools: die Dateien **auflisten**, eine **lesen**, sie nach einem Text **durchsuchen**. Dieselben Dateien werden auch als **Ressourcen** angeboten, die Nutzer selbst an eine Unterhaltung anhängen können.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### Optionen {#options-1}

`folderTools` und `folderResources` nehmen dieselben Optionen entgegen (plus `prefix` für die Tools):

| Option | Standard | |
| --- | --- | --- |
| `root` | — | Der Ordner. Verwenden Sie einen absoluten Pfad: Clients starten Server aus einem beliebigen Arbeitsverzeichnis. |
| `name` | der Name des Ordners | Wird in Beschreibungen und Ressourcen-URIs verwendet (`folder://<name>/…`). |
| `prefix` | — | Präfix der Tool-Namen (`handbook_read_file`), um mehrere Ordner bereitzustellen. |
| `extensions` | Textformate | Angebotene Dateiendungen, ohne Punkt (`['md', 'txt']`). Standard: `md`, `txt`, `csv`, `json`, `yaml`, `html`, Quellcode… (`DEFAULT_TEXT_EXTENSIONS`). Fügen Sie `''` für Dateien ohne Endung hinzu. |
| `include` | alles Erlaubte | Globs der anzubietenden Dateien: `guide/**`, `**/*.md`. `*` passt innerhalb eines Ordners, `**` über Ordner hinweg. Ordner werden trotzdem aufgelistet, auch wenn sie keine passende Datei enthalten. |
| `exclude` | — | Globs von Dateien und Ordnern, die überall verborgen werden: `drafts`, `private/*`, `**/node_modules`. Ein verborgener Ordner verbirgt alles, was er enthält. |
| `includeHidden` | `false` | Namen anbieten, die mit einem Punkt beginnen (`.env`, `.git`…). Lassen Sie das ausgeschaltet. |
| `maxFileBytes` | `200000` | Aus einer Datei gelesene Bytes; längere Dateien werden abgeschnitten (`truncated: true`). |
| `maxEntries` | `500` | Einträge, die eine Auflistung liefert, Ressourcen eingeschlossen. |
| `maxDepth` | `8` | Durchsuchte Tiefe der Unterordner. |
| `maxMatches` | `50` | Treffer, die eine Suche liefert. |
| `maxSearchBytes` | `20000000` | Bytes, die eine Suche liest, alle Dateien zusammen. |
| `maxExaminedEntries` | `50000` | Namen, die eine Auflistung oder Suche betrachtet, angeboten oder nicht; darüber hinaus meldet das Ergebnis `truncated: true`. |

### Was das Modell sieht {#what-the-model-sees-1}

Das Such-Tool, gekürzt:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

Eine Suche liefert `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. Ein Lesevorgang liefert `{ "path", "size", "content", "truncated" }`.

**Ressourcen**: Jede Datei wird als `folder://handbook/guide/onboarding.md` mit ihrer Größe und ihrem Typ (`text/markdown`, `text/csv`…) aufgelistet. Anwendungen, die Ressourcen unterstützen, lassen den Nutzer sie auswählen, zum Beispiel über ein Menü zum Anhängen; wie genau, hängt von der Anwendung ab.

### Sicherheitsregeln {#security-rules-1}

1. **Nur relative Pfade**; absolute Pfade werden abgelehnt.
2. **Nichts außerhalb des Ordners**: Jeder Pfad wird zu seinem tatsächlichen Ort aufgelöst – einschließlich `..`-Segmenten und symbolischen Links – und abgelehnt, wenn er den Ordner verlässt. Ein Link auf einen bereits besuchten Ordner wird übersprungen, sodass eine Link-Schleife eine Auflistung nicht blockieren kann.
3. **Versteckte Namen sind unsichtbar**: `.env`, `.git`, `.ssh`… verhalten sich, als gäbe es sie nicht, auch über einen Link.
4. **Nur Text**: Nur erlaubte Dateiendungen werden angeboten, und eine Datei, deren erste 8 KB ein Null-Byte enthalten (binär), wird abgelehnt.
5. **Begrenzt**: Lesevorgänge, Auflistungen, Tiefe, Suchtreffer, durchsuchte Bytes und betrachtete Namen (`maxExaminedEntries`, 50.000) sind alle begrenzt; eine Auflistung oder Suche, die vorzeitig angehalten hat, meldet `truncated: true`.
6. **Schreibgeschützt**: Es wird nie etwas geschrieben, verschoben oder gelöscht.
7. **Nachverfolgt**: Jedes Lesen einer Ressource ist ein Lauf im Ereignisprotokoll, mit der URI, der Größe und dem SHA-256-Fingerabdruck dessen, was ausgeliefert wurde.
8. **Ausgeschlossen heißt ausgeschlossen**: Das Ausschließen eines Ordners (`private`, `private/*`, `**/node_modules`) verbirgt alles darin, ob beim Auflisten, beim Suchen, beim Lesen über einen Pfad oder beim Lesen als Ressource.
9. **Robust**: Ein Unterordner, der nicht gelesen werden kann, wird übersprungen, und Fehlermeldungen nennen den freigegebenen Ordner, nie seinen absoluten Pfad.

### Vollständige Datei {#complete-file-1}

Angepasst aus [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (das standardmäßig diese Dokumentation bereitstellt):

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### Was es nicht tut {#what-it-does-not-do-1}

- **Kein Schreiben** jeglicher Art.
- **Kein PDF, kein Word, keine Bilder**: nur Textdateien. Konvertieren Sie Dokumente zuerst in Markdown oder Text.
- **Nur Teilstring-Suche**: keine bedeutungsbasierte („semantische“) Suche, keine Rangfolge.
- **Keine Änderungsbenachrichtigungen**: Clients sehen die Dateien so, wie sie beim Auflisten sind.
- **Der Ordner darf nicht von Personen beschreibbar sein, denen Sie nicht vertrauen**: Pfade werden geprüft, dann wird die Datei geöffnet; wer genau in diesem Moment einen Ordner durch einen Link ersetzen kann, könnte theoretisch durchschlüpfen.
- **Mit `include` werden Ordner trotzdem aufgelistet**, auch wenn sie keine passende Datei enthalten (eine Prüfung würde bedeuten, jeden Unterordner zu lesen).
- Das Lesen von Ressourcen wird nachverfolgt, aber nicht durch Tool-Richtlinien geprüft: Bieten Sie nur Ordner an, die Sie gern teilen.

## Eine schreibgeschützte Datenbank {#a-read-only-database}

**Was es tut.** Lässt das Modell eine Datenbank erkunden – die Tabellen auflisten, eine beschreiben, eine `SELECT`-Abfrage ausführen – und **sie nie verändern**. Funktioniert mit **SQLite** (dem eingebauten `node:sqlite` von Node.js 22.13+ oder `better-sqlite3`) und **PostgreSQL** (`pg`).

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### Optionen {#options-2}

| Option von `databaseTools` | Standard | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` oder `postgresReadOnly({ client })`, oder Ihre eigene `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | Wie das Modell davon erfährt: „the shop database“. |
| `prefix` | — | Präfix der Tool-Namen (`shop_query`), um mehrere Datenbanken bereitzustellen. |
| `maxRows` | `100` (höchstens `1000`) | Zeilen, die eine Abfrage liefert; `truncated: true` zeigt an, dass es mehr gab. |
| `maxTextLength` | `2000` | Zeichen, die pro Textwert behalten werden. |
| `maxTables` | `500` | Aufgelistete Tabellen. |
| `maxSqlLength` | `20000` | Längstes akzeptiertes SQL. |

| Option von `postgresReadOnly` | Standard | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL bricht jede Abfrage ab, die länger läuft. |
| `schemas` | alle außer den Systemschemas | Schemas, die `list_tables` und `describe_table` **auflisten und beschreiben**. Es schränkt nicht ein, was `query` lesen kann: Das ist Aufgabe der Rolle. |

Geben Sie dem Adapter mit `{ client }` einen **dedizierten** `pg.Client`: einen, den Ihre Anwendung nicht für ihre eigenen Transaktionen verwendet (ein Pool wird dort abgelehnt; übergeben Sie ihn als `{ pool }`).

`sqliteReadOnly(db)` hat keine Optionen: Öffnen Sie die Datei schreibgeschützt (`{ readOnly: true }` mit `node:sqlite`, `{ readonly: true }` mit better-sqlite3). Es stützt sich nur auf `prepare`, `exec` und die Statement-Methoden, die beide Treiber gemeinsam haben; die Testsuite führt es auf einer echten `node:sqlite`-Datenbank aus, nicht mit better-sqlite3.

### Was das Modell sieht {#what-the-model-sees-2}

Drei Tools: `list_tables`, `describe_table { table }` und `query { sql }`, beschrieben als *„Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first.“* Eine Abfrage liefert:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

Werte werden beim Eintreffen der Zeilen lesbar gemacht: Sehr große Ganzzahlen werden zu Strings, Datumswerte zu ISO-Strings, Binärdaten zu einem Hinweis wie `<binary data, 3 bytes>`, lange Texte werden abgeschnitten, Arrays behalten 100 Elemente (`… 400 more items`). Lehnt die Datenbank die Abfrage selbst ab („no such column“, „read-only“, eine Zeitüberschreitung), erhält das Modell den Grund, damit es sein SQL korrigieren kann; Verbindungs- und Serverfehler bleiben auf Ihrer Seite.

### Sicherheitsregeln: vier Schlösser, nicht eines {#security-rules-four-locks-not-one}

Zu prüfen, ob eine Abfrage „mit SELECT beginnt“, reicht nicht: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` beginnt mit `WITH` und löscht. Deshalb muss eine Abfrage vier Schlösser passieren:

1. **Die Prüfung der Anweisung**: genau eine Anweisung (Semikolons in Strings, Namen in Anführungszeichen, Kommentare, PostgreSQL-Quotes `$$` und Escape-Strings `E'…'` werden verstanden), beginnend mit `SELECT`, `WITH` oder `VALUES`, ohne Parameter `$1`, mit ausgeglichenen Klammern. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… werden abgelehnt.
2. **Die Datenbank selbst verweigert Schreibvorgänge**:
   - SQLite: Jede Abfrage läuft mit `PRAGMA query_only = ON` (danach wiederhergestellt), und mit better-sqlite3 wird eine schreibende Anweisung abgelehnt, bevor sie läuft;
   - PostgreSQL: Jede Abfrage läuft in ihrer eigenen Transaktion `BEGIN READ ONLY` – eine Verbindung, die sich bereits in einer anderen Transaktion befindet, wird zuerst erkannt (`transaction_timestamp()` älter als die Anweisung) und abgelehnt, ohne diese Transaktion anzutasten – mit `SET LOCAL statement_timeout`, und endet immer mit `ROLLBACK`, dann `SELECT pg_advisory_unlock_all()` (Advisory Locks überleben ein Rollback; eine Verbindung, die sie nicht freigeben kann, wird nicht wiederverwendet). Die Abfrage wird als Unterabfrage mit einem gebundenen Parameter gesendet, sodass der Server nur eine Anweisung akzeptiert. Transaktionen teilen sich nie gleichzeitig eine Verbindung.
3. **Limits**: Höchstens `maxRows` Zeilen werden gelesen (SQLite liest den Rest nie; PostgreSQL stoppt am `LIMIT`), Werte werden beim Eintreffen der Zeilen zu kurzen Kopien gekürzt (jeder Rohwert wird trotzdem vollständig geladen, bevor er gekürzt wird), PostgreSQL-Abfragen haben ein Timeout.
4. **Sie**: Öffnen Sie SQLite-Dateien schreibgeschützt; verbinden Sie PostgreSQL mit einer Rolle, die nur lesen kann, was Sie zeigen wollen – das ist die eigentliche Grenze, denn eine schreibgeschützte Transaktion verhindert nicht, was eine Funktion außerhalb der Datenbank tun könnte (zum Beispiel `dblink` oder eine HTTP-Erweiterung). Eine solche Rolle kann weiterhin den Systemkatalog (`pg_catalog`) lesen und Funktionen aufrufen, die für `PUBLIC` freigegeben sind; entziehen Sie die Rechte an Funktionen von Erweiterungen, die nach außen reichen (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;` und dergleichen):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### Vollständige Dateien {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite, legt eine Demo-Shop-Datenbank an, wenn Sie keine Datei angeben) und [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### Was es nicht tut {#what-it-does-not-do-2}

- **Keine Schreibvorgänge**, bewusst so. Wenn ein Modell Daten ändern soll, schreiben Sie für genau diese eine Änderung ein eigenes Tool, mit Freigabe.
- **Kein Filter pro Tabelle innerhalb von Abfragen**: Eine Abfrage kann alles lesen, was die Verbindung lesen kann. Verwenden Sie eine Rolle (PostgreSQL) oder eine Kopie der Datei mit nur den richtigen Tabellen (SQLite); stellen Sie eher Views als Rohtabellen bereit.
- **SQLite: Die Angriffsfläche ist die Abfrage, nicht die Datei.** Abfragen laufen in Ihrem Serverprozess, synchron, ohne Timeout und ohne Speicherobergrenze: Wer das SQL schreibt – das Modell oder wer es steuert –, kann eine Abfrage schreiben, die nie endet (ein rekursives `WITH`), oder riesige Werte erzeugen und so den Server blockieren oder erschöpfen. Zeilen werden einzeln gelesen, und jeder Wert wird beim Eintreffen zu einer kurzen Kopie gekürzt, sodass das Ergebnis klein bleibt und die Originale freigegeben werden können – aber jeder Rohwert wird zuerst vollständig geladen, und nichts begrenzt die Arbeit, die SQLite leistet, um eine Zeile zu erzeugen. Stellen Sie SQLite nur sich selbst oder Personen bereit, denen Sie vertrauen; stellen Sie es nicht über HTTP für nicht vertrauenswürdige Clients bereit. Abfragen in einem Worker-Thread auszuführen, der angehalten werden kann, würde diese Grenze aufheben; das ist noch nicht umgesetzt.
- **Auf der Verbindung registrierte SQLite-Funktionen sind aufrufbar** durch das SQL des Modells (`db.function(…)`): Registrieren Sie auf einer bereitgestellten Verbindung nur harmlose Funktionen.
- **Keine gebundenen Parameter**: Das Modell schreibt die Werte ins SQL.
- Zwei Spalten mit demselben Namen in einem Ergebnis behalten nur die letzte: Geben Sie ihnen Aliase.
- Andere Datenbanken (MySQL, SQL Server…): Implementieren Sie die kleine Schnittstelle `ReadOnlyDatabase` selbst und lassen Sie sie Schreibvorgänge eigenständig verweigern. `assertSingleQuery(sql, dialect)` versteht nur die Syntax von SQLite und PostgreSQL; MySQL (Backslash-Escapes in jedem String, Kommentare mit `#`) braucht eine eigene Prüfung.

## Ein Agent: Ihr Denkzwilling {#an-agent-your-reasoning-twin}

**Was es tut.** Stellt einen ganzen Agenten als ein Tool bereit. Die eindrucksvollste Anwendung: ein [kognitiver Agent mit Ihrem Denkerprofil](./thinker-profiles), sodass jeder aus Claude Desktop heraus fragen kann *„Was würde Nicolas davon halten, für Jev zu bezahlen?“* und eine Antwort erhält, die **so begründet ist, wie Nicolas denkt**, mit ihrer Begründung und dem, was noch fehlt.

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

Dieses Rezept braucht einen Modellschlüssel (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): Der Agent denkt mit einem Sprachmodell.

### Schritt 1 – festhalten, wie Sie denken {#step-1-—-capture-how-you-reason}

Erklären Sie einige Themen in Ihren eigenen Worten, destillieren Sie daraus einmal ein Profil und speichern Sie es:

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

Siehe [Wie eine bestimmte Person denken](./thinker-profiles) dazu, was ein Profil enthält und wie Sie es im Lauf der Zeit korrigieren.

### Schritt 2 – bereitstellen {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) lädt das Profil aus `PROFILE_FILE` (gegen das Profilschema geprüft) oder verwendet ein eingebautes Beispiel und stellt `ask_nicolas` bereit:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### Was das Modell sieht und zurückbekommt {#what-the-model-sees-and-gets-back}

Das Tool nimmt `problem` entgegen (die Frage, bis zu 4.000 Zeichen) und ein optionales Objekt `context` (Fakten und Randbedingungen, bis zu 20.000 Zeichen als JSON). Es liefert die Entscheidung, nicht den gesamten mentalen Zustand:

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

`decisionStatus` ist `committed` (eine feste Antwort), `provisional` (die bisher beste Antwort, mit `missing`: was noch nicht gesichert ist) oder `abstain`. Das vollständige Denken bleibt im Ereignisprotokoll unter `runId`: `sdk.getMentalState(runId)` zeigt jede Hypothese und jede Kritik. Wenn ein Lauf fehlschlägt, sagt `error` nur, dass er nicht abgeschlossen wurde und wo man nachsehen kann (`exposeErrors: true` schreibt die Meldung selbst ins Ergebnis: Sie kann Details des Anbieters enthalten).

### Optionen {#options-3}

| Option | Standard | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | Der Tool-Name. |
| `description` | generisch | Sagen Sie, wann dieser Agent zu Rate gezogen werden soll: Das Modell entscheidet danach. |
| `metadata` | mittleres Risiko | Governance-Metadaten, Feld für Feld über den Standard gelegt; fügen Sie `requiresApproval: true` hinzu, um jede Konsultation zu bestätigen. |
| `maxInputLength` | `4000` | Längstes akzeptiertes Problem (oder längste Nachricht). |
| `maxContextLength` | `20000` | Längster `context`, als JSON-Text. |
| `exposeErrors` | `false` | Die Fehlermeldung eines fehlgeschlagenen Laufs ins Ergebnis schreiben. |

`governedAgentTool(agent, options)` tut dasselbe für einen mit `sdk.createAgent` erstellten Agenten: Es nimmt `message` (und `context`) entgegen und liefert `{ runId, status, output, error }`.

### Gut zu wissen {#good-to-know}

- **Es braucht Zeit.** Ein kognitiver Lauf führt mehrere Modellaufrufe aus: Rechnen Sie mit Dutzenden Sekunden, manchmal Minuten. Viele Clients brechen einen Aufruf nach etwa einer Minute ab (der Standard des offiziellen TypeScript-SDK liegt bei 60 Sekunden; in Claude Code können Sie ihn mit `MCP_TOOL_TIMEOUT` erhöhen). Halten Sie `limits` für die interaktive Nutzung klein, es sei denn, Ihr Client setzt sein Timeout bei [Fortschrittsbenachrichtigungen](./mcp-deploy#progress-notifications) zurück: Jeder Schritt des Agenten sendet eine. **Wenn der Client aufgibt, wird der Lauf angehalten** (bei kognitiven wie bei kontrollierten Agenten) und als abgebrochen aufgezeichnet: Es werden keine weiteren Modellaufrufe gemacht, und eine Freigabe, auf die der Agent wartete, wird abgebrochen.
- **Es kostet Geld**: Jede Konsultation umfasst mehrere Modellaufrufe. Legen Sie ein [Budget](./mcp-deploy#governance-policies-budgets-approvals) fest und prüfen Sie `sdk.getRunCost(runId)`.
- **Es ahmt eine Denkweise nach, nicht das Wissen der Person.** Der Zwilling kennt, was im Profil, in der Frage und im Kontext steht – nicht das Gedächtnis der Person. Behandeln Sie seine Antworten als „Wie würde sie oder er das angehen?“ und lassen Sie die echte Person ihn mit `learnFromFeedback` korrigieren.

## Mehrere Quellen in einem Server {#several-sources-in-one-server}

Kombinieren Sie Quellen mit Präfixen, damit Namen nie kollidieren:

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

Zwei Tools mit demselben Namen werden beim Start abgelehnt, mit einer Meldung, die sagt, welches.

## Dieselben Tools in Ihren eigenen Agenten {#the-same-tools-in-your-own-agents}

Die Quellen sind einfache Tool-Definitionen: Ihre Agenten können sie ohne MCP verwenden.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

Es gelten dieselben Regeln: Die Schreiboperationen, die Sie aufgelistet haben, warten auf eine Freigabe, jeder Aufruf wird geprüft und aufgezeichnet.

Weiter: [bereitstellen, absichern und Fehler beheben](./mcp-deploy).
