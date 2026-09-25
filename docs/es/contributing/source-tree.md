# Árbol de código fuente

## Visión general {#overview}

El SDK está organizado en una estructura modular clara con separación de responsabilidades. El código fuente principal está en `src/`, con subcarpetas para cada dominio funcional.

## Estructura de directorios completa {#complete-directory-structure}

```
sdk-ai-agents/
├── src/
│   ├── sdk.ts                  # createSDK and the SDK facade
│   ├── agent.ts                # Governed agent (run loop)
│   ├── index.ts                # Public exports
│   ├── mcp.ts                  # Entry point of @sdk-ai-agents/core/mcp
│   ├── cognition/              # Cognitive agents: mental state, operations, controllers, profiles
│   ├── decisions/              # Typed decisions (Jev client, DecisionService)
│   ├── study/                  # Studies: charter, passages, guardian, claim statuses, dossier
│   ├── engines/                # Reasoning, action, policy and replay engines
│   ├── stores/                 # Event stores (file, SQLite, PostgreSQL)
│   ├── providers/              # LLM providers (OpenAI, Anthropic, fallback)
│   ├── managers/               # Approvals, budgets, golden traces, regressions
│   ├── registry/               # Tool and capability registries
│   ├── costs/                  # Pricing tables and run costs
│   ├── resilience/             # Retry policy and retrying provider
│   ├── incidents/              # Incident detection and notifiers
│   ├── mcp/                    # MCP server (tools and resources) and client
│   ├── tools/                  # Tool sources: OpenAPI, folder, read-only database, agents, the Web
│   ├── evaluators/             # Policy condition evaluation
│   ├── errors/                 # Error classes
│   ├── types/                  # Shared type definitions
│   ├── utils/                  # Helpers (ids, HTTP, trace analysis)
│   └── __tests__/              # Vitest suites and their in-memory test doubles (support/)
├── benchmarks/                 # Performance tests
├── docs/                       # This documentation (VitePress)
├── examples/                   # Runnable examples
├── templates/starter-template/ # Starter project using the SDK
└── .github/workflows/          # CI and documentation deployment
```

## Directorios clave {#critical-directories}

### `src/engines/` {#src-engines}

**Finalidad:** contiene los motores principales del SDK que orquestan el ciclo de vida de un agente.

**Contiene:**
- `reasoning-engine.ts`: genera intenciones a partir del LLM (sin efectos secundarios)
- `action-engine.ts`: ejecuta las intenciones tras su validación por el motor de políticas
- `policy-engine.ts`: valida las intenciones contra las políticas configuradas
- `replay-engine.ts`: repite ejecuciones a partir de los eventos persistidos

**Puntos de entrada:** los usan `AgentImpl` y `SDKImpl`

**Integración:** los motores se inyectan en `AgentImpl` y `SDKImpl` a través del constructor

### `src/stores/` {#src-stores}

**Finalidad:** implementaciones de la interfaz `IEventStore` para la persistencia de eventos.

**Contiene:**
- `event-store.ts`: interfaz común `IEventStore`
- `file-event-store.ts`: implementación basada en archivos (MVP)
- `sql-event-store.ts`: implementación SQL genérica
- `sqlite-event-store.ts`: implementación para SQLite
- `postgresql-event-store.ts`: implementación para PostgreSQL con JSONB
- `observed-event-store.ts`: entrega en tiempo real cada evento añadido a sus listeners (`onEvent`, `sdk.subscribe`)

**Puntos de entrada:** los usan `SDKImpl` y `ReplayEngine`

**Integración:** se inyecta en `SDKImpl` a través de la configuración

### `src/providers/` {#src-providers}

**Finalidad:** implementaciones de la interfaz `LLMProvider` para distintos proveedores de LLM.

**Contiene:**
- `llm-provider.ts`: interfaz común `LLMProvider`
- `openai-provider.ts`: implementación para OpenAI
- `anthropic-provider.ts`: implementación para Anthropic
- `fallback-provider.ts`: proveedor con conmutación automática a un proveedor de reserva
- `provider-factory.ts`: fábrica para crear los proveedores

**Puntos de entrada:** los usa `ReasoningEngine`

**Integración:** se inyecta en `ReasoningEngine` a través del constructor

### `src/managers/` {#src-managers}

**Finalidad:** clases de gestión para las funcionalidades avanzadas (aprobaciones, presupuestos, pruebas, etc.).

**Contiene:**
- `approval-manager.ts`: gestión de las aprobaciones humanas
- `budget-tracker.ts`: seguimiento de presupuestos y consumo
- `golden-trace-manager.ts`: gestión de las trazas de referencia
- `regression-test-manager.ts`: gestión de las baterías de pruebas de regresión
- `assertion-manager.ts`: gestión de las aserciones de comportamiento
- `impact-analysis-manager.ts`: gestión de los análisis de impacto

**Puntos de entrada:** los usan `SDKImpl` y `PolicyEngine`

**Integración:** se inyectan en `SDKImpl` y `PolicyEngine` a través del constructor

### `src/registry/` {#src-registry}

**Finalidad:** registros para gestionar las herramientas y las capacidades disponibles.

**Contiene:**
- `tool-registry.ts`: gestión de las herramientas disponibles (denegado por defecto)
- `capability-registry.ts`: gestión de las capacidades (grupos de herramientas)

**Puntos de entrada:** los usan `SDKImpl` y `ActionEngine`

**Integración:** se inyectan en `SDKImpl` y `ActionEngine` a través del constructor

### `src/types/` {#src-types}

**Finalidad:** definiciones TypeScript de todos los tipos del SDK.

**Contiene:**
- Tipos para Agent, Tool, Policy, Event, Run, SDK
- Tipos para las funcionalidades avanzadas (Reasoning Graph, Alternatives, etc.)
- Tipos para las pruebas (Golden Trace, Regression, Assertion, etc.)

**Puntos de entrada:** los importan todos los módulos

**Integración:** se usan en todo el código fuente para la seguridad de tipos

### `src/utils/` {#src-utils}

**Finalidad:** funciones de utilidad y helpers.

**Contiene:**
- `constants.ts`: constantes globales
- `id.ts`: generación de identificadores únicos
- `zod-to-json-schema.ts`: conversión de Zod a JSON Schema
- Utilidades para Reasoning Graph, Alternatives, Patterns, etc.
- Utilidades para las pruebas (Validation, Regression, Assertion, etc.)

**Puntos de entrada:** los importan los módulos que los necesitan

**Integración:** los usan los motores, los gestores y otros módulos

### `src/cognition/` (v0.2) {#src-cognition-v0-2}

**Finalidad:** agentes cognitivos — estado mental explícito, operaciones cognitivas, controladores, perfiles de pensador.

**Contiene:** `cognitive-agent.ts` (bucle de ejecución), `operation-selector.ts`, `operation-performer.ts`, `cognitive-controller.ts` (heurístico), `typed-decision-controller.ts` (Jev), `hypothesis-assessor.ts`, `information-seeker.ts`, `llm-thought-generator.ts` y `thought-prompts.ts`, `mental-state.ts` (esquemas y tipos), `mental-state-reducer.ts` y `hypothesis-transitions.ts`, `mental-state-replay.ts`, `thinker-profile.ts`, `profile-distiller.ts`, `create-cognitive-agent.ts`.

### `src/study/` {#src-study}

**Finalidad:** los estudios (`sdk.createStudy`) — un investigador que comprende un objeto y después propone cómo rediseñarlo, separado del motor cognitivo.

**Contiene:** `study.ts` (la clase `Study`: ejecuciones, guardián, enmiendas, búsqueda de lo existente), `passages.ts` (los siete pasajes, sus colecciones y sus esquemas), `study-config.ts` (configuración, carta congelada y su huella), `study-prompts.ts` y `study-replies.ts` (prompts reconstruidos en cada llamada, respuestas leídas contra sus esquemas), `study-claims.ts` (estados de las afirmaciones comprobados en el código), `study-sources.ts` (fuentes, parámetros de consulta, resultados), `study-model.ts` y `study-run.ts` (llamadas al modelo, límites, eventos), `study-report.ts`, `study-markdown.ts` y `study-labels.ts` (el informe, y el dosier en once idiomas), `study-types.ts`.

### `src/decisions/` (v0.2) {#src-decisions-v0-2}

**Finalidad:** decisiones tipadas — el contrato Noul/Choice/Score, el cliente HTTP de TypeSafe Jev y el `DecisionService` que hay detrás de `sdk.decisions`.

### `src/costs/`, `src/resilience/`, `src/incidents/` (v0.2) {#src-costs-src-resilience-src-incidents-v0-2}

**Finalidad:** precios e informes de coste por ejecución; política de reintentos y proveedor de LLM con reintentos; reglas de incidentes, notificadores (correo electrónico, webhook, Resend) y el almacén de eventos monitorizado.

### `src/mcp/` y `src/mcp.ts` (v0.2) {#src-mcp-and-src-mcp-ts-v0-2}

**Finalidad:** servidor MCP que expone herramientas y recursos gobernados (`mcp-server.ts`, `mcp-resources.ts`, `governed-tool-host.ts`) y cliente MCP que importa herramientas (`mcp-client.ts`). Se publica como el punto de entrada `@sdk-ai-agents/core/mcp` para que el núcleo no dependa de `@modelcontextprotocol/sdk`.

### `src/tools/` {#src-tools}

**Finalidad:** fuentes de herramientas que construyen `ToolDefinition` a partir de un sistema, sin depender de MCP: `openapi-spec.ts` / `openapi-call.ts` / `openapi-tools.ts` (API web), `folder-access.ts` / `folder-tools.ts` / `glob-pattern.ts` (carpetas y recursos), `sql-statement-guard.ts` / `database-tools.ts` / `sqlite-read-only.ts` / `postgres-read-only.ts` / `sql-values.ts` (bases de datos de solo lectura), `agent-tools.ts` (agentes como herramientas), además de `tool-names.ts` y `bounded-text.ts`. `web/` contiene las herramientas de investigación web: `web-tools.ts` (`webTools`), `guarded-http.ts` e `ip-ranges.ts` (el cliente HTTP y sus comprobaciones de dirección, redirección, tamaño y tiempo), `robots.ts` y `politeness.ts` (robots.txt, ritmo por host), `web-cache.ts`, `results.ts` (resultados citables), `html-parser.ts` / `html-to-markdown.ts` / `html-entities.ts` (páginas a Markdown), `pdf-text.ts` (PDF con el paquete opcional `unpdf`), `web-fetch.ts`, `search-chain.ts` y `providers/` (DuckDuckGo, SearXNG, Brave, Tavily, Serper), `sources/` (arXiv, Wikipedia, GitHub).

### `src/__tests__/support/` {#src-tests-support}

**Finalidad:** dobles de prueba que implementan los puertos del SDK (proveedor de LLM guionizado, cliente de decisiones en memoria, servidor HTTP local, cliente PostgreSQL que registra las operaciones, cargador de `node:sqlite`) — sin mocks de módulos.

## Puntos de entrada {#entry-points}

### Entrada principal {#main-entry}

- **`src/index.ts`**: punto de entrada público del SDK, exporta todas las API públicas

### Puntos de entrada de la aplicación {#application-entry-points}

- **`src/sdk.ts`**: implementación principal del SDK (`SDKImpl`)
- **`src/agent.ts`**: implementación del agente (`AgentImpl`)

## Patrones de organización de los archivos {#file-organization-patterns}

### Convenciones de nombres {#naming-conventions}

- **Archivos**: kebab-case para los archivos (p. ej., `reasoning-engine.ts`)
- **Clases**: PascalCase (p. ej., `ReasoningEngine`)
- **Interfaces**: PascalCase con el prefijo `I` cuando hace falta (p. ej., `IEventStore`)
- **Tipos**: PascalCase (p. ej., `EventType`, `RunStatus`)
- **Funciones**: camelCase (p. ej., `generateCompletion`)

### Organización de los módulos {#module-organization}

- **Una clase o interfaz por archivo**: cada archivo contiene una clase o una interfaz principal
- **Tipos colocalizados**: tipos asociados en el mismo archivo o en `types/`
- **Barrel exports**: `index.ts` para exportar las API públicas

## Archivos de configuración {#configuration-files}

- **`package.json`**: dependencias y scripts de npm
- **`tsconfig.json`**: configuración de TypeScript (modo estricto, ESM)
- **`biome.json`**: configuración de Biome (linting/formateo)
- **`vitest.config.ts`**: configuración de Vitest (pruebas)

## Notas para el desarrollo {#notes-for-development}

### Añadir funcionalidades nuevas {#adding-new-features}

1. **Motor nuevo**: créalo en `src/engines/`, inyéctalo en `SDKImpl` o en `AgentImpl`
2. **Almacén nuevo**: implementa `IEventStore` en `src/stores/`
3. **Proveedor nuevo**: implementa `LLMProvider` en `src/providers/`
4. **Gestor nuevo**: créalo en `src/managers/`, inyéctalo en `SDKImpl`
5. **Tipos nuevos**: añádelos a `src/types/`, expórtalos desde `types/index.ts`

### Pruebas {#testing}

- Pruebas unitarias en `src/__tests__/`
- Un archivo de pruebas por módulo fuente
- Usa Vitest para las pruebas

### Compilación {#build}

- TypeScript compila `src/` → `dist/`
- Se generan source maps para la depuración
- Se generan las declaraciones de TypeScript (`.d.ts`)
