/**
 * Recipe "a database, read-only" with PostgreSQL. Every query runs in its own
 * `BEGIN READ ONLY` transaction with a statement timeout, and is always rolled back.
 * Connect with a role that only has SELECT rights: that is the real boundary.
 *
 * Run: DATABASE_URL=postgres://readonly_user:…@host/db npm run example:mcp-postgres
 */
import { join } from 'node:path';
import pg from 'pg';
import { FileEventStore, createSDK, databaseTools, postgresReadOnly } from '../src/index.js';
import { serveMcpOverStdio } from '../src/mcp.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set DATABASE_URL to a read-only PostgreSQL role');

const pool = new pg.Pool({ connectionString, max: 4 });
const sdk = createSDK({ eventStore: new FileEventStore(join(import.meta.dirname, 'events')) });

await serveMcpOverStdio(sdk, {
  name: 'warehouse',
  tools: databaseTools({
    database: postgresReadOnly({ pool }, { statementTimeoutMs: 5_000, schemas: ['public'] }),
    name: 'the data warehouse',
    maxRows: 100,
  }),
});
