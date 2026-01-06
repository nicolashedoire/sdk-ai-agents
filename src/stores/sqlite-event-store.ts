import type { SQLConnection, SQLEventStoreConfig } from './sql-event-store.js';
import { SQLEventStore } from './sql-event-store.js';

/**
 * SQLite-specific connection wrapper for SQLEventStore.
 * This uses better-sqlite3 for SQLite support.
 */
export class SQLiteConnection implements SQLConnection {
  private db: any; // better-sqlite3 Database instance

  constructor(db: any) {
    this.db = db;
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...(params || [])) as T[];
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    const stmt = this.db.prepare(sql);
    stmt.run(...(params || []));
  }

  async close(): Promise<void> {
    this.db.close();
  }
}

/**
 * SQLite implementation of Event Store.
 * Uses better-sqlite3 for SQLite database access.
 */
export class SQLiteEventStore extends SQLEventStore {
  constructor(config: Omit<SQLEventStoreConfig, 'connection'> & { db: any; tableName?: string }) {
    const connection = new SQLiteConnection(config.db);
    super({
      connection,
      tableName: config.tableName,
    });
  }
}

