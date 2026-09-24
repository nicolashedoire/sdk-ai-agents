# インシデントアラート

何かがうまくいかなかったときは、そのことを知らされるべきです。しかも、対処できるだけのコンテキストとともに。SDK はイベントの流れを監視し、ルールに一致したイベントを **インシデント** に変えて、メール、Webhook、または自分で書いた任意の通知手段で届けます。

![インシデントの流れ](/images/incident-flow.svg){.illustration}

## 失敗したらメールで知らせる {#email-on-failure}

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

メールには、重大度、タイトル、実行とエージェントの ID、そして **その実行の最後のイベント** がタイムラインとして含まれます。プレーンテキストと HTML の両方で送られます。

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

### どんなメールサービスでも {#any-email-service}

`EmailIncidentNotifier` に必要なのは `EmailTransport`、つまり `send` メソッド 1 つだけです。nodemailer を通じて SMTP を使う場合は、次のようになります。

```ts
import nodemailer from 'nodemailer';

const smtp = nodemailer.createTransport({ host: 'smtp.acme.com', port: 587, auth: { user, pass } });
const transport = { send: (message) => smtp.sendMail(message).then(() => undefined) };
```

同じ 1 メソッドのアダプターで、SES、Postmark、SendGrid、あるいは社内のメール API にも対応できます。

## チャットと Webhook {#chat-and-webhooks}

```ts
new WebhookIncidentNotifier({ url: process.env.SLACK_WEBHOOK_URL, format: 'slack' });
new WebhookIncidentNotifier({ url: 'https://ops.acme.com/hooks/agents', headers: { 'X-Token': token } });
```

`format: 'slack'` は `{ text }` を送信します（Slack、Mattermost 向け）。デフォルトでは、自動化の処理で使えるように `{ incident }` を JSON として送信します。

## ルール {#rules}

| イベント | デフォルトの重大度 | タイトル |
| --- | --- | --- |
| `run.failed` | critical（重大） | Agent run failed（エージェントの実行が失敗した） |
| `policy.violated` | warning（警告） | Policy violation blocked an action（ポリシー違反によってアクションがブロックされた） |
| `action.failed` | warning（警告） | Tool execution failed（ツールの実行が失敗した） |
| `provider.fallback` | warning（警告） | LLM provider failed over to a fallback（LLM プロバイダーがフォールバックにフェイルオーバーした） |
| `approval.rejected` | info（情報） | Action rejected by an approver（承認者がアクションを却下した） |

これらのルールは `rules` で置き換えられ、`when` で条件を追加できます。

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

## 保証 {#guarantees}

- **必ず記録される。** 各インシデントは、すべての配信の結果とともに、`incident.reported` としてその実行に追記されます。送信頻度の制限によって通知が送られなかった場合や、重大度が最小値に満たない場合も同じです。
- **実行を決して壊さない。** 失敗した通知手段や遅い通知手段は、捕捉され、タイムアウトで打ち切られ、報告されます。エージェントは動き続けます。配信は完了まで待たれるので、実行が待つのは、一致したイベント 1 つにつき最大 `deliveryTimeoutMs`（デフォルトは 10 秒）です。
- **重複した通知が殺到しない。** インシデントには、イベントの種類、エージェント、詳細から作るフィンガープリントが付けられ、送信頻度が制限されます。同じ問題が、並行して動く複数の実行で同時に起きた場合も同じです。

```ts
const incidents = await sdk.getIncidents(runId);
```

## 独自の通知手段 {#your-own-notifier}

```ts
const pager: IncidentNotifier = {
  name: 'pager',
  notify: async (incident) => {
    if (incident.severity === 'critical') await pagerDuty.trigger(incident.title, incident);
  },
};
```
