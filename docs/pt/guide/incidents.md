# Alertas de incidentes

Quando algo dá errado, você deveria ficar sabendo — com contexto suficiente para agir. O SDK observa o fluxo de eventos, transforma os eventos correspondentes em **incidentes** e os entrega por e-mail, webhook ou qualquer notificador que você escrever.

![Fluxo de incidentes](/images/incident-flow.svg){.illustration}

## E-mail em caso de falha {#email-on-failure}

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

O e-mail contém a severidade, o título, os ids da execução e do agente, e **os últimos eventos da execução** como uma linha do tempo — em texto simples e em HTML:

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

### Qualquer serviço de e-mail {#any-email-service}

`EmailIncidentNotifier` só precisa de um `EmailTransport` — um método `send`. Com SMTP via nodemailer:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

O mesmo adaptador de um único método funciona para SES, Postmark, SendGrid ou a sua API interna de e-mail.

## Chat e webhooks {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` publica `{ text }` (Slack, Mattermost); o padrão publica `{ incident }` em JSON para a sua automação.

## Regras {#rules}

| Evento | Severidade padrão | Título |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed |
| `policy.violated` | warning | Policy violation blocked an action |
| `action.failed` | warning | Tool execution failed |
| `provider.fallback` | warning | LLM provider failed over to a fallback |
| `approval.rejected` | info | Action rejected by an approver |

Substitua-as com `rules`, e adicione condições com `when`:

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

## Garantias {#guarantees}

- **Sempre registrado.** Cada incidente é acrescentado à sua execução como `incident.reported`, com o resultado de cada entrega — mesmo quando é limitado pela frequência (throttling) ou está abaixo da severidade mínima.
- **Nunca quebra uma execução.** Um notificador que falha ou é lento é capturado, interrompido por timeout e relatado; o agente continua. A entrega é aguardada, então uma execução espera no máximo `deliveryTimeoutMs` (10 s por padrão) por evento correspondente.
- **Sem avalanches de duplicatas.** Os incidentes recebem uma impressão digital (tipo de evento, agente, detalhe) e são limitados em frequência — mesmo quando o mesmo problema acontece em execuções paralelas no mesmo momento.

```ts
const incidents = await sdk.getIncidents(runId);
```

## O seu próprio notificador {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
