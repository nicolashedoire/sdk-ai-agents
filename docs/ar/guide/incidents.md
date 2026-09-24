# تنبيهات الحوادث

حين يسوء أمر ما، ينبغي أن تعلم به — مع سياق كافٍ للتصرّف. تراقب حزمة SDK مسار الأحداث، وتحوّل الأحداث المطابقة إلى **حوادث**، وتوصلها بالبريد الإلكتروني، أو عبر webhook، أو بأي مُبلِّغ تكتبه.

![مسار الحوادث](/images/incident-flow.svg){.illustration}

## بريد إلكتروني عند الفشل {#email-on-failure}

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

يحتوي البريد الإلكتروني على درجة الخطورة، والعنوان، ومعرّفَي التشغيل والوكيل، و**آخر أحداث التشغيل** في صورة خط زمني — بنص عادي وبـ HTML:

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

### أي خدمة بريد إلكتروني {#any-email-service}

لا يحتاج `EmailIncidentNotifier` إلا إلى `EmailTransport` — دالة `send` واحدة. مع SMTP عبر nodemailer:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

يعمل المحوِّل نفسه ذو الدالة الواحدة مع SES، أو Postmark، أو SendGrid، أو واجهة API البريدية الداخلية لديك.

## المحادثة وwebhooks {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

ينشر `format: 'slack'` الكائن `{ text }` (Slack، Mattermost)؛ أما الافتراضي فينشر `{ incident }` بصيغة JSON من أجل أتمتتك.

## القواعد {#rules}

| الحدث | درجة الخطورة الافتراضية | العنوان |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed (فشل تشغيل الوكيل) |
| `policy.violated` | warning | Policy violation blocked an action (انتهاك سياسة حظر إجراءً) |
| `action.failed` | warning | Tool execution failed (فشل تنفيذ الأداة) |
| `provider.fallback` | warning | LLM provider failed over to a fallback (تحوّل مزوّد النموذج اللغوي إلى البديل) |
| `approval.rejected` | info | Action rejected by an approver (رفض أحد الموافقين الإجراء) |

استبدلها بـ `rules`، وأضف شروطًا بـ `when`:

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

## الضمانات {#guarantees}

- **مُسجَّلة، دائمًا.** يُلحَق كل حادث بتشغيله بوصفه `incident.reported`، مع نتيجة كل عملية توصيل — حتى حين يُكبَح أو يكون دون الحدّ الأدنى لدرجة الخطورة.
- **لا يُفسد تشغيلًا أبدًا.** يُلتقَط المُبلِّغ الفاشل أو البطيء، وتنتهي مهلته، ويُبلَّغ عنه؛ ويواصل الوكيل عمله. يُنتظَر التوصيل، فلا ينتظر التشغيل أكثر من `deliveryTimeoutMs` (10 ثوانٍ افتراضيًا) لكل حدث مطابق.
- **لا عواصف من التكرار.** تُعطى الحوادث بصمة (نوع الحدث، والوكيل، والتفصيل) وتُكبَح — حتى حين تحدث المشكلة نفسها في عمليات تشغيل متوازية في اللحظة نفسها.

```ts
const incidents = await sdk.getIncidents(runId);
```

## مُبلِّغك الخاص {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
