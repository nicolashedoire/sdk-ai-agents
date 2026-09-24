import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Tests replace external dependencies with doubles implementing the SDK ports (see support/)
// and run HTTP adapters against local servers. Module mocks and spies would test the mock.
const MOCKING = [
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importMock',
  'mocked',
  'fn',
  'spyOn',
  'stubGlobal',
  'stubEnv',
  'hoisted',
].join('|');

const FORBIDDEN: Array<{ what: string; pattern: RegExp }> = [
  // Whitespace (line breaks included) may separate `vi`, the dot and the method.
  {
    what: 'vi mocking API',
    pattern: new RegExp(`\\bvi(?:test)?\\s*\\.\\s*(?:${MOCKING})\\b`, 'g'),
  },
  { what: 'computed access to vi', pattern: /\bvi(?:test)?\s*\[/g },
  { what: 'vi imported under another name', pattern: /\bvi\s+as\s+\w+/g },
];

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Every folder whose tests the root Vitest run picks up.
const FOLDERS = ['src/__tests__', 'benchmarks', 'templates'];

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

describe('test suites', () => {
  it('use no module mocks, function mocks or spies', () => {
    const self = fileURLToPath(import.meta.url);
    const offenders = FOLDERS.flatMap((folder) => sourceFiles(join(root, folder)))
      .filter((path) => path !== self)
      .flatMap((path) => {
        const text = readFileSync(path, 'utf8');
        return FORBIDDEN.flatMap(({ what, pattern }) =>
          [...text.matchAll(pattern)].map((match) => {
            const line = text.slice(0, match.index).split('\n').length;
            return `${relative(root, path)}:${line}: ${what}`;
          })
        );
      });

    expect(offenders).toEqual([]);
  });
});
