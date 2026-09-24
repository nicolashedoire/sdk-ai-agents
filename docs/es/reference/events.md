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
| `run.started` | `input`, `mode` (`cognitive`, `tool` para una llamada fuera de un agente como una llamada MCP, `resource` para una lectura de recurso MCP, o ausente en las ejecuciones gobernadas), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitiva) |
| `run.failed` | `error`, `steps?`, `uri?` (lectura de recurso fallida) |
| `run.cancelled` / `run.stopped` | `reason` |

## Razonamiento y acciones {#reasoning-and-actions}

| Tipo | Datos |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — o `intention` para una respuesta final cognitiva |
| `policy.checked` / `policy.violated` | `intention`, `validation` / `reason`, `violatedPolicies` (`allowed-tools` cuando quien llama usó una herramienta que no se le dio; el identificador de la política de presupuesto cuando se ha agotado su presupuesto de llamadas) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` cuando la pidió el propio `metadata.requiresApproval` de la herramienta), `reason?` (`cancelled before a decision` cuando quien llama se rindió o la ejecución se detuvo, `no decision within N ms` tras `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` también registra una llamada rechazada por argumentos no válidos (antes de cualquier política) o porque quien llamaba se fue tras una aprobación |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `usage`, `reason` — una respuesta facturada por el fabricante, con el consumo del que informó, que el proveedor no pudo usar (una respuesta de OpenAI sin ninguna opción); se cuenta en los costes y los presupuestos |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` del contenido servido (el propio contenido no se guarda) |

`tool.failed`, `intention.rejected` y `error.occurred` forman parte del tipo `EventType`, pero el SDK nunca los registra: una llamada a herramienta que falla es un evento `action.failed`; una rechazada por una política, un evento `policy.violated`, y una rechazada en la aprobación, un evento `approval.rejected`.

## Cognición {#cognition}

| Tipo | Datos |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; ausente en las ejecuciones más antiguas), `goal`, `context?`, `observations` (dadas con el problema), `commitRules`, `knowledge?` (`scope`, `items` recuperados de ejecuciones anteriores, `error?` cuando falló el almacén), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (el motor impuso una decisión), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — llamadas que no informaron de ningún número de tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — y además `model?`, `requestedModel?`, `usage?` para una operación interrumpida por una parada o un tiempo límite tras intentos facturados |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — el informe completo de una prueba de predicción |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (afirmación, tipo, ámbito, `revises?`, `difference?`, `evidence`: cada prueba con `runId`, `predictionId`, `verdict`, `expected`, `observed`, evaluador), `error?` cuando falló el almacén. Se añade después de `run.completed`, `run.failed` o `run.cancelled`, y solo cuando la ejecución puso algo a prueba |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (vacío si se rechazó la respuesta), `usage?` (ausente si el backend no informó de ningún número de tokens), `error?` (por qué se rechazó una respuesta facturada), `step?` |

## Operación en producción {#operations}

| Tipo | Datos |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

El estado mental de una ejecución cognitiva es el resultado de aplicar sus parches `cognition.thought` en el orden de `step`, partiendo del objetivo y las observaciones de `cognition.started`. Las observaciones producidas durante la ejecución las llevan los parches de pensamiento, con `sourceEventId` apuntando al evento `action.executed` o `cognition.evaluated` que contiene el contenido completo. Las ejecuciones sin `schemaVersion` se reconstruyen con las reglas con las que se registraron.
