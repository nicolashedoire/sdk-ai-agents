# Coûts d'API

Le SDK enregistre la consommation de tokens de chaque appel à un modèle **dans l'exécution qui l'a effectué** — sélection d'outil, pensées cognitives et décisions typées — et la chiffre par modèle.

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

Les clés sont des identifiants de modèle exacts ou des préfixes terminés par `*`. Les fournisseurs répondent souvent avec un identifiant versionné (`gpt-4o-2024-08-06`) alors que vous avez demandé `gpt-4o` : le SDK enregistre les deux et cherche d'abord l'identifiant renvoyé, puis le nom demandé — les clés exactes avant les préfixes, le préfixe le plus long l'emportant. Soyez prudent avec les préfixes : `gpt-4o*` correspond aussi à `gpt-4o-mini`, sauf si `gpt-4o-mini*` existe.

Un modèle sans tarif est tout de même comptabilisé (appels et tokens) et listé dans `unpricedModels`, et le rapport est marqué `complete: false` — le SDK n'invente jamais de tarif.

## D'où vient la consommation {#where-usage-comes-from}

| Événement | Source | Champs |
| --- | --- | --- |
| `intention.generated` | Raisonnement natif, sélection d'outil | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | Opérations cognitives, réparations et tentatives échouées comprises | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev et les autres backends de décisions typées | `model`, `usage.inputTokens`, `usage.outputTokens` |

Comme la consommation est stockée dans les événements, vous pouvez aussi calculer les coûts vous-même avec `computeRunCost(runId, events, pricing)`, les agréger par agent ou par jour, ou les transmettre à votre facturation.

## Budgets {#budgets}

Le coût n'est qu'un aspect ; les politiques peuvent aussi plafonner les **étapes, les tokens et les appels d'outils** par agent, par outil et par période — voir [Agents gouvernés](./governed-agents). Les agents cognitifs ont leurs propres limites (`maxSteps`, `maxToolCalls`, `timeoutMs`). Un `budgetLimit` avec `maxCost` refuse les appels d'outils d'un agent gouverné dès que ses appels au modèle ont coûté plus que le plafond sur la période, aux tarifs ci-dessus : un appel au modèle n'est jamais refusé, et avec `toolName` seul cet outil l'est. Si un modèle n'a pas de tarif, ou si un appel ne rapporte pas ses tokens, le plafond ne peut pas être vérifié et les appels d'outils sont refusés. Un `maxCost` qui n'est pas un nombre fini ≥ 0 (une chaîne comme `'0.5'` lue dans un fichier de configuration, `NaN`, un montant négatif, `Infinity`, `null`) est refusé dès que la politique est appliquée, avec une `ValidationError`. Un plafond avec `agentId` compte les appels au modèle de cet agent ; sans `agentId`, il compte ceux de tous les agents gouvernés.
