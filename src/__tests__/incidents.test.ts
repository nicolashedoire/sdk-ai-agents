import { afterEach, describe, expect, it } from 'vitest';
import type { Incident, IncidentNotifier } from '../incidents/incident.js';
import {
  EmailIncidentNotifier,
  ResendEmailTransport,
  WebhookIncidentNotifier,
  type EmailMessage,
  type EmailTransport,
} from '../incidents/incident-notifiers.js';
import { MonitoredEventStore } from '../incidents/monitored-event-store.js';
import type { FetchLike } from '../utils/http.js';
import { LocalHttpServer } from './support/local-http-server.js';
import { ScriptedLLMProvider } from './support/scripted-llm-provider.js';
import { createTestSDK, type TestSDK } from './support/test-sdk.js';

/** Email service kept in memory: the outbox is the observable state. */
class OutboxTransport implements EmailTransport {
  readonly outbox: EmailMessage[] = [];
  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
  }
}

class BrokenNotifier implements IncidentNotifier {
  readonly name = 'pager';
  async notify(): Promise<void> {
    throw new Error('pager offline');
  }
}

describe('incidents', () => {
  let env: TestSDK;
  let server: LocalHttpServer | undefined;
  afterEach(async () => {
    await env.dispose();
    await server?.stop();
  });

  it('emails a failed run with its timeline and records the delivery', async () => {
    const transport = new OutboxTransport();
    const provider = new ScriptedLLMProvider().always('represent', { error: new Error('model unavailable') });
    env = createTestSDK(
      {
        retry: false,
        incidents: {
          notifiers: [
            new EmailIncidentNotifier({ transport, from: 'agents@acme.test', to: ['oncall@acme.test'] }),
            new BrokenNotifier(),
          ],
        },
      },
      provider
    );
    const agent = env.sdk.createCognitiveAgent({ name: 'analyst', model: 'test-model', limits: { maxConsecutiveFailures: 1 } });

    const result = await agent.think({ problem: 'Plan the launch' });

    expect(result.status).toBe('failed');
    expect(transport.outbox).toHaveLength(1);
    const [email] = transport.outbox;
    expect(email?.subject).toBe('[AI agents] CRITICAL: Agent run failed');
    expect(email?.to).toEqual(['oncall@acme.test']);
    expect(email?.text).toContain('run.failed: 1 consecutive operations failed');
    expect(email?.text).toContain('cognition.operation_failed: model unavailable');
    expect(email?.html).toContain('Agent run failed');

    const [incident] = await env.sdk.getIncidents(result.runId);
    expect(incident).toMatchObject({ severity: 'critical', runId: result.runId, eventType: 'run.failed' });
    const reported = (await env.sdk.getEvents(result.runId)).find((event) => event.type === 'incident.reported');
    expect(reported?.data.deliveries).toEqual([
      { notifier: 'email', delivered: true },
      { notifier: 'pager', delivered: false, error: 'pager offline' },
    ]);
    // Events appended after the failure do not reopen the run.
    expect((await env.sdk.getTrace(result.runId)).status).toBe('failed');
  });

  it('throttles repeated incidents and filters by severity', async () => {
    const transport = new OutboxTransport();
    let now = 1_000;
    env = createTestSDK();
    const monitored = new MonitoredEventStore(env.store, {
      notifiers: [new EmailIncidentNotifier({ transport, from: 'a@b.test', to: ['c@d.test'] })],
      minSeverity: 'warning',
      throttleMs: 60_000,
      now: () => now,
    });
    const append = (runId: string, type: 'run.failed' | 'approval.rejected') =>
      monitored.append(runId, { id: `${runId}-${type}`, runId, type, timestamp: now, data: { error: 'boom', reason: 'no' }, metadata: { agentId: 'a1' } });

    await append('run_1', 'run.failed');
    await append('run_2', 'run.failed');
    now += 61_000;
    await append('run_3', 'run.failed');
    await append('run_4', 'approval.rejected');

    expect(transport.outbox).toHaveLength(2);
    const suppressed = (await monitored.getEvents('run_2')).find((event) => event.type === 'incident.reported');
    expect(suppressed?.data.suppressed).toBe('throttled');
    const info = (await monitored.getEvents('run_4')).find((event) => event.type === 'incident.reported');
    expect(info?.data.suppressed).toBe('below minimum severity');
  });

  it('sends one incident when the same problem happens twice at once', async () => {
    const transport = new OutboxTransport();
    env = createTestSDK();
    const monitored = new MonitoredEventStore(env.store, {
      notifiers: [new EmailIncidentNotifier({ transport, from: 'a@b.test', to: ['c@d.test'] })],
    });
    const failure = (runId: string) =>
      monitored.append(runId, {
        id: `${runId}-failed`,
        runId,
        type: 'run.failed',
        timestamp: 1,
        data: { error: 'provider down' },
        metadata: { agentId: 'a1' },
      });

    await Promise.all([failure('run_a'), failure('run_b')]);

    expect(transport.outbox).toHaveLength(1);
  });

  it('posts Slack-compatible webhooks', async () => {
    server = new LocalHttpServer().reply({ status: 200 });
    const url = await server.start();
    const notifier = new WebhookIncidentNotifier({ url: `${url}/hooks/agents`, format: 'slack', headers: { 'X-Token': 't' } });
    env = createTestSDK();

    await notifier.notify(sampleIncident());

    expect(server.requests[0]).toMatchObject({ method: 'POST', url: '/hooks/agents' });
    expect(server.requests[0]?.headers['x-token']).toBe('t');
    expect(server.jsonBody(0)).toEqual({ text: expect.stringContaining('WARNING — Tool execution failed') });
  });

  it('sends email through the Resend API contract', async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body?: string }> = [];
    const recordingFetch: FetchLike = async (url, init) => {
      calls.push({ url, headers: init.headers, ...(init.body ? { body: init.body } : {}) });
      return { status: 200, headers: { get: () => null }, text: async () => '{"id":"email_1"}' };
    };
    const transport = new ResendEmailTransport({ apiKey: 're_test', fetch: recordingFetch });
    env = createTestSDK();

    await new EmailIncidentNotifier({ transport, from: 'agents@acme.test', to: ['ops@acme.test'], subjectPrefix: '[ACME]' }).notify(sampleIncident());

    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    expect(calls[0]?.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(calls[0]?.body ?? '{}')).toMatchObject({
      from: 'agents@acme.test',
      to: ['ops@acme.test'],
      subject: '[ACME] WARNING: Tool execution failed',
    });
  });
});

function sampleIncident(): Incident {
  return {
    id: 'inc_1',
    fingerprint: 'action.failed:a1:crm down',
    severity: 'warning',
    title: 'Tool execution failed',
    detail: 'action.failed: crm down',
    runId: 'run_9',
    agentId: 'a1',
    eventType: 'action.failed',
    occurredAt: 0,
    timeline: [{ type: 'action.failed', timestamp: 0, summary: 'action.failed: crm down' }],
  };
}
