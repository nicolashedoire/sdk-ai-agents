import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLEventStore, type SQLConnection } from '../stores/sql-event-store.js';
import type { Event, EventFilters, EventAggregation } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

/**
 * Mock SQL Connection for testing advanced queries.
 */
class MockSQLConnection implements SQLConnection {
  private data: Map<string, Array<{
    id: string;
    run_id: string;
    type: string;
    timestamp: number;
    data: string;
    metadata: string | null;
  }>> = new Map();

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    if (sql.includes('SELECT DISTINCT run_id')) {
      const runIds = new Set<string>();
      for (const events of this.data.values()) {
        for (const event of events) {
          runIds.add(event.run_id);
        }
      }
      return Array.from(runIds).map((id) => ({ run_id: id })) as T[];
    }

    if (sql.includes('SELECT COUNT(*)')) {
      let count = 0;
      const allEvents: Array<{
        id: string;
        run_id: string;
        type: string;
        timestamp: number;
        data: string;
        metadata: string | null;
      }> = [];
      
      for (const events of this.data.values()) {
        allEvents.push(...events);
      }

      let filtered = this.applyFiltersToEvents(allEvents, sql, params);

      return [{ count: filtered.length }] as T[];
    }

    if (sql.includes('GROUP BY')) {
      const allEvents: Array<{
        id: string;
        run_id: string;
        type: string;
        timestamp: number;
        data: string;
        metadata: string | null;
      }> = [];
      
      for (const events of this.data.values()) {
        allEvents.push(...events);
      }

      let filtered = this.applyFiltersToEvents(allEvents, sql, params);

      if (sql.includes('type as key')) {
        const groups = new Map<string, number>();
        for (const event of filtered) {
          groups.set(event.type, (groups.get(event.type) || 0) + 1);
        }
        return Array.from(groups.entries()).map(([key, count]) => ({ key, count })) as T[];
      }

      if (sql.includes("JSON_EXTRACT(metadata, '$.agentId') as key")) {
        const groups = new Map<string, number>();
        for (const event of filtered) {
          const meta = event.metadata ? JSON.parse(event.metadata) : {};
          const key = meta.agentId || 'unknown';
          groups.set(key, (groups.get(key) || 0) + 1);
        }
        return Array.from(groups.entries()).map(([key, count]) => ({ key, count })) as T[];
      }

      if (sql.includes("JSON_EXTRACT(metadata, '$.userId') as key")) {
        const groups = new Map<string, number>();
        for (const event of filtered) {
          const meta = event.metadata ? JSON.parse(event.metadata) : {};
          const key = meta.userId || 'unknown';
          groups.set(key, (groups.get(key) || 0) + 1);
        }
        return Array.from(groups.entries()).map(([key, count]) => ({ key, count })) as T[];
      }

      return [] as T[];
    }

    if (sql.includes('SELECT * FROM') || sql.includes('SELECT type') || sql.includes('SELECT JSON_EXTRACT')) {
      const allEvents: Array<{
        id: string;
        run_id: string;
        type: string;
        timestamp: number;
        data: string;
        metadata: string | null;
      }> = [];
      
      for (const events of this.data.values()) {
        allEvents.push(...events);
      }

      const filtered = this.applyFiltersToEvents(allEvents, sql, params);

      if (sql.includes('LIMIT')) {
        const limitIndex = params?.findIndex((_, i) => sql.includes(`LIMIT $${i + 1}`) || sql.includes(`LIMIT ?`));
        if (limitIndex !== undefined && limitIndex >= 0 && params) {
          const limit = params[limitIndex] as number;
          return filtered.slice(0, limit) as T[];
        }
      }

      return filtered as T[];
    }

    return [] as T[];
  }

  private applyFiltersToEvents(
    events: Array<{
      id: string;
      run_id: string;
      type: string;
      timestamp: number;
      data: string;
      metadata: string | null;
    }>,
    sql: string,
    params?: unknown[]
  ): Array<{
    id: string;
    run_id: string;
    type: string;
    timestamp: number;
    data: string;
    metadata: string | null;
  }> {
    let filtered = events;
    if (!params || params.length === 0) {
      return filtered;
    }

    // Track parameter index - must match the order in applyFiltersToSQL
    // For WHERE 1=1 queries (queryEvents), params start at index 0
    // For WHERE run_id queries (getEvents), first param is runId
    let paramIndex = 0;
    const isQueryEvents = sql.includes('WHERE 1=1');
    const isGetEvents = sql.includes('WHERE run_id');

    // Handle WHERE run_id (first param if present)
    if (isGetEvents) {
      const runId = params[paramIndex] as string;
      filtered = filtered.filter((e) => e.run_id === runId);
      paramIndex++;
    }
    // For WHERE 1=1, paramIndex stays at 0

    // Apply filters in the exact order they appear in applyFiltersToSQL:
    // 1. type (single or array)
    if (sql.includes('type IN')) {
      // Count placeholders in type IN clause - match pattern like "type IN (?, ?)"
      // The pattern is: type IN (?, ?, ...)
      const match = sql.match(/type IN \(([^)]+)\)/);
      if (match) {
        // Count ? placeholders
        const placeholderCount = (match[1].match(/\?/g) || []).length;
        if (placeholderCount > 0 && paramIndex + placeholderCount <= params.length) {
          const types = params.slice(paramIndex, paramIndex + placeholderCount) as string[];
          filtered = filtered.filter((e) => types.includes(e.type));
          paramIndex += placeholderCount;
        }
      }
    } else if (sql.includes('type =')) {
      if (paramIndex < params.length) {
        const type = params[paramIndex] as string;
        filtered = filtered.filter((e) => e.type === type);
        paramIndex++;
      }
    }

    // 2. since
    if (sql.includes('timestamp >=')) {
      const since = params[paramIndex] as number;
      filtered = filtered.filter((e) => e.timestamp >= since);
      paramIndex++;
    }

    // 3. until
    if (sql.includes('timestamp <=')) {
      const until = params[paramIndex] as number;
      filtered = filtered.filter((e) => e.timestamp <= until);
      paramIndex++;
    }

    // 4. agentId - only if no type/since/until filters were applied (they would have incremented paramIndex)
    if (sql.includes("JSON_EXTRACT(metadata, '$.agentId')") && !sql.includes('GROUP BY') && !sql.includes('as key')) {
      // If we have WHERE 1=1 and no type/since/until, agentId is at index 0
      // Otherwise it's at the current paramIndex
      if (paramIndex < params.length) {
        const agentId = params[paramIndex] as string;
        if (agentId) {
          filtered = filtered.filter((e) => {
            if (!e.metadata) return false;
            const meta = JSON.parse(e.metadata);
            return meta.agentId === agentId;
          });
        }
        paramIndex++;
      }
    }

    // 5. userId
    if (sql.includes("JSON_EXTRACT(metadata, '$.userId')") && !sql.includes('GROUP BY') && !sql.includes('as key')) {
      if (paramIndex < params.length) {
        const userId = params[paramIndex] as string;
        filtered = filtered.filter((e) => {
          if (!e.metadata) return false;
          try {
            const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
            return meta.userId === userId;
          } catch {
            return false;
          }
        });
        paramIndex++;
      }
    }

    // 6. sessionId
    if (sql.includes("JSON_EXTRACT(metadata, '$.sessionId')") && !sql.includes('GROUP BY') && !sql.includes('as key')) {
      if (paramIndex < params.length) {
        const sessionId = params[paramIndex] as string;
        filtered = filtered.filter((e) => {
          if (!e.metadata) return false;
          try {
            const meta = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
            return meta.sessionId === sessionId;
          } catch {
            return false;
          }
        });
        paramIndex++;
      }
    }

    return filtered;
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return;
    }

    if (sql.includes('INSERT INTO')) {
      const [id, runId, type, timestamp, data, metadata] = params as [
        string,
        string,
        string,
        number,
        string,
        string | null
      ];

      if (!this.data.has(runId)) {
        this.data.set(runId, []);
      }

      this.data.get(runId)!.push({
        id,
        run_id: runId,
        type,
        timestamp,
        data,
        metadata,
      });
    }
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}

describe('Advanced Event Queries', () => {
  let store: SQLEventStore;
  let mockConnection: MockSQLConnection;

  beforeEach(async () => {
    mockConnection = new MockSQLConnection();
    store = new SQLEventStore({
      connection: mockConnection,
      tableName: 'events',
    });
    await store.append('run-1', {
      id: generateEventId(),
      runId: 'run-1',
      type: 'run.started',
      timestamp: 1000,
      data: { message: 'Test' },
      metadata: { agentId: 'agent-1', userId: 'user-1', sessionId: 'session-1' },
    });

    await store.append('run-2', {
      id: generateEventId(),
      runId: 'run-2',
      type: 'run.started',
      timestamp: 2000,
      data: { message: 'Test 2' },
      metadata: { agentId: 'agent-2', userId: 'user-1', sessionId: 'session-2' },
    });

    await store.append('run-1', {
      id: generateEventId(),
      runId: 'run-1',
      type: 'intention.generated',
      timestamp: 1500,
      data: { toolCalls: [{ name: 'test' }] },
      metadata: { agentId: 'agent-1', userId: 'user-1', sessionId: 'session-1' },
    });
  });

  afterEach(async () => {
    await store.close();
  });

  describe('queryEvents', () => {
    it('should query events across all runs', async () => {
      const result = await store.queryEvents();
      expect(result.events.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter by agentId', async () => {
      const filters: EventFilters = { agentId: 'agent-1' };
      const result = await store.queryEvents(filters);
      // Should return events with agentId='agent-1'
      // run-1: 2 events (run.started with agent-1, intention.generated with agent-1)
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      expect(result.events.every((e) => e.metadata?.agentId === 'agent-1')).toBe(true);
    });

    it('should filter by userId', async () => {
      const filters: EventFilters = { userId: 'user-1' };
      const result = await store.queryEvents(filters);
      // Should return events with userId='user-1'
      // run-1: 2 events, run-2: 1 event (all have user-1)
      expect(result.events.length).toBeGreaterThanOrEqual(3);
      expect(result.events.every((e) => e.metadata?.userId === 'user-1')).toBe(true);
    });

    it('should filter by sessionId', async () => {
      const filters: EventFilters = { sessionId: 'session-1' };
      const result = await store.queryEvents(filters);
      // Should return events with sessionId='session-1' (run-1 has 2 events with session-1)
      expect(result.events.length).toBeGreaterThanOrEqual(2);
      expect(result.events.every((e) => e.metadata?.sessionId === 'session-1')).toBe(true);
    });

    it('should filter by dataQuery', async () => {
      const filters: EventFilters = {
        dataQuery: {
          field: 'message',
          operator: 'eq',
          value: 'Test',
        },
      };
      const result = await store.queryEvents(filters);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });

  describe('getEventsByAgent', () => {
    it('should get events for a specific agent', async () => {
      const events = await store.getEventsByAgent('agent-1');
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.metadata?.agentId === 'agent-1')).toBe(true);
    });
  });

  describe('getEventsByUser', () => {
    it('should get events for a specific user', async () => {
      const events = await store.getEventsByUser('user-1');
      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events.every((e) => e.metadata?.userId === 'user-1')).toBe(true);
    });
  });

  describe('getEventsBySession', () => {
    it('should get events for a specific session', async () => {
      const events = await store.getEventsBySession('session-1');
      expect(events.length).toBeGreaterThanOrEqual(2);
      expect(events.every((e) => e.metadata?.sessionId === 'session-1')).toBe(true);
    });
  });

  describe('countEvents', () => {
    it('should count events matching filters', async () => {
      const count = await store.countEvents({ agentId: 'agent-1' });
      expect(count).toBeGreaterThan(0);
    });

    it('should count all events when no filters', async () => {
      const count = await store.countEvents();
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('groupEventsBy', () => {
    it('should group events by type', async () => {
      const groups = await store.groupEventsBy('type');
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.every((g) => g.key && g.count > 0)).toBe(true);
    });

    it('should group events by agentId', async () => {
      const groups = await store.groupEventsBy('agentId');
      expect(groups.length).toBeGreaterThan(0);
    });
  });

  describe('queryEvents with aggregation', () => {
    it('should return aggregation results', async () => {
      const aggregation: EventAggregation = {
        groupBy: 'type',
        count: true,
      };
      const result = await store.queryEvents(undefined, aggregation);
      expect(result.aggregation).toBeDefined();
      expect(result.aggregation?.total).toBeGreaterThan(0);
      expect(result.aggregation?.groups).toBeDefined();
    });
  });
});

