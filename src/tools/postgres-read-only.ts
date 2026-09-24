import { ValidationError } from '../errors/index.js';
import type { ColumnSummary, ReadOnlyDatabase, TableSummary } from './database-tools.js';
import { assertSingleQuery } from './sql-statement-guard.js';

/** What the adapter needs from a `pg` client (a `pg.Client` or a client of a `pg.Pool`). */
export interface PgClientLike {
  query(
    text: string,
    values?: unknown[]
  ): Promise<{ rows: unknown[]; fields?: ReadonlyArray<{ name: string }> }>;
}

/** What the adapter needs from a `pg.Pool`. */
export interface PgPoolLike {
  connect(): Promise<PgClientLike & { release(destroy?: boolean | Error): void }>;
}

export interface PostgresReadOnlyOptions {
  /** `SET LOCAL statement_timeout` of every query. Default 10 000 ms. */
  statementTimeoutMs?: number;
  /** Schemas listed and described. Default: every schema except the system ones. */
  schemas?: string[];
}

/** Name of the subquery that caps the number of rows. */
const WRAPPER = 'sdk_read_only_query';

/**
 * Read-only access to PostgreSQL for `databaseTools`, through `pg` (a `Pool` or a `Client`).
 * Every query runs in its own `BEGIN READ ONLY` transaction with `SET LOCAL
 * statement_timeout`, always ends with `ROLLBACK`, and is sent with a bind parameter so the
 * server refuses more than one statement. PostgreSQL itself then refuses any write.
 *
 * A read-only transaction does not stop what a function may do outside it (for example
 * `dblink`): connect with a role that only has `SELECT` rights on what you want to expose.
 */
export function postgresReadOnly(
  connection: { pool: PgPoolLike } | { client: PgClientLike },
  options: PostgresReadOnlyOptions = {}
): ReadOnlyDatabase {
  const timeoutMs = Math.floor(options.statementTimeoutMs ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new ValidationError('statementTimeoutMs', 'must be a positive number of milliseconds');
  }
  const schemas = options.schemas ?? null;
  const transaction = readOnlyTransaction(connection, timeoutMs);

  return {
    dialect: 'postgres',
    listTables: ({ maxTables }) =>
      transaction(async (client) => {
        const { rows } = await client.query(
          `SELECT table_schema, table_name, table_type FROM information_schema.tables
           WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
             AND ($2::text[] IS NULL OR table_schema = ANY($2::text[]))
           ORDER BY table_schema, table_name LIMIT $1`,
          [maxTables, schemas]
        );
        return rows.flatMap((row): TableSummary[] =>
          isRecord(row) && typeof row.table_name === 'string'
            ? [
                {
                  name: row.table_name,
                  schema: String(row.table_schema),
                  type: String(row.table_type),
                },
              ]
            : []
        );
      }),
    describeTable: (name) =>
      transaction(async (client) => {
        const dot = name.indexOf('.');
        const schema = dot > 0 ? name.slice(0, dot) : null;
        const table = dot > 0 ? name.slice(dot + 1) : name;
        const { rows } = await client.query(
          `SELECT table_schema, column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
           WHERE table_name = $1 AND ($2::text IS NULL OR table_schema = $2)
             AND table_schema NOT IN ('pg_catalog', 'information_schema')
             AND ($3::text[] IS NULL OR table_schema = ANY($3::text[]))
           ORDER BY table_schema, ordinal_position`,
          [table, schema, schemas]
        );
        const first = rows[0];
        if (!isRecord(first)) {
          throw new ValidationError('table', `no table or view named "${name}"`);
        }
        // Several schemas may have a table with that name: describe the first one.
        return rows.flatMap((row): ColumnSummary[] =>
          isRecord(row) &&
          row.table_schema === first.table_schema &&
          typeof row.column_name === 'string'
            ? [
                {
                  name: row.column_name,
                  type: String(row.data_type),
                  nullable: row.is_nullable === 'YES',
                  default: typeof row.column_default === 'string' ? row.column_default : null,
                },
              ]
            : []
        );
      }),
    query: (sql, { maxRows }) => {
      const statement = assertSingleQuery(sql, 'postgres');
      return transaction(async (client) => {
        // The subquery caps the rows, and the bind parameter forces the extended protocol,
        // in which the server accepts one statement only.
        const result = await client
          .query(`SELECT * FROM (\n${statement}\n) AS ${WRAPPER} LIMIT $1`, [maxRows + 1])
          .catch((error: unknown) => {
            // The server's reason ("column … does not exist", "cannot execute DELETE in a
            // read-only transaction", a timeout) is about the SQL: reported so it can be fixed.
            const reason = error instanceof Error ? error.message : String(error);
            throw new ValidationError('sql', `PostgreSQL refused the query: ${reason}`);
          });
        const firstRow = result.rows[0];
        const columns =
          result.fields?.map((field) => field.name) ??
          (isRecord(firstRow) ? Object.keys(firstRow) : []);
        return {
          columns,
          rows: result.rows.slice(0, maxRows),
          truncated: result.rows.length > maxRows,
        };
      });
    },
  };
}

type Transaction = <T>(work: (client: PgClientLike) => Promise<T>) => Promise<T>;
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

/**
 * Runs work in `BEGIN READ ONLY` … `ROLLBACK`. With a pool, each transaction has its own
 * client, and a client whose ROLLBACK failed is destroyed instead of being reused. With a
 * single client, transactions are queued so they never interleave.
 */
function readOnlyTransaction(
  connection: { pool: PgPoolLike } | { client: PgClientLike },
  timeoutMs: number
): Transaction {
  if ('pool' in connection) {
    return async (work) => {
      const client = await connection.pool.connect();
      const { outcome, clean } = await runReadOnly(client, timeoutMs, work);
      client.release(!clean);
      return unwrap(outcome);
    };
  }
  let queue: Promise<unknown> = Promise.resolve();
  return (work) => {
    const next = queue.then(async () => {
      const { outcome } = await runReadOnly(connection.client, timeoutMs, work);
      return unwrap(outcome);
    });
    queue = next.catch(() => undefined);
    return next;
  };
}

async function runReadOnly<T>(
  client: PgClientLike,
  timeoutMs: number,
  work: (client: PgClientLike) => Promise<T>
): Promise<{ outcome: Outcome<T>; clean: boolean }> {
  let outcome: Outcome<T>;
  try {
    await client.query('BEGIN READ ONLY');
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    // Backslashes in plain strings are literal, as the statement guard assumes.
    await client.query('SET LOCAL standard_conforming_strings = on');
    outcome = { ok: true, value: await work(client) };
  } catch (error) {
    outcome = { ok: false, error };
  }
  try {
    // Always ROLLBACK: nothing a query did, even in a read-only transaction, is kept.
    await client.query('ROLLBACK');
    return { outcome, clean: true };
  } catch (error) {
    return { outcome: outcome.ok ? { ok: false, error } : outcome, clean: false };
  }
}

function unwrap<T>(outcome: Outcome<T>): T {
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
