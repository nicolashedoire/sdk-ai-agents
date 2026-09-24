# 이벤트 카탈로그

모든 이벤트는 같은 봉투(envelope) 구조를 가집니다.

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

## 실행 생명 주기 {#run-lifecycle}

| 유형 | 데이터 |
| --- | --- |
| `run.started` | `input`, `mode`(`cognitive`, MCP 호출처럼 에이전트 밖에서의 호출이면 `tool`, MCP 리소스 읽기면 `resource`, 통제형 실행이면 없음), `replayOf?` |
| `run.completed` | `output`, `decision?`(인지 실행) |
| `run.failed` | `error`, `steps?`, `uri?`(실패한 리소스 읽기) |
| `run.cancelled` / `run.stopped` | `reason` |

## 추론과 행동 {#reasoning-and-actions}

| 유형 | 데이터 |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — 또는 인지 최종 답의 경우 `intention` |
| `intention.rejected` | `reason` |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies`(호출한 쪽이 받지 않은 도구를 쓴 경우 `allowed-tools`, 호출 예산이 소진된 경우 예산 정책의 id) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId`(도구 자체의 `metadata.requiresApproval`이 요구한 경우 `tool-requires-approval`), `reason?`(호출한 쪽이 포기했거나 실행이 멈춘 경우 `cancelled before a decision`, `approvalTimeoutMs`가 지난 경우 `no decision within N ms`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed`는 (모든 정책보다 먼저) 잘못된 인자 때문에 거부된 호출이나, 승인 뒤에 호출한 쪽이 떠나서 거부된 호출도 기록합니다 |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `resource.read` | `uri`, `mimeType?`, `bytes`, 제공한 내용의 `sha256`(내용 자체는 저장되지 않음) |

## 인지 {#cognition}

| 유형 | 데이터 |
| --- | --- |
| `cognition.started` | `schemaVersion`(2, 오래된 실행에는 없음), `goal`, `context?`, `observations`(문제와 함께 주어진 것), `commitRules`, `knowledge?`(`scope`, 이전 실행에서 불러온 `items`, 저장소가 실패한 경우 `error?`), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?`(엔진이 결정을 강제함), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?`(`promptTokens`, `completionTokens`, `calls`) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator`(`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — 예측 테스트의 전체 보고서 |
| `cognition.concluded` | `decision`, `status`(`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings`(진술, 종류, 범위, `revises?`, `difference?`, `evidence`: `runId`, `predictionId`, `verdict`, `expected`, `observed`, 평가기를 가진 각 테스트), 저장소가 실패한 경우 `error?`. `run.completed`, `run.failed` 또는 `run.cancelled` 뒤에 덧붙여지며, 실행이 무언가를 테스트했을 때만 덧붙여집니다 |
| `cognition.feedback` | `feedback`(`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose`(`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers`, `usage`, `step?` |

## 운영 {#operations}

| 유형 | 데이터 |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?`(`throttled`, `below minimum severity`) |
| `error.occurred` | `error` |

인지 실행의 심적 상태는 `cognition.started`의 목표와 관찰에서 시작해, 그 `cognition.thought` 패치들을 `step` 순서대로 적용(fold)한 결과입니다. 실행 중에 만들어진 관찰은 사고 패치에 담겨 운반되며, `sourceEventId`가 전체 페이로드를 담은 `action.executed`나 `cognition.evaluated` 이벤트를 가리킵니다. `schemaVersion`이 없는 실행은 기록될 당시의 규칙으로 재구성됩니다.
