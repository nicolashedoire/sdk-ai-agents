/** The objects in `body[key]`, when it is a list. */
export function listOf(body: unknown, key: string): Array<Record<string, unknown>> {
  return valuesOf(body, key).filter(isRecord);
}

/** `body[key]` when it is a list, else an empty one. */
export function valuesOf(body: unknown, key: string): unknown[] {
  if (!isRecord(body)) return [];
  const list = body[key];
  return Array.isArray(list) ? list : [];
}

/** A non-empty string (trimmed), or a finite number as text. */
export function text(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
