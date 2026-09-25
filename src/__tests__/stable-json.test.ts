import { describe, expect, it } from 'vitest';
import { stableJson } from '../utils/stable-json.js';

describe('stableJson', () => {
  it('calls toJSON once, as JSON.stringify does, even when it returns the object itself', () => {
    const self: Record<string, unknown> = {
      b: 2,
      a: 1,
      toJSON() {
        return this;
      },
    };
    const once = { toJSON: () => ({ x: 1, toJSON: () => 'called again' }) };
    const looped: Record<string, unknown> = {
      name: 'loop',
      toJSON() {
        return this;
      },
    };
    looped.self = looped;

    // Before: toJSON was called again on its own result, until "Maximum call stack size
    // exceeded", and the result's own toJSON was called.
    expect(stableJson(self)).toBe('{"a":1,"b":2}');
    expect(stableJson({ nested: self })).toBe(JSON.stringify({ nested: { a: 1, b: 2 } }));
    expect(stableJson(once)).toBe(JSON.stringify(once));
    expect(stableJson(once)).toBe('{"x":1}');
    expect(stableJson(looped)).toBe('{"name":"loop","self":"[Circular]"}');
  });
});
