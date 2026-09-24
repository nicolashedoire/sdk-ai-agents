# Por qué este SDK

**En una frase:** la mayoría de los frameworks de agentes ayudan a un modelo de lenguaje a **actuar**; este SDK le hace **justificar lo que cree** antes de concluir, y puede hacer que **razone como lo hace una persona concreta**.

Esta página es honesta a propósito: dice lo que el SDK hace y que no encontrarás fácilmente en otro sitio, lo que otros frameworks también hacen y lo que hacen mejor. La comparación se basa en la documentación de frameworks muy utilizados a mediados de 2026 (LangChain y LangGraph, el OpenAI Agents SDK, el Vercel AI SDK, CrewAI, AutoGen y su sucesor Microsoft Agent Framework, Mastra, DSPy); evolucionan rápido, así que consulta su documentación actual antes de decidir.

## Qué hace de forma diferente {#what-it-does-differently}

### 1. Reglas de razonamiento escritas en el código, no en el prompt {#_1-reasoning-rules-written-in-code-not-in-the-prompt}

En un agente habitual, el "razonamiento" es lo que el modelo escriba: si dice que está seguro al 90 %, nada lo comprueba salvo que escribas tú esa comprobación. Aquí:

- el [estado mental](./cognitive-agents#the-mental-state) (hechos, hipótesis, predicciones, contradicciones) son datos tipados, no texto libre;
- el modelo no puede aumentar su propia confianza: la confianza de una decisión está limitada al respaldo de la evidencia de la opción elegida, juzgado en un paso de comparación aparte (por Jev sin el perfil del pensador, o por el modelo de lenguaje siguiendo sus instrucciones);
- una hipótesis rechazada no puede seleccionarse, actualizarse ni volver a plantearse; solo vuelve como una variante que dice qué cambió (una reformulación con otras palabras no se detecta);
- una respuesta solo se adopta **en firme** cuando supera la [guarda de conclusión](./evidence-and-verification#the-conclusion-guard): criticada, valorada después de la última evidencia nueva, sin contradicciones que la afecten, con las predicciones probadas mientras el presupuesto lo permita, con suficiente respaldo. Si no, el agente dice **provisional**, con lo que falta, o **se abstiene**.

"No puedo concluir" es un resultado de primera clase, impuesto por el código en lugar de pedido en un prompt.

### 2. El mundo comprueba las predicciones, no el modelo {#_2-the-world-checks-the-predictions-not-the-model}

Un patrón habitual es hacer que un modelo juzgue a otro. Aquí, el agente declara **antes** de la prueba lo que debería observar y lo que demostraría que se equivoca, y **tu código** decide: una medición, un simulador, una batería de pruebas, una consulta. Una regla refutada se rechaza, y solo puede volver como una variante que declara su diferencia. Consulta [Predicciones y el evaluador de resultados](./evidence-and-verification#predictions-and-the-outcome-evaluator).

Lo que respondieron las pruebas se conserva para las ejecuciones posteriores del mismo ámbito: la siguiente ejecución empieza con las reglas que se sostuvieron y no puede volver a plantear, palabra por palabra, una que falló. Los productos de memoria recuerdan lo que se dijo; esta [memoria entre ejecuciones](./memory) solo guarda lo que respondió una prueba.

### 3. La evidencia y las preferencias se mantienen separadas {#_3-evidence-and-preferences-are-kept-apart}

Lo que prefiere el pensador puede cambiar **qué acción se elige**, y permitir que una acción que prefiere claramente se adopte en firme con una evidencia plausible; en el código, nunca hace más creíble una **afirmación sobre el mundo**. Con Jev, la pregunta sobre la evidencia incluso se envía sin el perfil del pensador; con un modelo de lenguaje como juez, esa separación depende de sus instrucciones. Consulta [La evidencia no es una preferencia](./evidence-and-verification#evidence-is-not-preference).

### 4. Razonar como una persona concreta, y medirlo {#_4-reasoning-like-a-given-person-and-measuring-it}

Los productos de memoria guardan sobre todo hechos y preferencias sobre un usuario (algunos también reescriben las instrucciones a partir de la retroalimentación); los optimizadores de prompts como DSPy ajustan los prompts y los ejemplos según una métrica. Este SDK extrae **cómo** razona una persona: el orden en que examina un problema, sus reflejos, lo que le hace rechazar una idea. Versiona ese [perfil de pensador](./thinker-profiles), lo escribe en cada paso del razonamiento, añade a sus instrucciones las correcciones de la persona, con un porcentaje de acuerdo, y exporta como conjunto de datos las elecciones de siguiente paso del agente, etiquetadas con el veredicto de la persona sobre cada ejecución, para entrenar un controlador pequeño.

### 5. Decisiones calibradas dentro del razonamiento {#_5-calibrated-decisions-inside-the-reasoning}

[Jev](./typed-decisions) responde a preguntas acotadas con probabilidades que su proveedor calibra. Elige el siguiente paso del razonamiento y puntúa las hipótesis por una fracción de céntimo, y un controlador determinista toma el relevo cuando no está seguro.

### 6. Un único registro para el razonamiento y las acciones {#_6-one-log-for-reasoning-and-actions}

Las herramientas gobernadas, las aprobaciones, los costes, los reintentos y las llamadas MCP se registran en el mismo registro de eventos que cada pensamiento. Puedes reconstruir exactamente lo que el agente "tenía en mente" detrás de cualquier respuesta, meses después, y repetir sus acciones sin llamar al modelo.

## Lo que otros frameworks también hacen {#what-other-frameworks-also-do}

- **Herramientas gobernadas y aprobación humana.** Los guardrails del OpenAI Agents SDK, el human-in-the-loop de LangGraph.
- **Persistencia y repetición.** Los checkpoints de LangGraph permiten reanudar, inspeccionar y repetir o bifurcar desde estados anteriores.
- **MCP**, el seguimiento de costes y los reintentos están ampliamente disponibles.

La diferencia aquí es que estas piezas comparten un único registro de eventos con un estado de razonamiento explícito.

## Lo que otros frameworks hacen mejor {#what-other-frameworks-do-better}

- **Ecosistema.** Cientos de integraciones, grandes comunidades, ejemplos para todo.
- **Madurez.** Este SDK es joven, tiene un único mantenedor, todavía no está publicado en npm y se ha probado en un número limitado de problemas reales.
- **La orquestación multiagente, el streaming y los kits de interfaz** son más completos en otros sitios.
- **Coste y latencia.** Una respuesta cognitiva requiere unos diez pasos de razonamiento, cada uno con una o dos solicitudes al modelo (con gpt-4o y Jev, unos minutos y alrededor de 0,1 USD por problema en nuestras pruebas), mientras que una respuesta directa requiere una sola llamada y un agente con herramientas, unas pocas.
- **Dependencia del modelo.** Las reglas se cumplen sea cual sea el modelo, pero la calidad del razonamiento no: los modelos pequeños siguen mal el método, e incluso los potentes suelen terminar en provisional o abstenerse en problemas difíciles.
- **Memoria y recuperación.** Los productos de memoria y los pipelines de recuperación ofrecen búsqueda semántica sobre grandes colecciones; aquí, la [memoria entre ejecuciones](./memory) recupera reglas probadas por coincidencia de palabras dentro de un ámbito estrecho.

## Cuándo elegirlo {#when-to-choose-it}

- **Decisiones que debes justificar o auditar**: investigación, industria, gobernanza interna, y apoyo a la decisión en ámbitos regulados (salud, finanzas, derecho) donde una persona revisa la conclusión y su fundamento.
- **Cuando "no lo sé" es mejor que una invención dicha con seguridad**, y quieres que eso se imponga.
- **Cuando una afirmación puede comprobarse**: tienes una medición, un simulador o una batería de pruebas con la que el agente puede confrontar sus predicciones.
- **Un gemelo de razonamiento**: capturar cómo aborda los problemas un experto o un fundador, y medir cuánto se acerca la imitación.

Cuando necesitas un chatbot rápido, un gran catálogo de integraciones listas para usar o una única llamada rápida, un framework más ligero encaja mejor.
