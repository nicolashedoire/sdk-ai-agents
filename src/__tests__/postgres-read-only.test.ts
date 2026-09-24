import { describe, expect, it } from 'vitest';
import { databaseTools } from '../tools/database-tools.js';
import { postgresReadOnly } from '../tools/postgres-read-only.js';
import type { ReadOnlyDatabase } from '../tools/database-tools.js';
import type { ToolDefinition } from '../types/tool.js';
import { RecordingPgClient, RecordingPgPool, type PgReply, type PgStatement } from './support/recording-pg.js';

const TRANSACTION_START = [
  { text: 'BEGIN READ ONLY' },
  { text: 'SET LOCAL statement_timeout = 5000' },
  { text: 'SET LOCAL standard_conforming_strings = on' },
];
const ROLLBACK = { text: 'ROLLBACK' };

/** Answers like a small PostgreSQL: 3 customers, catalog queries, and read-only refusals. */
function shop(statement: PgStatement): PgReply {
  if (statement.text.includes('information_schema.tables')) {
    return { rows: [{ table_schema: 'public', table_name: 'customers', table_type: 'BASE TABLE' }] };
  }
  if (statement.text.includes('information_schema.columns')) {
    return statement.values?.[0] === 'customers'
      ? {
          rows: [
            { table_schema: 'public', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null },
            { table_schema: 'public', column_name: 'name', data_type: 'text', is_nullable: 'YES', column_default: "'?'::text" },
          ],
        }
      : { rows: [] };
  }
  if (statement.text.includes('DELETE')) {
    return new Error('cannot execute DELETE in a read-only transaction');
  }
  if (statement.text.includes('sdk_read_only_query')) {
    const limit = Number(statement.values?.[0]);
    const all = [{ id: 1n, name: 'Ada' }, { id: 2n, name: 'Linus' }, { id: 3n, name: 'Grace' }];
    return { rows: all.slice(0, limit), fields: [{ name: 'id' }, { name: 'name' }] };
  }
  return { rows: [] };
}

function tools(database: ReadOnlyDatabase, maxRows = 2): Record<string, ToolDefinition> {
  const list = databaseTools({ database, maxRows, prefix: 'shop_' });
  return Object.fromEntries(list.map((tool) => [tool.name, tool]));
}

function call(database: ReadOnlyDatabase, name: string, args: unknown, maxRows = 2): Promise<unknown> {
  const tool = tools(database, maxRows)[name];
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(tool.schema.parse(args));
}

describe('postgresReadOnly', () => {
  it('runs each query in its own READ ONLY transaction with a timeout, always rolled back', async () => {
    const pool = new RecordingPgPool(shop);
    const database = postgresReadOnly({ pool }, { statementTimeoutMs: 5_000 });

    const result = await call(database, 'shop_query', { sql: 'SELECT id, name FROM customers ORDER BY id;' });

    expect(result).toEqual({
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }],
      rowCount: 2,
      truncated: true,
    });
    expect(pool.clients[0]?.journal).toEqual([
      ...TRANSACTION_START,
      // Wrapped to cap the rows; the bind parameter makes the server accept one statement only.
      { text: 'SELECT * FROM (\nSELECT id, name FROM customers ORDER BY id\n) AS sdk_read_only_query LIMIT $1', values: [3] },
      ROLLBACK,
    ]);
    expect(pool.releases).toEqual([false]);
  });

  it('rolls back and reports the error when PostgreSQL refuses a write', async () => {
    const pool = new RecordingPgPool(shop);
    const database = postgresReadOnly({ pool }, { statementTimeoutMs: 5_000 });

    await expect(
      call(database, 'shop_query', { sql: 'WITH gone AS (DELETE FROM customers RETURNING *) SELECT * FROM gone' })
    ).rejects.toThrow('cannot execute DELETE in a read-only transaction');

    expect(pool.clients[0]?.journal.at(-1)).toEqual(ROLLBACK);
    expect(pool.releases).toEqual([false]);
  });

  it('refuses several statements and non-queries before touching the database', async () => {
    const pool = new RecordingPgPool(shop);
    const database = postgresReadOnly({ pool });

    for (const sql of ['SELECT 1; COMMIT; DROP TABLE customers', 'DROP TABLE customers', 'SELECT $1']) {
      await expect(call(database, 'shop_query', { sql }), sql).rejects.toThrow('Validation failed: sql');
    }
    expect(pool.clients).toHaveLength(0);
  });

  it('destroys a pooled connection whose ROLLBACK failed instead of reusing it', async () => {
    const pool = new RecordingPgPool((statement) =>
      statement.text === 'ROLLBACK' ? new Error('connection lost') : shop(statement)
    );
    const database = postgresReadOnly({ pool });

    await expect(call(database, 'shop_query', { sql: 'SELECT 1' })).rejects.toThrow('connection lost');
    expect(pool.releases).toEqual([true]);
  });

  it('queues transactions on a single client so they never interleave', async () => {
    const client = new RecordingPgClient(shop, 2);
    const database = postgresReadOnly({ client }, { statementTimeoutMs: 5_000 });

    await Promise.all([
      call(database, 'shop_query', { sql: 'SELECT 1' }),
      call(database, 'shop_list_tables', {}),
      call(database, 'shop_query', { sql: 'SELECT 2' }),
    ]);

    const texts = client.journal.map((statement) => statement.text);
    expect(texts.filter((text) => text === 'BEGIN READ ONLY')).toHaveLength(3);
    for (let start = 0; start < texts.length; start += 5) {
      expect(texts.slice(start, start + 5)).toEqual([
        'BEGIN READ ONLY',
        'SET LOCAL statement_timeout = 5000',
        'SET LOCAL standard_conforming_strings = on',
        expect.stringContaining('SELECT'),
        'ROLLBACK',
      ]);
    }
  });

  it('lists tables and describes one from information_schema, within the allowed schemas', async () => {
    const pool = new RecordingPgPool(shop);
    const database = postgresReadOnly({ pool }, { schemas: ['public'] });

    await expect(call(database, 'shop_list_tables', {})).resolves.toEqual({
      tables: [{ name: 'customers', schema: 'public', type: 'BASE TABLE' }],
      truncated: false,
    });
    await expect(call(database, 'shop_describe_table', { table: 'public.customers' })).resolves.toEqual({
      table: 'public.customers',
      columns: [
        { name: 'id', type: 'integer', nullable: false, default: null },
        { name: 'name', type: 'text', nullable: true, default: "'?'::text" },
      ],
    });
    await expect(call(database, 'shop_describe_table', { table: 'invoices' })).rejects.toThrow('no table or view named "invoices"');

    expect(pool.clients[0]?.journal[3]?.values).toEqual([501, ['public']]);
    expect(pool.clients[1]?.journal[3]?.values).toEqual(['customers', 'public', ['public']]);
  });

  it('rejects an invalid timeout', () => {
    expect(() => postgresReadOnly({ client: new RecordingPgClient() }, { statementTimeoutMs: -1 })).toThrow('statementTimeoutMs');
  });
});
