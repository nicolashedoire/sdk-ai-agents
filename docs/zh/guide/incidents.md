# 事故告警

出了问题时，你应该得到通知——并且附带足以采取行动的上下文。SDK 会监视事件流，把匹配的事件转换成**事故**，并通过邮件、webhook 或你编写的任何通知器发送出去。

![事故处理流程](/images/incident-flow.svg){.illustration}

## 失败时发送邮件 {#email-on-failure}

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

邮件包含严重级别、标题、运行 id 和智能体 id，以及以时间线形式呈现的**这次运行的最后几个事件**——同时提供纯文本和 HTML 两种格式：

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

### 任何邮件服务 {#any-email-service}

`EmailIncidentNotifier` 只需要一个 `EmailTransport`——即一个 `send` 方法。通过 nodemailer 使用 SMTP：

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

同样的单方法适配器也适用于 SES、Postmark、SendGrid 或你们内部的邮件 API。

## 聊天工具与 webhook {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` 会发送 `{ text }`（Slack、Mattermost）；默认会以 JSON 形式发送 `{ incident }`，供你的自动化流程使用。

## 规则 {#rules}

| 事件 | 默认严重级别 | 标题 |
| --- | --- | --- |
| `run.failed` | critical | Agent run failed（智能体运行失败） |
| `policy.violated` | warning | Policy violation blocked an action（违反策略，动作被拦截） |
| `action.failed` | warning | Tool execution failed（工具执行失败） |
| `provider.fallback` | warning | LLM provider failed over to a fallback（LLM 提供商已故障转移到备用提供商） |
| `approval.rejected` | info | Action rejected by an approver（动作被审批人拒绝） |

用 `rules` 替换它们，并用 `when` 添加条件：

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

## 保障 {#guarantees}

- **始终记录。** 每一个事故都会作为 `incident.reported` 追加到它所属的运行中，并附上每一次投递的结果——即使它被节流了，或者低于最低严重级别。
- **永远不会中断运行。** 出错或缓慢的通知器会被捕获、超时并报告；智能体会继续运行。投递是会被等待的，所以对于每一个匹配的事件，运行最多等待 `deliveryTimeoutMs`（默认 10 秒）。
- **不会出现重复告警风暴。** 事故会按指纹（事件类型、智能体、细节）识别并节流——即使同一个问题在同一时刻出现在多个并行的运行中。

```ts
const incidents = await sdk.getIncidents(runId);
```

## 你自己的通知器 {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
