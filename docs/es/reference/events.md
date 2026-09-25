# Catálogo de eventos

Todos los eventos tienen la misma envoltura:

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

## Ciclo de vida de una ejecución {#run-lifecycle}

| Tipo | Datos |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`, `study` para la ejecución de un estudio, `study-amendment` para la ejecución que clasifica una enmienda, `tool` para una llamada fuera de un agente como una llamada MCP, `resource` para una lectura de recurso MCP, o ausente en las ejecuciones gobernadas), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitiva) |
| `run.failed` | `error`, `steps?`, `uri?` (lectura de recurso fallida) |
| `run.cancelled` / `run.stopped` | `reason` |

## Razonamiento y acciones {#reasoning-and-actions}

| Tipo | Datos |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — o `intention` para una respuesta final cognitiva |
| `policy.checked` | `intention`, `validation`: el veredicto del motor de acciones sobre una llamada a herramienta. El motor de políticas también registra un evento por cada política que comprueba — `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true` cuando la política se aplicó y rechazó) y `reason` — antes de una llamada a herramienta, y antes de cada paso de una ejecución cognitiva para las políticas de presupuesto y de tiempo límite que pueden aplicarse a un paso (`intention` es entonces `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools` cuando quien llama usó una herramienta que no se le dio; el identificador de la política de presupuesto cuando se ha agotado su presupuesto de llamadas), y `step` cuando una política de presupuesto o de tiempo límite rechazó un paso de una ejecución cognitiva, o `passage` un pasaje de un estudio (su `intention` es entonces `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` cuando la pidió el propio `metadata.requiresApproval` de la herramienta), `reason?` (`cancelled before a decision` cuando quien llama se rindió o la ejecución se detuvo, `no decision within N ms` tras `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` también registra una llamada rechazada por argumentos no válidos (antes de cualquier política) o porque quien llamaba se fue tras una aprobación |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — una respuesta facturada por el fabricante, con el consumo del que informó, que el proveedor no pudo usar (una respuesta de OpenAI sin ninguna opción); se cuenta en los costes y en los presupuestos por periodo |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` del contenido servido (el propio contenido no se guarda) |

`tool.failed`, `intention.rejected` y `error.occurred` forman parte del tipo `EventType`, pero el SDK nunca los registra: una llamada a herramienta que falla es un evento `action.failed`; una rechazada por una política, un evento `policy.violated`, y una rechazada en la aprobación, un evento `approval.rejected`.

## Cognición {#cognition}

| Tipo | Datos |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; ausente en las ejecuciones más antiguas), `goal`, `context?`, `observations` (dadas con el problema), `commitRules`, `knowledge?` (`scope`, `items` recuperados de ejecuciones anteriores, `error?` cuando falló el almacén), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (el motor impuso una decisión), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — llamadas que no informaron a la vez de sus tokens de entrada y de salida, `unmeteredTokens?` — sus tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — y además `model?`, `requestedModel?`, `usage?` para una operación interrumpida por una parada o un tiempo límite tras intentos facturados |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — el informe completo de una prueba de predicción |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (afirmación, tipo, ámbito, `revises?`, `difference?`, `evidence`: cada prueba con `runId`, `predictionId`, `verdict`, `expected`, `observed`, evaluador), `error?` cuando falló el almacén. Se añade después de `run.completed`, `run.failed` o `run.cancelled`, y solo cuando la ejecución puso algo a prueba |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (vacío si se rechazó la respuesta), `usage?` (ausente si el backend no informó de ningún número de tokens), `error?` (por qué se rechazó una respuesta facturada), `step?` |

## Estudios {#studies}

Las ejecuciones de un estudio (`mode: 'study'`) y las ejecuciones que clasifican sus enmiendas (`mode: 'study-amendment'`) registran estos eventos. Cada uno lleva el `id` del estudio como `metadata.agentId` y su nombre como `metadata.studyName`. Las búsquedas también registran los eventos de sus llamadas a herramientas gobernadas (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) en la ejecución del estudio. Consulta [Estudios](../guide/studies).

| Tipo | Datos |
| --- | --- |
| `study.started` | `name`, `charter` (`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash` (SHA-256), `language`, `model?`, `sources` (nombres de herramientas), `limits`, `driftThreshold`, `amendments` (las aceptadas: `number`, `text`), `resumeAt?` (cuando se reanuda una ejecución: el primer pasaje al que le queda trabajo) |
| `study.passage_started` | `passage`, `number` (de 1 a 7), `amendments` (números de las enmiendas aceptadas en vigor), `reopenedBy?`, `focus?`, `reason?` cuando un pasaje posterior lo reabrió, `redo?` y `resumed?` para el pasaje rehecho que una ejecución reanudada le debía, `outdated?` cuando se ejecuta de nuevo por elementos que el guardián juzgó tarde |
| `study.passage_completed` | `passage`, `attempts` (2 cuando el guardián hizo que se rehiciera), `keptAttempt?` (1 cuando el primer intento era mejor que el segundo y se conservó), `discarded?` (`attempt`, `items`: el segundo intento, entonces descartado), `items` (cada uno con su `collection`, `id`, `statement`, `status`, `sources`, `servesObjective`, los demás campos de una afirmación y sus campos propios), `reopenedBy?`, `reopen?` (`passage`, `focus`, `reason`: el pasaje anterior que pide reabrir; no está completo hasta que se ejecute de nuevo), `resumed?` (una ejecución lo reanudó solo para terminarlo), `duplicates?` (veredictos dados de nuevo sobre pistas ya juzgadas: descartados, no son desvíos) |
| `study.search` | `passage`, `purpose` (`research`, o `priorArt` para lo existente sobre las novedades), `tool`, `query`, `servesObjective`, `claims?` (las novedades que busca), `resultIds`, `results` (`id`, `title`, `locator`, `date?`), `error?` (la búsqueda falló), `skipped?` (`maxSearches`: no se ejecutó) |
| `study.model_called` | `purpose` (`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?`: un solo evento para una llamada y su reparación), `failed?` (por qué no se pudo usar la respuesta), `usedAttempt?` (1 cuando no se pudo usar la reparación y se usó la primera respuesta, leída con tolerancia) — se cuenta en los costes y en los presupuestos por periodo |
| `study.drift_rejected` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`code`, `params?`, `message`), `by` (`guardian`: juzgado fuera del objetivo; `schema`: rechazado antes, por ejemplo por no tener `servesObjective`), `attempt` (2 en un pasaje rehecho) |
| `study.capability_demoted` | `passage`, `item` (el identificador de la arquitectura), `name`, `reason` (`code`, `params?`, `message`): una capacidad que el guardián juzgó solo más rápida o más barata, ahora una mejora |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (solo las aceptadas), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`code`, `params?`, `message`; para `unclassified`: `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` o `amendmentPolicy`), `charterHash` — en la ejecución propia de la enmienda |
| `study.result_recorded` | `card`, `resultAndError` (`result`, `error?`), `conclusionAndMemory?` — se añade a la ejecución que escribió la ficha, después de su final |
| `study.completed` | `status`, `passages` (`passage`, `state`), `stats` de esta ejecución (`modelCalls` que respondió el proveedor, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status` (`stopped`, `failed` o `cancelled`), `stoppedBy?`, `error`, `passages`, `stats` de esta ejecución, `partial: true` — después `run.failed`, o `run.cancelled` |

`study.model_called` es lo que leen `getRunCost` y los presupuestos para un estudio. Cuando se comparan dos ejecuciones, los eventos de estudio se emparejan por pasaje (`study.model_called` por propósito y pasaje), y el `usage` de `study.model_called` no se compara. La ejecución de una enmienda contiene `run.started`, `policy.violated` cuando una política de presupuesto rechazó la clasificación, `study.model_called` cuando el proveedor respondió, el evento de la enmienda y `run.completed`.

## Operación en producción {#operations}

| Tipo | Datos |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

El estado mental de una ejecución cognitiva es el resultado de aplicar sus parches `cognition.thought` en el orden de `step`, partiendo del objetivo y las observaciones de `cognition.started`. Las observaciones producidas durante la ejecución las llevan los parches de pensamiento, con `sourceEventId` apuntando al evento `action.executed` o `cognition.evaluated` que contiene el contenido completo. Las ejecuciones sin `schemaVersion` se reconstruyen con las reglas con las que se registraron.
