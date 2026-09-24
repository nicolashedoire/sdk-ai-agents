# Warum dieses SDK

**In einem Satz:** Die meisten Agenten-Frameworks helfen einem Sprachmodell zu **handeln**; dieses SDK bringt es dazu, **zu begründen, was es glaubt**, bevor es zu einem Schluss kommt, und kann es **so denken lassen, wie eine bestimmte Person denkt**.

Diese Seite ist absichtlich ehrlich: Sie sagt, was das SDK tut, das Sie anderswo nicht leicht finden, was andere Frameworks ebenfalls tun und was sie besser machen. Der Vergleich stützt sich auf die Dokumentation weit verbreiteter Frameworks mit Stand Mitte 2026 (LangChain und LangGraph, das OpenAI Agents SDK, das Vercel AI SDK, CrewAI, AutoGen und sein Nachfolger Microsoft Agent Framework, Mastra, DSPy); sie entwickeln sich schnell weiter, prüfen Sie also ihre aktuelle Dokumentation, bevor Sie sich entscheiden.

## Was es anders macht {#what-it-does-differently}

### 1. Denkregeln im Code, nicht im Prompt {#_1-reasoning-rules-written-in-code-not-in-the-prompt}

Bei einem üblichen Agenten ist das „Denken“ das, was das Modell schreibt: Wenn es sagt, es sei sich zu 90 % sicher, prüft das niemand, es sei denn, Sie schreiben diese Prüfung. Hier gilt:

- der [mentale Zustand](./cognitive-agents#the-mental-state) (Fakten, Hypothesen, Vorhersagen, Widersprüche) besteht aus typisierten Daten, nicht aus Freitext;
- das Modell kann seine eigene Konfidenz nicht erhöhen: Die Konfidenz einer Entscheidung ist auf die Evidenzstützung der gewählten Option begrenzt, die in einem separaten Vergleichsschritt beurteilt wird (von Jev ohne das Profil des Denkers oder vom Sprachmodell nach Anweisungen);
- eine verworfene Hypothese kann nicht ausgewählt, aktualisiert oder neu formuliert werden; sie kommt nur als Variante zurück, die sagt, was sich geändert hat (eine bloß umformulierte Wiederholung wird nicht erkannt);
- eine Antwort wird nur dann **verbindlich**, wenn sie die [Abschlussprüfung](./evidence-and-verification#the-conclusion-guard) besteht: kritisiert, seit dem letzten neuen Beleg bewertet, kein Widerspruch, der sie betrifft, Vorhersagen getestet, solange das Budget es zulässt, ausreichende Stützung. Andernfalls antwortet der Agent **vorläufig**, mit dem, was fehlt, oder er **enthält sich**.

„Ich kann keinen Schluss ziehen“ ist ein vollwertiges Ergebnis, durchgesetzt durch Code statt in einem Prompt erbeten.

### 2. Die Welt prüft die Vorhersagen, nicht das Modell {#_2-the-world-checks-the-predictions-not-the-model}

Ein verbreitetes Muster besteht darin, ein Modell ein anderes beurteilen zu lassen. Hier gibt der Agent **vor** dem Test an, was er beobachten sollte und was ihn widerlegen würde, und **Ihr Code** entscheidet: eine Messung, ein Simulator, eine Testsuite, eine Abfrage. Eine widerlegte Regel wird verworfen und kann nur als Variante zurückkehren, die ihren Unterschied benennt. Siehe [Vorhersagen und der Ergebnis-Evaluator](./evidence-and-verification#predictions-and-the-outcome-evaluator).

Was die Tests ergeben haben, wird für spätere Läufe im selben Geltungsbereich aufbewahrt: Der nächste Lauf beginnt mit den Regeln, die sich gehalten haben, und kann eine gescheiterte nicht wortgleich neu aufstellen. Gedächtnisprodukte merken sich, was gesagt wurde; dieses [Gedächtnis über Läufe hinweg](./memory) behält nur, was ein Test ergeben hat.

### 3. Belege und Präferenzen bleiben getrennt {#_3-evidence-and-preferences-are-kept-apart}

Was der Denker bevorzugt, kann ändern, **welche Aktion gewählt wird**, und erlauben, dass eine Aktion, die er klar bevorzugt, auf Grundlage plausibler Belege verbindlich wird; im Code macht es eine **Aussage über die Welt** nie glaubwürdiger. Mit Jev wird die Belegfrage sogar ohne das Profil des Denkers gestellt; mit einem Sprachmodell als Richter beruht diese Trennung auf seinen Anweisungen. Siehe [Belege sind keine Präferenzen](./evidence-and-verification#evidence-is-not-preference).

### 4. Denken wie eine bestimmte Person – und das messen {#_4-reasoning-like-a-given-person-and-measuring-it}

Gedächtnisprodukte speichern vor allem Fakten und Präferenzen über einen Nutzer (manche schreiben auch Anweisungen anhand von Feedback um); Prompt-Optimierer wie DSPy stimmen Prompts und Beispiele auf eine Metrik ab. Dieses SDK extrahiert, **wie** eine Person denkt: die Reihenfolge, in der sie ein Problem untersucht, ihre Reflexe, was sie eine Idee verwerfen lässt. Es versioniert dieses [Denkerprofil](./thinker-profiles), schreibt es in jeden Denkschritt, fügt die Korrekturen der Person samt einem Prozentsatz an Zustimmung zu seinen Anweisungen hinzu und exportiert die Entscheidungen des Agenten über den jeweils nächsten Schritt, versehen mit dem Urteil der Person zu jedem Lauf, als Datensatz, um einen kleinen Controller zu trainieren.

### 5. Kalibrierte Entscheidungen im Denkprozess {#_5-calibrated-decisions-inside-the-reasoning}

[Jev](./typed-decisions) beantwortet eng gefasste Fragen mit Wahrscheinlichkeiten, die sein Anbieter kalibriert. Es wählt den nächsten Denkschritt und bewertet die Hypothesen für den Bruchteil eines Cents, und ein deterministischer Controller übernimmt, wenn es unsicher ist.

### 6. Ein Protokoll für Denken und Aktionen {#_6-one-log-for-reasoning-and-actions}

Kontrollierte Tools, Freigaben, Kosten, Wiederholungsversuche und MCP-Aufrufe werden im selben Ereignisprotokoll aufgezeichnet wie jeder Gedanke. Sie können genau rekonstruieren, was der Agent hinter einer Antwort „im Kopf hatte“, auch Monate später, und seine Aktionen erneut abspielen, ohne das Modell aufzurufen.

## Was andere Frameworks ebenfalls tun {#what-other-frameworks-also-do}

- **Kontrollierte Tools und menschliche Freigabe.** Guardrails im OpenAI Agents SDK, Human-in-the-Loop in LangGraph.
- **Persistenz und Replay.** Mit den Checkpoints von LangGraph können Sie fortsetzen, untersuchen und aus früheren Zuständen erneut abspielen oder abzweigen.
- **MCP**, Kostenerfassung und Wiederholungsversuche sind weit verbreitet.

Der Unterschied besteht hier darin, dass sich diese Bausteine ein Ereignisprotokoll mit einem expliziten Denkzustand teilen.

## Was andere Frameworks besser machen {#what-other-frameworks-do-better}

- **Ökosystem.** Hunderte von Integrationen, große Communitys, Beispiele für alles.
- **Reife.** Dieses SDK ist jung, hat einen einzigen Maintainer, ist noch nicht auf npm veröffentlicht und wurde an einer begrenzten Zahl echter Probleme erprobt.
- **Multi-Agenten-Orchestrierung, Streaming und UI-Kits** sind anderswo umfangreicher.
- **Kosten und Latenz.** Eine kognitive Antwort braucht etwa zehn Denkschritte mit jeweils ein oder zwei Modellanfragen (mit gpt-4o und Jev in unseren Versuchen einige Minuten und rund 0,1 USD pro Problem), während eine direkte Antwort einen einzigen Aufruf braucht und ein Agent mit Tools einige wenige.
- **Modellabhängigkeit.** Die Regeln gelten unabhängig vom Modell, die Qualität des Denkens aber nicht: Kleine Modelle befolgen die Methode schlecht, und selbst starke enden bei schwierigen Problemen oft vorläufig oder mit einer Enthaltung.
- **Gedächtnis und Retrieval.** Gedächtnisprodukte und Retrieval-Pipelines bieten semantische Suche über große Sammlungen; das [Gedächtnis über Läufe hinweg](./memory) ruft hier getestete Regeln per Wortabgleich innerhalb eines engen Geltungsbereichs ab.

## Wann Sie es wählen sollten {#when-to-choose-it}

- **Entscheidungen, die Sie begründen oder prüfen lassen müssen**: Forschung, Industrie, interne Governance und Entscheidungsunterstützung in regulierten Bereichen (Gesundheit, Finanzen, Recht), in denen eine Person die Schlussfolgerung und ihre Grundlage überprüft.
- **Wenn „Ich weiß es nicht“ besser ist als eine selbstsichere Erfindung**, und Sie wollen, dass das durchgesetzt wird.
- **Wenn sich eine Aussage überprüfen lässt**: Sie haben eine Messung, einen Simulator oder eine Testsuite, mit der der Agent seine Vorhersagen konfrontieren kann.
- **Ein Denkzwilling**: festhalten, wie ein Experte oder eine Gründerin an Probleme herangeht, und messen, wie nah die Nachahmung herankommt.

Wenn Sie einen schnellen Chatbot, einen großen Katalog fertiger Integrationen oder einen einzigen schnellen Aufruf brauchen, passt ein leichteres Framework besser.
