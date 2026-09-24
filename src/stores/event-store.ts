import type {
  Event,
  EventFilters,
  EventLog,
  EventAggregation,
  EventQueryResult,
  LiveEventListener,
  LiveSubscriptionOptions,
} from '../types/events.js';

/** A listener's subscription to live events (see `ObservedEventStore`). */
export interface EventSubscription {
  /** Stops at once: the listener is not called again, events not yet delivered are dropped. */
  unsubscribe(): void;
  /**
   * Takes no new events, and resolves once the listener has settled on every event it already
   * took. Never rejects: listener errors are reported, not thrown.
   */
  close(): Promise<void>;
}

export interface IEventStore {
  append(runId: string, event: Event): Promise<void>;
  getEvents(runId: string, filters?: EventFilters): Promise<Event[]>;
  getRunIds(filters?: { since?: number; until?: number }): Promise<string[]>;
  exportEventLog(runId: string): Promise<EventLog>;
  // Advanced query methods (optional - may not be supported by all implementations)
  queryEvents?(filters?: EventFilters, aggregation?: EventAggregation): Promise<EventQueryResult>;
  getEventsByAgent?(agentId: string, filters?: Omit<EventFilters, 'agentId'>): Promise<Event[]>;
  getEventsByUser?(userId: string, filters?: Omit<EventFilters, 'userId'>): Promise<Event[]>;
  getEventsBySession?(
    sessionId: string,
    filters?: Omit<EventFilters, 'sessionId'>
  ): Promise<Event[]>;
  countEvents?(filters?: EventFilters): Promise<number>;
  /**
   * Throws if the store cannot record events under this run id (e.g. an id that cannot name
   * a file). Checked before paid work whose result would then be lost.
   */
  checkRunId?(runId: string): void;
  groupEventsBy?(
    groupBy: EventAggregation['groupBy'],
    filters?: EventFilters
  ): Promise<Array<{ key: string; count: number }>>;
  // Backup and restore methods (optional - may not be supported by all implementations)
  backup?(): Promise<BackupData>;
  restore?(backupData: BackupData): Promise<void>;
  /**
   * Live events: `listener` gets each matching event after it was appended. Present on an
   * `ObservedEventStore` and on the stores wrapping one (the SDK's store always is); needed
   * by the `onEvent` option of runs.
   */
  subscribe?(listener: LiveEventListener, options?: LiveSubscriptionOptions): EventSubscription;
}

export interface BackupData {
  version: string;
  timestamp: number;
  events: Array<{
    runId: string;
    event: Event;
  }>;
  runs?: Array<{
    id: string;
    agentId?: string;
    createdAt?: number;
  }>;
}
