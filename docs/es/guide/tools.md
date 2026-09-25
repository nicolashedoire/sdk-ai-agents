# Herramientas

Una **herramienta** es una función que un agente puede llamar: consultar un pedido, leer un archivo, buscar en la Web, preguntar a otro agente. Las escribes tú, o las tomas ya hechas de una **fuente de herramientas**: una carpeta, una base de datos, una API web, la Web, un agente o un servidor MCP.

Sea cual sea su origen, cada llamada está **gobernada**. Debe ser una de las herramientas de quien llama, sus argumentos se comprueban, se aplican las políticas y los presupuestos, se puede pedir a una persona que la apruebe, los fallos se pueden reintentar, y todo se escribe en el registro de eventos.

## En una línea {#in-one-line}

```ts
import { createSDK, folderTools, webTools } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY });

const tools = [...folderTools({ root: './handbook' }), ...webTools()].map((definition) =>
  sdk.defineTool(definition)
);

const agent = sdk.createAgent({ name: 'helpdesk', model: 'gpt-5.4', tools });
```

El agente ya puede enumerar, leer y buscar los archivos del manual, y buscar en la Web y leer sus páginas: ocho herramientas, todas de solo lectura.

## Tus propias herramientas {#your-own-tools}

`sdk.defineTool` registra una herramienta en el SDK y la devuelve. El esquema zod describe los argumentos; el manejador (handler) los recibe validados y tipados.

```ts
import { z } from 'zod';

const lookupOrder = sdk.defineTool({
  name: 'lookup_order',
  description: 'Reads an order: status, items, amount.',
  schema: z.object({ orderId: z.string().describe('For example "o-1042"') }),
  handler: async ({ orderId }) => orders.get(orderId),
  metadata: { riskLevel: 'low', readOnly: true },
  retry: { maxRetries: 2 },
});

const refundOrder = sdk.defineTool({
  name: 'refund_order',
  description: 'Refunds an order. Only when the customer asked for a refund.',
  schema: z.object({ orderId: z.string(), amount: z.number().positive() }),
  handler: async ({ orderId, amount }, context) => payments.refund(orderId, amount, { signal: context?.signal }),
  metadata: { riskLevel: 'high', requiresApproval: true },
  version: '1.1.0',
});
```

| Campo | |
| --- | --- |
| `name`, `description` | Lo que ve el modelo, y a partir de lo que decide. Usa letras, dígitos, `_` y `-`, hasta 64 caracteres: las API de los modelos y los clientes MCP pueden rechazar otros nombres. |
| `schema` | Los argumentos, como un esquema zod; los textos de `.describe()` se muestran al modelo. Una llamada que no encaja se rechaza antes que nada. |
| `handler(params, context?)` | Tu código. `context` contiene `runId`, `agentId` y `signal`, que se aborta cuando quien llama se rinde. |
| `metadata` | `riskLevel` (`low`, `medium`, `high`), `requiresApproval`, `readOnly`, `category`: consulta [Cómo se gobiernan las llamadas](#how-calls-are-governed). Ninguno por defecto. |
| `retry` | `{ maxRetries, initialDelayMs? (200), maxDelayMs? (5,000), retryOn? }`, solo para herramientas idempotentes. |
| `version` | `1.0.0` por defecto. Forma parte del hash de configuración del agente, así que las ejecuciones de antes y de después de un cambio se pueden [comparar](../reference/sdk-api#comparisons-and-impact). |
| `capability` | Una etiqueta para agrupar; las fuentes integradas fijan una (`web:search`, `folder:handbook`…). |

Un nombre se registra una sola vez por SDK: `sdk.defineTool` lanza un error si el nombre ya está ocupado, sea cual sea la versión. Da un prefijo a cada fuente cuando dos podrían chocar. Todos los campos están en la [API del SDK](../reference/sdk-api#tools-tooldefinition).

## Las fuentes de herramientas integradas {#the-built-in-tool-sources}

Cada fuente devuelve definiciones de herramientas, listas para `sdk.defineTool` (`connectMcpServer`, en su `tools`). Todas pueden cambiar el nombre de sus herramientas: con un prefijo (`prefix`; `toolPrefix` para MCP), o con el nombre completo de la herramienta de un agente (`name`).

| Fuente | El agente puede | Nombres de las herramientas | Riesgo, solo lectura | Necesita | Detalles |
| --- | --- | --- | --- | --- | --- |
| `folderTools({ root })` | Enumerar, leer y buscar los archivos de texto de una carpeta, nunca fuera de ella | `list_files`, `read_file`, `search_files` | bajo, solo lectura | Una carpeta | [Una carpeta de documentos](./mcp-recipes#a-folder-of-documents) |
| `databaseTools({ database })` | Enumerar las tablas, describir una, ejecutar un `SELECT` (100 filas por defecto) | `list_tables`, `describe_table`, `query` | medio, solo lectura | `sqliteReadOnly(db)` (`node:sqlite` o `better-sqlite3`) o `postgresReadOnly({ pool })` (`pg`) | [Una base de datos en solo lectura](./mcp-recipes#a-read-only-database) |
| `await openApiTools({ spec })` | Llamar a una API web, una herramienta por operación; solo `GET`, salvo lo que se enumere en `include` | El `operationId`, si no, el método y la ruta (`get_pets_petId`) | `GET`: bajo, solo lectura. Las demás: alto, aprobación obligatoria | Una descripción OpenAPI 3 (URL, archivo u objeto) | [Una API web](./mcp-recipes#a-web-api-from-its-openapi-description) |
| `webTools()` | Buscar en la Web, leer una página o un PDF, buscar en arXiv, Wikipedia y GitHub | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` | `web_fetch` medio, las demás bajo; todas de solo lectura | Nada para empezar (DuckDuckGo); `unpdf` para los PDF; un token de GitHub para buscar código | [Investigación web](./web-research) |
| `governedAgentTool(agent)`, `cognitiveAgentTool(agent)` | Preguntar a otro agente: un agente gobernado responde a un `message`, un agente cognitivo razona sobre un `problem` y devuelve su decisión | `ask_<agent name>` | medio, no marcada como de solo lectura | Un agente, y por tanto una clave de modelo | [Un agente](./mcp-recipes#an-agent-your-reasoning-twin) |
| `await connectMcpServer({ name, transport })` | Usar las herramientas de cualquier servidor MCP | Los nombres del servidor, precedidos de `toolPrefix` | Nada fijado: `metadata` se aplica a todas las herramientas importadas | `@sdk-ai-agents/core/mcp` y `@modelcontextprotocol/sdk`; `close()` al terminar | [Usar las herramientas de un servidor MCP](./mcp#use-the-tools-of-an-mcp-server-in-your-agents) |

Con las herramientas MCP cambian dos cosas: el SDK solo comprueba que sus argumentos formen un objeto (el servidor comprueba el resto), y las indicaciones propias del servidor, como la de solo lectura, no se importan: fija `metadata` tú mismo.

## Dar herramientas a un agente {#giving-tools-to-an-agent}

`createAgent({ tools })` y `createCognitiveAgent({ tools })` aceptan herramientas, así que primero pasa las definiciones de una fuente por `sdk.defineTool`, como arriba. Un agente solo puede ejecutar **sus propias herramientas**, las de `tools` y las de sus `capabilities`: cualquier otra herramienta que nombre el modelo se rechaza (`allowed-tools`).

```ts
const support = sdk.createAgent({
  name: 'support',
  model: 'gpt-5.4',
  tools: [lookupOrder, refundOrder, ...tools], // your tools and those of the sources above
});
```

`defineTool`, importada del paquete, construye una herramienta sin registrarla: el SDK la registra cuando se crea un agente que la usa. Si ya hay una herramienta registrada con ese nombre, se conserva la registrada, y es esa la que se ejecuta.

### Capacidades {#capabilities}

Una capacidad da nombre a un grupo de herramientas para dárselo a varios agentes. La etiqueta `capability` de una herramienta no es una capacidad: defínela con `sdk.defineCapability`.

```ts
sdk.defineCapability({
  name: 'handbook',
  description: 'Read the team handbook',
  tools: folderTools({ root: './handbook', prefix: 'handbook_' }).map((tool) => sdk.defineTool(tool).name),
});

const onboarding = sdk.createAgent({ name: 'onboarding', model: 'gpt-5.4', capabilities: ['handbook'] });
```

### Fuera de un agente {#outside-an-agent}

`sdk.listTools()` devuelve todas las herramientas registradas en el SDK. `sdk.executeTool(name, parameters, options?)` llama a una de ellas por el mismo proceso gobernado, como una ejecución propia (con el identificador de agente `external` salvo que indiques `agentId`), y devuelve lo que devolvió el manejador:

```ts
const order = await sdk.executeTool('lookup_order', { orderId: 'o-1042' }, { agentId: 'backoffice' });
```

Sus opciones: `runId` registra la llamada dentro de una ejecución existente, `allowedTools` limita lo que puede ejecutar quien llama, `signal` la cancela, `approvalTimeoutMs` acota la espera de una aprobación y `onEvent` sigue la llamada en directo. Un rechazo lanza un `PolicyViolationError`; los argumentos no válidos y un manejador que falla lanzan un `ToolExecutionError`.

Las mismas herramientas sirven en otros sitios. Un [estudio](./studies#research-through-your-sources) toma los **nombres** de herramientas definidas como sus `sources`, y un servidor MCP sirve a Claude Desktop, Claude Code o cualquier cliente MCP las definiciones o los nombres que le das (consulta [Un servidor MCP para cualquier cosa](./mcp-recipes)).

## Cómo se gobiernan las llamadas {#how-calls-are-governed}

Una llamada pasa por estos pasos, en este orden, y se detiene en el primer rechazo:

1. **Las herramientas de quien llama.** Se rechaza una herramienta que no se le dio a quien llama (según el caso: las herramientas de un agente, las fuentes de un estudio, la lista de un servidor MCP o `allowedTools`). `executeTool` sin `allowedTools` puede ejecutar cualquier herramienta registrada.
2. **Los argumentos**, comprobados contra el esquema, antes de preguntar nada a nadie.
3. **Las políticas**: todas las políticas globales y todas las políticas del agente (consulta [Agentes gobernados](./governed-agents#_3-policies)).
4. **La aprobación**, cuando la herramienta o una política la pide.
5. **El presupuesto**: la llamada se contabiliza cuando empieza, sea cual sea su resultado.
6. **La herramienta se ejecuta**, con sus reintentos.

### Niveles de riesgo {#risk-levels}

`riskLevel` es una etiqueta: indica a las personas y al código con cuánto cuidado actuar. **Ninguna política la lee**, y no bloquea ni ralentiza ninguna llamada. Para actuar en función de ella, da a una herramienta `requiresApproval`, o convierte la etiqueta en una política:

```ts
const highRisk = sdk
  .listTools()
  .filter((tool) => tool.metadata?.riskLevel === 'high')
  .map((tool) => tool.name);

sdk.defineGlobalPolicy({
  id: 'approve-high-risk',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: { type: 'condition', conditions: [{ field: 'intention.toolName', operator: 'in', value: highRisk }] },
      action: 'require_approval',
    },
  ],
});
```

La lista se toma en el momento en que se define la política: define primero las herramientas.

### Aprobaciones {#approvals}

Una llamada espera a una persona cuando la herramienta tiene `requiresApproval: true` (el valor por defecto de `openApiTools` para las operaciones de escritura) o cuando una regla de política dice `require_approval`. Aparece en `sdk.getPendingApprovals()`; `sdk.approveAction(id, who, reason?)` deja que se ejecute, `sdk.rejectAction(id, who, reason?)` la rechaza. Si quien llama se rinde antes (una ejecución detenida, un `signal` abortado, `approvalTimeoutMs`, 50 s por defecto en los servidores MCP), la aprobación se cancela y la herramienta nunca se ejecuta. Consulta [Aprobaciones](./mcp-deploy#approvals-a-human-says-yes-first).

### Herramientas de solo lectura {#read-only-tools}

`readOnly: true` dice que la herramienta no cambia nada. Los clientes MCP lo ven como `readOnlyHint`, y `openApiTools` solo reintenta las operaciones de solo lectura. No relaja ninguna política y no se verifica: un manejador marcado como de solo lectura que escribe, escribe igualmente. Las fuentes que solo leen lo imponen donde pueden: `folderTools` no tiene ninguna forma de escribir, y `sqliteReadOnly` y `postgresReadOnly` ejecutan cada consulta en solo lectura en la propia base de datos.

### Reintentos {#retries}

`retry` vuelve a ejecutar un manejador que falla: solo ante los errores del manejador, nunca ante argumentos no válidos ni ante un rechazo. Cada reintento es un evento `tool.retry`, y la llamada cuenta una sola vez en su presupuesto. `openApiTools`, `webTools` y `connectMcpServer` aceptan una opción `retry` para sus herramientas. Consulta [Reintentos y conmutación por error](./resilience#tools).

### Presupuestos {#budgets}

Una política `budget` con un `budgetLimit` limita las llamadas a herramientas por periodo, para un agente (`agentId`), una herramienta (`toolName`) o todas:

```ts
sdk.defineGlobalPolicy({
  id: 'web-fetch-daily',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { toolName: 'web_fetch', period: 'day', maxToolCalls: 200 } },
    },
  ],
});
```

`maxTokens` y `maxCost` cuentan las llamadas al modelo, y rechazan las llamadas a herramientas una vez agotado el límite. Consulta [Costes de API](./costs#budgets).

### Salida no fiable {#untrusted-output}

Lo que devuelve una herramienta vuelve al modelo, y una página, un archivo o la respuesta de una API pueden contener instrucciones escritas para él (inyección de prompts). Las herramientas web marcan cada respuesta con `untrusted: true`, y sus descripciones le indican al modelo que nunca siga instrucciones que encuentre en ella. Las demás fuentes devuelven su contenido tal cual. Di en el prompt de sistema que los resultados de las herramientas son datos, da a cada agente solo las herramientas que necesita, y protege con aprobaciones las herramientas que cambian cosas. Un estudio muestra cada resultado a su modelo como datos. Consulta [las reglas de seguridad de las herramientas web](./web-research#security-rules).

### Lo que registra una llamada {#what-a-call-records}

| Evento | Cuándo |
| --- | --- |
| `action.executing` | Se propone la llamada, antes de cualquier comprobación |
| `policy.checked` | Cada política comprobada, y después el veredicto |
| `policy.violated` | Un rechazo: una herramienta que no se le dio a quien llama (`allowed-tools`), una política, un presupuesto agotado |
| `approval.requested`, `approval.approved`, `approval.rejected` | La decisión humana |
| `tool.called` | Empieza el manejador |
| `tool.retry` | Un reintento, con su espera y el error |
| `action.executed`, `action.failed` | El resultado o el error (argumentos no válidos incluidos), con la duración |

Una llamada hecha con `executeTool` es una ejecución propia, salvo que indiques `runId`: `run.started` (modo `tool`), y después `run.completed` o `run.failed`. Consulta el [catálogo de eventos](../reference/events#reasoning-and-actions).

## Elegir una fuente {#choosing-a-source}

| Necesito… | Usa |
| --- | --- |
| Mi propio código o servicio | `sdk.defineTool` |
| Documentos en una carpeta | `folderTools` |
| Respuestas de una base de datos SQL, sin ningún riesgo de escribir en ella | `databaseTools` con `sqliteReadOnly` o `postgresReadOnly` |
| Una API web que publica una descripción OpenAPI | `openApiTools` |
| Una API web que no la publica | `sdk.defineTool`, con `fetch` en el manejador |
| La Web, artículos científicos, artículos de enciclopedia, código en GitHub | `webTools` |
| La respuesta o la decisión de otro agente | `governedAgentTool` o `cognitiveAgentTool` |
| Un sistema que ya tiene un servidor MCP | `connectMcpServer` |
| Fuentes para un estudio | Las herramientas de búsqueda de `webTools`, o las de un servidor MCP |
| Mis herramientas en Claude Desktop o Claude Code | El sentido contrario: [un servidor MCP](./mcp-recipes) |
