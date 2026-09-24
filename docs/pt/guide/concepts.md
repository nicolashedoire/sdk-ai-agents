# Conceitos fundamentais

## Visão geral {#overview}

O SDK AI Agents é uma infraestrutura de governança para agentes de IA que separa o raciocínio da ação e oferece event sourcing nativo para replay e auditoria. Sobre essa base, os [agentes cognitivos](./cognitive-agents) acrescentam uma camada de raciocínio explícito, e as [decisões tipadas](./typed-decisions) acrescentam respostas estruturadas e calibradas.

::: info Esta página trata dos fundamentos
Agentes, ferramentas, capacidades, políticas, intenções, o armazenamento de eventos, traces e replay. Eles valem tanto para os agentes governados quanto para os cognitivos.
:::

## Conceitos fundamentais {#fundamental-concepts}

### 1. Agente {#_1-agent}

Um **agente** é um sistema de decisão governado que usa um LLM para gerar intenções, mas todas as ações passam por um motor de ações (Action Engine) controlado.

**Características:**
- Configuração mínima (nome, modelo de LLM)
- Ferramentas declaradas explicitamente
- Políticas para a governança
- Versionamento para acompanhamento
- Capacidades para organizar as ferramentas

**Exemplo:**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. Ferramenta {#_2-tool}

Uma **ferramenta** (tool) é uma capacidade declarada explicitamente que o agente pode usar. Todas as ferramentas precisam ser registradas antes do uso (negado por padrão, ou deny-by-default).

**Características:**
- Schema de validação Zod obrigatório
- Handler assíncrono
- Versionamento
- Associação a uma capacidade (opcional)

**Exemplo:**
```typescript
const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number()
  }),
  handler: async ({ operation, a, b }) => {
    // Implementation
  },
  version: '1.0.0',
  capability: 'math'
})
```

### 3. Capacidade {#_3-capability}

Uma **capacidade** (capability) é um grupo lógico de ferramentas que pode ser reutilizado por vários agentes.

**Características:**
- Nome e descrição
- Lista de ferramentas associadas
- Versionamento
- Metadados opcionais

**Exemplo (com nomes de ferramentas):**
```typescript
const calculatorTool = sdk.defineTool({ /* ... */ });
const scientificTool = sdk.defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

**Exemplo (diretamente com objetos Tool):**
```typescript
const calculatorTool = defineTool({ /* ... */ });
const scientificTool = defineTool({ /* ... */ });

const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
  version: '1.0.0'
})

const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  capabilities: ['math']
})
```

### 4. Política {#_4-policy}

Uma **política** (policy) define as regras de governança aplicadas antes de cada ação.

**Tipos de política:**
- **Budget** (orçamento): limite de etapas ou de tokens
- **Timeout**: duração máxima de execução
- **Allowlist**: lista de ferramentas autorizadas
- **Custom**: validador personalizado

**Exemplo:**
```typescript
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 }
  }],
  scope: 'global',
  enabled: true
})
```

### 5. Intenção {#_5-intention}

Uma **intenção** (intention) é uma estrutura gerada pelo LLM que descreve o que o agente quer fazer, sem executá-lo diretamente.

**Tipos:**
- `tool_call`: chamada a uma ferramenta específica
- `final_answer`: resposta final ao usuário
- `continue`: continuar o raciocínio

**Segurança:**
- Todas as intenções são validadas pelo motor de políticas (Policy Engine)
- Nenhuma ação direta vinda do LLM
- Rastreabilidade completa

### 6. Armazenamento de eventos {#_6-event-store}

O **armazenamento de eventos** (Event Store) é a única fonte da verdade para todas as execuções.

**Características:**
- Persistência automática (arquivos JSON por padrão)
- Gravação em lotes para desempenho
- Exportação completa
- Filtragem por tipo, data etc.

**Eventos principais:**
- `run.started`: início da execução
- `intention.generated`: intenção gerada pelo LLM
- `policy.checked`: verificação de política
- `action.executed`: ação executada
- `tool.called`: ferramenta chamada
- `run.completed`: execução concluída
- `run.failed`: execução com falha
- `run.cancelled`: execução cancelada

### 7. Trace {#_7-trace}

Um **trace** é a representação legível por humanos de uma execução completa.

**Conteúdo:**
- Linha do tempo dos eventos
- Resumo estatístico
- Estado final
- Metadados

**Exemplo:**
```typescript
const trace = await sdk.getTrace(runId)
console.log(trace.summary)
// {
//   totalEvents: 15,
//   duration: 1234,
//   intentionsGenerated: 3,
//   actionsExecuted: 2,
//   policiesChecked: 2,
//   toolsCalled: 2
// }
```

### 8. Replay {#_8-replay}

O **replay** permite reexecutar uma execução completa sem contatar o LLM novamente.

**Características:**
- Determinístico (mesma sequência de ações)
- Modificações possíveis (entrada, políticas, ferramentas)
- Depuração de incidentes
- Testes de não regressão

**Exemplo:**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## Princípios de arquitetura {#architectural-principles}

### 1. Separação entre raciocínio e ação {#_1-reasoning-action-separation}

O LLM gera intenções, nunca ações diretas. Todas as ações passam pelo motor de ações.

### 2. Negado por padrão (deny-by-default) {#_2-deny-by-default}

Nada é autorizado por padrão. Todas as ferramentas precisam ser declaradas (registradas) explicitamente antes que algo possa executá-las.

::: warning Alcance de um agente governado
Um agente governado pode executar **qualquer ferramenta registrada no SDK** que o modelo mencionar: a lista `tools` do agente decide o que é oferecido ao modelo, não o que ele pode chamar. Restrinja-o com uma política `allowlist` — qualquer outra ferramenta é negada antes da execução:

```ts
const agent = sdk.createAgent({
  name: 'support',
  model: 'gpt-4o',
  tools: [lookupCustomer],
  policies: [
    {
      id: 'support-tools',
      type: 'allowlist',
      scope: 'agent',
      enabled: true,
      rules: [{ condition: 'allowedTools', action: 'deny', metadata: { tools: ['lookup_customer'] } }],
    },
  ],
});
```

Os agentes cognitivos e os servidores MCP ficam restritos à sua lista de ferramentas automaticamente.
:::

### 3. Event sourcing nativo {#_3-native-event-sourcing}

Toda execução é rastreável e pode ser reproduzida por replay graças ao event sourcing.

### 4. Governança integrada {#_4-built-in-governance}

As políticas são aplicadas de forma estrutural, não como uma opção.

### 5. Versionamento completo {#_5-full-versioning}

Agentes, ferramentas e capacidades são versionados para acompanhamento e rastreabilidade.

## Fluxo de trabalho típico {#typical-workflow}

1. **Inicialização**: crie o SDK com a chave de API
2. **Definição**: defina as ferramentas e as capacidades
3. **Configuração**: crie o agente com ferramentas e políticas
4. **Execução**: execute o agente com uma entrada
5. **Observação**: analise o trace da execução
6. **Replay**: faça o replay para depuração ou testes

## Boas práticas {#best-practices}

### Ferramentas {#tools}
- Use schemas Zod rigorosos
- Documente cada ferramenta com clareza
- Versione as ferramentas quando elas mudarem

### Políticas {#policies}
- Aplique orçamentos razoáveis
- Use allowlists rigorosas
- Teste as políticas antes da produção

### Capacidades {#capabilities}
- Agrupe as ferramentas de forma lógica
- Reutilize as capacidades entre agentes
- Documente as capacidades
- **Fluxo recomendado:** você pode passar para `defineCapability()` tanto nomes de ferramentas (strings) quanto objetos Tool diretamente. Se você passar objetos Tool, eles serão registrados automaticamente.

### Versionamento {#versioning}
- Use versionamento semântico
- Documente as mudanças de versão
- Acompanhe as versões nos eventos

## Segurança {#security}

- **Negado por padrão (deny-by-default)**: nenhuma ferramenta não declarada pode ser executada
- **Validação**: todas as entradas são validadas com Zod
- **Políticas**: verificadas antes de cada ação
- **Rastreabilidade**: todas as ações são rastreadas
- **Auditoria**: replay disponível para uma auditoria completa
