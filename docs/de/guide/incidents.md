# Incident-Benachrichtigungen

Wenn etwas schiefgeht, sollten Sie davon erfahren – mit genug Kontext, um handeln zu können. Das SDK beobachtet den Ereignisstrom, macht aus passenden Ereignissen **Incidents** und stellt sie per E-Mail, Webhook oder über jeden Notifier zu, den Sie schreiben.

![Ablauf eines Incidents](/images/incident-flow.svg){.illustration}

## E-Mail bei Fehlschlag {#email-on-failure}

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

Die E-Mail enthält den Schweregrad, den Titel, die Kennungen von Lauf und Agent und **die letzten Ereignisse des Laufs** als zeitlichen Verlauf – als reinen Text und als HTML:

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

### Jeder beliebige E-Mail-Dienst {#any-email-service}

`EmailIncidentNotifier` braucht nur einen `EmailTransport` – eine Methode `send`. Mit SMTP über nodemailer:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

Derselbe Adapter mit einer Methode funktioniert für SES, Postmark, SendGrid oder Ihre interne Mail-API.

## Chat und Webhooks {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` sendet `{ text }` (Slack, Mattermost); der Standard sendet `{ incident }` als JSON für Ihre Automatisierung.

## Regeln {#rules}

| Ereignis | Standard-Schweregrad | Titel |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed |
| `policy.violated` | warning | Policy violation blocked an action |
| `action.failed` | warning | Tool execution failed |
| `provider.fallback` | warning | LLM provider failed over to a fallback |
| `approval.rejected` | info | Action rejected by an approver |

Ersetzen Sie sie mit `rules`, und fügen Sie mit `when` Bedingungen hinzu:

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

## Garantien {#guarantees}

- **Immer aufgezeichnet.** Jeder Incident wird seinem Lauf als `incident.reported` angehängt, mit dem Ergebnis jeder Zustellung – auch wenn er gedrosselt wurde oder unter dem Mindestschweregrad liegt.
- **Bricht nie einen Lauf.** Ein fehlschlagender oder langsamer Notifier wird abgefangen, nach einem Timeout beendet und gemeldet; der Agent läuft weiter. Auf die Zustellung wird gewartet, sodass ein Lauf pro passendem Ereignis höchstens `deliveryTimeoutMs` (standardmäßig 10 s) wartet.
- **Keine Flut von Duplikaten.** Incidents erhalten einen Fingerabdruck (Ereignistyp, Agent, Detail) und werden gedrosselt – selbst wenn dasselbe Problem im selben Moment in parallelen Läufen auftritt.

```ts
const incidents = await sdk.getIncidents(runId);
```

## Ihr eigener Notifier {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
