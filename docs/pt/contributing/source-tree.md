# Árvore do código-fonte

## Visão geral {#overview}

O SDK é organizado em uma estrutura modular clara, com separação de responsabilidades. O código-fonte principal fica em `src/`, com subpastas para cada domínio funcional.

## Estrutura completa de diretórios {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents, the Web
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## Diretórios críticos {#critical-directories}

### `src/engines/` {#src-engines}

**Finalidade:** contém os principais motores do SDK, que orquestram o ciclo de vida de um agente.

**Contém:**
- `reasoning-engine.ts`: gera intenções a partir do LLM (sem efeitos colaterais)
- `action-engine.ts`: executa as intenções depois da validação pelo Policy Engine
- `policy-engine.ts`: valida as intenções em relação às políticas configuradas
- `replay-engine.ts`: reproduz as execuções a partir dos eventos persistidos

**Pontos de entrada:** usados por `AgentImpl` e `SDKImpl`

**Integração:** os motores são injetados em `AgentImpl` e `SDKImpl` pelo construtor

### `src/stores/` {#src-stores}

**Finalidade:** implementações da interface `IEventStore` para a persistência dos eventos.

**Contém:**
- `event-store.ts`: interface comum `IEventStore`
- `file-event-store.ts`: implementação baseada em arquivos (MVP)
- `sql-event-store.ts`: implementação SQL genérica
- `sqlite-event-store.ts`: implementação SQLite
- `postgresql-event-store.ts`: implementação PostgreSQL com JSONB
- `observed-event-store.ts`: entrega em tempo real cada evento adicionado aos seus listeners (`onEvent`, `sdk.subscribe`)

**Pontos de entrada:** usados por `SDKImpl` e `ReplayEngine`

**Integração:** injetado em `SDKImpl` pela configuração

### `src/providers/` {#src-providers}

**Finalidade:** implementações da interface `LLMProvider` para os diferentes provedores de LLM.

**Contém:**
- `llm-provider.ts`: interface comum `LLMProvider`
- `openai-provider.ts`: implementação OpenAI
- `anthropic-provider.ts`: implementação Anthropic
- `fallback-provider.ts`: provedor com fallback automático
- `provider-factory.ts`: fábrica para criar os provedores

**Pontos de entrada:** usados pelo `ReasoningEngine`

**Integração:** injetado no `ReasoningEngine` pelo construtor

### `src/managers/` {#src-managers}

**Finalidade:** classes de gerenciamento para os recursos avançados (aprovações, orçamentos, testes etc.).

**Contém:**
- `approval-manager.ts`: gerenciamento das aprovações humanas
- `budget-tracker.ts`: acompanhamento de orçamento e de consumo
- `golden-trace-manager.ts`: gerenciamento dos golden traces
- `regression-test-manager.ts`: gerenciamento das suítes de testes de regressão
- `assertion-manager.ts`: gerenciamento das asserções de comportamento
- `impact-analysis-manager.ts`: gerenciamento das análises de impacto

**Pontos de entrada:** usados por `SDKImpl` e `PolicyEngine`

**Integração:** injetados em `SDKImpl` e `PolicyEngine` pelo construtor

### `src/registry/` {#src-registry}

**Finalidade:** registros para gerenciar as ferramentas e as capacidades disponíveis.

**Contém:**
- `tool-registry.ts`: gerenciamento das ferramentas disponíveis (deny-by-default)
- `capability-registry.ts`: gerenciamento das capacidades (grupos de ferramentas)

**Pontos de entrada:** usados por `SDKImpl` e `ActionEngine`

**Integração:** injetados em `SDKImpl` e `ActionEngine` pelo construtor

### `src/types/` {#src-types}

**Finalidade:** definições TypeScript de todos os tipos do SDK.

**Contém:**
- Tipos para Agent, Tool, Policy, Event, Run, SDK
- Tipos para os recursos avançados (Reasoning Graph, Alternatives etc.)
- Tipos para os testes (Golden Trace, Regression, Assertion etc.)

**Pontos de entrada:** importados por todos os módulos

**Integração:** usados em toda a base de código para a segurança de tipos

### `src/utils/` {#src-utils}

**Finalidade:** funções utilitárias e helpers.

**Contém:**
- `constants.ts`: constantes globais
- `id.ts`: geração de IDs únicos
- `zod-to-json-schema.ts`: conversão Zod → JSON Schema
- Utilitários para Reasoning Graph, Alternatives, Patterns etc.
- Utilitários para os testes (Validation, Regression, Assertion etc.)

**Pontos de entrada:** importados pelos módulos que precisam deles

**Integração:** usados pelos motores, pelos gerenciadores e por outros módulos

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**Finalidade:** agentes cognitivos — estado mental explícito, operações cognitivas, controladores, perfis de pensador.

**Contém:** `cognitive-agent.ts` (ciclo de execução), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (heurístico), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` e `thought-prompts.ts`, `mental-state.ts` (schemas e tipos), `mental-state-reducer.ts` e `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/study/` {#src-study}

**Finalidade:** estudos (`sdk.createStudy`) — um pesquisador que entende um objeto e depois propõe como redesenhá-lo, separado do motor cognitivo.

**Contém:** `study.ts` (a classe `Study`: execuções, guardião, emendas, pesquisa do estado da técnica), `passages.ts` (as sete passagens, as suas coleções e os seus schemas), `study-config.ts` (configuração, carta congelada e o seu hash), `study-prompts.ts` e `study-replies.ts` (prompts reconstruídos a cada chamada, respostas lidas em relação aos seus schemas), `study-claims.ts` (status das afirmações verificados em código), `study-sources.ts` (fontes, parâmetros de consulta, resultados), `study-model.ts` e `study-run.ts` (chamadas ao modelo, limites, eventos), `study-report.ts`, `study-markdown.ts` e `study-labels.ts` (o relatório, e o dossiê em onze idiomas), `study-types.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**Finalidade:** decisões tipadas — o contrato Noul/Choice/Score, o cliente HTTP do TypeSafe Jev e o `DecisionService` por trás de `sdk.decisions`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**Finalidade:** preços e relatórios de custo por execução; política de novas tentativas e provedor de LLM com novas tentativas; regras de incidentes, notificadores (e-mail, webhook, Resend) e o armazenamento de eventos monitorado.

### `src/mcp/` e `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**Finalidade:** servidor MCP que expõe ferramentas e recursos governados (`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`) e cliente MCP que importa ferramentas (`mcp-client.ts`). Publicado como o ponto de entrada `@sdk-ai-agents/core/mcp`, para que o núcleo não dependa de `@modelcontextprotocol/sdk`.

### `src/tools/` {#src-tools}

**Finalidade:** fontes de ferramentas que constroem `ToolDefinition`s a partir de um sistema, sem nenhuma dependência do MCP: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (APIs web), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (pastas e recursos), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (bancos de dados somente leitura), `agent-tools.ts` (agentes como ferramentas), além de `tool-names.ts` e `bounded-text.ts`. `web/` contém as ferramentas de pesquisa na Web: `web-tools.ts` (`webTools`), `guarded-http.ts` e `ip-ranges.ts` (o cliente HTTP e as suas verificações de endereço, redirecionamento, tamanho e tempo), `robots.ts` e `politeness.ts` (robots.txt, espaçamento por host), `web-cache.ts`, `results.ts` (resultados citáveis), `html-parser.ts` / `html-to-markdown.ts` / `html-entities.ts` (páginas para Markdown), `pdf-text.ts` (PDFs com o pacote opcional `unpdf`), `web-fetch.ts`, `search-chain.ts` e `providers/` (DuckDuckGo, SearXNG, Brave, Tavily, Serper), `sources/` (arXiv, Wikipedia, GitHub).

### `src/__tests__/support/` {#src-tests-support}

**Finalidade:** dublês de teste que implementam as portas (ports) do SDK (provedor de LLM roteirizado, cliente de decisões em memória, servidor HTTP local, cliente PostgreSQL que grava as consultas, carregador de `node:sqlite`) — sem mocks de módulos.

## Pontos de entrada {#entry-points}

### Entrada principal {#main-entry}

- **`src/index.ts`**: ponto de entrada público do SDK, exporta todas as APIs públicas

### Pontos de entrada da aplicação {#application-entry-points}

- **`src/sdk.ts`**: implementação principal do SDK (`SDKImpl`)
- **`src/agent.ts`**: implementação do agente (`AgentImpl`)

## Padrões de organização de arquivos {#file-organization-patterns}

### Convenções de nomenclatura {#naming-conventions}

- **Arquivos**: kebab-case para os arquivos (ex.: `reasoning-engine.ts`)
- **Classes**: PascalCase (ex.: `ReasoningEngine`)
- **Interfaces**: PascalCase com o prefixo `I` quando necessário (ex.: `IEventStore`)
- **Types**: PascalCase (ex.: `EventType`, `RunStatus`)
- **Funções**: camelCase (ex.: `generateCompletion`)

### Organização dos módulos {#module-organization}

- **Uma classe/interface por arquivo**: cada arquivo contém uma classe ou interface principal
- **Tipos colocalizados**: tipos associados no mesmo arquivo ou em `types/`
- **Barrel exports**: `index.ts` para exportar as APIs públicas

## Arquivos de configuração {#configuration-files}

- **`package.json`**: dependências e scripts npm
- **`tsconfig.json`**: configuração do TypeScript (strict mode, ESM)
- **`biome.json`**: configuração do Biome (lint/formatação)
- **`vitest.config.ts`**: configuração do Vitest (testes)

## Notas para o desenvolvimento {#notes-for-development}

### Adicionar novos recursos {#adding-new-features}

1. **Novo motor**: crie-o em `src/engines/`, injete-o em `SDKImpl` ou `AgentImpl`
2. **Novo armazenamento**: implemente `IEventStore` em `src/stores/`
3. **Novo provedor**: implemente `LLMProvider` em `src/providers/`
4. **Novo gerenciador**: crie-o em `src/managers/`, injete-o em `SDKImpl`
5. **Novos tipos**: adicione-os em `src/types/`, exporte-os a partir de `types/index.ts`

### Testes {#testing}

- Testes unitários em `src/__tests__/`
- Um arquivo de teste por módulo de código-fonte
- Use o Vitest para os testes

### Build {#build}

- O TypeScript compila `src/` → `dist/`
- Source maps gerados para a depuração
- Declarações TypeScript (`.d.ts`) geradas
