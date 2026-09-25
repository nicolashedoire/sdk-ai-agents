---
layout: home

hero:
  name: SDK AI Agents
  text: Agentes gobernados que piensan antes de actuar
  tagline: Razonamiento explícito con un estado mental que puedes inspeccionar, decisiones tipadas con Jev, conectores MCP — sobre una base de event sourcing, repetición, costes, reintentos y alertas de incidentes.
  image:
    src: /images/reasoning-loop.svg
    alt: El bucle cognitivo en torno a un estado mental explícito
  actions:
    - theme: brand
      text: Empezar
      link: /es/guide/getting-started
    - theme: alt
      text: Cómo piensan los agentes
      link: /es/guide/cognitive-agents
    - theme: alt
      text: Ver en GitHub
      link: https://github.com/nicolashedoire/sdk-ai-agents

features:
  - icon: 🧠
    title: Razonar, no solo escribir un prompt
    details: Representar, comparar observaciones, formular hipótesis, simular, probar, revisar, criticar, buscar información, comparar, decidir. Cada paso es una operación sobre un estado mental explícito, elegida por un controlador y registrada como un evento.
    link: /es/guide/cognitive-agents
    linkText: El bucle cognitivo
  - icon: 🔬
    title: Cree lo que puede justificar
    details: Las observaciones conservan su procedencia, las reglas vienen con predicciones refutables, tu propio evaluador las pone a prueba, las reglas refutadas se revisan — y una respuesta solo se adopta en firme cuando supera una guarda escrita en código.
    link: /es/guide/evidence-and-verification
    linkText: Evidencia y verificación
  - icon: 🪞
    title: Razona como una persona concreta
    details: Sí, puede imitar cómo razona alguien. Explica algunos temas con tus propias palabras, y destila tu orden de atención, tus prioridades y tus reflejos en un perfil que se escribe en las instrucciones de cada paso del razonamiento. Cada corrección se le añade, y tu grado de acuerdo muestra cuánto se acerca.
    link: /es/guide/thinker-profiles
    linkText: Razonar como una persona concreta
  - icon: 🧭
    title: Un investigador que no pierde el rumbo
    details: Dale un objeto que comprender y rediseñar con los medios de hoy. Busca en tus fuentes, distingue los hechos establecidos de las hipótesis y las novedades, y propone los experimentos que permitirían decidir — con una carta congelada y un guardián que lo mantienen en su objetivo.
    link: /es/guide/studies
    linkText: Estudios
  - icon: 🎯
    title: Decisiones tipadas con Jev
    details: Inyecta cualquier contexto, haz preguntas de sí/no, de opción única o múltiple y de valoración, y obtén probabilidades calibradas sobre las que tu código puede actuar.
    link: /es/guide/typed-decisions
    linkText: Decidir con confianza
  - icon: 🔌
    title: Un servidor MCP para cualquier cosa
    details: Convierte una API web, una carpeta de documentos, una base de datos de solo lectura o un agente en un servidor MCP con una sola línea, gobernado y trazado, y da a tus agentes las herramientas de cualquier servidor MCP.
    link: /es/guide/mcp
    linkText: Conecta tus sistemas
  - icon: 🛡️
    title: Gobernanza desde el diseño
    details: El modelo propone, el motor dispone. Las políticas, las listas de permitidos, los presupuestos y las aprobaciones humanas se comprueban antes de cada acción.
    link: /es/guide/governed-agents
    linkText: Agentes gobernados
  - icon: 🎞️
    title: Todo es un evento
    details: Repite ejecuciones sin llamar al LLM, reconstruye el estado mental de cualquier ejecución, compara ejecuciones y conviértelas en pruebas de referencia.
    link: /es/guide/observability
    linkText: Trazabilidad y repetición
  - icon: 💸
    title: Costes que puedes ver
    details: El consumo de tokens de cada llamada al LLM y de cada decisión tipada se registra y se valora por ejecución y por modelo.
    link: /es/guide/costs
    linkText: Costes de API
  - icon: 🔁
    title: Reintentos que no se acumulan
    details: Una política de reintentos por proveedor antes de conmutar, reintentos para las herramientas idempotentes, y cada reintento escrito en la traza.
    link: /es/guide/resilience
    linkText: Reintentos y conmutación por error
  - icon: 🚨
    title: Incidentes que te llegan
    details: Las ejecuciones fallidas, las acciones bloqueadas y los cambios de proveedor se convierten en incidentes con su cronología, enviados por correo electrónico o webhook.
    link: /es/guide/incidents
    linkText: Alertas de incidentes
---

<div class="vp-doc" style="max-width: 1152px; margin: 0 auto; padding: 48px 24px 0;">

## De un prompt a una decisión que puedes auditar {#from-a-prompt-to-a-decision-you-can-audit}

Una llamada clásica a un LLM va directamente de la pregunta a la respuesta. Un agente cognitivo construye una imagen explícita del problema, explora varias opciones, las somete a prueba, comprueba los hechos con herramientas gobernadas y solo entonces se compromete — y después puedes leer cada paso.

```ts
import { createSDK } from '@sdk-ai-agents/core';

const sdk = createSDK({ apiKey: process.env.OPENAI_API_KEY, jev: { apiKey: process.env.TYPESAFE_API_KEY } });

const lookupMetric = sdk.defineTool({ /* name, description, zod schema, handler */ });
const analyst = sdk.createCognitiveAgent({ name: 'analyst', model: 'gpt-4o', tools: [lookupMetric] });
const { answer, decision, state, runId } = await analyst.think({
  problem: 'Should we build or buy our analytics module?',
});

console.log(answer);                          // the decision, in plain words
console.log(state.hypotheses);                // every option considered, with its support
console.log(await sdk.getRunCost(runId));     // what it cost, per model
```

![Un estado mental reconstruido a partir del registro de eventos](/images/mental-state.svg){.illustration}

## Un SDK, todas las capas {#one-sdk-every-layer}

![Arquitectura del SDK](/images/architecture.svg){.illustration}

| Necesitas | Una API de LLM en bruto | SDK AI Agents |
| --- | --- | --- |
| Razonar antes de responder | Generación en una sola pasada | Hipótesis, simulación y crítica sobre un estado explícito |
| Razonar como una persona concreta | Un prompt de sistema largo | Un perfil de pensador versionado, refinado con la retroalimentación |
| Investigar sin salirse del objetivo | Un chat que se desvía a medida que se acumulan las instrucciones | Un estudio: carta congelada, prompts reconstruidos en cada llamada, un guardián, afirmaciones comprobadas frente a las fuentes |
| Decisiones rápidas y calibradas | Analizar texto libre | Respuestas tipadas con probabilidades y confianza (Jev) |
| Conectar las herramientas de la empresa | Código de integración a medida para cada herramienta | Servidor y cliente MCP, gobernados por políticas |
| Saber qué ha pasado | Logs, si los hay | Registro de eventos, repetición, reconstrucción del estado mental |
| Controlar el riesgo y el gasto | Cruzar los dedos | Políticas, aprobaciones, presupuestos, costes por ejecución, alertas de incidentes |

</div>
