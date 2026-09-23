import { z } from 'zod';
import type { Event, EventType } from '../types/events.js';

export const incidentSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

export const SEVERITY_RANK: Record<IncidentSeverity, number> = { info: 0, warning: 1, critical: 2 };

/** What notifiers receive: enough to understand the incident without opening the store. */
export const incidentSchema = z.object({
  id: z.string(),
  /** Stable key used to group repeated occurrences of the same problem. */
  fingerprint: z.string(),
  severity: incidentSeveritySchema,
  title: z.string(),
  detail: z.string(),
  runId: z.string(),
  agentId: z.string().optional(),
  eventType: z.string(),
  occurredAt: z.number(),
  /** Last events of the run, oldest first, so the recipient sees what led to the incident. */
  timeline: z.array(z.object({ type: z.string(), timestamp: z.number(), summary: z.string() })),
});

export type Incident = z.infer<typeof incidentSchema>;

export interface IncidentRule {
  eventType: EventType;
  severity: IncidentSeverity;
  title: string;
  /** Extra condition on the event (defaults to always). */
  when?: (event: Event) => boolean;
}

/** Failures that deserve a human look by default. */
export const DEFAULT_INCIDENT_RULES: IncidentRule[] = [
  { eventType: 'run.failed', severity: 'critical', title: 'Agent run failed' },
  {
    eventType: 'policy.violated',
    severity: 'warning',
    title: 'Policy violation blocked an action',
  },
  { eventType: 'action.failed', severity: 'warning', title: 'Tool execution failed' },
  { eventType: 'approval.rejected', severity: 'info', title: 'Action rejected by an approver' },
  {
    eventType: 'provider.fallback',
    severity: 'warning',
    title: 'LLM provider failed over to a fallback',
  },
];

/** Port for any destination: email, chat webhook, pager, ticketing system. */
export interface IncidentNotifier {
  readonly name: string;
  notify(incident: Incident): Promise<void>;
}

/** One-line, human-readable description of an event for timelines and messages. */
export function summarizeEvent(event: Event): string {
  const data = event.data;
  const pick = (key: string): string | undefined => {
    const value = data[key];
    return typeof value === 'string' && value.trim() !== '' ? value : undefined;
  };
  const detail =
    pick('error') ??
    pick('reason') ??
    pick('toolName') ??
    pick('operation') ??
    pick('usedProvider');
  return detail ? `${event.type}: ${detail}` : event.type;
}
