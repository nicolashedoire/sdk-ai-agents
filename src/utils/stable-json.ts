/**
 * JSON with object keys in sorted order, so equal values give equal text. `undefined` and
 * functions are left out, as `JSON.stringify` does.
 */
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined || typeof item === 'function' ? 'null' : stableJson(item))).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => record[key] !== undefined && typeof record[key] !== 'function')
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
