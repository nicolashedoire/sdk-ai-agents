# Coûts d'API

Le SDK enregistre la consommation de tokens de chaque appel à un modèle **dans l'exécution qui l'a effectué** — sélection d'outil, pensées cognitives et décisions typées — et la chiffre par modèle. Un appel est compté dès que l'éditeur y a répondu, même si le SDK fait ensuite échouer l'étape à cause de cette réponse (voir [Appels qui échouent](#failed-calls)).

```ts
const cost = await sdk.getRunCost(runId);
```

```json
{
  "runId": "run_7f3…",
  "currency": "USD",
  "totalUsd": 0.01842,
  "complete": true,
  "unpricedModels": [],
  "unpricedCalls": 0,
  "unmeteredCalls": 0,
  "unmeteredModels": [],
  "lines": [
    { "model": "gpt-4o", "source": "llm", "calls": 9, "inputTokens": 14210, "outputTokens": 2310, "costUsd": 0.0186 },
    { "model": "jev-1.13.0", "source": "decision", "calls": 7, "inputTokens": 5880, "outputTokens": 140, "costUsd": 0.00025 }
  ]
}
```

## Tarifs {#prices}

Les tarifs des LLM changent souvent et dépendent de votre contrat : ils relèvent donc de la **configuration, pas du code**. Seuls les tarifs vérifiés dans la documentation des fournisseurs sont fournis par défaut — aujourd'hui, celui de Jev (0,042 $ par million de tokens en entrée, sortie gratuite, vérifié le 2026-09-23), à la fois sous ses identifiants TypeSafe (`jev-*`) et via Vercel AI Gateway (`typesafe-ai/jev`).

```ts
const sdk = createSDK({
  apiKey,
  pricing: {
    // Illustrative values: use your provider's current prices or your contract.
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
});
```

Les clés sont des identifiants de modèle exacts ou des préfixes terminés par `*`. Les fournisseurs répondent souvent avec un identifiant versionné (`gpt-4o-2024-08-06`) alors que vous avez demandé `gpt-4o` : le SDK enregistre les deux et cherche d'abord l'identifiant renvoyé, puis le nom demandé — les clés exactes avant les préfixes, le préfixe le plus long l'emportant. Soyez prudent avec les préfixes : `gpt-4o*` correspond aussi à `gpt-4o-mini`, sauf si `gpt-4o-mini*` existe. Chaque appel est chiffré sur ses propres noms, y compris une réponse qu'un fournisseur a écartée : les appels d'un modèle demandé sous un autre nom, ou sous aucun, ont leur propre ligne.

## Coûts inconnus {#unknown-costs}

Le SDK n'invente jamais un tarif, ni un nombre de tokens. Le coût d'un appel est inconnu dans deux cas, et le rapport le dit :

- **son modèle n'a pas de tarif** : ses appels et ses tokens sont tout de même comptabilisés, le modèle est listé dans `unpricedModels`, ces appels dans `unpricedCalls`, et sa ligne n'a pas de `costUsd` ;
- **il n'a rapporté aucun nombre de tokens** — ni en entrée ni en sortie, comme avec un fournisseur qui ne renvoie pas de consommation, ou seulement un total : il est compté dans `unmeteredCalls` (et dans le `unmeteredCalls` de sa ligne), et son modèle dans `unmeteredModels`. Il n'est jamais pris pour zéro token, et une ligne dont aucun appel ne les a rapportés n'a pas de `costUsd` non plus.

Un appel sans nombre de tokens est compté comme non mesuré même si son modèle a un tarif, comme le font les budgets. Dès que le coût d'un appel est inconnu, le rapport est marqué `complete: false` et `totalUsd` n'additionne que les appels dont le coût est connu : c'est un minimum, pas le coût de l'exécution.

Les tokens d'un appel sont ses tokens en entrée et en sortie, quel que soit le total que l'éditeur donne aussi, sinon le total qu'il a rapporté seul : un tel total compte comme des tokens (dans le `totalOnlyTokens` de la ligne, dans les budgets et dans le `maxTokens` d'une exécution), jamais comme un coût.

## Appels qui échouent {#failed-calls}

Un appel auquel l'éditeur a répondu est facturé, quoi que le SDK fasse ensuite de la réponse. Il est enregistré et comptabilisé — dans les événements de l'exécution, dans `getRunCost`, dans les budgets par période et dans le `maxTokens` de l'exécution — même quand l'étape échoue à cause de lui :

- l'appel d'outil d'un agent gouverné dont les arguments ne sont pas du JSON valide : `intention.generated` est enregistré avant la lecture de la réponse ;
- une pensée cognitive dont la réponse échoue à la validation, réparations comprises, et une opération que `stop()` ou le délai de l'exécution interrompt après des tentatives facturées (`cognition.operation_failed` avec leur `usage`, et `decision.evaluated` pour les requêtes de décision typée qui ont déjà reçu leur réponse) ;
- une décision typée dont la réponse ne correspond pas à ses questions (un choix qui ne fait pas partie des options, une réponse manquante ou du mauvais type) : `decision.evaluated` avec son `error` et des `answers` vides, puis `sdk.decisions` lève l'erreur, et un agent cognitif se replie comme avant ;
- une réponse qu'un fournisseur écarte : une réponse OpenAI sans aucun choix, qui fait échouer l'appel ou passer la main à un fournisseur de repli (`provider.answer_discarded`, dans les exécutions gouvernées comme dans les pensées cognitives, au tarif du modèle qui l'a donnée).

Une tentative qui a échoué sans réponse — une erreur HTTP, un délai dépassé, une connexion perdue, ce que gèrent les nouvelles tentatives et les basculements — ne rapporte aucune consommation et n'est pas comptée. Une réponse totalement inutilisable (écartée, ou qui n'est pas un corps de décision valide) n'est comptée que si l'éditeur a rapporté sa consommation. Une réponse qui arrive juste au moment où l'exécution est annulée est écartée par le fournisseur sans sa consommation, et n'est pas comptée non plus.

## D'où vient la consommation {#where-usage-comes-from}

| Événement | Source | Champs |
| --- | --- | --- |
| `intention.generated` | Raisonnement natif, sélection d'outil | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | Une réponse que le fournisseur n'a pas pu utiliser | `provider`, `model`, `requestedModel`, `usage` |
| `cognition.thought` | Opérations cognitives, réparations et tentatives échouées comprises | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls`, `usage.totalOnlyTokens` |
| `cognition.operation_failed` | Une opération interrompue par un arrêt ou un délai dépassé après des tentatives facturées | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev et les autres backends de décisions typées, réponses rejetées comprises | `model`, `usage.inputTokens`, `usage.outputTokens` |

La réponse finale d'une exécution cognitive est elle aussi enregistrée comme un événement `intention.generated` (`source: 'cognition'`) : ce n'est pas un appel au modèle, et elle n'est pas comptée.

Comme la consommation est stockée dans les événements, vous pouvez aussi calculer les coûts vous-même avec `computeRunCost(runId, events, pricing)`, les agréger par agent ou par jour, ou les transmettre à votre facturation.

## Budgets {#budgets}

Le coût n'est qu'un aspect ; les politiques peuvent aussi plafonner les **étapes, les tokens et les appels d'outils** par agent, par outil et par période — voir [Agents gouvernés](./governed-agents). Un `budgetLimit` avec `maxCost` refuse les appels d'outils d'un agent dès que ses appels au modèle ont coûté plus que le plafond sur la période, aux tarifs ci-dessus, et aussi l'étape suivante d'un agent cognitif (voir [Limites et politiques](./cognitive-agents#limits-and-policies)) : un appel au modèle déjà lancé n'est jamais interrompu, et avec `toolName` seul cet outil est refusé. Si un modèle n'a pas de tarif, ou si un appel ne rapporte pas ses tokens, le plafond ne peut pas être vérifié et ces appels d'outils et ces étapes sont refusés. Un `maxCost` qui n'est pas un nombre fini ≥ 0 (une chaîne comme `'0.5'` lue dans un fichier de configuration, `NaN`, un montant négatif, `Infinity`, `null`) est refusé dès que la politique est appliquée, avec une `ValidationError`.

Les budgets comptent les appels au modèle que lit `getRunCost`, comme il les lit — [appels qui échouent](#failed-calls) compris, et un appel sans décompte de tokens comme un appel dont le coût est inconnu : les étapes de raisonnement d'un agent gouverné ; les pensées d'un agent cognitif (réparations et tentatives échouées comprises), ses sélections d'outil, ses décisions typées et ses opérations interrompues après des tentatives facturées ; dans les deux cas, les réponses que le fournisseur n'a pas pu utiliser ; et les décisions typées prises avec `sdk.decisions`, réponses rejetées comprises. Un plafond avec `agentId` compte les appels au modèle de cet agent — et les appels de `sdk.decisions` qui le nomment avec `agentId` ; sans `agentId`, il les compte tous, y compris les décisions typées prises sans agent. Un budget ne refuse jamais un appel de `sdk.decisions` : il refuse des appels d'outils et les étapes des agents cognitifs.
