# Tools

Ein **Tool** ist eine Funktion, die ein Agent aufrufen kann: eine Bestellung nachschlagen, eine Datei lesen, im Web suchen, einen anderen Agenten fragen. Sie schreiben Ihre eigenen oder nehmen fertige aus einer **Tool-Quelle**: einem Ordner, einer Datenbank, einer Web-API, dem Web, einem Agenten oder einem MCP-Server.

Unabhängig davon, woher ein Tool stammt, wird jeder Aufruf **kontrolliert**. Das Tool muss eines der Tools des Aufrufers sein, seine Argumente werden geprüft, Richtlinien und Budgets gelten, ein Mensch kann gebeten werden, den Aufruf freizugeben, Fehlschläge können wiederholt werden, und alles wird ins Ereignisprotokoll geschrieben.

## In einer Zeile {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

Der Agent kann jetzt die Dateien des Handbuchs auflisten, lesen und durchsuchen sowie im Web suchen und lesen: acht Tools, alle schreibgeschützt.

## Ihre eigenen Tools {#your-own-tools}

`sdk.defineTool` registriert ein Tool im SDK und gibt es zurück. Das zod-Schema beschreibt die Argumente; der Handler erhält sie validiert und typisiert.

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| Feld | |
| --- | --- |
| `name`, `description` | Was das Modell sieht und wonach es entscheidet. Verwenden Sie Buchstaben, Ziffern, `_` und `-`, bis zu 64 Zeichen: Modell-APIs und MCP-Clients können andere Namen ablehnen. |
| `schema` | Die Argumente als zod-Schema; die Texte aus `.describe()` werden dem Modell gezeigt. Ein Aufruf, der nicht passt, wird vor allem anderen abgelehnt. |
| `handler(params, context?)` | Ihr Code. `context` enthält `runId`, `agentId` und `signal`, das abgebrochen wird, wenn der Aufrufer aufgibt. |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`: siehe [Wie Aufrufe kontrolliert werden](#how-calls-are-governed). Standardmäßig keine. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`, nur für idempotente Tools. |
| `version` | Standardmäßig `1.0.0`. Sie ist Teil des Konfigurations-Hashs des Agenten, sodass sich Läufe vor und nach einer Änderung [vergleichen](../reference/sdk-api#comparisons-and-impact) lassen. |
| `capability` | Eine Bezeichnung zum Gruppieren; die eingebauten Quellen setzen eine (`web:search`, `folder:handbook`…). |

Ein Name wird pro SDK nur einmal registriert: `sdk.defineTool` wirft bei einem bereits vergebenen Namen einen Fehler, gleich welche Version. Geben Sie jeder Quelle ein Präfix, wenn zwei kollidieren könnten. Alle Felder stehen in der [SDK-API](../reference/sdk-api#tools-tooldefinition).

## Die eingebauten Tool-Quellen {#the-built-in-tool-sources}

Jede Quelle liefert Tool-Definitionen, bereit für `sdk.defineTool` (bei `connectMcpServer` in dessen `tools`). Jede kann ihre Tools umbenennen: mit einem Präfix (`prefix`; `toolPrefix` bei MCP) oder, beim Tool eines Agenten, mit dem ganzen Namen (`name`).

| Quelle | Der Agent kann | Tool-Namen | Risiko, schreibgeschützt | Braucht | Details |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | Die Textdateien eines Ordners auflisten, lesen und durchsuchen, nie außerhalb davon | `list_files`, `read_file`, `search_files` | niedrig, schreibgeschützt | Einen Ordner | [Ein Dokumentenordner](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | Die Tabellen auflisten, eine beschreiben, eine `SELECT`-Abfrage ausführen (standardmäßig 100 Zeilen) | `list_tables`, `describe_table`, `query` | mittel, schreibgeschützt | `sqliteReadOnly(db)` (`node:sqlite` oder `better-sqlite3`) oder `postgresReadOnly({ pool })` (`pg`) | [Eine schreibgeschützte Datenbank](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Eine Web-API aufrufen, ein Tool pro Operation; nur `GET`, sofern nicht in `include` aufgelistet | Die `operationId`, sonst Methode und Pfad (`get_pets_petId`) | `GET`: niedrig, schreibgeschützt. Andere: hoch, Freigabe erforderlich | Eine OpenAPI-3-Beschreibung (URL, Datei oder Objekt) | [Eine Web-API](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Im Web suchen, eine Seite oder ein PDF lesen, in arXiv, Wikipedia und GitHub suchen | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` mittel, die anderen niedrig; alle schreibgeschützt | Nichts für den Anfang (DuckDuckGo); `unpdf` für PDFs; ein GitHub-Token für die Codesuche | [Webrecherche](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | Einen anderen Agenten fragen: Ein kontrollierter Agent beantwortet eine `message`, ein kognitiver Agent denkt über ein `problem` nach und liefert seine Entscheidung | `ask_<agent name>` | mittel, nicht als schreibgeschützt markiert | Einen Agenten, also einen Modellschlüssel | [Ein Agent](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | Die Tools eines beliebigen MCP-Servers nutzen | Die Namen des Servers, mit `toolPrefix` davor | Keine gesetzt: `metadata` gilt für jedes importierte Tool | `@sdk-ai-agents/core/mcp` und `@modelcontextprotocol/sdk`; `close()`, wenn Sie fertig sind | [Die Tools eines MCP-Servers nutzen](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

Bei MCP-Tools sind zwei Dinge anders: Das SDK prüft nur, dass ihre Argumente ein Objekt bilden (den Rest prüft der Server), und die eigenen Hinweise des Servers, etwa „schreibgeschützt“, werden nicht übernommen: Setzen Sie `metadata` selbst.

## Einem Agenten Tools geben {#giving-tools-to-an-agent}

`createAgent({ tools })` und `createCognitiveAgent({ tools })` nehmen Tools entgegen; schicken Sie die Definitionen einer Quelle also zuerst durch `sdk.defineTool`, wie oben. Ein Agent kann **nur seine eigenen Tools** ausführen, die aus `tools` und aus seinen `capabilities`: Jedes andere Tool, das das Modell nennt, wird abgelehnt (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

`defineTool`, aus dem Paket importiert, erstellt ein Tool, ohne es zu registrieren: Das SDK registriert es, wenn ein Agent erstellt wird, der es verwendet. Ist bereits ein Tool mit diesem Namen registriert, wird das registrierte behalten und ausgeführt.

### Fähigkeiten {#capabilities}

Eine Fähigkeit benennt eine Gruppe von Tools, die Sie mehreren Agenten geben. Die Bezeichnung `capability` eines Tools ist keine Fähigkeit: Definieren Sie eine mit `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### Außerhalb eines Agenten {#outside-an-agent}

`sdk.listTools()` liefert jedes im SDK registrierte Tool. `sdk.executeTool(name, parameters, options?)` ruft eines über dieselbe kontrollierte Pipeline auf, als eigenen Lauf (Agentenkennung `external`, sofern Sie keine `agentId` angeben), und liefert, was der Handler zurückgegeben hat:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

Seine Optionen: `runId` zeichnet den Aufruf innerhalb eines bestehenden Laufs auf, `allowedTools` begrenzt, was dieser Aufrufer ausführen darf, `signal` bricht ihn ab, `approvalTimeoutMs` begrenzt die Wartezeit auf eine Freigabe, und `onEvent` verfolgt den Aufruf live. Eine Ablehnung wirft einen `PolicyViolationError`; ungültige Argumente und ein fehlschlagender Handler werfen einen `ToolExecutionError`.

Dieselben Tools dienen auch anderswo. Eine [Studie](./studies#research-through-your-sources) nimmt die **Namen** definierter Tools als ihre `sources` entgegen, und ein MCP-Server stellt die Definitionen oder Namen, die Sie ihm geben, Claude Desktop, Claude Code oder jedem MCP-Client bereit (siehe [Ein MCP-Server für alles](./mcp-recipes)).

## Wie Aufrufe kontrolliert werden {#how-calls-are-governed}

Ein Aufruf durchläuft diese Schritte in dieser Reihenfolge und endet bei der ersten Ablehnung:

1. **Die Tools des Aufrufers.** Ein Tool, das dem Aufrufer nicht gegeben wurde – über die Tools eines Agenten, die Quellen einer Studie, die Liste eines MCP-Servers oder `allowedTools` –, wird abgelehnt. `executeTool` ohne `allowedTools` kann jedes registrierte Tool ausführen.
2. **Die Argumente**, gegen das Schema geprüft, bevor irgendjemand um etwas gebeten wird.
3. **Die Richtlinien**: jede globale Richtlinie und jede Richtlinie des Agenten (siehe [Kontrollierte Agenten](./governed-agents#_3-policies)).
4. **Die Freigabe**, wenn das Tool oder eine Richtlinie eine verlangt.
5. **Das Budget**: Der Aufruf wird beim Start gezählt, unabhängig von seinem Ausgang.
6. **Das Tool wird ausgeführt**, mit seinen Wiederholungsversuchen.

### Risikostufen {#risk-levels}

`riskLevel` ist eine Bezeichnung: Sie sagt Menschen und Code, wie vorsichtig sie sein sollen. **Keine Richtlinie liest sie**, und sie blockiert oder verlangsamt keinen Aufruf. Um danach zu handeln, geben Sie einem Tool `requiresApproval` oder machen Sie aus der Bezeichnung eine Richtlinie:

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

Die Liste wird erstellt, wenn die Richtlinie definiert wird: Definieren Sie die Tools zuerst.

### Freigaben {#approvals}

Ein Aufruf wartet auf einen Menschen, wenn das Tool `requiresApproval: true` hat (der Standard von `openApiTools` für Schreiboperationen) oder eine Richtlinienregel `require_approval` sagt. Er erscheint in `sdk.getPendingApprovals()`; `sdk.approveAction(id, who, reason?)` lässt ihn ausführen, `sdk.rejectAction(id, who, reason?)` lehnt ihn ab. Gibt der Aufrufer vorher auf (ein angehaltener Lauf, ein abgebrochenes `signal`, `approvalTimeoutMs`, bei MCP-Servern standardmäßig 50 s), wird die Freigabe abgebrochen, und das Tool wird nie ausgeführt. Siehe [Freigaben](./mcp-deploy#approvals-a-human-says-yes-first).

### Schreibgeschützte Tools {#read-only-tools}

`readOnly: true` sagt, dass das Tool nichts ändert. MCP-Clients sehen es als `readOnlyHint`, und `openApiTools` wiederholt nur schreibgeschützte Operationen. Es lockert keine Richtlinie und wird nicht überprüft: Ein als schreibgeschützt markierter Handler, der schreibt, schreibt trotzdem. Die Quellen, die nur lesen, setzen es durch, wo sie können: `folderTools` hat keine Möglichkeit zu schreiben, und `sqliteReadOnly` und `postgresReadOnly` führen jede Abfrage in der Datenbank selbst schreibgeschützt aus.

### Wiederholungsversuche {#retries}

`retry` führt einen fehlschlagenden Handler erneut aus: nur bei Fehlern des Handlers, nie bei ungültigen Argumenten oder einer Ablehnung. Jeder Wiederholungsversuch ist ein Ereignis `tool.retry`, und der Aufruf zählt in seinem Budget nur einmal. `openApiTools`, `webTools` und `connectMcpServer` nehmen eine Option `retry` für ihre Tools entgegen. Siehe [Wiederholungen & Fallback](./resilience#tools).

### Budgets {#budgets}

Eine Richtlinie vom Typ `budget` mit einem `budgetLimit` begrenzt die Tool-Aufrufe pro Zeitraum, für einen Agenten (`agentId`), ein Tool (`toolName`) oder alle:

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

`maxTokens` und `maxCost` zählen die Modellaufrufe und lehnen die Tool-Aufrufe ab, sobald das Budget aufgebraucht ist. Siehe [API-Kosten](./costs#budgets).

### Nicht vertrauenswürdige Ausgaben {#untrusted-output}

Was ein Tool zurückgibt, geht zurück an das Modell, und eine Seite, eine Datei oder eine API-Antwort kann Anweisungen enthalten, die für das Modell geschrieben wurden (Prompt Injection). Die Web-Tools markieren jede Antwort mit `untrusted: true`, und ihre Beschreibungen weisen das Modell an, nie Anweisungen zu folgen, die darin stehen. Die anderen Quellen geben ihren Inhalt so zurück, wie er ist. Sagen Sie im System-Prompt, dass Tool-Ergebnisse Daten sind, geben Sie jedem Agenten nur die Tools, die er braucht, und schützen Sie die Tools, die etwas ändern, mit Freigaben. Eine Studie zeigt ihrem Modell jedes Ergebnis als Daten. Siehe [die Sicherheitsregeln der Web-Tools](./web-research#security-rules).

### Was ein Aufruf aufzeichnet {#what-a-call-records}

| Ereignis | Wann |
| --- | --- |
| `action.executing` | Der Aufruf wird vorgeschlagen, vor jeder Prüfung |
| `policy.checked` | Jede geprüfte Richtlinie, dann das Urteil |
| `policy.violated` | Eine Ablehnung: ein Tool, das dem Aufrufer nicht gegeben wurde (`allowed-tools`), eine Richtlinie, ein aufgebrauchtes Budget |
| `approval.requested`, `approval.approved`, `approval.rejected` | Die Entscheidung des Menschen |
| `tool.called` | Der Handler startet |
| `tool.retry` | Ein Wiederholungsversuch, mit seiner Verzögerung und dem Fehler |
| `action.executed`, `action.failed` | Das Ergebnis oder der Fehler (ungültige Argumente eingeschlossen), mit der Dauer |

Ein mit `executeTool` gemachter Aufruf ist ein eigener Lauf, sofern Sie keine `runId` angeben: `run.started` (Modus `tool`), dann `run.completed` oder `run.failed`. Siehe den [Ereigniskatalog](../reference/events#reasoning-and-actions).

## Eine Quelle wählen {#choosing-a-source}

| Ich brauche… | Verwenden Sie |
| --- | --- |
| Meinen eigenen Code oder Dienst | `sdk.defineTool` |
| Dokumente in einem Ordner | `folderTools` |
| Antworten aus einer SQL-Datenbank, ohne jedes Risiko eines Schreibvorgangs | `databaseTools` mit `sqliteReadOnly` oder `postgresReadOnly` |
| Eine Web-API, die eine OpenAPI-Beschreibung veröffentlicht | `openApiTools` |
| Eine Web-API ohne eine solche Beschreibung | `sdk.defineTool`, mit `fetch` im Handler |
| Das Web, wissenschaftliche Artikel, Enzyklopädieartikel, Code auf GitHub | `webTools` |
| Die Antwort oder Entscheidung eines anderen Agenten | `governedAgentTool` oder `cognitiveAgentTool` |
| Ein System, das bereits einen MCP-Server hat | `connectMcpServer` |
| Quellen für eine Studie | Die Such-Tools von `webTools` oder eines MCP-Servers |
| Meine Tools in Claude Desktop oder Claude Code | Die andere Richtung: [ein MCP-Server](./mcp-recipes) |
