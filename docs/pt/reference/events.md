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
| `run.started` | `input`, `mode` (`cognitive`, `study` para a execução de um estudo, `study-amendment` para a execução que classifica uma emenda, `tool` para uma chamada fora de um agente, como uma chamada MCP, `resource` para uma leitura de recurso MCP, ou ausente nas execuções governadas), `replayOf?` |
| `run.completed` | `output`, `decision?` (cognitiva) |
| `run.failed` | `error`, `steps?`, `uri?` (leitura de recurso que falhou) |
| `run.cancelled` / `run.stopped` | `reason` |

## Raciocínio e ações {#reasoning-and-actions}

| Tipo | Dados |
| --- | --- |
| `intention.generated` | `message`, `toolCalls`, `model`, `requestedModel`, `usage` — ou `intention` para uma resposta final cognitiva |
| `policy.checked` | `intention`, `validation`: o veredito do motor de ações sobre uma chamada de ferramenta. O motor de políticas também registra um evento por política que verifica — `policyId`, `policyType`, `intention`, `conditionEvaluated?`, `validationResult`, `applied` (`true` quando a política se aplicou e recusou) e `reason` — antes de uma chamada de ferramenta, e antes de cada etapa de uma execução cognitiva para as políticas de orçamento e de timeout que podem se aplicar a uma etapa (`intention` é então `{ type: 'continue' }`) |
| `policy.violated` | `intention`, `reason`, `violatedPolicies` (`allowed-tools` quando quem chamou usou uma ferramenta que não recebeu; o id da política de orçamento quando o seu orçamento de chamadas se esgotou), e `step` quando uma política de orçamento ou de timeout recusou uma etapa de uma execução cognitiva, ou `passage` uma passagem de um estudo (o seu `intention` é então `{ type: 'continue' }`) |
| `approval.requested` / `approval.approved` / `approval.rejected` | `approvalId`, `intention`, `policyId` (`tool-requires-approval` quando foi o próprio `metadata.requiresApproval` da ferramenta que a pediu), `reason?` (`cancelled before a decision` quando quem chamou desistiu ou a execução parou, `no decision within N ms` depois de `approvalTimeoutMs`) |
| `action.executing` / `action.executed` / `action.failed` | `toolName`, `parameters`, `result` / `error`, `duration` — `action.failed` também registra uma chamada recusada por argumentos inválidos (antes de qualquer política) ou porque quem chamou saiu depois de uma aprovação |
| `tool.called` | `toolName`, `parameters` |
| `tool.retry` | `toolName`, `retry`, `delayMs`, `error` |
| `provider.fallback` | `primaryProvider`, `usedProvider`, `attemptedProviders` |
| `provider.retry` | `provider`, `model`, `retry`, `delayMs`, `error` |
| `provider.answer_discarded` | `provider`, `model`, `requestedModel?`, `usage`, `reason` — uma resposta cobrada pelo fornecedor, com o consumo que ele informou, que o provedor não pôde usar (uma resposta da OpenAI sem nenhuma escolha); contada nos custos e nos orçamentos por período |
| `resource.read` | `uri`, `mimeType?`, `bytes`, `sha256` do conteúdo servido (o próprio conteúdo não é armazenado) |

`tool.failed`, `intention.rejected` e `error.occurred` fazem parte do tipo `EventType`, mas o SDK nunca os registra: uma chamada de ferramenta que falha é um evento `action.failed`; uma recusada por uma política, um evento `policy.violated`, e uma rejeitada na aprovação, um evento `approval.rejected`.

## Cognição {#cognition}

| Tipo | Dados |
| --- | --- |
| `cognition.started` | `schemaVersion` (2; ausente nas execuções mais antigas), `goal`, `context?`, `observations` (fornecidas com o problema), `commitRules`, `knowledge?` (`scope`, `items` recuperados de execuções anteriores, `error?` quando o repositório falhou), `profile`, `controller`, `assessor`, `evaluator?`, `allowedTools`, `limits` |
| `cognition.operation_selected` | `step`, `operation`, `controller`, `available`, `stepsRemaining`, `forced?` (o motor impôs uma decisão), `confidence?`, `probabilities?`, `rationale?`, `fallbackFrom?` |
| `cognition.thought` | `step`, `operation`, `patch`, `issues`, `failed`, `ignoredFields?`, `model?`, `requestedModel?`, `usage?` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?` — chamadas que não informaram ao mesmo tempo os tokens de entrada e de saída, `unmeteredTokens?` — os seus tokens) |
| `cognition.operation_failed` | `step`, `operation`, `error`, `recovery?` — e também `model?`, `requestedModel?`, `usage?` para uma operação interrompida por uma parada ou um tempo limite depois de tentativas cobradas |
| `cognition.evaluated` | `step`, `predictionId`, `hypothesisId`, `evaluator` (`id`, `version`), `verdict`, `observed?`, `summary?`, `context?`, `metrics?`, `causeCandidates?`, `reason?`, `durationMs` — o relatório completo de um teste de predição |
| `cognition.concluded` | `decision`, `status` (`committed`, `provisional`, `abstain`), `confidence`, `steps`, `evidenceRevision`, `hypotheses`, `predictions` |
| `cognition.knowledge_recorded` | `scope`, `findings` (afirmação, tipo, escopo, `revises?`, `difference?`, `evidence`: cada teste com `runId`, `predictionId`, `verdict`, `expected`, `observed`, avaliador), `error?` quando o repositório falhou. Acrescentado depois de `run.completed`, `run.failed` ou `run.cancelled`, e apenas quando a execução testou algo |
| `cognition.feedback` | `feedback` (`verdict`, `agreement?`, `wrongAbout?`, …), `profileId`, `profileVersionBefore`, `profileVersionAfter` |
| `decision.evaluated` | `client`, `purpose` (`operation_selection`, `hypothesis_assessment`, `direct`), `model`, `state`, `questions`, `answers` (vazio se a resposta foi rejeitada), `usage?` (ausente se o backend não informou nenhuma contagem de tokens), `error?` (por que uma resposta cobrada foi rejeitada), `step?` |

## Estudos {#studies}

As execuções de um estudo (`mode: 'study'`) e as execuções que classificam as suas emendas (`mode: 'study-amendment'`) registram estes eventos. Cada um traz o `id` do estudo como `metadata.agentId` e o nome dele como `metadata.studyName`. As pesquisas também registram os eventos das suas chamadas de ferramenta governadas (`action.executing`, `policy.checked`, `tool.called`, `action.executed`) na execução do estudo. Veja [Estudos](../guide/studies).

| Tipo | Dados |
| --- | --- |
| `study.started` | `name`, `charter` (`object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability?`, `analogues`), `charterHash` (SHA-256), `language`, `model?`, `sources` (nomes de ferramentas), `limits`, `driftThreshold`, `amendments` (as aceitas: `number`, `text`), `resumeAt?` (quando uma execução é retomada: a primeira passagem com trabalho pendente) |
| `study.passage_started` | `passage`, `number` (de 1 a 7), `amendments` (números das emendas aceitas em vigor), `reopenedBy?`, `focus?`, `reason?` quando uma passagem posterior a reabriu, `redo?` e `resumed?` para a passagem refeita que uma execução retomada lhe devia, `outdated?` quando ela é executada de novo por causa de itens que o guardião julgou tardiamente |
| `study.passage_completed` | `passage`, `attempts` (2 quando o guardião a fez ser refeita), `keptAttempt?` (1 quando a primeira tentativa era melhor que a passagem refeita e foi mantida), `discarded?` (`attempt`, `items`: a passagem refeita então descartada), `items` (cada um com a sua `collection`, `id`, `statement`, `status`, `sources`, `servesObjective`, os outros campos de uma afirmação e os seus próprios campos), `reopenedBy?`, `reopen?` (`passage`, `focus`, `reason`: a passagem anterior que ela pede para reabrir; ela não está completa até ser executada de novo), `resumed?` (uma execução a retomou só para terminá-la), `duplicates?` (vereditos dados de novo sobre pistas já julgadas: descartados, não são deriva) |
| `study.search` | `passage`, `purpose` (`research`, ou `priorArt` para o estado da técnica das novidades), `tool`, `query`, `servesObjective`, `claims?` (as novidades que ela procura), `resultIds`, `results` (`id`, `title`, `locator`, `date?`), `error?` (a pesquisa falhou), `throttled?` (falhou por um limite de requisições), `retry?` (a segunda tentativa de uma pesquisa do estado da técnica que atingiu um limite de requisições), `skipped?` (`maxSearches`: não executada) |
| `study.model_called` | `purpose` (`passage`, `queries`, `check`, `priorArtQueries`, `priorArtCheck`, `amendment`), `passage?`, `model?`, `requestedModel?`, `usage` (`promptTokens`, `completionTokens`, `calls`, `unmeteredCalls?`, `unmeteredTokens?`: um evento para uma chamada e a sua correção), `failed?` (por que a resposta não pôde ser usada), `usedAttempt?` (1 quando a correção não pôde ser usada e a primeira resposta foi usada, lida com tolerância) — contado nos custos e nos orçamentos por período |
| `study.drift_rejected` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`code`, `params?`, `message`), `by` (`guardian`: julgado fora do objetivo; `schema`: recusado antes, por exemplo sem `servesObjective`), `attempt` (2 em uma passagem refeita) |
| `study.capability_demoted` | `passage`, `item` (o id da arquitetura), `name`, `reason` (`code`, `params?`, `message`): uma capacidade que o guardião julgou apenas mais rápida ou mais barata, agora uma melhoria |
| `study.amendment_accepted` / `study.amendment_refused` | `number?` (somente as aceitas), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`code`, `params?`, `message`; para `unclassified`: `amendmentUnclassified`, `amendmentTimedOut`, `amendmentCancelled` ou `amendmentPolicy`), `charterHash` — na execução própria da emenda |
| `study.result_recorded` | `card`, `resultAndError` (`result`, `error?`), `conclusionAndMemory?` — acrescentado à execução que escreveu a ficha, depois do fim dela |
| `study.completed` | `status`, `passages` (`passage`, `state`), `stats` desta execução (`modelCalls` que o fornecedor respondeu, `searches`, `searchesSkipped`, `redos`, `loops`, `steps`) |
| `study.failed` | `status` (`stopped`, `failed` ou `cancelled`), `stoppedBy?`, `error`, `passages`, `stats` desta execução, `partial: true` — depois `run.failed`, ou `run.cancelled` |

`study.model_called` é o que `getRunCost` e os orçamentos leem para um estudo. Quando duas execuções são comparadas, os eventos de estudo são emparelhados por passagem (`study.model_called` por finalidade e passagem), e o `usage` de `study.model_called` não é comparado. A execução de uma emenda contém `run.started`, `policy.violated` quando uma política de orçamento recusou a classificação, `study.model_called` quando o fornecedor respondeu, o evento da emenda e `run.completed`.

## Operação {#operations}

| Tipo | Dados |
| --- | --- |
| `incident.reported` | `incident`, `deliveries`, `suppressed?` (`throttled`, `below minimum severity`) |

O estado mental de uma execução cognitiva é o resultado da aplicação sucessiva dos seus patches `cognition.thought` na ordem de `step`, partindo do objetivo e das observações de `cognition.started`. As observações produzidas durante a execução são trazidas pelos patches de pensamento, com `sourceEventId` apontando para o evento `action.executed` ou `cognition.evaluated` que guarda o conteúdo completo. As execuções sem `schemaVersion` são reconstruídas com as regras com que foram registradas.
