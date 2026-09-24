import { z } from 'zod';
import type { ToolDefinition, ToolMetadata } from '../types/tool.js';
import { prefixed } from './tool-names.js';

export interface TableSummary {
  name: string;
  /** PostgreSQL schema; absent for SQLite. */
  schema?: string;
  /** `table` or `view` (PostgreSQL: `BASE TABLE`, `VIEW`…). */
  type: string;
}

export interface ColumnSummary {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | null;
  primaryKey?: boolean;
}

export interface ReadOnlyQueryResult {
  columns: string[];
  /** At most `maxRows` rows, made JSON-safe with `toJsonRow(row, maxTextLength)`. */
  rows: Array<Record<string, unknown>>;
  /** More rows were available than `maxRows`. */
  truncated: boolean;
}

/**
 * Port of a database the tools may only read. The adapters `sqliteReadOnly` and
 * `postgresReadOnly` implement it; your own implementation must refuse writes itself.
 */
export interface ReadOnlyDatabase {
  /** SQL dialect named in the tool description (`sqlite`, `postgres`…). */
  readonly dialect: string;
  listTables(options: { maxTables: number }): Promise<TableSummary[]>;
  /** Columns of a table or view; throws when it does not exist. */
  describeTable(name: string): Promise<ColumnSummary[]>;
  /**
   * Runs one read-only query and returns at most `maxRows` rows, each converted with
   * `toJsonRow(row, maxTextLength)` as it arrives, so large values are not kept.
   */
  query(
    sql: string,
    options: { maxRows: number; maxTextLength: number }
  ): Promise<ReadOnlyQueryResult>;
}

export interface DatabaseToolsOptions {
  database: ReadOnlyDatabase;
  /** Name shown to the model, e.g. `the sales database`. Default: the dialect. */
  name?: string;
  /** Prefix of the tool names (`list_tables`, `describe_table`, `query`), e.g. `sales_`. */
  prefix?: string;
  /** Rows returned by one query. Default 100, at most 1 000. */
  maxRows?: number;
  /** Characters kept per text value. Default 2 000. */
  maxTextLength?: number;
  /** Tables listed. Default 500. */
  maxTables?: number;
  /** Longest SQL text accepted. Default 20 000 characters. */
  maxSqlLength?: number;
}

const READ_ONLY: ToolMetadata = { category: 'database', riskLevel: 'medium', readOnly: true };

/**
 * Three tools over a read-only database: list its tables, describe one, and run one SELECT
 * query with a row limit.
 *
 * ```ts
 * const tools = databaseTools({ database: sqliteReadOnly(db), name: 'the shop database' });
 * ```
 */
export function databaseTools(options: DatabaseToolsOptions): ToolDefinition[] {
  const { database } = options;
  const maxRows = Math.min(Math.max(1, options.maxRows ?? 100), 1_000);
  const maxTextLength = options.maxTextLength ?? 2_000;
  const maxTables = options.maxTables ?? 500;
  const name = options.name ?? `the ${database.dialect} database`;
  const capability = `database:${database.dialect}`;
  const listName = prefixed(options.prefix, 'list_tables');
  const describeName = prefixed(options.prefix, 'describe_table');

  const describeSchema = z.object({
    table: z
      .string()
      .min(1)
      .max(200)
      .describe('Table or view name (PostgreSQL: optionally schema.table)'),
  });
  const querySchema = z.object({
    sql: z
      .string()
      .min(1)
      .max(options.maxSqlLength ?? 20_000)
      .describe(`One read-only ${database.dialect} query: SELECT, WITH … SELECT or VALUES`),
  });

  return [
    {
      name: listName,
      description: `Lists the tables and views of ${name}.`,
      schema: z.object({}),
      capability,
      metadata: READ_ONLY,
      handler: async () => {
        const tables = await database.listTables({ maxTables: maxTables + 1 });
        return { tables: tables.slice(0, maxTables), truncated: tables.length > maxTables };
      },
    },
    {
      name: describeName,
      description: `Lists the columns of a table or view of ${name}, with their types.`,
      schema: describeSchema,
      capability,
      metadata: READ_ONLY,
      handler: async ({ table }: z.infer<typeof describeSchema>) => ({
        table,
        columns: await database.describeTable(table),
      }),
    },
    {
      name: prefixed(options.prefix, 'query'),
      description:
        `Runs one read-only SQL query (${database.dialect} dialect) on ${name} and returns at most ` +
        `${maxRows} rows; "truncated" is true when there were more. Statements that change ` +
        `data or schema are refused. Use ${listName} and ${describeName} first.`,
      schema: querySchema,
      capability,
      metadata: READ_ONLY,
      handler: async ({ sql }: z.infer<typeof querySchema>) => {
        const result = await database.query(sql, { maxRows, maxTextLength });
        // The limit holds even if a custom adapter returns more.
        const rows = result.rows.slice(0, maxRows);
        return {
          columns: result.columns,
          rows,
          rowCount: rows.length,
          truncated: result.truncated || result.rows.length > maxRows,
        };
      },
    },
  ];
}
