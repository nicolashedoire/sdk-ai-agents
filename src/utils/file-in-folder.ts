import { join } from 'node:path';
import { ValidationError } from '../errors/index.js';

/** Letters, digits, ".", "_" and "-", not starting with a dot: no separator, no "..". */
const FILE_ID = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,199}$/;

/**
 * The file `<id><extension>` inside `folder`. Ids come from callers (a run id given to
 * `getEvents`, a trace id from a request): one that could name a file outside the folder
 * (`../x`, `/etc/x`, `a/b`) or a hidden file is refused instead of being joined to the path.
 */
export function fileInFolder(folder: string, id: string, extension: string, field: string): string {
  if (typeof id !== 'string' || !FILE_ID.test(id)) {
    const shown = String(id).slice(0, 60);
    throw new ValidationError(
      field,
      `"${shown}" cannot name a file: use letters, digits, ".", "_" or "-" (at most 200)`
    );
  }
  return join(folder, `${id}${extension}`);
}
