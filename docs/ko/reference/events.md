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
| `run.started` | `input`, `mode`(`cognitive`, 연구의 실행이면 `study`, 개정안을 분류하는 실행이면 `study-amendment`, MCP 호출처럼 에이전트 밖에서의 호출이면 `tool`, MCP 리소스 읽기면 `resource`, 통제형 실행이면 없음), `replayOf?` |
| `run.completed` | `output`, `decision?`(인지 실행) |
| `run.failed` | `error`, `steps?`, `uri?`(실패한 리소스 읽기) |
| `run.cancelled` / `run.stopped` | `reason` |

## 추론과 행동 {#reasoning-and-actions}

| 유형 | 데이터 |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — 또는 인지 최종 답의 경우 `intention` |
| `policy.checked` | `intention`, `validation`: 도구 호출에 대한 액션 엔진의 판정. 정책 엔진도 검사한 정책마다 이벤트 하나(`policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied`(정책이 적용되어 거부했으면 `true`), `reason`)를 기록합니다. 도구 호출 전에 기록하고, 단계에 적용될 수 있는 예산·타임아웃 정책은 인지 실행의 각 단계 전에도 기록하며, 단계의 경우 `intention`은 `{ type: 'continue' }`입니다 |
| `policy.violated` | `intention`, `reason`, `violatedPolicies`(호출한 쪽이 받지 않은 도구를 쓴 경우 `allowed-tools`, 호출 예산이 소진된 경우 예산 정책의 id), 그리고 예산 또는 타임아웃 정책이 인지 실행의 단계를 거부한 경우 `step`, 연구의 과정을 거부한 경우 `passage`(이때 `intention`은 `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId`(도구 자체의 `metadata.requiresApproval`이 요구한 경우 `tool-requires-approval`), `reason?`(호출한 쪽이 포기했거나 실행이 멈춘 경우 `cancelled before a decision`, `approvalTimeoutMs`가 지난 경우 `no decision within N ms`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed`는 (모든 정책보다 먼저) 잘못된 인자 때문에 거부된 호출이나, 승인 뒤에 호출한 쪽이 떠나서 거부된 호출도 기록합니다 |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — 벤더가 청구하고 사용량도 보고했지만 프로바이더가 쓸 수 없었던 응답(선택지가 하나도 없는 OpenAI 응답). 비용과 기간별 예산에 집계됩니다 |
| `resource.read` | `uri`, `mimeType?`, `bytes`, 제공한 내용의 `sha256`(내용 자체는 저장되지 않음) |

`tool.failed`, `intention.rejected`, `error.occurred`는 `EventType` 타입에 포함되지만 SDK는 이들을 절대 기록하지 않습니다. 실패한 도구 호출은 `action.failed` 이벤트로, 정책에 거부된 호출은 `policy.violated` 이벤트로, 승인 단계에서 거절된 호출은 `approval.rejected` 이벤트로 기록됩니다.

## 인지 {#cognition}

| 유형 | 데이터 |
| --- | --- |
| `cognition.started` | `schemaVersion`(2, 오래된 실행에는 없음), `goal`, `context?`, `observations`(문제와 함께 주어진 것), `commitRules`, `knowledge?`(`scope`, 이전 실행에서 불러온 `items`, 저장소가 실패한 경우 `error?`), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?`(엔진이 결정을 강제함), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?`(`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — 입력 토큰 수와 출력 토큰 수를 모두 보고하지는 않은 호출, `unmeteredTokens?` — 그 호출들의 토큰) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — 청구된 시도 뒤에 중지나 타임아웃으로 중단된 연산이면 `model?`, `requestedModel?`, `usage?`도 |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator`(`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — 예측 테스트의 전체 보고서 |
| `cognition.concluded` | `decision`, `status`(`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings`(진술, 종류, 범위, `revises?`, `difference?`, `evidence`: `runId`, `predictionId`, `verdict`, `expected`, `observed`, 평가기를 가진 각 테스트), 저장소가 실패한 경우 `error?`. `run.completed`, `run.failed` 또는 `run.cancelled` 뒤에 덧붙여지며, 실행이 무언가를 테스트했을 때만 덧붙여집니다 |
| `cognition.feedback` | `feedback`(`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose`(`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers`(답이 거부되었으면 비어 있음), `usage?`(백엔드가 토큰 수를 보고하지 않았으면 없음), `error?`(청구된 답이 거부된 이유), `step?` |

## 연구 {#studies}

연구의 실행(`mode: 'study'`)과 그 개정안을 분류하는 실행(`mode: 'study-amendment'`)이 이 이벤트들을 기록합니다. 각 이벤트는 연구의 `id`를 `metadata.agentId`로, 연구의 이름을 `metadata.studyName`으로 담습니다. 검색은 자신의 통제된 도구 호출 이벤트(`action.executing`, `policy.checked`, `tool.called`, `action.executed`)도 연구의 실행에 기록합니다. [연구](../guide/studies)를 보세요.

| 유형 | 데이터 |
| --- | --- |
| `study.started` | `name`, `charter`(`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash`(SHA-256), `language`, `model?`, `sources`(도구 이름), `limits`, `driftThreshold`, `amendments`(수락된 개정안: `number`, `text`), `resumeAt?`(실행이 재개될 때: 할 일이 남은 첫 과정) |
| `study.passage_started` | `passage`, `number`(1부터 7까지), `amendments`(효력이 있는 수락된 개정안의 번호), 나중 과정이 이 과정을 다시 연 경우 `reopenedBy?`, `focus?`, `reason?`, 재개된 실행이 이 과정에 해 주어야 했던 재수행이면 `redo?`와 `resumed?`, 감시자가 뒤늦게 판단한 항목 때문에 다시 실행되면 `outdated?` |
| `study.passage_completed` | `passage`, `attempts`(감시자가 다시 수행하게 했으면 2), `keptAttempt?`(첫 시도가 재수행보다 나아서 보관되었으면 1), `discarded?`(`attempt`, `items`: 그때 버려진 재수행), `items`(각각 `collection`, `id`, `statement`, `status`, `sources`, `servesObjective`, 주장의 다른 필드와 고유 필드를 가짐), `reopenedBy?`, `reopen?`(`passage`, `focus`, `reason`: 다시 열어 달라고 요청하는 앞선 과정. 이 과정은 다시 실행될 때까지 완료되지 않음), `resumed?`(실행이 이 과정을 마무리하기 위해서만 재개함), `duplicates?`(이미 판정된 단서에 다시 내려진 판정: 버려지며, 이탈이 아님) |
| `study.search` | `passage`, `purpose`(`research`, 또는 신규 주장의 선행 기술이면 `priorArt`), `tool`, `query`, `servesObjective`, `claims?`(찾고 있는 신규 주장), `resultIds`, `results`(`id`, `title`, `locator`, `date?`), `error?`(검색 실패), `skipped?`(`maxSearches`: 실행되지 않음) |
| `study.model_called` | `purpose`(`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage`(`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?`: 호출과 그 수정에 이벤트 하나), `failed?`(응답을 쓸 수 없었던 이유), `usedAttempt?`(수정을 쓸 수 없어 첫 응답을 관대하게 읽어 썼으면 1) — 비용과 기간별 예산에 집계됩니다 |
| `study.drift_rejected` | `passage`, `collection`, `item`(`id?`, `statement?`, `servesObjective?`), `reason`(`code`, `params?`, `message`), `by`(`guardian`: 목표를 벗어났다고 판단됨. `schema`: 그 전에 거부됨, 예를 들어 `servesObjective`가 없음), `attempt`(재수행에서는 2) |
| `study.capability_demoted` | `passage`, `item`(아키텍처의 id), `name`, `reason`(`code`, `params?`, `message`): 감시자가 단지 더 빠르거나 더 싸다고 판단해 이제 개선이 된 역량 |
| `study.amendment_accepted` / `study.amendment_refused` | `number?`(수락된 경우만), `text`, `verdict`(`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason`(`code`, `params?`, `message`. `unclassified`이면 `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` 또는 `amendmentPolicy`), `charterHash` — 개정안 자체의 실행에 기록됩니다 |
| `study.result_recorded` | `card`, `resultAndError`(`result`, `error?`), `conclusionAndMemory?` — 카드를 작성한 실행에, 그 실행이 끝난 뒤 덧붙여집니다 |
| `study.completed` | `status`, `passages`(`passage`, `state`), 이 실행의 `stats`(벤더가 응답한 `modelCalls`, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status`(`stopped`, `failed` 또는 `cancelled`), `stoppedBy?`, `error`, `passages`, 이 실행의 `stats`, `partial: true` — 그다음 `run.failed` 또는 `run.cancelled` |

`study.model_called`는 `getRunCost`와 예산이 연구에 대해 읽는 이벤트입니다. 두 실행을 비교할 때 연구 이벤트는 과정별로 짝지어지며(`study.model_called`는 목적과 과정별로), `study.model_called`의 `usage`는 비교되지 않습니다. 개정안의 실행에는 `run.started`, 예산 정책이 분류를 거부했을 때의 `policy.violated`, 벤더가 응답했을 때의 `study.model_called`, 개정안의 이벤트, `run.completed`가 담깁니다.

## 운영 {#operations}

| 유형 | 데이터 |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?`(`throttled`, `below minimum severity`) |

인지 실행의 심적 상태는 `cognition.started`의 목표와 관찰에서 시작해, 그 `cognition.thought` 패치들을 `step` 순서대로 적용(fold)한 결과입니다. 실행 중에 만들어진 관찰은 사고 패치에 담겨 운반되며, `sourceEventId`가 전체 페이로드를 담은 `action.executed`나 `cognition.evaluated` 이벤트를 가리킵니다. `schemaVersion`이 없는 실행은 기록될 당시의 규칙으로 재구성됩니다.
