# घटना अलर्ट

जब कुछ गलत होता है, तो आपको इसकी ख़बर मिलनी चाहिए — कार्रवाई करने लायक पूरे संदर्भ के साथ। SDK इवेंट स्ट्रीम पर नज़र रखता है, मेल खाने वाले इवेंट्स को **घटनाओं** (incidents) में बदलता है और उन्हें ईमेल, वेबहुक या आपके लिखे किसी भी notifier से भेजता है।

![घटना का प्रवाह](/images/incident-flow.svg){.illustration}

## विफलता पर ईमेल {#email-on-failure}

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

ईमेल में गंभीरता, शीर्षक, run और एजेंट के ids, और **run के आखिरी इवेंट** एक समय-रेखा के रूप में होते हैं — सादे टेक्स्ट और HTML में:

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

### कोई भी ईमेल सेवा {#any-email-service}

`EmailIncidentNotifier` को सिर्फ़ एक `EmailTransport` चाहिए — एक `send` method। nodemailer के ज़रिए SMTP के साथ:

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

यही एक-method वाला adapter SES, Postmark, SendGrid या आपकी आंतरिक मेल API के लिए काम करता है।

## चैट और वेबहुक {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` `{ text }` पोस्ट करता है (Slack, Mattermost); डिफ़ॉल्ट आपके ऑटोमेशन के लिए `{ incident }` को JSON के रूप में पोस्ट करता है।

## नियम {#rules}

| इवेंट | डिफ़ॉल्ट गंभीरता | शीर्षक |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed (एजेंट का run विफल हुआ) |
| `policy.violated` | warning | Policy violation blocked an action (नीति के उल्लंघन ने एक कार्रवाई रोकी) |
| `action.failed` | warning | Tool execution failed (टूल का चलना विफल हुआ) |
| `provider.fallback` | warning | LLM provider failed over to a fallback (LLM प्रदाता फ़ॉलबैक पर गया) |
| `approval.rejected` | info | Action rejected by an approver (मंज़ूरी देने वाले ने कार्रवाई ठुकराई) |

इन्हें `rules` से बदलें, और `when` से शर्तें जोड़ें:

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

## गारंटियाँ {#guarantees}

- **हमेशा दर्ज।** हर घटना उसके run में `incident.reported` के रूप में जुड़ती है, हर डिलीवरी के नतीजे के साथ — तब भी जब उसे throttle किया गया हो या वह न्यूनतम गंभीरता से नीचे हो।
- **run को कभी नहीं तोड़ता।** विफल या धीमे notifier को पकड़ा जाता है, उसका timeout होता है और उसकी रिपोर्ट होती है; एजेंट चलता रहता है। डिलीवरी का इंतज़ार किया जाता है, इसलिए कोई run हर मेल खाने वाले इवेंट पर ज़्यादा से ज़्यादा `deliveryTimeoutMs` (डिफ़ॉल्ट रूप से 10 s) इंतज़ार करता है।
- **डुप्लिकेट की बौछार नहीं।** घटनाओं का fingerprint बनाया जाता है (इवेंट का टाइप, एजेंट, विवरण) और उन्हें throttle किया जाता है — तब भी जब वही समस्या एक ही पल में समानांतर runs में हो।

```ts
const incidents = await sdk.getIncidents(runId);
```

## आपका अपना notifier {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
