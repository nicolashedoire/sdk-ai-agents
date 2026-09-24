import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { clip } from '../tools/bounded-text.js';

/** A full garbage collection (the flag is set for this isolate only). */
function collectGarbage(): void {
  setFlagsFromString('--expose_gc');
  const gc: unknown = runInNewContext('gc');
  if (typeof gc !== 'function') throw new Error('gc is not available');
  gc();
  gc();
}

/** A string that lives in the V8 heap (not an external one), `length` characters long. */
function largeText(seed: number, length: number): string {
  return JSON.parse(JSON.stringify(String.fromCharCode(97 + seed).repeat(length)));
}

describe('clip', () => {
  it('cuts long texts and marks the cut', () => {
    expect(clip('short', 10)).toBe('short');
    expect(clip('abcdefghij', 5)).toBe('abcd…');
  });

  it('does not keep the original text alive once cut', () => {
    collectGarbage();
    const before = process.memoryUsage().heapUsed;
    const kept: string[] = [];
    for (let seed = 0; seed < 6; seed++) {
      kept.push(clip(largeText(seed, 30_000_000), 2_000));
    }
    collectGarbage();
    const retainedMb = (process.memoryUsage().heapUsed - before) / 1e6;

    expect(kept.every((text) => text.length === 2_000)).toBe(true);
    // Six cut texts of 2 000 characters, not six originals of 30 MB (180 MB).
    expect(retainedMb).toBeLessThan(90);
  }, 20_000);
});
