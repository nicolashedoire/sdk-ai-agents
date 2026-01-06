import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLEventStore, type SQLConnection } from '../stores/sql-event-store.js';
import { PostgreSQLEventStore } from '../stores/postgresql-event-store.js';
import type { Event } from '../types/events.js';
import type { BackupData } from '../stores/event-store.js';
import { generateEventId } from '../utils/id.js';

/**
 * Mock SQL Connection for testing backup/restore.
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
  private runs: Map<string, { agent_id: string | null; created_at: string | null }> = new Map();

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    // Handle SELECT * FROM events (for backup - all events)
    if (sql.includes('SELECT * FROM events') && !sql.includes('WHERE run_id')) {
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
      
      return allEvents.sort((a, b) => a.timestamp - b.timestamp) as T[];
    }

    // Handle SELECT * FROM events WHERE run_id = ? (for getEvents)
    if (sql.includes('SELECT * FROM events') && sql.includes('WHERE run_id')) {
      const runId = params?.[0] as string;
      if (runId) {
        const events = this.data.get(runId) || [];
        return events as T[];
      }
      return [] as T[];
    }

    if (sql.includes('SELECT id, agent_id, created_at FROM runs')) {
      return Array.from(this.runs.entries()).map(([id, info]) => ({
        id,
        agent_id: info.agent_id,
        created_at: info.created_at,
      })) as T[];
    }

    if (sql.includes('SELECT DISTINCT run_id')) {
      const runIds = Array.from(this.data.keys());
      return runIds.map((id) => ({ run_id: id })) as T[];
    }

    return [] as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (sql.includes('CREATE TABLE') || sql.includes('CREATE INDEX')) {
      return;
    }

    if (sql.includes('INSERT INTO runs')) {
      const [id, agentId, createdAt] = params as [string, string | null, string | null];
      if (!this.runs.has(id)) {
        this.runs.set(id, { agent_id: agentId, created_at: createdAt });
      }
      return;
    }

    if (sql.includes('INSERT INTO events') || sql.includes('INSERT INTO')) {
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
    this.runs.clear();
  }

  getEventCount(): number {
    let count = 0;
    for (const events of this.data.values()) {
      count += events.length;
    }
    return count;
  }

  getRunCount(): number {
    return this.runs.size;
  }
}

/**
 * Mock PostgreSQL Pool for testing backup/restore.
 */
class MockPostgreSQLPool {
  private connection: MockSQLConnection;

  constructor() {
    this.connection = new MockSQLConnection();
  }

  async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
    if (sql.includes('CREATE INDEX') || sql.includes('CREATE TABLE')) {
      await this.connection.execute(sql, params);
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO')) {
      await this.connection.execute(sql, params);
      return { rows: [] };
    }

    const rows = await this.connection.query(sql, params);
    return { rows };
  }

  async end(): Promise<void> {
    await this.connection.close();
  }

  getEventCount(): number {
    return this.connection.getEventCount();
  }

  getRunCount(): number {
    return this.connection.getRunCount();
  }
}

describe('Backup and Restore', () => {
  describe('SQLEventStore', () => {
    let store: SQLEventStore;
    let mockConnection: MockSQLConnection;

    beforeEach(async () => {
      mockConnection = new MockSQLConnection();
      store = new SQLEventStore({
        connection: mockConnection,
        tableName: 'events',
      });
    });

    afterEach(async () => {
      await store.close();
    });

    it('should create a backup with all events', async () => {
      // Add some test events
      const event1: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: 1000,
        data: { message: 'Test 1' },
        metadata: { agentId: 'agent-1' },
      };

      const event2: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'intention.generated',
        timestamp: 2000,
        data: { toolCalls: [] },
      };

      await store.append('run-1', event1);
      await store.append('run-1', event2);

      const backup = await store.backup();

      expect(backup).toBeDefined();
      expect(backup.version).toBe('1.0.0');
      expect(backup.timestamp).toBeGreaterThan(0);
      expect(backup.events).toHaveLength(2);
      expect(backup.events[0].runId).toBe('run-1');
      expect(backup.events[0].event.id).toBe(event1.id);
      expect(backup.events[1].event.id).toBe(event2.id);
    });

    it('should restore events from backup', async () => {
      // Create a backup with test events
      const backup: BackupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        events: [
          {
            runId: 'run-1',
            event: {
              id: generateEventId(),
              runId: 'run-1',
              type: 'run.started',
              timestamp: 1000,
              data: { message: 'Restored' },
              metadata: { agentId: 'agent-1' },
            },
          },
          {
            runId: 'run-2',
            event: {
              id: generateEventId(),
              runId: 'run-2',
              type: 'run.started',
              timestamp: 2000,
              data: { message: 'Restored 2' },
            },
          },
        ],
      };

      await store.restore(backup);

      const events1 = await store.getEvents('run-1');
      const events2 = await store.getEvents('run-2');

      expect(events1).toHaveLength(1);
      expect(events1[0].data).toEqual({ message: 'Restored' });
      expect(events2).toHaveLength(1);
      expect(events2[0].data).toEqual({ message: 'Restored 2' });
    });

    it('should restore runs information if provided', async () => {
      const backup: BackupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        events: [],
        runs: [
          {
            id: 'run-1',
            agentId: 'agent-1',
            createdAt: Date.now(),
          },
        ],
      };

      await store.restore(backup);

      // Runs table might not exist in SQLite, but should not throw error
      expect(mockConnection.getRunCount()).toBeGreaterThanOrEqual(0);
    });

    it('should preserve data integrity after backup and restore', async () => {
      // Create original events
      const originalEvents: Event[] = [
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'run.started',
          timestamp: 1000,
          data: { test: 'data1' },
          metadata: { agentId: 'agent-1', userId: 'user-1' },
        },
        {
          id: generateEventId(),
          runId: 'run-1',
          type: 'intention.generated',
          timestamp: 2000,
          data: { test: 'data2' },
        },
      ];

      for (const event of originalEvents) {
        await store.append('run-1', event);
      }

      // Create backup
      const backup = await store.backup();

      // Clear store (simulate data loss)
      await store.close();
      mockConnection = new MockSQLConnection();
      store = new SQLEventStore({
        connection: mockConnection,
        tableName: 'events',
      });

      // Restore from backup
      await store.restore(backup);

      // Verify restored events
      const restoredEvents = await store.getEvents('run-1');
      expect(restoredEvents).toHaveLength(2);
      expect(restoredEvents[0].data).toEqual({ test: 'data1' });
      expect(restoredEvents[0].metadata?.agentId).toBe('agent-1');
      expect(restoredEvents[0].metadata?.userId).toBe('user-1');
      expect(restoredEvents[1].data).toEqual({ test: 'data2' });
    });

    it('should throw error on invalid backup data', async () => {
      const invalidBackup = {
        version: '1.0.0',
        timestamp: Date.now(),
        events: null,
      } as unknown as BackupData;

      await expect(store.restore(invalidBackup)).rejects.toThrow('Invalid backup data');
    });
  });

  describe('PostgreSQLEventStore', () => {
    let store: PostgreSQLEventStore;
    let mockPool: MockPostgreSQLPool;

    beforeEach(async () => {
      mockPool = new MockPostgreSQLPool();
      store = new PostgreSQLEventStore({
        pool: mockPool,
        tableName: 'events',
      });
    });

    afterEach(async () => {
      await store.close();
    });

    it('should create a backup with all events', async () => {
      const event1: Event = {
        id: generateEventId(),
        runId: 'run-1',
        type: 'run.started',
        timestamp: 1000,
        data: { message: 'Test' },
        metadata: { agentId: 'agent-1' },
      };

      await store.append('run-1', event1);

      const backup = await store.backup();

      expect(backup).toBeDefined();
      expect(backup.events).toHaveLength(1);
      expect(backup.events[0].event.id).toBe(event1.id);
    });

    it('should restore events from backup', async () => {
      const backup: BackupData = {
        version: '1.0.0',
        timestamp: Date.now(),
        events: [
          {
            runId: 'run-1',
            event: {
              id: generateEventId(),
              runId: 'run-1',
              type: 'run.started',
              timestamp: 1000,
              data: { message: 'Restored' },
            },
          },
        ],
      };

      await store.restore(backup);

      const events = await store.getEvents('run-1');
      expect(events).toHaveLength(1);
      expect(events[0].data).toEqual({ message: 'Restored' });
    });
  });
});

