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
| `run.started` | `input`, `mode` (`cognitive`, `tool` for a call outside an agent such as an MCP call, `resource` for an MCP resource read, or absent for governed runs), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitive) |
| `run.failed` | `error`, `steps?`, `uri?` (failed resource read) |
| `run.cancelled` / `run.stopped` | `reason` |

## Reasoning and actions

| Type | Data |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — or `intention` for a cognitive final answer |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies` (`allowed-tools` when a caller used a tool it was not given; the budget policy's id when its call budget is spent) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` when the tool's own `metadata.requiresApproval` asked for it), `reason?` (`cancelled before a decision` when the caller gave up or the run stopped, `no decision within N ms` after `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` also records a call refused for invalid arguments (before any policy) or because its caller left after an approval |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` of the content served (the content itself is not stored) |

`tool.failed`, `intention.rejected` and `error.occurred` belong to the `EventType` type, but the SDK never records them: a failed tool call is an `action.failed` event, a call refused by a policy a `policy.violated` event, and one rejected at approval an `approval.rejected` event.

## Cognition

| Type | Data |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; absent on older runs), `goal`, `context?`, `observations` (given with the problem), `commitRules`, `knowledge?` (`scope`, `items` recalled from earlier runs, `error?` when the store failed), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (the engine imposed a decision), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — the full report of a prediction test |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (statement, kind, scope, `revises?`, `difference?`, `evidence`: each test with `runId`, `predictionId`, `verdict`, `expected`, `observed`, evaluator), `error?` when the store failed. Appended after `run.completed`, `run.failed` or `run.cancelled`, and only when the run tested something |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers`, `usage`, `step?` |

## Operations

| Type | Data |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

The mental state of a cognitive run is the fold of its `cognition.thought` patches in `step` order, starting from the goal and observations of `cognition.started`. Observations produced during the run are carried by the thought patches, with `sourceEventId` pointing to the `action.executed` or `cognition.evaluated` event that holds the full payload. Runs without `schemaVersion` are rebuilt with the rules they were recorded with.
