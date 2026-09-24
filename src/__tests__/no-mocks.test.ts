import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Tests replace external dependencies with doubles implementing the SDK ports (see support/)
// and run HTTP adapters against local servers. Module mocks and spies would test the mock.
const FORBIDDEN = ['mock', 'doMock', 'fn', 'spyOn', 'stubGlobal', 'hoisted'].map(
  (name) => new RegExp(`\\bvi\\.${name}\\s*\\(`)
);

const testsFolder = dirname(fileURLToPath(import.meta.url));

function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') ? [path] : [];
  });
}

describe('test suites', () => {
  it('use no module mocks, function mocks or spies', () => {
    const offenders = sourceFiles(testsFolder).flatMap((path) =>
      readFileSync(path, 'utf8')
        .split('\n')
        .flatMap((line, index) =>
          FORBIDDEN.some((pattern) => pattern.test(line))
            ? [`${relative(testsFolder, path)}:${index + 1}: ${line.trim()}`]
            : []
        )
    );

    expect(offenders).toEqual([]);
  });
});
