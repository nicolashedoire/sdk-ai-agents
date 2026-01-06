import type { EventType } from './events.js';

export interface DataFilter {
  path: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith' | 'exists' | 'notExists' | 'matches';
  value?: unknown;
  regex?: string;
}

export interface MetadataFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists' | 'notExists';
  value?: unknown;
}

export interface AdvancedEventFilter {
  type?: EventType | EventType[];
  since?: number;
  until?: number;
  limit?: number;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  runId?: string;
  dataFilters?: DataFilter[];
  metadataFilters?: MetadataFilter[];
  logic?: 'and' | 'or';
  not?: boolean;
}

export interface AdvancedEventQueryResult {
  events: import('./events.js').Event[];
  total: number;
  filtered: number;
  filters: AdvancedEventFilter;
  executionTime: number;
}

export interface EventStatistics {
  total: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
}

