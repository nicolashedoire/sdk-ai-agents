import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLEventStore, type SQLConnection } from '../stores/sql-event-store.js';
import { PostgreSQLEventStore } from '../stores/postgresql-event-store.js';
import type { Event } from '../types/events.js';
import { generateEventId } from '../utils/id.js';

/**
 * Mock SQL Connection that tracks index creation.
 */
class MockSQLConnectionWithIndexTracking implements SQLConnection {
  private data: Map<string, Array<{
    id: string;
    run_id: string;
    type: string;
    timestamp: number;
    data: string;
    metadata: string | null;
  }>> = new Map();
  public createdIndexes: Set<string> = new Set();

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

    if (sql.includes('SELECT * FROM')) {
      const runId = params?.[0] as string;
      const events = this.data.get(runId) || [];
      return events as T[];
    }

    return [] as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    if (sql.includes('CREATE INDEX')) {
      // Extract index name from SQL
      const match = sql.match(/CREATE INDEX IF NOT EXISTS (\w+)/);
      if (match) {
        this.createdIndexes.add(match[1]);
      }
      return;
    }

    if (sql.includes('CREATE TABLE')) {
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
    this.createdIndexes.clear();
  }
}

/**
 * Mock PostgreSQL Pool that tracks index creation.
 */
class MockPostgreSQLPoolWithIndexTracking {
  private connection: MockSQLConnectionWithIndexTracking;

  constructor() {
    this.connection = new MockSQLConnectionWithIndexTracking();
  }

  async query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> {
    if (sql.includes('CREATE INDEX')) {
      await this.connection.execute(sql, params);
      return { rows: [] };
    }

    if (sql.includes('CREATE TABLE')) {
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

  getCreatedIndexes(): Set<string> {
    return this.connection.createdIndexes;
  }
}

describe('Indexing for Performance', () => {
  describe('SQLEventStore', () => {
    let store: SQLEventStore;
    let mockConnection: MockSQLConnectionWithIndexTracking;

    beforeEach(async () => {
      mockConnection = new MockSQLConnectionWithIndexTracking();
      store = new SQLEventStore({
        connection: mockConnection,
        tableName: 'events',
      });
    });

    afterEach(async () => {
      await store.close();
    });

    it('should create basic indexes on initialization', async () => {
      // Schema is initialized in constructor
      // Wait a bit for async initialization
      await new Promise((resolve) => setTimeout(resolve, 10));

      const indexes = Array.from(mockConnection.createdIndexes);
      
      // Should have at least the basic indexes
      expect(indexes.length).toBeGreaterThan(0);
      
      // Check for common index names
      const indexNames = indexes.join(' ');
      expect(indexNames).toContain('run_id');
      expect(indexNames).toContain('type');
      expect(indexNames).toContain('timestamp');
    });

    it('should create composite indexes for common query patterns', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const indexes = Array.from(mockConnection.createdIndexes);
      const indexNames = indexes.join(' ');
      
      // Should have composite index for run_id + timestamp
      expect(indexNames).toContain('run_timestamp');
      
      // Should have composite index for type + timestamp
      expect(indexNames).toContain('type_timestamp');
    });
  });

  describe('PostgreSQLEventStore', () => {
    let store: PostgreSQLEventStore;
    let mockPool: MockPostgreSQLPoolWithIndexTracking;

    beforeEach(async () => {
      mockPool = new MockPostgreSQLPoolWithIndexTracking();
      store = new PostgreSQLEventStore({
        pool: mockPool,
        tableName: 'events',
      });
    });

    afterEach(async () => {
      await store.close();
    });

    it('should create GIN indexes for JSONB columns', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const indexes = Array.from(mockPool.getCreatedIndexes());
      const indexNames = indexes.join(' ');
      
      // Should have GIN indexes for JSONB queries
      expect(indexNames).toContain('metadata_gin');
      expect(indexNames).toContain('data_gin');
    });

    it('should create indexes on specific JSONB fields', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const indexes = Array.from(mockPool.getCreatedIndexes());
      const indexNames = indexes.join(' ');
      
      // Should have indexes on common metadata fields
      expect(indexNames).toContain('metadata_agent_id');
      expect(indexNames).toContain('metadata_user_id');
      expect(indexNames).toContain('metadata_session_id');
    });

    it('should create composite indexes for common query patterns', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));

      const indexes = Array.from(mockPool.getCreatedIndexes());
      const indexNames = indexes.join(' ');
      
      // Should have composite indexes
      expect(indexNames).toContain('run_timestamp');
      expect(indexNames).toContain('type_timestamp');
    });
  });
});

