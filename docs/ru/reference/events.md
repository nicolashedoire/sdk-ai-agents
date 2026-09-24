# Каталог событий

У каждого события одна и та же оболочка:

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

## Жизненный цикл запуска {#run-lifecycle}

| Тип | Данные |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`, `tool` для вызова вне агента, например вызова MCP, `resource` для чтения ресурса MCP, или отсутствует для управляемых запусков), `replayOf?` |
| `run.completed` | `output`, `decision?` (когнитивные) |
| `run.failed` | `error`, `steps?`, `uri?` (неудачное чтение ресурса) |
| `run.cancelled` / `run.stopped` | `reason` |

## Рассуждение и действия {#reasoning-and-actions}

| Тип | Данные |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — или `intention` для итогового когнитивного ответа |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies` (`allowed-tools`, когда вызывающая сторона использовала инструмент, который ей не дали; идентификатор политики бюджета, когда её бюджет вызовов исчерпан) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval`, когда одобрения потребовал собственный `metadata.requiresApproval` инструмента), `reason?` (`cancelled before a decision`, когда вызывающая сторона сдалась или запуск остановился, `no decision within N ms` по истечении `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` также записывает вызов, отклонённый из-за некорректных аргументов (до любой политики) или потому, что вызывающая сторона ушла после одобрения |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` отданного содержимого (само содержимое не хранится) |

`tool.failed`, `intention.rejected` и `error.occurred` входят в тип `EventType`, но SDK никогда их не записывает: неудачный вызов инструмента — это событие `action.failed`, отклонённый политикой — событие `policy.violated`, а отклонённый при одобрении — событие `approval.rejected`.

## Когнитивные события {#cognition}

| Тип | Данные |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; отсутствует в более старых запусках), `goal`, `context?`, `observations` (переданные вместе с задачей), `commitRules`, `knowledge?` (`scope`, `items`, вспомненные из предыдущих запусков, `error?`, если хранилище дало сбой), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (движок навязал решение), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — полный отчёт о проверке предсказания |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (утверждение, вид, область, `revises?`, `difference?`, `evidence`: каждый тест с `runId`, `predictionId`, `verdict`, `expected`, `observed`, оценщиком), `error?`, если хранилище дало сбой. Добавляется после `run.completed`, `run.failed` или `run.cancelled` и только если запуск что-то проверял |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers`, `usage`, `step?` |

## Эксплуатация {#operations}

| Тип | Данные |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

Ментальное состояние когнитивного запуска — это свёртка его патчей `cognition.thought` в порядке `step`, начиная с цели и наблюдений из `cognition.started`. Наблюдения, полученные во время запуска, переносятся патчами мыслей, а `sourceEventId` указывает на событие `action.executed` или `cognition.evaluated`, в котором хранятся полные данные. Запуски без `schemaVersion` восстанавливаются по тем правилам, с которыми они были записаны.
