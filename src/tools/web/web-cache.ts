/**
 * An in-memory cache whose entries expire after `ttlMs`, bounded to `maxEntries` (the least
 * recently used entry goes first). Values are shared: store only what nobody mutates.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= Date.now()) return undefined;
    // Re-inserted: a Map keeps insertion order, so the oldest key is the least recently used.
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.ttlMs <= 0 || this.maxEntries <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
