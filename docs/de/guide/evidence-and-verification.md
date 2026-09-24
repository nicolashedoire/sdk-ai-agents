# Belege & Verifikation

Ein kognitiver Agent sollte glauben, was er begründen kann, testen, was er vorhersagt, und seine Regeln ändern, wenn die Welt widerspricht. Der kognitive Kreislauf verfolgt deshalb, **woher jeder Beleg stammt**, hält **Belege und Präferenzen getrennt**, konfrontiert Vorhersagen mit **echten Tests** und legt sich nur auf eine Antwort **verbindlich** fest, die eine im Code geschriebene Bereitschaftsprüfung besteht.

::: tip In einfachen Worten
Denken Sie an eine sorgfältige Ermittlerin. Sie notiert, **woher jeder Hinweis stammt**, und zählt dasselbe Gerücht nicht zweimal. Aus mehreren Fällen leitet sie eine **Regel** ab und sagt dann im Voraus, **was sie sehen müsste**, wenn die Regel stimmt, und **was sie widerlegen würde**. Dann prüft sie nach, mit einer echten Messung statt mit ihrer eigenen Meinung. Wenn die Prüfung scheitert, tut sie nicht so als ob: Sie **korrigiert die Regel** und sagt, was sich geändert hat. Und sie gibt nur dann eine **feste Antwort**, wenn diese standhält; andernfalls sagt sie „noch nicht sicher, das hier fehlt noch“ oder „ich kann keinen Schluss ziehen“. Jeder Begriff, der unten verwendet wird, wird in [Schlüsselbegriffe einfach erklärt](./glossary#evidence-and-conclusions) erklärt.
:::

![Beobachten, vergleichen, ableiten, testen, überarbeiten – dann die Abschlussprüfung](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## Übergeben Sie, was Sie beobachtet haben {#give-it-what-you-observed}

Übergeben Sie mit dem Problem die Messungen, Fälle oder Dokumente, die Sie bereits haben. Jedes Element wird zu einer **Beobachtung** mit einer Kennung (`O1`, `O2`…), die das Denken anführen kann.

```ts
const result = await agent.think({
  problem: 'Does the rolling time on our plane depend on the ball?',
  observations: [
    {
      content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
      summary: 'Steel ball, 100 g: 1.07 s',
      originGroup: 'bench',
    },
    {
      content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
      summary: 'Steel ball, 400 g: 1.07 s',
      originGroup: 'bench',
    },
  ],
});
```

Tool-Ergebnisse und Testergebnisse werden ebenfalls zu Beobachtungen. Ihre Herkunft wird von der Engine geschrieben, nie vom Modell:

| Feld | Bedeutung |
| --- | --- |
| `sourceKind` | `input` (mit dem Problem übergeben), `tool` (ein kontrollierter Tool-Aufruf) oder `evaluation` (ein Vorhersagetest) |
| `source`, `sourceEventId` | Das Tool oder der Evaluator und das Ereignis, das die vollständigen Nutzdaten enthält (`action.executed`, `cognition.evaluated`) |
| `observedAt`, `context` | Wann und in welcher Situation beobachtet wurde |
| `summary` | Begrenzter Text, der dem Modell gezeigt wird |
| `fingerprint` | Hash des vollständigen Inhalts |
| `originGroup` | Beobachtungen mit derselben Herkunft sind **keine** unabhängigen Bestätigungen |
| `duplicateOf` | Gesetzt, wenn derselbe Inhalt aus derselben Quelle bereits beobachtet wurde |

Fakten führen die Beobachtungen an, aus denen sie gelesen wurden (`observationRefs`); ein Fakt, der aus einem Tool-Ergebnis extrahiert wurde, wird automatisch damit verknüpft, und ein bereits bekannter Fakt wird nicht zweimal hinzugefügt – die neue Quelle wird ihm als Bestätigung hinzugefügt. Das Modell wird angewiesen, eine Quelle, die X behauptet, als *die Quelle behauptet X* zu lesen, nicht als Beweis für X. Der Code stellt sicher, dass die Wiederholung desselben Belegs kein Gewicht hinzufügt: Ein Duplikat zählt nicht als Änderung der Belege, und Fakten oder Tests, die eine frühere Beobachtung wiederholen, verweisen auf das Original.

## Beobachtungen vergleichen {#compare-observations}

`compare_observations` setzt Beobachtungen (und Fakten) zueinander in Beziehung. Die Operation wird angeboten, wenn mindestens zwei vergleichbare Beobachtungen vorliegen – mit dem Problem übergeben oder von Tools geliefert, ohne Duplikate und Testergebnisse – und seit dem letzten Vergleich neue hinzugekommen sind.

| Beziehung | Bedeutung | Was der Code tut |
| --- | --- | --- |
| `similarity` | Gleicher Wert oder gleiches Verhalten in einem Aspekt | Aufgezeichnet – eine Ähnlichkeit ist keine Ursache |
| `difference` | Ein Unterschied, der durch den Kontext erklärt wird | Aufgezeichnet |
| `evolution` | Eine Veränderung über die Zeit | Aufgezeichnet |
| `incompatibility` | Sie können nicht beide zutreffen | Öffnet einen Widerspruch (`source_disagreement` über verschiedene Herkünfte hinweg), einmalig |
| `counterexample` | Ein Fall, der eine Hypothese bricht | Als Gegenbeleg dieser Hypothese aufbewahrt, öffnet einen Widerspruch, einmalig |

## Regeln, Erklärungen und Vorschläge {#rules-explanations-and-proposals}

Eine Hypothese gibt an, welche Art von Aussage sie ist, wie sie gewonnen wurde und worauf sie beruht:

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind` ist `proposal` (eine Aktion oder eine zu treffende Wahl, der Standard), `rule` (eine Gesetzmäßigkeit) oder `explanation` (eine Ursache). Eine Aussage darüber, was wahr ist oder war, ist nie ein Vorschlag: Das Modell wird darauf hingewiesen, weil die [Abschlussprüfung](#the-conclusion-guard) die Präferenzen des Denkers einer Wahl helfen lässt, nie einer Aussage. `inference` ist `induction`, `abduction` oder `deduction`; die Bezeichnung macht die Aussage nie wahr.

## Vorhersagen und der Ergebnis-Evaluator {#predictions-and-the-outcome-evaluator}

`simulate` leitet **Vorhersagen** ab, die scheitern könnten: was beobachtet werden müsste (`expected`), welche Beobachtung die Hypothese widerlegen würde (`falsifier`), in welchem `context`, und die strukturierten `test`-Parameter, die ein Evaluator braucht. Eine Vorhersage wird aufgezeichnet, **bevor** sie getestet wird, und einmal getestet. Das Modell sieht die bereits durchgeführten Experimente und ihre Ergebnisse (`experiments` in der Zustandsansicht) und wird gebeten, keines zu wiederholen, sondern einen Test zu wählen, bei dem die Hypothesen im Spiel unterschiedliche Ergebnisse erwarten.

Ein `OutcomeEvaluator` konfrontiert sie mit der Welt – ein Simulator, eine Messung, eine Testsuite, eine Abfrage:

```ts
import type { OutcomeEvaluator } from '@sdk-ai-agents/core';

const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const run = await rollOnTheBench(prediction.test); // your measurement
    if (!run) return { verdict: 'inconclusive', reason: 'the bench is busy' };
    const refuted = Math.abs(run.seconds - run.expectedSeconds) / run.expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: run,
      summary: `${run.material} ball: ${run.seconds} s`,
      metrics: { seconds: run.seconds },
      ...(refuted ? { causeCandidates: ['material deforms', 'surface grip'] } : {}),
    };
  },
};

const agent = sdk.createCognitiveAgent({ name: 'physicist', model: 'gpt-4o', evaluator: bench });
```

Mit einem Evaluator wird `test_prediction` verfügbar. Die Operation ruft **Ihren Evaluator auf, nicht das Sprachmodell**, zeichnet den vollständigen Bericht als Ereignis `cognition.evaluated` auf und fügt das Beobachtete als Beobachtung vom Typ `evaluation` hinzu, die auf dieses Ereignis verweist.

| Urteil | Wirkung |
| --- | --- |
| `confirmed` | Die Beobachtung wird den `evidenceRefs` der Hypothese hinzugefügt |
| `refuted` | Der Falsifikator wurde beobachtet: Die Hypothese wird **verworfen**, die Beobachtung als Gegenbeleg aufbewahrt und die Widerlegung als aufgelöster Widerspruch `refuted_prediction` protokolliert |
| `inconclusive` | Aufgezeichnet; was dabei beobachtet wurde, falls überhaupt etwas, ist ein neuer Beleg; sonst ändert sich nichts |

Jeder Test verbraucht einen der `limits.maxPredictionTests`. Ein Evaluator, der eine Ausnahme wirft oder einen ungültigen Bericht liefert, ergibt `inconclusive`, ebenso ein `refuted`-Bericht, der nicht sagt, was beobachtet wurde – eine fehlgeschlagene Messung widerlegt nie etwas. Verwenden Sie kein Modell, das sein eigenes Denken beurteilt, als Evaluator: Selbstkritik kann einen Test vorbereiten, aber keinen ersetzen.

## Überarbeitung {#revision}

Wenn Belege einer Hypothese widersprechen, verlangt `revise` eine **Variante**: eine neue Hypothese mit `parentId`, einem engeren `scope` oder einer zusätzlichen Variablen, und dem Unterschied (`difference`), den sie macht – eine Variante, die ihren Unterschied nicht angibt, wird abgelehnt. Das Original behält seine Kennung, seinen Verwerfungsgrund und sein Gegenbeispiel; die Neuformulierung einer bereits betrachteten Hypothese, ob verworfen oder nicht, wird abgelehnt. Im Test mit der schiefen Ebene wird die widerlegte Regel *„die Rollzeit hängt nicht von der Kugel ab“* zu *„bei starren Kugeln hängt die Rollzeit nicht von der Masse ab“*, was ein zweiter Test bestätigt.

## Belege sind keine Präferenzen {#evidence-is-not-preference}

| Wert | Frage | Wer sieht das Denkerprofil? |
| --- | --- | --- |
| `support` | Wie gut stützen Beobachtungen, Fakten, Vorhersagen und Kritiken sie? | Jev: niemand – die Belegfragen werden ohne das Profil gesendet. LLM: Das Modell wird angewiesen, Präferenzen zu ignorieren |
| `preferenceFit` | Wie gut passt dieser Vorschlag zum Denker? (nur Vorschläge) | Ja, genau dafür ist er da |

Der Code mischt die beiden Werte nie. Regeln und Erklärungen werden allein nach `support` eingeordnet; Vorschläge nach `(1 − w) · support + w · preferenceFit`, mit `w = limits.preferenceWeight` (standardmäßig 0,4). Eine Änderung des Profils kann daher ändern, **welche Aktion gewählt wird** und ob eine Wahl, die der Denker klar bevorzugt, auf Grundlage plausibler Belege verbindlich werden kann (siehe [die Abschlussprüfung](#the-conclusion-guard)); mit Jev kann sie nicht ändern, **wie glaubwürdig eine Aussage ist**, und mit einem LLM als Richter beruht diese Trennung auf seinen Anweisungen. Die `confidence` des Zustands folgt der Evidenzstützung der am höchsten eingeordneten Hypothese: Die `confidence`, die ein Modell in einen Gedanken schreibt, wird ignoriert.

`support` ist eine Beurteilung durch ein Modell, keine kalibrierte Wahrscheinlichkeit. Gemessen wird die Bilanz: welche Vorhersagen bestätigt oder widerlegt wurden.

## Veraltete Bewertungen {#stale-assessments}

Der Zustand führt einen Zähler `evidenceRevision`. Er steigt, wenn eine neue Beobachtung (kein Duplikat), ein neuer Fakt, eine Revision eines Fakts, ein Widerspruch, ein Gegenbeispiel oder ein eindeutiges Testergebnis hinzukommt. Bewertungen, die davor vorgenommen wurden, sind **veraltet**: `compare` wird erneut angeboten, und eine veraltete Hypothese kann nicht verbindlich werden. Ein Vergleich muss **jede** Hypothese im Spiel neu bewerten – das Modell wird gebeten, einen Vergleich zu reparieren, der eine Hypothese auslässt, und einer, der danach immer noch eine Hypothese auslässt oder fehlschlägt, zählt nicht als erledigt.

## Widersprüche und Revisionen von Fakten {#contradictions-and-fact-revisions}

Widersprüche tragen eine Kategorie (`category`): `source_disagreement`, `temporal_change`, `context_difference`, `logical_incompatibility` oder `refuted_prediction`. Ein Widerspruch wird **einmal** aufgelöst, und nur dann, wenn die Auflösung **Beobachtungen oder Fakten anführt**, die ihn klären (`basisRefs` – andere Verweise werden gemeldet und ignoriert); sie kann angeben, was getan wurde (`retracted`, `restricted`, `replaced` oder standardmäßig `explained`). Die Auflösung wird beim Widerspruch aufbewahrt. Fakten werden nie gelöscht: Sie werden zurückgezogen (`retracted`) oder durch einen Ersatz abgelöst (`superseded`), mit Begründung.

## Die Abschlussprüfung {#the-conclusion-guard}

Eine Antwort darf nur dann **verbindlich** werden, wenn ihre Hypothese:

- kritisiert wurde;
- seit der letzten Änderung der Belege bewertet wurde;
- von keinem ungelösten Widerspruch betroffen ist (einer, der nichts benennt, betrifft alles);
- keine ungetestete Vorhersage hat, solange das Testbudget es erlaubt, sie zu testen;
- eine Evidenzstützung `support` von mindestens `limits.decisionThreshold` hat – oder, bei einem **Vorschlag** (einer Handlungswahl), klar die Wahl des Denkers ist (`preferenceFit` von mindestens `limits.decisionThreshold`), während ihre Evidenzstützung `limits.minProposalSupport` erreicht (standardmäßig 0,35).

Den zweiten Weg gibt es, weil eine Frage wie *„Würden Sie diese Stelle annehmen?“* wenig Belege zum Abwägen bietet: Eine Person entscheidet sie nach ihren Prioritäten, sofern die Fakten nicht gegen die Wahl sprechen, das heißt, sofern ihre Evidenzstützung auf oder über der Untergrenze bleibt. Regeln und Erklärungen nehmen ihn nie: Präferenzen machen eine Aussage nie wahr. [Wie eine bestimmte Person denken](./thinker-profiles#how-a-choice-is-ranked-and-committed) rechnet ein Beispiel mit Zahlen durch. `minProposalSupport` darf `decisionThreshold` nicht übersteigen; setzen Sie es gleich `decisionThreshold`, um diesen Weg abzuschalten.

`decide` wird nur angeboten, wenn eine Hypothese die Prüfung besteht. Eine Entscheidung, die eine andere oder gar keine Hypothese auswählt, wird **aufgeschoben**, solange das Budget reicht; ein Aufschub zählt als gescheiterter Versuch, und `decide` wird nach zweien in Folge nicht mehr angeboten. Beim letzten Schritt, oder wenn nichts anderes mehr möglich ist, verlangt die Engine trotzdem eine Entscheidung und legt sie fest:

| `decision.status` | Wann | `decision.missing` |
| --- | --- | --- |
| `committed` | Die Bereitschaftsprüfung ist bestanden | `[]` |
| `provisional` | Das Budget ist bei einer noch lebenden Hypothese aufgebraucht | Was noch nicht gesichert ist |
| `abstain` | Keine Hypothese ist ausgewählt, die ausgewählte wurde verworfen, oder das Modell konnte überhaupt keine Entscheidung liefern | Warum – eine Enthaltung hat die Konfidenz 0, und ihre Antwort wird von der Engine geschrieben (was das Modell geschrieben hat, bleibt in `rationale` erhalten) |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

Der Status des Laufs bleibt `completed`: Eine ausdrückliche Enthaltung ist ein gültiges Ergebnis. Die Konfidenz einer Entscheidung ist auf die Evidenzstützung ihrer Hypothese begrenzt.

## Ein Budget, das nicht verschwendet wird {#a-budget-that-is-not-wasted}

Ein Schritt, der nichts von dem geändert hat, was er ändern sollte – keine neue Hypothese (alle Vorschläge abgelehnt), nichts neu simuliert oder kritisiert, kein Vergleich aufgezeichnet –, ein Vergleich, der eine Hypothese auslässt, und eine aufgeschobene Entscheidung zählen alle als gescheiterte Versuche ihrer Operation. Wenn `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `compare` oder `decide` zweimal in Folge gescheitert ist, wird die Operation nicht mehr angeboten, **bis ein anderer Schritt neue Belege bringt** – ein erfolgreicher Schritt oder ein Tool- oder Testergebnis, das die Engine aufgezeichnet hat; was scheiternde Schritte selbst geschrieben haben, zählt nicht –, sodass der Lauf vorankommt, statt sich zu wiederholen. `seek_information` arbeitet stattdessen pro offener Frage: Eine Frage, die kein verfügbares Tool beantworten kann, wird sofort fallen gelassen (mit Begründung), und ein fehlschlagender Tool-Aufruf zählt zu den zwei Versuchen, die jede Frage erhält, sodass die anderen Fragen trotzdem an die Reihe kommen. `test_prediction` wird durch sein Testbudget begrenzt.

`limits.maxConsecutiveFailures` zählt Fehlschläge des Modells oder seiner Tools, einschließlich eines Vergleichs, der nach der Reparatur immer noch eine Hypothese auslässt. Aufgeschobene Entscheidungen und Schritte, die nichts geändert haben, werden als gescheiterte Schritte aufgezeichnet, zählen aber nie dazu. Komponenten (Gedankengenerator, Assessor, Evaluator) erhalten eine Kopie des Zustands: Sie können nicht verändern, was aufgezeichnet ist, und ein ungültiger Gedanke aus einer eigenen Komponente wird als fehlgeschlagene Operation aufgezeichnet, statt den Lauf anzuhalten.

## Die Tests sind Ihre Spezifikation {#tests-are-your-specification}

`src/__tests__/rule-discovery.test.ts` führt den gesamten Kreislauf mit einem skriptgesteuerten Modell und einem deterministischen Physik-Prüfstand aus – induzieren, vorhersagen, widerlegt werden, überarbeiten, verifizieren, festlegen – und prüft jedes Ereignis. `src/__tests__/epistemic-state.test.ts`, `epistemic-guards.test.ts` und `epistemic-liveness.test.ts` prüfen jede der obigen Regeln einzeln, und ein von der vorherigen Version aufgezeichneter Trace prüft, dass ältere Läufe unverändert rekonstruiert werden.

## Ältere Läufe {#older-runs}

Läufe zeichnen die Version dieser Regeln auf (`schemaVersion: 2` in `cognition.started`). Vorher aufgezeichnete Läufe haben keine Version: `getMentalState` rekonstruiert sie mit ihren ursprünglichen Regeln, und ihre neuen Sammlungen sind leer.

## Noch nicht so weit {#not-there-yet}

- **Semantisches Gedächtnis.** Das [Gedächtnis über Läufe hinweg](./memory) ruft per Wortabgleich ab, was frühere Tests festgestellt haben; verwandte Regeln mit anderem Wortlaut können übersehen werden.
- **Gezieltes Veralten.** Neue Belege lassen jede Bewertung veralten, nicht nur die betroffenen – konservativ und einfach zu prüfen.
- **Wählen, was erkundet wird.** Controller wählen eine Operation; das Ziel (welche Unbekannte, welche Vorhersage) ist das erste in Frage kommende.
- **Kalibrierung.** Es gibt noch keine kalibrierte Vorhersagekonfidenz: `support` ist eine Beurteilung, und gemessen wird die Bilanz der Vorhersagen.
- **Verifizierte Schlussweise.** Die Bezeichnung der Schlussweise (Induktion, Abduktion, Deduktion) wird angegeben, nicht von einem formalen Verifizierer geprüft.
- **Angegebene Arten.** Ob eine Hypothese eine Aussage oder eine Handlungswahl ist, gibt das Modell an, wenn es sie vorschlägt, und eine Hypothese ohne Art ist ein Vorschlag. Der Prompt verbietet, eine Aussage über die Welt als Vorschlag zu bezeichnen, aber nichts prüft das: Eine falsch gekennzeichnete Aussage könnte aufgrund der Präferenz des Denkers verbindlich werden.
- **Die Ursachen hinter einer Wahl testen.** Wenn das Ziel fragt, was zu tun ist, sind die Hypothesen Handlungsoptionen, und nur Regeln und Erklärungen erhalten Vorhersagen, sodass der Ergebnis-Evaluator bei solchen Zielen nicht verwendet wird.
- **Strukturierte Prüfungen.** Randbedingungen sind Freitext und werden von der Abschlussprüfung nicht geprüft; Konflikte werden nicht durch Regeln auf strukturierten Daten erkannt; eine Auflösungsaktion ändert Fakten oder Hypothesen nicht von selbst.
