import type {
  Event,
  EventFilters,
  EventLog,
  EventAggregation,
  EventQueryResult,
} from '../types/events.js';

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
  groupEventsBy?(
    groupBy: EventAggregation['groupBy'],
    filters?: EventFilters
  ): Promise<Array<{ key: string; count: number }>>;
  // Backup and restore methods (optional - may not be supported by all implementations)
  backup?(): Promise<BackupData>;
  restore?(backupData: BackupData): Promise<void>;
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
