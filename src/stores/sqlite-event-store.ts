import type { SQLConnection, SQLEventStoreConfig } from './sql-event-store.js';
import { SQLEventStore } from './sql-event-store.js';

/** The subset of a better-sqlite3 `Database` the store uses (a real database satisfies it). */
export interface SQLiteDatabase {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
  close(): void;
}

/**
 * SQLite-specific connection wrapper for SQLEventStore.
 * This uses better-sqlite3 for SQLite support.
 */
export class SQLiteConnection implements SQLConnection {
  private db: SQLiteDatabase;

  constructor(db: SQLiteDatabase) {
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
  constructor(
    config: Omit<SQLEventStoreConfig, 'connection'> & { db: SQLiteDatabase; tableName?: string }
  ) {
    const connection = new SQLiteConnection(config.db);
    super({
      connection,
      tableName: config.tableName,
    });
  }
}
