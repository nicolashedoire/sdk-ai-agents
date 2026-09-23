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
| `run.started` | `input`, `mode` (`cognitive`, `tool`, or absent for governed runs), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitive) |
| `run.failed` | `error`, `steps?` |
| `run.cancelled` / `run.stopped` | `reason` |

## Reasoning and actions

| Type | Data |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — or `intention` for a cognitive final answer |
| `intention.rejected` | `reason` |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies` (`allowed-tools` when a caller used a tool it was not given) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |

## Cognition

| Type | Data |
| --- | --- |
| `cognition.started` | `goal`, `context?`, `profile`, `controller`, `assessor`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` |
| `cognition.concluded` | `decision`, `confidence`, `steps`, `hypotheses` |
| `cognition.feedback` | `feedback`, `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers`, `usage`, `step?` |

## Operations

| Type | Data |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |
| `error.occurred` | `error` |

The mental state of a cognitive run is the fold of its `cognition.thought` patches in `step` order, starting from the goal of `cognition.started`.
