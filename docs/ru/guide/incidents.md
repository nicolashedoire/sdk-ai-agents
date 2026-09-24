# Оповещения об инцидентах

Когда что-то идёт не так, вы должны об этом узнать — с достаточным контекстом, чтобы действовать. SDK следит за потоком событий, превращает подходящие события в **инциденты** и доставляет их по электронной почте, через вебхук или через любой уведомитель, который вы напишете.

![Поток инцидентов](/images/incident-flow.svg){.illustration}

## Письмо при сбое {#email-on-failure}

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

Письмо содержит серьёзность, заголовок, идентификаторы запуска и агента, а также **последние события запуска** в виде хронологии — в виде простого текста и HTML:

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

### Любой почтовый сервис {#any-email-service}

`EmailIncidentNotifier` нужен только `EmailTransport` — один метод `send`. С SMTP через nodemailer:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

Такой же адаптер из одного метода подходит для SES, Postmark, SendGrid или вашего внутреннего почтового API.

## Чат и вебхуки {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` отправляет `{ text }` (Slack, Mattermost); по умолчанию отправляется `{ incident }` в виде JSON для вашей автоматизации.

## Правила {#rules}

| Событие | Серьёзность по умолчанию | Заголовок |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed (запуск агента завершился ошибкой) |
| `policy.violated` | warning | Policy violation blocked an action (нарушение политики заблокировало действие) |
| `action.failed` | warning | Tool execution failed (выполнение инструмента завершилось ошибкой) |
| `provider.fallback` | warning | LLM provider failed over to a fallback (провайдер LLM переключился на резервный) |
| `approval.rejected` | info | Action rejected by an approver (действие отклонено утверждающим) |

Замените их через `rules` и добавьте условия через `when`:

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

## Гарантии {#guarantees}

- **Всегда записывается.** Каждый инцидент добавляется к своему запуску как `incident.reported` с результатом каждой доставки — даже если он был подавлен ограничением частоты или его серьёзность ниже минимальной.
- **Никогда не ломает запуск.** Сбойный или медленный уведомитель перехватывается, прерывается по тайм-ауту, и об этом сообщается; агент продолжает работу. Доставка ожидается, поэтому запуск ждёт не более `deliveryTimeoutMs` (по умолчанию 10 с) на каждое подходящее событие.
- **Никаких лавин дубликатов.** У инцидентов есть отпечаток (тип события, агент, подробности), и их частота ограничивается — даже когда одна и та же проблема возникает одновременно в параллельных запусках.

```ts
const incidents = await sdk.getIncidents(runId);
```

## Ваш собственный уведомитель {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
