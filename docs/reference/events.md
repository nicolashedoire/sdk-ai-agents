# Event catalog

Every event has the same envelope:

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

## Run lifecycle

| Type | Data |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`, `study` for a study's run, `study-amendment` for the run that classifies an amendment, `tool` for a call outside an agent such as an MCP call, `resource` for an MCP resource read, or absent for governed runs), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitive) |
| `run.failed` | `error`, `steps?`, `uri?` (failed resource read) |
| `run.cancelled` / `run.stopped` | `reason` |

## Reasoning and actions

| Type | Data |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — or `intention` for a cognitive final answer |
| `policy.checked` | `intention`, `validation`: the action engine's verdict on a tool call. The policy engine also records one event per policy it checks — `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true` when the policy applied and refused) and `reason` — before a tool call, and before each step of a cognitive run for the budget and timeout policies that can apply to a step (`intention` is then `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools` when a caller used a tool it was not given; the budget policy's id when its call budget is spent), and `step` when a budget or timeout policy refused a step of a cognitive run, or `passage` a passage of a study (its `intention` is then `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` when the tool's own `metadata.requiresApproval` asked for it), `reason?` (`cancelled before a decision` when the caller gave up or the run stopped, `no decision within N ms` after `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` also records a call refused for invalid arguments (before any policy) or because its caller left after an approval |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — an answer the vendor billed, with the usage it reported, that the provider could not use (an OpenAI answer without any choice); counted in costs and in budgets per period |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` of the content served (the content itself is not stored) |

`tool.failed`, `intention.rejected` and `error.occurred` belong to the `EventType` type, but the SDK never records them: a failed tool call is an `action.failed` event, a call refused by a policy a `policy.violated` event, and one rejected at approval an `approval.rejected` event.

## Cognition

| Type | Data |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; absent on older runs), `goal`, `context?`, `observations` (given with the problem), `commitRules`, `knowledge?` (`scope`, `items` recalled from earlier runs, `error?` when the store failed), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (the engine imposed a decision), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — calls without both input and output token counts, `unmeteredTokens?` — their tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — and `model?`, `requestedModel?`, `usage?` for an operation cut short by a stop or a timeout after billed attempts |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — the full report of a prediction test |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (statement, kind, scope, `revises?`, `difference?`, `evidence`: each test with `runId`, `predictionId`, `verdict`, `expected`, `observed`, evaluator), `error?` when the store failed. Appended after `run.completed`, `run.failed` or `run.cancelled`, and only when the run tested something |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (empty when rejected), `usage?` (absent when the backend reported no token counts), `error?` (why a billed answer was rejected), `step?` |

## Studies

A study's runs (`mode: 'study'`) and the runs that classify its amendments (`mode: 'study-amendment'`) record these events. Each carries the study's `id` as `metadata.agentId` and its name as `metadata.studyName`. The searches also record the events of their governed tool calls (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) in the study's run. See [Studies](../guide/studies).

| Type | Data |
| --- | --- |
| `study.started` | `name`, `charter` (`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash` (SHA-256), `language`, `model?`, `sources` (tool names), `limits`, `driftThreshold`, `amendments` (the accepted ones: `number`, `text`), `resumeAt?` (when a run resumes: the first passage with work left) |
| `study.passage_started` | `passage`, `number` (1 to 7), `amendments` (numbers of the accepted amendments in force), `reopenedBy?`, `focus?`, `reason?` when a later passage reopened it, `redo?` and `resumed?` for the redo a resumed run owed it, `outdated?` when it runs again for items the guardian judged late |
| `study.passage_completed` | `passage`, `attempts` (2 when the guardian had it redone), `keptAttempt?` (1 when the first attempt was better than the redo and was kept), `discarded?` (`attempt`, `items`: the redo then discarded), `items` (each with its `collection`, `id`, `statement`, `status`, `sources`, `servesObjective`, the other fields of a claim and its own fields), `reopenedBy?`, `reopen?` (`passage`, `focus`, `reason`: the earlier passage it asks to reopen; it is not complete until it runs again), `resumed?` (a run resumed it only to finish it), `duplicates?` (verdicts given again on leads already judged: dropped, not drift) |
| `study.search` | `passage`, `purpose` (`research`, or `priorArt` for the prior art of novelties), `tool`, `query`, `servesObjective`, `claims?` (the novelties it looks for), `resultIds`, `results` (`id`, `title`, `locator`, `date?`), `error?` (the search failed), `throttled?` (it failed from a throttle), `retry?` (the second try of a throttled prior-art search), `skipped?` (`maxSearches`: not run) |
| `study.model_called` | `purpose` (`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?`: one event for a call and its repair), `failed?` (why the reply could not be used), `usedAttempt?` (1 when the repair could not be used and the first reply was, read leniently) — counted in costs and in budgets per period |
| `study.drift_rejected` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`code`, `params?`, `message`), `by` (`guardian`: judged off the objective; `schema`: refused before, for example without `servesObjective`), `attempt` (2 in a redo) |
| `study.capability_demoted` | `passage`, `item` (the architecture's id), `name`, `reason` (`code`, `params?`, `message`): a capability the guardian judged only faster or cheaper, now an improvement |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (accepted only), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`code`, `params?`, `message`; for `unclassified`: `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` or `amendmentPolicy`), `charterHash` — in the amendment's own run |
| `study.result_recorded` | `card`, `resultAndError` (`result`, `error?`), `conclusionAndMemory?` — appended to the run that wrote the card, after its end |
| `study.completed` | `status`, `passages` (`passage`, `state`), `stats` of this run (`modelCalls` the vendor answered, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status` (`stopped`, `failed` or `cancelled`), `stoppedBy?`, `error`, `passages`, `stats` of this run, `partial: true` — then `run.failed`, or `run.cancelled` |

`study.model_called` is what `getRunCost` and budgets read for a study. When two runs are compared, study events are paired by passage (`study.model_called` by purpose and passage), and the `usage` of `study.model_called` is not compared. An amendment's run holds `run.started`, `policy.violated` when a budget policy refused the classification, `study.model_called` when the vendor answered, the amendment's event and `run.completed`.

## Operations

| Type | Data |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

The mental state of a cognitive run is the fold of its `cognition.thought` patches in `step` order, starting from the goal and observations of `cognition.started`. Observations produced during the run are carried by the thought patches, with `sourceEventId` pointing to the `action.executed` or `cognition.evaluated` event that holds the full payload. Runs without `schemaVersion` are rebuilt with the rules they were recorded with.
