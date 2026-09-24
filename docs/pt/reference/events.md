# Catálogo de eventos

Todos os eventos têm o mesmo envelope:

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

## Ciclo de vida de uma execução {#run-lifecycle}

| Tipo | Dados |
| --- | --- |
| `run.started` | `input`, `mode` (`cognitive`, `tool` para uma chamada fora de um agente, como uma chamada MCP, `resource` para uma leitura de recurso MCP, ou ausente nas execuções governadas), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitiva) |
| `run.failed` | `error`, `steps?`, `uri?` (leitura de recurso que falhou) |
| `run.cancelled` / `run.stopped` | `reason` |

## Raciocínio e ações {#reasoning-and-actions}

| Tipo | Dados |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — ou `intention` para uma resposta final cognitiva |
| `policy.checked` | `intention`, `validation`: o veredito do motor de ações sobre uma chamada de ferramenta. O motor de políticas também registra um evento por política que verifica — `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true` quando a política se aplicou e recusou) e `reason` — antes de uma chamada de ferramenta, e antes de cada etapa de uma execução cognitiva para as políticas de orçamento e de timeout que podem se aplicar a uma etapa (`intention` é então `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools` quando quem chamou usou uma ferramenta que não recebeu; o id da política de orçamento quando o seu orçamento de chamadas se esgotou), e `step` quando uma política de orçamento ou de timeout recusou uma etapa de uma execução cognitiva (o seu `intention` é então `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` quando foi o próprio `metadata.requiresApproval` da ferramenta que a pediu), `reason?` (`cancelled before a decision` quando quem chamou desistiu ou a execução parou, `no decision within N ms` depois de `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` também registra uma chamada recusada por argumentos inválidos (antes de qualquer política) ou porque quem chamou saiu depois de uma aprovação |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `usage`, `reason` — uma resposta cobrada pelo fornecedor, com o consumo que ele informou, que o provedor não pôde usar (uma resposta da OpenAI sem nenhuma escolha); contada nos custos e, nos agentes governados, nos orçamentos por período |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` do conteúdo servido (o próprio conteúdo não é armazenado) |

`tool.failed`, `intention.rejected` e `error.occurred` fazem parte do tipo `EventType`, mas o SDK nunca os registra: uma chamada de ferramenta que falha é um evento `action.failed`; uma recusada por uma política, um evento `policy.violated`, e uma rejeitada na aprovação, um evento `approval.rejected`.

## Cognição {#cognition}

| Tipo | Dados |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; ausente nas execuções mais antigas), `goal`, `context?`, `observations` (fornecidas com o problema), `commitRules`, `knowledge?` (`scope`, `items` recuperados de execuções anteriores, `error?` quando o repositório falhou), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (o motor impôs uma decisão), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — chamadas que não informaram nenhuma contagem de tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — e também `model?`, `requestedModel?`, `usage?` para uma operação interrompida por uma parada ou um tempo limite depois de tentativas cobradas |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — o relatório completo de um teste de predição |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (afirmação, tipo, escopo, `revises?`, `difference?`, `evidence`: cada teste com `runId`, `predictionId`, `verdict`, `expected`, `observed`, avaliador), `error?` quando o repositório falhou. Acrescentado depois de `run.completed`, `run.failed` ou `run.cancelled`, e apenas quando a execução testou algo |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (vazio se a resposta foi rejeitada), `usage?` (ausente se o backend não informou nenhuma contagem de tokens), `error?` (por que uma resposta cobrada foi rejeitada), `step?` |

## Operação {#operations}

| Tipo | Dados |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

O estado mental de uma execução cognitiva é o resultado da aplicação sucessiva dos seus patches `cognition.thought` na ordem de `step`, partindo do objetivo e das observações de `cognition.started`. As observações produzidas durante a execução são trazidas pelos patches de pensamento, com `sourceEventId` apontando para o evento `action.executed` ou `cognition.evaluated` que guarda o conteúdo completo. As execuções sem `schemaVersion` são reconstruídas com as regras com que foram registradas.
