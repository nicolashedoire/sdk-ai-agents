/**
 * Recipe "a database, read-only" with SQLite: list tables, describe one, run SELECT queries
 * with a row limit. Writes are refused by the statement check and by SQLite itself.
 * Needs Node.js 22.13+ for the built-in `node:sqlite` module (better-sqlite3 works too).
 *
 * Run: npm run example:mcp-database -- /path/to/database.sqlite   (default: a demo shop database)
 *
 * PostgreSQL works the same way with `postgresReadOnly({ pool })`: see examples/mcp-postgres.ts.
 */
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { FileEventStore, createSDK, databaseTools, sqliteReadOnly } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const path = process.argv[2] ?? createDemoDatabase();
if (!existsSync(path)) throw new Error(`${path} does not exist`);

// Opened read-only: the file cannot be changed through this connection at all.
const db = new DatabaseSync(path, { readOnly: true });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'shop-database',
  tools: databaseTools({ database: sqliteReadOnly(db), name: 'the shop database', maxRows: 50 }),
});

function createDemoDatabase(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'shop-')), 'shop.sqlite');
  const demo = new DatabaseSync(file);
  demo.exec(`
    CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL, country TEXT);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id),
      total_eur REAL, placed_at TEXT);
    INSERT INTO customers VALUES (1, 'Ada', 'FR'), (2, 'Linus', 'FI'), (3, 'Grace', 'US');
    INSERT INTO orders VALUES (1, 1, 120.5, '2026-09-01'), (2, 1, 80, '2026-09-12'),
      (3, 3, 42, '2026-09-20');
  `);
  demo.close();
  return file;
}
