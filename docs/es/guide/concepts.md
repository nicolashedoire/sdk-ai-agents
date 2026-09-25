# Conceptos básicos

## Visión general {#overview}

SDK AI Agents es una infraestructura de gobernanza para agentes de IA que separa el razonamiento de la acción y proporciona event sourcing nativo para la repetición y la auditoría. Sobre ella, los [agentes cognitivos](./cognitive-agents) añaden una capa de razonamiento explícito, y las [decisiones tipadas](./typed-decisions) añaden respuestas estructuradas y calibradas.

::: info Esta página cubre los fundamentos
Agentes, herramientas, capacidades, políticas, intenciones, el almacén de eventos, las trazas y la repetición. Se aplican por igual a los agentes gobernados y a los cognitivos.
:::

## Conceptos fundamentales {#fundamental-concepts}

### 1. Agente {#_1-agent}

Un **agente** es un sistema de toma de decisiones gobernado que usa un LLM para generar intenciones, pero todas las acciones pasan por un motor de acciones controlado.

**Características:**
- Configuración mínima (nombre, modelo de LLM)
- Herramientas declaradas explícitamente
- Políticas para la gobernanza
- Versionado para el seguimiento
- Capacidades para organizar las herramientas

**Ejemplo:**
```typescript
const agent = sdk.createAgent({
  name: 'math-assistant',
  model: 'gpt-5.4',
  tools: [calculatorTool],
  version: '1.0.0',
  capabilities: ['math']
})
```

### 2. Herramienta {#_2-tool}

Una **herramienta** es una capacidad declarada explícitamente que el agente puede usar. Todas las herramientas deben registrarse antes de usarse (denegado por defecto, deny-by-default).

**Características:**
- Esquema de validación Zod obligatorio
- Manejador (handler) asíncrono
- Versionado
- Asociación con una capacidad (opcional)

**Ejemplo:**
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

Las herramientas ya hechas (una carpeta, una base de datos, una API web, la Web, otro agente, un servidor MCP) y cómo se gobierna cada llamada: consulta [Herramientas](./tools).

### 3. Capacidad {#_3-capability}

Una **capacidad** es un grupo lógico de herramientas que se puede reutilizar en varios agentes.

**Características:**
- Nombre y descripción
- Lista de herramientas asociadas
- Versionado
- Metadatos opcionales

**Ejemplo (con nombres de herramientas):**
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

**Ejemplo (directamente con objetos Tool):**
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

Una **política** define las reglas de gobernanza que se aplican antes de cada acción.

**Tipos de política:**
- **Budget** (presupuesto): límite de pasos o de tokens
- **Timeout** (tiempo límite): duración máxima de ejecución
- **Allowlist** (lista de permitidos): lista de herramientas autorizadas
- **Custom** (personalizada): validador personalizado

**Ejemplo:**
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

### 5. Intención {#_5-intention}

Una **intención** es una estructura generada por el LLM que describe lo que el agente quiere hacer, sin ejecutarlo directamente.

**Tipos:**
- `tool_call`: llamada a una herramienta concreta
- `final_answer`: respuesta final al usuario
- `continue`: seguir razonando

**Seguridad:**
- Todas las intenciones las valida el motor de políticas
- Ninguna acción directa del LLM
- Trazabilidad completa

### 6. Almacén de eventos {#_6-event-store}

El **almacén de eventos** es la única fuente de verdad de todas las ejecuciones.

**Características:**
- Persistencia automática (archivos JSON por defecto)
- Agrupación por lotes para el rendimiento
- Exportación completa
- Filtrado por tipo, fecha, etc.

**Eventos principales:**
- `run.started`: inicio de la ejecución
- `intention.generated`: intención generada por el LLM
- `policy.checked`: comprobación de políticas
- `action.executed`: acción ejecutada
- `tool.called`: herramienta llamada
- `run.completed`: ejecución completada
- `run.failed`: ejecución fallida
- `run.cancelled`: ejecución cancelada

### 7. Traza {#_7-trace}

Una **traza** es la representación legible por personas de una ejecución completa.

**Contenido:**
- Cronología de los eventos
- Resumen estadístico
- Estado final
- Metadatos

**Ejemplo:**
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

### 8. Repetición {#_8-replay}

La **repetición** (replay) te permite volver a reproducir una ejecución completa sin volver a contactar con el LLM.

**Características:**
- Determinista (misma secuencia de acciones)
- Modificaciones posibles (entrada, políticas, herramientas)
- Depuración de incidentes
- Pruebas de no regresión

**Ejemplo:**
```typescript
const replay = await sdk.replay(runId, {
  input: { message: 'Modified input' }
})
```

## Principios de arquitectura {#architectural-principles}

### 1. Separación entre razonamiento y acción {#_1-reasoning-action-separation}

El LLM genera intenciones, nunca acciones directas. Todas las acciones pasan por el motor de acciones.

### 2. Denegado por defecto {#_2-deny-by-default}

Nada está autorizado por defecto. Todas las herramientas deben declararse (registrarse) explícitamente antes de que algo pueda ejecutarlas.

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

### 3. Event sourcing nativo {#_3-native-event-sourcing}

Cada ejecución se puede trazar y repetir gracias al event sourcing.

### 4. Gobernanza integrada {#_4-built-in-governance}

Las políticas se aplican de forma estructural, no como una opción.

### 5. Versionado completo {#_5-full-versioning}

Los agentes, las herramientas y las capacidades están versionados para su seguimiento y trazabilidad.

## Flujo de trabajo típico {#typical-workflow}

1. **Inicialización**: crear el SDK con la clave de API
2. **Definición**: definir las herramientas y las capacidades
3. **Configuración**: crear el agente con herramientas y políticas
4. **Ejecución**: ejecutar el agente con una entrada
5. **Observación**: revisar la traza de la ejecución
6. **Repetición**: repetir para depurar o para probar

## Buenas prácticas {#best-practices}

### Herramientas {#tools}
- Usa esquemas Zod estrictos
- Documenta cada herramienta con claridad
- Versiona las herramientas cuando cambien

### Políticas {#policies}
- Aplica presupuestos razonables
- Usa listas de permitidos estrictas
- Prueba las políticas antes de producción

### Capacidades {#capabilities}
- Agrupa las herramientas de forma lógica
- Reutiliza las capacidades entre agentes
- Documenta las capacidades
- **Flujo de trabajo recomendado:** puedes pasar a `defineCapability()` nombres de herramientas (cadenas) u objetos Tool directamente. Si pasas objetos Tool, se registran automáticamente.

### Versionado {#versioning}
- Usa el versionado semántico
- Documenta los cambios de versión
- Sigue las versiones en los eventos

## Seguridad {#security}

- **Denegado por defecto**: no se puede ejecutar ninguna herramienta no declarada
- **Validación**: todas las entradas se validan con Zod
- **Políticas**: se comprueban antes de cada acción
- **Trazabilidad**: todas las acciones quedan trazadas
- **Auditoría**: repetición disponible para una auditoría completa
