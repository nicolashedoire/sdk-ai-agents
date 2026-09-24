import type { Event } from '../types/events.js';
import type {
  AdvancedEventFilter,
  DataFilter,
  MetadataFilter,
} from '../types/advanced-event-filter.js';

/**
 * Evaluates an `AdvancedEventFilter` on one event: the event must be in the scope (`runId`,
 * `since`, `until`) and match the conditions (`type`, `agentId`, `userId`, `sessionId`, each
 * data filter, each metadata filter), combined with `logic` and negated by `not`.
 */
export class AdvancedEventFilterEvaluator {
  static evaluate(event: Event, filter: AdvancedEventFilter): boolean {
    return (
      AdvancedEventFilterEvaluator.inScope(event, filter) &&
      AdvancedEventFilterEvaluator.matchesConditions(event, filter)
    );
  }

  /** The scope: never negated by `not`, never combined with `or`. */
  static inScope(event: Event, filter: AdvancedEventFilter): boolean {
    return (
      (filter.runId === undefined || event.runId === filter.runId) &&
      (filter.since === undefined || event.timestamp >= filter.since) &&
      (filter.until === undefined || event.timestamp <= filter.until)
    );
  }

  static matchesConditions(event: Event, filter: AdvancedEventFilter): boolean {
    const results: boolean[] = [];

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      results.push(types.includes(event.type));
    }
    if (filter.agentId !== undefined) {
      results.push(event.metadata?.agentId === filter.agentId);
    }
    if (filter.userId !== undefined) {
      results.push(event.metadata?.userId === filter.userId);
    }
    if (filter.sessionId !== undefined) {
      results.push(event.metadata?.sessionId === filter.sessionId);
    }
    for (const dataFilter of filter.dataFilters ?? []) {
      results.push(AdvancedEventFilterEvaluator.evaluateDataFilter(event.data, dataFilter));
    }
    for (const metadataFilter of filter.metadataFilters ?? []) {
      results.push(
        AdvancedEventFilterEvaluator.evaluateMetadataFilter(event.metadata, metadataFilter)
      );
    }

    const matches =
      results.length === 0 ||
      (filter.logic === 'or' ? results.some((result) => result) : results.every((r) => r));
    return filter.not ? !matches : matches;
  }

  /**
   * Whether an event store may apply the filter's `type`, `agentId`, `userId` and `sessionId`
   * itself before the other conditions are checked: only when every condition must hold.
   */
  static canNarrowInStore(filter: AdvancedEventFilter): boolean {
    return filter.logic !== 'or' && !filter.not;
  }

  private static evaluateDataFilter(data: unknown, filter: DataFilter): boolean {
    const value = AdvancedEventFilterEvaluator.getNestedValue(data, filter.path);

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'ne':
        return value !== filter.value;
      case 'gt':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value > filter.value
        );
      case 'gte':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value >= filter.value
        );
      case 'lt':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value < filter.value
        );
      case 'lte':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value <= filter.value
        );
      case 'contains':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.includes(filter.value)
        );
      case 'startsWith':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.startsWith(filter.value)
        );
      case 'endsWith':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.endsWith(filter.value)
        );
      case 'exists':
        return value !== undefined && value !== null;
      case 'notExists':
        return value === undefined || value === null;
      case 'matches':
        if (typeof value !== 'string') return false;
        if (filter.regex) {
          try {
            const regex = new RegExp(filter.regex);
            return regex.test(value);
          } catch {
            return false;
          }
        }
        return false;
      default:
        return false;
    }
  }

  private static evaluateMetadataFilter(
    metadata: Record<string, unknown> | undefined,
    filter: MetadataFilter
  ): boolean {
    if (!metadata) {
      return filter.operator === 'notExists';
    }

    const value = metadata[filter.field];

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'ne':
        return value !== filter.value;
      case 'gt':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value > filter.value
        );
      case 'gte':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value >= filter.value
        );
      case 'lt':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value < filter.value
        );
      case 'lte':
        return (
          typeof value === 'number' && typeof filter.value === 'number' && value <= filter.value
        );
      case 'contains':
        return (
          typeof value === 'string' &&
          typeof filter.value === 'string' &&
          value.includes(filter.value)
        );
      case 'exists':
        return value !== undefined && value !== null;
      case 'notExists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  private static getNestedValue(obj: unknown, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }
}
