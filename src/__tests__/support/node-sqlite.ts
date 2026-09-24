import type { SQLiteDatabase } from '../../stores/sqlite-event-store.js';
import type { SqliteConnectionLike } from '../../tools/sqlite-read-only.js';

/** The part of `node:sqlite` the tests use. */
export interface NodeSqlite {
  DatabaseSync: new (
    path: string,
    options?: { readOnly?: boolean }
  ) => SqliteConnectionLike & SQLiteDatabase;
}

/**
 * `node:sqlite` when this Node.js has it (22.13+ without a flag), otherwise undefined. It is
 * loaded with `process.getBuiltinModule` because the test runner cannot import it by name.
 */
export function loadNodeSqlite(): NodeSqlite | undefined {
  if (typeof process.getBuiltinModule !== 'function') {
    return undefined;
  }
  const loaded: unknown = process.getBuiltinModule('node:sqlite');
  return isNodeSqlite(loaded) ? loaded : undefined;
}

// Boundary check: the constructor's signature cannot be verified at run time, only its presence.
function isNodeSqlite(value: unknown): value is NodeSqlite {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'DatabaseSync') === 'function'
  );
}
