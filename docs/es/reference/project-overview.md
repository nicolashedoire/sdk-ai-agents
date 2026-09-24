# Visión general del proyecto

**Tipo:** biblioteca (SDK de TypeScript)
**Arquitectura:** event sourcing con separación de responsabilidades

## Resumen ejecutivo {#executive-summary}

SDK_AI_Agents es una infraestructura de gobernanza de agentes de IA con event sourcing nativo, repetición y seguridad desde el diseño. El SDK convierte los agentes de IA, de herramientas experimentales, en sistemas de toma de decisiones gobernables, explicables y listos para producción.

## Clasificación del proyecto {#project-classification}

- **Tipo de repositorio:** monolito (un único código fuente cohesionado)
- **Tipo de proyecto:** biblioteca (SDK de TypeScript)
- **Lenguaje principal:** TypeScript 5.x
- **Patrón de arquitectura:** event sourcing con separación de responsabilidades (motor de razonamiento ≠ motor de acciones)

## Resumen de la pila tecnológica {#technology-stack-summary}

| Categoría | Tecnología | Versión | Justificación |
|----------|-----------|---------|---------------|
| Lenguaje | TypeScript | 5.3.2+ | Tipado estricto, compatibilidad con ESM |
| Runtime | Node.js | 20.0.0+ | Soporte LTS, funcionalidades modernas |
| Gestor de paquetes | npm | - | Gestor de paquetes estándar de Node.js |
| Herramienta de compilación | Compilador de TypeScript | 5.3.2 | Compilación nativa de TypeScript |
| Pruebas | Vitest | 1.0.4 | Ejecutor de pruebas rápido, basado en Vite |
| Linting/formateo | Biome | 1.7.0 | Herramienta rápida, todo en uno |
| Proveedores de LLM | OpenAI SDK | 4.20.0 | Integración con la API de OpenAI |
| Proveedores de LLM | Anthropic SDK | 0.71.2 | Integración con la API de Claude |
| Validación | Zod | 3.22.4 | Validación de esquemas para las entradas de las herramientas |
| UUID | uuid | 9.0.1 | Generación de identificadores únicos |
| Base de datos (opcional) | PostgreSQL | 8.11.0+ | Almacén de eventos de producción (dependencia peer) |

## Funcionalidades clave {#key-features}

### Capacidades principales {#core-capabilities}

1. **Event sourcing nativo**
   - Todos los eventos se persisten en un almacén de eventos
   - Repetición determinista sin llamada al LLM
   - Trazabilidad completa de cada decisión

2. **Separación entre razonamiento y acción**
   - Motor de razonamiento: genera intenciones (sin efectos secundarios)
   - Motor de acciones: ejecuta las intenciones tras validarlas
   - Seguridad desde el diseño: el LLM nunca provoca un efecto secundario directo

3. **Gobernanza integrada**
   - Motor de políticas: valida las intenciones antes de la ejecución
   - Budget Tracker: sigue los costes y el consumo por agente, herramienta y periodo
   - Approval Manager: flujo de aprobación humana para las acciones críticas
   - Pista de auditoría: trazabilidad completa de las decisiones de las políticas

4. **LLM multiproveedor**
   - Abstracción LLMProvider para OpenAI y Anthropic
   - Conmutación automática entre proveedores
   - Configuración por proveedor (temperature, maxTokens)

5. **Observabilidad cognitiva**
   - Reasoning Graph: visualización del proceso de razonamiento
   - Alternatives Analysis: alternativas que consideró el agente
   - Decision Patterns: patrones de decisión entre varias ejecuciones
   - Trace Visualization: preparación de las trazas para su visualización

6. **Pruebas y control de calidad**
   - Golden Traces: trazas de referencia para las pruebas
   - Regression Detection: detección automática de regresiones
   - Assertions: aserciones de comportamiento sobre las trazas
   - Integración CI/CD: exportación de los resultados de las pruebas (JUnit XML, JSON)

7. **Observabilidad avanzada**
   - Run Comparison: comparación de dos ejecuciones
   - Impact Analysis: análisis de impacto antes y después de un despliegue
   - Filtrado avanzado de eventos: filtrado avanzado de los eventos con rutas JSON

## Aspectos destacados de la arquitectura {#architecture-highlights}

### Abstracción del almacén de eventos {#event-store-abstraction}

- **IEventStore**: interfaz común para todos los almacenes de eventos
- **FileEventStore**: implementación basada en archivos (MVP)
- **SQLEventStore**: implementación SQL genérica
- **SQLiteEventStore**: implementación para SQLite
- **PostgreSQLEventStore**: implementación para PostgreSQL con JSONB

### Arquitectura de los motores {#engine-architecture}

- **ReasoningEngine**: genera intenciones a partir del LLM
- **ActionEngine**: ejecuta las intenciones tras validarlas
- **PolicyEngine**: valida las intenciones contra las políticas
- **ReplayEngine**: repite ejecuciones a partir de los eventos

### Sistema de registros {#registry-system}

- **ToolRegistry**: gestiona las herramientas disponibles
- **CapabilityRegistry**: gestiona las capacidades (grupos de herramientas)

### Sistema de gestores {#manager-system}

- **ApprovalManager**: gestión de las aprobaciones humanas
- **BudgetTracker**: seguimiento de presupuestos y consumo
- **GoldenTraceManager**: gestión de las trazas de referencia
- **RegressionTestManager**: gestión de las baterías de pruebas de regresión
- **AssertionManager**: gestión de las aserciones de comportamiento
- **ImpactAnalysisManager**: gestión de los análisis de impacto

## Visión general del desarrollo {#development-overview}

### Requisitos previos {#prerequisites}

- Node.js 20.0.0+ (LTS)
- npm o equivalente
- TypeScript 5.3.2+ (instalado localmente)

### Primeros pasos {#getting-started}

```bash
# Installation
npm install

# Build
npm run build

# Tests
npm test

# Watch mode
npm run dev
```

### Comandos clave {#key-commands}

- **Instalar:** `npm install`
- **Compilar:** `npm run build`
- **Desarrollo:** `npm run dev` (modo watch)
- **Pruebas:** `npm test`
- **Pruebas en modo watch:** `npm run test:watch`
- **Cobertura de pruebas:** `npm run test:coverage`
- **Lint:** `npm run lint`
- **Formateo:** `npm run format`
- **Comprobación:** `npm run check` (lint + formateo)

## Estructura del repositorio {#repository-structure}

```
sdk-ai-agents/
├── src/                    # SDK source (cognition, decisions, engines, stores, providers, mcp…)
├── benchmarks/             # Performance tests
├── docs/                   # Documentation (VitePress)
├── examples/               # Runnable examples
└── templates/              # Starter project
```

Consulta [Árbol de código fuente](../contributing/source-tree) para ver el detalle de `src/`.

## Mapa de la documentación {#documentation-map}

Para obtener información detallada, consulta:

- [Introducción](../guide/introduction) - Para qué sirve el SDK
- [Árbol de código fuente](../contributing/source-tree) - Estructura de directorios
- [Arquitectura](./architecture) - Arquitectura detallada
- [Guía de desarrollo](../contributing/development) - Flujo de trabajo de desarrollo
