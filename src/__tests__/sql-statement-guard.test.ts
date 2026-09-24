import { describe, expect, it } from 'vitest';
import { assertSingleQuery } from '../tools/sql-statement-guard.js';

describe('assertSingleQuery', () => {
  it('accepts one read query and returns it without its trailing semicolon', () => {
    expect(assertSingleQuery('SELECT 1;', 'sqlite')).toBe('SELECT 1');
    expect(assertSingleQuery('  select * from t ;  -- done\n', 'postgres')).toBe('select * from t');
    expect(assertSingleQuery('WITH x AS (SELECT 1) SELECT * FROM x', 'postgres')).toContain('WITH x');
    expect(assertSingleQuery('/* why */ (SELECT 1) UNION (SELECT 2)', 'sqlite')).toContain('UNION');
    expect(assertSingleQuery('VALUES (1), (2)', 'sqlite')).toBe('VALUES (1), (2)');
  });

  it('does not split on semicolons inside strings, identifiers, comments or dollar quotes', () => {
    const queries: Array<[string, 'sqlite' | 'postgres']> = [
      ["SELECT 'a;b', 'it''s;'", 'sqlite'],
      ['SELECT "odd;column" FROM t', 'postgres'],
      ['SELECT `odd;column`, [other;one] FROM t', 'sqlite'],
      ['SELECT 1 -- ; DROP TABLE t\n', 'sqlite'],
      ['SELECT 1 /* ; /* nested ; */ still comment; */', 'postgres'],
      ['SELECT $$;$$, $tag$ ; $$ ; $tag$', 'postgres'],
      ['SELECT price$eur FROM t', 'postgres'],
    ];
    for (const [sql, dialect] of queries) {
      expect(() => assertSingleQuery(sql, dialect), sql).not.toThrow();
    }
  });

  it('refuses several statements, writes, bind parameters and unterminated text', () => {
    const refused: Array<[string, 'sqlite' | 'postgres', string]> = [
      ['SELECT 1; DELETE FROM t', 'sqlite', 'only one statement is allowed'],
      ["SELECT 'x'; COMMIT; DROP TABLE t", 'postgres', 'only one statement is allowed'],
      ['DELETE FROM t', 'sqlite', 'not DELETE'],
      ['-- looks harmless\nDROP TABLE t', 'postgres', 'not DROP'],
      ['PRAGMA query_only = OFF', 'sqlite', 'not PRAGMA'],
      ['ATTACH DATABASE "x.db" AS x', 'sqlite', 'not ATTACH'],
      ['EXPLAIN ANALYZE DELETE FROM t', 'postgres', 'not EXPLAIN'],
      ['SELECT * FROM t WHERE id = $1', 'postgres', 'bind parameters'],
      ["SELECT 'unfinished", 'sqlite', 'unterminated string'],
      ['SELECT $x$ never closed', 'postgres', 'unterminated dollar-quoted string'],
      ['SELECT 1 /* never closed', 'sqlite', 'unterminated comment'],
      ['  ;  -- nothing', 'sqlite', 'the query is empty'],
    ];
    for (const [sql, dialect, reason] of refused) {
      expect(() => assertSingleQuery(sql, dialect), sql).toThrow(reason);
    }
  });

  it('leaves WITH … DELETE to the database: it starts like a query', () => {
    // The lexical check cannot tell; the adapters' read-only mode refuses it (see their tests).
    expect(assertSingleQuery('WITH gone AS (DELETE FROM t RETURNING *) SELECT * FROM gone', 'postgres')).toContain('DELETE');
  });
});
