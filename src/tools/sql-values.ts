import { clip } from './bounded-text.js';

/** Items kept from an array value; the rest is counted. */
export const MAX_ARRAY_ITEMS = 100;

/**
 * Turns a value read from a database into plain JSON a model can read: big integers become
 * numbers when exact (strings otherwise), dates ISO strings, binary data a short note, and
 * long texts are cut at `maxTextLength` characters.
 */
export function toJsonValue(value: unknown, maxTextLength: number): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return clip(value, maxTextLength);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (value instanceof Uint8Array) return `<binary data, ${value.byteLength} bytes>`;
  if (Array.isArray(value)) {
    // Arrays (PostgreSQL `array_agg`, JSON arrays) could hold a whole table in one value.
    const kept = value.slice(0, MAX_ARRAY_ITEMS).map((item) => toJsonValue(item, maxTextLength));
    return value.length > MAX_ARRAY_ITEMS
      ? [...kept, `… ${value.length - MAX_ARRAY_ITEMS} more items`]
      : kept;
  }
  if (typeof value === 'object') {
    // JSON columns: kept as objects, unless their text form is too long.
    const text = JSON.stringify(value, (_key, item: unknown) =>
      typeof item === 'bigint' ? item.toString() : item
    );
    if (text.length > maxTextLength) return clip(text, maxTextLength);
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = toJsonValue(item, maxTextLength);
    }
    return result;
  }
  return String(value);
}

/** One database row as a plain object with JSON-safe values. */
export function toJsonRow(row: unknown, maxTextLength: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  if (typeof row === 'object' && row !== null) {
    for (const [key, value] of Object.entries(row)) {
      result[key] = toJsonValue(value, maxTextLength);
    }
  }
  return result;
}
