import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Event, EventFilters, EventLog } from '../types/events.js';
import type { IEventStore } from './event-store.js';

export class FileEventStore implements IEventStore {
  private eventsDir: string;
  private pendingEvents: Map<string, Event[]> = new Map();
  private flushInterval: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL_MS = 100;
  private readonly FLUSH_THRESHOLD = 10;

  constructor(eventsDir = './events') {
    this.eventsDir = eventsDir;
    this.ensureEventsDir();
    this.startFlushInterval();
  }

  private async ensureEventsDir(): Promise<void> {
    try {
      await fs.mkdir(this.eventsDir, { recursive: true });
    } catch (error) {
      this.handleError('Failed to create events directory', error);
    }
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      this.flush().catch((error) => this.handleError('Failed to flush events', error));
    }, this.FLUSH_INTERVAL_MS);
  }

  private handleError(message: string, error: unknown): void {
    console.error(`${message}:`, error);
  }

  async append(runId: string, event: Event): Promise<void> {
    this.ensureEventId(event);
    this.ensureEventTimestamp(event);

    const pending = this.getOrCreatePendingEvents(runId);
    pending.push(event);

    if (pending.length >= this.FLUSH_THRESHOLD) {
      await this.flushRun(runId);
    }
  }

  private ensureEventId(event: Event): void {
    if (!event.id) {
      event.id = uuidv4();
    }
  }

  private ensureEventTimestamp(event: Event): void {
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }
  }

  private getOrCreatePendingEvents(runId: string): Event[] {
    let pending = this.pendingEvents.get(runId);
    if (!pending) {
      pending = [];
      this.pendingEvents.set(runId, pending);
    }
    return pending;
  }

  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    await this.flushRun(runId);

    const filePath = this.getEventFilePath(runId);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const events: Event[] = JSON.parse(data);
      return this.filterEvents(events, filters);
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private isFileNotFoundError(error: unknown): boolean {
    return (error as NodeJS.ErrnoException).code === 'ENOENT';
  }

  async getRunIds(filters?: { since?: number; until?: number }): Promise<string[]> {
    try {
      const files = await fs.readdir(this.eventsDir);
      const runIds: string[] = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const runId = file.replace('.json', '');
          const events = await this.getEvents(runId);

          if (events.length > 0) {
            const firstEvent = events[0];
            const lastEvent = events[events.length - 1];

            if (filters?.since && firstEvent.timestamp < filters.since) continue;
            if (filters?.until && lastEvent.timestamp > filters.until) continue;

            runIds.push(runId);
          }
        }
      }

      return runIds;
    } catch (_error) {
      return [];
    }
  }

  async exportEventLog(runId: string): Promise<EventLog> {
    const events = await this.getEvents(runId);
    if (events.length === 0) {
      throw new Error(`No events found for runId: ${runId}`);
    }

    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];

    return {
      runId,
      agentId: (firstEvent.metadata?.agentId as string) || '',
      version: (firstEvent.metadata?.agentVersion as string) || '1.0.0',
      startedAt: firstEvent.timestamp,
      completedAt: this.getCompletedAt(lastEvent),
      status: this.getStatusFromEvents(events),
      events,
      summary: this.buildEventSummary(events),
    };
  }

  private getCompletedAt(lastEvent: Event): number | undefined {
    return lastEvent.type === 'run.completed' ? lastEvent.timestamp : undefined;
  }

  private buildEventSummary(events: Event[]) {
    return {
      totalEvents: events.length,
      intentionsGenerated: this.countEventsByType(events, 'intention.generated'),
      actionsExecuted: this.countEventsByType(events, 'action.executed'),
      policiesChecked: this.countEventsByType(events, 'policy.checked'),
      toolsCalled: this.countEventsByType(events, 'tool.called'),
    };
  }

  private countEventsByType(events: Event[], type: Event['type']): number {
    return events.filter((e) => e.type === type).length;
  }

  private async flush(): Promise<void> {
    const runIds = Array.from(this.pendingEvents.keys());
    await Promise.all(runIds.map((runId) => this.flushRun(runId)));
  }

  private async flushRun(runId: string): Promise<void> {
    const pending = this.pendingEvents.get(runId);
    if (!pending || pending.length === 0) return;

    const filePath = this.getEventFilePath(runId);
    const existingEvents = await this.loadExistingEvents(filePath);
    const allEvents = [...existingEvents, ...pending];

    await fs.writeFile(filePath, JSON.stringify(allEvents, null, 2), 'utf-8');
    this.pendingEvents.set(runId, []);
  }

  private async loadExistingEvents(filePath: string): Promise<Event[]> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private getEventFilePath(runId: string): string {
    return join(this.eventsDir, `${runId}.json`);
  }

  private filterEvents(events: Event[], filters?: EventFilters): Event[] {
    if (!filters) return events;

    let filtered = events;

    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type];
      filtered = filtered.filter((e) => types.includes(e.type));
    }

    if (filters.since !== undefined) {
      const since = filters.since;
      filtered = filtered.filter((e) => e.timestamp >= since);
    }

    if (filters.until !== undefined) {
      const until = filters.until;
      filtered = filtered.filter((e) => e.timestamp <= until);
    }

    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  private getStatusFromEvents(
    events: Event[]
  ): 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' {
    const lastEvent = events[events.length - 1];
    if (lastEvent.type === 'run.completed') return 'completed';
    if (lastEvent.type === 'run.failed') return 'failed';
    if (lastEvent.type === 'run.cancelled') return 'cancelled';
    if (events.some((e) => e.type === 'run.started')) return 'running';
    return 'pending';
  }

  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush().catch((error) => this.handleError('Failed to flush events on destroy', error));
  }
}
