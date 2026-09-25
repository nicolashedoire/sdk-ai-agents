# API du SDK

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Option | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | Clé du fournisseur principal (inutile avec `llmProvider`). Sans aucune clé, les outils et les serveurs MCP fonctionnent, et les appels qui ont besoin d'un modèle échouent avec une erreur explicite |
| `provider` | `'openai' \| 'anthropic'` | Fournisseur principal, `openai` par défaut |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` et `timeout` de chaque éditeur (`baseURL` : un endpoint compatible, comme l'API v1 d'Azure OpenAI ou un serveur de modèles local, ou un proxy ; `timeout` : l'attente maximale d'une réponse en millisecondes, 10 minutes par défaut, et pour une réponse en streaming l'attente maximale entre deux de ses événements). Le fournisseur principal utilise l'entrée de son éditeur, et un repli d'un autre éditeur celle du sien. Modèles par défaut : `gpt-5.4` et `claude-opus-5`. L'entrée OpenAI accepte aussi `reasoningModels`, `reasoningEffort`, `nativeToolMessages` et `includeStreamUsage` : voir [Modèles OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Essayés dans l'ordre quand le fournisseur principal échoue ; un `config` l'emporte sur `providerConfig`. Un repli du même éditeur que le principal n'hérite d'aucun de ses réglages (seulement de l'`apiKey` globale) ; un repli d'un autre éditeur a besoin de sa propre clé |
| `llmProvider` | `LLMProvider` | Votre propre fournisseur (modèle local, passerelle, doublure de test). Il reçoit les appels d'outils et leurs résultats au format natif (`LLMMessage`) s'il déclare `nativeToolMessages`, en texte sinon, et il peut transmettre son texte en streaming (voir [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | Politique de nouvelles tentatives pour le LLM, par fournisseur, avant le repli. Ses `maxRetries` et `initialDelayMs` sont aussi les valeurs par défaut de `jev.maxRetries` et `jev.retryBaseDelayMs` ; ses autres champs n'atteignent pas le client Jev, qui garde ses propres 2 nouvelles tentatives et 500 ms avec `retry: false`. Appliquée à un `llmProvider` injecté seulement si elle est définie explicitement, et jamais à un `FallbackProvider` passé comme `llmProvider` ni à ses fournisseurs |
| `jev` | `JevClientConfig` | Active TypeSafe Jev pour les décisions typées — directement, ou via [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) avec `baseUrl` et `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | N'importe quel backend de décisions typées (prioritaire sur `jev`) |
| `pricing` | `PricingTable` | USD par million de tokens, fusionné avec les valeurs par défaut |
| `incidents` | `IncidentMonitorOptions` | Notificateurs, règles, seuil de gravité, régulation de fréquence |
| `eventStore` | `IEventStore` | `FileEventStore('./events')` par défaut |
| `defaultPolicies` | `Policy[]` | Politiques globales |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Stockage des artefacts de test |

### Modèles OpenAI {#openai-models}

Les modèles de raisonnement d'OpenAI — la série o (`o1`, `o3`, `o4-mini`…) et GPT-5 et les suivants (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), y compris datés ou affinés (`ft:o4-mini-…`) — refusent `max_tokens`, et `temperature` sauf quand leur effort de raisonnement est `none`. Le fournisseur OpenAI les reconnaît à leur nom, quelle que soit la casse : il leur envoie `maxTokens` sous la forme de `max_completion_tokens`, qui compte aussi leurs tokens de raisonnement, ainsi que l'effort de raisonnement. Comme l'effort par défaut varie d'un modèle à l'autre, il ne leur envoie jamais de température : celle de l'agent ou du moteur est ignorée pour eux. Les autres modèles reçoivent `temperature` et `max_tokens`, que tout serveur compatible avec OpenAI connaît.

::: warning Outils et effort de raisonnement
Le SDK appelle OpenAI par Chat Completions, où les modèles GPT-5.4 et suivants n'appellent des outils qu'avec l'effort `none`. Le modèle par défaut, `gpt-5.4`, utilise `none` tant que vous ne fixez pas un autre effort. GPT-5.5, GPT-5.6 et GPT-6 Sol et Luna ont `medium` par défaut : un agent doté d'outils échoue sur eux (`Function tools with reasoning_effort are not supported`) à moins de fixer `reasoningEffort: 'none'`. GPT-6 Astra ne peut pas du tout appeler d'outils par Chat Completions. Le SDK envoie l'effort que vous fixez tel quel.
:::

| Option | Valeur par défaut | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Modèle d'une requête qui n'en nomme aucun, et d'un repli qui ne sert pas le modèle de l'agent |
| `reasoningModels` | Déduit du nom | `true` ou `false` : tous les modèles de ce fournisseur sont, ou ne sont pas, des modèles de raisonnement. Une liste : ces noms en sont (déploiements Azure, alias de passerelle), les autres sont reconnus à leur nom |
| `reasoningEffort` | Celui du modèle | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` ou `max`, envoyé tel quel aux seuls modèles de raisonnement. Chaque modèle accepte certaines de ces valeurs, et l'API refuse les autres |
| `includeStreamUsage` | Sur l'API d'OpenAI elle-même | `true` : la consommation d'une réponse en streaming est demandée (`stream_options`), si bien que son coût est compté ; `false` : elle ne l'est pas. Par défaut sur `https://api.openai.com/v1` et sur les hôtes régionaux comme `https://eu.api.openai.com/v1` (dans `baseURL` ou `OPENAI_BASE_URL`), car un serveur compatible peut refuser ce champ (la requête est alors envoyée à nouveau sans lui, sauf à l'API d'OpenAI elle-même, qui l'accepte) ou l'ignorer, et un appel en streaming sans consommation compte comme non mesuré. Avec un budget de coût sur un serveur compatible qui fournit la consommation (c'est le cas de l'API v1 d'Azure OpenAI), fixez `true` |
| `nativeToolMessages` | `true` | `false` pour un serveur compatible qui n'accepte pas, dans la conversation, les `tool_calls` de l'assistant ni les messages `tool` : les appels d'outils précédents et leurs résultats sont alors envoyés en texte, tandis que les outils restent proposés et que les appels d'outils des réponses sont toujours lus. `false` sur le fournisseur principal ou sur n'importe quel repli s'applique à toute la chaîne |

Ces options se placent dans `providerConfig.openai` ou dans le `config` d'un repli OpenAI. Un repli d'un autre éditeur prend dans `providerConfig.openai` chaque option que son `config` ne fixe pas ; un repli du même éditeur que le principal n'en prend aucune. Un agent ou une exécution fixe son propre effort dans `providerSettings.openai.reasoningEffort` : celui de l'exécution l'emporte, puis celui de l'agent, puis celui du fournisseur. Un agent cognitif ne l'applique qu'à la sélection d'outil ; ses pensées, qui ne proposent pas d'outils, prennent son option `reasoningEffort`.

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

### `LLMProvider` {#llmprovider}

Votre propre fournisseur implémente `generateCompletion(request)`, `supportsModel(model)` et `getProviderName()`, et peut déclarer `nativeToolMessages`. Deux champs de la requête concernent le streaming :

| Champ de `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | Défini quand l'appelant veut le texte à mesure qu'il est écrit (une exécution avec `onText`). Appelez-le avec chaque fragment de texte dès qu'il arrive, puis renvoyez comme d'habitude la `LLMResponse` complète : les fragments mis bout à bout doivent former son `content`. Un fournisseur qui ne gère pas le streaming l'ignore, et le SDK transmet tout le `content` d'un seul bloc. Il ne doit pas lever d'exception (celui que fournit le SDK n'en lève jamais) |
| `onTextRestart?()` | Appelez-le quand vous réessayez après une tentative qui avait déjà transmis du texte (une nouvelle tentative que vous faites vous-même) : ce texte n'est plus valable, et les fragments suivants recommencent la réponse. `RetryingLLMProvider` et `FallbackProvider` l'appellent pour les fournisseurs qu'ils enveloppent |

## Agents {#agents}

| Méthode | Renvoie | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agent gouverné : `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. Il ne peut exécuter que ses propres outils (`tools`, `capabilities`), même si le modèle nomme un autre outil enregistré dans le SDK ; `signal` annule l'exécution ; `onText` reçoit le texte que le modèle écrit à mesure qu'il l'écrit, et `onTextRestart` la partie à retirer quand un appel au modèle en échec est retenté (voir [Recevoir la réponse en streaming](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Ses pensées sont structurées et ne sont pas transmises en streaming |
| `defineTool(definition)` | `Tool` | Enregistre un outil ; le gestionnaire est typé à partir de son schéma Zod |
| `defineCapability(definition)` | `Capability` | Regroupe des outils |
| `listTools()` | `Tool[]` | Tous les outils enregistrés |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Exécution gouvernée en dehors d'un agent (utilisée par le serveur MCP) : arguments, politiques, approbation, budget (décompté au début de l'appel), puis l'outil. `signal` annule une approbation en attente et parvient au gestionnaire ; `approvalTimeoutMs` annule une approbation sur laquelle personne n'a statué |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Exécute `read()` comme une exécution à part entière : `run.started`, `resource.read` (URI, taille, SHA-256), `run.completed` ou `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Arrête une exécution gouvernée ou cognitive |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Option | Valeur par défaut | |
| --- | --- | --- |
| `name`, `model` | — | Obligatoires |
| `profile` | `DEFAULT_THINKER_PROFILE` | La façon dont l'agent raisonne |
| `tools`, `policies` | `[]` | Gouvernés comme partout ailleurs ; les politiques de budget et de durée sont aussi vérifiées avant chaque étape, voir [Limites et politiques](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | Instructions supplémentaires pour chaque prompt |
| `limits` | voir [Agents cognitifs](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` ou un `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0,35), `readinessThreshold` (0,8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` ou votre propre `HypothesisAssessor` pour l'opération `compare` |
| `knowledge` | — | Mémoire entre exécutions : `{ store, scope, recallLimit? (10), record? (true) }`, voir [Mémoire entre exécutions](../guide/memory) |
| `evaluator` | — | Un `OutcomeEvaluator` qui teste les prédictions ; active `test_prediction` |
| `generator` | générateur LLM sur `model` | Votre propre `ThoughtGenerator` (comparaisons d'observations comprises) ; ses pensées passent tout de même par les règles d'admission du moteur |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Réglages de la génération des pensées (`reasoningEffort` : modèles de raisonnement d'OpenAI uniquement) |
| `providerSettings` | — | Réglages de la sélection d'outil (moteur de raisonnement natif), `openai.reasoningEffort` compris |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` vaut `completed`, `failed` ou `cancelled` ; `decision.status` vaut `committed`, `provisional` ou `abstain`, et `decision.missing` liste ce qui n'est pas établi ; `state` est le `MentalState` final.

### `OutcomeEvaluator` {#outcomeevaluator}

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

Voir [Preuves et vérification](../guide/evidence-and-verification).

## Raisonnement et profils {#reasoning-profiles}

| Méthode | Renvoie |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — reconstruit à partir des événements |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Études {#studies}

Une étude est un chercheur : elle comprend un objet, puis propose de le repenser avec les connaissances et les techniques d'aujourd'hui, et conçoit les expériences qui permettraient de trancher. Voir [Études](../guide/studies).

| Méthode | Renvoie | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | Vérifie la configuration, résout les sources et fige la charte. Lève une `ValidationError` pour une configuration invalide, ou pour une source qui n'est pas un outil défini ou qui ne prend pas de requête texte |

### `StudyConfig` {#studyconfig}

| Option | Valeur par défaut | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | Obligatoires, non vides. `name` est enregistré avec les événements de l'étude (`metadata.studyName`) ; l'objectif ne change jamais : un nouvel objectif est une nouvelle étude |
| `question` | La question directrice de la méthode et le but de capacité nouvelle, dans `language` | La question directrice |
| `needs`, `leads`, `analogues` | `[]` | Les besoins et critères d'aujourd'hui ; vos pistes, des exemples à vérifier, qui reçoivent chacune un verdict ; les ruptures par assemblage à déconstruire (`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | Ce qui est hors du périmètre |
| `capability` | — | La capacité nouvelle visée ; sans elle, l'étude propose des candidates |
| `sources` | `[]` | Les noms des outils du SDK avec lesquels l'étude cherche, définis avant l'étude (par exemple les outils de `connectMcpServer`) ; sans sources, rien ne peut être établi |
| `model` | Le modèle par défaut du fournisseur | Le modèle de chaque appel |
| `llmProvider` | Le fournisseur du SDK | Un fournisseur pour cette étude |
| `language` | `'en'` | La langue des textes et du dossier, sous forme d'étiquette de langue (`fr`, `pt-BR`…) |
| `limits` | Voir [`StudyLimits`](#studylimits) | Une limite omise garde sa valeur par défaut |
| `driftThreshold` | `1/3` (`DEFAULT_DRIFT_THRESHOLD`) | La part des éléments d'un passage, de 0 à 1, qui peut être rejetée avant que le passage ne soit refait une fois |
| `temperature`, `maxTokens` | `0.4`, — | Des passages et des demandes de recherche ; le gardien, les amendements et l'évaluation de l'existant s'exécutent à 0 |

La charte (`StudyCharter`) contient `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability` et `analogues`, les entrées répétées d'une liste (sans tenir compte de la casse) étant retirées. Elle est figée et hachée ; `name` n'en fait pas partie.

### `StudyLimits` {#studylimits}

Par exécution. `DEFAULT_STUDY_LIMITS` contient les valeurs par défaut ; une valeur hors de sa plage lève une `ValidationError`.

| Limite | Valeur par défaut | Plage | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1 à 10 000 | Les appels au modèle, réparations et contrôles compris ; une fois la limite atteinte, l'exécution s'arrête (`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | 0 à 10 000 | Les recherches ; une fois ce budget épuisé, l'exécution continue sans chercher (avertissement `searchesSkipped`) |
| `maxLoops` | 1 | 0 à 10 | Les passages précédents que l'exécution peut rouvrir |
| `timeoutMs` | 1 200 000 (20 minutes) | 1 à 2 147 483 647 | La durée de l'exécution ; une fois la limite atteinte, l'exécution est interrompue (`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | 1 à 50 | Les résultats conservés d'une recherche |

### `Study` {#study}

| Membre | |
| --- | --- |
| `id` | `study_…`, nouveau pour chaque étude : le `metadata.agentId` de ses événements et l'id d'agent de ses budgets, de ses politiques et de ses appels d'outils |
| `name`, `language`, `charter`, `charterHash` | Le nom, la langue, la `StudyCharter` figée, et son SHA-256 (en hexadécimal), enregistré dans `study.started` et avec chaque amendement |
| `amendments` | `StudyAmendment[]` : acceptés et refusés, dans l'ordre |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. Reprend là où la dernière exécution s'est arrêtée : le gardien juge d'abord ce que cette exécution a laissé sans jugement, un passage jugé mais non terminé ne fait que se terminer, puis les passages non terminés s'exécutent. `restart` recommence l'étude depuis le début : les passages, les résultats, les recherches, le journal de dérive, la numérotation et les exécutions sont effacés ; la charte et les amendements restent. Une limite, une politique, une annulation ou une erreur met fin à l'exécution avec son statut et le rapport de ce qui a été fait ; il ne lève une exception que pour une exécution déjà en cours, un `onEvent` qui ne peut pas être servi, ou un magasin d'événements qui échoue. `onEvent` fonctionne comme avec `agent.run` |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. Classé par rapport à la charte seule, jamais par rapport aux amendements précédents (deux amendements qui se contredisent peuvent être acceptés tous les deux), un à la fois dans l'ordre des demandes, dans une exécution à part (`mode: 'study-amendment'`) où les politiques de budget sont vérifiées d'abord ; seul `refines` est accepté, et apparaît alors dans chaque prompt suivant. `timeoutMs` (60 000 par défaut, compté à partir de son tour) et `signal` bornent la classification : au-delà, ou quand une politique la refuse, l'amendement est refusé comme `unclassified`. Lève une `ValidationError` pour un texte vide, un texte de plus de `MAX_AMENDMENT_LENGTH` (500 caractères), ou quand, son tour venu, `MAX_AMENDMENTS` (10) amendements ont déjà été acceptés |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. Remplit les champs 10 et 11 d'une fiche et enregistre `study.result_recorded` dans l'exécution qui l'a écrite ; une `ValidationError` pour une fiche inconnue ou un `result` vide |
| `report()` | `StudyReport` : le rapport tel qu'il est, résultats enregistrés depuis la dernière exécution compris |

Une étude se crée avec `sdk.createStudy` : la classe `Study` est exportée pour son type, et ce avec quoi elle est construite est interne. `MAX_AMENDMENTS` et `MAX_AMENDMENT_LENGTH` sont exportés, de même que `StudyAmendOptions`, le type des options de `amend`.

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status` vaut `completed` ; `stopped` quand une limite, ou une politique de budget ou de durée, a mis fin à l'exécution, avec `stoppedBy` (`maxModelCalls`, `timeoutMs` ou `policy`) ; `failed` quand c'est une erreur ; ou `cancelled`. `error` est l'`Error` qui a mis fin à l'exécution, `report` le `StudyReport` à la fin de l'exécution, et `markdown` la même chose sous forme de dossier.

### `StudyReport` {#studyreport}

```ts
interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  amendments: StudyAmendment[];
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];                       // { code, message, details? }
  passages: StudyPassageState[];                // { passage, state, attempts, reopenedBy, runId? }
  observations: StudyObservation[];             // O1…
  pieces: StudyPiece[];                         // P1…
  chain: StudyChainStage[];                     // C1…
  threeStates: StudyPieceStates[];              // { piece, atItsTime, currentBest, proposal }
  historicalChoices: StudyHistoricalChoice[];   // H1…
  advances: StudyAdvance[];                     // V1…
  leadVerdicts: StudyLeadVerdict[];             // L1…
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];     // I1…
  references: StudyReference[];                 // R1…
  analogues: StudyAnalogue[];                   // B1…
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];               // K1…
  revisableDecisions: StudyRevisableDecision[]; // D1…
  combinations: StudyCombination[];             // X1…
  capabilities: StudyCapability[];              // Y1…
  architectures: StudyArchitecture[];           // A1…: new capabilities, existing ones, improvements
  noveltyClaims: StudyNoveltyClaim[];           // N1…
  experiments: StudyExperiment[];               // E1…
  cards: MechanismCard[];                       // M1…
  results: StudySearchResult[];                 // S1…
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  runIds: string[];                             // runs of run() since the last restart, oldest first
}

interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  status: 'established' | 'hypothesis' | 'novelty'; // after the study's checks
  declaredStatus?: StudyClaimStatus;                // the model's, when the study changed it
  statusReason?: StudyReason;
  sources: string[];                                // results listed in the prompt that wrote it
  unlistedSources?: string[];                       // cited, not listed in that prompt: they support nothing
  servesObjective: string;
  toVerify?: boolean;                               // prior art not assessed: a novelty, or a capability's assembly
  priorArtReason?: StudyReason;                     // a capability that is not a novelty: why not checked, or assemblyExists
  priorArt?: { closest: string; sources: string[]; verdict: 'novel' | 'partlyNovel' | 'exists' };
  unchecked?: boolean;                              // not judged by the guardian: kept out of later prompts
  runId: string;
}

interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  message: string;                                  // the same reason, in English
}

interface StudyTrace {
  from: string[];                                   // records of the investigation it comes from
  unknownFrom?: string[];                           // cited, not listed in the design's prompt
  untraced?: boolean;                               // it cites none of the listed records
}
```

Chaque raison du rapport est une `StudyReason` : le `statusReason` des affirmations et des composants, le `priorArtReason` d'une capacité qui n'est pas une nouveauté, la `reason` des entrées du journal de dérive et des amendements, et le `kindReason` d'une architecture rétrogradée. Le dossier rend son `code` dans la langue de l'étude (`studyLabels(language).reasons`) ; un texte écrit par le gardien ou par le modèle a le code `judged`, dans `params.text`. Les codes (`StudyReasonCode`) :

| Codes | Pourquoi |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | Une affirmation ou un composant `established` abaissé en `hypothesis` : aucune source, ou aucun id listé dans son prompt |
| `priorArtNotSearchedYet`, `priorArtNoSource`, `priorArtSearchBudget`, `priorArtNotSearched`, `priorArtSearchFailed`, `priorArtNoResult`, `priorArtNotAssessed`, `priorArtUnsupported` | Pourquoi l'existant d'une nouveauté, ou de l'assemblage d'une capacité, reste à vérifier (leur texte anglais commence par « To verify against prior art: ») |
| `priorArtExists` | Une nouveauté abaissée en `hypothesis` : les travaux les plus proches le font déjà |
| `assemblyExists` | Une capacité qui n'est pas une nouveauté, dont l'assemblage existe déjà (dans son `priorArtReason`) |
| `componentDocumented`, `componentUndocumented` | Un composant présenté comme nouveau |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead` | Un élément refusé par le schéma |
| `leadAlreadyJudged` | Un verdict redonné sur une piste déjà jugée : ignoré, pas une dérive (`duplicates` de `study.passage_completed`) |
| `designWithoutCapability` | Une conception sans aucune capacité nouvelle |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | Un amendement qui n'a pas pu être classé |
| `judged` | Les propres mots du gardien ou du modèle |

Chaque élément est une `StudyClaim` avec des champs qui lui sont propres :

| Type | Ses propres champs |
| --- | --- |
| `StudyObservation` | `kind` (`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?` (la pièce qu'elle détaille) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors` (`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain` (`object` ou `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead` (tel que la charte l'écrit), `verdict` (`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind` (`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?` (le numéro de la rupture de la charte qu'elle déconstruit), `domain?`, `date?`, `components` (au moins deux `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state` (`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because` (la condition qui a changé), `opens` |
| `StudyCombination` | `a`, `b`, `enables` (ce que A permet à B), `exchange`, `cost`, `changes` (`representation`, `distribution`, `responsibilities`, `trust`, `verification`, `other`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind` (`capability` ou `improvement`), `declaredKind?` et `kindReason?` (une capacité que le gardien a jugée seulement plus rapide ou moins chère), `capability` (`what`, `forWhom`, `liftedConstraint`), `principleChange?` (`principle` : `representation`, `distribution`, `responsibility`, `trust`, `verification` ou `other` ; `change`), `mechanism`, `components` (`StudyComponent[]` : `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?`, et une `StudyTrace`), `assembly` (`component`, `gives`, `exchanges`, `cost`, et une `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain` (`stage`, `how`), `uncoveredStages` (les étapes de la chaîne complète qu'elle laisse de côté, d'après la vérification de l'étude), `predictions` |
| `StudyThreeState` | `piece`, `state` (`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected` (`architecture`, `result`), `wholeChain` |
| `MechanismCard` | Champs 1 à 9 : `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment` ; champs 10 et 11 une fois que vous les avez enregistrés : `resultAndError?` (`result`, `error?`), `conclusionAndMemory?`, et `resultRecordedAt?` |

Les autres entrées du rapport ne sont pas des affirmations :

| Type | Champs |
| --- | --- |
| `StudyAmendment` | `number?` (amendements acceptés seulement, à partir de 1), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`StudyReason`), `by` (`guardian` : hors de l'objectif ; `schema` : refusé avant, par exemple sans `servesObjective`), `attempt` (2 quand le passage est refait), `runId` |
| `StudySearchResult` | `id` (`S1`…, conservé quand le même résultat est retrouvé, jusqu'à un redémarrage), `title`, `locator` (une URL ou un autre localisateur), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose` (`research` ou `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `throttled?` (elle a échoué sur une limitation de débit), `retry?` (le second essai d'une recherche de l'existant limitée en débit), `skipped?` (`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state` (`complete` ; `partial` : jugé mais non terminé, en attente de sa boucle ou avec sa recherche de l'existant interrompue ; `unchecked` : éléments que le gardien n'a pas jugés ; `notRun`), `attempts` (2 une fois le passage refait), `keptAttempt?` et `discarded?` (`attempt`, `items` : un passage refait écarté au profit d'une meilleure première tentative), `reopenedBy`, `runId?` |
| `StudyNotice` | `code` (`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `passagesOutdated`, `capabilitiesToVerify`, `capabilitiesExist`, `noveltiesToVerify`), `params?` (`limit`, `error`, `count`), `details?` (les passages, les paires `passage.collection`, les pistes, les ruptures ou les architectures concernés), `message` (en anglais ; le dossier rend le code dans sa langue) |
| `StudyStats` | Depuis le dernier redémarrage : `runs` et `modelCalls` (les exécutions de `run()`, et les appels auxquels l'éditeur y a répondu), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus` (par statut), `downgraded` (affirmations dont l'étude a abaissé le statut), `noveltiesToVerify`, `redos`, `loops`. Et `amendments` (`count`, `modelCalls`) : tous les amendements de l'étude, comptés à part |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

Renvoie le rapport sous la forme d'un dossier Markdown lisible, dans la langue du rapport : le `markdown` d'un `StudyResult`. Appelez-la sur `study.report()` pour inclure les résultats enregistrés depuis. Ses mots viennent de `studyLabels(language)` (`StudyLabels`), qui existent dans les onze langues de cette documentation (`StudyLabelLanguage`) ; une autre langue, ou une langue inconnue, reçoit les mots anglais, et `fr-CA` les mots français.

## Décisions typées — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Lève une `ValidationError` quand aucun backend n'est configuré.

| Méthode | Renvoie |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — les réponses sont typées à partir des questions ; pas de `usage` quand le backend n'a rapporté aucun nombre de tokens |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Fonctions utilitaires pour les questions : `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Exploitation {#operations}

| Méthode | Renvoie |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Approbations humaines |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets et audit des politiques |

### `RunCostReport` {#runcostreport}

Ce que renvoie `getRunCost(runId)` : les appels au modèle de l'exécution, étapes échouées comprises — voir [Coûts d'API](../guide/costs).

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| Champ | |
| --- | --- |
| `totalUsd` | Coût des appels dont le coût est connu ; seulement un minimum quand `complete` vaut `false` |
| `complete` | `false` quand le coût de certains appels est inconnu : `unpricedCalls` ou `unmeteredCalls` supérieur à 0 |
| `unpricedModels`, `unpricedCalls` | Modèles sans tarif dans `pricing`, et ceux de leurs appels qui ont rapporté leurs tokens |
| `unmeteredModels`, `unmeteredCalls` | Modèles des appels qui n'ont pas rapporté à la fois leurs tokens en entrée et en sortie, et ces appels |
| `lines` | Une par modèle, par modèle demandé et par source : appels, tokens des appels mesurés, `unmeteredCalls` s'il y en a, `unmeteredTokens` pour les tokens de ceux-ci, `costUsd` quand le modèle a un tarif et qu'une partie des appels de la ligne sont mesurés ; `model` vaut `(unknown)` pour un appel qui n'a enregistré aucun nom de modèle |

## Traces, rejeu et tests {#traces-replay-and-testing}

| Méthode | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Lire des exécutions |
| `replay(runId, modifications?, { onEvent? })` | Exécuter de nouveau sans le LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Comprendre les décisions |

### Traces de référence {#golden-traces}

| Méthode | Renvoie | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | Garde une exécution comme référence, avec le nom de l'agent gouverné qui l'a faite (`agentName`) |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent` : l'id ou le nom d'un agent |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` ou `partial`, avec chaque différence (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) et sa position |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | Les mêmes différences sous forme de régressions, chacune avec une gravité et un impact : `no_regression` ou `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | Rejoue l'exécution, puis valide le rejeu. Un rejeu n'appelle aucun modèle : comparez-le avec `validateAspects: ['tools', 'policies']` |

Les exécutions sont comparées **d'après ce que signifient leurs événements**, jamais d'après leur id (chaque exécution en a de nouveaux). Les événements sont appariés dans l'ordre : d'abord les événements identiques, puis ceux de même type et de même objet (l'outil, l'opération, le passage d'une étude, la réponse) dont les données ont changé, puis ceux dont le type a changé pour le même objet. Jamais comparés : les id des événements, les heures, les métadonnées, les événements `incident.reported` (ils enregistrent les envois et la limitation des alertes ; l'événement qui a déclenché l'incident est comparé), et les valeurs que le SDK écrit et qui changent d'une exécution à l'autre : la durée d'un appel d'outil, la consommation de tokens, les délais avant nouvelle tentative, les id d'approbation, l'exécution d'origine d'un rejeu, l'heure et l'événement source d'une observation. Le texte qu'un modèle écrit à côté d'un appel d'outil n'est comparé que dans `intention.generated`. Les paramètres, le résultat et l'entrée d'un outil sont toujours comparés, quels que soient leurs noms de clés : un argument `duration` passé de 30 à 60 est un changement. Une exécution qui refait la même chose passe ; un outil appelé avec d'autres arguments est signalé là où l'appel a eu lieu (`parameters.metric: "churn" → "revenue"`) ; un appel inséré avant un appel identique est un seul appel ajouté ; un `action.executed` devenu `action.failed` est un seul changement, pas une perte plus un ajout.

| Option | Pour | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | La validation | Comparer moins d'événements |
| `tolerance.dataFields` | La validation | D'autres champs de données laissés de côté, à toute profondeur |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | La validation | Les instants ne sont comparés, par rapport au début de chaque exécution, qu'avec `timestampMs` |
| `compareStructureOnly` | La validation | Les différences de données donnent `partial`, pas `fail` ; des événements ajoutés, retirés, déplacés ou d'un autre type échouent toujours |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | Les régressions | Comparer moins d'événements, laisser des champs de données de côté |
| `tolerance.criticalEventTypes` | Les régressions | Les types dont l'apparition, la perte ou le changement est critique (par défaut : `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | Les régressions | Jusqu'à ce nombre d'événements de déroulement ajoutés ou retirés (vérifications de politique, nouvelles tentatives, approbations) sont tolérés ; un changement du résultat ne l'est jamais |
| `tolerance.maxDurationDiff`, `severityThresholds` | Les régressions | La durée n'est vérifiée qu'avec l'une de ces options : une exécution plus lente de plus de `maxDurationDiff` ms régresse, avec la gravité du plus haut seuil atteint ; une exécution plus rapide ne régresse jamais |

### Suites de régression {#regression-suites}

| Méthode | Renvoie | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | Enregistrée dans `regressionTestSuitesDir`. `agent` : l'id ou le nom d'un agent de ce SDK. Chaque trace de référence doit exister ; `input` vaut par défaut l'entrée qu'a reçue l'exécution de référence ; une suite ne conserve ni le `signal` ni les callbacks (`onEvent`, `onText`, `onTextRestart`) d'une entrée |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | Les plus récentes d'abord |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | Toutes les suites de l'agent, la plus ancienne d'abord : chaque test envoie son entrée à l'agent et compare l'exécution à sa trace de référence ; `suites` contient un résultat par suite |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | Une seule suite |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode` : 0 tous les tests passent, 1 un test a trouvé une régression, 2 un test n'a pas pu s'exécuter (erreur ou délai dépassé) ; `exitCode: false` dans les options donne 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML : un `<testsuite>` par suite ; un test qui n'a pas pu s'exécuter (erreur ou délai dépassé) est un `<error>` ; les caractères que XML ne peut pas contenir sont retirés |

Les id d'agent sont nouveaux dans chaque processus : une suite enregistre aussi le **nom** de son agent, et un autre processus l'exécute avec son agent de ce nom (avec l'id d'agent de la suite d'abord, quand cet agent est dans le SDK). Dans un même SDK, l'id d'un agent n'appartient qu'à lui : deux agents de même nom (deux versions, par exemple) gardent chacun leurs suites, leurs assertions et leurs traces de référence, et un nom les désigne tous. Tout agent créé avec `createAgent` reste dans son SDK : une application qui crée un agent par requête rend donc le nom ambigu ; passez des id, ou créez chaque agent une fois et réutilisez-le. Les suites enregistrées par des versions antérieures n'ont pas de nom : elles ne s'exécutent que dans le processus qui les a créées. Options : `parallel` (les tests d'une suite en même temps), `stopOnFirstFailure` (exécutions séquentielles seulement : plus rien ne s'exécute après le premier test qui ne passe pas, suites suivantes comprises), `filterTags`, `excludeTags`, `timeout` (ms par test, 60 000 par défaut, 2 147 483 647 au plus ; au-delà, l'exécution est annulée et le test est `timeout`) et `detection` (les options de régression ci-dessus).

### Assertions {#assertions}

| Méthode | Renvoie | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | Pour toutes les exécutions, ou pour celles d'un agent ; un agent de ce SDK donné par `agentId` enregistre aussi son nom. Une condition qui ne pourrait pas être évaluée est refusée avec une `ValidationError` |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | Les plus récentes d'abord |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | Les assertions données (un id inconnu lève une erreur), sinon celles de toutes les exécutions plus celles de l'agent de l'exécution |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | Demande | Réussit quand |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` ou `eventTypes` | L'un des types apparaît / aucun n'apparaît |
| `event_count` | `eventType` ou `eventTypes`, puis `count`, ou `minCount` et `maxCount` | Le nombre de ces événements convient |
| `event_order` | `beforeEventType`, `afterEventType` | Le premier de l'un vient avant le premier de l'autre |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | Chaque événement du type correspond |
| `custom` | `customEvaluator(events) => boolean` | La fonction renvoie `true` |

Une assertion `custom` contient une fonction, qu'on ne peut pas écrire dans un fichier : elle **n'est pas enregistrée** et dure autant que l'instance du SDK qui l'a définie ; définissez-la de nouveau au démarrage. Les autres types sont enregistrés dans `assertionsDir`.

### Comparaisons et impact {#comparisons-and-impact}

| Méthode | Renvoie | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | Les différences, alignées d'après le sens comme ci-dessus : `event_added`, `event_removed`, `event_modified` (type changé), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | Les moyennes avant et après de `duration` (ms), `cost` (USD des appels de modèle qui ont un prix, comme `getRunCost`), `quality` (part des événements qui ne sont pas des actions échouées) et `success_rate`, avec les changements de comportement ; enregistrée dans `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` sur les exécutions d'un agent gouverné (son nom, ou l'id d'un agent de ce SDK) enregistrées avec chaque version : sa `version` ou son `configHash`. Tous les agents de ce nom comptent. Les rejeux sont laissés de côté ; les deux versions doivent être différentes et sélectionner des exécutions différentes ; une version inconnue lève une erreur qui liste celles qui sont enregistrées |

Les événements de cycle de vie des exécutions d'un agent gouverné (`run.started`, `run.completed`…) enregistrent son `agentName`, son `agentVersion` et son `configHash` : deux agents de même nom sont un seul agent en deux versions, ou dans deux processus. L'empreinte couvre le modèle, le prompt système, `maxSteps` et `timeout`, les réglages du fournisseur, `version`, les capacités, les outils (nom, description, version, schéma des paramètres, métadonnées, réglages des nouvelles tentatives) et les politiques propres à l'agent avec leurs règles ; elle change avec `setPolicy` et `addTools`, et chaque exécution enregistre celle avec laquelle elle a commencé. Les exécutions enregistrées par des versions antérieures n'ont que l'id et la version.

### Requêtes sur toutes les exécutions {#queries-across-runs}

| Méthode | Renvoie |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>` : les événements qui correspondent, dans l'ordre chronologique (au plus `limit`), les événements du périmètre, ceux qui correspondent |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

Un filtre a un **périmètre** — `runId` (sans lui, toutes les exécutions), `since`, `until` — et des **conditions** — `type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) et `metadataFilters` (`{ field, operator, value? }`). Les conditions sont combinées avec `logic` (`and` par défaut ; `or` : au moins une), puis inversées par `not` ; le périmètre ne l'est jamais. Tous les magasins fournis répondent : le magasin de fichiers lit chaque fichier d'exécution une fois par requête, les magasins SQL interrogent la base. Quand toutes les conditions doivent être vraies, la base filtre elle-même les événements par type et par id ; avec `or` ou `not`, le magasin renvoie tous les événements du périmètre et les conditions sont vérifiées en mémoire, ce qui coûte davantage sur une grosse base. Les événements de la même milliseconde gardent l'ordre de leur exécution : les exécutions par id, puis dans l'ordre où chacune les a enregistrés.

## Événements en direct {#live-events}

Un écouteur est de la forme `(event: Event) => unknown`. Il reçoit un événement à la fois, dans l'ordre de chaque exécution, une fois que le magasin l'a accepté ; une promesse qu'il renvoie est attendue avant son événement suivant. Les exécutions ne l'attendent jamais, et ses erreurs sont signalées, jamais propagées dans l'exécution. Au plus `maxQueued` événements (10 000 par défaut) l'attendent ; au-delà, les nouveaux sont abandonnés pour lui et signalés par une `LiveEventsDroppedError`. Voir [Progression en direct](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent` : `agent.run({ message, onEvent })` | Tous les événements de l'exécution ; `run()` se résout une fois que l'écouteur a fini de traiter chacun d'eux, ou plus tôt quand l'exécution a été arrêtée ou annulée ou que `signal` est interrompu (l'écouteur est alors désabonné). L'écouteur n'est pas enregistré |
| `ThinkInput.onEvent` : `agent.think({ problem, onEvent })` | De même pour une exécution cognitive, dont le `limits.timeoutMs` met aussi fin à l'attente |
| `StudyRunOptions.onEvent` : `study.run({ onEvent })` | De même pour l'exécution d'une étude, dont le `limits.timeoutMs` met aussi fin à l'attente |
| `replay(runId, modifications?, { onEvent })` | De même pour un rejeu, qui ne peut pas être annulé : il attend toujours |
| `executeTool(name, params, { onEvent })` | Les événements de l'appel, et ceux des exécutions que lance son outil, sur un seul niveau : le gestionnaire reçoit l'écouteur sous la forme `context.onEvent`, que `governedAgentTool` et `cognitiveAgentTool` transmettent à leur agent (un agent construit à la main sur un magasin sans événements en direct s'exécute sans lui). `signal` met fin à l'attente |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void` : tous les événements de toutes les exécutions qui correspondent au filtre (`agentId` est `metadata.agentId`), jusqu'à ce que vous appeliez la fonction renvoyée, qui abandonne les événements pas encore transmis. Les exécutions des suites de régression et les rejeux sont de vraies exécutions : l'écouteur reçoit aussi leurs événements (une suite ne garde ni le `onEvent` ni le `onText` de son entrée) |
| `new ObservedEventStore(store, { onListenerError? })` | La couche qui les transmet ; le SDK enveloppe son magasin dans une telle couche, ou utilise celle que vous passez comme `eventStore`, y compris à l'intérieur d'un `MonitoredEventStore` (dont les rapports d'incident sont alors transmis eux aussi). Son `subscribe(listener, options?)` renvoie `{ unsubscribe(), close() }` : `close()` attend que l'écouteur ait fini de traiter les événements qu'il a déjà pris en charge. `onListenerError` reçoit les erreurs des écouteurs et les abandons |

## Outils : `ToolDefinition` {#tools-tooldefinition}

| Champ | |
| --- | --- |
| `name`, `description` | Ce que voit le modèle |
| `schema` | Schéma Zod des arguments ; les appels qui n'y correspondent pas sont refusés |
| `handler(params, context?)` | Reçoit les arguments validés et `{ runId, agentId, signal?, onEvent? }` — `signal` est interrompu quand l'appelant abandonne ; `onEvent` est défini quand l'appelant suit l'appel en direct : passez-le comme `onEvent` des exécutions que l'outil lance |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — outils idempotents uniquement ; les arguments invalides ne donnent jamais lieu à une nouvelle tentative |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` fait attendre `approveAction` à chaque appel ; `readOnly` est montré aux clients MCP sous la forme `readOnlyHint` |
| `inputJsonSchema` | JSON Schema montré à la place de celui qui est dérivé de `schema` |
| `capability`, `version` | Regroupement, version |

## Sources d'outils {#tool-sources}

Chacune renvoie des `ToolDefinition` prêtes à l'emploi : faites-les passer par `sdk.defineTool` avant de les donner à un agent (les agents prennent des `Tool[]`), ou passez-les directement à la liste `tools` d'un serveur MCP. Voir [Outils](../guide/tools) et [Un serveur MCP pour tout](../guide/mcp-recipes).

| Fonction | Renvoie | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | Un outil par opération d'une description OpenAPI 3 ; uniquement `GET`, sauf opérations listées dans `include` ; les autres méthodes nécessitent une approbation par défaut. Un appel renvoie `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` sur un dossier, jamais en dehors ; un dossier exclu masque tout ce qu'il contient |
| `folderResources(options)` | `ResourceProvider` | Les mêmes fichiers sous forme de ressources MCP `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (une seule instruction en lecture seule, au plus `maxRows` lignes, 100 par défaut) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Pour `DatabaseSync` de `node:sqlite` ou pour `better-sqlite3` ; exécute les requêtes avec `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Pour `pg` (un client dédié, ou un pool) ; chaque requête dans `BEGIN READ ONLY` (refusée sur une connexion déjà engagée dans une transaction) … `ROLLBACK` + `pg_advisory_unlock_all()`, avec `SET LOCAL statement_timeout` (10 s par défaut) ; `schemas` ne limite que le listage et la description |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>` : `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }` ; annulé avec l'appelant ; `error` est générique sauf avec `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | La vérification d'instruction utilisée par les adaptateurs de bases de données (syntaxes SQLite et PostgreSQL uniquement) |
| `webTools({ include?, prefix?, search?, circuitBreaker?, throttleWaitMs?, language?, userAgent?, timeoutMs?, callTimeoutMs?, maxResponseBytes?, maxRedirects?, hostIntervalMs?, robots?, allowPrivateNetwork?, lookup?, maxPdfBytes?, maxPdfPages?, cache?, retry?, arxiv?, wikipedia?, github? })` | `ToolDefinition[]` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search`, en lecture seule (`web_fetch` à risque moyen, les autres à faible risque). Les résultats de recherche : `{ id, title, url, date?, excerpt, source }` ; une page : `{ url, finalUrl, title?, date?, language?, contentType, content, truncated, untrusted: true, hint? }`. Aucune adresse en dehors de l'Internet public sauf avec `allowPrivateNetwork`, robots.txt respecté, chaque appel dans la limite de `callTimeoutMs` (60 s). Voir [Recherche sur le Web](../guide/web-research) |
| `duckDuckGo({ region?, minIntervalMs?, baseUrl? })` | `SearchProvider` | Le fournisseur par défaut de `web_search`, sans clé : la page HTML de DuckDuckGo, 1,5 s entre deux recherches |
| `searxng({ baseUrl, engines?, categories?, minIntervalMs? })` | `SearchProvider` | L'API JSON d'une instance SearXNG ; résultats nommés `searxng:<engine>`, datés par `publishedDate` |
| `brave({ apiKey, baseUrl?, minIntervalMs? })`, `tavily(…)`, `serper(…)` | `SearchProvider` | Les API Brave Search, Tavily et Serper, avec leur clé |
| `citableUrl(url)`, `normalizeUrl(url)` | `string \| undefined` | L'URL sous laquelle un résultat de recherche est cité (paramètres de suivi et fragment retirés), et celle sous laquelle il est connu pour son id et ses doublons (aussi l'hôte en minuscules, sans barre oblique finale) ; `undefined` pour tout ce qui n'est pas http(s) |
| `isPublicAddress(address)` | `boolean` | Indique si une adresse IP se trouve sur l'Internet public (la vérification sur laquelle repose `allowPrivateNetwork`) |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

`web_search` interroge ses fournisseurs dans l'ordre ; un fournisseur qui lève une erreur passe la main au suivant. Un fournisseur qui lève `SearchThrottledError` (`retryAfterMs?`, l'attente qu'il a demandée) ou qui répond HTTP 429 a droit à un essai de plus après cette attente ou `throttleWaitMs` (10 s), 30 s au plus, si l'échéance de l'appel le permet ; encore limité en débit (ou en échec trois fois de suite), il est ignoré pendant `circuitBreaker.cooldownMs` (2 minutes). Les requêtes vers un hôte partent une à une, chacune `minIntervalMs` après la fin de la précédente, pour tout le processus (DuckDuckGo : 4 s par défaut). Les outils Web lèvent `WebRequestRefusedError` pour ce qu'ils refusent délibérément (`reason` : `private-address`, `scheme`, `downgrade`, `redirects`, `robots`, `content-type`, `too-large`, `unreadable`, `pacing`), `WebHttpError` pour une réponse autre que 2xx (`status`), `WebTimeoutError` (une requête, l'échéance de l'appel ou le budget de temps d'une extraction), `WebConfigurationError` pour une mise en place manquante (`unpdf`, un jeton GitHub) et `SearchUnavailableError` quand aucun fournisseur n'a répondu (`failures` ; `throttled` quand tous étaient limités en débit, `retryAfterMs?` quand un fournisseur ignoré aura droit à un nouvel essai). `retry` ne relance jamais un refus, une mise en place manquante ni une recherche à laquelle aucun fournisseur n'a répondu.

```ts
interface SearchProvider {
  readonly name: string;
  /** The origin of a baseUrl you gave it: its requests there may reach a private network. */
  readonly configuredOrigin?: string;
  /** Send every request through `web`: timeouts, byte caps, pacing and address checks. */
  search(request: SearchRequest, web: WebClient): Promise<SearchHit[]>;
}

interface SearchRequest {
  query: string;
  maxResults: number;
  site?: string;
  freshness?: 'day' | 'week' | 'month' | 'year';
  language?: string;
  signal?: AbortSignal;
}

interface SearchHit { title: string; url: string; excerpt: string; date?: string; source?: string }

interface WebClient {
  request(url: string, init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    minIntervalMs?: number;
    signal?: AbortSignal;
    maxBytes?: number;
  }): Promise<{ status: number; url: string; headers: Record<string, string>; body: Buffer; truncated: boolean }>;
}
```

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| Fonction | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP qui expose exactement ce que liste `tools` : des noms d'outils définis et/ou des `ToolDefinition` (définies pour vous sur le SDK ; la même définition peut être passée de nouveau, un autre outil portant un nom déjà pris est refusé). `resources` : un ou plusieurs `ResourceProvider` ; chaque lecture est tracée. Les appels s'exécutent sous `mcp:<name>` (ou `agentId`) ; une approbation sur laquelle personne ne statue dans le délai `approvalTimeoutMs` (50 000 ms par défaut) est annulée ; les refus liés à l'entrée sont expliqués au client, les autres causes seulement avec `exposeErrorDetails`. Un appel muni d'un `progressToken` reçoit une `notifications/progress` par événement, toutes envoyées avant le résultat ([notifications de progression](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | Identique, connecté à stdin/stdout ; écrit une ligne « ready » sur stderr, et se ferme quand stdin se termine (les appels en cours sont interrompus, les approbations en attente annulées). `approvalTimeoutMs` vaut 50 000 par défaut, comme pour `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — les outils de n'importe quel serveur MCP, sous forme de `ToolDefinition` |

`GovernedToolHost` est ce dont le serveur a besoin de la part du SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`) ; `createSDK()` renvoie un objet qui l'implémente.

## Briques de base {#building-blocks}

Les briques du SDK sont exportées pour les configurations personnalisées : `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, ainsi que leurs principaux types.
