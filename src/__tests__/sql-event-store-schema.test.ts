import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/index.js';
import { type SQLConnection, SQLEventStore } from '../stores/sql-event-store.js';
import { SQLiteEventStore } from '../stores/sqlite-event-store.js';
import { loadNodeSqlite } from './support/node-sqlite.js';
import type { Event } from '../types/events.js';

/**
 * Connection double: keeps every statement in the order it ran, and takes its time to create
 * the table (as a remote database would), or fails to (as an unreachable one would).
 */
class RecordingConnection implements SQLConnection {
  readonly statements: string[] = [];
  /** Full text of each statement that ran. */
  readonly sql: string[] = [];

  constructor(
    private readonly schema: { delayMs?: number; failWith?: Error; failTimes?: number } = {}
  ) {}

  async query<T = unknown>(sql: string): Promise<T[]> {
    this.statements.push(firstWords(sql));
    return [];
  }

  async execute(sql: string): Promise<void> {
    if (/CREATE TABLE/.test(sql)) {
      if (this.schema.failWith && (this.schema.failTimes ?? Number.POSITIVE_INFINITY) > 0) {
        this.schema.failTimes = (this.schema.failTimes ?? Number.POSITIVE_INFINITY) - 1;
        throw this.schema.failWith;
      }
      await new Promise((resolve) => setTimeout(resolve, this.schema.delayMs ?? 0));
    }
    this.statements.push(firstWords(sql));
    this.sql.push(sql.trim());
  }

  async close(): Promise<void> {
    this.statements.push('CLOSE');
  }
}

function firstWords(sql: string): string {
  return sql.trim().split(/\s+/).slice(0, 3).join(' ');
}

const event: Event = { id: 'evt_1', runId: 'run_1', type: 'run.started', timestamp: 1, data: {} };

describe('SQLEventStore schema', () => {
  it('lets the first write wait until the table and its indexes exist', async () => {
    const connection = new RecordingConnection({ delayMs: 30 });
    const store = new SQLEventStore({ connection });

    await store.append('run_1', event);

    const insert = connection.statements.indexOf('INSERT INTO events');
    expect(insert).toBeGreaterThan(-1);
    // Before the fix, the INSERT ran while CREATE TABLE was still in progress.
    expect(connection.statements.slice(0, insert)).toEqual([
      'CREATE TABLE IF',
      ...Array.from({ length: 5 }, () => 'CREATE INDEX IF'),
    ]);
  });

  it('reports a schema failure on the first operation, not as an unhandled rejection', async () => {
    const connection = new RecordingConnection({ failWith: new Error('database unreachable') });
    const store = new SQLEventStore({ connection });

    await expect(store.append('run_1', event)).rejects.toThrow('database unreachable');
    await expect(store.getEvents('run_1')).rejects.toThrow('database unreachable');
    expect(connection.statements).not.toContain('INSERT INTO events');
    await store.close();
    expect(connection.statements).toEqual(['CLOSE']);
  });

  it('tries the schema again when the database becomes reachable', async () => {
    // The database is not reachable at start-up (a pool connects on first use), then is. The
    // first write shares the failed attempt started by the constructor; the next one retries.
    const connection = new RecordingConnection({
      failWith: new Error('ECONNREFUSED'),
      failTimes: 1,
    });
    const store = new SQLEventStore({ connection });

    await expect(store.append('run_1', event)).rejects.toThrow('ECONNREFUSED');
    await store.append('run_1', event);

    expect(connection.statements).toContain('INSERT INTO events');
  });

  it('lets a subclass written for the old hook create its schema through this.connection', async () => {
    class LegacyStore extends SQLEventStore {
      protected override async initializeSchema(): Promise<void> {
        await this.connection.execute('CREATE TABLE IF NOT EXISTS events (id TEXT)');
        await this.connection.execute('CREATE INDEX IF NOT EXISTS legacy_index ON events(id)');
      }
    }
    const connection = new RecordingConnection({ delayMs: 5 });
    const store = new LegacyStore({ connection });

    // Before, this deadlocked: the schema's own queries waited for the schema.
    await store.append('run_1', event);

    expect(connection.statements).toEqual([
      'CREATE TABLE IF',
      'CREATE INDEX IF',
      'INSERT INTO events',
    ]);
  });

  it("does not let a callback born during one store's schema skip another store's wait", async () => {
    // A timer created while store A creates its schema carries A's context; it writes to
    // store B, whose schema is slower. B's write must still wait for B's table.
    const slowB = new RecordingConnection({ delayMs: 30 });
    const storeB = new SQLEventStore({ connection: slowB, tableName: 'b_events' });
    let write: Promise<void> | undefined;
    class TimerDuringSchema extends RecordingConnection {
      override async execute(sql: string): Promise<void> {
        if (/CREATE TABLE/.test(sql) && !write) {
          write = new Promise((resolve, reject) => {
            setTimeout(() => storeB.append('run_1', event).then(resolve, reject), 0);
          });
        }
        await super.execute(sql);
      }
    }
    const storeA = new SQLEventStore({ connection: new TimerDuringSchema() });

    await storeA.append('run_a', event);
    await write;
    await storeB.close();

    // Before the fix, B's INSERT ran first, before its table existed.
    expect(slowB.statements).toEqual([
      'CREATE TABLE IF',
      ...Array.from({ length: 5 }, () => 'CREATE INDEX IF'),
      'INSERT INTO b_events',
      'CLOSE',
    ]);
  });

  it('closes only after a schema creation in progress', async () => {
    const connection = new RecordingConnection({ delayMs: 20 });
    const store = new SQLEventStore({ connection });

    await store.close();

    expect(connection.statements.at(-1)).toBe('CLOSE');
    expect(connection.statements[0]).toBe('CREATE TABLE IF');
  });

  it('refuses a table name that would change the SQL', () => {
    const connection = new RecordingConnection();
    for (const tableName of [
      'events; DROP TABLE users',
      'events--',
      'a b',
      '1events',
      'x.y.z',
      'e'.repeat(64),
    ]) {
      expect(() => new SQLEventStore({ connection, tableName })).toThrow(ValidationError);
    }
    expect(connection.statements).toEqual([]);
    expect(() => new SQLEventStore({ connection, tableName: 'e'.repeat(63) })).not.toThrow();
  });

  it('accepts a schema-qualified table, with index names it can create', async () => {
    const connection = new RecordingConnection();
    const store = new SQLEventStore({ connection, tableName: 'app.events' });

    await store.append('run_1', event);

    expect(connection.statements).toContain('INSERT INTO app.events');
    // SQLite syntax: the schema goes on the index name, the table is named alone.
    expect(connection.sql).toContain(
      'CREATE INDEX IF NOT EXISTS app.idx_events_run_id ON events(run_id)'
    );
    await store.close();
  });

  const nodeSqlite = loadNodeSqlite();
  describe.skipIf(!nodeSqlite)(
    `with a real SQLite database (node:sqlite)${nodeSqlite ? '' : ' — skipped: this Node.js has no node:sqlite'}`,
    () => {
      function indexesOf(
        db: InstanceType<NonNullable<typeof nodeSqlite>['DatabaseSync']>,
        schema: string
      ) {
        return db
          .prepare(
            `SELECT name FROM ${schema}.sqlite_master WHERE type = 'index' AND name LIKE 'idx_%'`
          )
          .all()
          .map((row) => (row as { name: string }).name)
          .sort();
      }

      it('creates the table and its indexes, then records and reads events', async () => {
        const db = new (nodeSqlite as NonNullable<typeof nodeSqlite>).DatabaseSync(':memory:');
        const store = new SQLiteEventStore({ db });

        await store.append('run_1', event);

        expect(await store.getEvents('run_1')).toHaveLength(1);
        expect(indexesOf(db, 'main')).toHaveLength(5);
        await store.close();
      });

      it('creates the indexes of a table in an attached database', async () => {
        const db = new (nodeSqlite as NonNullable<typeof nodeSqlite>).DatabaseSync(':memory:');
        db.exec("ATTACH DATABASE ':memory:' AS app");
        const store = new SQLiteEventStore({ db, tableName: 'app.events' });

        await store.append('run_1', event);

        expect(await store.getEvents('run_1')).toHaveLength(1);
        expect(indexesOf(db, 'app')).toEqual([
          'idx_events_run_id',
          'idx_events_run_timestamp',
          'idx_events_timestamp',
          'idx_events_type',
          'idx_events_type_timestamp',
        ]);
        await store.close();
      });
    }
  );
});
