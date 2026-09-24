import type { EventType } from './events.js';

export interface DataFilter {
  path: string;
  operator:
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'exists'
    | 'notExists'
    | 'matches';
  value?: unknown;
  regex?: string;
}

export interface MetadataFilter {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'exists' | 'notExists';
  value?: unknown;
}

/**
 * Which events to look at (the scope: `runId`, `since`, `until`) and which of them to keep (the
 * conditions: `type`, `agentId`, `userId`, `sessionId`, each data filter and each metadata
 * filter). The conditions are combined with `logic`, then negated by `not`; the scope is never
 * negated.
 */
export interface AdvancedEventFilter {
  type?: EventType | EventType[];
  /** Scope: events at or after this time (ms since the epoch). */
  since?: number;
  /** Scope: events at or before this time. */
  until?: number;
  /** Keeps the first matching events, in time order. */
  limit?: number;
  agentId?: string;
  userId?: string;
  sessionId?: string;
  /** Scope: one run's events. Without it, every run of the store is searched. */
  runId?: string;
  dataFilters?: DataFilter[];
  metadataFilters?: MetadataFilter[];
  /** `and` (default): every condition must hold; `or`: at least one. */
  logic?: 'and' | 'or';
  /** Keeps the events in scope that do not match the conditions. */
  not?: boolean;
}

export interface AdvancedEventQueryResult {
  /** Matching events in time order, at most `limit`. */
  events: import('./events.js').Event[];
  /** Events in scope. */
  total: number;
  /** Events in scope that match, before `limit`. */
  filtered: number;
  filters: AdvancedEventFilter;
  executionTime: number;
}

export interface EventStatistics {
  /** Matching events (`limit` does not apply). */
  total: number;
  byType: Record<string, number>;
  /** Per `metadata.agentId`; events without one are not counted here. */
  byAgent: Record<string, number>;
}
