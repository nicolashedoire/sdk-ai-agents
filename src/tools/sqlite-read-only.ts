import { ValidationError } from '../errors/index.js';
import type { ColumnSummary, ReadOnlyDatabase, TableSummary } from './database-tools.js';
import { assertSingleQuery } from './sql-statement-guard.js';
import { toJsonRow } from './sql-values.js';

/** A prepared statement of `node:sqlite` (`StatementSync`) or `better-sqlite3`. */
export interface SqliteStatementLike {
  all(...params: unknown[]): unknown[];
  iterate?(...params: unknown[]): Iterator<unknown>;
  columns?(): ReadonlyArray<{ name: string }>;
  /** better-sqlite3: false when the statement writes to the database. */
  readonly readonly?: boolean;
  /** node:sqlite: read integers beyond 2^53 exactly (as bigint). */
  setReadBigInts?(enabled: boolean): unknown;
  /** better-sqlite3: same, as `safeIntegers`. */
  safeIntegers?(enabled?: boolean): unknown;
}

/** An open database of `node:sqlite` (`DatabaseSync`) or `better-sqlite3` (`Database`). */
export interface SqliteConnectionLike {
  prepare(sql: string): SqliteStatementLike;
  exec(sql: string): unknown;
}

/**
 * Read-only access to a SQLite database for `databaseTools`. Each query is checked (one
 * statement, starting with SELECT, WITH or VALUES), then run with `PRAGMA query_only = ON`
 * so SQLite itself refuses any write; with better-sqlite3, a statement that writes is also
 * refused before it runs. For the strongest setup, open the file read-only too
 * (`new DatabaseSync(path, { readOnly: true })`, `new Database(path, { readonly: true })`).
 *
 * SQLite runs queries synchronously in your process and has no statement timeout here: a
 * query that never ends blocks the server.
 */
export function sqliteReadOnly(db: SqliteConnectionLike): ReadOnlyDatabase {
  return {
    dialect: 'sqlite',
    listTables: async ({ maxTables }) =>
      withQueryOnly(db, () =>
        db
          .prepare(
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY name LIMIT ?"
          )
          .all(maxTables)
          .flatMap((row): TableSummary[] =>
            isRecord(row) && typeof row.name === 'string'
              ? [{ name: row.name, type: String(row.type) }]
              : []
          )
      ),
    describeTable: async (name) =>
      withQueryOnly(db, () => {
        const found = db
          .prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?")
          .all(name);
        if (found.length === 0) {
          throw new ValidationError('table', `no table or view named "${name}"`);
        }
        return db
          .prepare(
            'SELECT name, type, "notnull" AS required, dflt_value, pk FROM pragma_table_info(?)'
          )
          .all(name)
          .flatMap((row): ColumnSummary[] =>
            isRecord(row) && typeof row.name === 'string'
              ? [
                  {
                    name: row.name,
                    type: String(row.type ?? ''),
                    nullable: Number(row.required) === 0,
                    default: row.dflt_value === null ? null : String(row.dflt_value),
                    primaryKey: Number(row.pk) > 0,
                  },
                ]
              : []
          );
      }),
    query: async (sql, { maxRows, maxTextLength }) => {
      const statementText = assertSingleQuery(sql, 'sqlite');
      return withQueryOnly(db, () => {
        try {
          const statement = db.prepare(statementText);
          if (statement.readonly === false) {
            throw new ValidationError('sql', 'this statement writes to the database');
          }
          statement.setReadBigInts?.(true);
          statement.safeIntegers?.(true);
          // Values are cut as each row arrives: at most one raw row is held at a time.
          const rows = firstRows(statement, maxRows + 1, (row) => toJsonRow(row, maxTextLength));
          const firstRow = rows[0];
          const columns =
            statement.columns?.().map((column) => column.name) ??
            (firstRow ? Object.keys(firstRow) : []);
          return { columns, rows: rows.slice(0, maxRows), truncated: rows.length > maxRows };
        } catch (error) {
          throw refusal(error);
        }
      });
    },
  };
}

/**
 * Reads at most `count` rows, one at a time when the driver can iterate (both supported
 * drivers can), so the rest of the result is never read.
 */
function firstRows<Row>(
  statement: SqliteStatementLike,
  count: number,
  keep: (row: unknown) => Row
): Row[] {
  if (!statement.iterate) {
    return statement.all().slice(0, count).map(keep);
  }
  const iterator = statement.iterate();
  const rows: Row[] = [];
  try {
    while (rows.length < count) {
      const next = iterator.next();
      if (next.done) break;
      rows.push(keep(next.value));
    }
  } finally {
    iterator.return?.();
  }
  return rows;
}

/**
 * Runs `work` with `PRAGMA query_only = ON`, then restores the previous value. The drivers
 * are synchronous, so no other code can use the connection in between.
 */
function withQueryOnly<T>(db: SqliteConnectionLike, work: () => T): T {
  const current = db.prepare('PRAGMA query_only').all()[0];
  const wasOn = isRecord(current) && Number(current.query_only) === 1;
  db.exec('PRAGMA query_only = ON');
  try {
    return work();
  } finally {
    if (!wasOn) db.exec('PRAGMA query_only = OFF');
  }
}

/**
 * SQLite's reason for refusing the query ("no such column", "attempt to write a readonly
 * database") is about the SQL the caller wrote: it is reported as such, so a model can fix it.
 */
function refusal(error: unknown): ValidationError {
  if (error instanceof ValidationError) return error;
  const reason = error instanceof Error ? error.message : String(error);
  return new ValidationError('sql', `SQLite refused the query: ${reason}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
