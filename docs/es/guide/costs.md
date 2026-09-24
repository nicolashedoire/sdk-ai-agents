# Costes de API

El SDK registra el consumo de tokens de cada llamada al modelo **en la ejecución que la hizo** — selección de herramientas, pensamientos cognitivos y decisiones tipadas — y le asigna un precio por modelo. Una llamada cuenta en cuanto el fabricante la ha respondido, aunque el SDK haga fallar después el paso por esa respuesta (consulta [Llamadas que fallan](#failed-calls)).

```ts
const cost = await sdk.getRunCost(runId);
```

```json
{
  "runId": "run_7f3…",
  "currency": "USD",
  "totalUsd": 0.01842,
  "complete": true,
  "unpricedModels": [],
  "unpricedCalls": 0,
  "unmeteredCalls": 0,
  "unmeteredModels": [],
  "lines": [
    { "model": "gpt-4o", "source": "llm", "calls": 9, "inputTokens": 14210, "outputTokens": 2310, "costUsd": 0.0186 },
    { "model": "jev-1.13.0", "source": "decision", "calls": 7, "inputTokens": 5880, "outputTokens": 140, "costUsd": 0.00025 }
  ]
}
```

## Precios {#prices}

Los precios de los LLM cambian a menudo y dependen de tu contrato, así que son **configuración, no código**. Solo se incluyen como valores por defecto los precios verificados con la documentación del proveedor — hoy, los de Jev (0,042 $ por millón de tokens de entrada, salida gratuita, comprobado el 2026-09-23), tanto con sus identificadores de TypeSafe (`jev-*`) como a través de Vercel AI Gateway (`typesafe-ai/jev`).

```ts
const sdk = createSDK({
  apiKey,
  pricing: {
    // Illustrative values: use your provider's current prices or your contract.
    'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
});
```

Las claves son identificadores exactos de modelo o prefijos que terminan en `*`. Los proveedores suelen responder con un identificador versionado (`gpt-4o-2024-08-06`) cuando pediste `gpt-4o`: el SDK registra ambos y busca primero el identificador devuelto y después el nombre pedido — las claves exactas antes que los prefijos, y gana el prefijo más largo. Cuidado con los prefijos: `gpt-4o*` también coincide con `gpt-4o-mini` salvo que exista `gpt-4o-mini*`.

## Costes desconocidos {#unknown-costs}

El SDK nunca se inventa un precio, ni un número de tokens. El coste de una llamada es desconocido en dos casos, y el informe lo dice:

- **su modelo no tiene precio**: sus llamadas y sus tokens se siguen contabilizando, el modelo aparece en `unpricedModels`, esas llamadas en `unpricedCalls`, y su línea no tiene `costUsd`;
- **no informó de ningún número de tokens** — ni de entrada ni de salida, como con un proveedor que no devuelve el consumo, o solo un total: se cuenta en `unmeteredCalls` (y en el `unmeteredCalls` de su línea), y su modelo en `unmeteredModels`. Nunca se toma como cero tokens, y una línea cuyas llamadas no informaron de ninguno tampoco tiene `costUsd`.

Una llamada sin número de tokens cuenta como no medida aunque su modelo tenga precio, igual que en los presupuestos. En cuanto el coste de alguna llamada es desconocido, el informe se marca con `complete: false` y `totalUsd` solo suma las llamadas cuyo coste se conoce: es un mínimo, no el coste de la ejecución.

## Llamadas que fallan {#failed-calls}

Una llamada que el fabricante ha respondido se factura, haga lo que haga después el SDK con la respuesta. Se registra y se contabiliza — en los eventos de la ejecución, en `getRunCost` y, en los agentes gobernados, en los presupuestos por periodo y en el `maxTokens` de la ejecución — aunque el paso falle por ella:

- la llamada a una herramienta de un agente gobernado cuyos argumentos no son JSON válido: `intention.generated` se registra antes de leer la respuesta;
- un pensamiento cognitivo cuya respuesta no pasa la validación, reparaciones incluidas, y una operación que `stop()` o el tiempo límite de la ejecución interrumpe tras intentos facturados (`cognition.operation_failed` con su `usage`, y `decision.evaluated` para las peticiones de decisión tipada que ya tenían respuesta);
- una decisión tipada cuya respuesta no corresponde a sus preguntas (una opción que no está entre las ofrecidas, una respuesta ausente o de otro tipo): `decision.evaluated` con su `error` y `answers` vacío, después `sdk.decisions` lanza el error, y un agente cognitivo recurre a su alternativa como antes;
- una respuesta que un proveedor descarta: una respuesta de OpenAI sin ninguna opción, que hace fallar la llamada o cede el turno a un proveedor de respaldo (`provider.answer_discarded`, tanto en las ejecuciones gobernadas como en los pensamientos cognitivos, al precio del modelo que la dio).

Un intento que falló sin respuesta — un error HTTP, un tiempo de espera agotado, una conexión perdida, lo que gestionan los reintentos y las conmutaciones — no informa de ningún consumo y no se cuenta. Una respuesta que no se pudo usar en absoluto (descartada, o que no es un cuerpo de decisión válido) solo se cuenta si el fabricante informó de su consumo. Una respuesta que llega justo cuando se cancela la ejecución la descarta el proveedor sin su consumo, y tampoco se cuenta.

## De dónde viene el consumo {#where-usage-comes-from}

| Evento | Origen | Campos |
| --- | --- | --- |
| `intention.generated` | Razonamiento nativo, selección de herramientas | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `provider.answer_discarded` | Una respuesta que el proveedor no pudo usar | `provider`, `model`, `usage` |
| `cognition.thought` | Operaciones cognitivas, reparaciones e intentos fallidos incluidos | `model`, `requestedModel`, `usage.calls`, `usage.unmeteredCalls` |
| `cognition.operation_failed` | Una operación interrumpida por una parada o un tiempo límite tras intentos facturados | `model`, `requestedModel`, `usage` |
| `decision.evaluated` | Jev y otros backends de decisiones tipadas, respuestas rechazadas incluidas | `model`, `usage.inputTokens`, `usage.outputTokens` |

La respuesta final de una ejecución cognitiva también se registra como un evento `intention.generated` (`source: 'cognition'`): no es una llamada al modelo y no se cuenta.

Como el consumo vive en los eventos, también puedes calcular tú los costes con `computeRunCost(runId, events, pricing)`, agregarlos por agente o por día, o enviarlos a tu facturación.

## Presupuestos {#budgets}

El coste es solo una cara; las políticas también pueden limitar **los pasos, los tokens y las llamadas a herramientas** por agente, por herramienta y por periodo — consulta [Agentes gobernados](./governed-agents). Un `budgetLimit` con `maxCost` rechaza las llamadas a herramientas de un agente en cuanto sus llamadas al modelo han costado más que el límite en el periodo, con los precios anteriores, y también el paso siguiente de un agente cognitivo (consulta [Límites y políticas](./cognitive-agents#limits-and-policies)): una llamada al modelo ya iniciada nunca se interrumpe, y con `toolName` solo se rechaza esa herramienta. Si un modelo no tiene precio, o una llamada no informa de sus tokens, el límite no puede comprobarse y esas llamadas a herramientas y esos pasos se rechazan. Un `maxCost` que no sea un número finito ≥ 0 (una cadena como `'0.5'` leída de un archivo de configuración, `NaN`, un importe negativo, `Infinity`, `null`) se rechaza en cuanto se aplica la política, con un `ValidationError`.

Los presupuestos cuentan las llamadas al modelo registradas en las ejecuciones, como `getRunCost`: los pasos de razonamiento de un agente gobernado; los pensamientos de un agente cognitivo (reparaciones e intentos fallidos incluidos), sus selecciones de herramienta y sus decisiones tipadas; y las decisiones tipadas tomadas con `sdk.decisions`. Un límite con `agentId` cuenta las llamadas al modelo de ese agente — y las llamadas de `sdk.decisions` que lo nombran con `agentId`; sin `agentId`, las cuenta todas, incluidas las decisiones tipadas tomadas sin agente. Un presupuesto nunca rechaza una llamada de `sdk.decisions`: rechaza llamadas a herramientas y los pasos de los agentes cognitivos.
