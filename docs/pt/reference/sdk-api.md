# API do SDK

```ts
import { createSDK } from '@sdk-ai-agents/core';
const sdk = createSDK(config);
```

## `SDKConfig` {#sdkconfig}

| Opção | Tipo | Descrição |
| --- | --- | --- |
| `apiKey` | `string` | Chave do provedor principal (desnecessária com `llmProvider`). Sem nenhuma chave, as ferramentas e os servidores MCP funcionam, e as chamadas que precisam de um modelo falham com um erro claro |
| `provider` | `'openai' \| 'anthropic'` | Provedor principal, `openai` por padrão |
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel`, `baseURL` e `timeout` de cada fornecedor (`baseURL`: um endpoint compatível, como a API v1 do Azure OpenAI ou um servidor de modelos local, ou um proxy; `timeout`: a espera mais longa por uma resposta, em milissegundos, 10 minutos por padrão, e, para uma resposta enviada em streaming, a espera mais longa entre dois dos seus eventos). O principal usa a entrada do seu fornecedor, e um fallback de outro fornecedor a do seu. Modelos padrão: `gpt-5.4` e `claude-opus-5`. A entrada da OpenAI também aceita `reasoningModels`, `reasoningEffort`, `nativeToolMessages` e `includeStreamUsage`: veja [Modelos da OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Tentados em ordem quando o principal falha; um `config` prevalece sobre `providerConfig`. Um fallback do mesmo fornecedor que o principal não herda nenhuma das suas configurações (só a `apiKey` global); um de outro fornecedor precisa da própria chave |
| `llmProvider` | `LLMProvider` | O seu próprio provedor (modelo local, gateway, dublê de teste). Recebe as chamadas de ferramenta e os resultados no formato nativo (`LLMMessage`) se declarar `nativeToolMessages`, e como texto caso contrário; pode também fazer streaming do seu texto (veja [`LLMProvider`](#llmprovider)) |
| `retry` | `Partial<RetryPolicy> \| false` | Política de novas tentativas do LLM, por provedor, antes do fallback. Os `maxRetries` e `initialDelayMs` dela também são os padrões de `jev.maxRetries` e `jev.retryBaseDelayMs`; os outros campos dela não chegam ao cliente Jev, que mantém as próprias 2 novas tentativas e 500 ms com `retry: false`. Aplicada a um `llmProvider` injetado só quando definida explicitamente, e nunca a um `FallbackProvider` passado como `llmProvider` nem aos provedores dele |
| `jev` | `JevClientConfig` | Ativa o TypeSafe Jev para as decisões tipadas — diretamente, ou pelo [Vercel AI Gateway](../guide/typed-decisions#through-vercel-ai-gateway) com `baseUrl` e `model: 'typesafe-ai/jev'` |
| `decisionClient` | `TypedDecisionClient` | Qualquer backend de decisões tipadas (tem precedência sobre `jev`) |
| `pricing` | `PricingTable` | USD por milhão de tokens, mesclado sobre os padrões |
| `incidents` | `IncidentMonitorOptions` | Notificadores, regras, limiar de severidade, limitação de frequência |
| `eventStore` | `IEventStore` | Por padrão, `FileEventStore('./events')` |
| `defaultPolicies` | `Policy[]` | Políticas globais |
| `goldenTracesDir`, `regressionTestSuitesDir`, `assertionsDir`, `impactAnalysesDir` | `string` | Armazenamento dos artefatos de teste |

### Modelos da OpenAI {#openai-models}

Os modelos de raciocínio da OpenAI — a série o (`o1`, `o3`, `o4-mini`…) e o GPT-5 e posteriores (`gpt-5`, `gpt-5.4-mini`, `gpt-6-sol`…), também datados ou com fine-tuning (`ft:o4-mini-…`) — recusam `max_tokens`, e `temperature` a não ser que o seu esforço de raciocínio seja `none`. O provedor da OpenAI os reconhece pelo nome, sem diferenciar maiúsculas e minúsculas: envia a eles `maxTokens` como `max_completion_tokens`, que também conta os seus tokens de raciocínio, e o esforço de raciocínio. Como o esforço padrão varia de um modelo para outro, nunca envia a eles uma temperatura: a do agente ou a do motor é ignorada para eles. Os outros modelos recebem `temperature` e `max_tokens`, que todo servidor compatível com a OpenAI conhece.

::: warning Ferramentas e esforço de raciocínio
O SDK chama a OpenAI pelo Chat Completions, onde os modelos GPT-5.4 e posteriores só chamam ferramentas com o esforço `none`. O modelo padrão, `gpt-5.4`, usa `none` enquanto você não definir outro esforço. GPT-5.5, GPT-5.6 e GPT-6 Sol e Luna têm `medium` por padrão: um agente com ferramentas falha com eles (`Function tools with reasoning_effort are not supported`) a não ser que você defina `reasoningEffort: 'none'`. O GPT-6 Astra não consegue chamar ferramentas pelo Chat Completions de forma alguma. O SDK envia o esforço que você define sem alterá-lo.
:::

| Opção | Padrão | |
| --- | --- | --- |
| `defaultModel` | `gpt-5.4` | Modelo de uma requisição que não indica nenhum, e de um fallback que não atende o modelo do agente |
| `reasoningModels` | Deduzido do nome | `true` ou `false`: todos os modelos deste provedor são, ou não são, modelos de raciocínio. Uma lista: esses nomes são (deployments do Azure, aliases de gateway), e os outros são reconhecidos pelo nome |
| `reasoningEffort` | O do modelo | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` ou `max`, enviado sem alteração somente aos modelos de raciocínio. Cada modelo aceita alguns desses valores, e a API recusa os outros |
| `includeStreamUsage` | Na própria API da OpenAI | `true`: o consumo de uma resposta enviada em streaming é pedido (`stream_options`), para que o seu custo seja contado; `false`: não é. Por padrão em `https://api.openai.com/v1` e nos hosts regionais como `https://eu.api.openai.com/v1` (vindos de `baseURL` ou de `OPENAI_BASE_URL`), já que um servidor compatível pode recusar o campo (a requisição é então enviada de novo sem ele, exceto à própria API da OpenAI, que o aceita) ou ignorá-lo, e uma chamada em streaming sem consumo informado conta como não medida. Com um orçamento de custo em um servidor compatível que informa o consumo (a API v1 do Azure OpenAI informa), defina `true` |
| `nativeToolMessages` | `true` | `false` para um servidor compatível que não aceita, na conversa, os `tool_calls` do assistente nem as mensagens `tool`: as chamadas de ferramenta anteriores e os seus resultados são então enviados como texto, enquanto as ferramentas continuam oferecidas e as chamadas de ferramenta das respostas continuam lidas. `false` no principal ou em qualquer fallback vale para a cadeia inteira |

Essas opções ficam em `providerConfig.openai` ou no `config` de um fallback da OpenAI. Um fallback de outro fornecedor pega de `providerConfig.openai` cada opção que o seu `config` não define; um fallback do mesmo fornecedor que o principal não pega nenhuma. Um agente ou uma execução define o próprio esforço em `providerSettings.openai.reasoningEffort`: prevalece o da execução, depois o do agente, depois o do provedor. Um agente cognitivo só o aplica à seleção de ferramentas; os seus pensamentos, que não oferecem ferramentas, usam a sua opção `reasoningEffort`.

```ts
const sdk = createSDK({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  providerConfig: {
    openai: {
      baseURL: 'https://my-resource.openai.azure.com/openai/v1/',
      reasoningModels: ['analyst-o4-mini'], // a deployment name says nothing about its model
      reasoningEffort: 'low',
    },
  },
});

const analyst = sdk.createAgent({
  name: 'analyst',
  model: 'analyst-o4-mini',
  providerSettings: { openai: { reasoningEffort: 'high', maxTokens: 8_000 } },
});
```

### `LLMProvider` {#llmprovider}

O seu próprio provedor implementa `generateCompletion(request)`, `supportsModel(model)` e `getProviderName()`, e pode declarar `nativeToolMessages`. Dois campos da requisição tratam do streaming:

| Campo de `LLMRequest` | |
| --- | --- |
| `onTextDelta?(delta)` | Definido quando quem chamou quer o texto à medida que ele é escrito (uma execução com `onText`). Chame-o com cada trecho de texto assim que ele chega e, depois, devolva a `LLMResponse` completa como de costume: os trechos juntos precisam formar o `content` dela. Um provedor que não consegue fazer streaming o ignora, e o SDK repassa o `content` inteiro de uma só vez. Ele não pode lançar exceções (o do SDK nunca lança) |
| `onTextRestart?()` | Chame-o quando tentar de novo depois de uma tentativa que já tinha enviado texto em streaming (uma nova tentativa sua): esse texto não vale mais, e os próximos trechos recomeçam a resposta. `RetryingLLMProvider` e `FallbackProvider` o chamam em nome dos provedores que encapsulam |

## Agentes {#agents}

| Método | Devolve | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agente governado: `run({ message, context?, signal?, onText?, onTextRestart? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`, `version`, `configHash`. Ele só pode executar as suas próprias ferramentas (`tools`, `capabilities`), mesmo que o modelo mencione outra ferramenta registrada no SDK; `signal` cancela a execução; `onText` recebe o texto que o modelo escreve à medida que ele é escrito, e `onTextRestart` a parte a descartar quando uma chamada ao modelo que falhou é tentada de novo (veja [Streaming da resposta](../guide/governed-agents#_7-streaming-the-answer)) |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()`. Os pensamentos dele são estruturados e não são enviados em streaming |
| `defineTool(definition)` | `Tool` | Registra uma ferramenta; o handler é tipado a partir do seu schema Zod |
| `defineCapability(definition)` | `Capability` | Agrupa ferramentas |
| `listTools()` | `Tool[]` | Todas as ferramentas registradas |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs?, onEvent? })` | `Promise<unknown>` | Execução governada fora de um agente (usada pelo servidor MCP): argumentos, políticas, aprovação, orçamento (contado quando a chamada começa) e, depois, a ferramenta. `signal` cancela uma aprovação pendente e chega ao handler; `approvalTimeoutMs` cancela uma aprovação que ninguém decidiu |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Executa `read()` como uma execução própria: `run.started`, `resource.read` (URI, tamanho, SHA-256), `run.completed` ou `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Interrompe uma execução governada ou cognitiva |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Opção | Padrão | |
| --- | --- | --- |
| `name`, `model` | — | Obrigatórios |
| `profile` | `DEFAULT_THINKER_PROFILE` | Como o agente raciocina |
| `tools`, `policies` | `[]` | Governadas como em qualquer outro lugar; as políticas de orçamento e de timeout também são verificadas antes de cada etapa, veja [Limites e políticas](../guide/cognitive-agents#limits-and-policies) |
| `systemPrompt` | — | Instruções extras para todos os prompts |
| `limits` | veja [Agentes cognitivos](../guide/cognitive-agents#limits) | `maxSteps`, `timeoutMs`, `maxHypotheses`, `maxToolCalls`, `decisionThreshold`, `maxConsecutiveFailures`, `maxPredictionTests`, `preferenceWeight`, `minProposalSupport` |
| `controller` | `'auto'` | `'heuristic'`, `'typed'` ou um `CognitiveController` |
| `controllerOptions` | — | `minConfidence` (0.35), `readinessThreshold` (0.8), `fallback`, `model` |
| `assessment` | `'auto'` | `'llm'`, `'typed'` ou o seu próprio `HypothesisAssessor` para a operação `compare` |
| `knowledge` | — | Memória entre execuções: `{ store, scope, recallLimit? (10), record? (true) }`, veja [Memória entre execuções](../guide/memory) |
| `evaluator` | — | Um `OutcomeEvaluator` que testa as predições; ativa `test_prediction` |
| `generator` | gerador LLM sobre `model` | O seu próprio `ThoughtGenerator` (incluindo as comparações de observações); os pensamentos dele continuam passando pelas regras de admissão do motor |
| `temperature`, `maxTokens`, `reasoningEffort` | `0.4`, —, — | Parâmetros de geração dos pensamentos (`reasoningEffort`: somente modelos de raciocínio da OpenAI) |
| `providerSettings` | — | Parâmetros para a seleção de ferramentas (motor de raciocínio nativo), incluindo `openai.reasoningEffort` |

### `CognitiveRunResult` {#cognitiverunresult}

`{ runId, status, answer?, decision?, state, error? }` — `status` é `completed`, `failed` ou `cancelled`; `decision.status` é `committed`, `provisional` ou `abstain`, com `decision.missing` listando o que não está estabelecido; `state` é o `MentalState` final.

### `OutcomeEvaluator` {#outcomeevaluator}

```ts
interface OutcomeEvaluator {
  readonly id: string;
  readonly version: string;
  evaluate(input: { prediction; hypothesis; state; abortSignal? }): Promise<{
    verdict: 'confirmed' | 'refuted' | 'inconclusive';
    observed?: unknown;
    summary?: string;
    context?: string;
    metrics?: Record<string, number>;
    causeCandidates?: string[];
    reason?: string;
  }>;
}
```

Veja [Evidências e verificação](../guide/evidence-and-verification).

## Raciocínio e perfis {#reasoning-profiles}

| Método | Devolve |
| --- | --- |
| `getMentalState(runId)` | `Promise<MentalState>` — reconstruído a partir dos eventos |
| `distillThinkerProfile({ id, name, samples, model })` | `Promise<ThinkerProfile>` |
| `exportControllerDataset(runIds?)` | `Promise<string>` — JSON Lines |

## Estudos {#studies}

Um estudo é um pesquisador: ele entende um objeto, depois propõe como redesenhá-lo com os conhecimentos e as técnicas de hoje, e concebe os experimentos que permitiriam decidir. Veja [Estudos](../guide/studies).

| Método | Devolve | |
| --- | --- | --- |
| `createStudy(config)` | `Study` | Verifica a configuração, resolve as fontes e congela a carta. Lança um `ValidationError` para uma configuração inválida, ou para uma fonte que não é uma ferramenta definida ou que não aceita nenhuma consulta em texto |

### `StudyConfig` {#studyconfig}

| Opção | Padrão | |
| --- | --- | --- |
| `name`, `object`, `objective` | — | Obrigatórios, não vazios. `name` é registrado com os eventos do estudo (`metadata.studyName`); o objetivo nunca muda: um novo objetivo é um novo estudo |
| `question` | A pergunta norteadora do método e o alvo de uma nova capacidade, em `language` | A pergunta norteadora |
| `needs`, `leads`, `analogues` | `[]` | Necessidades e critérios de hoje; as suas pistas, exemplos a verificar, cada uma recebendo um veredito; rupturas por montagem a desconstruir (`['Bitcoin']`) |
| `scope` | `{ exclude: [] }` | O que está fora do escopo |
| `capability` | — | A nova capacidade visada; sem ela, o estudo propõe candidatas |
| `sources` | `[]` | Nomes das ferramentas do SDK com as quais o estudo pesquisa, definidas antes do estudo (por exemplo, as ferramentas de `connectMcpServer`); sem fontes, nada pode ser estabelecido |
| `model` | O padrão do provedor | Modelo de todas as chamadas |
| `llmProvider` | O provedor do SDK | Um provedor para este estudo |
| `language` | `'en'` | Idioma dos textos e do dossiê, como uma tag de idioma (`fr`, `pt-BR`…) |
| `limits` | Veja [`StudyLimits`](#studylimits) | Um limite omitido mantém o seu padrão |
| `driftThreshold` | `1/3` (`DEFAULT_DRIFT_THRESHOLD`) | Parcela dos itens de uma passagem, de 0 a 1, que pode ser rejeitada antes que a passagem seja refeita uma vez |
| `temperature`, `maxTokens` | `0.4`, — | Das passagens e dos pedidos de pesquisa; o guardião, as emendas e a verificação do estado da técnica rodam a 0 |

A carta (`StudyCharter`) contém `object`, `question`, `objective`, `needs`, `leads`, `scope`, `capability` e `analogues`, sem as entradas repetidas das listas (sem diferenciar maiúsculas e minúsculas). Ela é congelada e o seu hash é calculado; `name` não faz parte dela.

### `StudyLimits` {#studylimits}

Por execução. `DEFAULT_STUDY_LIMITS` contém os padrões; um valor fora do intervalo lança um `ValidationError`.

| Limite | Padrão | Intervalo | |
| --- | --- | --- | --- |
| `maxModelCalls` | 60 | 1 a 10 000 | Chamadas ao modelo, incluindo correções e verificações; quando atingido, a execução para (`stoppedBy: 'maxModelCalls'`) |
| `maxSearches` | 20 | 0 a 10 000 | Pesquisas; depois de esgotado, a execução continua sem pesquisar (aviso `searchesSkipped`) |
| `maxLoops` | 1 | 0 a 10 | Passagens anteriores que a execução pode reabrir |
| `timeoutMs` | 1 200 000 (20 minutos) | 1 a 2 147 483 647 | Duração da execução; quando atingido, a execução é interrompida (`stoppedBy: 'timeoutMs'`) |
| `maxResultsPerSearch` | 5 | 1 a 50 | Resultados guardados de uma pesquisa |

### `Study` {#study}

| Membro | |
| --- | --- |
| `id` | `study_…`, novo para cada estudo: o `metadata.agentId` dos seus eventos e o id de agente dos seus orçamentos, das suas políticas e das suas chamadas de ferramenta |
| `name`, `language`, `charter`, `charterHash` | O nome, o idioma, a `StudyCharter` congelada e o seu SHA-256 (hexadecimal), registrado em `study.started` e com cada emenda |
| `amendments` | `StudyAmendment[]`: aceitas e recusadas, em ordem |
| `run({ signal?, onEvent?, restart? })` | `Promise<StudyResult>`. Retoma onde a última execução parou: o guardião primeiro julga o que essa execução deixou sem julgamento, uma passagem julgada mas não terminada apenas termina, e depois as passagens não completas são executadas. `restart` recomeça o estudo do zero: as passagens, os resultados, as pesquisas, o registro de deriva, a numeração e as execuções são apagados; a carta e as emendas permanecem. Um limite, uma política, um cancelamento ou um erro encerra a execução com o seu status e o relatório do que foi feito; ele só lança uma exceção para uma execução já em andamento, um `onEvent` que não pode ser atendido ou um armazenamento de eventos que falha. `onEvent` funciona como em `agent.run` |
| `amend(text, { signal?, timeoutMs? })` | `Promise<StudyAmendment>`. Classificada somente em relação à carta, nunca em relação às emendas anteriores (duas que se contradizem podem ser ambas aceitas), uma de cada vez, na ordem em que foram pedidas, em uma execução própria (`mode: 'study-amendment'`) em que as políticas de orçamento são verificadas primeiro; só `refines` é aceita, e aparece em todos os prompts seguintes. `timeoutMs` (padrão 60 000, contado a partir da sua vez) e `signal` limitam a classificação: quando o prazo passa ou o sinal é abortado, ou quando uma política a recusa, a emenda é recusada como `unclassified`. Lança um `ValidationError` para um texto vazio, um texto com mais de `MAX_AMENDMENT_LENGTH` (500 caracteres), ou quando chega a sua vez e `MAX_AMENDMENTS` (10) emendas já foram aceitas |
| `recordResult(cardId, { result, error?, conclusion? })` | `Promise<MechanismCard>`. Preenche os campos 10 e 11 de uma ficha e registra `study.result_recorded` na execução que a escreveu; um `ValidationError` para uma ficha desconhecida ou um `result` vazio |
| `report()` | `StudyReport`: o relatório tal como está, incluindo os resultados registrados desde a última execução |

Um estudo é criado com `sdk.createStudy`: a classe `Study` é exportada para uso como tipo, e aquilo com que ele é construído é interno. `MAX_AMENDMENTS` e `MAX_AMENDMENT_LENGTH` são exportadas, assim como `StudyAmendOptions`, o tipo das opções de `amend`.

### `StudyResult` {#studyresult}

`{ runId, status, stoppedBy?, error?, report, markdown }` — `status` é `completed`; `stopped` quando um limite ou uma política de orçamento ou de timeout encerrou a execução, com `stoppedBy` (`maxModelCalls`, `timeoutMs` ou `policy`); `failed` quando um erro a encerrou; ou `cancelled`. `error` é o `Error` que encerrou a execução, `report` o `StudyReport` no momento em que ela terminou, e `markdown` o mesmo como dossiê.

### `StudyReport` {#studyreport}

```ts
interface StudyReport {
  studyId: string;
  name: string;
  language: string;
  charter: StudyCharter;
  charterHash: string;
  amendments: StudyAmendment[];
  status: StudyStatus | 'notRun';
  stoppedBy?: StudyStopReason;
  error?: string;
  notices: StudyNotice[];                       // { code, message, details? }
  passages: StudyPassageState[];                // { passage, state, attempts, reopenedBy, runId? }
  observations: StudyObservation[];             // O1…
  pieces: StudyPiece[];                         // P1…
  chain: StudyChainStage[];                     // C1…
  threeStates: StudyPieceStates[];              // { piece, atItsTime, currentBest, proposal }
  historicalChoices: StudyHistoricalChoice[];   // H1…
  advances: StudyAdvance[];                     // V1…
  leadVerdicts: StudyLeadVerdict[];             // L1…
  unverifiedLeads: string[];
  independentLeads: StudyIndependentLead[];     // I1…
  references: StudyReference[];                 // R1…
  analogues: StudyAnalogue[];                   // B1…
  undeconstructedAnalogues: string[];
  constraints: StudyConstraint[];               // K1…
  revisableDecisions: StudyRevisableDecision[]; // D1…
  combinations: StudyCombination[];             // X1…
  capabilities: StudyCapability[];              // Y1…
  architectures: StudyArchitecture[];           // A1…: new capabilities, existing ones, improvements
  noveltyClaims: StudyNoveltyClaim[];           // N1…
  experiments: StudyExperiment[];               // E1…
  cards: MechanismCard[];                       // M1…
  results: StudySearchResult[];                 // S1…
  searches: StudySearch[];
  driftLog: StudyDriftEntry[];
  stats: StudyStats;
  runIds: string[];                             // runs of run() since the last restart, oldest first
}

interface StudyClaim {
  id: string;
  passage: StudyPassage;
  statement: string;
  status: 'established' | 'hypothesis' | 'novelty'; // after the study's checks
  declaredStatus?: StudyClaimStatus;                // the model's, when the study changed it
  statusReason?: StudyReason;
  sources: string[];                                // results listed in the prompt that wrote it
  unlistedSources?: string[];                       // cited, not listed in that prompt: they support nothing
  servesObjective: string;
  toVerify?: boolean;                               // prior art not assessed: a novelty, or a capability's assembly
  priorArtReason?: StudyReason;                     // a capability that is not a novelty: why not checked, or assemblyExists
  priorArt?: { closest: string; sources: string[]; verdict: 'novel' | 'partlyNovel' | 'exists' };
  unchecked?: boolean;                              // not judged by the guardian: kept out of later prompts
  runId: string;
}

interface StudyReason {
  code: StudyReasonCode;
  params?: Record<string, string>;
  message: string;                                  // the same reason, in English
}

interface StudyTrace {
  from: string[];                                   // records of the investigation it comes from
  unknownFrom?: string[];                           // cited, not listed in the design's prompt
  untraced?: boolean;                               // it cites none of the listed records
}
```

Todo motivo do relatório é um `StudyReason`: o `statusReason` das afirmações e dos componentes, o `priorArtReason` de uma capacidade que não é uma novidade, o `reason` das entradas do registro de deriva e das emendas, e o `kindReason` de uma arquitetura rebaixada. O dossiê apresenta o seu `code` no idioma do estudo (`studyLabels(language).reasons`); um texto que o guardião ou o modelo escreveu tem o código `judged`, em `params.text`. Os códigos (`StudyReasonCode`):

| Códigos | Por quê |
| --- | --- |
| `noSourceConfigured`, `citesUnlisted`, `citesNothing` | Uma afirmação ou um componente `established` rebaixado a `hypothesis`: sem fonte, ou sem nenhum id listado no seu prompt |
| `priorArtNotSearchedYet`, `priorArtNoSource`, `priorArtSearchBudget`, `priorArtNotSearched`, `priorArtSearchFailed`, `priorArtNoResult`, `priorArtNotAssessed`, `priorArtUnsupported` | Por que o estado da técnica de uma novidade, ou da montagem de uma capacidade, continua a verificar (o seu texto em inglês começa com "To verify against prior art:") |
| `priorArtExists` | Uma novidade rebaixada a `hypothesis`: o trabalho mais próximo já a realiza |
| `assemblyExists` | Uma capacidade que não é uma novidade, cuja montagem já existe (no seu `priorArtReason`) |
| `componentDocumented`, `componentUndocumented` | Um componente apresentado como novo |
| `noServesObjective`, `invalidItem`, `notAnObject`, `notAUserLead` | Um item recusado pelo schema |
| `leadAlreadyJudged` | Um veredito dado de novo sobre uma pista já julgada: descartado, não é deriva (`duplicates` de `study.passage_completed`) |
| `designWithoutCapability` | Uma concepção sem nenhuma nova capacidade |
| `amendmentUnclassified`, `amendmentCancelled`, `amendmentTimedOut`, `amendmentPolicy` | Uma emenda que não pôde ser classificada |
| `judged` | As próprias palavras do guardião ou do modelo |

Todo item é uma `StudyClaim` com campos próprios:

| Tipo | Os seus próprios campos |
| --- | --- |
| `StudyObservation` | `kind` (`behaviour`, `use`, `variation`, `failure`), `conditions`, `era?` |
| `StudyPiece` | `name`, `function`, `inputs`, `outputs`, `relations`, `unknowns`, `parent?` (a peça que ela detalha) |
| `StudyChainStage` | `stage`, `pieces` |
| `StudyHistoricalChoice` | `choice`, `piece?`, `factors` (`hardware`, `tools`, `uses`, `knowledge`, `costs`, `compatibility`, `other`), `era?` |
| `StudyAdvance` | `mechanism`, `date?`, `domain` (`object` ou `other`), `field?`, `evidence`, `conditions`, `availability`, `piece?` |
| `StudyLeadVerdict` | `lead` (como a carta a escreve), `verdict` (`relevant`, `partlyRelevant`, `notRelevant`), `reasons` |
| `StudyIndependentLead` | `tool`, `kind` (`mathematical`, `technical`, `other`), `piece?` |
| `StudyReference` | `name`, `piece?`, `date?` |
| `StudyAnalogue` | `breakthrough`, `named?` (o número da ruptura da carta que ela desconstrói), `domain?`, `date?`, `components` (dois ou mais `{ name, date? }`), `liftedConstraint`, `capability`, `pattern` |
| `StudyConstraint` | `constraint`, `state` (`remains`, `weakened`, `newRequirement`), `piece?` |
| `StudyRevisableDecision` | `decision`, `because` (a condição que mudou), `opens` |
| `StudyCombination` | `a`, `b`, `enables` (o que A permite a B fazer), `exchange`, `cost`, `changes` (`representation`, `distribution`, `responsibilities`, `trust`, `verification`, `other`) |
| `StudyCapability` | `capability`, `forWhom`, `hardToday`, `principle?` |
| `StudyArchitecture` | `name`, `kind` (`capability` ou `improvement`), `declaredKind?` e `kindReason?` (uma capacidade que o guardião julgou apenas mais rápida ou mais barata), `capability` (`what`, `forWhom`, `liftedConstraint`), `principleChange?` (`principle`: `representation`, `distribution`, `responsibility`, `trust`, `verification` ou `other`; `change`), `mechanism`, `components` (`StudyComponent[]`: `name`, `statement`, `date?`, `status`, `declaredStatus?`, `statusReason?`, `sources`, `unlistedSources?`, e um `StudyTrace`), `assembly` (`component`, `gives`, `exchanges`, `cost`, e um `StudyTrace`), `conditions`, `benefit`, `addedCost`, `counterexample`, `chain` (`stage`, `how`), `uncoveredStages` (etapas da cadeia completa que ela deixa de fora, conforme verificado pelo estudo), `predictions` |
| `StudyThreeState` | `piece`, `state` (`atItsTime`, `currentBest`, `proposal`), `architecture?` |
| `StudyNoveltyClaim` | `architecture?` |
| `StudyExperiment` | `name`, `architectures`, `protocol`, `measures`, `criteria`, `expected` (`architecture`, `result`), `wholeChain` |
| `MechanismCard` | Campos 1 a 9: `observation`, `mechanism`, `unknown`, `historicalChoice`, `evolution`, `newPossibility`, `proposedCombination`, `prediction`, `experiment`; campos 10 e 11 depois que você os registrou: `resultAndError?` (`result`, `error?`), `conclusionAndMemory?`, e `resultRecordedAt?` |

As outras entradas do relatório não são afirmações:

| Tipo | Campos |
| --- | --- |
| `StudyAmendment` | `number?` (somente as aceitas, a partir de 1), `text`, `verdict` (`refines`, `conflicts`, `changesObjective`, `unclassified`), `accepted`, `reason` (`StudyReason`), `runId` |
| `StudyDriftEntry` | `passage`, `collection`, `item` (`id?`, `statement?`, `servesObjective?`), `reason` (`StudyReason`), `by` (`guardian`: fora do objetivo; `schema`: recusado antes, por exemplo sem `servesObjective`), `attempt` (2 em uma passagem refeita), `runId` |
| `StudySearchResult` | `id` (`S1`…, mantido quando o mesmo resultado é encontrado de novo, até um reinício), `title`, `locator` (uma URL ou outro localizador), `date?`, `excerpt`, `tool`, `query`, `runId` |
| `StudySearch` | `passage`, `purpose` (`research` ou `priorArt`), `tool`, `query`, `servesObjective`, `claims?`, `resultIds`, `error?`, `skipped?` (`maxSearches`), `runId` |
| `StudyPassageState` | `passage`, `state` (`complete`; `partial`: julgada, mas não terminada, aguardando o seu ciclo ou com a sua pesquisa do estado da técnica interrompida; `unchecked`: itens que o guardião não julgou; `notRun`), `attempts` (2 depois de ser refeita), `keptAttempt?` e `discarded?` (`attempt`, `items`: uma passagem refeita descartada em favor de uma primeira tentativa melhor), `reopenedBy`, `runId?` |
| `StudyNotice` | `code` (`noSources`, `stopped`, `failed`, `cancelled`, `passagesNotRun`, `uncheckedItems`, `searchesSkipped`, `leadsNotVerified`, `analoguesNotDeconstructed`, `noDesign`, `noCapability`, `minimumsNotMet`, `untracedAssembly`, `passagesOutdated`, `capabilitiesToVerify`, `capabilitiesExist`, `noveltiesToVerify`), `params?` (`limit`, `error`, `count`), `details?` (as passagens, os pares `passage.collection`, as pistas, as rupturas ou as arquiteturas em questão), `message` (em inglês; o dossiê apresenta o código no seu idioma) |
| `StudyStats` | Desde o último reinício: `runs` e `modelCalls` (execuções de `run()`, e as chamadas que o fornecedor respondeu nelas), `searches`, `searchesSkipped`, `results`, `items`, `rejected`, `byStatus` (por status), `downgraded` (afirmações cujo status o estudo rebaixou), `noveltiesToVerify`, `redos`, `loops`. E `amendments` (`count`, `modelCalls`): todas as emendas do estudo, contadas à parte |

### `renderStudyMarkdown(report)` {#renderstudymarkdown-report}

Devolve o relatório como um dossiê Markdown legível, no idioma do relatório: o `markdown` de um `StudyResult`. Chame-a sobre `study.report()` para incluir os resultados registrados desde então. As suas palavras vêm de `studyLabels(language)` (`StudyLabels`), que existem nos onze idiomas desta documentação (`StudyLabelLanguage`); outro idioma, ou um idioma desconhecido, recebe as palavras em inglês, e `fr-CA` recebe as francesas.

## Decisões tipadas — `sdk.decisions` {#typed-decisions-—-sdk-decisions}

Lança um `ValidationError` quando nenhum backend está configurado.

| Método | Devolve |
| --- | --- |
| `ask({ context, questions, runId?, model? })` | `{ model, answers, usage?, runId }` — respostas tipadas a partir das perguntas; sem `usage` quando o backend não informou nenhuma contagem de tokens |
| `choose({ context, question, options, minConfidence? })` | `{ choice, confidence, probabilities, confident, runId }` |
| `selectMany({ context, question, options, threshold? })` | `{ selected, probabilities, runId }` |
| `check({ context, question, criteria?, threshold? })` | `{ probability, yes, runId }` |
| `rate({ context, question, levels })` | `{ score, normalized, level, confidence, runId }` |

Helpers de perguntas: `noul(instructions, criteria?)`, `choice(instructions, options)`, `score(instructions, levels)`.

## Operação {#operations}

| Método | Devolve |
| --- | --- |
| `getRunCost(runId)` | `Promise<RunCostReport>` |
| `getIncidents(runId)` | `Promise<Incident[]>` |
| `approveAction(approvalId, by, reason?)`, `rejectAction(...)`, `getPendingApprovals(runId?)` | Aprovações humanas |
| `getBudgetUsage(limit)`, `getPolicyAuditTrail(runId)` | Orçamentos e auditoria das políticas |

### `RunCostReport` {#runcostreport}

O que `getRunCost(runId)` devolve: as chamadas ao modelo da execução, incluindo etapas que falharam — veja [Custos de API](../guide/costs).

```ts
interface RunCostReport {
  runId: string;
  currency: 'USD';
  totalUsd: number;
  complete: boolean;
  lines: ModelCostLine[];
  unpricedModels: string[];
  unpricedCalls: number;
  unmeteredCalls: number;
  unmeteredModels: string[];
}

interface ModelCostLine {
  model: string;
  requestedModel?: string;
  source: 'llm' | 'decision';
  calls: number;
  unmeteredCalls?: number;
  inputTokens: number;
  outputTokens: number;
  unmeteredTokens?: number;
  costUsd?: number;
}
```

| Campo | |
| --- | --- |
| `totalUsd` | Custo das chamadas cujo custo é conhecido; apenas um mínimo quando `complete` é `false` |
| `complete` | `false` quando o custo de algumas chamadas é desconhecido: `unpricedCalls` ou `unmeteredCalls` acima de 0 |
| `unpricedModels`, `unpricedCalls` | Modelos sem preço em `pricing`, e as chamadas deles que informaram os tokens |
| `unmeteredModels`, `unmeteredCalls` | Modelos das chamadas que não informaram ao mesmo tempo os tokens de entrada e de saída, e essas chamadas |
| `lines` | Uma por modelo, modelo pedido e origem: chamadas, tokens das chamadas medidas, `unmeteredCalls` quando houver, `unmeteredTokens` para os tokens destas, `costUsd` quando o modelo tem preço e alguma chamada da linha é medida; `model` é `(unknown)` para uma chamada que não registrou nenhum nome de modelo |

## Traces, replay e testes {#traces-replay-and-testing}

| Método | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Ler as execuções |
| `replay(runId, modifications?, { onEvent? })` | Reexecutar sem o LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entender as decisões |

### Golden traces {#golden-traces}

| Método | Devolve | |
| --- | --- | --- |
| `createGoldenTrace(runId, { name, description?, metadata? })` | `Promise<GoldenTrace>` | Guarda uma execução como referência, com o nome do agente governado que a fez (`agentName`) |
| `getGoldenTraces(agent?)`, `getGoldenTrace(id)`, `deleteGoldenTrace(id)`, `exportGoldenTrace(id, 'json' \| 'yaml')` | | `agent`: o id ou o nome de um agente |
| `validateAgainstGoldenTrace(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | `pass`, `fail` ou `partial`, com cada diferença (`event_added`, `event_removed`, `event_modified`, `event_order_changed`) e a sua posição |
| `detectRegressions(runId, goldenTraceId, options?)` | `Promise<RegressionReport>` | As mesmas diferenças como regressões, cada uma com uma gravidade e um impacto: `no_regression` ou `regressions_detected` |
| `replayAndValidate(runId, goldenTraceId, options?)` | `Promise<ValidationResult>` | Faz o replay da execução e depois valida o replay. Um replay não chama nenhum modelo: compare-o com `validateAspects: ['tools', 'policies']` |

As execuções são comparadas **pelo que os seus eventos significam**, nunca pelo id dos eventos (cada execução tem ids novos). Os eventos são emparelhados em ordem: primeiro os eventos idênticos, depois os do mesmo tipo e assunto (a ferramenta, a operação, a passagem de um estudo, a resposta) cujos dados mudaram, depois aqueles cujo tipo mudou para o mesmo assunto. Nunca são comparados: os ids dos eventos, os horários, os metadados, os eventos `incident.reported` (eles registram os envios e a limitação de alertas; o evento que provocou o incidente é comparado) e os valores que o SDK escreve e que mudam de uma execução para outra: a duração de uma chamada de ferramenta, o consumo de tokens, as esperas antes de novas tentativas, os ids de aprovação, a execução de origem de um replay, o horário e o evento de origem de uma observação. O texto que um modelo escreve junto a uma chamada de ferramenta só é comparado em `intention.generated`. Os parâmetros, o resultado e a entrada de uma ferramenta são sempre comparados, sejam quais forem os nomes das suas chaves: um argumento `duration` que passou de 30 para 60 é uma mudança. Uma execução que volta a fazer a mesma coisa passa; uma ferramenta chamada com outros argumentos é apontada onde a chamada aconteceu (`parameters.metric: "churn" → "revenue"`); uma chamada inserida antes de outra idêntica é uma única chamada acrescentada; um `action.executed` que virou `action.failed` é uma única mudança, não uma perda mais um acréscimo.

| Opção | Para | |
| --- | --- | --- |
| `ignoreEventTypes`, `validateAspects` (`intentions`, `actions`, `tools`, `policies`) | Validação | Comparar menos eventos |
| `tolerance.dataFields` | Validação | Mais campos de dados deixados de fora, em qualquer profundidade |
| `tolerance.timestampMs`, `ignoreTimestampDiff` | Validação | Os tempos só são comparados, em relação ao início de cada execução, com `timestampMs` |
| `compareStructureOnly` | Validação | As diferenças de dados dão `partial`, não `fail`; eventos acrescentados, removidos, deslocados ou de outro tipo continuam falhando |
| `tolerance.ignoreEventTypes`, `tolerance.ignoreDataFields` | Regressões | Comparar menos eventos, deixar campos de dados de fora |
| `tolerance.criticalEventTypes` | Regressões | Tipos cujo aparecimento, perda ou mudança é crítico (padrão: `run.failed`, `action.failed`, `tool.failed`, `policy.violated`) |
| `tolerance.maxEventCountDiff` | Regressões | Até este número de eventos de processo acrescentados ou removidos (verificações de política, novas tentativas, aprovações) é tolerado; uma mudança do resultado nunca é |
| `tolerance.maxDurationDiff`, `severityThresholds` | Regressões | A duração só é verificada com uma delas: uma execução mais lenta em mais de `maxDurationDiff` ms é uma regressão, com a gravidade do limite mais alto atingido; uma execução mais rápida nunca é |

### Suítes de regressão {#regression-suites}

| Método | Devolve | |
| --- | --- | --- |
| `createRegressionTestSuite(agent, { name, goldenTraces: [{ goldenTraceId, name, input?, tags? }] })` | `Promise<RegressionTestSuite>` | Salva em `regressionTestSuitesDir`. `agent`: o id ou o nome de um agente deste SDK. Cada golden trace precisa existir; `input` é, por padrão, a entrada que a execução de referência recebeu; uma suíte não guarda o `signal` nem os callbacks (`onEvent`, `onText`, `onTextRestart`) de uma entrada |
| `getRegressionTestSuites(agent?)` | `Promise<RegressionTestSuite[]>` | As mais recentes primeiro |
| `runRegressionTests(agent, options?)` | `Promise<RegressionTestRunResult>` | Todas as suítes do agente, a mais antiga primeiro: cada teste envia a sua entrada ao agente e compara a execução com o seu golden trace; `suites` tem um resultado por suíte |
| `runRegressionTestSuite(suiteId, options?)` | `Promise<RegressionTestSuiteResult>` | Uma única suíte |
| `runRegressionTestsForCI(agent, options?)` | `Promise<{ results, exitCode }>` | `exitCode`: 0 todos os testes passaram, 1 um teste encontrou uma regressão, 2 um teste não conseguiu rodar (erro ou tempo esgotado); `exitCode: false` nas opções dá 0 |
| `exportTestResults(results, 'junit' \| 'json' \| 'json-summary', { outputPath?, includeDetails? })` | `Promise<string>` | JUnit XML: um `<testsuite>` por suíte; um teste que não conseguiu rodar (erro ou tempo esgotado) é um `<error>`; os caracteres que o XML não pode conter são removidos |

Os ids dos agentes são novos em cada processo: uma suíte também registra o **nome** do seu agente, e outro processo a executa com o seu agente desse nome (primeiro com o id de agente da suíte, quando esse agente está no SDK). Dentro de um mesmo SDK, o id de um agente pertence só a ele: dois agentes com o mesmo nome (duas versões, por exemplo) mantêm cada um as suas suítes, asserções e golden traces, e um nome designa todos eles. Todo agente criado com `createAgent` permanece no seu SDK, então uma aplicação que cria um agente por requisição torna o nome ambíguo: passe ids, ou crie cada agente uma vez e reutilize-o. As suítes salvas por versões anteriores não têm nome: só rodam no processo que as criou. Opções: `parallel` (os testes de uma suíte ao mesmo tempo), `stopOnFirstFailure` (só em execuções sequenciais: nada mais roda depois do primeiro teste que não passa, incluindo as suítes seguintes), `filterTags`, `excludeTags`, `timeout` (ms por teste, 60 000 por padrão, no máximo 2 147 483 647; passado esse tempo, a execução é cancelada e o teste fica `timeout`) e `detection` (as opções de regressão acima).

### Asserções {#assertions}

| Método | Devolve | |
| --- | --- | --- |
| `defineAssertion(name, condition, { description?, severity?, tags?, agentId?, agentName? })` | `Promise<Assertion>` | Para todas as execuções ou para as de um agente; um agente deste SDK indicado por `agentId` também registra o seu nome. Uma condição que não poderia ser avaliada é recusada com um `ValidationError` |
| `getAssertions(agent?, tags?)` | `Promise<Assertion[]>` | As mais recentes primeiro |
| `evaluateAssertions(runId, assertionIds?)` | `Promise<AssertionEvaluationReport>` | As asserções indicadas (um id desconhecido lança um erro) ou, senão, as de todas as execuções mais as do agente da execução |
| `deleteAssertion(assertionId)` | `Promise<void>` | |

| `condition.type` | Precisa de | Passa quando |
| --- | --- | --- |
| `event_present`, `event_absent` | `eventType` ou `eventTypes` | Um dos tipos aparece / nenhum aparece |
| `event_count` | `eventType` ou `eventTypes`, e depois `count`, ou `minCount` e `maxCount` | O número desses eventos se encaixa |
| `event_order` | `beforeEventType`, `afterEventType` | O primeiro de um vem antes do primeiro do outro |
| `event_value` | `eventType`, `valuePath`, `valueMatcher` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`) | Todos os eventos do tipo correspondem |
| `custom` | `customEvaluator(events) => boolean` | A função devolve `true` |

Uma asserção `custom` contém uma função, que não pode ser escrita num arquivo: ela **não é salva** e dura tanto quanto a instância do SDK que a definiu; defina-a de novo na inicialização. Os outros tipos são salvos em `assertionsDir`.

### Comparações e impacto {#comparisons-and-impact}

| Método | Devolve | |
| --- | --- | --- |
| `compareRuns(runId1, runId2, { ignoreEventTypes?, focusAspects?, compareStructureOnly?, includeMetadata? })` | `Promise<RunComparison>` | As diferenças, alinhadas pelo significado como acima: `event_added`, `event_removed`, `event_modified` (tipo alterado), `data_changed`, `sequence_changed` |
| `getComparisonReport(comparison, 'text' \| 'json' \| 'html')` | `Promise<string>` | |
| `analyzeImpact(beforeRunIds, afterRunIds, { metrics?, includeRecommendations? })` | `Promise<ImpactAnalysis>` | Médias de antes e depois de `duration` (ms), `cost` (USD das chamadas ao modelo que têm preço, como `getRunCost`), `quality` (parcela dos eventos que não são ações falhadas) e `success_rate`, com as mudanças de comportamento; salva em `impactAnalysesDir` |
| `getImpactAnalysis(analysisId)` | `Promise<ImpactAnalysis>` | |
| `compareVersions(agent, version1, version2, options?)` | `Promise<ImpactAnalysis>` | `analyzeImpact` sobre as execuções de um agente governado (o seu nome, ou o id de um agente deste SDK) registradas com cada versão: a sua `version` ou o seu `configHash`. Todos os agentes com esse nome contam. Os replays ficam de fora; as duas versões precisam ser diferentes e selecionar execuções diferentes; uma versão desconhecida lança um erro que lista as registradas |

Os eventos do ciclo de vida das execuções de um agente governado (`run.started`, `run.completed`…) registram o seu `agentName`, o seu `agentVersion` e o seu `configHash`: dois agentes com o mesmo nome são um mesmo agente em duas versões, ou em dois processos. O hash cobre o modelo, o prompt de sistema, `maxSteps` e `timeout`, as configurações do provedor, `version`, as capabilities, as ferramentas (nome, descrição, versão, esquema dos parâmetros, metadados, configurações de nova tentativa) e as políticas próprias do agente com as suas regras; ele muda com `setPolicy` e `addTools`, e cada execução registra o hash com que começou. As execuções registradas por versões anteriores só têm o id e a versão.

### Consultas em todas as execuções {#queries-across-runs}

| Método | Devolve |
| --- | --- |
| `queryEventsAdvanced(filter)` | `Promise<{ events, total, filtered, filters, executionTime }>`: os eventos que correspondem, em ordem cronológica (no máximo `limit`), os eventos do escopo, os que correspondem |
| `countEventsAdvanced(filter)` | `Promise<number>` |
| `getEventStatistics(filter)` | `Promise<{ total, byType, byAgent }>` |

Um filtro tem um **escopo** — `runId` (sem ele, todas as execuções), `since`, `until` — e **condições** — `type`, `agentId`, `userId`, `sessionId`, `dataFilters` (`{ path, operator, value?, regex? }`) e `metadataFilters` (`{ field, operator, value? }`). As condições são combinadas com `logic` (`and` por padrão; `or`: pelo menos uma) e depois negadas por `not`; o escopo nunca é. Todos os armazenamentos incluídos respondem: o armazenamento de arquivos lê cada arquivo de execução uma vez por consulta, os armazenamentos SQL consultam o banco de dados. Quando todas as condições precisam valer, o banco de dados filtra ele mesmo os eventos por tipo e ids; com `or` ou `not`, o armazenamento devolve todos os eventos do escopo e as condições são verificadas em memória, o que custa mais num banco de dados grande. Os eventos do mesmo milissegundo mantêm a ordem da sua execução: as execuções por id e, dentro de cada uma, na ordem em que ela os registrou.

## Eventos em tempo real {#live-events}

Um listener é `(event: Event) => unknown`. Ele recebe um evento de cada vez, na ordem de cada execução, assim que o armazenamento o aceita; uma promise que ele devolve é aguardada antes do próximo evento dele. As execuções nunca esperam por ele, e os erros dele são relatados, nunca lançados na execução. No máximo `maxQueued` eventos (10 000 por padrão) aguardam por ele; além disso, os novos são descartados para ele e relatados com um `LiveEventsDroppedError`. Veja [Progresso em tempo real](../guide/observability#live-progress).

| API | |
| --- | --- |
| `RunInput.onEvent`: `agent.run({ message, onEvent })` | Todos os eventos da execução; `run()` só se resolve quando o listener tiver sido concluído para cada um deles, ou antes, quando a execução foi interrompida ou cancelada ou quando `signal` é abortado (a inscrição do listener é então cancelada). O listener não é registrado |
| `ThinkInput.onEvent`: `agent.think({ problem, onEvent })` | O mesmo para uma execução cognitiva, cujo `limits.timeoutMs` também encerra a espera |
| `StudyRunOptions.onEvent`: `study.run({ onEvent })` | O mesmo para a execução de um estudo, cujo `limits.timeoutMs` também encerra a espera |
| `replay(runId, modifications?, { onEvent })` | O mesmo para um replay, que não pode ser cancelado: ele sempre espera |
| `executeTool(name, params, { onEvent })` | Os eventos da chamada, e os das execuções que a ferramenta chamada inicia, em um único nível: o handler recebe o listener como `context.onEvent`, que `governedAgentTool` e `cognitiveAgentTool` repassam ao agente deles (um agente construído à mão sobre um armazenamento sem eventos em tempo real é executado sem ele). `signal` encerra a espera |
| `subscribe(listener, { runId?, agentId?, types?, maxQueued? })` | `() => void`: todos os eventos de todas as execuções que correspondem ao filtro (`agentId` é `metadata.agentId`), até você chamar a função devolvida, que descarta os eventos ainda não entregues. As execuções das suítes de regressão e os replays são execuções reais: o listener também recebe os eventos deles (uma suíte não guarda o `onEvent` nem o `onText` da sua entrada) |
| `new ObservedEventStore(store, { onListenerError? })` | A camada que os entrega; o SDK envolve o seu armazenamento em uma, ou usa aquela que você passa como `eventStore`, inclusive dentro de um `MonitoredEventStore` (cujos relatórios de incidente passam então a ser entregues também). O `subscribe(listener, options?)` dela devolve `{ unsubscribe(), close() }`: `close()` espera até que o listener tenha concluído os eventos que ele já pegou. `onListenerError` recebe os erros dos listeners e os descartes |

## Ferramentas: `ToolDefinition` {#tools-tooldefinition}

| Campo | |
| --- | --- |
| `name`, `description` | O que o modelo vê |
| `schema` | Schema Zod dos argumentos; as chamadas que não correspondem são recusadas |
| `handler(params, context?)` | Recebe os argumentos validados e `{ runId, agentId, signal?, onEvent? }` — `signal` é abortado quando quem chamou desiste; `onEvent` é definido quando quem chamou acompanha a chamada em tempo real: passe-o como o `onEvent` das execuções que a ferramenta inicia |
| `retry` | `{ maxRetries, initialDelayMs?, maxDelayMs?, retryOn?(error) }` — apenas ferramentas idempotentes; argumentos inválidos nunca geram nova tentativa |
| `metadata` | `{ category?, riskLevel?, requiresApproval?, readOnly? }` — `requiresApproval: true` faz cada chamada aguardar `approveAction`; `readOnly` é mostrado aos clientes MCP como `readOnlyHint` |
| `inputJsonSchema` | JSON Schema mostrado no lugar daquele derivado de `schema` |
| `capability`, `version` | Agrupamento, versão |

## Fontes de ferramentas {#tool-sources}

Cada uma devolve `ToolDefinition`s prontas: passe-as para `sdk.defineTool`, para um agente, ou diretamente para o `tools` de um servidor MCP. Veja [Um servidor MCP para qualquer coisa](../guide/mcp-recipes).

| Função | Devolve | |
| --- | --- | --- |
| `openApiTools({ spec, baseUrl?, headers?, include?, exclude?, tags?, prefix?, metadata?, retry?, fetch?, timeoutMs?, maxResponseBytes?, maxSpecBytes? })` | `Promise<ToolDefinition[]>` | Uma ferramenta por operação de uma descrição OpenAPI 3; apenas `GET`, a menos que esteja listada em `include`; os outros métodos exigem aprovação por padrão. Uma chamada devolve `{ status, data, truncated? }` |
| `folderTools({ root, name?, prefix?, extensions?, include?, exclude?, includeHidden?, maxFileBytes?, maxEntries?, maxDepth?, maxMatches?, maxSearchBytes?, maxExaminedEntries? })` | `ToolDefinition[]` | `list_files`, `read_file`, `search_files` sobre uma pasta, nunca fora dela; uma pasta excluída oculta tudo o que contém |
| `folderResources(options)` | `ResourceProvider` | Os mesmos arquivos como recursos MCP `folder://<name>/<path>` |
| `databaseTools({ database, name?, prefix?, maxRows?, maxTextLength?, maxTables?, maxSqlLength? })` | `ToolDefinition[]` | `list_tables`, `describe_table`, `query` (um único statement somente leitura, no máximo `maxRows` linhas, 100 por padrão) |
| `sqliteReadOnly(db)` | `ReadOnlyDatabase` | Para `DatabaseSync` do `node:sqlite` ou `better-sqlite3`; executa as consultas com `PRAGMA query_only = ON` |
| `postgresReadOnly({ pool } \| { client }, { statementTimeoutMs?, schemas? })` | `ReadOnlyDatabase` | Para `pg` (um cliente dedicado, ou um pool); cada consulta em `BEGIN READ ONLY` (recusada em uma conexão que já está dentro de uma transação) … `ROLLBACK` + `pg_advisory_unlock_all()`, com `SET LOCAL statement_timeout` (10 s por padrão); `schemas` limita apenas a listagem e a descrição |
| `cognitiveAgentTool(agent, { name?, description?, metadata?, maxInputLength?, maxContextLength?, exposeErrors? })` | `ToolDefinition` | `ask_<agent>`: `{ problem, context? }` → `{ runId, status, decisionStatus?, answer?, rationale?, confidence?, missing?, nextActions?, error? }`; cancelada junto com quem chamou; `error` é genérico, a menos que `exposeErrors` |
| `governedAgentTool(agent, options)` | `ToolDefinition` | `{ message, context? }` → `{ runId, status, output?, error? }` |
| `assertSingleQuery(sql, 'sqlite' \| 'postgres')` | `string` | A verificação de statement usada pelos adaptadores de banco de dados (apenas sintaxe SQLite e PostgreSQL) |
| `webTools({ include?, prefix?, search?, circuitBreaker?, language?, userAgent?, timeoutMs?, callTimeoutMs?, maxResponseBytes?, maxRedirects?, hostIntervalMs?, robots?, allowPrivateNetwork?, lookup?, maxPdfBytes?, maxPdfPages?, cache?, retry?, arxiv?, wikipedia?, github? })` | `ToolDefinition[]` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search`, somente leitura (`web_fetch` de risco médio, as outras de risco baixo). Resultados de pesquisa `{ id, title, url, date?, excerpt, source }`; uma página `{ url, finalUrl, title?, date?, language?, contentType, content, truncated, untrusted: true, hint? }`. Nenhum endereço fora da Internet pública, a menos que `allowPrivateNetwork`; robots.txt respeitado; cada chamada dentro de `callTimeoutMs` (60 s). Veja [Pesquisa na Web](../guide/web-research) |
| `duckDuckGo({ region?, minIntervalMs?, baseUrl? })` | `SearchProvider` | O provedor padrão de `web_search`, sem chave: a página HTML do DuckDuckGo, 1,5 s entre pesquisas |
| `searxng({ baseUrl, engines?, categories?, minIntervalMs? })` | `SearchProvider` | A API JSON de uma instância SearXNG; resultados nomeados `searxng:<engine>`, datados por `publishedDate` |
| `brave({ apiKey, baseUrl?, minIntervalMs? })`, `tavily(…)`, `serper(…)` | `SearchProvider` | As APIs Brave Search, Tavily e Serper, com a sua chave |
| `citableUrl(url)`, `normalizeUrl(url)` | `string \| undefined` | A URL pela qual um resultado de pesquisa é citado (parâmetros de rastreamento e fragmento removidos), e aquela pela qual ele é identificado para o seu id e as duplicatas (também host em minúsculas, sem barra final); `undefined` para qualquer coisa que não seja http(s) |
| `isPublicAddress(address)` | `boolean` | Se um endereço IP está na Internet pública (a verificação por trás de `allowPrivateNetwork`) |

```ts
interface ReadOnlyDatabase {
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  describeTable(name: string): Promise<ColumnSummary[]>;
  /** Must refuse writes itself; rows converted with toJsonRow(row, maxTextLength) as they arrive. */
  query(sql: string, options: { maxRows: number; maxTextLength: number }): Promise<{ columns: string[]; rows: Array<Record<string, unknown>>; truncated: boolean }>;
}

interface ResourceProvider {
  handles(uri: string): boolean;
  list(): Promise<Array<{ uri: string; name: string; description?: string; mimeType?: string; size?: number }>>;
  read(uri: string): Promise<{ uri: string; mimeType?: string; text: string }>;
}
```

`web_search` consulta os seus provedores em ordem; um provedor que lança uma exceção passa a vez ao seguinte, e um que lança `SearchThrottledError` (ou falha três vezes seguidas) é pulado durante `circuitBreaker.cooldownMs` (2 minutos). As ferramentas Web lançam `WebRequestRefusedError` para o que recusam de propósito (`reason`: `private-address`, `scheme`, `downgrade`, `redirects`, `robots`, `content-type`, `too-large`, `pacing`), `WebHttpError` para uma resposta fora de 2xx (`status`), `WebTimeoutError` (uma requisição, o prazo da chamada ou o orçamento de tempo de uma extração), `WebConfigurationError` para uma configuração ausente (`unpdf`, um token do GitHub) e `SearchUnavailableError` quando nenhum provedor respondeu (`failures`). `retry` nunca tenta de novo uma recusa, uma configuração ausente ou uma pesquisa à qual nenhum provedor respondeu.

```ts
interface SearchProvider {
  readonly name: string;
  /** The origin of a baseUrl you gave it: its requests there may reach a private network. */
  readonly configuredOrigin?: string;
  /** Send every request through `web`: timeouts, byte caps, pacing and address checks. */
  search(request: SearchRequest, web: WebClient): Promise<SearchHit[]>;
}

interface SearchRequest {
  query: string;
  maxResults: number;
  site?: string;
  freshness?: 'day' | 'week' | 'month' | 'year';
  language?: string;
  signal?: AbortSignal;
}

interface SearchHit { title: string; url: string; excerpt: string; date?: string; source?: string }

interface WebClient {
  request(url: string, init?: {
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    minIntervalMs?: number;
    signal?: AbortSignal;
    maxBytes?: number;
  }): Promise<{ status: number; url: string; headers: Record<string, string>; body: Buffer; truncated: boolean }>;
}
```

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| Função | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP que expõe exatamente o que `tools` lista: nomes de ferramentas definidas e/ou `ToolDefinition`s (definidas no SDK para você; a mesma definição pode ser passada de novo, outra ferramenta com um nome já usado é recusada). `resources`: um ou vários `ResourceProvider`s; cada leitura é rastreada. As chamadas são executadas como `mcp:<name>` (ou `agentId`); uma aprovação que ninguém decide dentro de `approvalTimeoutMs` (50 000 ms por padrão) é cancelada; as recusas de entrada são explicadas ao cliente, as outras causas apenas com `exposeErrorDetails`. Uma chamada com um `progressToken` recebe uma `notifications/progress` por evento, todas enviadas antes do resultado ([notificações de progresso](../guide/mcp-deploy#progress-notifications)) |
| `serveMcpOverStdio(sdk, options)` | O mesmo, conectado a stdin/stdout; escreve uma linha "ready" no stderr, e fecha quando o stdin termina (as chamadas em andamento são abortadas, as aprovações pendentes canceladas). `approvalTimeoutMs` é 50 000 por padrão, como em `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — as ferramentas de qualquer servidor MCP, como `ToolDefinition`s |

`GovernedToolHost` é o que o servidor precisa do SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` devolve um objeto que o implementa.

## Blocos de construção {#building-blocks}

Os blocos de construção do SDK são exportados para configurações personalizadas: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `ObservedEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, e os respectivos tipos principais.
