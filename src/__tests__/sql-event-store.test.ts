import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLEventStore, type SQLConnection } from '../stores/sql-event-store.js';
import type { Event, EventFilters } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

/**
 * Mock SQL Connection for testing.
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
    // Simple mock implementation for testing
    if (sql.includes('SELECT DISTINCT run_id')) {
      const runIds = new Set<string>();
      for (const events of this.data.values()) {
        for (const event of events) {
          if (!params || params.length === 0) {
            runIds.add(event.run_id);
          } else {
            // Apply filters
            let matches = true;
            if (params[0] !== undefined && event.timestamp < (params[0] as number)) {
              matches = false;
            }
            if (params[1] !== undefined && event.timestamp > (params[1] as number)) {
              matches = false;
            }
            if (matches) {
              runIds.add(event.run_id);
            }
          }
        }
      }
      return Array.from(runIds).map((id) => ({ run_id: id })) as T[];
    }

    if (sql.includes('SELECT * FROM')) {
      const runId = params?.[0] as string;
      const events = this.data.get(runId) || [];

      // Apply filters
      let filtered = events;
      let paramIndex = 1;

      if (sql.includes('type IN')) {
        const types = params?.slice(paramIndex, paramIndex + (params[paramIndex] as string[]).length) as string[];
        filtered = filtered.filter((e) => types.includes(e.type));
        paramIndex += types.length;
      } else if (sql.includes('type =')) {
        const type = params?.[paramIndex] as string;
        filtered = filtered.filter((e) => e.type === type);
        paramIndex++;
      }

      if (sql.includes('timestamp >=')) {
        const since = params?.[paramIndex] as number;
        filtered = filtered.filter((e) => e.timestamp >= since);
        paramIndex++;
      }

      if (sql.includes('timestamp <=')) {
        const until = params?.[paramIndex] as number;
        filtered = filtered.filter((e) => e.timestamp <= until);
        paramIndex++;
      }

      if (sql.includes('LIMIT')) {
        const limit = params?.[paramIndex] as number;
        filtered = filtered.slice(0, limit);
      }

      return filtered as T[];
    }

    return [] as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (sql.includes('CREATE TABLE')) {
      // Schema initialization - no-op for mock
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

  // Helper for testing
  clear(): void {
    this.data.clear();
  }
}

describe('SQLEventStore', () => {
  let store: SQLEventStore;
  let mockConnection: MockSQLConnection;

  beforeEach(() => {
    mockConnection = new MockSQLConnection();
    store = new SQLEventStore({
      connection: mockConnection,
      tableName: 'events',
    });
  });

  afterEach(async () => {
    await store.close();
  });

  describe('append', () => {
    it('should append an event', async () => {
      const event: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: Date.now(),
        data: { message: 'Test' },
      };

      await store.append('run-1', event);

      const events = await store.getEvents('run-1');
      expect(events.length).toBe(1);
      expect(events[0].id).toBe(event.id);
      expect(events[0].type).toBe('run.started');
    });

    it('should append multiple events', async () => {
      const event1: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: Date.now(),
        data: {},
      };

      const event2: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'intention.generated',
        timestamp: Date.now() + 100,
        data: {},
      };

      await store.append('run-1', event1);
      await store.append('run-1', event2);

      const events = await store.getEvents('run-1');
      expect(events.length).toBe(2);
    });
  });

  describe('getEvents', () => {
    beforeEach(async () => {
      const events: Event[] = [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 2000,
          data: {},
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'action.executed',
          timestamp: 3000,
          data: {},
        },
      ];

      for (const event of events) {
        await store.append('run-1', event);
      }
    });

    it('should return all events for a run', async () => {
      const events = await store.getEvents('run-1');
      expect(events.length).toBe(3);
    });

    it('should filter events by type', async () => {
      const filters: EventFilters = {
        type: 'intention.generated',
      };

      const events = await store.getEvents('run-1', filters);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('intention.generated');
    });

    it('should filter events by multiple types', async () => {
      const filters: EventFilters = {
        type: ['run.started', 'action.executed'],
      };

      const events = await store.getEvents('run-1', filters);
      expect(events.length).toBe(2);
    });

    it('should filter events by timestamp range', async () => {
      const filters: EventFilters = {
        since: 1500,
        until: 2500,
      };

      const events = await store.getEvents('run-1', filters);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('intention.generated');
    });

    it('should limit number of events', async () => {
      const filters: EventFilters = {
        limit: 2,
      };

      const events = await store.getEvents('run-1', filters);
      expect(events.length).toBe(2);
    });
  });

  describe('getRunIds', () => {
    beforeEach(async () => {
      await store.append('run-1', {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: 1000,
        data: {},
      });

      await store.append('run-2', {
        id: generateEventId(),
        runId: 'run-2',
        type: 'run.started',
        timestamp: 2000,
        data: {},
      });
    });

    it('should return all run IDs', async () => {
      const runIds = await store.getRunIds();
      expect(runIds.length).toBe(2);
      expect(runIds).toContain('run-1');
      expect(runIds).toContain('run-2');
    });

    it('should filter run IDs by timestamp', async () => {
      const runIds = await store.getRunIds({ since: 1500 });
      expect(runIds.length).toBe(1);
      expect(runIds).toContain('run-2');
    });
  });

  describe('exportEventLog', () => {
    it('should export event log', async () => {
      await store.append('run-1', {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: 1000,
        data: {},
        metadata: { agentId: 'agent-1', agentVersion: '1.0.0' },
      });

      await store.append('run-1', {
        id: generateEventId(),
        runId: 'run-1',
        type: 'intention.generated',
        timestamp: 2000,
        data: {},
      });

      await store.append('run-1', {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.completed',
        timestamp: 3000,
        data: {},
      });

      const log = await store.exportEventLog('run-1');

      expect(log.runId).toBe('run-1');
      expect(log.agentId).toBe('agent-1');
      expect(log.version).toBe('1.0.0');
      expect(log.status).toBe('completed');
      expect(log.events.length).toBe(3);
      expect(log.summary.totalEvents).toBe(3);
      expect(log.summary.intentionsGenerated).toBe(1);
    });

    it('should throw error if no events found', async () => {
      await expect(store.exportEventLog('non-existent')).rejects.toThrow();
    });
  });
});

