# Agentes governados

Um agente governado executa o ciclo clássico de chamada de ferramentas — com uma diferença: **o LLM apenas propõe intenções**. O motor de ações valida cada intenção em relação aos schemas e às políticas antes que qualquer coisa aconteça, e registra cada etapa. Esta página percorre ferramentas, capacidades, políticas, traces, replay e a interrupção de uma execução.

::: tip Raciocinar antes de agir
Para decisões em aberto, prefira os [agentes cognitivos](./cognitive-agents): eles compartilham as mesmas ferramentas, políticas e traces.
:::

## Pré-requisitos {#prerequisites}

- Node.js 20+ instalado
- Chave de API da OpenAI (ou de outro provedor de LLM)
- Conhecimentos básicos de TypeScript/JavaScript

## Instalação {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## Primeiro agente em 5 minutos {#first-agent-in-5-minutes}

### Passo 1: inicialize o SDK {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Passo 2: defina uma ferramenta {#step-2-define-a-tool}

Uma ferramenta é uma capacidade que o agente pode usar. Ela precisa ser declarada explicitamente.

```typescript
import { defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const calculatorTool = sdk.defineTool({
  name: 'calculator',
  description: 'Performs basic arithmetic',
  schema: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  handler: async ({ operation, a, b }) => {
    switch (operation) {
      case 'add': return a + b;
      case 'subtract': return a - b;
      case 'multiply': return a * b;
      case 'divide': return a / b;
    }
  },
});
```

### Passo 3: crie um agente {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
});
```

### Passo 4: execute o agente {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### Passo 5: veja o trace {#step-5-view-the-trace}

```typescript
const trace = await sdk.getTrace(result.runId);
console.log(trace.summary);
// {
//   totalEvents: 5,
//   duration: 1234,
//   intentionsGenerated: 1,
//   actionsExecuted: 1,
//   toolsCalled: 1
// }
```

## Exemplo completo (10 linhas) {#complete-example-10-lines}

```typescript
import { createSDK, defineTool } from '@sdk-ai-agents/core';
import { z } from 'zod';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });
const calc = sdk.defineTool({
  name: 'calculator', description: 'Math operations',
  schema: z.object({ op: z.enum(['add', 'multiply']), a: z.number(), b: z.number() }),
  handler: async ({ op, a, b }) => op === 'add' ? a + b : a * b
});
const agent = sdk.createAgent({ name: 'assistant', model: 'gpt-5.4', tools: [calc] });
const result = await agent.run({ message: 'What is 15 * 23?' });
console.log(await sdk.getTrace(result.runId));
```

## Conceitos-chave {#key-concepts}

### 1. Ferramentas {#_1-tools}

As ferramentas são as únicas ações que o agente pode realizar. **Nada é autorizado por padrão** (deny-by-default): uma ferramenta precisa ser registrada antes que algo possa executá-la.

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

**Características:**
- Definição explícita com um schema Zod
- Validação automática das entradas
- Versionamento suportado
- Rastreabilidade completa

**Exemplo:**
```typescript
const weatherTool = sdk.defineTool({
  name: 'get_weather',
  description: 'Gets weather for a location',
  schema: z.object({
    location: z.string(),
    unit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  }),
  handler: async ({ location, unit }) => {
    // Your logic here
    return { temperature: 22, condition: 'sunny' };
  },
});
```

### 2. Capacidades {#_2-capabilities}

As capacidades permitem agrupar as ferramentas de forma lógica e reutilizá-las.

**Exemplo:**
```typescript
// Option 1: With tool names (tools already registered)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: ['calculator', 'scientific-calculator'],
});

// Option 2: With Tool objects (auto-registration)
const mathCapability = sdk.defineCapability({
  name: 'math',
  description: 'Mathematical operations',
  tools: [calculatorTool, scientificTool],
});

// Usage in an agent
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  capabilities: ['math'],
});
```

### 3. Políticas {#_3-policies}

As políticas controlam o que o agente pode fazer.

**Tipos de política:**
- **Budget** (orçamento): limite de etapas ou de tokens
- **Timeout**: duração máxima de execução
- **Allowlist**: lista de ferramentas autorizadas
- **Custom**: validador personalizado

**Exemplo:**
```typescript
// Global policy
sdk.defineGlobalPolicy({
  id: 'max-steps',
  type: 'budget',
  rules: [{
    condition: 'maxSteps',
    action: 'deny',
    metadata: { value: 10 },
  }],
  scope: 'global',
  enabled: true,
});

// Per-agent policy
const agent = sdk.createAgent({
  name: 'assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  policies: [{
    id: 'timeout',
    type: 'timeout',
    rules: [{
      condition: 'maxDuration',
      action: 'deny',
      metadata: { value: 30000 }, // 30 seconds
    }],
    scope: 'agent',
    enabled: true,
  }],
});
```

Os limites de orçamento e de duração são verificados antes de cada chamada de ferramenta de uma execução de um agente governado, com base no progresso da execução: `maxSteps` conta as etapas já feitas (a primeira chamada está na etapa 0), `maxTokens` os tokens usados pelas chamadas ao modelo e `maxDuration` o tempo desde o início da execução. Um limite recusa a chamada de ferramenta, o que faz a execução falhar; ele nunca interrompe uma chamada ao modelo. Os orçamentos de tokens e de custo por período (`budgetLimit` com `maxTokens` ou `maxCost`) contam os tokens e o custo das chamadas ao modelo dos agentes governados e cognitivos, e das decisões tipadas tomadas com `sdk.decisions` (veja [Custos de API](./costs#budgets)), e um replay aplica `maxSteps`, `maxTokens` e `maxDuration` como a execução original (os orçamentos por período veem o consumo do período atual). Essas políticas também se aplicam aos agentes cognitivos, verificadas antes de cada etapa assim como antes de cada chamada de ferramenta, ao lado dos limites próprios deles (`maxSteps`, `maxToolCalls`, `timeoutMs`): veja [Limites e políticas](./cognitive-agents#limits-and-policies). Uma política é verificada quando é aplicada (`defaultPolicies`, `defineGlobalPolicy`, as `policies` de um agente, `setPolicy`): uma regra `maxSteps` ou `maxTokens` vai em uma política `budget` e uma regra `maxDuration` em uma política `timeout`, com um `value` que seja um número finito maior que 0; um `budgetLimit` (também em uma política `budget`) precisa de um `period` (`hour`, `day`, `week`, `month` ou `all`), de `agentId` e `toolName` do tipo string, se informados, e de pelo menos um limite (`maxTokens`, `maxToolCalls`, `maxCost`), cada um deles um número finito ≥ 0 (`maxToolCalls: 0` recusa todas as chamadas; um limite de tokens ou de custo igual a 0 as recusa assim que algo é contado). Qualquer outro valor, como uma string (`'10'`) lida de um arquivo de configuração, `NaN`, `0` para um limite de execução ou um número negativo, lança um `ValidationError` que nomeia o campo.

### 4. Traces {#_4-traces}

Cada execução gera um trace completo, que pode ser reproduzido por replay.

**Recuperar um trace:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Exportar um trace:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Replay {#_5-replay}

Faça o replay de uma execução sem contatar o LLM novamente.

**Replay simples:**
```typescript
const replayResult = await sdk.replay(runId);
```

**Replay com modificações:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Interromper a execução {#_6-stopping-execution}

Interrompa uma execução em andamento.

**A partir do agente:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**A partir do SDK:**
```typescript
await sdk.stopRun(runId);
```

## Fluxo de trabalho típico {#typical-workflow}

1. **Inicialize o SDK** com a sua chave de API
2. **Defina as ferramentas** necessárias para o seu caso de uso
3. **Crie capacidades** (opcional, para organização)
4. **Configure políticas** para a governança
5. **Crie o agente** com ferramentas e políticas
6. **Execute o agente** com uma entrada
7. **Analise o trace** para entender o que aconteceu
8. **Faça o replay, se necessário**, para depuração

## Boas práticas {#best-practices}

### Ferramentas {#tools}
- ✅ Use schemas Zod rigorosos
- ✅ Documente cada ferramenta com clareza
- ✅ Trate os erros adequadamente
- ✅ Versione as ferramentas quando elas mudarem

### Políticas {#policies}
- ✅ Aplique orçamentos razoáveis
- ✅ Use allowlists rigorosas
- ✅ Teste as políticas antes da produção
- ✅ Documente as políticas

### Capacidades {#capabilities}
- ✅ Agrupe as ferramentas de forma lógica
- ✅ Reutilize as capacidades entre agentes
- ✅ Documente as capacidades

### Segurança {#security}
- ✅ **Negado por padrão (deny-by-default)**: nenhuma ferramenta não declarada pode ser executada
- ✅ Validação: todas as entradas são validadas com Zod
- ✅ Políticas: verificadas antes de cada ação
- ✅ Rastreabilidade: todas as ações são rastreadas

## Exemplos {#examples}

### Exemplo mínimo {#minimal-example}
Veja [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### Exemplo completo {#complete-example}
Veja [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) para todos os recursos

## Próximos passos {#next-steps}

- 📚 [Conceitos fundamentais](./concepts) - Entenda a arquitetura
- 🏗️ [Arquitetura](../reference/architecture) - Detalhes técnicos
- 📖 [API do SDK](../reference/sdk-api) - Todas as opções e métodos

## Suporte {#support}

- Documentação: `docs/`
- Exemplos: `examples/`
- Problemas: GitHub Issues

## Solução de problemas {#troubleshooting}

### Erro: "Tool not found" {#error-tool-not-found}
→ Verifique se você registrou a ferramenta com `defineTool()` antes de usá-la em um agente.

### Erro: "Policy violation" {#error-policy-violation}
→ Verifique as suas políticas (budget, timeout, allowlist).

### Erro: "Run cancelled" {#error-run-cancelled}
→ A execução foi interrompida. Verifique com `getTrace()` para ver o motivo.

### Traces vazios {#empty-traces}
→ Verifique se o armazenamento de eventos está funcionando corretamente e se os eventos estão sendo persistidos.

## Tempo até o primeiro agente {#time-to-first-agent}

**Meta do MVP:** < 30 minutos

**Tempo estimado:**
- Instalação: 2 minutos
- Primeira ferramenta: 5 minutos
- Primeiro agente: 3 minutos
- Primeira execução: 5 minutos
- Entender os traces: 10 minutos
- **Total: ~25 minutos** ✅
