---
layout: home

hero:
  name: SDK AI Agents
  text: Kontrollierte Agenten, die denken, bevor sie handeln
  tagline: Explizites Schlussfolgern mit einem mentalen Zustand, den Sie einsehen können, typisierte Entscheidungen mit Jev, MCP-Konnektoren – auf der Grundlage von Event Sourcing, Replay, Kosten, Wiederholungsversuchen und Incident-Benachrichtigungen.
  image:
    src: /images/reasoning-loop.svg
    alt: Der kognitive Kreislauf um einen expliziten mentalen Zustand
  actions:
    - theme: brand
      text: Loslegen
      link: /de/guide/getting-started
    - theme: alt
      text: Wie Agenten denken
      link: /de/guide/cognitive-agents
    - theme: alt
      text: Auf GitHub ansehen
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: Schlussfolgern, nicht nur Prompten
    details: Darstellen, Beobachtungen vergleichen, Hypothesen bilden, simulieren, testen, überarbeiten, kritisieren, Informationen suchen, vergleichen, entscheiden. Jeder Schritt ist eine Operation auf einem expliziten mentalen Zustand, von einem Controller ausgewählt und als Ereignis aufgezeichnet.
    link: /de/guide/cognitive-agents
    linkText: Der kognitive Kreislauf
  - icon: 🔬
    title: Glaubt, was es begründen kann
    details: Beobachtungen behalten ihre Herkunft, Regeln kommen mit falsifizierbaren Vorhersagen, Ihr eigener Evaluator testet sie, widerlegte Regeln werden überarbeitet – und eine Antwort wird nur verbindlich, wenn sie eine im Code geschriebene Prüfung besteht.
    link: /de/guide/evidence-and-verification
    linkText: Belege & Verifikation
  - icon: 🪞
    title: Denkt wie eine bestimmte Person
    details: Ja, es kann nachahmen, wie jemand denkt. Erklären Sie einige Themen in Ihren eigenen Worten, und es destilliert daraus Ihre Aufmerksamkeitsreihenfolge, Ihre Prioritäten und Reflexe zu einem Profil, das in die Anweisungen jedes Denkschritts geschrieben wird. Jede Korrektur wird hinzugefügt, und Ihre Zustimmung zeigt, wie nah es herankommt.
    link: /de/guide/thinker-profiles
    linkText: Wie eine bestimmte Person denken
  - icon: 🧭
    title: Ein Forscher, der auf Kurs bleibt
    details: Geben Sie ihm ein Objekt, das er verstehen und mit den Mitteln von heute neu entwerfen soll. Er durchsucht Ihre Quellen, unterscheidet belegte Fakten von Hypothesen und Neuheiten und schlägt die Experimente vor, die entscheiden würden – mit einer eingefrorenen Charta und einem Wächter, die ihn beim Ziel halten.
    link: /de/guide/studies
    linkText: Studien
  - icon: 🎯
    title: Typisierte Entscheidungen mit Jev
    details: Übergeben Sie beliebigen Kontext, stellen Sie Ja/Nein-, Einfach- oder Mehrfachauswahl- und Bewertungsfragen, und erhalten Sie kalibrierte Wahrscheinlichkeiten, auf die Ihr Code reagieren kann.
    link: /de/guide/typed-decisions
    linkText: Mit Zuversicht entscheiden
  - icon: 🔌
    title: Ein MCP-Server für alles
    details: Machen Sie aus einer Web-API, einem Dokumentenordner, einer schreibgeschützten Datenbank oder einem Agenten mit einer Zeile einen MCP-Server, kontrolliert und nachverfolgt, und geben Sie Ihren Agenten die Tools jedes beliebigen MCP-Servers.
    link: /de/guide/mcp
    linkText: Ihre Systeme anbinden
  - icon: 🛡️
    title: Governance by Design
    details: Das Modell schlägt vor, die Engine entscheidet. Richtlinien, Allowlists, Budgets und menschliche Freigaben werden vor jeder Aktion geprüft.
    link: /de/guide/governed-agents
    linkText: Kontrollierte Agenten
  - icon: 🎞️
    title: Alles ist ein Ereignis
    details: Spielen Sie Läufe erneut ab, ohne das LLM aufzurufen, rekonstruieren Sie den mentalen Zustand jedes Laufs, vergleichen Sie Läufe und machen Sie daraus Golden Tests.
    link: /de/guide/observability
    linkText: Nachvollziehbarkeit & Replay
  - icon: 💸
    title: Kosten, die Sie sehen
    details: Der Token-Verbrauch jedes LLM-Aufrufs und jeder typisierten Entscheidung wird aufgezeichnet und pro Lauf und pro Modell bepreist.
    link: /de/guide/costs
    linkText: API-Kosten
  - icon: 🔁
    title: Wiederholungen, die sich nicht stapeln
    details: Eine Wiederholungsrichtlinie pro Anbieter vor dem Failover, Wiederholungen für idempotente Tools, und jeder Wiederholungsversuch steht im Trace.
    link: /de/guide/resilience
    linkText: Wiederholungen & Fallback
  - icon: 🚨
    title: Incidents, die Sie erreichen
    details: Fehlgeschlagene Läufe, blockierte Aktionen und Failover zwischen Anbietern werden zu Incidents mit ihrem zeitlichen Verlauf, versendet per E-Mail oder Webhook.
    link: /de/guide/incidents
    linkText: Incident-Benachrichtigungen
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## Von einem Prompt zu einer Entscheidung, die Sie prüfen können {#from-a-prompt-to-a-decision-you-can-audit}

Ein klassischer LLM-Aufruf geht direkt von der Frage zur Antwort. Ein kognitiver Agent baut ein explizites Bild des Problems auf, erkundet mehrere Optionen, setzt sie unter Druck, prüft Fakten mit kontrollierten Tools und legt sich erst dann fest – und Sie können jeden Schritt hinterher nachlesen.

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![Ein mentaler Zustand, rekonstruiert aus dem Ereignisprotokoll](/images/mental-state.svg){.illustration}

## Ein SDK, alle Schichten {#one-sdk-every-layer}

![Architektur des SDK](/images/architecture.svg){.illustration}

| Sie brauchen | Eine reine LLM-API | SDK AI Agents |
| --- | --- | --- |
| Nachdenken vor dem Antworten | Generierung in einem Durchgang | Hypothesen, Simulation und Kritik auf einem expliziten Zustand |
| Wie eine bestimmte Person denken | Ein langer System-Prompt | Ein versioniertes Denkerprofil, verfeinert durch Feedback |
| Forschung, die beim Ziel bleibt | Ein Chat, der abdriftet, je mehr sich die Anweisungen häufen | Eine Studie: eingefrorene Charta, bei jedem Aufruf neu gebaute Prompts, ein Wächter, anhand der Quellen geprüfte Behauptungen |
| Schnelle, kalibrierte Entscheidungen | Freitext parsen | Typisierte Antworten mit Wahrscheinlichkeiten und Konfidenz (Jev) |
| Unternehmens-Tools anbinden | Eigener Verbindungscode pro Tool | MCP-Server und -Client, kontrolliert durch Richtlinien |
| Wissen, was passiert ist | Logs, falls vorhanden | Ereignisprotokoll, Replay, Rekonstruktion des mentalen Zustands |
| Risiko und Ausgaben kontrollieren | Hoffnung | Richtlinien, Freigaben, Budgets, Kosten pro Lauf, Incident-Benachrichtigungen |

</div>
