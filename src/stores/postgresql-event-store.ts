import type { SQLConnection, SQLEventStoreConfig } from './sql-event-store.js';
import type { Event, EventFilters, EventAggregation, EventQueryResult } from '../types/events.js';
import type { BackupData } from './event-store.js';
import { SQLEventStore } from './sql-event-store.js';

export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  connectionString?: string;
}

/**
 * PostgreSQL-specific connection wrapper for SQLEventStore.
 * This uses pg (node-postgres) for PostgreSQL support.
 */
/** The subset of `pg.Pool` the store uses (a real `pg.Pool` satisfies it). */
export interface PostgreSQLPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  end(): Promise<void>;
}

export class PostgreSQLConnection implements SQLConnection {
  private pool: PostgreSQLPool;

  constructor(pool: PostgreSQLPool) {
    this.pool = pool;
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const result = await this.pool.query(sql, params);
    return result.rows as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.pool.query(sql, params);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * PostgreSQL implementation of Event Store.
 * Uses pg (node-postgres) for PostgreSQL database access.
 */
export class PostgreSQLEventStore extends SQLEventStore {
  constructor(
    config: Omit<SQLEventStoreConfig, 'connection'> & { pool: PostgreSQLPool; tableName?: string }
  ) {
    // pool is used via connection, no need to store separately
    const connection = new PostgreSQLConnection(config.pool);
    super({
      connection,
      tableName: config.tableName,
    });
  }

  /**
   * Override schema initialization for PostgreSQL-specific syntax.
   */
  protected async initializeSchema(connection: SQLConnection): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id VARCHAR(255) PRIMARY KEY,
        run_id VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        timestamp BIGINT NOT NULL,
        data JSONB NOT NULL,
        metadata JSONB,
        CONSTRAINT events_run_id_fk FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
      )
    `;

    // Create indexes for common queries
    const createIndexesSQL = [
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_run_id ON ${this.tableName}(run_id)`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_type ON ${this.tableName}(type)`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_timestamp ON ${this.tableName}(timestamp)`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_run_timestamp ON ${this.tableName}(run_id, timestamp)`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_type_timestamp ON ${this.tableName}(type, timestamp)`,
      // GIN indexes for JSONB queries (PostgreSQL-specific)
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_metadata_gin ON ${this.tableName} USING GIN (metadata)`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_data_gin ON ${this.tableName} USING GIN (data)`,
      // Indexes on specific JSONB fields for common queries
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_metadata_agent_id ON ${this.tableName} ((metadata->>'agentId')) WHERE metadata->>'agentId' IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_metadata_user_id ON ${this.tableName} ((metadata->>'userId')) WHERE metadata->>'userId' IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS ${this.indexPrefix}_metadata_session_id ON ${this.tableName} ((metadata->>'sessionId')) WHERE metadata->>'sessionId' IS NOT NULL`,
    ];

    // Create runs table if it doesn't exist (for foreign key reference)
    const createRunsTableSQL = `
      CREATE TABLE IF NOT EXISTS runs (
        id VARCHAR(255) PRIMARY KEY,
        agent_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    await connection.execute(createRunsTableSQL);
    await connection.execute(createTableSQL);

    for (const indexSQL of createIndexesSQL) {
      await connection.execute(indexSQL);
    }
  }

  /**
   * Override append to handle PostgreSQL-specific JSON handling.
   */
  async append(runId: string, event: Event): Promise<void> {
    // Ensure run exists in runs table
    await this.ensureRunExists(runId, event.metadata?.agentId as string | undefined);

    const sql = `
      INSERT INTO ${this.tableName} (id, run_id, type, timestamp, data, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      ON CONFLICT (id) DO NOTHING
    `;

    const params = [
      event.id,
      runId,
      event.type,
      event.timestamp,
      JSON.stringify(event.data),
      event.metadata ? JSON.stringify(event.metadata) : null,
    ];

    await this.connection.execute(sql, params);
  }

  /**
   * Ensures a run exists in the runs table.
   */
  private async ensureRunExists(runId: string, agentId?: string): Promise<void> {
    const sql = `
      INSERT INTO runs (id, agent_id)
      VALUES ($1, $2)
      ON CONFLICT (id) DO NOTHING
    `;

    await this.connection.execute(sql, [runId, agentId || null]);
  }

  /**
   * Override getEvents to use PostgreSQL-specific JSON operators.
   */
  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE run_id = $1`;
    const params: unknown[] = [runId];
    let paramIndex = 2;

    const { sql: updatedSQL, paramIndex: updatedParamIndex } = this.applyFiltersToSQLPostgreSQL(
      sql,
      params,
      filters,
      paramIndex
    );
    sql = updatedSQL;
    paramIndex = updatedParamIndex;

    sql += ' ORDER BY timestamp ASC';

    if (filters?.limit !== undefined) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    const rows = await this.connection.query<PostgreSQLEventRow>(sql, params);
    return rows.map(toEvent);
  }

  /**
   * Queries events across all runs, in time order. The base class writes `?` placeholders and
   * parses JSON text; PostgreSQL numbers its placeholders and returns JSONB already parsed.
   */
  async queryEvents(
    filters?: EventFilters,
    aggregation?: EventAggregation
  ): Promise<EventQueryResult> {
    const params: unknown[] = [];
    const { sql: filtered, paramIndex } = this.applyFiltersToSQLPostgreSQL(
      `SELECT * FROM ${this.tableName} WHERE 1=1`,
      params,
      filters
    );
    let sql = `${filtered} ORDER BY timestamp ASC`;
    if (filters?.limit !== undefined) {
      sql += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
    }

    const rows = await this.connection.query<PostgreSQLEventRow>(sql, params);
    const events = rows.map(toEvent);
    return {
      events,
      aggregation: aggregation ? await this.applyAggregation(events, aggregation) : undefined,
    };
  }

  /** Counts events matching filters (PostgreSQL returns COUNT(*) as a string). */
  async countEvents(filters?: EventFilters): Promise<number> {
    const params: unknown[] = [];
    const { sql } = this.applyFiltersToSQLPostgreSQL(
      `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`,
      params,
      filters
    );
    const rows = await this.connection.query<{ count: number | string }>(sql, params);
    return Number(rows[0]?.count ?? 0);
  }

  /**
   * Override applyFiltersToSQL for PostgreSQL-specific JSON syntax.
   * Note: This method is overridden but not used directly in PostgreSQL implementation.
   * We use applyFiltersToSQLPostgreSQL instead for better control.
   */
  protected applyFiltersToSQL(
    sql: string,
    params: unknown[],
    filters?: EventFilters
  ): { sql: string; params: unknown[] } {
    if (!filters) return { sql, params };

    // Use PostgreSQL-specific filter application
    const { sql: updatedSQL } = this.applyFiltersToSQLPostgreSQL(
      sql,
      params,
      filters,
      params.length + 1
    );
    return { sql: updatedSQL, params };
  }

  /**
   * PostgreSQL-specific filter application (helper).
   * Returns the modified SQL string and the next parameter index.
   */
  private applyFiltersToSQLPostgreSQL(
    sql: string,
    params: unknown[],
    filters?: EventFilters,
    startIndex = 1
  ): { sql: string; paramIndex: number } {
    if (!filters) return { sql, paramIndex: startIndex };

    let paramIndex = startIndex;
    let resultSQL = sql;

    // Type filter
    if (filters.type) {
      if (Array.isArray(filters.type)) {
        const placeholders = filters.type.map(() => `$${paramIndex++}`).join(',');
        resultSQL += ` AND type IN (${placeholders})`;
        params.push(...filters.type);
      } else {
        resultSQL += ` AND type = $${paramIndex++}`;
        params.push(filters.type);
      }
    }

    // Timestamp filters
    if (filters.since !== undefined) {
      resultSQL += ` AND timestamp >= $${paramIndex++}`;
      params.push(filters.since);
    }

    if (filters.until !== undefined) {
      resultSQL += ` AND timestamp <= $${paramIndex++}`;
      params.push(filters.until);
    }

    // Metadata filters (agentId, userId, sessionId) - PostgreSQL JSONB syntax
    if (filters.agentId) {
      resultSQL += ` AND metadata->>'agentId' = $${paramIndex++}`;
      params.push(filters.agentId);
    }

    if (filters.userId) {
      resultSQL += ` AND metadata->>'userId' = $${paramIndex++}`;
      params.push(filters.userId);
    }

    if (filters.sessionId) {
      resultSQL += ` AND metadata->>'sessionId' = $${paramIndex++}`;
      params.push(filters.sessionId);
    }

    // JSON data queries - PostgreSQL JSONB syntax
    if (filters.dataQuery) {
      const { field, operator, value } = filters.dataQuery;
      const jsonPath = `data->>'${field}'`;

      switch (operator) {
        case 'eq':
          resultSQL += ` AND ${jsonPath} = $${paramIndex++}`;
          params.push(JSON.stringify(value));
          break;
        case 'ne':
          resultSQL += ` AND ${jsonPath} != $${paramIndex++}`;
          params.push(JSON.stringify(value));
          break;
        case 'exists':
          resultSQL += ` AND ${jsonPath} IS NOT NULL`;
          break;
      }
    }

    return { sql: resultSQL, paramIndex };
  }

  /**
   * Override groupEventsBy for PostgreSQL-specific date functions.
   */
  async groupEventsBy(
    groupBy: EventAggregation['groupBy'],
    filters?: EventFilters
  ): Promise<Array<{ key: string; count: number }>> {
    if (!groupBy) {
      return [];
    }

    let sql = 'SELECT ';
    const params: unknown[] = [];
    let paramIndex = 1;

    // Determine GROUP BY field (PostgreSQL syntax)
    switch (groupBy) {
      case 'type':
        sql += `type as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'agentId':
        sql += `metadata->>'agentId' as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'userId':
        sql += `metadata->>'userId' as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'sessionId':
        sql += `metadata->>'sessionId' as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'day':
        sql += `DATE(TO_TIMESTAMP(timestamp / 1000)) as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'hour':
        sql += `DATE_TRUNC('hour', TO_TIMESTAMP(timestamp / 1000)) as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      default:
        return [];
    }

    sql += ' WHERE 1=1';
    const { sql: updatedSQL, paramIndex: updatedParamIndex } = this.applyFiltersToSQLPostgreSQL(
      sql,
      params,
      filters,
      paramIndex
    );
    sql = updatedSQL;
    paramIndex = updatedParamIndex;
    sql += ' GROUP BY key ORDER BY count DESC';

    const rows = await this.connection.query<{ key: string; count: number }>(sql, params);
    return rows.filter((row) => row.key !== null);
  }

  /**
   * Override restore to handle PostgreSQL-specific syntax for runs table.
   */
  async restore(backupData: BackupData): Promise<void> {
    // Validate backup data
    if (!backupData.events || !Array.isArray(backupData.events)) {
      throw new Error('Invalid backup data: events array is required');
    }

    // Restore runs if provided (PostgreSQL syntax)
    if (backupData.runs && Array.isArray(backupData.runs)) {
      for (const run of backupData.runs) {
        try {
          await this.connection.execute(
            'INSERT INTO runs (id, agent_id, created_at) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
            [
              run.id,
              run.agentId || null,
              run.createdAt ? new Date(run.createdAt).toISOString() : null,
            ]
          );
        } catch {
          // Runs table might not exist, ignore
        }
      }
    }

    // Restore events in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < backupData.events.length; i += batchSize) {
      const batch = backupData.events.slice(i, i + batchSize);

      for (const { runId, event } of batch) {
        await this.append(runId, event);
      }
    }
  }
}

/** A row as node-postgres returns it: JSONB columns parsed, BIGINT columns as strings. */
interface PostgreSQLEventRow {
  id: string;
  run_id: string;
  type: string;
  timestamp: number | string;
  data: string | Record<string, unknown>;
  metadata: string | Record<string, unknown> | null;
}

function toEvent(row: PostgreSQLEventRow): Event {
  return {
    id: row.id,
    runId: row.run_id,
    type: row.type as Event['type'],
    timestamp: Number(row.timestamp),
    data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    metadata: row.metadata
      ? typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata
      : undefined,
  };
}
