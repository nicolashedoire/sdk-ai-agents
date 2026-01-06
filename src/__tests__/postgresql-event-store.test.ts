import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgreSQLEventStore, PostgreSQLConnection } from '../stores/postgresql-event-store.js';
import type { Event, EventFilters } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

/**
 * Mock PostgreSQL Pool for testing.
 */
class MockPostgreSQLPool {
  private data: Map<string, Array<{
    id: string;
    run_id: string;
    type: string;
    timestamp: number;
    data: any;
    metadata: any;
  }>> = new Map();
  private runs: Set<string> = new Set();

  async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
    // Handle CREATE TABLE
    if (sql.includes('CREATE TABLE')) {
      return { rows: [] };
    }

    // Handle CREATE INDEX
    if (sql.includes('CREATE INDEX')) {
      return { rows: [] };
    }

    // Handle INSERT INTO runs
    if (sql.includes('INSERT INTO runs')) {
      const runId = params?.[0] as string;
      this.runs.add(runId);
      return { rows: [] };
    }

    // Handle INSERT INTO events
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
        data: typeof data === 'string' ? JSON.parse(data) : data,
        metadata: metadata ? (typeof metadata === 'string' ? JSON.parse(metadata) : metadata) : null,
      });
      return { rows: [] };
    }

    // Handle SELECT DISTINCT run_id
    if (sql.includes('SELECT DISTINCT run_id')) {
      const runIds = Array.from(this.runs);
      return { rows: runIds.map((id) => ({ run_id: id })) };
    }

    // Handle SELECT * FROM events
    if (sql.includes('SELECT * FROM')) {
      const runId = params?.[0] as string;
      let events = this.data.get(runId) || [];

      // Apply filters - PostgreSQL uses $1, $2, etc. for parameters
      let paramIndex = 1;

      // Type filter - PostgreSQL uses "type IN ($2, $3, ...)" or "type = $2"
      if (sql.includes('type IN')) {
        // Extract types from params starting at paramIndex
        // Count how many placeholders are in the SQL
        const match = sql.match(/type IN \(([^)]+)\)/);
        if (match) {
          const placeholderCount = match[1].split(',').length;
          const types = params?.slice(paramIndex, paramIndex + placeholderCount) as string[];
          events = events.filter((e) => types.includes(e.type));
          paramIndex += placeholderCount;
        }
      } else if (sql.includes('type = $')) {
        const type = params?.[paramIndex] as string;
        events = events.filter((e) => e.type === type);
        paramIndex++;
      }

      if (sql.includes('timestamp >= $')) {
        const since = params?.[paramIndex] as number;
        events = events.filter((e) => e.timestamp >= since);
        paramIndex++;
      }

      if (sql.includes('timestamp <= $')) {
        const until = params?.[paramIndex] as number;
        events = events.filter((e) => e.timestamp <= until);
        paramIndex++;
      }

      if (sql.includes('LIMIT $')) {
        const limit = params?.[paramIndex] as number;
        events = events.slice(0, limit);
      }

      return { rows: events };
    }

    return { rows: [] };
  }

  async end(): Promise<void> {
    this.data.clear();
    this.runs.clear();
  }
}

describe('PostgreSQLEventStore', () => {
  let store: PostgreSQLEventStore;
  let mockPool: MockPostgreSQLPool;

  beforeEach(() => {
    mockPool = new MockPostgreSQLPool();
    store = new PostgreSQLEventStore({
      pool: mockPool,
      tableName: 'events',
    });
  });

  afterEach(async () => {
    await store.close();
  });

  describe('append', () => {
    it('should append an event and create run entry', async () => {
      const event: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: Date.now(),
        data: { message: 'Test' },
        metadata: { agentId: 'agent-1' },
      };

      await store.append('run-1', event);

      const events = await store.getEvents('run-1');
      expect(events.length).toBe(1);
      expect(events[0].id).toBe(event.id);
      expect(events[0].type).toBe('run.started');
    });

    it('should handle JSONB data correctly', async () => {
      const event: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'intention.generated',
        timestamp: Date.now(),
        data: { toolCalls: [{ name: 'test', arguments: '{}' }] },
        metadata: { agentId: 'agent-1' },
      };

      await store.append('run-1', event);

      const events = await store.getEvents('run-1');
      expect(events.length).toBe(1);
      expect(events[0].data).toEqual(event.data);
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
          metadata: { agentId: 'agent-1' },
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

    it('should filter events by timestamp range', async () => {
      const filters: EventFilters = {
        since: 1500,
        until: 2500,
      };

      const events = await store.getEvents('run-1', filters);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('intention.generated');
    });
  });

  describe('PostgreSQLConnection', () => {
    it('should implement SQLConnection interface', () => {
      const pool = new MockPostgreSQLPool();
      const connection = new PostgreSQLConnection(pool);

      expect(connection).toHaveProperty('query');
      expect(connection).toHaveProperty('execute');
      expect(connection).toHaveProperty('close');
    });
  });
});

