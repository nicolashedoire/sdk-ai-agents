/**
 * JSON with object keys in sorted order, so equal values give equal text. As with
 * `JSON.stringify`, `toJSON` is honoured and `undefined` and functions are left out (`null` in
 * an array). Unlike it, it never throws: a BigInt is written as the string `"<digits>n"`, and a
 * reference to an object that contains it (a cycle) as the string `"[Circular]"`.
 */
export function stableJson(value: unknown): string {
  return write(value, []);
}

function write(value: unknown, ancestors: object[]): string {
  if (typeof value === 'bigint') return JSON.stringify(`${value}n`);
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value) ?? 'null';
  }
  if (ancestors.includes(value)) return JSON.stringify('[Circular]');
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    return write(toJSON.call(value), ancestors);
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
