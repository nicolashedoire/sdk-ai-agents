# Arquitectura

![Arquitectura del SDK](/images/architecture.svg){.illustration}

## Capa cognitiva (v0.2) {#cognitive-layer-v0-2}

La versión 0.2 añade una capa de razonamiento sobre el runtime gobernado que se describe más abajo. Está construida a partir de piezas pequeñas y sustituibles:

| Pieza | Módulo | Responsabilidad |
| --- | --- | --- |
| `CognitiveAgent` | `src/cognition/cognitive-agent.ts` | Bucle de ejecución, cancelación, tiempo límite, retroalimentación |
| `OperationSelector` | `src/cognition/operation-selector.ts` | Calcula las operaciones disponibles, pregunta al controlador, fuerza la decisión final |
| Controladores | `src/cognition/cognitive-controller.ts`, `typed-decision-controller.ts` | Elección de la siguiente operación, heurística o basada en Jev |
| `OperationPerformer` | `src/cognition/operation-performer.ts` | Delega en el generador de pensamientos, el buscador de información, el probador de predicciones o el valorador |
| Admisión de parches | `src/cognition/patch-admission.ts`, `thought-fields.ts`, `thought-patch.ts` | Entrada única de cada pensamiento: campos permitidos por operación, campos reservados al motor, resolución de la decisión |
| Evidencia | `src/cognition/observation-records.ts`, `evidence-transitions.ts`, `contradiction-transitions.ts` | Procedencia de las observaciones, revisiones de hechos, comparaciones, resultados de pruebas, contradicciones y sus resoluciones |
| Vista del estado | `src/cognition/mental-state-view.ts` | Vista compacta del estado para los prompts de pensamiento y los conjuntos de datos del controlador: preparación, clasificación, experimentos ya realizados |
| `PredictionTester` | `src/cognition/outcome-evaluator.ts` | Ejecuta tu `OutcomeEvaluator` sobre una predicción pendiente y registra el informe |
| Guarda de conclusión | `src/cognition/decision-readiness.ts` | Clasificación, comprobación de preparación, en firme / provisional / abstención |
| `LLMThoughtGenerator` | `src/cognition/llm-thought-generator.ts`, `thought-prompts.ts` | Un prompt por operación, JSON estricto, validación Zod, una reparación |
| `InformationSeeker` | `src/cognition/information-seeker.ts` | Selección de herramientas con el motor de razonamiento nativo, ejecución a través del motor de acciones |
| Reductor | `src/cognition/mental-state-reducer.ts`, `hypothesis-transitions.ts` | Aplicación pura y determinista de los parches de pensamiento con invariantes, versionada por `schemaVersion` |
| Repetición | `src/cognition/mental-state-replay.ts` | Reconstrucción del estado mental y conjunto de datos del controlador a partir de los eventos |
| Perfiles | `src/cognition/thinker-profile.ts`, `profile-distiller.ts`, `profile-learning.ts` | Esquema del perfil, renderizado, refinamiento, destilación |
| Valoradores | `src/cognition/hypothesis-assessor.ts` | `compare` con decisiones tipadas: la evidencia se pregunta sin el pensador, el ajuste solo para las propuestas |
| Registrador y fábrica | `src/cognition/cognitive-run-recorder.ts`, `create-cognitive-agent.ts` | Formas de los eventos de una ejecución cognitiva; ensamblaje de un agente a partir de su configuración y de los servicios del SDK |

A su alrededor: `src/decisions` (decisiones tipadas, cliente de Jev, servicio de decisiones), `src/costs` (precios y costes de las ejecuciones), `src/resilience` (política de reintentos y proveedor con reintentos), `src/incidents` (reglas, notificadores, almacén de eventos monitorizado) y `src/mcp` (servidor y cliente, publicado como `@sdk-ai-agents/core/mcp`).

El resto de esta página documenta el runtime gobernado (v0.1).

## Resumen ejecutivo {#executive-summary}

SDK_AI_Agents sigue una arquitectura de event sourcing con una separación estricta entre el razonamiento y la acción. El SDK oculta la complejidad interna detrás de una API sencilla e intuitiva.

## Patrón de arquitectura {#architecture-pattern}

**Patrón principal:** event sourcing con separación de responsabilidades

- **Motor de razonamiento** (Reasoning Engine): genera intenciones a partir del LLM (sin efectos secundarios)
- **Motor de acciones** (Action Engine): ejecuta las intenciones tras validarlas
- **Motor de políticas** (Policy Engine): valida las intenciones contra las políticas
- **Almacén de eventos** (Event Store): única fuente de verdad de todos los eventos

## Visión general de los componentes {#component-overview}

### 1. Capa de la API del SDK (fachada) {#_1-sdk-api-layer-facade}

**Responsabilidades:**
- Interfaz pública sencilla e intuitiva
- Correspondencia entre la API y los eventos internos
- Configuración por defecto inteligente
- Gestión del ciclo de vida del SDK y de los agentes

**Archivos:**
- `src/sdk.ts`: implementación principal (`SDKImpl`)
- `src/agent.ts`: implementación del agente (`AgentImpl`)
- `src/index.ts`: exportaciones públicas

**Interfaces principales:**
```typescript
interface SDK {
  createAgent(config: AgentConfig): Agent
  defineTool(tool: ToolDefinition): Tool
  replay(runId: string): Promise<RunResult>
  getTrace(runId: string): Promise<Trace>
  defineGlobalPolicy(policy: Policy): void
}

interface Agent {
  run(input: RunInput): Promise<RunResult>
}
```

### 2. Motor de razonamiento {#_2-reasoning-engine}

**Responsabilidades:**
- Integración con el proveedor de LLM (OpenAI/Anthropic)
- Generación de intenciones estructuradas a partir de las respuestas del LLM
- Gestión del contexto conversacional
- Emisión de eventos de razonamiento

**Archivo:** `src/engines/reasoning-engine.ts`

**Restricciones:**
- Nunca puede ejecutar directamente una herramienta
- Nunca puede provocar un efecto secundario
- Solo genera intenciones estructuradas

**Dependencias:**
- Proveedor de LLM (patrón Strategy)
- Almacén de eventos (emisión de eventos)

### 3. Motor de acciones {#_3-action-engine}

**Responsabilidades:**
- Recibir y validar las intenciones
- Ejecutar las herramientas a través del registro de herramientas
- Aplicar las políticas a través del motor de políticas
- Emisión de eventos de acción

**Archivo:** `src/engines/action-engine.ts`

**Restricciones:**
- Toda acción debe pasar por el motor de acciones
- Validación obligatoria antes de la ejecución
- Se emite un evento por cada acción

**Dependencias:**
- Motor de políticas (validación)
- Registro de herramientas (ejecución)
- Almacén de eventos (emisión de eventos)
- Gestor de aprobaciones (opcional)
- Seguimiento de presupuestos (opcional)

### 4. Motor de políticas {#_4-policy-engine}

**Responsabilidades:**
- Validar las intenciones contra las políticas activas
- Aplicar las políticas globales y específicas
- Comprobar los presupuestos, los tiempos límite y las listas de permitidos
- Emisión de eventos de validación

**Archivo:** `src/engines/policy-engine.ts`

**Restricciones:**
- Denegado por defecto: todo está prohibido salvo que se autorice explícitamente
- Comprobación obligatoria antes de cada acción

**Dependencias:**
- Almacén de eventos (emisión de eventos de validación)
- Seguimiento de presupuestos (opcional)
- Evaluador de condiciones

### 5. Motor de repetición {#_5-replay-engine}

**Responsabilidades:**
- Repetir ejecuciones a partir de los eventos persistidos
- Repetición determinista sin llamada al LLM
- Generación de nuevos eventos de repetición

**Archivo:** `src/engines/replay-engine.ts`

**Restricciones:**
- La repetición solo usa eventos persistidos
- Ninguna llamada al LLM durante la repetición
- La repetición reproduce la misma secuencia lógica

**Dependencias:**
- Almacén de eventos (lectura de eventos)
- Motor de acciones (ejecución de intenciones)

### 6. Almacén de eventos {#_6-event-store}

**Responsabilidades:**
- Persistir los eventos (solo adición)
- Recuperar los eventos por runId
- Filtrar y consultar los eventos
- Abstracción para distintas implementaciones

**Archivos:**
- `src/stores/event-store.ts`: interfaz `IEventStore`
- `src/stores/file-event-store.ts`: implementación basada en archivos
- `src/stores/sql-event-store.ts`: implementación SQL genérica
- `src/stores/sqlite-event-store.ts`: implementación para SQLite
- `src/stores/postgresql-event-store.ts`: implementación para PostgreSQL

**Interfaz:**
```typescript
interface IEventStore {
  append(runId: string, event: Event): Promise<void>
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>
  getRunIds(filters?: RunFilters): Promise<string[]>
  queryEvents?(filters?: EventFilters): Promise<EventQueryResult>
  backup?(): Promise<BackupData>
  restore?(backupData: BackupData): Promise<void>
}
```

### 7. Registro de herramientas {#_7-tool-registry}

**Responsabilidades:**
- Gestionar las herramientas declaradas
- Validación del esquema de entrada (Zod)
- Ejecutar las herramientas con validación
- Lista de permitidos estricta (denegado por defecto)

**Archivo:** `src/registry/tool-registry.ts`

**Restricciones:**
- Rechazo automático de las herramientas no declaradas
- Validación obligatoria antes de la ejecución
- Lista de permitidos estricta

**Dependencias:**
- Zod (validación de esquemas)

### 8. Registro de capacidades {#_8-capability-registry}

**Responsabilidades:**
- Gestionar las capacidades (grupos de herramientas)
- Asociación entre herramientas y capacidades

**Archivo:** `src/registry/capability-registry.ts`

### 9. Abstracción del proveedor de LLM {#_9-llm-provider-abstraction}

**Responsabilidades:**
- Abstraer las diferencias entre proveedores de LLM
- Normalizar los formatos de solicitud y de respuesta
- Compatibilidad con varios proveedores (OpenAI, Anthropic)
- Conmutación automática a un proveedor de reserva

**Archivos:**
- `src/providers/llm-provider.ts`: interfaz `LLMProvider`
- `src/providers/openai-provider.ts`: implementación para OpenAI
- `src/providers/anthropic-provider.ts`: implementación para Anthropic
- `src/providers/fallback-provider.ts`: proveedor con reserva
- `src/providers/provider-factory.ts`: fábrica para crear los proveedores

**Interfaz:**
```typescript
interface LLMProvider {
  generateCompletion(request: LLMRequest): Promise<LLMResponse>
  supportsModel(model: string): boolean
  getProviderName(): string
  readonly nativeToolMessages?: boolean // tool calls and results in the vendor's format
}
```

### 10. Clases de gestión {#_10-manager-classes}

**Responsabilidades:**
- Gestionar las funcionalidades avanzadas
- Coordinación entre componentes

**Archivos:**
- `src/managers/approval-manager.ts`: gestión de las aprobaciones humanas
- `src/managers/budget-tracker.ts`: seguimiento de presupuestos y consumo
- `src/managers/golden-trace-manager.ts`: gestión de las trazas de referencia
- `src/managers/regression-test-manager.ts`: gestión de las baterías de pruebas
- `src/managers/assertion-manager.ts`: gestión de las aserciones
- `src/managers/impact-analysis-manager.ts`: gestión de los análisis de impacto

## Arquitectura de datos {#data-architecture}

### Tipos de eventos {#event-types}

```typescript
type EventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'intention.generated'
  | 'intention.rejected'
  | 'action.executing'
  | 'action.executed'
  | 'action.failed'
  | 'policy.checked'
  | 'policy.violated'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'tool.called'
  | 'tool.failed'
  | 'provider.fallback'
  | 'error.occurred';
```

### Estructura de un evento {#event-structure}

```typescript
interface Event {
  id: string
  runId: string
  type: EventType
  timestamp: number
  data: Record<string, unknown>
  metadata?: EventMetadata
}
```

### Implementaciones del almacén de eventos {#event-store-implementations}

1. **FileEventStore** (MVP)
   - Persistencia basada en archivos
   - Un archivo JSON por runId
   - Volcado automático por lotes

2. **SQLEventStore** (producción)
   - Implementación SQL genérica
   - Compatibilidad con SQLite y PostgreSQL
   - Índices para el rendimiento

3. **PostgreSQLEventStore** (producción avanzada)
   - Usa JSONB para un almacenamiento eficiente
   - Índices GIN para las consultas JSON
   - Compatibilidad con consultas avanzadas

## Diseño de la API {#api-design}

### Inicialización del SDK {#sdk-initialization}

```typescript
const sdk = createSDK({
  apiKey: string
  provider?: 'openai' | 'anthropic'
  eventStore?: IEventStore
  defaultPolicies?: Policy[]
})
```

### Creación de un agente {#agent-creation}

```typescript
const agent = sdk.createAgent({
  name: string
  model: string
  tools?: Tool[]
  policies?: Policy[]
  capabilities?: string[]
})
```

### Definición de una herramienta {#tool-definition}

```typescript
const tool = sdk.defineTool({
  name: string
  description: string
  schema: ZodSchema
  handler: (params: unknown) => Promise<unknown>
})
```

### Ejecución de un agente {#agent-execution}

```typescript
const result = await agent.run({
  message: string
  context?: Record<string, unknown>
  metadata?: Record<string, unknown>
})
```

## Estrategia de pruebas {#testing-strategy}

### Pruebas unitarias {#unit-tests}

- Pruebas unitarias para cada módulo
- Usa Vitest
- Simulación (mocking) de las dependencias externas

### Pruebas de integración {#integration-tests}

- Pruebas de integración de flujos de trabajo completos
- Pruebas con distintos almacenes de eventos
- Pruebas de repetición

### Trazas de referencia {#golden-traces}

- Trazas de referencia para las pruebas de regresión
- Validación del comportamiento mediante repetición
- Detección automática de regresiones

## Arquitectura de despliegue {#deployment-architecture}

### Distribución del paquete {#package-distribution}

- **Nombre del paquete**: `@sdk-ai-agents/core`
- **Distribución**: npm
- **Punto de entrada**: `dist/index.js`
- **Definiciones de tipos**: `dist/index.d.ts`

### Proceso de compilación {#build-process}

1. Compilación de TypeScript (`tsc`)
2. Generación de source maps
3. Generación de archivos de declaración
4. Salida en `dist/`

### Dependencias {#dependencies}

**Runtime:**
- `openai`: ^4.20.0
- `@anthropic-ai/sdk`: ^0.71.2
- `uuid`: ^9.0.1
- `zod`: ^3.22.4

**Dependencias peer:**
- `pg`: ^8.11.0 (para PostgreSQLEventStore)

**Dependencias de desarrollo:**
- `typescript`: ^5.3.2
- `vitest`: ^1.0.4
- `@biomejs/biome`: ^1.7.0

## Consideraciones de seguridad {#security-considerations}

### Denegado por defecto {#deny-by-default}

- Todas las herramientas deben declararse explícitamente
- Todas las acciones deben pasar por el motor de políticas
- Validación obligatoria antes de la ejecución

### Separación de responsabilidades {#separation-of-concerns}

- El motor de razonamiento no puede ejecutar herramientas
- El motor de acciones valida antes de ejecutar
- El motor de políticas comprueba todas las acciones

### Pista de auditoría {#audit-trail}

- Todos los eventos se persisten
- Trazabilidad completa de las decisiones
- Pista de auditoría de las políticas

## Consideraciones de rendimiento {#performance-considerations}

### Rendimiento del almacén de eventos {#event-store-performance}

- FileEventStore: volcado por lotes (10 eventos o 100 ms)
- SQLEventStore: índices para consultas rápidas
- PostgreSQLEventStore: JSONB + índices GIN

### Sobrecarga del SDK {#sdk-overhead}

- Sobrecarga mínima (< 5-10 ms sin contar el LLM ni las herramientas)
- Emisión asíncrona de eventos
- Volcado por lotes para el rendimiento

## Consideraciones de futuro {#future-considerations}

### Escalabilidad {#scalability}

- Migración a un almacén de eventos distribuido (al estilo de Kafka)
- Compatibilidad con varias instancias
- Clústeres de almacenes de eventos

### Funcionalidades {#features}

- Compatibilidad con más proveedores de LLM
- Almacén de eventos en la nube (S3, etc.)
- Panel de monitorización
