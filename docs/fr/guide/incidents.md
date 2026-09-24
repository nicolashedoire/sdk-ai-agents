# Alertes d'incident

Quand quelque chose tourne mal, vous devez en être informé — avec assez de contexte pour agir. Le SDK surveille le flux d'événements, transforme les événements qui correspondent à ses règles en **incidents** et les transmet par e-mail, par webhook ou par tout notificateur que vous écrivez.

![Circuit d'un incident](/images/incident-flow.svg){.illustration}

## Un e-mail en cas d'échec {#email-on-failure}

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

L'e-mail contient la gravité, le titre, les identifiants de l'exécution et de l'agent, et **les derniers événements de l'exécution** sous forme de chronologie — en texte brut et en HTML :

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

### N'importe quel service d'e-mail {#any-email-service}

`EmailIncidentNotifier` n'a besoin que d'un `EmailTransport` — une seule méthode `send`. Avec SMTP via nodemailer :

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

Le même adaptateur à une seule méthode fonctionne pour SES, Postmark, SendGrid ou votre API de messagerie interne.

## Messagerie instantanée et webhooks {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` envoie `{ text }` (Slack, Mattermost) ; par défaut, `{ incident }` est envoyé en JSON pour vos automatisations.

## Règles {#rules}

| Événement | Gravité par défaut | Titre |
| --- | --- | --- |
| `run.failed` | critical (critique) | Agent run failed (exécution d'agent en échec) |
| `policy.violated` | warning (avertissement) | Policy violation blocked an action (une violation de politique a bloqué une action) |
| `action.failed` | warning (avertissement) | Tool execution failed (échec de l'exécution d'un outil) |
| `provider.fallback` | warning (avertissement) | LLM provider failed over to a fallback (le fournisseur de LLM a basculé vers un repli) |
| `approval.rejected` | info (information) | Action rejected by an approver (action rejetée par un approbateur) |

Remplacez-les avec `rules`, et ajoutez des conditions avec `when` :

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

## Garanties {#guarantees}

- **Toujours enregistré.** Chaque incident est ajouté à son exécution sous forme d'événement `incident.reported`, avec l'issue de chaque envoi — même lorsqu'il est limité par la régulation de fréquence ou qu'il se situe sous la gravité minimale.
- **Ne casse jamais une exécution.** Un notificateur défaillant ou lent est intercepté, interrompu au bout de son délai et signalé ; l'agent continue. L'envoi est attendu, si bien qu'une exécution attend au plus `deliveryTimeoutMs` (10 s par défaut) par événement correspondant.
- **Pas d'avalanche de doublons.** Les incidents reçoivent une empreinte (type d'événement, agent, détail) et leur fréquence est régulée — même quand le même problème se produit au même moment dans des exécutions parallèles.

```ts
const incidents = await sdk.getIncidents(runId);
```

## Votre propre notificateur {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
