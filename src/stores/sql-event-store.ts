import type {
  Event,
  EventFilters,
  EventLog,
  EventAggregation,
  EventQueryResult,
} from '../types/events.js';
import type { IEventStore, BackupData } from './event-store.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ValidationError } from '../errors/index.js';
import { deriveRunStatus } from '../utils/run-status.js';

export interface SQLConnection {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<void>;
  close(): Promise<void>;
}

export interface SQLEventStoreConfig {
  connection: SQLConnection;
  tableName?: string;
}

/** An SQL identifier, optionally qualified by a schema (`app.events`): it goes into the SQL text. */
const TABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,62}(\.[A-Za-z_][A-Za-z0-9_]{0,62})?$/;

/** Marks the calls made while the schema is being created: they must not wait for it. */
const creatingSchema = new AsyncLocalStorage<true>();

export class SQLEventStore implements IEventStore {
  /** The connection for every query: each one waits until the schema exists. */
  protected connection: SQLConnection;
  protected tableName: string;
  /** Schema of the table (`app` in `app.events`), if any. */
  protected schemaName: string | undefined;
  /** The table's name without its schema. */
  protected unqualifiedTableName: string;
  /** Prefix of the index names: `idx_<table>`, without the schema. */
  protected indexPrefix: string;
  private readonly rawConnection: SQLConnection;
  private schema?: Promise<void>;

  constructor(config: SQLEventStoreConfig) {
    const tableName = config.tableName || 'events';
    if (!TABLE_NAME.test(tableName)) {
      throw new ValidationError(
        'tableName',
        `"${tableName.slice(0, 80)}" is not a table name: use letters, digits and "_" (at most 63), optionally after a schema ("app.events")`
      );
    }
    this.tableName = tableName;
    const [first, second] = tableName.split('.');
    this.schemaName = second === undefined ? undefined : first;
    this.unqualifiedTableName = second ?? tableName;
    this.indexPrefix = `idx_${this.unqualifiedTableName}`;
    this.rawConnection = config.connection;
    this.connection = afterSchema(config.connection, () => this.ensureSchema());
    // Created at once, in the background. Queries wait for it, so the first write cannot come
    // before the table exists. A failure (database not reachable yet) is reported by the
    // operations that wait for it, and the next operation tries again.
    this.ensureSchema().catch(() => undefined);
  }

  /** The schema, created once; after a failure, the next call tries again. */
  private ensureSchema(): Promise<void> {
    this.schema ??= creatingSchema
      .run(true, () => this.initializeSchema(this.rawConnection))
      .catch((error: unknown) => {
        this.schema = undefined;
        throw error;
      });
    return this.schema;
  }

  /**
   * Initializes the database schema if it doesn't exist, on the connection given. Queries
   * made through `this.connection` from here run at once (they do not wait for the schema).
   */
  protected async initializeSchema(connection: SQLConnection): Promise<void> {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL,
        metadata TEXT
      )
    `;

    await connection.execute(createTableSQL);

    // Indexes for common queries. SQLite puts the schema on the index name, not the table.
    const indexSchema = this.schemaName ? `${this.schemaName}.` : '';
    const createIndexesSQL = [
      `CREATE INDEX IF NOT EXISTS ${indexSchema}${this.indexPrefix}_run_id ON ${this.unqualifiedTableName}(run_id)`,
      `CREATE INDEX IF NOT EXISTS ${indexSchema}${this.indexPrefix}_type ON ${this.unqualifiedTableName}(type)`,
      `CREATE INDEX IF NOT EXISTS ${indexSchema}${this.indexPrefix}_timestamp ON ${this.unqualifiedTableName}(timestamp)`,
      `CREATE INDEX IF NOT EXISTS ${indexSchema}${this.indexPrefix}_run_timestamp ON ${this.unqualifiedTableName}(run_id, timestamp)`,
      `CREATE INDEX IF NOT EXISTS ${indexSchema}${this.indexPrefix}_type_timestamp ON ${this.unqualifiedTableName}(type, timestamp)`,
    ];

    for (const indexSQL of createIndexesSQL) {
      try {
        await connection.execute(indexSQL);
      } catch {
        // Ignore errors if index already exists (some databases may throw)
        // This is safe because we use IF NOT EXISTS where supported
      }
    }
  }

  async append(runId: string, event: Event): Promise<void> {
    const sql = `
      INSERT INTO ${this.tableName} (id, run_id, type, timestamp, data, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
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

  async getEvents(runId: string, filters?: EventFilters): Promise<Event[]> {
    let sql = `SELECT * FROM ${this.tableName} WHERE run_id = ?`;
    const params: unknown[] = [runId];

    // Apply filters (excluding runId which is already in WHERE clause)
    const { sql: filteredSQL, params: filteredParams } = this.applyFiltersToSQL('', [], filters);
    if (filteredSQL) {
      sql += filteredSQL.replace('WHERE 1=1', '').trim();
      params.push(...filteredParams);
    }

    sql += ' ORDER BY timestamp ASC';

    if (filters?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = await this.connection.query<{
      id: string;
      run_id: string;
      type: string;
      timestamp: number;
      data: string;
      metadata: string | null;
    }>(sql, params);

    return rows.map((row) => this.rowToEvent(row));
  }

  async getRunIds(filters?: { since?: number; until?: number }): Promise<string[]> {
    let sql = `SELECT DISTINCT run_id FROM ${this.tableName}`;
    const params: unknown[] = [];

    if (filters?.since !== undefined || filters?.until !== undefined) {
      const conditions: string[] = [];

      if (filters.since !== undefined) {
        conditions.push('timestamp >= ?');
        params.push(filters.since);
      }

      if (filters.until !== undefined) {
        conditions.push('timestamp <= ?');
        params.push(filters.until);
      }

      if (conditions.length > 0) {
        sql += ` WHERE ${conditions.join(' AND ')}`;
      }
    }

    sql += ' ORDER BY run_id ASC';

    const rows = await this.connection.query<{ run_id: string }>(sql, params);
    return rows.map((row) => row.run_id);
  }

  async exportEventLog(runId: string): Promise<EventLog> {
    const events = await this.getEvents(runId);

    if (events.length === 0) {
      throw new Error(`No events found for runId: ${runId}`);
    }

    const firstEvent = events[0];

    const agentId = firstEvent.metadata?.agentId as string | undefined;
    const version = (firstEvent.metadata?.agentVersion as string | undefined) || '1.0.0';

    const startedAt =
      events.find((e) => e.type === 'run.started')?.timestamp || firstEvent.timestamp;
    const completedAt = events.find((e) =>
      ['run.completed', 'run.failed', 'run.cancelled'].includes(e.type)
    )?.timestamp;

    const status = this.determineStatus(events);

    const summary = {
      totalEvents: events.length,
      intentionsGenerated: events.filter((e) => e.type === 'intention.generated').length,
      actionsExecuted: events.filter((e) => e.type === 'action.executed').length,
      policiesChecked: events.filter((e) => e.type === 'policy.checked').length,
      toolsCalled: events.filter((e) => e.type === 'tool.called').length,
    };

    return {
      runId,
      agentId: agentId || 'unknown',
      version,
      startedAt,
      completedAt,
      status,
      events,
      summary,
    };
  }

  /**
   * Converts a database row to an Event object.
   */
  private rowToEvent(row: {
    id: string;
    run_id: string;
    type: string;
    timestamp: number;
    data: string;
    metadata: string | null;
  }): Event {
    return {
      id: row.id,
      runId: row.run_id,
      type: row.type as Event['type'],
      timestamp: row.timestamp,
      data: JSON.parse(row.data),
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    };
  }

  /**
   * Determines the run status from events.
   */
  private determineStatus(events: Event[]): EventLog['status'] {
    return deriveRunStatus(events);
  }

  /**
   * Applies filters to SQL query (helper method).
   * Returns the modified SQL string and updated params.
   */
  protected applyFiltersToSQL(
    sql: string,
    params: unknown[],
    filters?: EventFilters,
    paramPlaceholder = '?'
  ): { sql: string; params: unknown[] } {
    if (!filters) return { sql, params };

    let resultSQL = sql;
    const resultParams = [...params];

    // Type filter
    if (filters.type) {
      if (Array.isArray(filters.type)) {
        const placeholders = filters.type.map(() => paramPlaceholder).join(',');
        resultSQL += ` AND type IN (${placeholders})`;
        resultParams.push(...filters.type);
      } else {
        resultSQL += ` AND type = ${paramPlaceholder}`;
        resultParams.push(filters.type);
      }
    }

    // Timestamp filters
    if (filters.since !== undefined) {
      resultSQL += ` AND timestamp >= ${paramPlaceholder}`;
      resultParams.push(filters.since);
    }

    if (filters.until !== undefined) {
      resultSQL += ` AND timestamp <= ${paramPlaceholder}`;
      resultParams.push(filters.until);
    }

    // Metadata filters (agentId, userId, sessionId)
    if (filters.agentId) {
      resultSQL += ` AND JSON_EXTRACT(metadata, '$.agentId') = ${paramPlaceholder}`;
      resultParams.push(filters.agentId);
    }

    if (filters.userId) {
      resultSQL += ` AND JSON_EXTRACT(metadata, '$.userId') = ${paramPlaceholder}`;
      resultParams.push(filters.userId);
    }

    if (filters.sessionId) {
      resultSQL += ` AND JSON_EXTRACT(metadata, '$.sessionId') = ${paramPlaceholder}`;
      resultParams.push(filters.sessionId);
    }

    // JSON data queries
    if (filters.dataQuery) {
      const { field, operator, value } = filters.dataQuery;
      const jsonPath = `JSON_EXTRACT(data, '$.${field}')`;

      switch (operator) {
        case 'eq':
          resultSQL += ` AND ${jsonPath} = ${paramPlaceholder}`;
          resultParams.push(JSON.stringify(value));
          break;
        case 'ne':
          resultSQL += ` AND ${jsonPath} != ${paramPlaceholder}`;
          resultParams.push(JSON.stringify(value));
          break;
        case 'gt':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) > ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'gte':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) >= ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'lt':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) < ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'lte':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) <= ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'contains':
          resultSQL += ` AND ${jsonPath} LIKE ${paramPlaceholder}`;
          resultParams.push(`%${value}%`);
          break;
        case 'exists':
          resultSQL += ` AND ${jsonPath} IS NOT NULL`;
          break;
      }
    }

    // JSON metadata queries
    if (filters.metadataQuery) {
      const { field, operator, value } = filters.metadataQuery;
      const jsonPath = `JSON_EXTRACT(metadata, '$.${field}')`;

      switch (operator) {
        case 'eq':
          resultSQL += ` AND ${jsonPath} = ${paramPlaceholder}`;
          resultParams.push(typeof value === 'string' ? value : JSON.stringify(value));
          break;
        case 'ne':
          resultSQL += ` AND ${jsonPath} != ${paramPlaceholder}`;
          resultParams.push(typeof value === 'string' ? value : JSON.stringify(value));
          break;
        case 'gt':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) > ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'gte':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) >= ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'lt':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) < ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'lte':
          resultSQL += ` AND CAST(${jsonPath} AS REAL) <= ${paramPlaceholder}`;
          resultParams.push(value);
          break;
        case 'contains':
          resultSQL += ` AND ${jsonPath} LIKE ${paramPlaceholder}`;
          resultParams.push(`%${value}%`);
          break;
        case 'exists':
          resultSQL += ` AND ${jsonPath} IS NOT NULL`;
          break;
      }
    }

    return { sql: resultSQL, params: resultParams };
  }

  /**
   * Advanced query method - queries events across all runs.
   */
  async queryEvents(
    filters?: EventFilters,
    aggregation?: EventAggregation
  ): Promise<EventQueryResult> {
    let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`;
    const params: unknown[] = [];

    const { sql: filteredSQL, params: filteredParams } = this.applyFiltersToSQL(
      sql,
      params,
      filters
    );
    sql = filteredSQL;
    params.push(...filteredParams);

    sql += ' ORDER BY timestamp ASC';

    if (filters?.limit !== undefined) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    const rows = await this.connection.query<{
      id: string;
      run_id: string;
      type: string;
      timestamp: number;
      data: string;
      metadata: string | null;
    }>(sql, params);

    const events = rows.map((row) => this.rowToEvent(row));

    // Apply aggregation if requested
    let aggregationResult: EventQueryResult['aggregation'] | undefined;
    if (aggregation) {
      aggregationResult = await this.applyAggregation(events, aggregation);
    }

    return {
      events,
      aggregation: aggregationResult,
    };
  }

  /**
   * Gets events by agent ID.
   */
  async getEventsByAgent(
    agentId: string,
    filters?: Omit<EventFilters, 'agentId'>
  ): Promise<Event[]> {
    return this.queryEvents({ ...filters, agentId }).then((result) => result.events);
  }

  /**
   * Gets events by user ID.
   */
  async getEventsByUser(userId: string, filters?: Omit<EventFilters, 'userId'>): Promise<Event[]> {
    return this.queryEvents({ ...filters, userId }).then((result) => result.events);
  }

  /**
   * Gets events by session ID.
   */
  async getEventsBySession(
    sessionId: string,
    filters?: Omit<EventFilters, 'sessionId'>
  ): Promise<Event[]> {
    return this.queryEvents({ ...filters, sessionId }).then((result) => result.events);
  }

  /**
   * Counts events matching filters.
   */
  async countEvents(filters?: EventFilters): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`;
    const params: unknown[] = [];

    const { sql: filteredSQL, params: filteredParams } = this.applyFiltersToSQL(
      sql,
      params,
      filters
    );
    sql = filteredSQL;
    params.push(...filteredParams);

    const rows = await this.connection.query<{ count: number }>(sql, params);
    return rows[0]?.count || 0;
  }

  /**
   * Groups events by a field.
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

    // Determine GROUP BY field
    switch (groupBy) {
      case 'type':
        sql += `type as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'agentId':
        sql += `JSON_EXTRACT(metadata, '$.agentId') as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'userId':
        sql += `JSON_EXTRACT(metadata, '$.userId') as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'sessionId':
        sql += `JSON_EXTRACT(metadata, '$.sessionId') as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'day':
        sql += `DATE(DATETIME(timestamp / 1000, 'unixepoch')) as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      case 'hour':
        sql += `STRFTIME('%Y-%m-%d %H:00:00', DATETIME(timestamp / 1000, 'unixepoch')) as key, COUNT(*) as count FROM ${this.tableName}`;
        break;
      default:
        return [];
    }

    sql += ' WHERE 1=1';
    const { sql: filteredSQL, params: filteredParams } = this.applyFiltersToSQL(
      sql,
      params,
      filters
    );
    sql = filteredSQL;
    params.push(...filteredParams);
    sql += ' GROUP BY key ORDER BY count DESC';

    const rows = await this.connection.query<{ key: string; count: number }>(sql, params);
    return rows.filter((row) => row.key !== null);
  }

  /**
   * Applies aggregation to events (in-memory for complex aggregations).
   */
  private async applyAggregation(
    events: Event[],
    aggregation: EventAggregation
  ): Promise<EventQueryResult['aggregation']> {
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
            key = new Date(event.timestamp).toISOString().split('T')[0];
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
   * Creates a backup of all events in the store.
   * Returns a BackupData object that can be used to restore the events.
   */
  async backup(): Promise<BackupData> {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY timestamp ASC`;
    const rows = await this.connection.query<{
      id: string;
      run_id: string;
      type: string;
      timestamp: number;
      data: string;
      metadata: string | null;
    }>(sql);

    const events = rows.map((row) => ({
      runId: row.run_id,
      event: this.rowToEvent(row),
    }));

    // Try to get runs information if runs table exists
    let runs: BackupData['runs'] | undefined;
    try {
      const runsRows = await this.connection.query<{
        id: string;
        agent_id: string | null;
        created_at: number | null;
      }>('SELECT id, agent_id, created_at FROM runs ORDER BY created_at ASC');
      runs = runsRows.map((row) => ({
        id: row.id,
        agentId: row.agent_id || undefined,
        createdAt: row.created_at ? new Date(row.created_at).getTime() : undefined,
      }));
    } catch {
      // Runs table might not exist, ignore
    }

    return {
      version: '1.0.0',
      timestamp: Date.now(),
      events,
      runs,
    };
  }

  /**
   * Restores events from a backup.
   * This will append all events from the backup to the store.
   * Note: This does not clear existing events - use with caution.
   */
  async restore(backupData: BackupData): Promise<void> {
    // Validate backup data
    if (!backupData.events || !Array.isArray(backupData.events)) {
      throw new Error('Invalid backup data: events array is required');
    }

    // Restore runs if provided
    // Note: Runs table might not exist in all implementations, so we ignore errors
    if (backupData.runs && Array.isArray(backupData.runs)) {
      for (const run of backupData.runs) {
        try {
          // Try SQLite syntax first (INSERT OR IGNORE)
          await this.connection.execute(
            'INSERT OR IGNORE INTO runs (id, agent_id, created_at) VALUES (?, ?, ?)',
            [
              run.id,
              run.agentId || null,
              run.createdAt ? new Date(run.createdAt).toISOString() : null,
            ]
          );
        } catch {
          // Runs table might not exist or use different syntax, ignore
          // PostgreSQL implementations will override this method
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

  /**
   * Closes the database connection.
   */
  async close(): Promise<void> {
    // Let a schema creation in progress finish (or fail) before closing its connection.
    await this.schema?.catch(() => undefined);
    await this.connection.close();
  }
}

/**
 * A connection whose queries wait for the schema before running, except the ones made while
 * the schema is being created (a subclass creating it through `this.connection`).
 */
function afterSchema(connection: SQLConnection, schema: () => Promise<void>): SQLConnection {
  const ready = async () => {
    if (!creatingSchema.getStore()) await schema();
  };
  return {
    query: async <T = unknown>(sql: string, params?: unknown[]): Promise<T[]> => {
      await ready();
      return connection.query<T>(sql, params);
    },
    execute: async (sql: string, params?: unknown[]): Promise<void> => {
      await ready();
      await connection.execute(sql, params);
    },
    close: () => connection.close(),
  };
}
