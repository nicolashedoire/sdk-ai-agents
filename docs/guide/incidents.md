# Incident alerts

When something goes wrong, you should hear about it — with enough context to act. The SDK watches the event stream, turns matching events into **incidents** and delivers them by email, webhook or any notifier you write.

![Incident flow](/images/incident-flow.svg){.illustration}

## Email on failure

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

The email contains the severity, the title, the run and agent ids, and **the last events of the run** as a timeline — in plain text and HTML:

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

### Any email service

`EmailIncidentNotifier` only needs an `EmailTransport` — one `send` method. With SMTP through nodemailer:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

The same one-method adapter works for SES, Postmark, SendGrid or your internal mail API.

## Chat and webhooks

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` posts `{ text }` (Slack, Mattermost); the default posts `{ incident }` as JSON for your automation.

## Rules

| Event | Default severity | Title |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed |
| `policy.violated` | warning | Policy violation blocked an action |
| `action.failed` | warning | Tool execution failed |
| `provider.fallback` | warning | LLM provider failed over to a fallback |
| `approval.rejected` | info | Action rejected by an approver |

Replace them with `rules`, and add conditions with `when`:

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

## Guarantees

- **Recorded, always.** Each incident is appended to its run as `incident.reported`, with the outcome of every delivery — even when throttled or below the minimum severity.
- **Never breaks a run.** A failing or slow notifier is caught, timed out and reported; the agent keeps going. Delivery is awaited, so a run waits at most `deliveryTimeoutMs` (10 s by default) per matching event.
- **No duplicate storms.** Incidents are fingerprinted (event type, agent, detail) and throttled — even when the same problem happens in parallel runs at the same moment.

```ts
const incidents = await sdk.getIncidents(runId);
```

## Your own notifier

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
