import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { databaseTools } from '../tools/database-tools.js';
import { sqliteReadOnly, type SqliteConnectionLike } from '../tools/sqlite-read-only.js';
import type { ToolDefinition } from '../types/tool.js';
import { loadNodeSqlite, type NodeSqlite } from './support/node-sqlite.js';

const nodeSqlite = loadNodeSqlite();
const skipped = nodeSqlite
  ? ''
  : ` [skipped: node:sqlite is not available in Node ${process.version}, it needs Node 22.13 or later]`;
if (!nodeSqlite) {
  // Visible in the default reporter, not only in the verbose one.
  console.warn(`SQLite adapter tests${skipped}; CI runs them on Node 22 and 24.`);
}

function sqlite(): NodeSqlite {
  if (!nodeSqlite) throw new Error('node:sqlite is not available');
  return nodeSqlite;
}

function seed(db: SqliteConnectionLike): void {
  db.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, plan TEXT DEFAULT 'free');
    CREATE TABLE events (id INTEGER, big INTEGER, payload BLOB, note TEXT);
    CREATE VIEW paying AS SELECT * FROM customers WHERE plan <> 'free';
    INSERT INTO customers (name, plan) VALUES ('Ada', 'pro'), ('Linus', 'free');
    INSERT INTO events VALUES (1, 9007199254740993, x'00ff10', '${'long '.repeat(100)}');
    WITH RECURSIVE n(i) AS (SELECT 2 UNION ALL SELECT i + 1 FROM n WHERE i < 250)
      INSERT INTO events (id, big) SELECT i, i FROM n;
  `);
}

function tools(db: SqliteConnectionLike): Record<string, ToolDefinition> {
  const list = databaseTools({ database: sqliteReadOnly(db), name: 'the shop database', maxTextLength: 20 });
  return Object.fromEntries(list.map((tool) => [tool.name, tool]));
}

async function call(db: SqliteConnectionLike, name: string, args: unknown): Promise<unknown> {
  const tool = tools(db)[name];
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.handler(tool.schema.parse(args));
}

describe.skipIf(!nodeSqlite)(`sqliteReadOnly with a real node:sqlite database${skipped}`, () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  });

  function open(): SqliteConnectionLike {
    const db = new (sqlite().DatabaseSync)(':memory:');
    cleanups.push(() => db.close());
    seed(db);
    return db;
  }

  it('lists the tables and views, and describes one', async () => {
    const db = open();

    await expect(call(db, 'list_tables', {})).resolves.toEqual({
      truncated: false,
      tables: [
        { name: 'customers', type: 'table' },
        { name: 'events', type: 'table' },
        { name: 'paying', type: 'view' },
      ],
    });
    await expect(call(db, 'describe_table', { table: 'customers' })).resolves.toEqual({
      table: 'customers',
      columns: [
        { name: 'id', type: 'INTEGER', nullable: true, default: null, primaryKey: true },
        { name: 'name', type: 'TEXT', nullable: false, default: null, primaryKey: false },
        { name: 'plan', type: 'TEXT', nullable: true, default: "'free'", primaryKey: false },
      ],
    });
    await expect(call(db, 'describe_table', { table: 'sqlite_master' })).rejects.toThrow('no table or view named "sqlite_master"');
  });

  it('returns at most maxRows rows, says when there were more, and makes values JSON-safe', async () => {
    const db = open();

    const result = await call(db, 'query', { sql: 'SELECT id, big, payload, note FROM events ORDER BY id' });

    expect(result).toMatchObject({ columns: ['id', 'big', 'payload', 'note'], rowCount: 100, truncated: true });
    expect(result).toHaveProperty('rows.0', {
      id: 1,
      big: '9007199254740993',
      payload: '<binary data, 3 bytes>',
      note: `${'long '.repeat(3)}long…`,
    });
    await expect(call(db, 'query', { sql: 'SELECT count(*) AS n FROM events;' })).resolves.toMatchObject({
      rows: [{ n: 250 }],
      truncated: false,
    });
  });

  it('refuses writes, including those that start like a query, and leaves the connection writable', async () => {
    const db = open();
    const refused: Array<[string, string]> = [
      ['DELETE FROM customers', 'only read queries'],
      ['SELECT 1; DELETE FROM customers', 'only one statement is allowed'],
      ['WITH doomed AS (SELECT id FROM customers) DELETE FROM customers WHERE id IN doomed', 'readonly database'],
      ["WITH x AS (SELECT 1) INSERT INTO customers (name) VALUES ('Mallory')", 'readonly database'],
    ];
    for (const [sql, reason] of refused) {
      await expect(call(db, 'query', { sql }), sql).rejects.toThrow(reason);
    }

    const count = db.prepare('SELECT count(*) AS n FROM customers').all();
    expect(count).toEqual([{ n: 2 }]);
    // query_only is restored: the application's own writes still work.
    db.exec("INSERT INTO customers (name) VALUES ('Grace')");
    expect(db.prepare('SELECT count(*) AS n FROM customers').all()).toEqual([{ n: 3 }]);
  });

  it('keeps query_only on when the application had set it', async () => {
    const db = open();
    db.exec('PRAGMA query_only = ON');
    await call(db, 'query', { sql: 'SELECT 1' });
    expect(db.prepare('PRAGMA query_only').all()).toEqual([{ query_only: 1 }]);
  });

  it('works on a database file opened read-only', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'sqlite-read-only-'));
    cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
    const path = join(directory, 'shop.db');
    const writer = new (sqlite().DatabaseSync)(path);
    seed(writer);
    writer.close();
    const reader = new (sqlite().DatabaseSync)(path, { readOnly: true });
    cleanups.unshift(() => reader.close());

    await expect(call(reader, 'query', { sql: 'SELECT name FROM paying' })).resolves.toMatchObject({ rows: [{ name: 'Ada' }] });
  });
});
