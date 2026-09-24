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
| `providerConfig` | `{ openai?, anthropic? }` | `apiKey`, `defaultModel` e `baseURL` de cada fornecedor (`baseURL`: um endpoint compatível, como a API v1 do Azure OpenAI ou um servidor de modelos local, ou um proxy). O principal usa a entrada do seu fornecedor, e um fallback de outro fornecedor a do seu. Modelos padrão: `gpt-5.4` e `claude-opus-5`. A entrada da OpenAI também aceita `reasoningModels`, `reasoningEffort` e `nativeToolMessages`: veja [Modelos da OpenAI](#openai-models) |
| `fallbackProviders` | `Array<{ provider, config? }>` | Tentados em ordem quando o principal falha; um `config` prevalece sobre `providerConfig`. Um fallback do mesmo fornecedor que o principal não herda nenhuma das suas configurações (só a `apiKey` global); um de outro fornecedor precisa da própria chave |
| `llmProvider` | `LLMProvider` | O seu próprio provedor (modelo local, gateway, dublê de teste). Recebe as chamadas de ferramenta e os resultados no formato nativo (`LLMMessage`) se declarar `nativeToolMessages`, e como texto caso contrário |
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

## Agentes {#agents}

| Método | Devolve | |
| --- | --- | --- |
| `createAgent(config)` | `AgentImpl` | Agente governado: `run({ message, context?, signal? })`, `stop(runId?)`, `addTools()`, `setPolicy()`, `id`, `name`. Ele só pode executar as suas próprias ferramentas (`tools`, `capabilities`), mesmo que o modelo mencione outra ferramenta registrada no SDK; `signal` cancela a execução |
| `createCognitiveAgent(config)` | `CognitiveAgent` | `think({ problem, context?, observations?, metadata? })`, `stop(runId?)`, `learnFromFeedback(runId, feedback)`, `getProfile()`, `setProfile()` |
| `defineTool(definition)` | `Tool` | Registra uma ferramenta; o handler é tipado a partir do seu schema Zod |
| `defineCapability(definition)` | `Capability` | Agrupa ferramentas |
| `listTools()` | `Tool[]` | Todas as ferramentas registradas |
| `executeTool(name, params, { agentId?, runId?, allowedTools?, signal?, approvalTimeoutMs? })` | `Promise<unknown>` | Execução governada fora de um agente (usada pelo servidor MCP): argumentos, políticas, aprovação, orçamento (contado quando a chamada começa) e, depois, a ferramenta. `signal` cancela uma aprovação pendente e chega ao handler; `approvalTimeoutMs` cancela uma aprovação que ninguém decidiu |
| `traceResourceRead(uri, read, { agentId? })` | `Promise<ResourceContent>` | Executa `read()` como uma execução própria: `run.started`, `resource.read` (URI, tamanho, SHA-256), `run.completed` ou `run.failed` |
| `stopRun(runId)` | `Promise<void>` | Interrompe uma execução governada ou cognitiva |

### `CognitiveAgentConfig` {#cognitiveagentconfig}

| Opção | Padrão | |
| --- | --- | --- |
| `name`, `model` | — | Obrigatórios |
| `profile` | `DEFAULT_THINKER_PROFILE` | Como o agente raciocina |
| `tools`, `policies` | `[]` | Governadas como em qualquer outro lugar |
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

O que `getRunCost(runId)` devolve: cada chamada ao modelo da execução que o fornecedor respondeu, incluindo etapas que falharam — veja [Custos de API](../guide/costs).

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
  costUsd?: number;
}
```

| Campo | |
| --- | --- |
| `totalUsd` | Custo das chamadas cujo custo é conhecido; apenas um mínimo quando `complete` é `false` |
| `complete` | `false` quando o custo de algumas chamadas é desconhecido: `unpricedCalls` ou `unmeteredCalls` acima de 0 |
| `unpricedModels`, `unpricedCalls` | Modelos sem preço em `pricing`, e as chamadas deles que informaram os tokens |
| `unmeteredModels`, `unmeteredCalls` | Modelos das chamadas que não informaram nenhuma contagem de tokens de entrada ou de saída, e essas chamadas |
| `lines` | Uma por modelo e origem: chamadas, tokens das chamadas que os informaram, `unmeteredCalls` quando houver, `costUsd` quando o modelo tem preço; `model` é `unknown` para uma chamada que não registrou nenhum nome de modelo |

## Traces, replay e testes {#traces-replay-and-testing}

| Método | |
| --- | --- |
| `getTrace(runId)`, `exportTrace(runId, 'json' \| 'text')`, `getEvents(runId, filters?)` | Ler as execuções |
| `replay(runId, modifications?)` | Reexecutar sem o LLM |
| `getReasoningGraph`, `exportReasoningGraph`, `getAlternatives`, `getDecisionPatterns`, `getTraceVisualization` | Entender as decisões |
| `createGoldenTrace`, `getGoldenTraces`, `validateAgainstGoldenTrace`, `replayAndValidate`, `detectRegressions` | Testar agentes como código |

## Ferramentas: `ToolDefinition` {#tools-tooldefinition}

| Campo | |
| --- | --- |
| `name`, `description` | O que o modelo vê |
| `schema` | Schema Zod dos argumentos; as chamadas que não correspondem são recusadas |
| `handler(params, context?)` | Recebe os argumentos validados e `{ runId, agentId, signal? }` — `signal` é abortado quando quem chamou desiste |
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

## MCP — `@sdk-ai-agents/core/mcp` {#mcp-—-sdk-ai-agents-core-mcp}

| Função | |
| --- | --- |
| `createMcpServer(sdk, { name, tools, resources?, version?, agentId?, instructions?, approvalTimeoutMs?, exposeErrorDetails? })` | `Server` MCP que expõe exatamente o que `tools` lista: nomes de ferramentas definidas e/ou `ToolDefinition`s (definidas no SDK para você; a mesma definição pode ser passada de novo, outra ferramenta com um nome já usado é recusada). `resources`: um ou vários `ResourceProvider`s; cada leitura é rastreada. As chamadas são executadas como `mcp:<name>` (ou `agentId`); uma aprovação que ninguém decide dentro de `approvalTimeoutMs` (50 000 ms por padrão) é cancelada; as recusas de entrada são explicadas ao cliente, as outras causas apenas com `exposeErrorDetails` |
| `serveMcpOverStdio(sdk, options)` | O mesmo, conectado a stdin/stdout; escreve uma linha "ready" no stderr, e fecha quando o stdin termina (as chamadas em andamento são abortadas, as aprovações pendentes canceladas). `approvalTimeoutMs` é 50 000 por padrão, como em `createMcpServer` |
| `connectMcpServer({ name, transport, toolPrefix?, include?, metadata?, retry? })` | `{ tools, client, close() }` — as ferramentas de qualquer servidor MCP, como `ToolDefinition`s |

`GovernedToolHost` é o que o servidor precisa do SDK (`listTools`, `defineTool`, `executeTool`, `traceResourceRead`); `createSDK()` devolve um objeto que o implementa.

## Blocos de construção {#building-blocks}

Os blocos de construção do SDK são exportados para configurações personalizadas: `JevClient`, `DecisionService`, `LLMThoughtGenerator`, `HeuristicController`, `TypedDecisionController`, `TypedHypothesisAssessor`, `PredictionTester`, `applyThought`, `assembleThought`, `assessReadiness`, `rankHypotheses`, `rebuildMentalState`, `describeMentalState`, `fingerprint`, `defineThinkerProfile`, `refineProfile`, `withRetry`, `RetryingLLMProvider`, `OpenAIProvider`, `AnthropicProvider`, `FallbackProvider`, `MonitoredEventStore`, `EmailIncidentNotifier`, `WebhookIncidentNotifier`, `ResendEmailTransport`, `computeRunCost`, `FileEventStore`, `SQLiteEventStore`, `PostgreSQLEventStore`, e os respectivos tipos principais.
