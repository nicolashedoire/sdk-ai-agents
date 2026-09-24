# Agentes gobernados

Un agente gobernado ejecuta el bucle clásico de llamadas a herramientas — con un matiz: **el LLM solo propone intenciones**. El motor de acciones valida cada intención contra los esquemas y las políticas antes de que ocurra nada, y registra cada paso. Esta página recorre las herramientas, las capacidades, las políticas, las trazas, la repetición y la detención de una ejecución.

::: tip Razonar antes de actuar
Para las decisiones abiertas, es preferible usar [agentes cognitivos](./cognitive-agents): comparten las mismas herramientas, políticas y trazas.
:::

## Requisitos previos {#prerequisites}

- Node.js 20+ instalado
- Clave de API de OpenAI (u otro proveedor de LLM)
- Conocimientos básicos de TypeScript/JavaScript

## Instalación {#installation}

```bash
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28
```

## Primer agente en 5 minutos {#first-agent-in-5-minutes}

### Paso 1: inicializar el SDK {#step-1-initialize-the-sdk}

```typescript
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
});
```

### Paso 2: definir una herramienta {#step-2-define-a-tool}

Una herramienta es una capacidad que el agente puede usar. Debe declararse explícitamente.

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

### Paso 3: crear un agente {#step-3-create-an-agent}

```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
});
```

### Paso 4: ejecutar el agente {#step-4-run-the-agent}

```typescript
const result = await agent.run({
  message: 'What is 15 * 23?',
});

console.log(result.output); // "345"
console.log(result.runId); // Unique UUID for this execution
```

### Paso 5: ver la traza {#step-5-view-the-trace}

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

## Ejemplo completo (10 líneas) {#complete-example-10-lines}

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

## Conceptos clave {#key-concepts}

### 1. Herramientas {#_1-tools}

Las herramientas son las únicas acciones que puede realizar el agente. **Nada está autorizado por defecto** (deny-by-default): una herramienta debe registrarse antes de que algo pueda ejecutarla.

::: warning Alcance de un agente gobernado
Un agente gobernado puede ejecutar **cualquier herramienta registrada en el SDK** que el modelo nombre: la lista `tools` del agente decide lo que se le ofrece al modelo, no lo que puede llamar. Restríngelo con una política `allowlist` — cualquier otra herramienta se deniega antes de ejecutarse:

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

Los agentes cognitivos y los servidores MCP se limitan automáticamente a su lista de herramientas.
:::

**Características:**
- Definición explícita con un esquema Zod
- Validación automática de las entradas
- Versionado admitido
- Trazabilidad completa

**Ejemplo:**
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

Las capacidades te permiten agrupar las herramientas de forma lógica y reutilizarlas.

**Ejemplo:**
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

Las políticas controlan lo que puede hacer el agente.

**Tipos de política:**
- **Budget** (presupuesto): límite de pasos o de tokens
- **Timeout** (tiempo límite): duración máxima de ejecución
- **Allowlist** (lista de permitidos): lista de herramientas autorizadas
- **Custom** (personalizada): validador personalizado

**Ejemplo:**
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

Los límites de presupuesto y de duración se comprueban antes de cada llamada a herramienta de una ejecución de un agente gobernado, según su progreso: `maxSteps` cuenta los pasos ya dados (la primera llamada está en el paso 0), `maxTokens` los tokens que usaron sus llamadas al modelo y `maxDuration` el tiempo transcurrido desde el inicio de la ejecución. Un límite rechaza la llamada a herramienta, lo que hace fallar la ejecución; nunca interrumpe una llamada al modelo. Los presupuestos de tokens y de coste por periodo (`budgetLimit` con `maxTokens` o `maxCost`) cuentan los tokens y el coste de las llamadas al modelo de los agentes gobernados, y una repetición aplica `maxSteps`, `maxTokens` y `maxDuration` como la ejecución original (los presupuestos por periodo ven el consumo del periodo actual). Los agentes cognitivos tienen sus propios límites (`maxSteps`, `maxToolCalls`, `timeoutMs`). Una política se comprueba cuando se aplica (`defaultPolicies`, `defineGlobalPolicy`, las `policies` de un agente, `setPolicy`): una regla `maxSteps` o `maxTokens` va en una política `budget` y una regla `maxDuration` en una política `timeout`, con un `value` que sea un número finito mayor que 0; un `budgetLimit` (también en una política `budget`) necesita un `period` (`hour`, `day`, `week`, `month` o `all`), un `agentId` y un `toolName` de tipo cadena si se indican, y al menos un límite (`maxTokens`, `maxToolCalls`, `maxCost`), cada uno un número finito ≥ 0 (`maxToolCalls: 0` rechaza todas las llamadas; un límite de tokens o de coste de 0 las rechaza en cuanto se cuenta algo). Cualquier otro valor, como una cadena (`'10'`) leída de un archivo de configuración, `NaN`, `0` para un límite de ejecución o un número negativo, lanza un `ValidationError` que nombra el campo.

### 4. Trazas {#_4-traces}

Cada ejecución genera una traza completa que se puede repetir.

**Obtener una traza:**
```typescript
const trace = await sdk.getTrace(runId);
console.log(trace.summary);
console.log(trace.timeline);
```

**Exportar una traza:**
```typescript
// Text format
const textTrace = await sdk.exportTrace(runId, 'text');
console.log(textTrace);

// JSON format
const jsonTrace = await sdk.exportTrace(runId, 'json');
console.log(jsonTrace);
```

### 5. Repetición {#_5-replay}

Repite una ejecución sin volver a contactar con el LLM.

**Repetición simple:**
```typescript
const replayResult = await sdk.replay(runId);
```

**Repetición con modificaciones:**
```typescript
const replayResult = await sdk.replay(runId, {
  input: {
    message: 'Modified input message',
  },
});
```

### 6. Detener la ejecución {#_6-stopping-execution}

Detén una ejecución en curso.

**Desde el agente:**
```typescript
await agent.stop(runId); // Stop a specific run
await agent.stop(); // Stop all runs of this agent
```

**Desde el SDK:**
```typescript
await sdk.stopRun(runId);
```

### 7. Recibir la respuesta en streaming {#_7-streaming-the-answer}

Muestra la respuesta mientras el modelo la escribe: `onText` recibe su texto delta a delta.

```typescript
let shown = '';
const result = await agent.run({
  message: 'Summarize the incident report',
  onText: (delta) => {
    shown += delta;
    render(shown);
  },
  onTextRestart: (discarded) => {
    shown = shown.slice(0, shown.length - discarded.length);
    render(shown);
  },
});
```

- Con `onText`, los proveedores integrados de OpenAI y Anthropic llaman a la API de streaming de su fabricante, y el resultado de la ejecución y sus eventos son los mismos que sin él. También sus costes, salvo con un servidor compatible con OpenAI (un `baseURL`, o `OPENAI_BASE_URL`): el consumo de una respuesta en streaming solo se pide en la propia API de OpenAI, hosts regionales incluidos, a menos que se fije `providerConfig.openai.includeStreamUsage`, y una llamada sin consumo cuenta como no medida en los presupuestos. Con un presupuesto de coste en un servidor compatible que devuelve el consumo (la API v1 de Azure OpenAI lo hace), fija `includeStreamUsage: true`.
- Se transmite el texto de cada llamada al modelo de la ejecución, una llamada detrás de otra: lo que el modelo escribe antes de llamar a una herramienta, y después su respuesta, con una línea en blanco (`\n\n`) antes del texto de una llamada cuando una llamada anterior ya escribió algo. Los argumentos de las herramientas y el pensamiento de Claude no.
- Un proveedor que no admite streaming (tu propio `llmProvider`, salvo que lea `onTextDelta`) entrega todo el texto de cada llamada al modelo de una sola vez, cuando termina la llamada. OpenAI hace lo mismo con un modelo para el que rechaza el streaming (una organización que no está verificada para ese modelo): el proveedor vuelve a hacer la solicitud sin streaming, y deja de usar el streaming con ese modelo. A un servidor que rechaza `stream_options` se le vuelve a hacer la solicitud sin ese campo.
- Cuando una llamada al modelo falla después de transmitir parte de su texto y se vuelve a intentar (un reintento, o un proveedor de reserva), `onTextRestart` recibe esa parte (`discarded`, el final de lo que recibió `onText`, línea en blanco incluida): descártala, el siguiente intento vuelve a escribir la respuesta. La ejecución sigue registrando `provider.retry` o `provider.fallback`. Una llamada que falla definitivamente deja su texto como estaba, y la ejecución falla.
- Las excepciones que lanzan los callbacks, o sus rechazos cuando son asíncronos, se ignoran: la ejecución continúa. Para detenerla, aborta su `signal`. Ninguno de los dos callbacks se registra en la ejecución.

Los agentes cognitivos no usan streaming: cada una de sus llamadas al modelo devuelve un pensamiento estructurado (JSON) que el motor comprueba y admite entero, y medio pensamiento todavía no significa nada.

## Flujo de trabajo típico {#typical-workflow}

1. **Inicializa el SDK** con tu clave de API
2. **Define las herramientas** que necesita tu caso de uso
3. **Crea capacidades** (opcional, para organizar)
4. **Configura las políticas** para la gobernanza
5. **Crea el agente** con herramientas y políticas
6. **Ejecuta el agente** con una entrada
7. **Analiza la traza** para entender qué ha pasado
8. **Repite si hace falta** para depurar

## Buenas prácticas {#best-practices}

### Herramientas {#tools}
- ✅ Usa esquemas Zod estrictos
- ✅ Documenta cada herramienta con claridad
- ✅ Gestiona correctamente los errores
- ✅ Versiona las herramientas cuando cambien

### Políticas {#policies}
- ✅ Aplica presupuestos razonables
- ✅ Usa listas de permitidos estrictas
- ✅ Prueba las políticas antes de producción
- ✅ Documenta las políticas

### Capacidades {#capabilities}
- ✅ Agrupa las herramientas de forma lógica
- ✅ Reutiliza las capacidades entre agentes
- ✅ Documenta las capacidades

### Seguridad {#security}
- ✅ **Denegado por defecto**: no se puede ejecutar ninguna herramienta no declarada
- ✅ Validación: todas las entradas se validan con Zod
- ✅ Políticas: se comprueban antes de cada acción
- ✅ Trazabilidad: todas las acciones quedan trazadas

## Ejemplos {#examples}

### Ejemplo mínimo {#minimal-example}
Consulta [`examples/quick-start.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/quick-start.ts)

### Ejemplo completo {#complete-example}
Consulta [`examples/complete-example.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/complete-example.ts) para ver todas las funcionalidades

## Siguientes pasos {#next-steps}

- 📚 [Conceptos básicos](./concepts) - Entender la arquitectura
- 🏗️ [Arquitectura](../reference/architecture) - Detalles técnicos
- 📖 [API del SDK](../reference/sdk-api) - Cada opción y cada método

## Soporte {#support}

- Documentación: `docs/`
- Ejemplos: `examples/`
- Incidencias: GitHub Issues

## Resolución de problemas {#troubleshooting}

### Error: "Tool not found" {#error-tool-not-found}
→ Asegúrate de haber registrado la herramienta con `defineTool()` antes de usarla en un agente.

### Error: "Policy violation" {#error-policy-violation}
→ Revisa tus políticas (presupuesto, tiempo límite, lista de permitidos).

### Error: "Run cancelled" {#error-run-cancelled}
→ La ejecución se detuvo. Compruébalo con `getTrace()` para ver por qué.

### Trazas vacías {#empty-traces}
→ Comprueba que el almacén de eventos funciona correctamente y que los eventos se están guardando.

## Tiempo hasta el primer agente {#time-to-first-agent}

**Objetivo del MVP:** < 30 minutos

**Tiempo estimado:**
- Instalación: 2 minutos
- Primera herramienta: 5 minutos
- Primer agente: 3 minutos
- Primera ejecución: 5 minutos
- Entender las trazas: 10 minutos
- **Total: ~25 minutos** ✅
