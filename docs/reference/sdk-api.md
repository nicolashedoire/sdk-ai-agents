# SDK API

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig`

| Option | Type | Description |
| --- | --- | --- |
| `apiKey` | `string` | Key of the primary provider (not needed with `llmProvider`). Without any key, tools and MCP servers work and calls that need a model fail with a clear error |
| `provider` | `'openai' \| 'anthropic'` | Primary provider, default `openai` |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` and `timeout` of each vendor (`baseURL`: a compatible endpoint, such as the Azure OpenAI v1 API or a local model server, or a proxy; `timeout`: the longest wait for an answer in milliseconds, 10 minutes by default, and for a streamed answer the longest wait between two of its events). The primary uses its vendor's entry, and a fallback of another vendor uses its own vendor's entry. Default models: `gpt-5.4` and `claude-opus-5`. The OpenAI entry also takes `reasoningModels`, `reasoningEffort`, `nativeToolMessages` and `includeStreamUsage`: see [OpenAI models](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Tried in order when the primary fails; a `config` overrides `providerConfig`. A fallback of the primary's vendor inherits none of the primary's settings (only the SDK-wide `apiKey`); one of another vendor needs its own key |
| `llmProvider` | `LLMProvider` | Your own provider (local model, gateway, test double). It gets tool calls and results in the native format (`LLMMessage`) if it declares `nativeToolMessages`, as plain text otherwise, and may stream its text (see [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | LLM retry policy, per provider, before fallback. Its `maxRetries` and `initialDelayMs` are also the defaults of `jev.maxRetries` and `jev.retryBaseDelayMs`; its other fields do not reach the Jev client, which keeps its own 2 retries and 500 ms with `retry: false`. Applied to an injected `llmProvider` only when set explicitly, and never to a `FallbackProvider` given as `llmProvider` or to its providers |
| `jev` | `JevClientConfig` | Enables TypeSafe Jev for typed decisions — directly, or through [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) with `baseUrl` and `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Any typed-decision backend (takes precedence over `jev`) |
| `pricing` | `PricingTable` | USD per million tokens, merged over defaults |
| `incidents` | `IncidentMonitorOptions` | Notifiers, rules, severity threshold, throttling |
| `eventStore` | `IEventStore` | Defaults to `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Global policies |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Storage of testing artifacts |

### OpenAI models

OpenAI reasoning models — the o-series (`o1`, `o3`, `o4-mini`…) and GPT-5 and later (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), also dated or fine-tuned (`ft:o4-mini-…`) — refuse `max_tokens`, and `temperature` unless their reasoning effort is `none`. The OpenAI provider recognizes them by name, whatever the letter case: it sends them `maxTokens` as `max_completion_tokens`, which also counts their reasoning tokens, and the reasoning effort. As the default effort varies by model, it never sends them a temperature: the temperature of the agent or of the engine is ignored for them. Other models get `temperature` and `max_tokens`, which every OpenAI-compatible server knows.

::: warning Tools and the reasoning effort
The SDK calls OpenAI through Chat Completions, where GPT-5.4 and later models call tools only with the effort `none`. The default model, `gpt-5.4`, uses `none` unless you set another effort. GPT-5.5, GPT-5.6 and GPT-6 Sol and Luna default to `medium`: an agent with tools fails on them (`Function tools with reasoning_effort are not supported`) unless you set `reasoningEffort: 'none'`. GPT-6 Astra cannot call tools through Chat Completions at all. The SDK sends the effort you set unchanged.
:::

| Option | Default | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Model of a request that names none, and of a fallback that does not serve the agent's model |
| `reasoningModels` | Detected from the name | `true` or `false`: every model of this provider is, or is not, a reasoning model. A list: these names are (Azure deployments, gateway aliases), the others are detected |
| `reasoningEffort` | The model's | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, sent as given to reasoning models only. Each model accepts some of these values, and the API refuses the others |
| `includeStreamUsage` | On OpenAI's own API | `true`: a streamed answer is asked for its usage (`stream_options`), so its cost is counted; `false`: it is not. By default on `https://api.openai.com/v1` and regional hosts such as `https://eu.api.openai.com/v1` (from `baseURL` or `OPENAI_BASE_URL`), since a compatible server may refuse the field (the request is then sent again without it, except to OpenAI's own API, which takes it) or ignore it, and a streamed call without usage counts as unmetered. With a cost budget on a compatible server that reports the usage (the Azure OpenAI v1 API does), set `true` |
| `nativeToolMessages` | `true` | `false` for a compatible server that does not accept assistant `tool_calls` and `tool` messages in the conversation: earlier tool calls and results are then sent as plain text, while tools are still offered and the tool calls of replies still read. `false` on the primary or on any fallback applies to the whole chain |

These options go in `providerConfig.openai` or in the `config` of an OpenAI fallback. A fallback of another vendor takes each option its `config` does not set from `providerConfig.openai`; a fallback of the primary's vendor takes none. An agent or a run sets its own effort in `providerSettings.openai.reasoningEffort`: the run's wins, then the agent's, then the provider's. A cognitive agent applies it to tool selection only; its thoughts, which offer no tools, take its `reasoningEffort` option.

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

### `LLMProvider`

Your own provider implements `generateCompletion(request)`, `supportsModel(model)` and `getProviderName()`, and may declare `nativeToolMessages`. Two fields of the request are about streaming:

| `LLMRequest` field | |
| --- | --- |
| `onTextDelta?(delta)` | Set when the caller wants the text as it is written (a run with `onText`). Call it with each piece of text as it arrives, then return the complete `LLMResponse` as usual: the pieces joined must make its `content`. A provider that cannot stream ignores it, and the SDK passes the whole `content` on in one piece. It must not throw (the SDK's own never does) |
| `onTextRestart?()` | Call it when you try again after an attempt that had already streamed text (a retry of your own): that text is void, and the next pieces start the answer over. `RetryingLLMProvider` and `FallbackProvider` call it for the providers they wrap |

## Agents

| Method | Returns | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Governed agent: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. It can only run its own tools (`tools`, `capabilities`), even if the model names another tool registered in the SDK; `signal` cancels the run; `onText` receives the text the model writes as it is written, and `onTextRestart` the part to drop when a failed model call is tried again (see [Streaming the answer](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Its thoughts are structured and not streamed |
| `defineTool(definition)` | `Tool` | Registers a tool; the handler is typed from its Zod schema |
| `defineCapability(definition)` | `Capability` | Groups tools |
| `listTools()` | `Tool[]` | Every registered tool |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Governed execution outside an agent (used by the MCP server): arguments, policies, approval, budget (counted when the call starts), then the tool. `signal` cancels a pending approval and reaches the handler; `approvalTimeoutMs` cancels an approval nobody decided |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Runs `read()` as its own run: `run.started`, `resource.read` (URI, size, SHA-256), `run.completed` or `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Stops a governed or cognitive run |

### `CognitiveAgentConfig`

| Option | Default | |
| --- | --- | --- |
| `name`, `model` | — | Required |
| `profile` | `DEFAULT_THINKER_PROFILE` | How the agent reasons |
| `tools`, `policies` | `[]` | Governed like everywhere else; budget and timeout policies are also checked before each step, see [Limits and policies](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | Extra instructions for every prompt |
| `limits` | see [Cognitive agents](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` or a `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` or your own `HypothesisAssessor` for the `compare` operation |
| `knowledge` | — | Memory across runs: `{ store, scope, recallLimit? (10), record? (true) }`, see [Memory across runs](../guide/memory) |
| `evaluator` | — | An `OutcomeEvaluator` that tests predictions; enables `test_prediction` |
| `generator` | LLM generator on `model` | Your own `ThoughtGenerator` (observation comparisons included); its thoughts still go through the engine's admission rules |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Thought generation settings (`reasoningEffort`: OpenAI reasoning models only) |
| `providerSettings` | — | Settings for tool selection (native reasoning engine), `openai.reasoningEffort` included |

### `CognitiveRunResult`

`{ runId, status, answer?, decision?, state, error? }` — `status` is `completed`, `failed` or `cancelled`; `decision.status` is `committed`, `provisional` or `abstain`, with `decision.missing` listing what is not established; `state` is the final `MentalState`.

### `OutcomeEvaluator`

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

See [Evidence & verification](../guide/evidence-and-verification).

## Reasoning & profiles

| Method | Returns |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — rebuilt from events |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Studies

A study is a researcher: it understands an object, then proposes how to redesign it with the knowledge and techniques of today, and designs the experiments that would decide. See [Studies](../guide/studies).

| Method | Returns | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | Checks the configuration, resolves the sources and freezes the charter. Throws a `ValidationError` for a bad configuration, or a source that is not a defined tool or takes no text query |

### `StudyConfig`

| Option | Default | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | Required, non-empty. `name` is recorded with the study's events (`metadata.studyName`); the objective never changes: a new objective is a new study |
| `question` | The method's guiding question and the capability aim, in `language` | The guiding question |
| `needs`, `leads`, `analogues` | `[]` | Needs and criteria of today; your leads, examples to verify, each given a verdict; breakthroughs by assembly to deconstruct (`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | What is out of scope |
| `capability` | — | The new capability aimed at; without it, the study proposes candidates |
| `sources` | `[]` | Names of SDK tools the study searches with, defined before the study (for example the tools of `connectMcpServer`); without sources nothing can be established |
| `model` | The provider's default | Model of every call |
| `llmProvider` | The SDK's provider | A provider for this study |
| `language` | `'en'` | Language of the texts and of the dossier, as a language tag (`fr`, `pt-BR`…) |
| `limits` | See [`StudyLimits`](#studylimits) | A limit left out keeps its default |
| `driftThreshold` | `1/3` (`DEFAULT_DRIFT_THRESHOLD`) | Share of a passage's items, from 0 to 1, that may be rejected before the passage is redone once |
| `temperature`, `maxTokens` | `0.4`, — | Of the passages and search requests; the guardian, the amendments and the prior-art check run at 0 |

The charter (`StudyCharter`) holds `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability` and `analogues`, with repeated list entries (case aside) dropped. It is frozen and hashed; `name` is not part of it.

### `StudyLimits`

Per run. `DEFAULT_STUDY_LIMITS` holds the defaults; a value out of range throws a `ValidationError`.

| Limit | Default | Range | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1 to 10 000 | Model calls, repairs and checks included; reached, the run stops (`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | 0 to 10 000 | Searches; once spent, the run goes on without searching (notice `searchesSkipped`) |
| `maxLoops` | 1 | 0 to 10 | Earlier passages the run may reopen |
| `timeoutMs` | 1 200 000 (20 minutes) | 1 to 2 147 483 647 | Length of the run; reached, the run is aborted (`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | 1 to 50 | Results kept from one search |

### `Study`

| Member | |
| --- | --- |
| `id` | `study_…`, new for every study: the `metadata.agentId` of its events and the agent id of its budgets, policies and tool calls |
| `name`, `language`, `charter`, `charterHash` | The name, the language, the frozen `StudyCharter`, and its SHA-256 (hexadecimal), recorded in `study.started` and with each amendment |
| `amendments` | `StudyAmendment[]`: accepted and refused, in order |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. Resumes where the last run stopped: the guardian first judges what that run left unjudged, a passage judged but not finished only finishes, then the passages not complete run. `restart` starts the study over: passages, results, searches, drift log, numbering and runs are cleared; the charter and the amendments stay. A limit, a policy, a cancellation or an error ends the run with its status and the report of what was done; it throws only for a run already in progress, an `onEvent` that cannot be served, or an event store that fails. `onEvent` works as with `agent.run` |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. Classified against the charter alone, never against earlier amendments (two that contradict each other can both be accepted), one at a time in the order asked, in a run of its own (`mode: 'study-amendment'`) where the budget policies are checked first; only `refines` is accepted, and shows in every later prompt. `timeoutMs` (default 60 000, counted from its turn) and `signal` bound the classification: past them, or when a policy refuses it, the amendment is refused as `unclassified`. Throws a `ValidationError` for an empty text, a text longer than `MAX_AMENDMENT_LENGTH` (500 characters), or when its turn comes once `MAX_AMENDMENTS` (10) amendments were accepted |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. Fills fields 10 and 11 of a card and records `study.result_recorded` in the run that wrote it; a `ValidationError` for an unknown card or an empty `result` |
| `report()` | `StudyReport`: the report as it stands, results recorded since the last run included |

A study is created with `sdk.createStudy`: the `Study` class is exported for its type, and what it is built with is internal. `MAX_AMENDMENTS` and `MAX_AMENDMENT_LENGTH` are exported, and so is `StudyAmendOptions`, the type of the options of `amend`.

### `StudyResult`

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status` is `completed`; `stopped` when a limit or a budget or timeout policy ended the run, with `stoppedBy` (`maxModelCalls`, `timeoutMs` or `policy`); `failed` when an error did; or `cancelled`. `error` is the `Error` that ended the run, `report` the `StudyReport` when it ended, and `markdown` the same as a dossier.

### `StudyReport`

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

Every reason of the report is a `StudyReason`: the `statusReason` of claims and components, the `priorArtReason` of a capability that is not a novelty, the `reason` of drift entries and amendments, and the `kindReason` of a demoted architecture. The dossier renders its `code` in the study's language (`studyLabels(language).reasons`); a text the guardian or the model wrote has the code `judged`, in `params.text`. The codes (`StudyReasonCode`):

| Codes | Why |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | An `established` claim or component lowered to `hypothesis`: no source, or no id listed in its prompt |
| `priorArtNotSearchedYet`, `priorArtNoSource`, `priorArtSearchBudget`, `priorArtNotSearched`, `priorArtSearchFailed`, `priorArtNoResult`, `priorArtNotAssessed`, `priorArtUnsupported` | Why the prior art of a novelty, or of a capability's assembly, is still to verify (their English text starts "To verify against prior art:") |
| `priorArtExists` | A novelty lowered to `hypothesis`: the closest work already does it |
| `assemblyExists` | A capability that is not a novelty, whose assembly already exists (in its `priorArtReason`) |
| `componentDocumented`, `componentUndocumented` | A component presented as new |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead` | An item refused by the schema |
| `leadAlreadyJudged` | A verdict given again on a lead already judged: dropped, not drift (`duplicates` of `study.passage_completed`) |
| `designWithoutCapability` | A design without any new capability |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | An amendment that could not be classified |
| `judged` | The guardian's or the model's own words |

Every item is a `StudyClaim` with fields of its own:

| Type | Its own fields |
| --- | --- |
| `StudyObservation` | `kind` (`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?` (the piece it details) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors` (`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain` (`object` or `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead` (as the charter writes it), `verdict` (`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind` (`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?` (the number of the charter breakthrough it deconstructs), `domain?`, `date?`, `components` (two or more `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state` (`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because` (the condition that changed), `opens` |
| `StudyCombination` | `a`, `b`, `enables` (what A lets B do), `exchange`, `cost`, `changes` (`representation`, `distribution`, `responsibilities`, `trust`, `verification`, `other`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind` (`capability` or `improvement`), `declaredKind?` and `kindReason?` (a capability the guardian judged only faster or cheaper), `capability` (`what`, `forWhom`, `liftedConstraint`), `principleChange?` (`principle`: `representation`, `distribution`, `responsibility`, `trust`, `verification` or `other`; `change`), `mechanism`, `components` (`StudyComponent[]`: `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?`, and a `StudyTrace`), `assembly` (`component`, `gives`, `exchanges`, `cost`, and a `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain` (`stage`, `how`), `uncoveredStages` (stages of the whole chain it leaves out, as the study checked), `predictions` |
| `StudyThreeState` | `piece`, `state` (`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected` (`architecture`, `result`), `wholeChain` |
| `MechanismCard` | Fields 1 to 9: `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment`; fields 10 and 11 once you recorded them: `resultAndError?` (`result`, `error?`), `conclusionAndMemory?`, and `resultRecordedAt?` |

The other entries of the report are not claims:

| Type | Fields |
| --- | --- |
| `StudyAmendment` | `number?` (accepted only, from 1), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`StudyReason`), `by` (`guardian`: off the objective; `schema`: refused before, for example without `servesObjective`), `attempt` (2 in a redo), `runId` |
| `StudySearchResult` | `id` (`S1`…, kept when the same result is found again, until a restart), `title`, `locator` (a URL or another locator), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose` (`research` or `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `skipped?` (`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state` (`complete`; `partial`: judged but not finished, waiting for its loop or with its prior-art search cut short; `unchecked`: items the guardian has not judged; `notRun`), `attempts` (2 after a redo), `keptAttempt?` and `discarded?` (`attempt`, `items`: a redo discarded for a better first attempt), `reopenedBy`, `runId?` |
| `StudyNotice` | `code` (`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `passagesOutdated`, `capabilitiesToVerify`, `capabilitiesExist`, `noveltiesToVerify`), `params?` (`limit`, `error`, `count`), `details?` (the passages, `passage.collection` pairs, leads, breakthroughs or architectures concerned), `message` (in English; the dossier renders the code in its language) |
| `StudyStats` | Since the last restart: `runs` and `modelCalls` (runs of `run()`, and the calls the vendor answered in them), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus` (per status), `downgraded` (claims whose status the study lowered), `noveltiesToVerify`, `redos`, `loops`. And `amendments` (`count`, `modelCalls`): every amendment of the study, counted apart |

### `renderStudyMarkdown(report)`

Returns the report as a readable Markdown dossier, in the report's language: the `markdown` of a `StudyResult`. Call it on `study.report()` to include the results recorded since. Its words come from `studyLabels(language)` (`StudyLabels`), which exist in the eleven languages of this documentation (`StudyLabelLanguage`); another language, or an unknown one, gets the English words, and `fr-CA` gets the French ones.

## Typed decisions — `sdk.decisions`

Throws a `ValidationError` when no backend is configured.

| Method | Returns |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — answers typed from the questions; no `usage` when the backend reported no token counts |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Question helpers: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Operations

| Method | Returns |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Human approvals |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Budgets and policy audit |

### `RunCostReport`

What `getRunCost(runId)` returns: the model calls of the run, failed steps included — see [API costs](../guide/costs).

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

| Field | |
| --- | --- |
| `totalUsd` | Cost of the calls whose cost is known; only a lower bound when `complete` is `false` |
| `complete` | `false` when the cost of some calls is unknown: `unpricedCalls` or `unmeteredCalls` above 0 |
| `unpricedModels`, `unpricedCalls` | Models without a price in `pricing`, and their calls that reported their tokens |
| `unmeteredModels`, `unmeteredCalls` | Models of the calls that did not report both their input and output token counts, and those calls |
| `lines` | One per model, model asked for and source: calls, tokens of the metered calls, `unmeteredCalls` when there are any, `unmeteredTokens` for the tokens of those, `costUsd` when the model has a price and some of the line's calls are metered; `model` is `(unknown)` for a call that recorded no model name |

## Traces, replay and testing

| Method | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Read runs |
| `replay(runId, modifications?, { onEvent? })` | Re-execute without the LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Understand decisions |

### Golden traces

| Method | Returns | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | Keeps a run as a reference, with the name of the governed agent that ran it (`agentName`) |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: an agent's id or name |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` or `partial`, with each difference (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) and its position |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | The same differences as regressions, each with a severity and an impact: `no_regression` or `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | Replays the run, then validates the replay. A replay calls no model: compare it with `validateAspects: ['tools', 'policies']` |

Runs are compared **by what their events mean**, never by event id (every run has new ones). Events are paired in order: identical events first, then events of the same type and subject (the tool, the operation, the passage of a study, the answer) whose data changed, then events whose type changed for the same subject. Never compared: event ids, times, metadata, `incident.reported` events (they record deliveries and throttling; the event that raised the incident is compared), and the values the SDK writes that change from one run to the next: the duration of a tool call, token usage, retry delays, approval ids, the run a replay comes from, the time and source event of an observation. The text a model writes next to a tool call is compared in `intention.generated` only. A tool's parameters, result and input are always compared, whatever their keys: a `duration` argument that went from 30 to 60 is a change. A run that does the same thing again passes; a tool called with other arguments is reported where it happened (`parameters.metric: "churn" → "revenue"`); a call inserted before an identical one is one added call; an `action.executed` that became `action.failed` is one change, not a loss plus an addition.

| Option | For | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | Validation | Compare fewer events |
| `tolerance.dataFields` | Validation | More data fields left out, at any depth |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | Validation | Timing is compared, relative to the start of each run, only with `timestampMs` |
| `compareStructureOnly` | Validation | Data differences give `partial`, not `fail`; events added, removed, moved or of another type still fail |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | Regressions | Compare fewer events, leave data fields out |
| `tolerance.criticalEventTypes` | Regressions | Types whose appearance, loss or change is critical (default: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | Regressions | Up to this many added or removed process events (policy checks, retries, approvals) are tolerated; a change of the result never is |
| `tolerance.maxDurationDiff`, `severityThresholds` | Regressions | Duration is checked only with one of them: a run slower by more than `maxDurationDiff` ms regresses, with the severity of the highest threshold reached; a faster run never regresses |

### Regression suites

| Method | Returns | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | Saved in `regressionTestSuitesDir`. `agent`: the id or the name of an agent of this SDK. Each golden trace must exist; `input` defaults to the one the golden run received; a suite does not keep the `signal` or the callbacks (`onEvent`, `onText`, `onTextRestart`) of an input |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | Newest first |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | Every suite of the agent, oldest first: each test sends its input to the agent and compares the run with its golden trace; `suites` holds one result per suite |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | One suite |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 every test passed, 1 a test found a regression, 2 a test could not run (error or timeout); `exitCode: false` in the options gives 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML: one `<testsuite>` per suite; a test that could not run (error or timeout) is an `<error>`; characters XML cannot hold are removed |

Agent ids are new in every process: a suite also records the **name** of its agent, and another process runs it with its agent of that name (with the suite's agent id first, when that agent is in the SDK). Within one SDK, an agent's id is its own: two agents with the same name (two versions, say) each keep their suites, assertions and golden traces, and a name designates all of them. Every agent created with `createAgent` stays in its SDK, so an application that creates an agent per request makes the name ambiguous: pass ids, or create each agent once and reuse it. Suites saved by earlier versions record no name: they run only in the process that created them. Options: `parallel` (the tests of a suite at the same time), `stopOnFirstFailure` (sequential runs only: nothing runs after the first test that does not pass, next suites included), `filterTags`, `excludeTags`, `timeout` (ms per test, 60 000 by default, at most 2 147 483 647; past it the run is cancelled and the test is `timeout`) and `detection` (the regression options above).

### Assertions

| Method | Returns | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | For every run, or for one agent's runs; an agent of this SDK given by `agentId` also records its name. A condition that could not be evaluated is refused with a `ValidationError` |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | Newest first |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | The assertions given (an unknown id throws), or else the ones for every run plus those of the run's agent |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | Needs | Passes when |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` or `eventTypes` | One of the types occurs / none does |
| `event_count` | `eventType` or `eventTypes`, then `count`, or `minCount` and `maxCount` | The number of such events fits |
| `event_order` | `beforeEventType`, `afterEventType` | The first of one comes before the first of the other |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | Every event of the type matches |
| `custom` | `customEvaluator(events) => boolean` | The function returns `true` |

A `custom` assertion holds a function, which cannot be written to a file: it is **not saved** and lasts as long as the SDK instance that defined it, so define it again at start-up. The other types are saved in `assertionsDir`.

### Comparisons and impact

| Method | Returns | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | Differences aligned by meaning, as above: `event_added`, `event_removed`, `event_modified` (type changed), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | Before and after averages of `duration` (ms), `cost` (USD of the priced model calls, as `getRunCost`), `quality` (share of events that are not failed actions) and `success_rate`, with behavior changes; saved in `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` on the runs of a governed agent (its name, or the id of an agent of this SDK) recorded with each version: its `version` or its `configHash`. Every agent with that name counts. Replays are left out; the two versions must differ and select different runs; an unknown version throws, listing the recorded ones |

The lifecycle events of a governed agent's runs (`run.started`, `run.completed`…) record its `agentName`, `agentVersion` and `configHash`: two agents with the same name are one agent in two versions, or in two processes. The hash covers the model, the system prompt, `maxSteps` and `timeout`, the provider settings, `version`, the capabilities, the tools (name, description, version, parameter schema, metadata, retry settings) and the agent's own policies with their rules; it changes with `setPolicy` and `addTools`, and each run records the one it started with. Runs recorded by earlier versions only have the id and the version.

### Queries across runs

| Method | Returns |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: matching events in time order (at most `limit`), events in scope, matching events |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

A filter has a **scope** — `runId` (without it, every run), `since`, `until` — and **conditions** — `type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) and `metadataFilters` (`{ field, operator, value? }`). The conditions are combined with `logic` (`and` by default; `or`: at least one), then negated by `not`; the scope never is. Every built-in store answers: the file store reads each run file once per query, the SQL stores query the database. When every condition must hold, the database narrows the events by type and ids itself; with `or` or `not`, the store returns every event in scope and the conditions are checked in memory, which costs more on a large database. Events of the same millisecond keep the order of their run: runs by id, then in the order each run recorded them.

## Live events

A listener is `(event: Event) => unknown`. It gets one event at a time, in the order of each run, once the store has accepted it; a promise it returns is awaited before its next event. Runs never wait for it, and its errors are reported, never thrown into the run. At most `maxQueued` events (10 000 by default) wait for it; past that, new ones are dropped for it and reported with a `LiveEventsDroppedError`. See [Live progress](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Every event of the run; `run()` resolves once the listener has settled on each of them, or earlier when the run was stopped or cancelled or `signal` aborts (the listener is then unsubscribed). The listener is not recorded |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | The same for a cognitive run, whose `limits.timeoutMs` also ends the wait |
| `StudyRunOptions.onEvent`: `study.run({ onEvent })` | The same for a study's run, whose `limits.timeoutMs` also ends the wait |
| `replay(runId, modifications?, { onEvent })` | The same for a replay, which cannot be cancelled: it always waits |
| `executeTool(name, params, { onEvent })` | The events of the call, and of the runs its tool starts, one level deep: the handler gets the listener as `context.onEvent`, which `governedAgentTool` and `cognitiveAgentTool` pass to their agent (an agent built by hand on a store without live events runs without it). `signal` ends the wait |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: every event of every run that matches the filter (`agentId` is `metadata.agentId`), until you call the returned function, which drops the events not yet delivered. Regression-suite runs and replays are real runs: it gets their events too (a suite does not keep the `onEvent` or `onText` of its input) |
| `new ObservedEventStore(store, { onListenerError? })` | The layer that delivers them; the SDK wraps its store in one, or uses the one you give as `eventStore`, also inside a `MonitoredEventStore` (whose incident reports are then delivered too). Its `subscribe(listener, options?)` returns `{ unsubscribe(), close() }`: `close()` waits until the listener has settled on the events it already took. `onListenerError` gets listener errors and drops |

## Tools: `ToolDefinition`

| Field | |
| --- | --- |
| `name`, `description` | What the model sees |
| `schema` | Zod schema of the arguments; calls that do not match are refused |
| `handler(params, context?)` | Receives the validated arguments and `{ runId, agentId, signal?, onEvent? }` — `signal` is aborted when the caller gives up; `onEvent` is set when the caller watches the call live: pass it as the `onEvent` of the runs the tool starts |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — idempotent tools only; invalid arguments are never retried |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` makes every call wait for `approveAction`; `readOnly` is shown to MCP clients as `readOnlyHint` |
| `inputJsonSchema` | JSON Schema shown instead of the one derived from `schema` |
| `capability`, `version` | Grouping, version |

## Tool sources

Each returns ready-made `ToolDefinition`s: pass them to `sdk.defineTool`, to an agent, or directly to an MCP server's `tools`. See [An MCP server for anything](../guide/mcp-recipes).

| Function | Returns | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | One tool per operation of an OpenAPI 3 description; only `GET` unless listed in `include`; other methods require approval by default. A call returns `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` over one folder, never outside it; an excluded folder hides all it holds |
| `folderResources(options)` | `ResourceProvider` | The same files as MCP resources `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (one read-only statement, at most `maxRows` rows, default 100) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | For `node:sqlite` `DatabaseSync` or `better-sqlite3`; runs queries with `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | For `pg` (a dedicated client, or a pool); each query in `BEGIN READ ONLY` (refused on a connection already inside a transaction) … `ROLLBACK` + `pg_advisory_unlock_all()`, with `SET LOCAL statement_timeout` (default 10 s); `schemas` limits listing and describing only |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; cancelled with the caller; `error` is generic unless `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | The statement check used by the database adapters (SQLite and PostgreSQL syntax only) |

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

## MCP — `@sdk-ai-agents/core/mcp`

| Function | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | MCP `Server` exposing exactly what `tools` lists: names of defined tools and/or `ToolDefinition`s (defined on the SDK for you; the same definition may be passed again, another tool with a taken name is refused). `resources`: one or several `ResourceProvider`s; every read is traced. Calls run as `mcp:<name>` (or `agentId`); an approval nobody decides within `approvalTimeoutMs` (default 50 000 ms) is cancelled; input refusals are explained to the client, other causes only with `exposeErrorDetails`. A call with a `progressToken` gets a `notifications/progress` per event, all sent before the result ([progress notifications](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | Same, connected to stdin/stdout; writes one "ready" line to stderr, and closes when stdin ends (calls in progress are aborted, pending approvals cancelled). `approvalTimeoutMs` defaults to 50 000, as for `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — the tools of any MCP server, as `ToolDefinition`s |

`GovernedToolHost` is what the server needs from the SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` returns an object that implements it.

## Building blocks

The SDK's building blocks are exported for custom setups: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, and their main types.
