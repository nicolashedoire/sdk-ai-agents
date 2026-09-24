import { ValidationError } from '../errors/index.js';

export type SqlDialect = 'sqlite' | 'postgres';

/** First keywords of the statements accepted as queries. */
const QUERY_KEYWORDS = new Set(['select', 'with', 'values']);

/**
 * First line of defence of the read-only database tools: exactly one statement, starting
 * with SELECT, WITH or VALUES, without bind parameters. It is a lexical check (strings,
 * quoted identifiers, comments and PostgreSQL dollar quotes are understood), not a parser:
 * the database adapters also run every query in a mode where the database itself refuses
 * writes, because `WITH … DELETE` or a function with side effects starts like a query.
 *
 * Returns the statement without its trailing semicolon.
 */
export function assertSingleQuery(sql: string, dialect: SqlDialect): string {
  const scan = scanStatements(sql, dialect);
  if (scan.statements.length === 0) {
    throw new ValidationError('sql', 'the query is empty');
  }
  if (scan.statements.length > 1) {
    throw new ValidationError('sql', 'only one statement is allowed');
  }
  const statement = scan.statements[0] ?? '';
  if (scan.placeholders) {
    throw new ValidationError('sql', 'bind parameters ($1…) are not supported: write the values');
  }
  const keyword = firstKeyword(statement, dialect);
  if (!QUERY_KEYWORDS.has(keyword)) {
    throw new ValidationError(
      'sql',
      `only read queries (SELECT, WITH … SELECT, VALUES) are allowed, not ${keyword.toUpperCase() || 'this statement'}`
    );
  }
  return statement;
}

interface Scan {
  /** Statements with meaningful content, trimmed, without separators. */
  statements: string[];
  /** A `$1`-style bind parameter appears outside strings and comments (PostgreSQL). */
  placeholders: boolean;
}

/** Splits SQL on top-level semicolons, skipping strings, identifiers and comments. */
export function scanStatements(sql: string, dialect: SqlDialect): Scan {
  const statements: string[] = [];
  let placeholders = false;
  let start = 0;
  let meaningful = false;
  let index = 0;
  // Parentheses must balance: the PostgreSQL adapter wraps the query in a sub-query, and a
  // `)` closing below depth 0 would step out of it.
  let depth = 0;
  const flush = (end: number) => {
    if (meaningful) statements.push(sql.slice(start, end).trim());
    start = end + 1;
    meaningful = false;
  };
  while (index < sql.length) {
    const char = sql[index] ?? '';
    const next = sql[index + 1] ?? '';
    if (char === '-' && next === '-') {
      index = endOfLine(sql, index, dialect);
    } else if (char === '/' && next === '*') {
      index = endOfBlockComment(sql, index, dialect === 'postgres');
    } else if (char === "'" && dialect === 'postgres' && isEscapeStringPrefix(sql, index)) {
      // E'…': backslash escapes, so \' does not end the string.
      index = endOfEscapeString(sql, index);
      meaningful = true;
    } else if (char === "'" || char === '"' || (dialect === 'sqlite' && char === '`')) {
      index = endOfQuoted(sql, index, char);
      meaningful = true;
    } else if (dialect === 'sqlite' && char === '[') {
      index = endOfQuoted(sql, index, ']');
      meaningful = true;
    } else if (
      dialect === 'postgres' &&
      char === '$' &&
      !/[A-Za-z0-9_$]/.test(sql[index - 1] ?? '')
    ) {
      // Not part of an identifier (`price$eur`): a dollar quote or a bind parameter.
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index, index + 64));
      if (tag) {
        index = endOfDollarQuote(sql, index, tag[0]);
      } else {
        if (/[0-9]/.test(next)) placeholders = true;
        index++;
      }
      meaningful = true;
    } else if (char === ';') {
      flush(index);
      index++;
    } else if (char === '(' || char === ')') {
      depth += char === '(' ? 1 : -1;
      if (depth < 0) {
        throw new ValidationError('sql', 'unbalanced parentheses: a ")" closes nothing');
      }
      meaningful = true;
      index++;
    } else {
      if (!/\s/.test(char)) meaningful = true;
      index++;
    }
  }
  flush(sql.length);
  if (depth !== 0) {
    throw new ValidationError('sql', 'unbalanced parentheses: a "(" is never closed');
  }
  return { statements, placeholders };
}

function firstKeyword(statement: string, dialect: SqlDialect): string {
  let index = 0;
  // Skip comments, blanks and opening parentheses: `(SELECT …) UNION (SELECT …)`.
  for (;;) {
    const rest = statement.slice(index);
    const skipped = /^[\s(]+/.exec(rest);
    if (skipped) {
      index += skipped[0].length;
    } else if (rest.startsWith('--')) {
      index = endOfLine(statement, index, dialect);
    } else if (rest.startsWith('/*')) {
      index = endOfBlockComment(statement, index, dialect === 'postgres');
    } else {
      break;
    }
  }
  return (/^[A-Za-z_]+/.exec(statement.slice(index))?.[0] ?? '').toLowerCase();
}

/** A `--` comment ends at a line feed; PostgreSQL also ends it at a carriage return. */
function endOfLine(sql: string, index: number, dialect: SqlDialect): number {
  const end =
    dialect === 'postgres' ? sql.slice(index).search(/[\n\r]/) : sql.indexOf('\n', index) - index;
  return end < 0 ? sql.length : index + end + 1;
}

/** `E'…'` (or `e'…'`) not preceded by an identifier character: a PostgreSQL escape string. */
function isEscapeStringPrefix(sql: string, index: number): boolean {
  return /[eE]/.test(sql[index - 1] ?? '') && !/[A-Za-z0-9_$]/.test(sql[index - 2] ?? '');
}

function endOfEscapeString(sql: string, index: number): number {
  let position = index + 1;
  while (position < sql.length) {
    const char = sql[position];
    if (char === '\\') {
      position += 2;
    } else if (char === "'" && sql[position + 1] === "'") {
      position += 2;
    } else if (char === "'") {
      // `E'a'` + whitespace holding a newline + `'b'` is one string: its next part is read
      // with the same backslash escapes.
      const continuation = STRING_CONTINUATION.exec(sql.slice(position + 1));
      if (!continuation) return position + 1;
      position += 1 + continuation[0].length;
    } else {
      position++;
    }
  }
  throw new ValidationError('sql', 'unterminated string or quoted identifier');
}

/**
 * What separates two parts of one PostgreSQL string: blanks and `--` comments including at
 * least one line break, then the opening quote of the next part.
 */
const STRING_CONTINUATION = /^(?:[ \t\f\v]|--[^\r\n]*)*[\r\n](?:[ \t\f\v\r\n]|--[^\r\n]*)*'/;

/** PostgreSQL block comments nest; SQLite ones do not. An unclosed comment is an error. */
function endOfBlockComment(sql: string, index: number, nested: boolean): number {
  let depth = 0;
  let position = index;
  while (position < sql.length) {
    if (sql.startsWith('/*', position)) {
      depth = nested ? depth + 1 : 1;
      position += 2;
    } else if (sql.startsWith('*/', position)) {
      depth--;
      position += 2;
      if (depth === 0) return position;
    } else {
      position++;
    }
  }
  throw new ValidationError('sql', 'unterminated comment');
}

/** Quoted text ends at the closing quote; a doubled quote is an escaped quote. */
function endOfQuoted(sql: string, index: number, close: string): number {
  let position = index + 1;
  while (position < sql.length) {
    if (sql[position] === close) {
      if (close !== ']' && sql[position + 1] === close) {
        position += 2;
        continue;
      }
      return position + 1;
    }
    position++;
  }
  throw new ValidationError('sql', 'unterminated string or quoted identifier');
}

function endOfDollarQuote(sql: string, index: number, tag: string): number {
  const end = sql.indexOf(tag, index + tag.length);
  if (end === -1) {
    throw new ValidationError('sql', 'unterminated dollar-quoted string');
  }
  return end + tag.length;
}
