# Décisions typées (Jev)

Certaines questions n'ont pas besoin de prose. *Est-ce urgent ? Quelle équipe ? Quel niveau de risque ?* Une **décision typée** pose à un modèle une question étroite à propos d'un contexte et renvoie une réponse structurée et calibrée sur laquelle votre code peut agir.

Le SDK intègre [TypeSafe Jev](https://docs.typesafe.ai), le premier modèle « System One », ainsi que tout backend qui expose le même contrat (`POST /v1/systemone`) — y compris des clones open source auto-hébergés.

![Décisions typées](/images/typed-decisions.svg){.illustration}

## Configurer {#configure}

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.TYPESAFE_API_KEY,
    model: 'jev-latest',        // pin 'jev-1.13.0' once you tune thresholds
    // baseUrl: 'http://localhost:8080', // a compatible self-hosted clone (no key needed)
  },
});
```

| Option | Valeur par défaut | |
| --- | --- | --- |
| `apiKey` | — | Une clé TypeSafe pour `api.typesafe.ai`, ou une clé AI Gateway pour la passerelle (voir ci-dessous) ; facultative pour un clone auto-hébergé sans clé |
| `baseUrl` | `https://api.typesafe.ai` | Tout serveur qui expose `POST /v1/systemone` |
| `model` | `jev-latest` | Fixez un identifiant versionné pour figer le comportement |
| `timeoutMs` | `30000` | Par tentative |
| `maxRetries` | `2` | Pour les erreurs 408, 429, 5xx, 529 et les erreurs réseau, en respectant `retry-after` |
| `retryBaseDelayMs` | `500` | Premier délai d'attente, doublé à chaque nouvelle tentative |
| `maxRetryDelayMs` | `30000` | Plafond de chaque attente, `retry-after` compris |
| `fetch` | `fetch` global | Injectez un transport qui passe par un proxy |

### Via Vercel AI Gateway {#through-vercel-ai-gateway}

Jev est aussi servi par [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe) sous le nom `typesafe-ai/jev`, avec une API compatible avec TypeSafe. Utilisez une clé AI Gateway au lieu d'une clé TypeSafe ; les requêtes sont facturées sur votre compte Vercel au même prix (0,042 $ par million de tokens en entrée, sortie gratuite). AI Gateway propose aussi une offre gratuite avec un crédit mensuel pour une partie des modèles : consultez [sa grille tarifaire](https://vercel.com/docs/ai-gateway/pricing) pour savoir si Jev en fait partie.

```ts
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  jev: {
    apiKey: process.env.AI_GATEWAY_API_KEY,
    baseUrl: 'https://ai-gateway.vercel.sh/typesafe',
    model: 'typesafe-ai/jev',
  },
});
```

Rien d'autre ne change : `sdk.decisions`, le contrôleur typé et l'évaluateur d'hypothèses typé fonctionnent de la même façon, et les coûts sont rapportés sous `typesafe-ai/jev`.

Vous pouvez aussi apporter n'importe quel backend qui implémente `TypedDecisionClient`, avec `decisionClient`.

## Injecter votre contexte {#inject-your-context}

Le `context` est ce que le modèle évalue : du texte brut, ou des données structurées — un ticket, un historique de conversation, un enregistrement, l'état de votre application. Désignez ses champs par leur nom, entre accents graves, dans vos questions.

```ts
const ticket = {
  customer: { plan: 'enterprise', since: '2021' },
  messages: ['I was charged twice', 'and the CSV export is broken. Fix this today!'],
};
```

## Choix unique {#single-choice}

```ts
const route = await sdk.decisions.choose({
  context: ticket,
  question: 'Which team should handle `messages`?',
  options: {
    billing: 'Payments, invoices, refunds',
    technical: 'Bugs, outages, integrations',
    sales: 'Pricing, upgrades',
  },
  minConfidence: 0.5,
});
// { choice: 'billing', confidence: 0.81, probabilities: { billing: 0.88, … }, confident: true, runId }
```

`confident` est calculé **dans votre code** à partir de la confiance de la réponse. Quand il vaut `false`, orientez la demande vers un humain ou un modèle plus puissant — c'est le schéma de l'*aiguillage conditionné par la confiance* (*confidence-gated routing*).

## Choix multiple {#multiple-choice}

Plusieurs options peuvent s'appliquer à la fois ? `selectMany` transforme chaque option en sa propre question oui/non, les envoie **en une seule requête**, et applique votre seuil :

```ts
const topics = await sdk.decisions.selectMany({
  context: ticket,
  question: 'Which problems does the customer report?',
  options: ['double charge', 'login issue', 'broken export', 'cancellation'],
  threshold: 0.5,
});
// { selected: ['double charge', 'broken export'], probabilities: { … } }
```

## Oui / non et notations {#yes-no-and-ratings}

```ts
const refund = await sdk.decisions.check({
  context: ticket,
  question: 'Is the customer asking for a refund?',
  criteria: { true: 'Explicitly asks for money back', false: 'No refund requested' },
  threshold: 0.8,
});

const urgency = await sdk.decisions.rate({
  context: ticket,
  question: 'How urgent is this ticket?',
  levels: ['Can wait', 'This week', 'Today'], // lowest first, 2 to 10 levels
});
// { score: 1.82, normalized: 0.91, level: 'Today', confidence: 0.9 }
```

## Plusieurs questions, une seule requête {#many-questions-one-request}

Jev lit le contexte une seule fois et répond à toutes les questions en parallèle. Utilisez `ask` avec les fonctions utilitaires `noul`, `choice` et `score` — les types des réponses sont inférés :

```ts
import { choice, noul, score } from '@sdk-ai-agents/core';

const { answers } = await sdk.decisions.ask({
  context: ticket,
  questions: {
    urgent: noul('Does `messages` convey urgency?'),
    team: choice('Which team should handle it?', { billing: null, technical: null }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Annoyed', 'Angry']),
  },
});
answers.urgent.noul;          // number
answers.team.choice;          // 'billing' | 'technical'
answers.frustration.score;    // number
```

## Au sein des agents cognitifs {#inside-cognitive-agents}

Quand un backend de décisions est configuré, les agents cognitifs l'utilisent automatiquement :

- **contrôleur** — à chaque étape, une requête demande quelle opération disponible vient ensuite (Choice) et si le raisonnement est prêt à décider (Noul) ;
- **comparaison** — `compare` demande le soutien que les preuves apportent à chaque hypothèse dans une requête **sans** le profil du penseur, puis, pour les propositions uniquement, leur adéquation au penseur dans une seconde requête. Les deux scores restent séparés : l'adéquation réordonne les propositions (`limits.preferenceWeight`, 0,4 par défaut) et permet qu'une proposition que le penseur préfère clairement soit retenue comme ferme sur la base de preuves plausibles (`limits.minProposalSupport`), sans jamais toucher à la crédibilité d'une affirmation — voir [Preuves et vérification](./evidence-and-verification#evidence-is-not-preference).

Les deux se replient sur le LLM ou sur le contrôleur heuristique quand Jev n'est pas sûr de lui ou n'est pas disponible.

## Traçabilité et coût {#traceability-and-cost}

Chaque décision typée est inscrite sous forme d'événement `decision.evaluated` avec son contexte, ses questions, ses réponses et sa consommation de tokens — dans le `runId` que vous passez, ou dans un flux `decision_*` dédié. Jev est facturé **0,042 $ par million de tokens en entrée, sortie gratuite** (selon la documentation au 2026-09-23), si bien que `sdk.getRunCost(runId)` l'inclut d'emblée.

Une réponse qui ne correspond pas aux questions (un choix qui ne fait pas partie des options, une réponse manquante ou du mauvais type) a tout de même été facturée : elle est elle aussi enregistrée, avec son `error` et des `answers` vides, avant que l'erreur soit levée. Quand le backend ne rapporte aucun nombre de tokens, l'événement n'a pas de `usage` et le coût de l'appel est indiqué comme inconnu, jamais comme 0 $ — voir [Coûts d'API](./costs#unknown-costs).

## Bonnes pratiques {#good-practice}

Jev lit au pied de la lettre et il est faible en arithmétique, en dénombrement et en comparaison de dates. Gardez les calculs numériques dans le code, posez une seule question élémentaire à la fois, rédigez des critères qui décrivent précisément chaque option, et filtrez le contexte pour n'y garder que ce dont la question a besoin. Voir les [limites connues](https://docs.typesafe.ai/model-jaggedness/jev-1.13) documentées par TypeSafe.
