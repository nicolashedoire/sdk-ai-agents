---
layout: home

hero:
  name: SDK AI Agents
  text: Des agents gouvernés qui réfléchissent avant d'agir
  tagline: Un raisonnement explicite fondé sur un état mental que vous pouvez inspecter, des décisions typées avec Jev, des connecteurs MCP — le tout reposant sur l'event sourcing, le rejeu, le suivi des coûts, les nouvelles tentatives et les alertes d'incident.
  image:
    src: /images/reasoning-loop.svg
    alt: La boucle cognitive autour d'un état mental explicite
  actions:
    - theme: brand
      text: Commencer
      link: /fr/guide/getting-started
    - theme: alt
      text: Comment les agents réfléchissent
      link: /fr/guide/cognitive-agents
    - theme: alt
      text: Voir sur GitHub
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: Du raisonnement, pas seulement des prompts
    details: Représenter, comparer des observations, formuler des hypothèses, simuler, tester, réviser, critiquer, chercher de l'information, comparer, décider. Chaque étape est une opération sur un état mental explicite, choisie par un contrôleur et enregistrée comme un événement.
    link: /fr/guide/cognitive-agents
    linkText: La boucle cognitive
  - icon: 🔬
    title: Il croit ce qu'il peut justifier
    details: Les observations gardent leur provenance, les règles s'accompagnent de prédictions réfutables, votre propre évaluateur les teste, les règles réfutées sont révisées — et une réponse n'est retenue comme ferme que si elle passe un garde-fou écrit en code.
    link: /fr/guide/evidence-and-verification
    linkText: Preuves et vérification
  - icon: 🪞
    title: Il raisonne comme une personne donnée
    details: "Oui, il peut imiter la façon dont quelqu'un raisonne. Expliquez quelques sujets avec vos propres mots : il en distille votre ordre d'attention, vos priorités et vos réflexes dans un profil inscrit dans les instructions de chaque étape de raisonnement. Chaque correction y est ajoutée, et votre degré d'accord montre à quel point il s'en approche."
    link: /fr/guide/thinker-profiles
    linkText: Raisonner comme une personne donnée
  - icon: 🧭
    title: Un chercheur qui garde le cap
    details: Donnez-lui un objet à comprendre et à repenser avec les moyens d'aujourd'hui. Il cherche dans vos sources, distingue les faits établis des hypothèses et des nouveautés, et propose les expériences qui permettraient de trancher — avec une charte figée et un gardien qui le maintiennent sur son objectif.
    link: /fr/guide/studies
    linkText: Études
  - icon: 🎯
    title: Des décisions typées avec Jev
    details: Injectez n'importe quel contexte, posez des questions oui/non, à choix unique, à choix multiple ou de notation, et obtenez des probabilités calibrées sur lesquelles votre code peut agir.
    link: /fr/guide/typed-decisions
    linkText: Décider en confiance
  - icon: 🔌
    title: Un serveur MCP pour tout
    details: Transformez en une ligne une API web, un dossier de documents, une base de données en lecture seule ou un agent en serveur MCP, gouverné et tracé, et donnez à vos agents les outils de n'importe quel serveur MCP.
    link: /fr/guide/mcp
    linkText: Connecter vos systèmes
  - icon: 🛡️
    title: La gouvernance dès la conception
    details: Le modèle propose, le moteur dispose. Politiques, listes d'autorisation, budgets et approbations humaines sont vérifiés avant chaque action.
    link: /fr/guide/governed-agents
    linkText: Agents gouvernés
  - icon: 🎞️
    title: Tout est événement
    details: Rejouez des exécutions sans appeler le LLM, reconstruisez l'état mental de n'importe quelle exécution, comparez des exécutions et transformez-les en tests de référence.
    link: /fr/guide/observability
    linkText: Traçabilité et rejeu
  - icon: 💸
    title: Des coûts visibles
    details: La consommation de tokens de chaque appel au LLM et de chaque décision typée est enregistrée et chiffrée par exécution et par modèle.
    link: /fr/guide/costs
    linkText: Coûts d'API
  - icon: 🔁
    title: Des nouvelles tentatives qui ne s'empilent pas
    details: Une seule politique de nouvelles tentatives par fournisseur avant le basculement, des nouvelles tentatives pour les outils idempotents, et chaque nouvelle tentative inscrite dans la trace.
    link: /fr/guide/resilience
    linkText: Nouvelles tentatives et repli
  - icon: 🚨
    title: Des incidents qui vous parviennent
    details: Les exécutions en échec, les actions bloquées et les basculements de fournisseur deviennent des incidents accompagnés de leur chronologie, envoyés par e-mail ou par webhook.
    link: /fr/guide/incidents
    linkText: Alertes d'incident
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## Du prompt à une décision que vous pouvez auditer {#from-a-prompt-to-a-decision-you-can-audit}

Un appel classique à un LLM va directement de la question à la réponse. Un agent cognitif construit une représentation explicite du problème, explore plusieurs options, les met à l'épreuve, vérifie les faits avec des outils gouvernés et ne s'engage qu'ensuite — et vous pouvez relire chaque étape après coup.

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

![Un état mental reconstruit à partir du journal d'événements](/images/mental-state.svg){.illustration}

## Un seul SDK, toutes les couches {#one-sdk-every-layer}

![Architecture du SDK](/images/architecture.svg){.illustration}

| Votre besoin | Une API de LLM brute | SDK AI Agents |
| --- | --- | --- |
| Raisonner avant de répondre | Une génération en un seul passage | Hypothèses, simulation et critique sur un état explicite |
| Raisonner comme une personne donnée | Un long prompt système | Un profil de penseur versionné, affiné par les retours |
| Une recherche qui reste sur son objectif | Une conversation qui dérive à mesure que les instructions s'empilent | Une étude : charte figée, prompts reconstruits à chaque appel, un gardien, des affirmations vérifiées par rapport aux sources |
| Des décisions rapides et calibrées | Analyser du texte libre | Des réponses typées, avec probabilités et confiance (Jev) |
| Connecter les outils de l'entreprise | Du code d'intégration sur mesure pour chaque outil | Serveur et client MCP, gouvernés par des politiques |
| Savoir ce qui s'est passé | Des journaux, s'il y en a | Journal d'événements, rejeu, reconstruction de l'état mental |
| Maîtriser les risques et les dépenses | L'espoir | Politiques, approbations, budgets, coûts par exécution, alertes d'incident |

</div>
