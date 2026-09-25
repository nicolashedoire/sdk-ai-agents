/**
 * An in-memory cache whose entries expire after `ttlMs`, bounded to `maxEntries` entries and
 * `maxBytes` bytes (the least recently used entries go first; an entry larger than `maxBytes`
 * is not kept). Values are shared: store only what nobody mutates.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number; bytes: number }>();
  private bytes = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries: number,
    private readonly maxBytes = Number.POSITIVE_INFINITY
  ) {}

  get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expires <= Date.now()) {
      this.bytes -= entry.bytes;
      return undefined;
    }
    // Re-inserted: a Map keeps insertion order, so the oldest key is the least recently used.
    this.entries.set(key, entry);
    return entry.value;
  }

  /** Keeps `value`, which takes about `bytes` bytes (0 when unknown). */
  set(key: string, value: V, bytes = 0): void {
    this.delete(key);
    if (this.ttlMs <= 0 || this.maxEntries <= 0 || bytes > this.maxBytes) return;
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs, bytes });
    this.bytes += bytes;
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  private delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    this.bytes -= entry.bytes;
  }

  /** The bytes the entries take, as they were given to `set`. */
  get totalBytes(): number {
    return this.bytes;
  }

  get size(): number {
    return this.entries.size;
  }
}
