import { ValidationError } from '../errors/index.js';
import type { Event, EventAggregation, EventFilters, EventQueryResult } from '../types/events.js';

/** A `dataQuery` or `metadataQuery` of `EventFilters`. */
export type FieldQuery = NonNullable<EventFilters['dataQuery']>;

/** Names of letters, digits and `_` separated by dots: a path, never SQL. */
const FIELD_PATH = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

/**
 * The keys a field query reads (`a.b` → `['a', 'b']`), after checking the query: a field path
 * that is not a dotted name, an unknown operator, or a value the operator cannot compare is
 * refused with a `ValidationError` (stores bind values and paths, never write them into SQL).
 */
export function fieldQueryPath(query: FieldQuery, name: 'dataQuery' | 'metadataQuery'): string[] {
  if (typeof query.field !== 'string' || !FIELD_PATH.test(query.field)) {
    throw new ValidationError(
      `${name}.field`,
      `${JSON.stringify(String(query.field).slice(0, 80))} is not a field path: use names of letters, digits and "_" separated by "."`
    );
  }
  switch (query.operator) {
    case 'eq':
    case 'ne':
      if (!isScalar(query.value)) {
        throw new ValidationError(
          `${name}.value`,
          `${query.operator} compares a string, a number, a boolean or null`
        );
      }
      break;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      if (typeof query.value !== 'number' || !Number.isFinite(query.value)) {
        throw new ValidationError(`${name}.value`, `${query.operator} compares a finite number`);
      }
      break;
    case 'contains':
      if (typeof query.value !== 'string') {
        throw new ValidationError(`${name}.value`, 'contains looks for a string');
      }
      break;
    case 'exists':
      break;
    default:
      throw new ValidationError(
        `${name}.operator`,
        `unknown operator ${JSON.stringify(String(query.operator))}: use eq, ne, gt, gte, lt, lte, contains or exists`
      );
  }
  return query.field.split('.');
}

/** Checks the field queries of filters once, before any event is read. */
export function checkEventFilters(filters?: EventFilters): void {
  if (filters?.dataQuery) fieldQueryPath(filters.dataQuery, 'dataQuery');
  if (filters?.metadataQuery) fieldQueryPath(filters.metadataQuery, 'metadataQuery');
}

/**
 * Whether an event matches filters, with the meaning every built-in store gives them: `eq` and
 * `ne` compare a value of the same JSON type (a missing field is `ne` anything), `gt`… compare
 * numbers only, `contains` looks for a substring in a string (case-sensitive), `exists` wants
 * a value that is not null.
 */
export function matchesEventFilters(event: Event, filters?: EventFilters): boolean {
  if (!filters) return true;
  if (filters.type) {
    const types = Array.isArray(filters.type) ? filters.type : [filters.type];
    if (!types.includes(event.type)) return false;
  }
  if (filters.since !== undefined && event.timestamp < filters.since) return false;
  if (filters.until !== undefined && event.timestamp > filters.until) return false;
  if (filters.agentId && event.metadata?.agentId !== filters.agentId) return false;
  if (filters.userId && event.metadata?.userId !== filters.userId) return false;
  if (filters.sessionId && event.metadata?.sessionId !== filters.sessionId) return false;
  if (filters.dataQuery && !matchesFieldQuery(event.data, filters.dataQuery, 'dataQuery')) {
    return false;
  }
  if (
    filters.metadataQuery &&
    !matchesFieldQuery(event.metadata, filters.metadataQuery, 'metadataQuery')
  ) {
    return false;
  }
  return true;
}

function matchesFieldQuery(
  root: unknown,
  query: FieldQuery,
  name: 'dataQuery' | 'metadataQuery'
): boolean {
  let value: unknown = root;
  for (const key of fieldQueryPath(query, name)) {
    value =
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)[key]
        : undefined;
  }
  const expected = query.value;
  switch (query.operator) {
    case 'eq':
      return value === expected;
    case 'ne':
      return value !== expected;
    case 'gt':
      return typeof value === 'number' && value > (expected as number);
    case 'gte':
      return typeof value === 'number' && value >= (expected as number);
    case 'lt':
      return typeof value === 'number' && value < (expected as number);
    case 'lte':
      return typeof value === 'number' && value <= (expected as number);
    case 'contains':
      return typeof value === 'string' && value.includes(expected as string);
    case 'exists':
      return value !== undefined && value !== null;
  }
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

/** Aggregates events in memory: a count, and counts per type, id, day or hour. */
export function aggregateEvents(
  events: Event[],
  aggregation: EventAggregation
): EventQueryResult['aggregation'] {
  const result: EventQueryResult['aggregation'] = {};

  if (aggregation.count) {
    result.total = events.length;
  }

  if (aggregation.groupBy) {
    const groups = new Map<string, number>();

    for (const event of events) {
      let key: string;

      switch (aggregation.groupBy) {
        case 'type':
          key = event.type;
          break;
        case 'agentId':
          key = (event.metadata?.agentId as string) || 'unknown';
          break;
        case 'userId':
          key = (event.metadata?.userId as string) || 'unknown';
          break;
        case 'sessionId':
          key = (event.metadata?.sessionId as string) || 'unknown';
          break;
        case 'day':
          key = new Date(event.timestamp).toISOString().split('T')[0] ?? '';
          break;
        case 'hour': {
          const date = new Date(event.timestamp);
          key = `${date.toISOString().split('T')[0]} ${date.getHours()}:00:00`;
          break;
        }
        default:
          key = 'unknown';
      }

      groups.set(key, (groups.get(key) || 0) + 1);
    }

    result.groups = Array.from(groups.entries()).map(([key, count]) => ({ key, count }));
  }

  return result;
}

/**
 * The events of several runs in time order. Events of the same millisecond keep the order of
 * their runs (by run id) and, within a run, the order the run recorded them: event ids are
 * random and would shuffle a run.
 */
export function acrossRunsInTimeOrder(runs: Iterable<[runId: string, events: Event[]]>): Event[] {
  const ordered: Event[] = [];
  const byRunId = [...runs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  for (const [, events] of byRunId) {
    // A loop, not push(...events): a spread of a very long run would overflow the stack.
    for (const event of events) ordered.push(event);
  }
  // Array.prototype.sort is stable: ties keep the run-then-position order built above.
  return ordered.sort((a, b) => a.timestamp - b.timestamp);
}
