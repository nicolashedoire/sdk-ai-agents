# Costes de API

El SDK registra el consumo de tokens de cada llamada al modelo **en la ejecución que la hizo** — selección de herramientas, pensamientos cognitivos y decisiones tipadas — y le asigna un precio por modelo.

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

Un modelo sin precio se sigue contabilizando (llamadas y tokens) y aparece en `unpricedModels`, y el informe se marca con `complete: false` — el SDK nunca se inventa un precio.

## De dónde viene el consumo {#where-usage-comes-from}

| Evento | Origen | Campos |
| --- | --- | --- |
| `intention.generated` | Razonamiento nativo, selección de herramientas | `model`, `requestedModel`, `usage.promptTokens`, `usage.completionTokens` |
| `cognition.thought` | Operaciones cognitivas, reparaciones e intentos fallidos incluidos | `model`, `requestedModel`, `usage.calls` |
| `decision.evaluated` | Jev y otros backends de decisiones tipadas | `model`, `usage.inputTokens`, `usage.outputTokens` |

Como el consumo vive en los eventos, también puedes calcular tú los costes con `computeRunCost(runId, events, pricing)`, agregarlos por agente o por día, o enviarlos a tu facturación.

## Presupuestos {#budgets}

El coste es solo una cara; las políticas también pueden limitar **los pasos, los tokens y las llamadas a herramientas** por agente, por herramienta y por periodo — consulta [Agentes gobernados](./governed-agents). Los agentes cognitivos tienen sus propios límites (`maxSteps`, `maxToolCalls`, `timeoutMs`). Un `budgetLimit` con `maxCost` rechaza las llamadas a herramientas de un agente gobernado en cuanto sus llamadas al modelo han costado más que el límite en el periodo, con los precios anteriores: una llamada al modelo nunca se rechaza, y con `toolName` solo se rechaza esa herramienta. Si un modelo no tiene precio, o una llamada no informa de sus tokens, el límite no puede comprobarse y las llamadas a herramientas se rechazan. Un límite con `agentId` cuenta las llamadas al modelo de ese agente; sin `agentId`, cuenta las de todos los agentes gobernados.
