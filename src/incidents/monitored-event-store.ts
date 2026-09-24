import type { IEventStore } from '../stores/event-store.js';
import type { Event, EventFilters, EventLog } from '../types/events.js';
import { generateEventId, generateId } from '../utils/id.js';
import {
  DEFAULT_INCIDENT_RULES,
  SEVERITY_RANK,
  summarizeEvent,
  type Incident,
  type IncidentNotifier,
  type IncidentRule,
  type IncidentSeverity,
} from './incident.js';

export interface IncidentMonitorOptions {
  notifiers: IncidentNotifier[];
  rules?: IncidentRule[];
  /** Incidents below this severity are recorded but not sent. Defaults to `info`. */
  minSeverity?: IncidentSeverity;
  /** Same fingerprint within this window is recorded once. Defaults to 5 minutes. */
  throttleMs?: number;
  /** Per-notifier delivery timeout. Defaults to 10 s. */
  deliveryTimeoutMs?: number;
  /** Number of run events included in the incident timeline. Defaults to 12. */
  timelineSize?: number;
  now?: () => number;
}

/**
 * Event store decorator that turns matching events into incidents. The incident and the
 * outcome of every delivery are appended to the run as an `incident.reported` event, so the
 * audit trail shows who was told what. A failing notifier never fails the run.
 */
export class MonitoredEventStore implements IEventStore {
  readonly queryEvents?: IEventStore['queryEvents'];
  readonly getEventsByAgent?: IEventStore['getEventsByAgent'];
  readonly getEventsByUser?: IEventStore['getEventsByUser'];
  readonly getEventsBySession?: IEventStore['getEventsBySession'];
  readonly countEvents?: IEventStore['countEvents'];
  readonly checkRunId?: IEventStore['checkRunId'];
  readonly groupEventsBy?: IEventStore['groupEventsBy'];
  readonly backup?: IEventStore['backup'];
  readonly restore?: IEventStore['restore'];
  /** The wrapped store's live events: `incident.reported` events reach them too. */
  readonly subscribe?: IEventStore['subscribe'];

  private readonly rules: IncidentRule[];
  private readonly lastSent = new Map<string, number>();
  private readonly now: () => number;

  constructor(
    private readonly inner: IEventStore,
    private readonly options: IncidentMonitorOptions
  ) {
    this.rules = options.rules ?? DEFAULT_INCIDENT_RULES;
    this.now = options.now ?? Date.now;
    this.queryEvents = inner.queryEvents?.bind(inner);
    this.getEventsByAgent = inner.getEventsByAgent?.bind(inner);
    this.getEventsByUser = inner.getEventsByUser?.bind(inner);
    this.getEventsBySession = inner.getEventsBySession?.bind(inner);
    this.countEvents = inner.countEvents?.bind(inner);
    this.checkRunId = inner.checkRunId?.bind(inner);
    this.groupEventsBy = inner.groupEventsBy?.bind(inner);
    this.backup = inner.backup?.bind(inner);
    this.restore = inner.restore?.bind(inner);
    this.subscribe = inner.subscribe?.bind(inner);
  }

  async append(runId: string, event: Event): Promise<void> {
    await this.inner.append(runId, event);
    const rule = this.rules.find(
      (candidate) => candidate.eventType === event.type && (candidate.when?.(event) ?? true)
    );
    if (rule) {
      try {
        await this.report(runId, event, rule);
      } catch (error) {
        // Reporting must never break the run that produced the event.
        console.error('Incident reporting failed:', errorMessage(error));
      }
    }
  }

  getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    return this.inner.getEvents(runId, filters);
  }

  getRunIds(filters?: { since?: number; until?: number }): Promise<string[]> {
    return this.inner.getRunIds(filters);
  }

  exportEventLog(runId: string): Promise<EventLog> {
    return this.inner.exportEventLog(runId);
  }

  private async report(runId: string, event: Event, rule: IncidentRule): Promise<void> {
    const agentId =
      typeof event.metadata?.agentId === 'string' ? event.metadata.agentId : undefined;
    const detail = summarizeEvent(event);
    const fingerprint = `${event.type}:${agentId ?? 'unknown'}:${detail.slice(0, 120)}`;
    const now = this.now();
    const previous = this.lastSent.get(fingerprint);
    const throttled =
      previous !== undefined && now - previous < (this.options.throttleMs ?? 300_000);
    const belowThreshold =
      SEVERITY_RANK[rule.severity] < SEVERITY_RANK[this.options.minSeverity ?? 'info'];
    if (!throttled && !belowThreshold) {
      // Claimed before any await, so two identical incidents cannot both be sent.
      this.lastSent.set(fingerprint, now);
      this.forgetExpired(now);
    }

    const history = await this.inner.getEvents(runId);
    const incident: Incident = {
      id: `inc_${generateId()}`,
      fingerprint,
      severity: rule.severity,
      title: rule.title,
      detail,
      runId,
      ...(agentId ? { agentId } : {}),
      eventType: event.type,
      occurredAt: event.timestamp,
      timeline: history.slice(-(this.options.timelineSize ?? 12)).map((entry) => ({
        type: entry.type,
        timestamp: entry.timestamp,
        summary: summarizeEvent(entry),
      })),
    };

    const deliveries: Array<{ notifier: string; delivered: boolean; error?: string }> = [];
    if (!throttled && !belowThreshold) {
      const results = await Promise.allSettled(
        this.options.notifiers.map((notifier) => this.deliver(notifier, incident))
      );
      results.forEach((result, index) => {
        const notifier = this.options.notifiers[index]?.name ?? `notifier-${index}`;
        deliveries.push(
          result.status === 'fulfilled'
            ? { notifier, delivered: true }
            : { notifier, delivered: false, error: errorMessage(result.reason) }
        );
      });
    }

    await this.inner.append(runId, {
      id: generateEventId(),
      runId,
      type: 'incident.reported',
      timestamp: now,
      data: {
        incident,
        deliveries,
        ...(throttled ? { suppressed: 'throttled' } : {}),
        ...(belowThreshold ? { suppressed: 'below minimum severity' } : {}),
      },
      ...(event.metadata ? { metadata: event.metadata } : {}),
    });
  }

  /** Keeps the throttle map bounded: entries older than the window are useless. */
  private forgetExpired(now: number): void {
    if (this.lastSent.size < 500) return;
    const window = this.options.throttleMs ?? 300_000;
    for (const [fingerprint, sentAt] of this.lastSent) {
      if (now - sentAt >= window) {
        this.lastSent.delete(fingerprint);
      }
    }
  }

  private async deliver(notifier: IncidentNotifier, incident: Incident): Promise<void> {
    const timeoutMs = this.options.deliveryTimeoutMs ?? 10_000;
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`delivery timed out after ${timeoutMs} ms`)),
        timeoutMs
      );
    });
    try {
      await Promise.race([notifier.notify(incident), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
