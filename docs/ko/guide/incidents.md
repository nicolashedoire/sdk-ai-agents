# 인시던트 알림

무언가 잘못되면, 조치할 수 있을 만큼의 맥락과 함께 그 소식을 들어야 합니다. SDK는 이벤트 스트림을 지켜보다가 조건에 맞는 이벤트를 **인시던트**로 바꾸고, 이메일, 웹훅, 또는 직접 작성한 알림기로 전달합니다.

![인시던트 흐름](/images/incident-flow.svg){.illustration}

## 실패 시 이메일 {#email-on-failure}

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

이메일에는 심각도, 제목, 실행과 에이전트의 id, 그리고 **실행의 마지막 이벤트들**이 타임라인으로 담기며, 일반 텍스트와 HTML로 제공됩니다.

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

### 어떤 이메일 서비스든 {#any-email-service}

`EmailIncidentNotifier`에는 `EmailTransport` 하나만 있으면 됩니다. `send` 메서드 하나입니다. nodemailer를 통한 SMTP의 경우는 다음과 같습니다.

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

같은 메서드 하나짜리 어댑터가 SES, Postmark, SendGrid, 또는 사내 메일 API에도 통합니다.

## 채팅과 웹훅 {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'`은 `{ text }`를 게시합니다(Slack, Mattermost). 기본값은 자동화를 위해 `{ incident }`를 JSON으로 게시합니다.

## 규칙 {#rules}

| 이벤트 | 기본 심각도 | 제목 |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed |
| `policy.violated` | warning | Policy violation blocked an action |
| `action.failed` | warning | Tool execution failed |
| `provider.fallback` | warning | LLM provider failed over to a fallback |
| `approval.rejected` | info | Action rejected by an approver |

`rules`로 이를 대체하고, `when`으로 조건을 추가하세요.

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

## 보장 {#guarantees}

- **항상 기록됩니다.** 각 인시던트는 모든 전달의 결과와 함께 `incident.reported`로 그 실행에 덧붙여집니다. 제한(throttle)되었거나 최소 심각도보다 낮을 때도 마찬가지입니다.
- **실행을 절대 망가뜨리지 않습니다.** 실패하거나 느린 알림기는 잡히고, 타임아웃되고, 보고됩니다. 에이전트는 계속 진행합니다. 전달은 기다리므로, 실행은 조건에 맞는 이벤트마다 최대 `deliveryTimeoutMs`(기본값 10초)만큼 기다립니다.
- **중복 폭주가 없습니다.** 인시던트에는 지문(이벤트 유형, 에이전트, 세부 사항)이 매겨지고 빈도가 제한됩니다. 같은 문제가 같은 순간 병렬 실행에서 일어날 때도 마찬가지입니다.

```ts
const incidents = await sdk.getIncidents(runId);
```

## 직접 만드는 알림기 {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
