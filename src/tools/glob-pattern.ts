/**
 * Compiles a simple glob to a regular expression matched against `/`-separated relative
 * paths: `*` is any text within one segment, `?` one character, `**` any number of segments
 * (`docs/**` also matches the `docs` folder itself). Nothing else is special.
 */
export function globToRegExp(pattern: string): RegExp {
  let source = '';
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      const before = index === 0 || pattern[index - 1] === '/';
      const after = pattern[index + 2];
      if (before && after === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else if (before && after === undefined && source.endsWith('/')) {
        source = `${source.slice(0, -1)}(?:/.*)?`;
        index += 1;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += (char ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${source}$`);
}

/** True when the path matches at least one of the globs. */
export function matchesAny(path: string, globs: readonly RegExp[]): boolean {
  return globs.some((glob) => glob.test(path));
}
