# Schlüsselbegriffe einfach erklärt

Jeder Begriff, der in dieser Dokumentation verwendet wird, ohne Fachjargon erklärt und mit einem Link auf die Seite, die ihn ausführlich behandelt. Die Begriffe sind nach Themen gruppiert; mit dem Suchfeld (<kbd>/</kbd>) springen Sie direkt zu einem Begriff.

## Die Grundlagen {#the-basics}

| Begriff | Einfach erklärt |
| --- | --- |
| **SDK** | Ein Werkzeugkasten für Entwickler: Code, den Sie Ihrer eigenen Anwendung hinzufügen, statt alles selbst zu schreiben. Dieses SDK ist in TypeScript geschrieben und wird von npm als `@sdk-ai-agents/core` installiert (siehe [Schnellstart](./getting-started)). |
| **Sprachmodell** (Language Model, LLM) | Die KI, die Text liest und schreibt (GPT-4o, Claude…). Hier ist sie eine Komponente unter anderen: Sie schlägt vor, das SDK prüft und entscheidet, was erlaubt ist. |
| **Prompt** | Die Textanweisungen, die mit jeder Anfrage an ein Sprachmodell gesendet werden. |
| **Token** | Ein Wortteil. Modellanbieter rechnen pro gelesenem und geschriebenem Token ab, deshalb werden die [Kosten](./costs) in Tokens gezählt. |
| **Agent** | Ein Programm, das ein Sprachmodell nutzt, um Schritt für Schritt ein Ziel zu erreichen. Das SDK hat zwei Arten: [kontrollierte Agenten](./governed-agents) (governed agents), die mit Tools handeln, und [kognitive Agenten](./cognitive-agents) (cognitive agents), die nachdenken, bevor sie zu einem Schluss kommen. |
| **Lauf** (Run) | Eine Ausführung eines Agenten zu einem Problem, von Anfang bis Ende. Er hat eine Kennung (`runId`), mit der Sie ihn lesen, erneut abspielen oder seine Kosten ermitteln. |
| **Tool** | Eine Funktion, die Ihr Code einem Agenten gibt (eine Datenbank lesen, eine E-Mail senden…). Der Agent kann nur die Tools verwenden, die ihm ausdrücklich gegeben wurden. Siehe [Grundkonzepte](./concepts#_2-tool). |
| **Fähigkeit** (Capability) | Eine benannte Gruppe von Tools, die Sie mehreren Agenten auf einmal geben können. |
| **Richtlinie** (Policy) | Eine Regel, die **vor** jeder Aktion geprüft wird: ein Budget, ein Timeout, eine Liste erlaubter Tools oder Ihre eigene Prüfung. |
| **Freigabe** (Approval) | Eine Pause vor einer riskanten Aktion, bis ein Mensch zustimmt. Eine Richtlinie kann sie verlangen oder das Tool selbst (`requiresApproval`); gibt der Aufrufer vorher auf, wird die Aktion nie ausgeführt. |
| **Intention** | Was das Modell eines kontrollierten Agenten tun *will* (ein Tool aufrufen, antworten…), aufgeschrieben, aber nicht ausgeführt: Das SDK prüft sie zuerst. |
| **Schema (Zod)** | Eine genaue Beschreibung der Form, die Daten haben müssen. Tool-Aufrufe und die strukturierten Antworten der Denkschritte werden dagegen geprüft; eine Antwort, die nicht passt, wird abgelehnt. |
| **JSON** | Ein einfaches Textformat für strukturierte Daten. Profile, Ereignisse und Modellantworten sind JSON. |

## Nachvollziehbarkeit {#traceability}

| Begriff | Einfach erklärt |
| --- | --- |
| **Ereignis** (Event) | Eine Zeile im Logbuch: „Dies ist passiert, zu diesem Zeitpunkt.“ Jeder Schritt jedes Laufs wird als Ereignis aufgezeichnet. Siehe den [Ereigniskatalog](../reference/events). |
| **Ereignisspeicher** (Event Store) | Wo das Logbuch aufbewahrt wird: ein Ordner mit Dateien, SQLite oder PostgreSQL. |
| **Event Sourcing** | Die Regel, dass das Logbuch die Wahrheit ist: Der Zustand eines Laufs, einschließlich seines mentalen Zustands, wird durch erneutes Lesen seiner Ereignisse rekonstruiert, nie separat gespeichert. Das macht jeden Lauf noch Monate später prüfbar. Ein Denkerprofil ist die Ausnahme: Die Ereignisse halten nur seine Kennung und Version fest, speichern Sie also das Profil selbst. |
| **Trace** | Alle Ereignisse eines Laufs, in ihrer Reihenfolge. |
| **Replay** | Einen aufgezeichneten Lauf anhand seiner Ereignisse erneut ausführen: Die Aktionen, die er beschlossen hat, werden erneut ausgeführt, durch dieselben Richtlinien, ohne das Sprachmodell noch einmal zu fragen. Nützlich, um einen Lauf zu prüfen oder nach einer Richtlinienänderung „Was wäre, wenn?“ zu testen. Siehe [Nachvollziehbarkeit & Replay](./observability). |
| **Golden Trace** | Ein guter Lauf, den Sie als Referenz behalten; neue Läufe werden damit verglichen, sodass eine Verhaltensänderung wie ein fehlschlagender Test erkannt wird. |

## Wie ein kognitiver Agent denkt {#how-a-cognitive-agent-reasons}

| Begriff | Einfach erklärt |
| --- | --- |
| **Mentaler Zustand** (Mental State) | Alles, was der Agent gerade über das Problem „im Kopf hat“, als Daten aufgeschrieben: was er beobachtet hat, weiß, annimmt, nicht weiß, und die Optionen, die er in Betracht zieht. Siehe [den mentalen Zustand](./cognitive-agents#the-mental-state). |
| **Beobachtung** (Observation, `O1`…) | Etwas Gesehenes: eine Messung oder ein Dokument, das Sie mit dem Problem übergeben haben, ein Tool-Ergebnis oder ein Testergebnis. |
| **Fakt** (Fact, `F1`…) | Eine Aussage, die der Agent für wahr hält, samt ihrer Herkunft. Ein Fakt wird nie gelöscht: Er wird *zurückgezogen* (retracted) oder *ersetzt* (superseded), mit Begründung. |
| **Annahme** (Assumption, `A1`…) | Etwas, das das Denken ohne Beweis als gegeben voraussetzt. |
| **Randbedingung** (Constraint, `K1`…) | Etwas, das jede Antwort einhalten muss („vor Q4“, „unter 10.000 EUR“). |
| **Unbekannte** (Unknown, `U1`…) | Eine offene Frage. Sie kann *geklärt* (resolved) oder *fallen gelassen* (dropped) werden, wenn es keinen Weg gibt, sie zu beantworten. |
| **Hypothese** (Hypothesis, `H1`…) | Eine Option, die in Betracht gezogen wird. Sie gehört zu einer von drei Arten: ein **Vorschlag** (proposal, eine Handlungswahl: „die Stelle ablehnen“), eine **Regel** (rule, eine Gesetzmäßigkeit: „die Rollzeit hängt nicht von der Masse ab“) oder eine **Erklärung** (explanation, eine Ursache). |
| **Induktion, Abduktion, Deduktion** (induction, abduction, deduction) | Drei Wege zu einer Hypothese: von wiederholten Fällen zu einer Regel; von einer Überraschung zu ihrer wahrscheinlichsten Ursache; von einer Regel zu dem, was daraus folgen muss. Die Bezeichnung wird angegeben, sie macht die Aussage nicht wahr. |
| **Operation** | Ein Denkschritt: das Problem darstellen, Hypothesen bilden, simulieren, kritisieren, vergleichen, entscheiden… Es gibt zehn davon. Siehe [die Operationen](./cognitive-agents#the-operations). |
| **Controller** | Was die nächste Operation auswählt. Der **heuristische** Controller folgt einer festen Reihenfolge, kostenlos und vorhersehbar; der **typisierte** Controller fragt bei jedem Schritt Jev. |
| **Gedanken-Patch** (Thought Patch) | Was eine Operation am mentalen Zustand geändert hat, aufgezeichnet als ein Ereignis. Der mentale Zustand ist die Gesamtheit der Patches, der Reihe nach angewendet. |
| **Simulation** | Sich vorstellen, was passieren würde, wenn eine Hypothese wahr wäre: unmittelbare Folgen, dann indirekte. |
| **Kritik** (Critique) | Der Agent greift seine eigene Option an: der stärkste Grund, warum sie scheitern könnte. Eine **fatale** Kritik ohne Entgegnung verwirft die Option. |
| **Widerspruch** (Contradiction, `C1`…) | Zwei Dinge, die nicht beide wahr sein können. Er bleibt offen, bis er unter Angabe der Beobachtungen oder Fakten, die ihn klären, aufgelöst wird. |
| **Variante** (Variant) | Eine korrigierte Fassung einer Hypothese, der die Belege widersprochen haben, mit engerem Geltungsbereich oder einer zusätzlichen Bedingung und einem Satz, der sagt, was sich geändert hat. |
| **Limits** | Das Budget eines Laufs: Anzahl der Schritte, Zeit, Tool-Aufrufe, Tests und die Schwellen für einen Abschluss. Siehe [Limits](./cognitive-agents#limits). |

## Belege und Schlussfolgerungen {#evidence-and-conclusions}

| Begriff | Einfach erklärt |
| --- | --- |
| **Herkunft** (Provenance) | Woher ein Beleg stammt: von Ihnen übergeben, von einem Tool geliefert oder durch einen Test gemessen, mit dem Ereignis, das das Original enthält. |
| **Herkunftsgruppe** (`originGroup`) | Eine Kennzeichnung für „gleiche Quelle“. Zwei Beobachtungen aus derselben Quelle sind keine zwei unabhängigen Bestätigungen. |
| **Duplikat** (Duplicate) | Derselbe Inhalt aus derselben Quelle, erneut gesehen. Er fügt kein Gewicht hinzu. |
| **Vorhersage** (Prediction, `P1`…) | Was beobachtet werden müsste, wenn eine Hypothese stimmt, aufgezeichnet **bevor** sie getestet wird. |
| **Falsifikator** (Falsifier) | Die Beobachtung, die die Hypothese widerlegen würde. Eine Aussage, die sich nicht widerlegen lässt, lässt sich nicht testen. |
| **Wissen** (Knowledge, `M1`…) | Was frühere Läufe mit echten Tests festgestellt haben, zu Beginn eines Laufs abgerufen: *verifiziert* (verified), *widerlegt* (refuted) oder *umstritten* (contested), wenn die Tests sich widersprechen. Siehe [Gedächtnis über Läufe hinweg](./memory). |
| **Geltungsbereich** (Scope) | Die Grenze eines Gedächtnisses: Läufe teilen, was sie gelernt haben, nur innerhalb desselben Geltungsbereichs, zum Beispiel ein Prüfstand oder ein Produkt. |
| **Ergebnis-Evaluator** (Outcome Evaluator) | Ihr Code, der eine Vorhersage mit der Welt konfrontiert (eine Messung, ein Simulator, eine Testsuite) und mit *bestätigt* (confirmed), *widerlegt* (refuted) oder *nicht eindeutig* (inconclusive) antwortet. Das Sprachmodell bewertet nie seine eigenen Vorhersagen. Siehe [Vorhersagen](./evidence-and-verification#predictions-and-the-outcome-evaluator). |
| **Stützung** (Support) | Wie gut die Belege eine Hypothese stützen, von 0 (widerlegt) bis 1 (gesichert). Das ist eine Beurteilung, keine gemessene Wahrscheinlichkeit. Der Code mischt nie Präferenzen hinein; bei einem Sprachmodell als Richter beruht das auf seinen Anweisungen (siehe [Belege sind keine Präferenzen](./evidence-and-verification#evidence-is-not-preference)). |
| **Präferenzpassung** (`preferenceFit`) | Wie gut eine Handlungswahl zum Denker passt, von 0 (erfüllt eines seiner Ausschlusskriterien) bis 1 (ideal). Nur Handlungswahlen erhalten diesen Wert. |
| **Rangfolge** (Ranking) | Die Reihenfolge der Optionen. Aussagen werden allein nach Stützung eingeordnet; Handlungswahlen standardmäßig zu 60 % nach Stützung und zu 40 % nach Präferenzpassung. |
| **Veraltet** (Stale) | Eine Bewertung, die vorgenommen wurde, bevor sich die Belege zuletzt geändert haben. Sie muss vor einem Abschluss erneuert werden. |
| **Abschlussprüfung** (Conclusion Guard) | Die im Code geschriebenen Prüfungen, die eine Antwort bestehen muss, um verbindlich zu werden: kritisiert, seit dem letzten neuen Beleg bewertet, kein offener Widerspruch, der sie betrifft, keine ungetestete Vorhersage, solange noch Tests im Budget sind, und ausreichende Stützung. Siehe [Die Abschlussprüfung](./evidence-and-verification#the-conclusion-guard). |
| **Entscheidungsschwelle** (Decision Threshold) | Die Stützung, die eine feste Antwort braucht: standardmäßig 0,75, „stark gestützt“. Eine Handlungswahl, die der Denker klar bevorzugt, braucht nur 0,35. |
| **Verbindlich** (`committed`) | Eine feste Antwort, die die Abschlussprüfung bestanden hat. |
| **Vorläufig** (`provisional`) | Die beste verfügbare Antwort, als das Budget aufgebraucht war, mit der Liste dessen, was noch nicht gesichert ist (`missing`). |
| **Enthaltung** (`abstain`) | „Ich kann keinen Schluss ziehen“, mit den Gründen. Ein gültiges Ergebnis, kein Fehler. |
| **Konfidenz** (Confidence) | Wie sicher die Entscheidung ist, nie höher als die Evidenzstützung der gewählten Option. |

## Das Denken einer Person nachahmen {#imitating-a-person-s-reasoning}

| Begriff | Einfach erklärt |
| --- | --- |
| **Denkerprofil** (Thinker Profile) | Eine Beschreibung dessen, **wie** eine bestimmte Person denkt: die Reihenfolge, in der sie ein Problem betrachtet, ihre Prioritäten, Reflexe, Ausschlusskriterien und ihre Risikobereitschaft. Es wird in die Anweisungen jedes Denkschritts geschrieben; so ahmt der Agent das Denken dieser Person nach. Siehe [Denkerprofile](./thinker-profiles). |
| **Sample** | Ein Thema, das die Person in ihren eigenen Worten erklärt hat: das Thema, wie sie nachgedacht hat, zu welchem Schluss sie gekommen ist. |
| **Destillieren** (Distill) | Ein Profil aus Samples gewinnen: herausfinden, was sich in der Denkweise der Person über die Themen hinweg wiederholt. |
| **Aufmerksamkeitsreihenfolge** (`reasoningSequence`) | Die Schritte, die die Person der Reihe nach durchläuft. |
| **Heuristik** (Heuristic) | Ein Reflex, formuliert als „wenn …, dann …“. |
| **Ausschlusskriterium** (Rejection Criterion) | Ein Grund, aus dem die Person eine Idee fallen lässt. |
| **Urteil** (Verdict) | Das Urteil der Person über einen Lauf: `match` (hat wie ich gedacht), `partial` oder `mismatch`. |
| **Zustimmung** (Agreement) | Wie viel eines Laufs die Person teilt, von 0 bis 1: `0.8` bedeutet „zu 80 % richtig“. Damit messen Sie, wie nah die Nachahmung herankommt. |
| **Kalibrierungsbeispiel** (Calibration Example) | Ein Lauf, den die Person bestätigt hat, dem Modell als Musterantwort gezeigt. |
| **Korrektur** (Correction) | Eine Lektion aus einem Lauf, mit dem die Person nicht einverstanden war, dem Modell mit höchster Priorität gezeigt. |

## Typisierte Entscheidungen und Konnektoren {#typed-decisions-and-connectors}

| Begriff | Einfach erklärt |
| --- | --- |
| **Jev** | Ein Modell von TypeSafe, das eng gefasste Fragen (Ja/Nein, eine Auswahl, eine Bewertung) mit Wahrscheinlichkeiten beantwortet, die Ihr Code verwenden kann, schnell und günstig. Siehe [Typisierte Entscheidungen](./typed-decisions). |
| **Noul, Choice, Score** | Die drei Fragetypen von Jev: Ja oder Nein; eine Option aus einer Liste; eine Stufe auf einer Skala. Wer mehrere Optionen auswählen lässt, stellt pro Option eine Ja/Nein-Frage. |
| **Kalibriert** (Calibrated) | Eine Wahrscheinlichkeit, die im Durchschnitt der Wirklichkeit entspricht: Von den Antworten, die mit 80 % Konfidenz gegeben werden, sind etwa 80 % richtig. |
| **AI Gateway** | Ein Dienst von Vercel, der mit einem einzigen Schlüssel Zugang zu mehreren Modellen bietet, Jev eingeschlossen. |
| **MCP** | Model Context Protocol: ein einheitlicher „Stecker“ zwischen KI-Anwendungen (Claude Desktop, Claude Code, IDE-Assistenten, Agenten) und Ihren Systemen. Das SDK kann aus einer Funktion, einer Web-API, einem Ordner, einer Datenbank oder einem Agenten einen MCP-Server machen und die Tools jedes MCP-Servers nutzen. Siehe [MCP einfach erklärt](./mcp). |
| **MCP-Server** (MCP Server) | Ein kleines Programm vor einem Ihrer Systeme, das KI-Anwendungen mitteilt, was es anbietet, und die Arbeit erledigt, wenn es darum gebeten wird. Siehe [Ihr erster MCP-Server](./mcp-first-server). |
| **MCP-Client, Host** (MCP Client, Host) | Der Host ist die KI-Anwendung, mit der der Nutzer spricht; darin hält ein MCP-Client die Verbindung zu einem Server. |
| **Ressource** (Resource) | Ein Dokument, das ein MCP-Server zum Lesen anbietet, etwa eine Datei aus einem freigegebenen Ordner. Anders als bei einem Tool wählt es der Nutzer oder die Anwendung aus, nicht das Modell. |
| **Transport** | Wie eine MCP-Anwendung und ein Server Nachrichten austauschen: **stdio** (die Anwendung startet den Server als Programm auf demselben Rechner und kommuniziert über dessen Ein- und Ausgabe) oder **Streamable HTTP** (der Server ist ein Webdienst). Siehe [stdio oder HTTP?](./mcp-deploy#stdio-or-http). |
| **OpenAPI** | Eine standardisierte, maschinenlesbare Beschreibung einer Web-API: ihre Adressen, Parameter und Antworten, oft als `openapi.json` veröffentlicht. Daraus erstellt das SDK ein Tool pro Operation. Siehe [Eine Web-API](./mcp-recipes#a-web-api-from-its-openapi-description). |
| **JSON Schema** | Eine Beschreibung der Form bestimmter Daten – hier der Argumente eines Tools –, die Modelle und MCP-Anwendungen lesen, um das Tool korrekt aufzurufen. Das SDK schreibt sie aus Ihrem Zod-Schema oder aus der OpenAPI-Beschreibung. |
| **Schreibgeschützt** (Read-only) | Kann lesen, kann nichts ändern. Die Quellen für Ordner und Datenbanken sind bauartbedingt schreibgeschützt; Web-APIs sind es standardmäßig (nur `GET`-Operationen). |
| **Tool-Quelle** (Tool Source) | Eine Funktion, die aus einem System fertige Tools erstellt: `openApiTools`, `folderTools`, `databaseTools`, `cognitiveAgentTool`. Stellen Sie sie mit einer Zeile über MCP bereit oder geben Sie sie Ihren eigenen Agenten. Siehe [Ein MCP-Server für alles](./mcp-recipes). |

## Betrieb in der Produktion {#operating-in-production}

| Begriff | Einfach erklärt |
| --- | --- |
| **Wiederholungsversuch** (Retry) | Eine fehlgeschlagene Anfrage nach kurzer Wartezeit erneut versuchen, wenn der Fehler vorübergehend ist. Siehe [Wiederholungen & Fallback](./resilience). |
| **Fallback, Failover** | Auf ein anderes Modell oder einen anderen Anbieter umschalten, wenn der erste wiederholt ausfällt. |
| **Incident** | Ein fehlgeschlagener Lauf, eine blockierte Aktion oder ein Failover, umgewandelt in eine Benachrichtigung, die Ihnen per E-Mail oder Webhook geschickt wird. Siehe [Incident-Benachrichtigungen](./incidents). |
| **Webhook** | Eine Adresse, die Ihnen Ihr Chat- oder Monitoring-Tool gibt und an die das SDK Benachrichtigungen sendet. |
