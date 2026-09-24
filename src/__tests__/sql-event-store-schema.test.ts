import { describe, expect, it } from 'vitest';
import { ValidationError } from '../errors/index.js';
import { type SQLConnection, SQLEventStore } from '../stores/sql-event-store.js';
import type { Event } from '../types/events.js';

/**
 * Connection double: keeps every statement in the order it ran, and takes its time to create
 * the table (as a remote database would), or fails to (as an unreachable one would).
 */
class RecordingConnection implements SQLConnection {
  readonly statements: string[] = [];
  /** Full text of each statement that ran. */
  readonly sql: string[] = [];

  constructor(private readonly schema: { delayMs?: number; failWith?: Error } = {}) {}

  async query<T = unknown>(sql: string): Promise<T[]> {
    this.statements.push(firstWords(sql));
    return [];
  }

  async execute(sql: string): Promise<void> {
    if (/CREATE TABLE/.test(sql)) {
      if (this.schema.failWith) throw this.schema.failWith;
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

  it('refuses a table name that would change the SQL', () => {
    const connection = new RecordingConnection();
    for (const tableName of ['events; DROP TABLE users', 'events--', 'a b', '1events', 'x.y.z']) {
      expect(() => new SQLEventStore({ connection, tableName })).toThrow(ValidationError);
    }
    expect(connection.statements).toEqual([]);
  });

  it('accepts a schema-qualified table, with index names it can create', async () => {
    const connection = new RecordingConnection();
    const store = new SQLEventStore({ connection, tableName: 'app.events' });

    await store.append('run_1', event);

    expect(connection.statements).toContain('INSERT INTO app.events');
    // An index name cannot contain the schema's dot.
    expect(connection.sql).toContain(
      'CREATE INDEX IF NOT EXISTS idx_app_events_run_id ON app.events(run_id)'
    );
    await store.close();
  });
});
