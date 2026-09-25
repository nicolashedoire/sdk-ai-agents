# Términos clave en palabras sencillas

Cada término usado en esta documentación, explicado sin jerga, con un enlace a la página que lo detalla. Los términos están agrupados por tema; usa el cuadro de búsqueda (<kbd>/</kbd>) para ir directamente a uno.

## Lo básico {#the-basics}

| Término | En palabras sencillas |
| --- | --- |
| **SDK** | Una caja de herramientas para desarrolladores: código que añades a tu propia aplicación en lugar de escribirlo todo tú. Este está escrito en TypeScript; todavía no está en npm y se instala desde GitHub (consulta [Primeros pasos](./getting-started)). |
| **Modelo de lenguaje (LLM)** | La IA que lee y escribe texto (GPT-4o, Claude…). Aquí es un componente entre otros: propone, y el SDK comprueba y decide qué está permitido. |
| **Prompt** | Las instrucciones de texto que se envían a un modelo de lenguaje con cada solicitud. |
| **Token** | Un trozo de palabra. Los proveedores de modelos facturan por token leído y escrito, y por eso los [costes](./costs) se cuentan en tokens. |
| **Agente** (agent) | Un programa que usa un modelo de lenguaje para alcanzar un objetivo, paso a paso. El SDK tiene dos tipos: los [agentes gobernados](./governed-agents), que actúan con herramientas, y los [agentes cognitivos](./cognitive-agents), que razonan antes de concluir. |
| **Ejecución** (run) | Una ejecución de un agente sobre un problema, de principio a fin. Tiene un identificador (`runId`) que usas para leerla, repetirla o calcular su coste. |
| **Herramienta** (tool) | Una función que tu código da a un agente (leer una base de datos, enviar un correo…). El agente solo puede usar las herramientas que se le han dado explícitamente. Consulta [Conceptos básicos](./concepts#_2-tool). |
| **Capacidad** (capability) | Un grupo de herramientas con nombre que puedes dar a varios agentes a la vez. |
| **Política** (policy) | Una regla que se comprueba **antes** de cada acción: un presupuesto, un tiempo límite, una lista de herramientas permitidas o tu propia comprobación. |
| **Aprobación** (approval) | Una pausa antes de una acción arriesgada hasta que una persona diga que sí. Puede pedirla una política o la propia herramienta (`requiresApproval`); si quien llama se rinde antes, la acción nunca se ejecuta. |
| **Intención** (intention) | Lo que el modelo de un agente gobernado *quiere* hacer (llamar a una herramienta, responder…), anotado pero no ejecutado: el SDK lo valida primero. |
| **Esquema** (schema, Zod) | Una descripción precisa de la forma que deben tener los datos. Las llamadas a herramientas y las respuestas estructuradas de los pasos de razonamiento se comprueban contra uno; una respuesta que no encaja se rechaza. |
| **JSON** | Un formato de texto plano para datos estructurados. Los perfiles, los eventos y las respuestas del modelo son JSON. |

## Trazabilidad {#traceability}

| Término | En palabras sencillas |
| --- | --- |
| **Evento** (event) | Una línea del cuaderno de bitácora: "esto ha pasado, en este momento". Cada paso de cada ejecución se registra como un evento. Consulta el [catálogo de eventos](../reference/events). |
| **Almacén de eventos** (event store) | Donde se guarda el cuaderno de bitácora: una carpeta de archivos, SQLite o PostgreSQL. |
| **Event sourcing** | La regla de que el cuaderno de bitácora es la verdad: el estado de una ejecución, incluido su estado mental, se reconstruye releyendo sus eventos, nunca se guarda por separado. Eso es lo que hace que cada ejecución se pueda auditar meses después. Un perfil de pensador es la excepción: los eventos solo registran su identificador y su versión, así que guarda el propio perfil. |
| **Traza** (trace) | Todos los eventos de una ejecución, en orden. |
| **Repetición** (replay) | Volver a ejecutar una ejecución registrada a partir de sus eventos: las acciones que decidió se ejecutan de nuevo, pasando por las mismas políticas, sin volver a preguntar al modelo de lenguaje. Útil para auditar una ejecución o para probar "qué pasaría si" después de cambiar una política. Consulta [Trazabilidad y repetición](./observability). |
| **Traza de referencia** (golden trace) | Una buena ejecución que guardas como referencia; las nuevas ejecuciones se comprueban contra ella, de modo que un cambio de comportamiento se detecta como una prueba que falla. |

## Cómo razona un agente cognitivo {#how-a-cognitive-agent-reasons}

| Término | En palabras sencillas |
| --- | --- |
| **Estado mental** (mental state) | Todo lo que el agente "tiene en mente" en ese momento sobre el problema, anotado como datos: lo que observó, lo que sabe, lo que supone, lo que no sabe y las opciones que considera. Consulta [el estado mental](./cognitive-agents#the-mental-state). |
| **Observación** (observation, `O1`…) | Algo visto: una medición o un documento que diste con el problema, el resultado de una herramienta o el resultado de una prueba. |
| **Hecho** (fact, `F1`…) | Una afirmación que el agente da por cierta, con su origen. Un hecho nunca se borra: se *retracta* (se retira) o se *sustituye* (se reemplaza), con el motivo. |
| **Supuesto** (assumption, `A1`…) | Algo que el razonamiento da por sentado sin prueba. |
| **Restricción** (constraint, `K1`…) | Algo que cualquier respuesta debe respetar ("antes del cuarto trimestre", "menos de 10k EUR"). |
| **Incógnita** (unknown, `U1`…) | Una pregunta abierta. Puede quedar *resuelta* (respondida) o *descartada* (no hay forma de responderla). |
| **Hipótesis** (hypothesis, `H1`…) | Una opción que se está considerando. Es de uno de tres tipos: una **propuesta** (proposal, una elección de acción: "rechazar el empleo"), una **regla** (rule, una regularidad: "el tiempo de rodadura no depende de la masa") o una **explicación** (explanation, una causa). |
| **Inducción, abducción, deducción** (induction, abduction, deduction) | Tres formas de llegar a una hipótesis: de casos repetidos a una regla; de una sorpresa a su causa más probable; de una regla a lo que debe seguirse de ella. La etiqueta se declara, no hace que la afirmación sea cierta. |
| **Operación** (operation) | Un movimiento del razonamiento: representar el problema, formular hipótesis, simular, criticar, comparar, decidir… Hay diez. Consulta [las operaciones](./cognitive-agents#the-operations). |
| **Controlador** (controller) | Lo que elige la siguiente operación. El controlador **heurístico** sigue un orden fijo, gratuito y predecible; el controlador **tipado** pregunta a Jev en cada paso. |
| **Parche de pensamiento** (thought patch) | Lo que una operación cambió en el estado mental, registrado como un evento. El estado mental es el conjunto de todos los parches aplicados en orden. |
| **Simulación** (simulate) | Imaginar lo que pasaría si una hipótesis fuera cierta: efectos inmediatos y después indirectos. |
| **Crítica** (critique) | El agente atacando su propia opción: la razón más fuerte por la que podría fallar. Una crítica **fatal** sin respuesta rechaza la opción. |
| **Contradicción** (contradiction, `C1`…) | Dos cosas que no pueden ser ciertas a la vez. Sigue abierta hasta que se resuelve citando las observaciones o los hechos que la zanjan. |
| **Variante** (variant) | Una versión corregida de una hipótesis que la evidencia contradijo, con un ámbito más estrecho o una condición añadida, y una frase que dice qué cambió. |
| **Límites** (limits) | El presupuesto de una ejecución: número de pasos, tiempo, llamadas a herramientas, pruebas y los umbrales para concluir. Consulta [Límites](./cognitive-agents#limits). |

## Evidencia y conclusiones {#evidence-and-conclusions}

| Término | En palabras sencillas |
| --- | --- |
| **Procedencia** (provenance) | De dónde viene un elemento de evidencia: aportado por ti, devuelto por una herramienta o medido por una prueba, con el evento que contiene el original. |
| **Grupo de origen** (`originGroup`) | Una etiqueta que significa "misma fuente". Dos observaciones del mismo origen no son dos confirmaciones independientes. |
| **Duplicado** (duplicate) | El mismo contenido, del mismo origen, visto otra vez. No añade peso. |
| **Predicción** (prediction, `P1`…) | Lo que debería observarse si una hipótesis es correcta, registrado **antes** de ponerla a prueba. |
| **Falsador** (falsifier) | La observación que demostraría que la hipótesis es falsa. Una afirmación que no puede demostrarse falsa no puede ponerse a prueba. |
| **Conocimiento** (knowledge, `M1`…) | Lo que ejecuciones anteriores establecieron con pruebas reales, recuperado al inicio de una ejecución: *verificado*, *refutado* o *discutido* cuando las pruebas no coinciden. Consulta [Memoria entre ejecuciones](./memory). |
| **Ámbito** (scope) | El límite de una memoria: las ejecuciones comparten lo que aprendieron solo dentro del mismo ámbito, por ejemplo un banco de pruebas o un producto. |
| **Evaluador de resultados** (outcome evaluator) | Tu código que confronta una predicción con el mundo (una medición, un simulador, una batería de pruebas) y responde *confirmada*, *refutada* o *no concluyente*. El modelo de lenguaje nunca califica sus propias predicciones. Consulta [Predicciones](./evidence-and-verification#predictions-and-the-outcome-evaluator). |
| **Respaldo** (support) | Hasta qué punto la evidencia respalda una hipótesis, de 0 (refutada) a 1 (establecida). Es un juicio, no una probabilidad medida. El código nunca mezcla preferencias en él; con un modelo de lenguaje como juez, eso depende de sus instrucciones (consulta [La evidencia no es una preferencia](./evidence-and-verification#evidence-is-not-preference)). |
| **Ajuste a las preferencias** (`preferenceFit`) | Hasta qué punto una elección de acción le conviene al pensador, de 0 (cumple uno de sus criterios de rechazo) a 1 (ideal). Solo las elecciones de acción reciben uno. |
| **Clasificación** (ranking) | El orden de las opciones. Las afirmaciones se clasifican solo por su respaldo; las elecciones de acción, por defecto, con un 60 % de respaldo y un 40 % de ajuste a las preferencias. |
| **Obsoleta** (stale) | Una valoración hecha antes del último cambio de la evidencia. Hay que rehacerla antes de concluir. |
| **Guarda de conclusión** (conclusion guard) | Las comprobaciones, escritas en código, que una respuesta debe superar para adoptarse en firme: criticada, valorada después de la última evidencia nueva, sin ninguna contradicción abierta que la afecte, sin ninguna predicción sin probar mientras queden pruebas en el presupuesto, y con suficiente respaldo. Consulta [La guarda de conclusión](./evidence-and-verification#the-conclusion-guard). |
| **Umbral de decisión** (`decisionThreshold`) | El respaldo que necesita una respuesta en firme: 0,75 por defecto, "fuertemente respaldada". Una elección de acción que el pensador prefiere claramente solo necesita 0,35. |
| **En firme** (committed) | Una respuesta firme que superó la guarda de conclusión. |
| **Provisional** (provisional) | La mejor respuesta disponible cuando se agotó el presupuesto, con la lista de lo que todavía no está establecido (`missing`). |
| **Abstención** (abstain) | "No puedo concluir", con los motivos. Un resultado válido, no un error. |
| **Confianza** (confidence) | Lo segura que es la decisión; nunca es mayor que el respaldo de la evidencia de la opción elegida. |

## Imitar el razonamiento de una persona {#imitating-a-person-s-reasoning}

| Término | En palabras sencillas |
| --- | --- |
| **Perfil de pensador** (thinker profile) | Una descripción de **cómo** razona una persona concreta: el orden en que examina un problema, sus prioridades, sus reflejos, sus criterios de rechazo y su apetito de riesgo. Se escribe en las instrucciones de cada paso del razonamiento, y así es como el agente imita el razonamiento de esa persona. Consulta [Perfiles de pensador](./thinker-profiles). |
| **Muestra** (sample) | Un tema que la persona explicó con sus propias palabras: el tema, cómo razonó y qué concluyó. |
| **Destilar** (distill) | Extraer un perfil de las muestras: encontrar lo que se repite en la forma de razonar de la persona de un tema a otro. |
| **Orden de atención** (`reasoningSequence`) | Los pasos por los que pasa la persona, en orden. |
| **Heurística** (heuristic) | Un reflejo, escrito como "cuando …, entonces …". |
| **Criterio de rechazo** (rejection criterion) | Un motivo por el que la persona descarta una idea. |
| **Veredicto** (verdict) | El juicio de la persona sobre una ejecución: `match` (razonó como yo), `partial` o `mismatch`. |
| **Grado de acuerdo** (agreement) | Cuánto de una ejecución comparte la persona, de 0 a 1: `0.8` significa "acertado en un 80 %". Es la forma de medir cuánto se acerca la imitación. |
| **Ejemplo de calibración** (example) | Una ejecución que la persona validó, mostrada al modelo como respuesta modelo. |
| **Corrección** (correction) | Una lección sacada de una ejecución con la que la persona no estuvo de acuerdo, mostrada al modelo como su máxima prioridad. |

## Estudios {#studies}

| Término | En palabras sencillas |
| --- | --- |
| **Estudio** (study) | Un investigador de IA (`sdk.createStudy`): comprende un objeto, después propone cómo rediseñarlo con los conocimientos y las técnicas de hoy, y diseña los experimentos que permitirían decidir. No construye ni mide nada. Consulta [Estudios](./studies). |
| **Pasaje** (passage) | Una de las siete etapas de un estudio: observar, descomponer, comprender las decisiones de su época, examinar lo que cambió, cruzar pasado y presente, diseñar, confrontar. Un pasaje puede reabrir uno anterior. |
| **Carta** (charter) | El marco de un estudio: el objeto, la pregunta guía, el objetivo, las necesidades, tus pistas y lo que queda fuera del alcance. Se congela al crear el estudio, y todos los prompts empiezan por ella. |
| **Pista** (lead) | Una idea que le das al estudio para que la examine. Es un ejemplo por verificar, no una verdad: el estudio dice si es pertinente, con sus motivos, y busca más allá de ella. |
| **Estado de una afirmación** (claim status) | Lo que vale un enunciado de un estudio: **establecido** (respaldado por una fuente que el estudio encontró de verdad), **hipótesis** (plausible, no documentada) o **novedad** (una idea nueva, que hay que contrastar con los trabajos existentes). Lo comprueba el código, no el modelo. Consulta [Establecido, hipótesis, novedad](./studies#established-hypothesis-novelty). |
| **Lo existente** (prior art) | Los trabajos ya existentes más cercanos a una idea presentada como nueva. Una novedad sigue "por verificar" hasta que el estudio ha buscado lo existente. |
| **Guardián** (guardian) | Una comprobación aparte después de cada pasaje de un estudio: solo ve la carta y lo que produjo el pasaje, y elimina lo que se sale del objetivo. Consulta [El guardián](./studies#the-guardian). |
| **Desvío, registro de desvíos** (drift, drift log) | El desvío es un modelo que se va alejando poco a poco de su tema. El registro de desvíos enumera todo lo que un estudio eliminó por ese motivo, y por qué. |
| **Enmienda** (amendment) | Una instrucción añadida a un estudio después de crearlo. Solo se acepta si precisa el objetivo; una que contradice la carta o cambia el objetivo se rechaza. |
| **Nueva capacidad** (new capability) | Algo que se vuelve posible y que hoy es difícil o imposible, gracias a un cambio de principio — frente a una **mejora** (improvement), que solo hace algo más rápido o más barato. |
| **Ruptura por ensamblaje** (breakthrough by assembly) | Un gran avance hecho de técnicas que ya existían, unidas de una forma nueva. Bitcoin es uno: las firmas, las cadenas de hashes, la prueba de trabajo y una red entre pares ya se conocían antes. |
| **Ficha de mecanismo** (mechanism card) | Once preguntas sobre un mecanismo, desde lo que se observó hasta lo que se concluyó. Un estudio responde a las nueve primeras; tú respondes a las dos últimas una vez que has ejecutado el experimento. |

## Decisiones tipadas y conectores {#typed-decisions-and-connectors}

| Término | En palabras sencillas |
| --- | --- |
| **Jev** | Un modelo de TypeSafe que responde a preguntas acotadas (sí/no, una opción, una valoración) con probabilidades que tu código puede usar, de forma rápida y barata. Consulta [Decisiones tipadas](./typed-decisions). |
| **Noul, Choice, Score** | Los tres tipos de pregunta de Jev: sí o no; una opción entre una lista; un nivel en una escala. Elegir varias opciones hace una pregunta de sí/no por opción. |
| **Calibrada** | Una probabilidad que coincide con la realidad de media: de las respuestas dadas con un 80 % de confianza, aproximadamente el 80 % son correctas. |
| **AI Gateway** | Un servicio de Vercel que da acceso a varios modelos, Jev incluido, con una sola clave. |
| **MCP** | Model Context Protocol: un "enchufe" estándar único entre las aplicaciones de IA (Claude Desktop, Claude Code, asistentes de IDE, agentes) y tus sistemas. El SDK puede convertir una función, una API web, una carpeta, una base de datos o un agente en un servidor MCP, y usar las herramientas de cualquier servidor MCP. Consulta [MCP en palabras sencillas](./mcp). |
| **Servidor MCP** (MCP server) | Un pequeño programa delante de uno de tus sistemas que dice a las aplicaciones de IA lo que ofrece y hace el trabajo cuando se le pide. Consulta [Tu primer servidor MCP](./mcp-first-server). |
| **Cliente MCP, anfitrión** (MCP client, host) | El anfitrión es la aplicación de IA con la que habla el usuario; dentro de ella, un cliente MCP mantiene la conexión con un servidor. |
| **Recurso** (resource) | Un documento que un servidor MCP ofrece para su lectura, como un archivo de una carpeta compartida. A diferencia de una herramienta, lo elige el usuario o la aplicación, no el modelo. |
| **Transporte** (transport) | Cómo intercambian mensajes una aplicación MCP y un servidor: **stdio** (la aplicación inicia el servidor como un programa en el mismo equipo y se comunica a través de su entrada y su salida) o **Streamable HTTP** (el servidor es un servicio web). Consulta [¿stdio o HTTP?](./mcp-deploy#stdio-or-http). |
| **OpenAPI** | Una descripción estándar, legible por máquinas, de una API web: sus direcciones, sus parámetros y sus respuestas, a menudo publicada como `openapi.json`. A partir de ella, el SDK crea una herramienta por operación. Consulta [Una API web](./mcp-recipes#a-web-api-from-its-openapi-description). |
| **JSON Schema** | Una descripción de la forma de unos datos — aquí, de los argumentos de una herramienta — que los modelos y las aplicaciones MCP leen para llamar correctamente a la herramienta. El SDK la escribe a partir de tu esquema Zod o de la descripción OpenAPI. |
| **Solo lectura** (read-only) | Puede mirar, no puede cambiar. Las fuentes de carpeta y de base de datos son de solo lectura por construcción; las API web son de solo lectura por defecto (solo operaciones `GET`). |
| **Fuente de herramientas** (tool source) | Una función que construye herramientas listas para usar a partir de un sistema: `openApiTools`, `folderTools`, `databaseTools`, `cognitiveAgentTool`, `webTools`. Sírvelas por MCP con una línea, o dáselas a tus propios agentes. Consulta [Un servidor MCP para cualquier cosa](./mcp-recipes) e [Investigación web](./web-research). |

## Operar en producción {#operating-in-production}

| Término | En palabras sencillas |
| --- | --- |
| **Reintento** (retry) | Volver a intentar una solicitud fallida tras una breve espera, cuando el fallo es temporal. Consulta [Reintentos y conmutación por error](./resilience). |
| **Reserva, conmutación por error** (fallback, failover) | Pasar a otro modelo u otro proveedor cuando el primero sigue fallando. |
| **Incidente** (incident) | Una ejecución fallida, una acción bloqueada o una conmutación por error, convertida en una alerta que se te envía por correo electrónico o webhook. Consulta [Alertas de incidentes](./incidents). |
| **Webhook** | Una dirección que te da tu herramienta de chat o de monitorización, a la que el SDK envía las alertas. |
