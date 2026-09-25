/**
 * JSON with object keys in sorted order, so equal values give equal text. As with
 * `JSON.stringify`, `toJSON` is called once (not again on its result) and `undefined` and
 * functions are left out (`null` in an array). Unlike it, a BigInt or a cycle does not make it
 * throw: a BigInt is written as the string `"<digits>n"`, and a reference to an object that
 * contains it (a cycle) as the string `"[Circular]"`. A `toJSON` or a getter that throws, or
 * that returns new objects without end, still does.
 */
export function stableJson(value: unknown): string {
  return write(value, []);
}

function write(value: unknown, ancestors: object[], returnedByToJSON = false): string {
  if (typeof value === 'bigint') return JSON.stringify(`${value}n`);
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value) ?? 'null';
  }
  if (ancestors.includes(value)) return JSON.stringify('[Circular]');
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  // Its result is written as it is, even when it has a toJSON too (the object itself, say).
  if (typeof toJSON === 'function' && !returnedByToJSON) {
    return write(toJSON.call(value), ancestors, true);
  }
  const inside = [...ancestors, value];
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      item === undefined || typeof item === 'function' || typeof item === 'symbol'
        ? 'null'
        : write(item, inside)
    );
    return `[${items.join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .filter((key) => {
      const item = record[key];
      return item !== undefined && typeof item !== 'function' && typeof item !== 'symbol';
    })
    .sort()
    .map((key) => `${JSON.stringify(key)}:${write(record[key], inside)}`);
  return `{${entries.join(',')}}`;
}
