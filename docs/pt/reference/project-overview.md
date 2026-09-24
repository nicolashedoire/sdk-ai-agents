# Visão geral do projeto

**Tipo:** biblioteca (SDK em TypeScript)
**Arquitetura:** event sourcing com separação de responsabilidades

## Resumo executivo {#executive-summary}

O SDK_AI_Agents é uma infraestrutura de governança de agentes de IA com event sourcing nativo, replay e segurança desde a concepção. O SDK transforma os agentes de IA de ferramentas experimentais em sistemas de decisão governáveis, explicáveis e prontos para produção.

## Classificação do projeto {#project-classification}

- **Tipo de repositório:** monólito (uma única base de código coesa)
- **Tipo de projeto:** biblioteca (SDK em TypeScript)
- **Linguagem principal:** TypeScript 5.x
- **Padrão de arquitetura:** event sourcing com separação de responsabilidades (Reasoning Engine ≠ Action Engine)

## Resumo da stack tecnológica {#technology-stack-summary}

| Categoria | Tecnologia | Versão | Justificativa |
|----------|-----------|---------|---------------|
| Linguagem | TypeScript | 5.3.2+ | Tipagem estrita, suporte a ESM |
| Runtime | Node.js | 20.0.0+ | Suporte LTS, recursos modernos |
| Gerenciador de pacotes | npm | - | Gerenciador de pacotes padrão do Node.js |
| Ferramenta de build | Compilador TypeScript | 5.3.2 | Compilação TypeScript nativa |
| Testes | Vitest | 1.0.4 | Executor de testes rápido, baseado no Vite |
| Lint/formatação | Biome | 1.7.0 | Ferramenta rápida, tudo em um |
| Provedores de LLM | OpenAI SDK | 4.20.0 | Integração com a API da OpenAI |
| Provedores de LLM | Anthropic SDK | 0.71.2 | Integração com a API do Claude |
| Validação | Zod | 3.22.4 | Validação de schema para as entradas das ferramentas |
| UUID | uuid | 9.0.1 | Geração de IDs únicos |
| Banco de dados (opcional) | PostgreSQL | 8.11.0+ | Armazenamento de eventos de produção (peer dependency) |

## Recursos principais {#key-features}

### Capacidades centrais {#core-capabilities}

1. **Event sourcing nativo**
   - Todos os eventos são persistidos em um armazenamento de eventos
   - Replay determinístico sem chamada ao LLM
   - Rastreabilidade completa de cada decisão

2. **Separação entre raciocínio e ação**
   - Reasoning Engine: gera intenções (sem efeitos colaterais)
   - Action Engine: executa as intenções depois da validação
   - Segurança desde a concepção: o LLM nunca causa um efeito colateral direto

3. **Governança integrada**
   - Policy Engine: valida as intenções antes da execução
   - Budget Tracker: acompanha custos e consumo por agente/ferramenta/período
   - Approval Manager: fluxo de aprovação humana para ações críticas
   - Audit Trail: rastreabilidade completa das decisões de política

4. **LLM multiprovedor**
   - Abstração LLMProvider para OpenAI e Anthropic
   - Fallback automático entre provedores
   - Configuração por provedor (temperature, maxTokens)

5. **Observabilidade cognitiva**
   - Reasoning Graph: visualização do processo de raciocínio
   - Alternatives Analysis: alternativas consideradas pelo agente
   - Decision Patterns: padrões de decisão entre várias execuções
   - Trace Visualization: preparação dos traces para visualização

6. **Testes e garantia de qualidade**
   - Golden Traces: traces de referência para testes
   - Regression Detection: detecção automática de regressões
   - Assertions: asserções de comportamento sobre os traces
   - Integração com CI/CD: exportação dos resultados de testes (JUnit XML, JSON)

7. **Observabilidade avançada**
   - Run Comparison: comparação de duas execuções
   - Impact Analysis: análise de impacto antes/depois de uma implantação
   - Advanced Event Filtering: filtragem avançada de eventos com caminhos JSON

## Destaques da arquitetura {#architecture-highlights}

### Abstração do armazenamento de eventos {#event-store-abstraction}

- **IEventStore**: interface comum a todos os armazenamentos de eventos
- **FileEventStore**: implementação baseada em arquivos (MVP)
- **SQLEventStore**: implementação SQL genérica
- **SQLiteEventStore**: implementação SQLite
- **PostgreSQLEventStore**: implementação PostgreSQL com JSONB

### Arquitetura dos motores {#engine-architecture}

- **ReasoningEngine**: gera intenções a partir do LLM
- **ActionEngine**: executa as intenções depois da validação
- **PolicyEngine**: valida as intenções em relação às políticas
- **ReplayEngine**: reproduz as execuções a partir dos eventos

### Sistema de registros {#registry-system}

- **ToolRegistry**: gerencia as ferramentas disponíveis
- **CapabilityRegistry**: gerencia as capacidades (grupos de ferramentas)

### Sistema de gerenciadores {#manager-system}

- **ApprovalManager**: gerenciamento das aprovações humanas
- **BudgetTracker**: acompanhamento de orçamento e de consumo
- **GoldenTraceManager**: gerenciamento dos golden traces
- **RegressionTestManager**: gerenciamento das suítes de testes de regressão
- **AssertionManager**: gerenciamento das asserções de comportamento
- **ImpactAnalysisManager**: gerenciamento das análises de impacto

## Visão geral do desenvolvimento {#development-overview}

### Pré-requisitos {#prerequisites}

- Node.js 20.0.0+ (LTS)
- npm ou equivalente
- TypeScript 5.3.2+ (instalado localmente)

### Primeiros passos {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### Comandos principais {#key-commands}

- **Instalar:** `npm install`
- **Build:** `npm run build`
- **Dev:** `npm run dev` (modo watch)
- **Testar:** `npm test`
- **Testes em modo watch:** `npm run test:watch`
- **Cobertura de testes:** `npm run test:coverage`
- **Lint:** `npm run lint`
- **Formatar:** `npm run format`
- **Verificar:** `npm run check` (lint + formatação)

## Estrutura do repositório {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

Veja [Árvore do código-fonte](../contributing/source-tree) para o detalhe de `src/`.

## Mapa da documentação {#documentation-map}

Para informações detalhadas, veja:

- [Introdução](../guide/introduction) - Para que serve o SDK
- [Árvore do código-fonte](../contributing/source-tree) - Estrutura de diretórios
- [Arquitetura](./architecture) - Arquitetura detalhada
- [Guia de desenvolvimento](../contributing/development) - Fluxo de trabalho de desenvolvimento
