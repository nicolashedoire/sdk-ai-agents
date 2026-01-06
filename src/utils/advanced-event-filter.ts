import type { Event } from '../types/events.js';
import type { AdvancedEventFilter, DataFilter, MetadataFilter } from '../types/advanced-event-filter.js';

export class AdvancedEventFilterEvaluator {
  static evaluate(event: Event, filter: AdvancedEventFilter): boolean {
    let result = true;

    if (filter.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      result = result && types.includes(event.type);
    }

    if (filter.since !== undefined) {
      result = result && event.timestamp >= filter.since;
    }

    if (filter.until !== undefined) {
      result = result && event.timestamp <= filter.until;
    }

    if (filter.agentId !== undefined) {
      result = result && event.metadata?.agentId === filter.agentId;
    }

    if (filter.userId !== undefined) {
      result = result && event.metadata?.userId === filter.userId;
    }

    if (filter.sessionId !== undefined) {
      result = result && event.metadata?.sessionId === filter.sessionId;
    }

    if (filter.runId !== undefined) {
      result = result && event.runId === filter.runId;
    }

    if (filter.dataFilters && filter.dataFilters.length > 0) {
      const dataResults = filter.dataFilters.map((df) => this.evaluateDataFilter(event.data, df));
      result = this.combineResults(result, dataResults, filter.logic);
    }

    if (filter.metadataFilters && filter.metadataFilters.length > 0) {
      const metadataResults = filter.metadataFilters.map((mf) => this.evaluateMetadataFilter(event.metadata, mf));
      result = this.combineResults(result, metadataResults, filter.logic);
    }

    if (filter.not) {
      result = !result;
    }

    return result;
  }

  private static evaluateDataFilter(data: unknown, filter: DataFilter): boolean {
    const value = this.getNestedValue(data, filter.path);

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'ne':
        return value !== filter.value;
      case 'gt':
        return typeof value === 'number' && typeof filter.value === 'number' && value > filter.value;
      case 'gte':
        return typeof value === 'number' && typeof filter.value === 'number' && value >= filter.value;
      case 'lt':
        return typeof value === 'number' && typeof filter.value === 'number' && value < filter.value;
      case 'lte':
        return typeof value === 'number' && typeof filter.value === 'number' && value <= filter.value;
      case 'contains':
        return typeof value === 'string' && typeof filter.value === 'string' && value.includes(filter.value);
      case 'startsWith':
        return typeof value === 'string' && typeof filter.value === 'string' && value.startsWith(filter.value);
      case 'endsWith':
        return typeof value === 'string' && typeof filter.value === 'string' && value.endsWith(filter.value);
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

  private static evaluateMetadataFilter(metadata: Record<string, unknown> | undefined, filter: MetadataFilter): boolean {
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
        return typeof value === 'number' && typeof filter.value === 'number' && value > filter.value;
      case 'gte':
        return typeof value === 'number' && typeof filter.value === 'number' && value >= filter.value;
      case 'lt':
        return typeof value === 'number' && typeof filter.value === 'number' && value < filter.value;
      case 'lte':
        return typeof value === 'number' && typeof filter.value === 'number' && value <= filter.value;
      case 'contains':
        return typeof value === 'string' && typeof filter.value === 'string' && value.includes(filter.value);
      case 'exists':
        return value !== undefined && value !== null;
      case 'notExists':
        return value === undefined || value === null;
      default:
        return false;
    }
  }

  private static combineResults(baseResult: boolean, results: boolean[], logic?: 'and' | 'or'): boolean {
    if (results.length === 0) return baseResult;

    if (logic === 'or') {
      return baseResult && results.some((r) => r);
    }

    return baseResult && results.every((r) => r);
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

