# Guía de desarrollo

## Requisitos previos {#prerequisites}

### Obligatorios {#required}

- **Node.js**: 20.0.0+ (LTS)
- **npm**: incluido con Node.js
- **TypeScript**: 5.3.2+ (instalado localmente con npm)

### Opcionales {#optional}

- **PostgreSQL**: 8.11.0+ (para PostgreSQLEventStore, dependencia peer)
- **Git**: para el control de versiones

## Configuración del entorno {#environment-setup}

### 1. Clonar el repositorio {#_1-clone-repository}

```bash
git clone https://github.com/nicolashedoire/sdk-ai-agents.git
cd sdk-ai-agents
```

### 2. Instalar las dependencias {#_2-install-dependencies}

```bash
npm install
```

### 3. Configurar las variables de entorno {#_3-configure-environment-variables}

Crea un archivo `.env` en la raíz (opcional, para los ejemplos):

```bash
OPENAI_API_KEY=your-openai-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## Desarrollo local {#local-development}

### Compilar {#build}

Compila el TypeScript:

```bash
npm run build
```

El código compilado estará en `dist/`.

### Modo watch {#watch-mode}

Compila en modo watch (recompilación automática):

```bash
npm run dev
```

### Ejecutar los ejemplos {#run-examples}

```bash
# Quick start example
npm run example:quick-start

# Complete example
npm run example:complete

# Test API
npm run test:api
```

## Pruebas {#testing}

### Ejecutar todas las pruebas {#run-all-tests}

```bash
npm test
```

### Modo watch {#watch-mode-1}

```bash
npm run test:watch
```

### Cobertura {#coverage}

```bash
npm run test:coverage
```

### Ejecutar un archivo de pruebas concreto {#run-specific-test-file}

```bash
npx vitest src/__tests__/agent.test.ts
```

## Calidad del código {#code-quality}

### Linting {#linting}

```bash
# Check for linting issues
npm run lint

# Fix linting issues automatically
npm run lint:fix
```

### Formateo {#formatting}

```bash
# Format code
npm run format
```

### Comprobación completa (lint + formateo) {#full-check-lint-format}

```bash
# Check everything
npm run check

# Fix everything automatically
npm run check:fix
```

## Tareas de desarrollo habituales {#common-development-tasks}

### Añadir una herramienta nueva {#adding-a-new-tool}

1. Define la herramienta con `sdk.defineTool()`:

```typescript
const myTool = sdk.defineTool({
  name: 'my-tool',
  description: 'Description of my tool',
  schema: z.object({
    // Zod schema
  }),
  handler: async (params) => {
    // Tool implementation
  }
});
```

2. Añade la herramienta a un agente:

```typescript
const agent = sdk.createAgent({
  name: 'my-agent',
  model: 'gpt-5.4',
  tools: [myTool]
});
```

### Añadir una política nueva {#adding-a-new-policy}

1. Define la política:

```typescript
const myPolicy: Policy = {
  id: 'my-policy',
  type: 'custom',
  rules: [{
    condition: 'toolName === "dangerous-tool"',
    action: 'require_approval'
  }],
  scope: 'global',
  enabled: true
};
```

2. Aplica la política:

```typescript
sdk.defineGlobalPolicy(myPolicy);
```

### Añadir un almacén de eventos nuevo {#adding-a-new-event-store}

1. Implementa `IEventStore`:

```typescript
export class MyEventStore implements IEventStore {
  async append(runId: string, event: Event): Promise<void> {
    // Implementation
  }
  
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    // Implementation
  }
  
  // ... other methods
}
```

2. Úsalo en el SDK:

```typescript
const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  eventStore: new MyEventStore()
});
```

### Añadir un proveedor de LLM nuevo {#adding-a-new-llm-provider}

1. Implementa `LLMProvider`:

```typescript
export class MyProvider implements LLMProvider {
  async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
    // Implementation
  }
  
  supportsModel(model: string): boolean {
    // Implementation
  }
  
  getProviderName(): string {
    return 'my-provider';
  }
}
```

Para transmitir el texto en streaming (una ejecución con `onText`), llama a `request.onTextDelta` con cada fragmento a medida que tu modelo lo escribe, y devuelve igualmente la respuesta completa. Un proveedor que no admite streaming lo ignora: el SDK pasa entonces el texto de una sola vez.

```typescript
async generateCompletion(request: LLMRequest): Promise<LLMResponse> {
  let content = '';
  for await (const piece of myModel.stream(request.messages, { signal: request.abortSignal })) {
    content += piece;
    request.onTextDelta?.(piece);
  }
  return { content, model: 'my-model' };
}
```

2. Añádelo a `ProviderFactory`:

```typescript
// In provider-factory.ts
case 'my-provider':
  return new MyProvider(config.apiKey, config.defaultModel);
```

## Proceso de compilación {#build-process}

### Compilación de TypeScript {#typescript-compilation}

La compilación usa directamente el compilador de TypeScript:

```bash
tsc
```

Configuración en `tsconfig.json`:
- **Target**: ES2022
- **Module**: ESNext
- **Module Resolution**: node
- **Modo estricto**: activado
- **Source maps**: activados
- **Archivos de declaración**: activados

### Estructura de la salida {#output-structure}

```
dist/
├── index.js              # Entry point
├── index.d.ts            # Type declarations
├── agent.js
├── agent.d.ts
├── sdk.js
├── sdk.d.ts
└── ...                   # Other compiled files
```

## Estrategia de pruebas {#testing-strategy}

### Pruebas unitarias {#unit-tests}

- Pruebas unitarias para cada módulo
- Usa Vitest
- Ninguna prueba llama a un servicio de pago real, y ninguna usa mocks de módulos ni espías: los puertos del SDK los implementan los dobles de prueba de `src/__tests__/support/`, y los adaptadores HTTP, incluidos los proveedores de OpenAI y Anthropic, se ejecutan contra servidores locales. `no-mocks.test.ts` rechaza `vi.mock`, `vi.fn` y `vi.spyOn`

### Pruebas de integración {#integration-tests}

- Pruebas de integración de flujos de trabajo completos
- El modelo es un proveedor guionizado, o el cliente real de OpenAI o Anthropic hablando con un servidor local que responde en el formato del proveedor; ninguna prueba llama a una API real
- Pruebas con distintos almacenes de eventos

### Ejemplo de estructura de una prueba {#example-test-structure}

```typescript
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class';

describe('MyClass', () => {
  it('should do something', () => {
    const instance = new MyClass();
    expect(instance.method()).toBe(expected);
  });
});
```

## Depuración {#debugging}

### Source maps {#source-maps}

Los source maps se generan automáticamente durante la compilación. Te permiten depurar directamente el código TypeScript.

### Depuración en VS Code {#vs-code-debugging}

Configuración de `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "test"],
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

## Estilo de código {#code-style}

### Buenas prácticas de TypeScript {#typescript-best-practices}

- **Modo estricto**: siempre activado
- **Seguridad de tipos**: usa tipos explícitos
- **Nada de `any`**: evita `any`, usa `unknown` si es necesario
- **Interfaces frente a tipos**: prefiere las interfaces para los objetos, y los tipos para las uniones e intersecciones

### Convenciones de nombres {#naming-conventions}

- **Archivos**: kebab-case (`my-file.ts`)
- **Clases**: PascalCase (`MyClass`)
- **Funciones**: camelCase (`myFunction`)
- **Constantes**: UPPER_SNAKE_CASE (`MY_CONSTANT`)
- **Tipos/interfaces**: PascalCase (`MyType`)

### Organización del código {#code-organization}

- **Una clase o interfaz por archivo**
- **Tipos colocalizados**: tipos en el mismo archivo o en `types/`
- **Barrel exports**: `index.ts` para las exportaciones públicas

## Problemas habituales {#common-issues}

### Errores de TypeScript {#typescript-errors}

Si obtienes errores de TypeScript:

1. Comprueba que `tsconfig.json` es correcto
2. Comprueba que todas las dependencias están instaladas
3. Limpia y vuelve a compilar: `npm run clean && npm run build`

### Pruebas que fallan {#test-failures}

Si fallan las pruebas:

1. Comprueba que los dobles de prueba de `src/__tests__/support/` siguen coincidiendo con las interfaces que sustituyen
2. Comprueba que las dependencias están actualizadas
3. Ejecuta las pruebas en modo watch para ver los errores en tiempo real

### Errores de compilación {#build-errors}

Si falla la compilación:

1. Revisa los errores de TypeScript: `npm run build`
2. Revisa los errores de lint: `npm run lint`
3. Limpia la carpeta `dist/`: `npm run clean`

## Proceso de publicación {#release-process}

Las versiones se publican en npm con el flujo de trabajo `Release` cuando se sube una etiqueta de versión: los pasos están en la página [Publicar una versión](./releasing).

### Versionado {#versioning}

El proyecto usa el versionado semántico (SemVer):
- **MAJOR**: cambios incompatibles
- **MINOR**: nuevas funcionalidades compatibles con versiones anteriores
- **PATCH**: correcciones de errores compatibles con versiones anteriores

Mientras la versión empiece por `0.`, un cambio incompatible sube MINOR en su lugar (`0.2.0` → `0.3.0`) y cualquier otro cambio PATCH: consulta [Publicar una versión](./releasing#release-a-version).

### Lista de comprobación previa a la publicación {#pre-release-checklist}

- [ ] Todas las pruebas pasan
- [ ] Código revisado con lint y formateado
- [ ] Documentación actualizada
- [ ] CHANGELOG.md actualizado
- [ ] Versión actualizada en `package.json`
- [ ] Versión mostrada en la documentación actualizada (`const version` en `docs/.vitepress/config.mts`)

### Compilar para publicar {#build-for-release}

```bash
# The checks of the CI but coverage and the docs build, on a fresh dist/
# (what prepublishOnly runs before npm publish)
npm run clean && npm run verify

# The files that would be published
npm pack --dry-run
```

## Recursos {#resources}

- **Documentación**: `docs/`
- **Ejemplos**: `examples/`
- **Definiciones de tipos**: `src/types/`
- **Pruebas**: `src/__tests__/`

## Sitio de documentación {#documentation-site}

La documentación es un sitio VitePress en `docs/`, ilustrado con SVG en `docs/public/images/`.

```bash
npm run docs:dev      # local preview with hot reload
npm run docs:build    # static build in docs/.vitepress/dist
npm run docs:preview  # serve the build
```

El flujo de trabajo `Docs` de GitHub Actions lo publica en GitHub Pages con cada push a `main`.
