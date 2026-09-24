# Evidencia y verificación

Un agente cognitivo debería creer lo que puede justificar, poner a prueba lo que predice y cambiar sus reglas cuando el mundo no está de acuerdo. Por eso el bucle cognitivo registra **de dónde viene cada elemento de evidencia**, mantiene **separadas la evidencia y las preferencias**, confronta las predicciones con **pruebas reales** y solo **se compromete en firme** con una respuesta que supera una comprobación de preparación escrita en código.

::: tip En palabras sencillas
Piensa en un investigador meticuloso. Anota **de dónde viene cada pista** y no cuenta dos veces el mismo rumor. De varios casos saca una **regla**, y después dice de antemano **qué debería ver** si la regla es correcta, y **qué demostraría que es falsa**. Luego lo comprueba, con una medición real en lugar de con su propia opinión. Cuando la comprobación falla, no disimula: **corrige la regla** y dice qué cambió. Y solo da una **respuesta firme** cuando se sostiene; si no, dice "todavía no estoy seguro, esto es lo que falta", o "no puedo concluir". Cada término usado a continuación se explica en [Términos clave en palabras sencillas](./glossary#evidence-and-conclusions).
:::

![Observar, comparar, deducir, probar, revisar — y después la guarda de conclusión](/images/evidence-loop.svg){.illustration style="max-width:860px"}

## Dale lo que has observado {#give-it-what-you-observed}

Pasa con el problema las mediciones, los casos o los documentos que ya tengas. Cada uno se convierte en una **observación** con un identificador (`O1`, `O2`…) que el razonamiento puede citar.

```ts
const result = await agent.think({
  problem: 'Does the rolling time on our plane depend on the ball?',
  observations: [
    {
      content: { material: 'steel', massKg: 0.1, seconds: 1.07 },
      summary: 'Steel ball, 100 g: 1.07 s',
      originGroup: 'bench',
    },
    {
      content: { material: 'steel', massKg: 0.4, seconds: 1.07 },
      summary: 'Steel ball, 400 g: 1.07 s',
      originGroup: 'bench',
    },
  ],
});
```

Los resultados de las herramientas y de las pruebas también se convierten en observaciones. Su procedencia la escribe el motor, nunca el modelo:

| Campo | Significado |
| --- | --- |
| `sourceKind` | `input` (dada con el problema), `tool` (una llamada a una herramienta gobernada) o `evaluation` (una prueba de predicción) |
| `source`, `sourceEventId` | La herramienta o el evaluador, y el evento que contiene el contenido completo (`action.executed`, `cognition.evaluated`) |
| `observedAt`, `context` | Cuándo, y en qué situación, se observó |
| `summary` | Texto de longitud limitada que se muestra al modelo |
| `fingerprint` | Hash del contenido completo |
| `originGroup` | Las observaciones con el mismo origen **no** son confirmaciones independientes |
| `duplicateOf` | Se rellena cuando ya se había observado el mismo contenido del mismo origen |

Los hechos citan las observaciones de las que se leyeron (`observationRefs`); un hecho extraído del resultado de una herramienta se vincula a él automáticamente, y un hecho ya conocido no se añade dos veces — la nueva fuente se le añade como corroboración. Se indica al modelo que lea una fuente que afirma X como *la fuente afirma X*, no como prueba de X. El código se asegura de que repetir la misma evidencia no añada peso: un duplicado no cuenta como un cambio de la evidencia, y los hechos o las pruebas que repiten una observación anterior apuntan al original.

## Comparar observaciones {#compare-observations}

`compare_observations` relaciona las observaciones (y los hechos) entre sí. Se ofrece cuando existen al menos dos observaciones comparables — dadas con el problema o devueltas por herramientas, sin contar duplicados ni resultados de pruebas — y han llegado nuevas desde la última comparación.

| Relación | Significado | Qué hace el código |
| --- | --- | --- |
| `similarity` | El mismo valor o comportamiento en un aspecto | Se registra — una similitud no es una causa |
| `difference` | Una diferencia explicada por el contexto | Se registra |
| `evolution` | Un cambio a lo largo del tiempo | Se registra |
| `incompatibility` | No pueden cumplirse las dos | Abre una contradicción (`source_disagreement` entre orígenes distintos), una sola vez |
| `counterexample` | Un caso que rompe una hipótesis | Se conserva como contraevidencia de esa hipótesis, abre una contradicción, una sola vez |

## Reglas, explicaciones y propuestas {#rules-explanations-and-proposals}

Una hipótesis declara qué tipo de afirmación es, cómo se infirió y en qué se basa:

```json
{
  "statement": "Rolling time on this plane does not depend on the ball",
  "kind": "rule",
  "inference": "induction",
  "premiseRefs": ["O1", "O2"],
  "scope": "balls on this plane"
}
```

`kind` es `proposal` (una acción o una elección que hay que hacer, el valor por defecto), `rule` (una regularidad) o `explanation` (una causa). Una afirmación sobre lo que es o fue cierto nunca es una propuesta: se le indica así al modelo, porque la [guarda de conclusión](#the-conclusion-guard) deja que las preferencias del pensador ayuden a una elección, nunca a una afirmación. `inference` es `induction`, `abduction` o `deduction`; la etiqueta nunca hace que la afirmación sea cierta.

## Predicciones y el evaluador de resultados {#predictions-and-the-outcome-evaluator}

`simulate` deduce **predicciones** que podrían fallar: lo que debería observarse (`expected`), qué observación demostraría que la hipótesis es falsa (`falsifier`), en qué contexto (`context`), y los parámetros estructurados de la prueba (`test`) que necesita un evaluador. Una predicción se registra **antes** de probarse, y se prueba una sola vez. El modelo ve los experimentos ya realizados y sus resultados (`experiments` en la vista del estado) y se le pide que no repita ninguno, sino que elija una prueba en la que las hipótesis en juego discrepen.

Un `OutcomeEvaluator` la confronta con el mundo — un simulador, una medición, una batería de pruebas, una consulta:

```ts
import type { OutcomeEvaluator } from '@sdk-ai-agents/core';

const bench: OutcomeEvaluator = {
  id: 'inclined-plane-bench',
  version: '1.0.0',
  async evaluate({ prediction }) {
    const run = await rollOnTheBench(prediction.test); // your measurement
    if (!run) return { verdict: 'inconclusive', reason: 'the bench is busy' };
    const refuted = Math.abs(run.seconds - run.expectedSeconds) / run.expectedSeconds > 0.1;
    return {
      verdict: refuted ? 'refuted' : 'confirmed',
      observed: run,
      summary: `${run.material} ball: ${run.seconds} s`,
      metrics: { seconds: run.seconds },
      ...(refuted ? { causeCandidates: ['material deforms', 'surface grip'] } : {}),
    };
  },
};

const agent = sdk.createCognitiveAgent({ name: 'physicist', model: 'gpt-4o', evaluator: bench });
```

Con un evaluador, `test_prediction` pasa a estar disponible. Llama a **tu evaluador, no al modelo de lenguaje**, registra el informe completo como un evento `cognition.evaluated` y añade lo observado como una observación de tipo `evaluation` que apunta a ese evento.

| Veredicto | Efecto |
| --- | --- |
| `confirmed` | La observación se añade a los `evidenceRefs` de la hipótesis |
| `refuted` | Se observó el falsador: la hipótesis se **rechaza**, la observación se conserva como contraevidencia y la refutación se registra como una contradicción `refuted_prediction` resuelta |
| `inconclusive` | Se registra; lo que observó, si observó algo, es evidencia nueva; nada más cambia |

Cada prueba consume una de las `limits.maxPredictionTests`. Un evaluador que lanza una excepción o devuelve un informe no válido da `inconclusive`, y lo mismo ocurre con un informe `refuted` que no dice qué se observó — una medición fallida nunca refuta nada. No uses como evaluador un modelo que juzga su propio razonamiento: la autocrítica puede preparar una prueba, no puede sustituirla.

## Revisión {#revision}

Cuando la evidencia contradice una hipótesis, `revise` pide una **variante**: una nueva hipótesis con `parentId`, un `scope` más estrecho o una variable añadida, y la diferencia (`difference`) que introduce — una variante que no declara su diferencia se rechaza. La original conserva su identificador, su motivo de rechazo y su contraejemplo; volver a plantear una hipótesis ya considerada, rechazada o no, se rechaza. En la prueba del plano inclinado, la regla refutada *"el tiempo de rodadura no depende de la bola"* se convierte en *"para bolas rígidas, el tiempo de rodadura no depende de la masa"*, que una segunda prueba confirma.

## La evidencia no es una preferencia {#evidence-is-not-preference}

| Puntuación | Pregunta | ¿Quién ve el perfil del pensador? |
| --- | --- | --- |
| `support` | ¿Hasta qué punto la respaldan las observaciones, los hechos, las predicciones y las críticas? | Jev: nadie — las preguntas sobre la evidencia se envían sin el perfil. LLM: se indica al modelo que ignore las preferencias |
| `preferenceFit` | ¿Hasta qué punto le conviene esta propuesta al pensador? (solo propuestas) | Sí, esa es su finalidad |

El código nunca mezcla las dos puntuaciones. Las hipótesis se clasifican solo por `support` en el caso de las reglas y las explicaciones; las propuestas se clasifican por `(1 − w) · support + w · preferenceFit`, con `w = limits.preferenceWeight` (0,4 por defecto). Cambiar el perfil puede, por tanto, cambiar **qué acción se elige**, y si una elección que el pensador prefiere claramente puede adoptarse en firme con una evidencia plausible (consulta [la guarda de conclusión](#the-conclusion-guard)); con Jev no puede cambiar **lo creíble que es una afirmación**, y con un LLM como juez esa separación depende de sus instrucciones. La `confidence` del estado sigue el respaldo de la evidencia de la hipótesis mejor clasificada: la `confidence` que un modelo escribe en un pensamiento se ignora.

`support` es un juicio emitido por un modelo, no una probabilidad calibrada. Lo que se mide es el historial: qué predicciones se confirmaron o se refutaron.

## Valoraciones obsoletas {#stale-assessments}

El estado mantiene un contador `evidenceRevision`. Aumenta cuando llega una nueva observación (no duplicada), un hecho nuevo, una revisión de un hecho, una contradicción, un contraejemplo o un resultado de prueba concluyente. Las valoraciones hechas antes quedan **obsoletas**: `compare` se vuelve a ofrecer, y una hipótesis obsoleta no puede adoptarse en firme. Una comparación debe volver a valorar **todas** las hipótesis en juego — se pide al modelo que repare una comparación que se salta una hipótesis, y una que siga saltándose una hipótesis, o que falle, no cuenta como hecha.

## Contradicciones y revisiones de hechos {#contradictions-and-fact-revisions}

Las contradicciones llevan una categoría (`category`): `source_disagreement`, `temporal_change`, `context_difference`, `logical_incompatibility` o `refuted_prediction`. Una contradicción se resuelve **una sola vez**, y solo cuando la resolución **cita observaciones o hechos** que la zanjan (`basisRefs` — las demás referencias se notifican y se ignoran); puede decir qué se hizo (`retracted`, `restricted`, `replaced`, o `explained` por defecto). La resolución se conserva junto a la contradicción. Los hechos nunca se borran: se retractan (`retracted`) o se sustituyen (`superseded`) por un reemplazo, con el motivo.

## La guarda de conclusión {#the-conclusion-guard}

Una respuesta solo puede adoptarse **en firme** cuando su hipótesis:

- fue criticada;
- fue valorada después del último cambio de la evidencia;
- no está afectada por ninguna contradicción sin resolver (una que no nombra nada afecta a todo);
- no tiene ninguna predicción sin probar mientras el presupuesto de pruebas permita probarla;
- tiene un respaldo de la evidencia (`support`) de al menos `limits.decisionThreshold` — o, en el caso de una **propuesta** (una elección de acción), es claramente la elección del pensador (`preferenceFit` de al menos `limits.decisionThreshold`) y su respaldo de la evidencia alcanza `limits.minProposalSupport` (0,35 por defecto).

La segunda vía existe porque una pregunta como *"¿aceptarías este empleo?"* tiene poca evidencia que sopesar: una persona la decide con sus prioridades, siempre que los hechos no hablen en contra de la elección, es decir, siempre que su respaldo de la evidencia se mantenga en el mínimo o por encima. Las reglas y las explicaciones nunca la toman: las preferencias nunca hacen que una afirmación sea cierta. [Razonar como una persona concreta](./thinker-profiles#how-a-choice-is-ranked-and-committed) desarrolla un ejemplo con cifras. `minProposalSupport` no puede superar `decisionThreshold`; ponlo igual a `decisionThreshold` para desactivar esta vía.

`decide` solo se ofrece cuando una hipótesis la supera. Una decisión que selecciona otra hipótesis, o ninguna, se **aplaza** mientras dure el presupuesto; un aplazamiento cuenta como un intento fallido, y `decide` deja de ofrecerse tras dos seguidos. En el último paso, o cuando no hay nada más posible, el motor pide aun así una decisión, y la resuelve:

| `decision.status` | Cuándo | `decision.missing` |
| --- | --- | --- |
| `committed` | La comprobación de preparación se supera | `[]` |
| `provisional` | El presupuesto se agotó con una hipótesis todavía viva | Lo que todavía no está establecido |
| `abstain` | No hay ninguna hipótesis seleccionada, la seleccionada fue rechazada, o el modelo no pudo producir ninguna decisión | Por qué — una abstención tiene confianza 0, y su respuesta la escribe el motor (lo que escribió el modelo se conserva en `rationale`) |

```ts
const { decision } = await agent.think({ problem, observations });
if (decision?.status !== 'committed') {
  console.log('Not established yet:', decision?.missing);
}
```

El estado de la ejecución sigue siendo `completed`: una abstención explícita es un resultado válido. La confianza de una decisión está limitada al respaldo de la evidencia de su hipótesis.

## Un presupuesto que no se desperdicia {#a-budget-that-is-not-wasted}

Un paso que no cambió nada de lo que debía cambiar — ninguna hipótesis nueva (todas las propuestas rechazadas), nada nuevo simulado o criticado, ninguna comparación registrada —, una comparación que se salta una hipótesis y una decisión aplazada cuentan todos como intentos fallidos de su operación. Cuando `compare_observations`, `hypothesize`, `simulate`, `revise`, `critique`, `compare` o `decide` han fallado dos veces seguidas, dejan de ofrecerse **hasta que otro paso aporte evidencia nueva** — un paso que tuvo éxito, o un resultado de herramienta o de prueba que registró el motor; lo que escribieron los propios pasos fallidos no cuenta —, de modo que la ejecución avanza en lugar de repetirse. `seek_information` funciona, en cambio, por pregunta abierta: una pregunta que ninguna herramienta disponible puede responder se descarta de inmediato (con el motivo), y una llamada a herramienta que falla cuenta para los dos intentos que recibe cada pregunta, de modo que las demás preguntas siguen teniendo su turno. `test_prediction` está limitado por su presupuesto de pruebas.

`limits.maxConsecutiveFailures` cuenta los fallos del modelo o de sus herramientas, incluida una comparación que sigue saltándose una hipótesis tras la reparación. Las decisiones aplazadas y los pasos que no cambiaron nada se registran como pasos fallidos, pero nunca cuentan para ese límite. Los componentes (generador de pensamientos, valorador, evaluador) reciben una copia del estado: no pueden alterar lo registrado, y un pensamiento no válido de un componente personalizado se registra como una operación fallida en lugar de detener la ejecución.

## Las pruebas son tu especificación {#tests-are-your-specification}

`src/__tests__/rule-discovery.test.ts` ejecuta el bucle completo con un modelo guionizado y un banco de física determinista — inducir, predecir, ser refutado, revisar, verificar, adoptar en firme — y comprueba cada evento. `src/__tests__/epistemic-state.test.ts`, `epistemic-guards.test.ts` y `epistemic-liveness.test.ts` comprueban cada una de las reglas anteriores por separado, y una traza registrada por la versión anterior comprueba que las ejecuciones más antiguas se reconstruyen sin cambios.

## Ejecuciones más antiguas {#older-runs}

Las ejecuciones registran la versión de estas reglas (`schemaVersion: 2` en `cognition.started`). Las ejecuciones registradas antes no tienen versión: `getMentalState` las reconstruye con sus reglas originales, y sus colecciones nuevas están vacías.

## Lo que todavía no está {#not-there-yet}

- **Memoria semántica.** La [memoria entre ejecuciones](./memory) recupera lo que establecieron pruebas anteriores por coincidencia de palabras; se pueden pasar por alto reglas relacionadas redactadas de otra forma.
- **Obsolescencia selectiva.** La evidencia nueva vuelve obsoletas todas las valoraciones, no solo las que le afectan — conservador, y fácil de auditar.
- **Elegir qué explorar.** Los controladores eligen una operación; el objetivo (qué incógnita, qué predicción) es el primero que cumple los requisitos.
- **Calibración.** Todavía no hay una confianza predictiva calibrada: `support` es un juicio, y lo que se mide es el historial de las predicciones.
- **Inferencia verificada.** La etiqueta de inferencia (inducción, abducción, deducción) se declara, no la comprueba un verificador formal.
- **Tipos declarados.** Si una hipótesis es una afirmación o una elección de acción lo declara el modelo cuando la propone, y una hipótesis sin tipo es una propuesta. El prompt prohíbe llamar propuesta a una afirmación sobre el mundo, pero nada lo verifica: una afirmación mal etiquetada podría adoptarse en firme por la preferencia del pensador.
- **Probar las causas detrás de una elección.** Cuando el objetivo pregunta qué hacer, las hipótesis son líneas de acción y solo las reglas y las explicaciones reciben predicciones, así que el evaluador de resultados no se usa con esos objetivos.
- **Comprobaciones estructuradas.** Las restricciones son texto libre y la guarda de conclusión no las comprueba; los conflictos no se detectan mediante reglas sobre datos estructurados; una acción de resolución no cambia por sí sola los hechos ni las hipótesis.
