# Catalogue des événements

Chaque événement a la même enveloppe :

```ts
interface Event {
  id: string;
  runId: string;
  type: EventType;
  timestamp: number;
  data: Record<string, unknown>;
  metadata?: { agentId?: string; agentVersion?: string; profileId?: string; profileVersion?: string; … };
}
```

## Cycle de vie d'une exécution {#run-lifecycle}

| Type | Données |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`, `study` pour l'exécution d'une étude, `study-amendment` pour l'exécution qui classe un amendement, `tool` pour un appel en dehors d'un agent comme un appel MCP, `resource` pour une lecture de ressource MCP, ou absent pour les exécutions gouvernées), `replayOf?` |
| `run.completed` | `output`, `decision?` (exécutions cognitives) |
| `run.failed` | `error`, `steps?`, `uri?` (lecture de ressource en échec) |
| `run.cancelled` / `run.stopped` | `reason` |

## Raisonnement et actions {#reasoning-and-actions}

| Type | Données |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — ou `intention` pour une réponse finale cognitive |
| `policy.checked` | `intention`, `validation` : le verdict du moteur d'action sur un appel d'outil. Le moteur de politiques enregistre aussi un événement par politique qu'il vérifie — `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true` quand la politique s'est appliquée et a refusé) et `reason` — avant un appel d'outil, et avant chaque étape d'une exécution cognitive pour les politiques de budget et de durée qui peuvent s'appliquer à une étape (`intention` est alors `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools` quand un appelant a utilisé un outil qui ne lui avait pas été donné ; l'identifiant de la politique de budget quand son budget d'appels est épuisé), et `step` quand une politique de budget ou de durée a refusé une étape d'une exécution cognitive, ou `passage` un passage d'une étude (son `intention` est alors `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` quand c'est le `metadata.requiresApproval` de l'outil lui-même qui l'a demandée), `reason?` (`cancelled before a decision` quand l'appelant a abandonné ou que l'exécution s'est arrêtée, `no decision within N ms` après `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` enregistre aussi un appel refusé pour arguments invalides (avant toute politique) ou parce que son appelant est parti après une approbation |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — une réponse facturée par l'éditeur, avec la consommation qu'il a rapportée, que le fournisseur n'a pas pu utiliser (une réponse OpenAI sans aucun choix) ; comptée dans les coûts et dans les budgets par période |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` du contenu servi (le contenu lui-même n'est pas stocké) |

`tool.failed`, `intention.rejected` et `error.occurred` font partie du type `EventType`, mais le SDK ne les enregistre jamais : un appel d'outil en échec est un événement `action.failed`, un appel refusé par une politique un événement `policy.violated`, et un appel rejeté à l'approbation un événement `approval.rejected`.

## Cognition {#cognition}

| Type | Données |
| --- | --- |
| `cognition.started` | `schemaVersion` (2 ; absent pour les exécutions plus anciennes), `goal`, `context?`, `observations` (fournies avec le problème), `commitRules`, `knowledge?` (`scope`, `items` rappelés d'exécutions antérieures, `error?` quand le magasin a échoué), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (le moteur a imposé une décision), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — appels qui n'ont pas rapporté à la fois leurs tokens en entrée et en sortie, `unmeteredTokens?` — leurs tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — ainsi que `model?`, `requestedModel?`, `usage?` pour une opération interrompue par un arrêt ou un délai dépassé après des tentatives facturées |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — le rapport complet d'un test de prédiction |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (énoncé, type, périmètre, `revises?`, `difference?`, `evidence` : chaque test avec `runId`, `predictionId`, `verdict`, `expected`, `observed`, évaluateur), `error?` quand le magasin a échoué. Ajouté après `run.completed`, `run.failed` ou `run.cancelled`, et seulement quand l'exécution a testé quelque chose |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (vide si la réponse a été rejetée), `usage?` (absent si le backend n'a rapporté aucun nombre de tokens), `error?` (pourquoi une réponse facturée a été rejetée), `step?` |

## Études {#studies}

Les exécutions d'une étude (`mode: 'study'`) et les exécutions qui classent ses amendements (`mode: 'study-amendment'`) enregistrent ces événements. Chacun porte l'`id` de l'étude comme `metadata.agentId` et son nom comme `metadata.studyName`. Les recherches enregistrent aussi les événements de leurs appels d'outils gouvernés (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) dans l'exécution de l'étude. Voir [Études](../guide/studies).

| Type | Données |
| --- | --- |
| `study.started` | `name`, `charter` (`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash` (SHA-256), `language`, `model?`, `sources` (noms d'outils), `limits`, `driftThreshold`, `amendments` (ceux qui ont été acceptés : `number`, `text`), `resumeAt?` (quand une exécution reprend : le premier passage où il reste du travail) |
| `study.passage_started` | `passage`, `number` (1 à 7), `amendments` (numéros des amendements acceptés en vigueur), et `reopenedBy?`, `focus?`, `reason?` quand un passage ultérieur l'a rouvert |
| `study.passage_completed` | `passage`, `attempts` (2 quand le gardien l'a fait refaire), `keptAttempt?` (1 quand la première tentative était meilleure que le passage refait et a été conservée), `items` (chacun avec sa `collection`, son `id`, son `statement`, son `status`, ses `sources`, son `servesObjective`, les autres champs d'une affirmation et ses propres champs), `reopenedBy?`, `reopen?` (`passage`, `focus`, `reason` : le passage précédent qu'il demande de rouvrir ; il n'est pas terminé tant qu'il ne s'est pas exécuté de nouveau), `resumed?` (une exécution ne l'a repris que pour le terminer) |
| `study.search` | `passage`, `purpose` (`research`, ou `priorArt` pour l'existant des nouveautés), `tool`, `query`, `servesObjective`, `claims?` (les nouveautés qu'elle vise), `resultIds`, `results` (`id`, `title`, `locator`, `date?`), `error?` (la recherche a échoué), `skipped?` (`maxSearches` : non exécutée) |
| `study.model_called` | `purpose` (`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?` : un seul événement pour un appel et sa réparation), `failed?` (pourquoi la réponse n'a pas pu être utilisée) — compté dans les coûts et dans les budgets par période |
| `study.drift_rejected` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`code`, `params?`, `message`), `by` (`guardian` : jugé hors de l'objectif ; `schema` : refusé avant, par exemple sans `servesObjective`), `attempt` (2 quand le passage est refait) |
| `study.capability_demoted` | `passage`, `item` (l'id de l'architecture), `name`, `reason` (`code`, `params?`, `message`) : une capacité que le gardien a jugée seulement plus rapide ou moins chère, devenue une amélioration |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (amendements acceptés seulement), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`code`, `params?`, `message` ; pour `unclassified` : `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` ou `amendmentPolicy`), `charterHash` — dans l'exécution propre à l'amendement |
| `study.result_recorded` | `card`, `resultAndError` (`result`, `error?`), `conclusionAndMemory?` — ajouté à l'exécution qui a écrit la fiche, après sa fin |
| `study.completed` | `status`, `passages` (`passage`, `state`), `stats` de cette exécution (`modelCalls` auxquels l'éditeur a répondu, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status` (`stopped`, `failed` ou `cancelled`), `stoppedBy?`, `error`, `passages`, `stats` de cette exécution, `partial: true` — puis `run.failed`, ou `run.cancelled` |

`study.model_called` est ce que `getRunCost` et les budgets lisent pour une étude. Quand deux exécutions sont comparées, les événements d'une étude sont appariés par passage (`study.model_called` par finalité et par passage), et l'`usage` de `study.model_called` n'est pas comparé. L'exécution d'un amendement contient `run.started`, `policy.violated` quand une politique de budget a refusé la classification, `study.model_called` quand l'éditeur a répondu, l'événement de l'amendement et `run.completed`.

## Exploitation {#operations}

| Type | Données |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

L'état mental d'une exécution cognitive est le résultat de l'application successive de ses patchs `cognition.thought` dans l'ordre des `step`, en partant de l'objectif et des observations de `cognition.started`. Les observations produites pendant l'exécution sont portées par les patchs de pensée, avec un `sourceEventId` qui pointe vers l'événement `action.executed` ou `cognition.evaluated` contenant les données complètes. Les exécutions sans `schemaVersion` sont reconstruites avec les règles selon lesquelles elles ont été enregistrées.
