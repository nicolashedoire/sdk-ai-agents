# Arquitetura

![Arquitetura do SDK](/images/architecture.svg){.illustration}

## Camada cognitiva (v0.2) {#cognitive-layer-v0-2}

A versão 0.2 acrescenta uma camada de raciocínio sobre o runtime governado descrito abaixo. Ela é construída a partir de partes pequenas e substituíveis:

| Parte | Módulo | Responsabilidade |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | Ciclo de execução, cancelamento, timeout, feedback |
| `OperationSelector` | `src/cognition/operation-selector.ts` | Calcula as operações disponíveis, consulta o controlador, força a decisão final |
| Controladores | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | Escolha heurística ou apoiada no Jev da próxima operação |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | Encaminha para o gerador de pensamentos, o buscador de informações, o testador de predições ou o avaliador de hipóteses |
| Admissão de patches | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | Entrada única de cada pensamento: campos permitidos por operação, campos reservados ao motor, fechamento da decisão |
| Evidências | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | Proveniência das observações, revisões de fatos, comparações, resultados de testes, contradições e as suas resoluções |
| Visão do estado | `src/cognition/mental-state-view.ts` | Visão compacta do estado para os prompts de pensamento e para os conjuntos de dados do controlador: prontidão, classificação, experimentos já realizados |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | Executa o seu `OutcomeEvaluator` sobre uma predição pendente e registra o relatório |
| Salvaguarda de conclusão | `src/cognition/decision-readiness.ts` | Classificação, verificação de prontidão, committed / provisional / abstain |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | Um prompt por operação, JSON rigoroso, validação Zod, uma correção |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | Seleção de ferramentas com o motor de raciocínio nativo, execução pelo motor de ações |
| Redutor | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | Aplicação pura e determinística dos patches de pensamento com invariantes, versionada por `schemaVersion` |
| Replay | `src/cognition/mental-state-replay.ts` | Reconstrução do estado mental e conjunto de dados do controlador a partir dos eventos |
| Perfis | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | Schema do perfil, renderização, refinamento, destilação |
| Avaliadores de hipóteses | `src/cognition/hypothesis-assessor.ts` | `compare` com decisões tipadas: evidências perguntadas sem o pensador, adequação perguntada apenas para as propostas |
| Gravador e fábrica | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | Formatos dos eventos de uma execução cognitiva; montagem de um agente a partir da sua configuração e dos serviços do SDK |

Em volta dela: `src/decisions` (decisões tipadas, cliente do Jev, serviço de decisões), `src/costs` (preços e custos das execuções), `src/resilience` (política de novas tentativas e provedor com novas tentativas), `src/incidents` (regras, notificadores, armazenamento de eventos monitorado) e `src/mcp` (servidor e cliente, publicados como `@sdk-ai-agents/core/mcp`).

O restante desta página documenta o runtime governado (v0.1).

## Resumo executivo {#executive-summary}

O SDK_AI_Agents segue uma arquitetura de event sourcing com separação estrita entre raciocínio e ação. O SDK esconde a complexidade interna por trás de uma API simples e intuitiva.

## Padrão de arquitetura {#architecture-pattern}

**Padrão principal:** event sourcing com separação de responsabilidades

- **Reasoning Engine** (motor de raciocínio): gera intenções a partir do LLM (sem efeitos colaterais)
- **Action Engine** (motor de ações): executa as intenções depois da validação
- **Policy Engine** (motor de políticas): valida as intenções em relação às políticas
- **Event Store** (armazenamento de eventos): única fonte da verdade para todos os eventos

## Visão geral dos componentes {#component-overview}

### 1. Camada da API do SDK (fachada) {#_1-sdk-api-layer-facade}

**Responsabilidades:**
- Interface pública simples e intuitiva
- Mapeamento da API → eventos internos
- Configuração padrão inteligente
- Gerenciamento do ciclo de vida do SDK e dos agentes

**Arquivos:**
- `src/sdk.ts`: implementação principal (`SDKImpl`)
- `src/agent.ts`: implementação do agente (`AgentImpl`)
- `src/index.ts`: exportações públicas

**Interfaces principais:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. Motor de raciocínio (Reasoning Engine) {#_2-reasoning-engine}

**Responsabilidades:**
- Integração com o provedor de LLM (OpenAI/Anthropic)
- Geração de intenções estruturadas a partir das respostas do LLM
- Gerenciamento do contexto da conversa
- Emissão de eventos de raciocínio

**Arquivo:** `src/engines/reasoning-engine.ts`

**Restrições:**
- Nunca pode executar uma ferramenta diretamente
- Nunca pode causar um efeito colateral
- Apenas gera intenções estruturadas

**Dependências:**
- LLM Provider (padrão Strategy)
- Event Store (emissão de eventos)

### 3. Motor de ações (Action Engine) {#_3-action-engine}

**Responsabilidades:**
- Receber e validar as intenções
- Executar as ferramentas via Tool Registry
- Aplicar as políticas via Policy Engine
- Emissão de eventos de ação

**Arquivo:** `src/engines/action-engine.ts`

**Restrições:**
- Toda ação precisa passar pelo Action Engine
- Validação obrigatória antes da execução
- Evento emitido para cada ação

**Dependências:**
- Policy Engine (validação)
- Tool Registry (execução)
- Event Store (emissão de eventos)
- Approval Manager (opcional)
- Budget Tracker (opcional)

### 4. Motor de políticas (Policy Engine) {#_4-policy-engine}

**Responsabilidades:**
- Validar as intenções em relação às políticas ativas
- Aplicar as políticas globais e específicas
- Verificar orçamentos, timeouts, allowlists
- Emissão de eventos de validação

**Arquivo:** `src/engines/policy-engine.ts`

**Restrições:**
- Negado por padrão (deny-by-default): tudo é proibido, a menos que seja explicitamente autorizado
- Verificação obrigatória antes de cada ação

**Dependências:**
- Event Store (emissão de eventos de validação)
- Budget Tracker (opcional)
- Condition Evaluator

### 5. Motor de replay (Replay Engine) {#_5-replay-engine}

**Responsabilidades:**
- Reproduzir execuções a partir dos eventos persistidos
- Replay determinístico sem chamada ao LLM
- Geração de novos eventos de replay

**Arquivo:** `src/engines/replay-engine.ts`

**Restrições:**
- O replay usa apenas os eventos persistidos
- Nenhuma chamada ao LLM durante o replay
- O replay reproduz a mesma sequência lógica

**Dependências:**
- Event Store (leitura de eventos)
- Action Engine (execução das intenções)

### 6. Armazenamento de eventos (Event Store) {#_6-event-store}

**Responsabilidades:**
- Persistir os eventos (append-only)
- Recuperar os eventos por runId
- Filtrar e consultar os eventos
- Abstração para diferentes implementações

**Arquivos:**
- `src/stores/event-store.ts`: interface `IEventStore`
- `src/stores/file-event-store.ts`: implementação baseada em arquivos
- `src/stores/sql-event-store.ts`: implementação SQL genérica
- `src/stores/sqlite-event-store.ts`: implementação SQLite
- `src/stores/postgresql-event-store.ts`: implementação PostgreSQL
- `src/stores/observed-event-store.ts`: entrega em tempo real cada evento adicionado aos seus listeners (`onEvent`, `sdk.subscribe`)

**Interface:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
  subscribe?(listener: LiveEventListener, filter?: LiveEventFilter): EventSubscription
}
```

### 7. Registro de ferramentas (Tool Registry) {#_7-tool-registry}

**Responsabilidades:**
- Gerenciar as ferramentas declaradas
- Validação do schema de entrada (Zod)
- Executar as ferramentas com validação
- Allowlist rigorosa (deny-by-default)

**Arquivo:** `src/registry/tool-registry.ts`

**Restrições:**
- Rejeição automática das ferramentas não declaradas
- Validação obrigatória antes da execução
- Allowlist rigorosa

**Dependências:**
- Zod (validação de schema)

### 8. Registro de capacidades (Capability Registry) {#_8-capability-registry}

**Responsabilidades:**
- Gerenciar as capacidades (grupos de ferramentas)
- Associação ferramenta ↔ capacidade

**Arquivo:** `src/registry/capability-registry.ts`

### 9. Abstração dos provedores de LLM {#_9-llm-provider-abstraction}

**Responsabilidades:**
- Abstrair as diferenças entre os provedores de LLM
- Normalizar os formatos de requisição/resposta
- Suporte a vários provedores (OpenAI, Anthropic)
- Fallback automático

**Arquivos:**
- `src/providers/llm-provider.ts`: interface `LLMProvider`
- `src/providers/openai-provider.ts`: implementação OpenAI
- `src/providers/anthropic-provider.ts`: implementação Anthropic
- `src/providers/fallback-provider.ts`: provedor com fallback
- `src/providers/provider-factory.ts`: fábrica para criar os provedores

**Interface:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. Classes gerenciadoras {#_10-manager-classes}

**Responsabilidades:**
- Gerenciar os recursos avançados
- Coordenação entre os componentes

**Arquivos:**
- `src/managers/approval-manager.ts`: gerenciamento das aprovações humanas
- `src/managers/budget-tracker.ts`: acompanhamento de orçamento e de consumo
- `src/managers/golden-trace-manager.ts`: gerenciamento dos golden traces
- `src/managers/regression-test-manager.ts`: gerenciamento das suítes de testes
- `src/managers/assertion-manager.ts`: gerenciamento das asserções
- `src/managers/impact-analysis-manager.ts`: gerenciamento das análises de impacto

## Arquitetura de dados {#data-architecture}

### Tipos de eventos {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.stopped'
  | 'intention.generated'
  | 'intention.rejected' // never recorded by the SDK
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed' // never recorded by the SDK
  | 'resource.read'
  | 'provider.fallback'
  | 'provider.retry'
  | 'provider.answer_discarded'
  | 'tool.retry'
  | 'incident.reported'
  | 'error.occurred' // never recorded by the SDK
  | 'cognition.started'
  | 'cognition.operation_selected'
  | 'cognition.thought'
  | 'cognition.operation_failed'
  | 'cognition.concluded'
  | 'cognition.evaluated'
  | 'cognition.feedback'
  | 'cognition.knowledge_recorded'
  | 'decision.evaluated';
```

### Estrutura de um evento {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### Implementações do armazenamento de eventos {#event-store-implementations}

1. **FileEventStore** (MVP)
   - Persistência baseada em arquivos
   - Um arquivo JSON por runId
   - Gravação automática em lotes

2. **SQLEventStore** (produção)
   - Implementação SQL genérica
   - Suporte a SQLite e PostgreSQL
   - Índices para desempenho

3. **PostgreSQLEventStore** (produção avançada)
   - Usa JSONB para um armazenamento eficiente
   - Índices GIN para consultas JSON
   - Suporte a consultas avançadas

## Design da API {#api-design}

### Inicialização do SDK {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Criação de um agente {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Definição de uma ferramenta {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Execução de um agente {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Estratégia de testes {#testing-strategy}

### Testes unitários {#unit-tests}

- Testes unitários para cada módulo
- Usa o Vitest
- Mocking das dependências externas

### Testes de integração {#integration-tests}

- Testes de integração para fluxos completos
- Testes com diferentes armazenamentos de eventos
- Testes de replay

### Golden traces {#golden-traces}

- Traces de referência para testes de regressão
- Validação de comportamento via replay
- Detecção automática de regressões

## Arquitetura de implantação {#deployment-architecture}

### Distribuição do pacote {#package-distribution}

- **Nome do pacote**: `@sdk-ai-agents/core`
- **Distribuição**: npm
- **Ponto de entrada**: `dist/index.js`
- **Definições de tipos**: `dist/index.d.ts`

### Processo de build {#build-process}

1. Compilação TypeScript (`tsc`)
2. Source maps gerados
3. Arquivos de declaração gerados
4. Saída em `dist/`

### Dependências {#dependencies}

**Runtime:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Dependências peer (peer dependencies):**
- `pg`: ^8.11.0 (para o PostgreSQLEventStore)

**Dependências de desenvolvimento:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Considerações de segurança {#security-considerations}

### Negado por padrão (deny-by-default) {#deny-by-default}

- Todas as ferramentas precisam ser declaradas explicitamente
- Todas as ações precisam passar pelo Policy Engine
- Validação obrigatória antes da execução

### Separação de responsabilidades {#separation-of-concerns}

- O Reasoning Engine não pode executar ferramentas
- O Action Engine valida antes da execução
- O Policy Engine verifica todas as ações

### Trilha de auditoria {#audit-trail}

- Todos os eventos são persistidos
- Rastreabilidade completa das decisões
- Trilha de auditoria das políticas

## Considerações de desempenho {#performance-considerations}

### Desempenho do armazenamento de eventos {#event-store-performance}

- FileEventStore: gravação em lotes (10 eventos ou 100 ms)
- SQLEventStore: índices para consultas rápidas
- PostgreSQLEventStore: JSONB + índices GIN

### Sobrecarga do SDK {#sdk-overhead}

- Sobrecarga mínima (< 5-10 ms, sem contar LLM/ferramentas)
- Emissão assíncrona de eventos
- Gravação em lotes para desempenho

## Considerações futuras {#future-considerations}

### Escalabilidade {#scalability}

- Migração para um armazenamento de eventos distribuído (no estilo Kafka)
- Suporte a múltiplas instâncias
- Clusterização do armazenamento de eventos

### Recursos {#features}

- Suporte a outros provedores de LLM
- Armazenamento de eventos na nuvem (S3 etc.)
- Painel de monitoramento
