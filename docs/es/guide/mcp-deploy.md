# Desplegar, proteger y resolver problemas

Tu servidor funciona en tu máquina ([primer servidor](./mcp-first-server), [recetas](./mcp-recipes)). Esta página explica cómo compartirlo por HTTP, cómo introducir reglas y personas en el circuito, la lista de comprobación de seguridad y qué hacer cuando algo no funciona.

## ¿stdio o HTTP? {#stdio-or-http}

| | stdio | Streamable HTTP |
| --- | --- | --- |
| Cómo se ejecuta | La aplicación de IA inicia tu servidor como un programa en el mismo equipo | Tu servidor se ejecuta en algún sitio como un servicio web |
| Quién puede usarlo | La persona que está en ese equipo | Cualquiera a quien des la dirección y un token |
| Exposición en la red | Ninguna | Un endpoint HTTP que hay que proteger |
| Ideal para | Herramientas personales, archivos locales, hacer pruebas | Un equipo, una API o una base de datos para toda la empresa |
| Se inicia con | `serveMcpOverStdio(sdk, options)` | `createMcpServer(sdk, options)` + el transporte HTTP del SDK de MCP |

Empieza con stdio. Pasa a HTTP cuando varias personas necesiten el mismo servidor.

## Servir por HTTP {#serve-over-http}

El SDK oficial de MCP proporciona el transporte HTTP; `createMcpServer` le da un servidor gobernado. Este archivo completo usa el propio módulo `http` de Node — sin ningún framework web — y es **sin estado** (stateless): cada solicitud recibe un servidor MCP nuevo, así que puedes ejecutar varias copias detrás de un balanceador de carga.

```ts
import { timingSafeEqual } from 'node:crypto';
import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import { join, resolve } from 'node:path';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { createMcpServer } from '@sdk-ai-agents/core/mcp';

const token = process.env.MCP_TOKEN;
if (!token) throw new Error('Set MCP_TOKEN: clients must send "Authorization: Bearer <token>"');
const port = Number(process.env.PORT ?? 3000);
// Requests must name this host: protects a local server from DNS rebinding attacks.
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

const folder = { root: resolve(process.argv[2] ?? 'docs'), name: 'docs' };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });
// Built once, shared by the server of every request.
const tools = folderTools(folder);
const resources = folderResources(folder);

createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    console.error('MCP request failed:', error);
    if (!response.headersSent) reply(response, 500, 'Internal server error');
  });
}).listen(port, '127.0.0.1');

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/mcp') return reply(response, 404, 'Not found');
  if (!allowedHosts.has(request.headers.host ?? '')) return reply(response, 403, 'Forbidden host');
  if (!sameSecret(request.headers.authorization ?? '', `Bearer ${token}`)) return reply(response, 401, 'Unauthorized');
  if (request.method !== 'POST') return reply(response, 405, 'Method not allowed');

  // Stateless: a client's cancellation arrives as a new request, which this fresh server
  // cannot tie to a call still in progress. A pending approval then ends only when the
  // client closes the connection, or after `approvalTimeoutMs` — until then a late "yes"
  // still runs the tool. Keep it well below the time your clients wait.
  const server = createMcpServer(sdk, { name: 'docs', tools, resources, approvalTimeoutMs: 20_000 });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => {
    transport.close().catch(() => undefined);
    server.close().catch(() => undefined);
  });
  await server.connect(transport);
  await transport.handleRequest(request, response);
}

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

/** Compares secrets in constant time, so timing does not reveal how much of a guess is right. */
function sameSecret(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Para qué sirve cada comprobación:

| Comprobación | Por qué |
| --- | --- |
| Ruta `/mcp` | Una sola dirección para MCP; todo lo demás se rechaza. |
| Cabecera `Host` | Si no, una página web que visites podría hacer que tu navegador llame a un servidor en `localhost` ("DNS rebinding"). Una vez desplegado, enumera en su lugar tu nombre de host público. |
| Token bearer | Solo entran los clientes que conocen el token. Se compara en tiempo constante. Genera uno largo y aleatorio; mantenlo fuera de tu código. |
| Solo `POST` | En modo sin estado no hay ningún flujo de larga duración que abrir con `GET`. |
| Un servidor por solicitud | No se comparte nada entre solicitudes; las definiciones de herramientas se construyen una vez y se reutilizan (se permite volver a definir la misma definición). El precio: el mensaje de "cancelar" de un cliente llega como otra solicitud y no puede alcanzar la llamada que cancela — en su lugar, la termina el cierre de la conexión o `approvalTimeoutMs`. |

El archivo escucha solo en `127.0.0.1`. Para publicarlo, ponlo detrás de un proxy inverso que termine **HTTPS** (Caddy, nginx, el balanceador de carga de tu nube), y añade tu nombre de host a `allowedHosts`. Nunca envíes un token bearer por HTTP sin cifrar a través de una red.

Se incluye una versión ejecutable como [`examples/mcp-http.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-http.ts) (`MCP_TOKEN=… npm run example:mcp-http`). Se comprobó con un cliente real: una llamada sin el token recibe `401`, un `Host` falsificado recibe `403`, y un cliente con el token enumera y llama a las herramientas.

### Conectar clientes a un servidor HTTP {#connect-clients-to-an-http-server}

- **Claude Code**: `claude mcp add --transport http docs https://mcp.example.com/mcp --header "Authorization: Bearer <token>"`. En un `.mcp.json` compartido, escribe `"headers": { "Authorization": "Bearer ${MCP_TOKEN}" }`: Claude Code expande las variables de entorno, así que el token se queda fuera del archivo.
- **Tus propios agentes**: `connectMcpServer({ name: 'docs', transport: { type: 'http', url, headers: { Authorization: `Bearer ${token}` } } })` — consulta [MCP en palabras sencillas](./mcp#use-the-tools-of-an-mcp-server-in-your-agents).
- **Otras aplicaciones**: busca "remote MCP server" o "custom connector" en su documentación. Algunas solo aceptan servidores que usan un inicio de sesión OAuth en lugar de un token fijo.

## Gobernanza: políticas, presupuestos, aprobaciones {#governance-policies-budgets-approvals}

Cada llamada MCP se ejecuta bajo una identidad, `mcp:<server name>` (cámbiala con `agentId`). Las políticas, los presupuestos y las alertas pueden dirigirse a ella como a cualquier agente. Consulta [Agentes gobernados](./governed-agents) para ver todos los tipos de política.

**Un presupuesto diario de llamadas** para un servidor:

```ts
sdk.defineGlobalPolicy({
  id: 'handbook-daily-budget',
  type: 'budget',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: 'budgetLimit',
      action: 'deny',
      metadata: { budgetLimit: { agentId: 'mcp:handbook', period: 'day', maxToolCalls: 500 } },
    },
  ],
});
```

La llamada 501 del día se rechaza con el nombre de la política, y el rechazo queda en el registro de eventos. Una llamada se contabiliza **cuando empieza** — se comprueba y se contabiliza en un solo paso, de modo que 20 llamadas simultáneas no pueden colarse todas por debajo de un límite de 2 — y cuenta **sea cual sea su resultado**, fallos incluidos. Los presupuestos se contabilizan en la memoria del proceso: vuelven a empezar de cero cuando el servidor se reinicia, y cada copia de un servidor HTTP cuenta sus propias llamadas. Antes de cualquier política o presupuesto, se comprueban los argumentos: una llamada no válida se rechaza sin contabilizarse y sin esperar a nadie.

### Aprobaciones: una persona dice que sí primero {#approvals-a-human-says-yes-first}

Una herramienta espera una decisión humana antes de ejecutarse cuando:

- su definición tiene `metadata: { requiresApproval: true }` — el valor por defecto para las operaciones de escritura de `openApiTools`;
- o una política lo pide, para las herramientas que nombres, sin tocar sus definiciones:

```ts
sdk.defineGlobalPolicy({
  id: 'approve-crm-writes',
  type: 'custom',
  scope: 'global',
  enabled: true,
  rules: [
    {
      condition: {
        type: 'condition',
        conditions: [{ field: 'intention.toolName', operator: 'in', value: ['crm_createNote', 'crm_updateCustomer'] }],
      },
      action: 'require_approval',
    },
  ],
});
```

Mientras espera, la llamada aparece en `sdk.getPendingApprovals()`. Tu código decide con `sdk.approveAction(id, who, reason)` o `sdk.rejectAction(id, who, reason)`; ambas se registran (`approval.requested`, `approval.approved` o `approval.rejected`). Un servidor stdio no puede preguntar en su propio terminal — la entrada estándar transporta el protocolo —, así que la decisión llega por otro canal. Por ejemplo, un pequeño endpoint de administración en esta máquina, en el mismo proceso que el servidor.

**El endpoint de administración decide lo que se ejecuta: protégelo como el endpoint MCP.** Si no, una página abierta en tu navegador podría alcanzar `localhost` (DNS rebinding) y aprobar por ti. Por eso escucha solo en `127.0.0.1`, acepta solo su propio `Host`, rechaza cualquier solicitud que lleve un `Origin` (los navegadores añaden uno; los scripts y `curl` no) y exige una cabecera secreta:

```ts
import { timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';

const port = 4000;
const secret = process.env.ADMIN_SECRET ?? '';   // a long random value
const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);

createServer((request, response) => {
  const answer = (status: number, body: unknown) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (request.headers.origin !== undefined) return answer(403, 'Forbidden origin');
  if (!allowedHosts.has(request.headers.host ?? '')) return answer(403, 'Forbidden host');
  const given = Buffer.from(String(request.headers['x-admin-secret'] ?? ''));
  const expected = Buffer.from(secret);
  if (!secret || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return answer(401, 'Unauthorized');
  }
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (request.method === 'GET' && url.pathname === '/approvals') return answer(200, sdk.getPendingApprovals());
  const decision = /^\/approvals\/([^/]+)\/(approve|reject)$/.exec(url.pathname);
  if (request.method !== 'POST' || !decision) return answer(404, 'Not found');
  const [, id = '', verb] = decision;
  try {
    if (verb === 'approve') sdk.approveAction(id, 'admin', 'approved from the admin endpoint');
    else sdk.rejectAction(id, 'admin', 'rejected from the admin endpoint');
    return answer(200, { decided: id, verb });
  } catch (error) {
    return answer(409, error instanceof Error ? error.message : String(error)); // unknown, decided or cancelled
  }
}).listen(port, '127.0.0.1');
```

Después, `curl -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals` enumera lo que está esperando, y `curl -X POST -H "X-Admin-Secret: $ADMIN_SECRET" http://127.0.0.1:4000/approvals/<id>/approve` decide. Se incluye un servidor completo construido así como [`examples/mcp-approvals.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-approvals.ts); se comprobó de principio a fin (una llamada espera, un `Host` falsificado, un `Origin` o un secreto ausente reciben `403`/`401`, la aprobación ejecuta la herramienta y el proceso termina cuando el cliente se va).

Para que se te avise cuando hay una aprobación esperando, añade una [regla de incidentes](./incidents#rules) sobre `approval.requested` con un notificador de Slack o de correo electrónico. Las aprobaciones pendientes viven en la memoria del proceso en el que espera la llamada: con varias copias de un servidor HTTP, decide a través de la copia que la tiene (o ejecuta una sola copia para las herramientas que necesitan aprobación).

::: warning Cuánto dura una aprobación pendiente
Muchos clientes cancelan una llamada al cabo de aproximadamente un minuto. Una aprobación pendiente se cancela — y la herramienta no se ejecuta nunca — cuando:

- el cliente cancela la llamada (stdio, o una sesión HTTP con estado);
- la conexión se cierra: un cliente stdio que termina, una solicitud HTTP que se cierra;
- nadie decidió dentro de `approvalTimeoutMs` — **50 segundos por defecto**, por debajo de lo que espera la mayoría de los clientes. Fíjalo en `createMcpServer`/`serveMcpOverStdio` si tu cliente espera más (Claude Code con un `MCP_TOOL_TIMEOUT` aumentado).

**En un servidor HTTP sin estado, solo se aplican los dos últimos casos**: no puede asociar una solicitud de "cancelar" con la llamada que cancela. Un cliente que se rinde sin cerrar su conexión deja la aprobación pendiente hasta `approvalTimeoutMs` — y un "sí" dado en ese intervalo sigue ejecutando la herramienta, aunque nadie esté esperando la respuesta. Mantén `approvalTimeoutMs` muy por debajo del tiempo que esperan tus clientes (el ejemplo usa 20 s), o sirve las herramientas que necesitan aprobación por stdio o en una sesión con estado.

Una vez cancelada, un "sí" tardío falla con "already rejected", y la llamada se comprueba una vez más después de la aprobación: si el cliente se fue entretanto, la herramienta no se ejecuta. Las aprobaciones a través de MCP son adecuadas para decisiones rápidas. Para decisiones que llevan horas, haz que la herramienta *presente una solicitud* que tu equipo procese más tarde.
:::

La mayoría de las aplicaciones MCP también preguntan al usuario antes de cada llamada a una herramienta (Claude Desktop lo hace por defecto). Esa confirmación ocurre en la aplicación; las aprobaciones del SDK ocurren en tu servidor, según tus reglas, y quedan registradas. Usa ambas para todo lo que cambie datos.

## Notificaciones de progreso {#progress-notifications}

Un cliente puede pedir que se le informe de cómo va una llamada: envía un `progressToken` con la llamada (el SDK oficial de TypeScript lo hace cuando pasas `onprogress`). El servidor envía entonces una notificación `notifications/progress` por cada evento de la llamada, y de la ejecución del agente que inicia un `cognitiveAgentTool` o un `governedAgentTool`, con un `progress` que aumenta en uno cada vez y un `message` corto:

```text
call started
tool ask_support called
agent started
step 1: model chose lookup_customer
step 1: tool lookup_customer called
step 1: tool lookup_customer done
step 2: model answered
agent completed
call completed
```

Los mensajes nombran los pasos, las herramientas y las operaciones cognitivas: la herramienta que eligió el modelo, y cada herramienta que llama el agente, incluidas las herramientas del agente que el servidor no expone. Una herramienta que ejecuta un [estudio](./studies) con el `onEvent` de su contexto se describe por pasajes (`study started`, `passage changes started`, `search in changes`), nunca por consultas. Nunca llevan argumentos, resultados ni textos de error. No hay `total`: nadie sabe de antemano cuántos pasos dará una ejecución. Cada notificación se envía antes del resultado, nunca después. Con Streamable HTTP viajan en el flujo de la respuesta (SSE); un transporte creado con `enableJsonResponse: true` responde en JSON simple y las descarta. Un cliente que no envía ningún `progressToken` no recibe ninguna.

Solo se sigue la ejecución de agente que inicia una herramienta, a un solo nivel de profundidad: las ejecuciones que ese agente inicia a través de sus propias herramientas de agente no se siguen, y un agente construido a mano sobre un almacén sin eventos en tiempo real tampoco. No se agrupa nada: cada evento es una notificación, y una ejecución cognitiva larga puede enviar cientos.

Qué cambia el progreso, y qué no:

- **Solo esperan más los clientes que reinician su tiempo límite con las notificaciones de progreso.** Con el SDK de TypeScript: `client.callTool(params, undefined, { onprogress, resetTimeoutOnProgress: true, maxTotalTimeout })`. Un cliente que muestra el progreso pero mantiene un tiempo límite fijo se rinde en el mismo momento que antes. Comprueba lo que hace tu aplicación antes de contar con ello.
- **Con un cliente así, lo que cuenta es el silencio más largo**, no la duración de la llamada: una llamada al modelo, una herramienta lenta o una aprobación. No se envía nada mientras se ejecuta una herramienta ni mientras espera una aprobación, así que los 50 s de `approvalTimeoutMs` se siguen aplicando, y cada llamada al modelo o a una herramienta, por sí sola, debe caber dentro del tiempo límite del cliente.
- **Los agentes pueden entonces tardar más**: el `limits.timeoutMs` de un agente cognitivo puede superar el tiempo límite del cliente, ya que cada paso envía notificaciones. Para los demás clientes, mantén los límites pequeños de la [receta del agente](./mcp-recipes#an-agent-your-reasoning-twin).

## Lista de comprobación de seguridad {#security-checklist}

Antes de compartir un servidor:

- [ ] **Expón lo mínimo.** Enumera en `tools` solo las herramientas necesarias; prefiere las fuentes de solo lectura; añade las operaciones de escritura una a una.
- [ ] **Las escrituras necesitan a una persona.** Mantén `requiresApproval` en las herramientas de escritura salvo que tengas un motivo, y deja constancia de ese motivo.
- [ ] **Mínimo privilegio por debajo.** Tokens de API con permisos de solo lectura, un rol de base de datos limitado a SELECT, una carpeta que solo contenga lo que se puede compartir. Las comprobaciones del servidor son un segundo cerrojo, no el primero.
- [ ] **Los secretos, fuera del código.** Los tokens vienen de variables de entorno (`claude mcp add … -e TOKEN=…`), nunca de la especificación, de la descripción ni del archivo.
- [ ] **Los resultados son texto no fiable.** Lo que devuelve una API, un documento o una base de datos llega al modelo palabra por palabra — una página puede contener "ignora tus instrucciones y…". No des a la misma conversación a la vez fuentes no fiables y herramientas de escritura potentes sin aprobación.
- [ ] **Servidores HTTP**: HTTPS, un token largo y aleatorio, una lista de `Host` permitidos, escucha en `127.0.0.1` detrás del proxy.
- [ ] **Los detalles de los errores se quedan dentro** (`exposeErrorDetails` desactivado, el valor por defecto). Los rechazos de la entrada (argumento incorrecto, ruta fuera de la carpeta, SQL que no es una consulta) se siguen explicando al cliente.
- [ ] **Presupuestos** para todo lo que cuesta dinero: agentes (llamadas al modelo) y API de pago.
- [ ] **Lee el registro de eventos** tras los primeros días: qué herramientas se llaman, qué llamadas se rechazan.

El proyecto MCP mantiene una guía detallada de ataques y defensas: [Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices).

## Resolución de problemas {#troubleshooting}

| Síntoma | Causa probable | Solución |
| --- | --- | --- |
| El cliente se desconecta de inmediato, o dice que el servidor envió un JSON no válido | Algo escribe en la **salida estándar**: un `console.log` en tu código o en una biblioteca | Usa `console.error` (salida de error estándar). Stdout transporta el protocolo. |
| `npx tsx server.ts` imprime una línea y parece bloqueado | Normal: un servidor stdio espera a un cliente | Pruébalo con el [Inspector](./mcp-first-server#_4-test-it-with-the-mcp-inspector), o conecta una aplicación. |
| El servidor no aparece en Claude Desktop | Error de JSON en la configuración, ruta relativa, aplicación no reiniciada | Revisa el JSON, usa rutas absolutas, cierra y vuelve a abrir la aplicación, lee `mcp*.log` ([dónde](./mcp-first-server#_5-connect-it-to-claude-desktop)). |
| `npx: command not found` / `node: not found` en los logs | La aplicación no ve el `PATH` de tu shell (habitual con nvm) | Usa la ruta completa de `npx` (`which npx` / `where npx`). |
| Falta una herramienta en la lista | No está en `tools` | Añade su nombre o su definición a `tools`: si no, no se expone nada. |
| `Another tool named "x" is already defined` al arrancar | Dos fuentes producen el mismo nombre de herramienta | Da a cada fuente un `prefix`. |
| `Tool execution failed: <name>` y nada más | La causa puede contener detalles internos, así que se oculta | Lee la ejecución en el registro de eventos, o fija `exposeErrorDetails: true` mientras desarrollas. |
| Las llamadas agotan el tiempo límite | La herramienta es lenta (a menudo un agente) | `limits` del agente más pequeños; aumenta el tiempo límite del cliente (Claude Code: `MCP_TOOL_TIMEOUT`); o usa un cliente que reinicie su tiempo límite con las [notificaciones de progreso](#progress-notifications). |
| Los resultados aparecen cortados | Límites de tamaño (`truncated: true`) o el límite propio del cliente | Aumenta `maxResponseBytes`, `maxRows`, `maxFileBytes`; Claude Code: `MAX_MCP_OUTPUT_TOKENS`. |
| Una herramienta de escritura responde "Approval no decision within 50000 ms" | Nadie la aprobó a tiempo | Apruébala más rápido (consulta [aprobaciones](#approvals-a-human-says-yes-first)), aumenta `approvalTimeoutMs`, o fija `requiresApproval: false` de forma deliberada. |
| Aparecen carpetas como `events/` o `golden-traces/` en lugares inesperados | No hay una ruta absoluta para el registro de eventos (o una versión antigua del SDK) | Pasa `eventStore: new FileEventStore(<absolute path>)`. Las versiones actuales solo crean sus otras carpetas cuando se usan. |
| `Cannot find module 'node:sqlite'` | Node.js anterior a 22.13 | Actualiza Node.js, o usa `better-sqlite3`. |
| `… is not JSON. For a YAML spec, parse it yourself` | La especificación OpenAPI está en YAML | Analízala (paquete `yaml`) y pasa el objeto como `spec`. |
| `cannot resolve the server URL "/v3"` | La especificación tiene un servidor relativo y se cargó desde un archivo | Pasa `baseUrl`. |
| El Inspector se niega a arrancar | Su [documentación](https://modelcontextprotocol.io/docs/tools/inspector) pide Node.js 22.19+ (comprobado el 2026-09-24) | Actualiza Node.js para ejecutar el Inspector (tu servidor puede quedarse en 20+). |
| Un cliente que solo habla el protocolo 2026-07-28 no puede conectarse | El servidor acepta las revisiones de 2024-10-07 a 2025-11-25 (SDK de MCP para TypeScript 1.30) | Usa un cliente compatible con las revisiones anteriores. El Inspector negocia ambas "eras", la heredada y la 2026-07-28, según su [documentación](https://modelcontextprotocol.io/docs/tools/inspector) (comprobado el 2026-09-24). |
| Con las alertas de incidentes activadas, cada llamada MCP rechazada se convierte en una alerta | Una llamada MCP fallida es una ejecución fallida | Filtra con `when: (event) => event.metadata?.agentId !== 'mcp:docs'`, o baja su gravedad. |

### Leer qué ha pasado {#reading-what-happened}

Cada llamada y cada lectura de recurso es una ejecución. Con el almacén de archivos por defecto, cada ejecución es un archivo JSON en tu carpeta `events/`; desde el código:

```ts
const store = new FileEventStore('/absolute/path/events');
for (const runId of await store.getRunIds()) {
  const events = await store.getEvents(runId);
  const first = events[0];
  if (first?.metadata?.agentId === 'mcp:docs') {
    console.log(runId, events.map((event) => event.type).join(' → '));
  }
}
```

Una llamada a herramienta se lee `run.started → action.executing → policy.checked → tool.called → action.executed → run.completed`; una lectura de recurso, `run.started → resource.read → run.completed`, donde `resource.read` contiene la URI, el tamaño y el SHA-256 de lo que se sirvió. Consulta el [catálogo de eventos](../reference/events).
