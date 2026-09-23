import { defaultFetch, type FetchLike } from '../utils/http.js';
import type { Incident, IncidentNotifier } from './incident.js';

/** Sends incidents as JSON to any HTTP endpoint (chat webhook, automation, ticketing). */
export class WebhookIncidentNotifier implements IncidentNotifier {
  readonly name: string;

  constructor(
    private readonly options: {
      url: string;
      headers?: Record<string, string>;
      /** `slack` posts a `{ text }` payload understood by Slack and Mattermost webhooks. */
      format?: 'json' | 'slack';
      name?: string;
      fetch?: FetchLike;
    }
  ) {
    this.name = options.name ?? 'webhook';
  }

  async notify(incident: Incident): Promise<void> {
    const fetchImpl = this.options.fetch ?? defaultFetch();
    const body =
      this.options.format === 'slack' ? { text: renderIncidentText(incident) } : { incident };
    const response = await fetchImpl(this.options.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.options.headers },
      body: JSON.stringify(body),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`webhook answered HTTP ${response.status}`);
    }
  }
}

export interface EmailMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  html: string;
}

/** Port for any email service (SMTP through nodemailer, Resend, SES, Postmark...). */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
}

/** Emails incidents through the transport of your choice. */
export class EmailIncidentNotifier implements IncidentNotifier {
  readonly name = 'email';

  constructor(
    private readonly options: {
      transport: EmailTransport;
      from: string;
      to: string[];
      subjectPrefix?: string;
    }
  ) {}

  async notify(incident: Incident): Promise<void> {
    const prefix = this.options.subjectPrefix ?? '[AI agents]';
    await this.options.transport.send({
      from: this.options.from,
      to: this.options.to,
      subject: `${prefix} ${incident.severity.toUpperCase()}: ${incident.title}`,
      text: renderIncidentText(incident),
      html: renderIncidentHtml(incident),
    });
  }
}

/** Email transport for the Resend HTTP API (https://resend.com/docs/api-reference). */
export class ResendEmailTransport implements EmailTransport {
  constructor(private readonly options: { apiKey: string; fetch?: FetchLike }) {}

  async send(message: EmailMessage): Promise<void> {
    const fetchImpl = this.options.fetch ?? defaultFetch();
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Resend answered HTTP ${response.status}`);
    }
  }
}

export function renderIncidentText(incident: Incident): string {
  return [
    `${incident.severity.toUpperCase()} — ${incident.title}`,
    incident.detail,
    '',
    `Run: ${incident.runId}`,
    ...(incident.agentId ? [`Agent: ${incident.agentId}`] : []),
    `When: ${new Date(incident.occurredAt).toISOString()}`,
    `Incident: ${incident.id} (${incident.fingerprint})`,
    '',
    'Last events:',
    ...incident.timeline.map(
      (entry) => `  ${new Date(entry.timestamp).toISOString()}  ${entry.summary}`
    ),
  ].join('\n');
}

export function renderIncidentHtml(incident: Incident): string {
  const rows = incident.timeline
    .map(
      (entry) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#667085">${escapeHtml(new Date(entry.timestamp).toISOString())}</td><td style="padding:4px 0">${escapeHtml(entry.summary)}</td></tr>`
    )
    .join('');
  const color = { info: '#2563eb', warning: '#d97706', critical: '#dc2626' }[incident.severity];
  return [
    '<div style="font-family:system-ui,sans-serif;font-size:14px;color:#101828">',
    `<p style="margin:0 0 4px;color:${color};font-weight:700;text-transform:uppercase">${escapeHtml(incident.severity)}</p>`,
    `<h2 style="margin:0 0 8px">${escapeHtml(incident.title)}</h2>`,
    `<p>${escapeHtml(incident.detail)}</p>`,
    `<p><strong>Run</strong> ${escapeHtml(incident.runId)}${incident.agentId ? ` · <strong>Agent</strong> ${escapeHtml(incident.agentId)}` : ''}</p>`,
    `<table style="border-collapse:collapse;font-size:13px">${rows}</table>`,
    '</div>',
  ].join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
