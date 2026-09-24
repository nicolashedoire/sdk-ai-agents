# Tu primer servidor MCP en 5 minutos

Vamos a construir un servidor MCP diminuto que responde a "¿quién se encarga de la facturación?" a partir de una lista del equipo, a probarlo sin ninguna IA, y después a conectarlo a Claude Desktop y a Claude Code. Se dan todos los comandos; no se da nada por supuesto. Si una palabra no está clara, consulta [MCP en palabras sencillas](./mcp).

## Qué necesitas {#what-you-need}

- **Node.js 20.11 o posterior** — compruébalo con `node --version`. (La receta de SQLite necesita 22.13+. La documentación del MCP Inspector pide 22.19+.)
- Un terminal.
- Para usar el servidor desde una aplicación de IA: [Claude Desktop](https://claude.ai/download) o [Claude Code](https://code.claude.com/docs). No hace falta para los primeros pasos.

No se necesita ninguna clave de API: este servidor no llama a ningún modelo de lenguaje. La aplicación de IA que lo usa tiene la suya.

## 1. Crear el proyecto {#_1-create-the-project}

```sh
mkdir my-mcp-server
cd my-mcp-server
npm init -y
npm pkg set type=module
npm install github:nicolashedoire/sdk-ai-agents zod@^3.25.28 @modelcontextprotocol/sdk@^1.30.0
npm install --save-dev tsx
```

Qué hace cada línea:

| Comando | Por qué |
| --- | --- |
| `npm init -y` | Crea `package.json`, el archivo que enumera las dependencias de tu proyecto. |
| `npm pkg set type=module` | Usa los módulos modernos de JavaScript (`import`). El SDK lo requiere. |
| `npm install github:nicolashedoire/sdk-ai-agents …` | Instala este SDK (todavía no está en npm, así que desde GitHub; se compila solo), zod (para describir los argumentos) y el SDK oficial de MCP, versión 1.30 o posterior dentro de la 1.x (la versión con la que se prueba este SDK). |
| `npm install --save-dev tsx` | Ejecuta directamente archivos TypeScript, sin paso de compilación. |

## 2. Escribir el servidor {#_2-write-the-server}

Crea un archivo llamado `server.ts`:

```ts
import { join } from 'node:path';
import { FileEventStore, createSDK } from '@sdk-ai-agents/core';
import { serveMcpOverStdio } from '@sdk-ai-agents/core/mcp';
import { z } from 'zod';

// 1. The data your tool reads. A real server would call an API or a database here.
const team = [
  { name: 'Ada', role: 'Billing', email: 'ada@example.com' },
  { name: 'Linus', role: 'Infrastructure', email: 'linus@example.com' },
  { name: 'Grace', role: 'Customer support', email: 'grace@example.com' },
];

// 2. The SDK. No model key: this server does not call a language model itself.
//    The event log (one file per call) is written next to this file, in events/.
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

// 3. One tool: a name, a description the model reads, its arguments, and the code.
sdk.defineTool({
  name: 'find_colleague',
  description: 'Finds who is in charge of a topic in the team (billing, infrastructure, support…)',
  schema: z.object({
    topic: z.string().describe('What the person is in charge of, for example "billing"'),
  }),
  metadata: { readOnly: true },
  handler: async ({ topic }) =>
    team.filter((person) => person.role.toLowerCase().includes(topic.toLowerCase())),
});

// 4. Serve it. Only the tools listed here are visible to AI applications.
await serveMcpOverStdio(sdk, { name: 'team', tools: ['find_colleague'] });
```

Léelo de arriba abajo:

1. **Los datos** — aquí una lista en el propio archivo; en la vida real, tu API, tus archivos o tu base de datos.
2. **El SDK** — hace pasar cada llamada por el circuito gobernado y la escribe en el registro de eventos. El registro se guarda junto al archivo (`import.meta.dirname`) porque las aplicaciones de IA inician los servidores desde un directorio de trabajo que no eliges tú.
3. **La herramienta** — el **nombre** y la **descripción** son lo que lee el modelo para decidir cuándo llamarla, así que escríbelos para un lector que no sabe nada de tu código. El **esquema** enumera los argumentos; el SDK lo convierte en el JSON Schema que ven los clientes MCP, y rechaza las llamadas que no encajan. `readOnly: true` indica a los clientes que la herramienta no cambia nada.
4. **El servidor** — `serveMcpOverStdio` habla MCP a través de la entrada y la salida estándar. La lista `tools` es obligatoria: una herramienta que no enumeraste nunca es visible, aunque esté definida.

## 3. Ejecutarlo {#_3-run-it}

```sh
npx tsx server.ts
```

Deberías ver esto, y nada más:

```text
MCP server "team" ready on stdio, waiting for a client
```

**Parece que se ha quedado bloqueado — es normal.** Un servidor stdio espera a que una aplicación de IA le hable a través de su entrada. Pulsa <kbd>Ctrl</kbd>+<kbd>C</kbd> para detenerlo. Rara vez lo iniciarás tú: lo hace la aplicación de IA.

::: danger Nunca imprimas en stdout
En un servidor stdio, la salida estándar **es** el protocolo. Un `console.log` en tu código corrompe los mensajes y el cliente se desconecta. Usa `console.error` para tus propios mensajes: va a la salida de error estándar, que los clientes guardan en sus logs.
:::

## 4. Probarlo con el MCP Inspector {#_4-test-it-with-the-mcp-inspector}

El [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) es la herramienta de prueba oficial: una página web (o una línea de comandos) que actúa como cliente MCP, para que puedas probar tu servidor sin ninguna IA. Su documentación pide Node.js 22.19 o posterior (comprobado el 2026-09-24).

```sh
npx @modelcontextprotocol/inspector npx tsx server.ts
```

El comando imprime una dirección con un token de un solo uso; ábrela en tu navegador, haz clic en **Connect**, abre **Tools**, haz clic en **List Tools**, elige `find_colleague`, escribe `billing` y ejecútala. Obtienes a Ada.

¿Prefieres el terminal? Las mismas comprobaciones desde la línea de comandos:

```sh
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/list
npx @modelcontextprotocol/inspector --cli npx tsx server.ts --method tools/call --tool-name find_colleague --tool-arg topic=billing
```

Todo lo que va después de `inspector` (o después de `--cli`) es el comando que inicia tu servidor.

## 5. Conectarlo a Claude Desktop {#_5-connect-it-to-claude-desktop}

Claude Desktop lee los servidores que debe iniciar de un archivo de configuración. Ábrelo desde la aplicación: **menú Claude → Settings… → Developer → Edit Config**. El archivo es:

| Sistema | Ruta |
| --- | --- |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Añade tu servidor en `mcpServers`, con la **ruta absoluta** de `server.ts` (ejecuta `pwd` en la carpeta del proyecto para obtenerla; en Windows, `cd`):

::: code-group

```json [macOS]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "/Users/you/my-mcp-server/server.ts"]
    }
  }
}
```

```json [Windows]
{
  "mcpServers": {
    "team": {
      "command": "npx",
      "args": ["-y", "tsx", "C:\\Users\\you\\my-mcp-server\\server.ts"]
    }
  }
}
```

:::

Después, **cierra Claude Desktop por completo y vuelve a abrirlo**: solo lee el archivo al arrancar. Tu servidor aparece en la lista de conectores (el botón "+" del cuadro de mensaje, luego **Connectors**). Pregunta: *"¿Quién se encarga de la facturación en mi equipo?"* — Claude te pide permiso para usar `find_colleague` y después responde "Ada".

Si no aparece:

- comprueba el JSON (basta con que falte una coma para romperlo) y que la ruta sea absoluta;
- si el log dice que no se encuentra `npx` o `node` (algo habitual cuando Node.js se instaló con nvm), sustituye `"npx"` por la ruta completa que da `which npx` (macOS) o `where npx` (Windows);
- lee los logs: `~/Library/Logs/Claude/mcp*.log` en macOS, `%APPDATA%\Claude\logs\mcp*.log` en Windows. `mcp-server-team.log` contiene lo que tu servidor escribió en la salida de error estándar.

Estas rutas y estos menús proceden de la documentación de MCP ([Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers)) de septiembre de 2026; consulta esa página si Claude Desktop ha cambiado.

## 6. Conectarlo a Claude Code {#_6-connect-it-to-claude-code}

Un solo comando, desde cualquier carpeta (sustituye la ruta):

```sh
claude mcp add team -- npx -y tsx /Users/you/my-mcp-server/server.ts
```

- Todo lo que va después de `--` es el comando que inicia tu servidor.
- El servidor se añade solo para el proyecto actual (`--scope local`, el valor por defecto). Usa `--scope user` para todos tus proyectos, o `--scope project` para escribirlo en un archivo `.mcp.json` que puedes versionar y compartir.
- Variables de entorno (por ejemplo un token de API que necesita tu servidor): `claude mcp add team -e API_TOKEN=… -- npx -y tsx /path/server.ts`.
- Compruébalo con `claude mcp list`, o escribe `/mcp` dentro de Claude Code.

Comprobado el 2026-09-24 con `claude mcp add --help` (Claude Code 2.1.173) y la [documentación de MCP de Claude Code](https://code.claude.com/docs/en/mcp).

## 7. Otras aplicaciones {#_7-other-applications}

La mayoría de las aplicaciones MCP piden las mismas tres cosas: un **comando** (`npx`), sus **argumentos** (`-y`, `tsx`, la ruta absoluta de `server.ts`) y unas **variables de entorno** opcionales. Consulta su documentación, por ejemplo la de [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers) o la de [Cursor](https://cursor.com/docs/context/mcp).

## 8. Ver qué ha pasado {#_8-see-what-happened}

Cada llamada se escribe en el registro de eventos: abre la carpeta `events/` que está junto a `server.ts`. Cada archivo es una llamada — una **ejecución** de la identidad `mcp:team` — con sus pasos:

```text
run.started       → the call arrived
action.executing  → the call is being handled
policy.checked    → the rules were checked
tool.called       → the tool ran, with its arguments
action.executed   → its result
run.completed
```

Las mismas ejecuciones se pueden leer, repetir, valorar en coste y convertir en alertas con el resto del SDK: consulta [Trazabilidad y repetición](./observability).

## Adónde ir ahora {#where-to-go-next}

- Sustituye la lista del equipo por algo real: [una API web, una carpeta, una base de datos o un agente — una línea para cada uno](./mcp-recipes).
- Comparte el servidor con tu equipo por HTTP, añade aprobaciones y presupuestos: [Desplegar, proteger y resolver problemas](./mcp-deploy).
