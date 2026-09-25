# Un servidor MCP para cualquier cosa

Cada receta convierte un tipo de sistema en un servidor MCP **con una sola línea**, de forma segura. Todas funcionan igual: una **fuente de herramientas** construye las herramientas (y a veces los recursos), y `serveMcpOverStdio` las sirve.

| Quieres exponer | La línea | Herramientas que recibe el modelo |
| --- | --- | --- |
| [Una función que escribes tú](#a-function) | `sdk.defineTool({ … })` | las tuyas |
| [Una API web](#a-web-api-from-its-openapi-description) | `await openApiTools({ spec: 'https://…/openapi.json' })` | una por operación, de solo lectura por defecto |
| [Una carpeta de documentos](#a-folder-of-documents) | `folderTools({ root: './handbook' })` | `list_files`, `read_file`, `search_files` (+ recursos) |
| [Una base de datos, en solo lectura](#a-read-only-database) | `databaseTools({ database: sqliteReadOnly(db) })` | `list_tables`, `describe_table`, `query` |
| [Un agente](#an-agent-your-reasoning-twin) | `cognitiveAgentTool(agent)` | `ask_<agent>` |
| [La Web](./web-research) | `webTools()` | `web_search`, `web_fetch`, `arxiv_search`, `wikipedia_search`, `github_search` |

¿Eres nuevo con MCP? Empieza por [Tu primer servidor MCP en 5 minutos](./mcp-first-server): muestra cómo ejecutar un servidor, probarlo con el Inspector y conectarlo a Claude Desktop o a Claude Code. Todos los archivos de abajo se ejecutan y se conectan de la misma forma.

## El esqueleto que comparten todas las recetas {#the-skeleton-every-recipe-shares}

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

// No model key needed unless a recipe uses an agent. The event log goes next to this file.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'my-server',
  tools: [/* ← the recipe goes here */],
});
```

`tools` acepta **definiciones de herramientas** (lo que devuelven las fuentes de abajo — el SDK las define por ti) y **nombres** de herramientas que definiste tú mismo con `sdk.defineTool`. Nunca se expone nada más. `resources` (opcional) acepta proveedores de documentos, que usa la receta de carpeta.

Sea cual sea la fuente, cada llamada pasa por las mismas comprobaciones, en este orden — argumentos, [políticas](./mcp-deploy#governance-policies-budgets-approvals), aprobación, presupuesto — y se escribe en el registro de eventos. Una llamada no válida se rechaza antes de pedir a nadie que la apruebe.

## Una función {#a-function}

La fuente más sencilla: una función que escribes tú, como en el [primer servidor](./mcp-first-server).

```ts
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team',
  schema: z.object({ topic: z.string().describe('For example "billing"') }),
  metadata: { readOnly: true },
  handler: async ({ topic }) => directory.search(topic),
});

await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

| Campo | Para qué sirve |
| --- | --- |
| `name` | Lo que llama el modelo. Usa letras, dígitos, `_` y `-`, hasta 64 caracteres (los clientes MCP pueden rechazar otros nombres). |
| `description` | Cuándo usar la herramienta, en palabras sencillas. El modelo decide a partir de ella. |
| `schema` | Los argumentos, como un esquema zod. Los textos de `.describe()` se muestran al modelo. Las llamadas que no encajan se rechazan. |
| `handler` | Tu código. Recibe los argumentos validados, y un contexto con `signal` (que se aborta cuando el cliente se rinde). |
| `metadata.readOnly` | "Esta herramienta no cambia nada": se muestra a los clientes como `readOnlyHint`. |
| `metadata.requiresApproval` | Cada llamada espera a una persona (consulta [aprobaciones](./mcp-deploy#approvals-a-human-says-yes-first)). |
| `retry` | Reintentos en caso de fallo, solo para herramientas idempotentes (`retryOn` acota qué fallos; los argumentos no válidos nunca se reintentan). |

## Una API web, a partir de su descripción OpenAPI {#a-web-api-from-its-openapi-description}

**Qué hace.** Muchas API publican una descripción legible por máquinas de sus endpoints, llamada documento **OpenAPI** (a menudo `openapi.json`). `openApiTools` la lee y convierte **cada operación en una herramienta**: el modelo ve su resumen y sus parámetros, y llamar a la herramienta llama a la API.

```ts
import { openApiTools } from '@sdk-ai-agents/core';

await serveMcpOverStdio(sdk, {
  name: 'petstore',
  tools: await openApiTools({ spec: 'https://petstore3.swagger.io/api/v3/openapi.json' }),
});
```

**Solo lectura por defecto.** Solo las operaciones `GET` se convierten en herramientas. Para añadir una operación que cambia algo (`POST`, `PUT`, `PATCH`, `DELETE`), enumérala por su `operationId`:

```ts
const tools = await openApiTools({
  spec: './crm-openapi.json',
  headers: { Authorization: `Bearer ${process.env.CRM_TOKEN}` },
  include: ['getCustomer', 'listInvoices', 'createNote'], // createNote is a POST
  prefix: 'crm_',
});
```

Una operación de escritura enumerada se marca como de **riesgo alto** y **requiere aprobación**: cada llamada espera hasta que una persona la aprueba (consulta [aprobaciones](./mcp-deploy#approvals-a-human-says-yes-first)). Para confiar en ella sin aprobación, dilo explícitamente: `metadata: (operation) => (operation.operationId === 'createNote' ? { requiresApproval: false } : undefined)`.

### Opciones {#options}

| Opción | Por defecto | |
| --- | --- | --- |
| `spec` | — | Una URL (`https://…`), una ruta de archivo o un objeto que ya analizaste. Solo JSON; para YAML, analízalo tú (por ejemplo con el paquete `yaml`) y pasa el objeto. |
| `baseUrl` | primera entrada de `servers` | Adónde van las solicitudes. Una URL de servidor relativa se resuelve respecto a la URL de la especificación. |
| `headers` | — | Se añaden a cada solicitud (autenticación). Nunca se muestran al modelo, y prevalecen sobre cualquier argumento de cabecera. Requiere `baseUrl` (salvo que la especificación se descargue desde el propio origen de la API) y https para la API y para la especificación (http solo en esta máquina). |
| `include` | operaciones GET | Los `operationId` que se exponen. Cuando se indica, **sustituye** al valor por defecto de GET: solo las operaciones enumeradas se convierten en herramientas. Es la única forma de exponer una operación de escritura. Un identificador desconocido es un error. |
| `exclude` | — | Los `operationId` que se dejan fuera. |
| `tags` | — | Solo las operaciones con alguna de estas etiquetas. |
| `prefix` | — | Prefijo de los nombres de herramienta (`crm_getCustomer`), para combinar varias API. |
| `metadata` | GET: riesgo bajo, solo lectura · las demás: riesgo alto, aprobación | `(operation) => ToolMetadata`. Cada campo que fijas sustituye al del valor por defecto; un campo omitido — o `undefined` — lo conserva, así que solo un `requiresApproval: false` explícito elimina una aprobación. |
| `retry` | — | Reintentos solo para las operaciones de solo lectura (los GET, salvo que `metadata` diga otra cosa), ante errores de servidor (5xx), 429, tiempos límite agotados y fallos de red — nunca ante respuestas 4xx ni argumentos no válidos. |
| `timeoutMs` | `30000` | Por solicitud (y para descargar la especificación). |
| `maxResponseBytes` | `100000` | Las respuestas más largas se cortan y se marcan con `truncated: true`. |
| `maxSpecBytes` | `10000000` | La especificación más grande que se acepta. |
| `fetch` | `fetch` global | Tu propia función HTTP (proxy, pruebas). |

### Qué ve el modelo {#what-the-model-sees}

Para el `getPetById` de Petstore, los clientes reciben:

```json
{
  "name": "getPetById",
  "description": "Find pet by ID\n\nReturns a single pet.\n\n(GET /pet/{petId})",
  "inputSchema": {
    "type": "object",
    "properties": {
      "petId": { "type": "integer", "format": "int64", "description": "ID of pet to return" }
    },
    "required": ["petId"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": true }
}
```

Los nombres de las herramientas proceden del `operationId` (convertido en válido: `show pet!` se convierte en `show_pet`; una operación sin él se convierte en `get_pets_petId`; los duplicados reciben `_2`). Los argumentos son planos: uno por cada parámetro de ruta, de consulta y de cabecera, más `body` para un cuerpo de solicitud JSON. Una llamada devuelve el estado HTTP y el cuerpo analizado:

```json
{ "status": 200, "data": { "id": 10, "name": "doggie", "status": "available" } }
```

### Reglas de seguridad {#security-rules}

1. **Solo lectura por defecto**: solo `GET`; cualquier otra cosa debe enumerarse en `include`, y entonces requiere aprobación salvo que digas lo contrario.
2. **El modelo no puede cambiar el host ni subir por la ruta.** La URL base es tuya. Un valor de ruta no puede contener `/`, `\` ni un segmento `.` / `..` — ni siquiera codificado con porcentajes, una o varias veces, junto a secuencias de escape mal formadas o no, porque algunos servidores y proxies decodifican `%2F` —, así que `../../admin` se rechaza; además se comprueba que la URL final quede bajo la URL base. Dentro de esos límites, el modelo elige los valores: qué cliente, qué pedido.
3. **Los argumentos se comprueban antes que nada**: antes de las políticas y las aprobaciones (una llamada no válida nunca espera a una persona), y de nuevo al construir la solicitud. Los argumentos desconocidos y los obligatorios que faltan se rechazan; los valores deben ser cadenas, números o booleanos (listas de ellos para los parámetros de consulta); los valores de cabecera no pueden contener saltos de línea.
4. **Tus credenciales solo van adonde tú decidiste**: los `headers` los añade el servidor, prevalecen sobre los argumentos de cabecera y no aparecen en ningún sitio que el modelo pueda leer. Con `headers`, se rechaza un servidor indicado por un archivo de especificación — pasa `baseUrl` — salvo que la especificación se haya descargado desde el propio origen de la API; y `http:` se rechaza salvo en esta máquina (`localhost`, `127.0.0.1`, `[::1]`) — para la API, y para descargar la especificación, porque una especificación alterada por el camino podría añadir operaciones que tus credenciales autorizarían.
5. **Acotado**: un tiempo límite por solicitud, respuestas cortadas en `maxResponseBytes`, un límite de tamaño para la especificación.
6. **Las redirecciones no se siguen** (una redirección podría llevar tu cabecera `Authorization` a otro sitio): una respuesta `3xx` es un error, y también lo es una redirección que un `fetch` personalizado haya seguido de todos modos.
7. **Los errores son errores**: un estado distinto de `2xx` hace fallar la llamada con el estado y el principio del cuerpo. Los clientes MCP solo ven "Tool execution failed" salvo que fijes `exposeErrorDetails: true` (los cuerpos pueden contener detalles internos); el registro de eventos siempre tiene el error completo.
8. **Cada GET se anuncia como de solo lectura** (`readOnlyHint`). Algunas API tienen GET con efectos secundarios (`GET /send-reminder`): déjalos fuera con `exclude`, o fija para ellos `metadata` a `readOnly: false, requiresApproval: true`.
9. **Las descripciones grandes siguen acotadas**: la expansión de `$ref` tiene un presupuesto por operación y para toda la especificación, y el esquema de una herramienta de más de 64.000 caracteres se sustituye por sus descripciones.

### Archivo completo {#complete-file}

[`examples/mcp-openapi.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-openapi.ts), con los imports de un paquete instalado:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK, openApiTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const spec = process.env.OPENAPI_SPEC ?? 'https://petstore3.swagger.io/api/v3/openapi.json';
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

const tools = await openApiTools({
  spec,
  ...(process.env.API_BASE_URL ? { baseUrl: process.env.API_BASE_URL } : {}),
  ...(process.env.API_TOKEN ? { headers: { Authorization: `Bearer ${process.env.API_TOKEN}` } } : {}),
  timeoutMs: 15_000,
});

await serveMcpOverStdio(sdk, { name: 'web-api', tools });
```

Pasa el token a través del entorno del cliente, nunca en el archivo: `claude mcp add web-api -e API_TOKEN=… -- npx -y tsx /path/mcp-openapi.ts`.

### Lo que no hace {#what-it-does-not-do}

- **Solo OpenAPI 3.x**: Swagger 2.0 se rechaza (conviértelo, por ejemplo con `swagger2openapi`). El YAML no se analiza por ti.
- **Solo cuerpos JSON**: una operación que requiere un cuerpo `multipart/form-data` o de formulario se deja fuera (o se rechaza si la enumeras); un cuerpo opcional de otro tipo no se ofrece. Los parámetros de cookie se dejan fuera.
- **Sin flujos de inicio de sesión**: pasa un token en `headers`; OAuth no se gestiona.
- **Solo referencias locales**: los `$ref` a otros archivos o URL no se resuelven (se convierten en "cualquier valor"); un esquema que se refiere a sí mismo se corta en el ciclo.
- Las respuestas no se comprueban contra la especificación, las páginas no se siguen, y solo se usa el primer servidor de la especificación salvo que pases `baseUrl`.

## Una carpeta de documentos {#a-folder-of-documents}

**Qué hace.** Ofrece los archivos de texto de una carpeta — un manual, notas, un código fuente, documentación exportada — con tres herramientas: **enumerar** los archivos, **leer** uno, **buscar** un texto en ellos. Los mismos archivos se ofrecen también como **recursos**, que los usuarios pueden adjuntar ellos mismos a una conversación.

```ts
import { folderResources, folderTools } from '@sdk-ai-agents/core';

const handbook = { root: '/Users/you/handbook', exclude: ['drafts/**'] };

await serveMcpOverStdio(sdk, {
  name: 'handbook',
  tools: folderTools(handbook),
  resources: folderResources(handbook),
});
```

### Opciones {#options-1}

`folderTools` y `folderResources` aceptan las mismas opciones (más `prefix` para las herramientas):

| Opción | Por defecto | |
| --- | --- | --- |
| `root` | — | La carpeta. Usa una ruta absoluta: los clientes inician los servidores desde cualquier directorio de trabajo. |
| `name` | el nombre de la carpeta | Se usa en las descripciones y en las URI de los recursos (`folder://<name>/…`). |
| `prefix` | — | Prefijo de los nombres de herramienta (`handbook_read_file`), para servir varias carpetas. |
| `extensions` | formatos de texto | Extensiones ofrecidas, sin el punto (`['md', 'txt']`). Por defecto: `md`, `txt`, `csv`, `json`, `yaml`, `html`, código fuente… (`DEFAULT_TEXT_EXTENSIONS`). Añade `''` para los archivos sin extensión. |
| `include` | todo lo permitido | Patrones glob de los archivos que se ofrecen: `guide/**`, `**/*.md`. `*` coincide dentro de una carpeta, `**` a través de carpetas. Las carpetas se siguen enumerando, aunque no contengan ningún archivo que coincida. |
| `exclude` | — | Patrones glob de archivos y carpetas que se ocultan en todas partes: `drafts`, `private/*`, `**/node_modules`. Una carpeta oculta oculta todo lo que contiene. |
| `includeHidden` | `false` | Ofrece los nombres que empiezan por un punto (`.env`, `.git`…). Déjalo desactivado. |
| `maxFileBytes` | `200000` | Bytes leídos de un archivo; los archivos más largos se cortan (`truncated: true`). |
| `maxEntries` | `500` | Entradas devueltas por un listado, recursos incluidos. |
| `maxDepth` | `8` | Profundidad de subcarpetas explorada. |
| `maxMatches` | `50` | Coincidencias devueltas por una búsqueda. |
| `maxSearchBytes` | `20000000` | Bytes leídos por una búsqueda, contando todos los archivos. |
| `maxExaminedEntries` | `50000` | Nombres examinados por un listado o una búsqueda, se ofrezcan o no; al superarlo, el resultado indica `truncated: true`. |

### Qué ve el modelo {#what-the-model-sees-1}

La herramienta de búsqueda, abreviada:

```json
{ "name": "search_files",
  "description": "Finds the lines of the \"handbook\" folder that contain a text (case-insensitive), with file and line number.",
  "inputSchema": { "type": "object",
    "properties": { "query": { "type": "string", "minLength": 1, "maxLength": 200 },
                    "path": { "type": "string", "description": "Folder to search in; default: everywhere" } },
    "required": ["query"] },
  "annotations": { "readOnlyHint": true } }
```

Una búsqueda devuelve `{ "query": "laptop", "matches": [{ "path": "guide/onboarding.md", "line": 2, "text": "Ask IT for a laptop." }], "filesScanned": 6, "truncated": false }`. Una lectura devuelve `{ "path", "size", "content", "truncated" }`.

**Recursos**: cada archivo se enumera como `folder://handbook/guide/onboarding.md` con su tamaño y su tipo (`text/markdown`, `text/csv`…). Las aplicaciones que admiten recursos permiten al usuario elegirlos, por ejemplo desde un menú de adjuntos; el modo depende de la aplicación.

### Reglas de seguridad {#security-rules-1}

1. **Solo rutas relativas**; las rutas absolutas se rechazan.
2. **Nada fuera de la carpeta**: cada ruta se resuelve a su ubicación real — segmentos `..` y enlaces simbólicos incluidos — y se rechaza si sale de la carpeta. Un enlace a una carpeta ya visitada se omite, así que un bucle de enlaces no puede bloquear un listado.
3. **Los nombres ocultos son invisibles**: `.env`, `.git`, `.ssh`… se comportan como si no existieran, incluso a través de un enlace.
4. **Solo texto**: solo se ofrecen las extensiones permitidas, y se rechaza un archivo cuyos primeros 8 KB contengan un byte cero (binario).
5. **Acotado**: las lecturas, los listados, la profundidad, las coincidencias de búsqueda, los bytes recorridos y los nombres examinados (`maxExaminedEntries`, 50.000) están todos limitados; un listado o una búsqueda que se detuvo antes de tiempo lo indica con `truncated: true`.
6. **Solo lectura**: nunca se escribe, se mueve ni se borra nada.
7. **Trazado**: cada lectura de recurso es una ejecución en el registro de eventos, con la URI, el tamaño y la huella SHA-256 de lo que se sirvió.
8. **Excluido significa excluido**: excluir una carpeta (`private`, `private/*`, `**/node_modules`) oculta todo lo que contiene, tanto si se enumera, se busca, se lee por ruta o se lee como recurso.
9. **Robusto**: una subcarpeta que no se puede leer se omite, y los mensajes de error nombran la carpeta compartida, nunca su ruta absoluta.

### Archivo completo {#complete-file-1}

Adaptado de [`examples/mcp-folder.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-folder.ts) (que por defecto sirve esta documentación):

```ts
import { join, resolve } from 'node:path';
import { FileEventStore, createSDK, folderResources, folderTools } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const root = resolve(process.argv[2] ?? join(import.meta.dirname, 'docs'));
const folder = { root, name: 'docs', exclude: ['**/node_modules/**'] };
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'docs',
  tools: folderTools(folder),
  resources: folderResources(folder),
  instructions: 'Company documentation. Search it before answering questions about our processes.',
});
```

### Lo que no hace {#what-it-does-not-do-1}

- **Ninguna escritura** de ningún tipo.
- **Nada de PDF, Word ni imágenes**: solo archivos de texto. Convierte antes los documentos a Markdown o a texto.
- **Solo búsqueda de subcadenas**: nada de búsqueda por significado ("semántica"), nada de clasificación.
- **Sin notificaciones de cambios**: los clientes ven los archivos tal como están cuando los enumeran.
- **La carpeta no debe poder ser modificada por personas en las que no confías**: las rutas se comprueban y después se abre el archivo; alguien que pudiera sustituir una carpeta por un enlace en ese preciso instante podría, en teoría, colarse.
- **Con `include`, las carpetas se siguen enumerando** aunque no contengan ningún archivo que coincida (comprobarlo supondría leer todas las subcarpetas).
- Las lecturas de recursos se trazan pero no las comprueban las políticas de herramientas: ofrece solo carpetas que estés dispuesto a compartir.

## Una base de datos en solo lectura {#a-read-only-database}

**Qué hace.** Permite al modelo explorar una base de datos — enumerar las tablas, describir una, ejecutar una consulta `SELECT` — y **no cambiarla nunca**. Funciona con **SQLite** (el `node:sqlite` integrado de Node.js 22.13+, o `better-sqlite3`) y **PostgreSQL** (`pg`).

::: code-group

```ts [SQLite]
import { DatabaseSync } from 'node:sqlite';
import { databaseTools, sqliteReadOnly } from '@sdk-ai-agents/core';

const db = new DatabaseSync('/data/shop.sqlite', { readOnly: true });

await serveMcpOverStdio(sdk, {
  name: 'shop',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' }),
});
```

```ts [PostgreSQL]
import pg from 'pg';
import { databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
  }),
});
```

:::

### Opciones {#options-2}

| Opción de `databaseTools` | Por defecto | |
| --- | --- | --- |
| `database` | — | `sqliteReadOnly(db)`, `postgresReadOnly({ pool })` o `postgresReadOnly({ client })`, o tu propia `ReadOnlyDatabase`. |
| `name` | `the <dialect> database` | Cómo la conoce el modelo: "the shop database". |
| `prefix` | — | Prefijo de los nombres de herramienta (`shop_query`), para servir varias bases de datos. |
| `maxRows` | `100` (como máximo `1000`) | Filas devueltas por una consulta; `truncated: true` indica que había más. |
| `maxTextLength` | `2000` | Caracteres conservados por valor de texto. |
| `maxTables` | `500` | Tablas enumeradas. |
| `maxSqlLength` | `20000` | El SQL más largo que se acepta. |

| Opción de `postgresReadOnly` | Por defecto | |
| --- | --- | --- |
| `statementTimeoutMs` | `10000` | PostgreSQL detiene cualquier consulta que dure más. |
| `schemas` | todos salvo los del sistema | Esquemas **enumerados y descritos** por `list_tables` y `describe_table`. No restringe lo que puede leer `query`: esa es la función del rol. |

Con `{ client }`, da al adaptador un `pg.Client` **dedicado**: uno que tu aplicación no use para sus propias transacciones (ahí se rechaza un pool; pásalo como `{ pool }`).

`sqliteReadOnly(db)` no tiene opciones: abre el archivo en solo lectura (`{ readOnly: true }` con `node:sqlite`, `{ readonly: true }` con better-sqlite3). Solo depende de `prepare`, `exec` y los métodos de sentencia que comparten ambos drivers; la batería de pruebas lo ejecuta sobre una base de datos `node:sqlite` real, no sobre better-sqlite3.

### Qué ve el modelo {#what-the-model-sees-2}

Tres herramientas: `list_tables`, `describe_table { table }` y `query { sql }`, descritas como *"Runs one read-only SQL query (sqlite dialect) on the shop database and returns at most 100 rows; "truncated" is true when there were more. Statements that change data or schema are refused. Use list_tables and describe_table first."* Una consulta devuelve:

```json
{ "columns": ["name", "spent"],
  "rows": [{ "name": "Ada", "spent": 200.5 }, { "name": "Grace", "spent": 42 }],
  "rowCount": 2, "truncated": false }
```

Los valores se hacen legibles a medida que llegan las filas: los enteros muy grandes se convierten en cadenas, las fechas en cadenas ISO, los datos binarios en una nota como `<binary data, 3 bytes>`, los textos largos se cortan, los arrays conservan 100 elementos (`… 400 more items`). Cuando es la propia base de datos la que rechaza la consulta ("no such column", "read-only", un tiempo límite agotado), el modelo recibe el motivo para que pueda corregir su SQL; los errores de conexión y de servidor se quedan de tu lado.

### Reglas de seguridad: cuatro cerrojos, no uno {#security-rules-four-locks-not-one}

Comprobar que una consulta "empieza por SELECT" no basta: `WITH gone AS (DELETE FROM orders RETURNING *) SELECT * FROM gone` empieza por `WITH` y borra. Así que una consulta debe superar cuatro cerrojos:

1. **La comprobación de la sentencia**: exactamente una sentencia (se entienden los puntos y coma dentro de cadenas, los nombres entre comillas, los comentarios, las comillas `$$` de PostgreSQL y las cadenas de escape `E'…'`), que empiece por `SELECT`, `WITH` o `VALUES`, sin parámetros `$1`, con los paréntesis equilibrados. `PRAGMA`, `ATTACH`, `EXPLAIN ANALYZE`, `COMMIT`… se rechazan.
2. **La propia base de datos rechaza las escrituras**:
   - SQLite: cada consulta se ejecuta con `PRAGMA query_only = ON` (restablecido después), y con better-sqlite3 una sentencia que escribe se rechaza antes de ejecutarse;
   - PostgreSQL: cada consulta se ejecuta en su propia transacción `BEGIN READ ONLY` — primero se detecta una conexión que ya está dentro de otra transacción (`transaction_timestamp()` anterior a la sentencia) y se rechaza sin tocar esa transacción —, con `SET LOCAL statement_timeout`, y siempre termina con `ROLLBACK` y después `SELECT pg_advisory_unlock_all()` (los bloqueos consultivos sobreviven a un rollback; una conexión que no puede liberarlos no se reutiliza). La consulta se envía como una subconsulta con un parámetro vinculado, de modo que el servidor solo acepta una sentencia. Las transacciones nunca comparten una conexión al mismo tiempo.
3. **Límites**: se leen como máximo `maxRows` filas (SQLite nunca lee el resto; PostgreSQL se detiene en el `LIMIT`), los valores se cortan en copias breves a medida que llegan las filas (cada valor bruto se sigue cargando entero antes de cortarse), y las consultas de PostgreSQL tienen un tiempo límite.
4. **Tú**: abre los archivos SQLite en solo lectura; conecta PostgreSQL con un rol que solo pueda leer lo que quieres mostrar — este es el límite real, porque una transacción de solo lectura no impide lo que una función podría hacer fuera de la base de datos (por ejemplo `dblink` o una extensión HTTP). Un rol así puede seguir leyendo el catálogo del sistema (`pg_catalog`) y llamar a las funciones concedidas a `PUBLIC`; revoca las de las extensiones que llegan al exterior (`REVOKE EXECUTE ON FUNCTION dblink(text, text) FROM PUBLIC;`, y similares):

```sql
CREATE ROLE mcp_reader LOGIN PASSWORD 'change-me';
GRANT CONNECT ON DATABASE shop TO mcp_reader;
GRANT USAGE ON SCHEMA public TO mcp_reader;
GRANT SELECT ON customers, orders TO mcp_reader;   -- only what the model may read
ALTER ROLE mcp_reader SET default_transaction_read_only = on;
```

### Archivos completos {#complete-files}

[`examples/mcp-database.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-database.ts) (SQLite, crea una base de datos de tienda de demostración cuando no das ningún archivo) y [`examples/mcp-postgres.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-postgres.ts):

```ts
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
```

### Lo que no hace {#what-it-does-not-do-2}

- **Ninguna escritura**, por diseño. Para permitir que un modelo cambie datos, escribe una herramienta dedicada a ese único cambio, con aprobación.
- **Ningún filtro por tabla dentro de las consultas**: una consulta puede leer todo lo que la conexión puede leer. Usa un rol (PostgreSQL) o una copia del archivo con solo las tablas adecuadas (SQLite); expón vistas en lugar de tablas en bruto.
- **SQLite: la superficie de ataque es la consulta, no el archivo.** Las consultas se ejecutan dentro del proceso de tu servidor, de forma síncrona, sin tiempo límite ni tope de memoria: quien escribe el SQL — el modelo, o quien lo dirija — puede escribir una consulta que no termine nunca (un `WITH` recursivo) o que construya valores enormes, y bloquear o agotar el servidor. Las filas se leen de una en una y cada valor se corta en una copia breve a medida que llega, de modo que el resultado sigue siendo pequeño y los originales pueden liberarse — pero cada valor bruto se carga antes entero, y nada limita el trabajo que hace SQLite para producir una fila. Sirve SQLite para ti o para personas de confianza; no lo expongas por HTTP a clientes que no son de confianza. Ejecutar las consultas en un worker thread que se pueda detener eliminaría este límite; todavía no está hecho.
- **Las funciones de SQLite registradas en la conexión se pueden llamar** desde el SQL del modelo (`db.function(…)`): registra solo funciones inofensivas en una conexión que sirvas.
- **Sin parámetros vinculados**: el modelo escribe los valores en el SQL.
- Si dos columnas de un resultado tienen el mismo nombre, solo se conserva la última: dales alias.
- Otras bases de datos (MySQL, SQL Server…): implementa tú mismo la pequeña interfaz `ReadOnlyDatabase`, y haz que rechace las escrituras por su cuenta. `assertSingleQuery(sql, dialect)` solo entiende la sintaxis de SQLite y PostgreSQL; MySQL (escapes con barra invertida en todas las cadenas, comentarios `#`) necesita su propia comprobación.

## Un agente: tu gemelo de razonamiento {#an-agent-your-reasoning-twin}

**Qué hace.** Expone un agente completo como una sola herramienta. El uso más llamativo: un [agente cognitivo con tu perfil de pensador](./thinker-profiles), para que desde Claude Desktop cualquiera pueda preguntar *"¿qué pensaría Nicolas de pagar por Jev?"* y obtener una respuesta razonada **como razona Nicolas**, con su justificación y lo que todavía falta.

```ts
import { cognitiveAgentTool } from '@sdk-ai-agents/core';

const twin = sdk.createCognitiveAgent({
  name: 'nicolas',
  model: 'gpt-4o-mini',
  profile,                                     // how Nicolas reasons
  limits: { maxSteps: 6, timeoutMs: 50_000 },  // small: MCP clients do not wait forever
});

await serveMcpOverStdio(sdk, {
  name: 'nicolas-twin',
  tools: [cognitiveAgentTool(twin, { name: 'ask_nicolas', description: 'How Nicolas would reason about a question or a decision' })],
});
```

Esta receta necesita una clave de modelo (`createSDK({ apiKey: process.env.OPENAI_API_KEY, … })`): el agente piensa con un modelo de lenguaje.

### Paso 1 — captura cómo razonas {#step-1-—-capture-how-you-reason}

Explica algunos temas con tus propias palabras, destílalos en un perfil una vez, y guárdalo:

```ts
import { writeFileSync } from 'node:fs';

const profile = await sdk.distillThinkerProfile({
  id: 'nicolas',
  name: 'Nicolas',
  model: 'gpt-4o',
  samples: [
    { topic: 'Paying for a typed-decision API', reasoning: 'What does it really allow? Then the limits…', conclusion: 'Try an open clone first' },
    // a few more topics, in your own words
  ],
});
writeFileSync('nicolas.profile.json', JSON.stringify(profile, null, 2));
```

Consulta [Razonar como una persona concreta](./thinker-profiles) para saber qué contiene un perfil y cómo corregirlo con el tiempo.

### Paso 2 — sírvelo {#step-2-—-serve-it}

[`examples/mcp-agent.ts`](https://github.com/nicolashedoire/sdk-ai-agents/blob/main/examples/mcp-agent.ts) carga el perfil desde `PROFILE_FILE` (comprobado contra el esquema del perfil) o usa un ejemplo integrado, y sirve `ask_nicolas`:

```sh
claude mcp add nicolas-twin -e OPENAI_API_KEY=sk-… -e PROFILE_FILE=/path/nicolas.profile.json -- npx -y tsx /path/mcp-agent.ts
```

### Qué ve el modelo y qué recibe {#what-the-model-sees-and-gets-back}

La herramienta acepta `problem` (la pregunta, hasta 4.000 caracteres) y un objeto `context` opcional (hechos y restricciones, hasta 20.000 caracteres en JSON). Devuelve la decisión, no el estado mental completo:

```json
{
  "runId": "run_6c01de53-…",
  "status": "completed",
  "decisionStatus": "committed",
  "answer": "Prototype with the open clone first; pay only if it falls short on real data.",
  "rationale": "…",
  "confidence": 0.78,
  "nextActions": ["Benchmark the clone on 50 real tickets"]
}
```

`decisionStatus` es `committed` (una respuesta firme), `provisional` (la mejor respuesta hasta el momento, con `missing`: lo que no está establecido) o `abstain`. El razonamiento completo se queda en el registro de eventos bajo `runId`: `sdk.getMentalState(runId)` muestra cada hipótesis y cada crítica. Cuando una ejecución falla, `error` solo dice que no se completó y dónde mirar (`exposeErrors: true` pone el propio mensaje en el resultado: puede contener detalles del proveedor).

### Opciones {#options-3}

| Opción | Por defecto | |
| --- | --- | --- |
| `name` | `ask_<agent name>` | El nombre de la herramienta. |
| `description` | genérica | Di cuándo consultar a este agente: el modelo decide a partir de ella. |
| `metadata` | riesgo medio | Metadatos de gobernanza, combinados campo a campo sobre los valores por defecto; añade `requiresApproval: true` para confirmar cada consulta. |
| `maxInputLength` | `4000` | El problema (o el mensaje) más largo que se acepta. |
| `maxContextLength` | `20000` | El `context` más largo, como texto JSON. |
| `exposeErrors` | `false` | Pone en el resultado el mensaje de error de una ejecución fallida. |

`governedAgentTool(agent, options)` hace lo mismo para un agente creado con `sdk.createAgent`: acepta `message` (y `context`) y devuelve `{ runId, status, output, error }`.

### Conviene saber {#good-to-know}

- **Lleva tiempo.** Una ejecución cognitiva hace varias llamadas al modelo: cuenta con decenas de segundos, a veces minutos. Muchos clientes cancelan una llamada al cabo de aproximadamente un minuto (el valor por defecto del SDK oficial de TypeScript es de 60 segundos; Claude Code permite aumentarlo con `MCP_TOOL_TIMEOUT`). Mantén los `limits` pequeños para un uso interactivo, salvo que tu cliente reinicie su tiempo límite con las [notificaciones de progreso](./mcp-deploy#progress-notifications): cada paso del agente envía una. **Cuando el cliente se rinde, la ejecución se detiene** (tanto en los agentes cognitivos como en los gobernados) y se registra como cancelada: no se hacen más llamadas al modelo, y se cancela cualquier aprobación que el agente estuviera esperando.
- **Cuesta dinero**: cada consulta son varias llamadas al modelo. Ponle un [presupuesto](./mcp-deploy#governance-policies-budgets-approvals) y consulta `sdk.getRunCost(runId)`.
- **Imita una forma de razonar, no lo que sabe la persona.** El gemelo sabe lo que hay en el perfil, la pregunta y el contexto — no la memoria de la persona. Trata sus respuestas como "cómo abordaría esto", y deja que la persona real lo corrija con `learnFromFeedback`.

## Varias fuentes en un solo servidor {#several-sources-in-one-server}

Combina las fuentes con prefijos para que los nombres nunca choquen:

```ts
await serveMcpOverStdio(sdk, {
  name: 'company',
  tools: [
    ...(await openApiTools({ spec: './crm-openapi.json', prefix: 'crm_', headers })),
    ...folderTools({ root: '/srv/handbook', prefix: 'handbook_' }),
    ...databaseTools({ database: sqliteReadOnly(db), prefix: 'shop_' }),
    'find_colleague', // a tool you defined yourself
  ],
  resources: folderResources({ root: '/srv/handbook' }),
});
```

Dos herramientas con el mismo nombre se rechazan al arrancar, con un mensaje que dice cuál.

## Las mismas herramientas en tus propios agentes {#the-same-tools-in-your-own-agents}

Las fuentes son simples definiciones de herramientas: tus agentes pueden usarlas sin MCP.

```ts
const tools = (await openApiTools({ spec: './crm-openapi.json' })).map((definition) => sdk.defineTool(definition));
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools });
```

Se aplican las mismas reglas: las operaciones de escritura que enumeraste esperan una aprobación, y cada llamada se comprueba y se registra.

Siguiente: [desplegar, proteger y resolver problemas](./mcp-deploy).
