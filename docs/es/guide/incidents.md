# Alertas de incidentes

Cuando algo sale mal, deberías enterarte — con suficiente contexto para actuar. El SDK vigila el flujo de eventos, convierte los eventos que coinciden en **incidentes** y los entrega por correo electrónico, por webhook o mediante cualquier notificador que escribas.

![Flujo de incidentes](/images/incident-flow.svg){.illustration}

## Correo electrónico en caso de fallo {#email-on-failure}

```ts
import { createSDK, EmailIncidentNotifier, ResendEmailTransport } from '@sdk-ai-agents/core';

const sdk = createSDK({
  apiKey: process.env.OPENAI_API_KEY,
  incidents: {
    notifiers: [
      new EmailIncidentNotifier({
        transport: new ResendEmailTransport({ apiKey: process.env.RESEND_API_KEY }),
        from: 'agents@acme.com',
        to: ['oncall@acme.com'],
      }),
    ],
    minSeverity: 'warning',
  },
});
```

El correo contiene la gravedad, el título, los identificadores de la ejecución y del agente, y **los últimos eventos de la ejecución** como una cronología — en texto plano y en HTML:

```text
CRITICAL — Agent run failed
run.failed: 3 consecutive operations failed

Run: run_7f3…
Agent: 9c1…
When: 2026-09-23T10:14:52.118Z

Last events:
  2026-09-23T10:14:50.021Z  cognition.operation_selected: simulate
  2026-09-23T10:14:51.604Z  cognition.operation_failed: model unavailable
  2026-09-23T10:14:52.118Z  run.failed: 3 consecutive operations failed
```

### Cualquier servicio de correo {#any-email-service}

`EmailIncidentNotifier` solo necesita un `EmailTransport` — un único método `send`. Con SMTP a través de nodemailer:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

El mismo adaptador de un solo método sirve para SES, Postmark, SendGrid o tu API de correo interna.

## Chat y webhooks {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` publica `{ text }` (Slack, Mattermost); el formato por defecto publica `{ incident }` como JSON para tu automatización.

## Reglas {#rules}

| Evento | Gravedad por defecto | Título |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed |
| `policy.violated` | warning | Policy violation blocked an action |
| `action.failed` | warning | Tool execution failed |
| `provider.fallback` | warning | LLM provider failed over to a fallback |
| `approval.rejected` | info | Action rejected by an approver |

Sustitúyelas con `rules`, y añade condiciones con `when`:

```ts
incidents: {
  notifiers,
  rules: [
    { eventType: 'run.failed', severity: 'critical', title: 'Run failed' },
    { eventType: 'tool.retry', severity: 'info', title: 'CRM is flaky', when: (event) => event.data.toolName === 'crm_lookup' },
  ],
  throttleMs: 10 * 60_000,   // same problem notified once per window
  deliveryTimeoutMs: 5_000,  // per notifier
}
```

## Garantías {#guarantees}

- **Siempre registrado.** Cada incidente se añade a su ejecución como `incident.reported`, con el resultado de cada entrega — incluso cuando se limita su frecuencia o está por debajo de la gravedad mínima.
- **Nunca rompe una ejecución.** Un notificador que falla o que es lento se captura, se corta por tiempo límite y se notifica; el agente sigue adelante. La entrega se espera, así que una ejecución espera como máximo `deliveryTimeoutMs` (10 s por defecto) por cada evento que coincide.
- **Sin avalanchas de duplicados.** Los incidentes reciben una huella (tipo de evento, agente, detalle) y se limita su frecuencia — incluso cuando el mismo problema ocurre en ejecuciones paralelas en el mismo momento.

```ts
const incidents = await sdk.getIncidents(runId);
```

## Tu propio notificador {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
