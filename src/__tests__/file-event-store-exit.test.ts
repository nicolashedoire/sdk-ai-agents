import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const tsx = join(process.cwd(), 'node_modules', '.bin', 'tsx');
const script = join(process.cwd(), 'src', '__tests__', 'support', 'unwritable-event-store.ts');

describe('FileEventStore at exit', () => {
  it('tries once to write what is pending, and lets the process end even if it cannot', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'store-exit-'));
    const parentFile = join(directory, 'not-a-folder');
    writeFileSync(parentFile, 'a file where the events folder should go');
    const child = spawn(tsx, [script, parentFile], { stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = 0;
    child.stderr.on('data', (chunk: Buffer) => {
      errors += chunk.toString().split('Failed to flush events before exit').length - 1;
    });
    try {
      const code = await Promise.race([
        new Promise<number | null>((resolve) => child.on('exit', (exitCode) => resolve(exitCode))),
        new Promise<'still running'>((resolve) => setTimeout(() => resolve('still running'), 10_000)),
      ]);

      expect(code).toBe(0);
      expect(errors).toBe(1);
    } finally {
      child.kill();
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
