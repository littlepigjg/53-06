export interface CacheEntry<T> {
  value: T;
  timestamp: number;
}

export interface CacheStats {
  totalEntries: number;
  maxEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  sampleKeys: string[];
}

export interface CacheOptions {
  maxEntries?: number;
  ttlMs?: number;
}

const DEFAULT_MAX_ENTRIES = 1000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

export class CacheService<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxEntries: number;
  private ttlMs: number;
  private hitCount: number;
  private missCount: number;

  constructor(options: CacheOptions = {}) {
    this.cache = new Map();
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.hitCount = 0;
    this.missCount = 0;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      this.missCount++;
      return null;
    }

    this.hitCount++;
    return entry.value;
  }

  set(key: string, value: T): void {
    this.cache.set(key, { value, timestamp: Date.now() });
    this.evictIfNeeded();
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  deleteByPattern(pattern: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.maxEntries) return;

    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = entries.slice(0, this.cache.size - this.maxEntries);
    for (const [key] of toRemove) {
      this.cache.delete(key);
    }
  }

  getStats(): CacheStats {
    const total = this.hitCount + this.missCount;
    const keys = Array.from(this.cache.keys()).slice(0, 20);
    return {
      totalEntries: this.cache.size,
      maxEntries: this.maxEntries,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
      sampleKeys: keys,
    };
  }

  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
  }

  get size(): number {
    return this.cache.size;
  }
}

export function buildCacheKey(parts: (string | number | boolean | undefined | null)[]): string {
  return parts
    .map((p) => {
      if (p === undefined || p === null) return '';
      if (Array.isArray(p)) return p.join(',');
      return String(p);
    })
    .filter((p) => p !== '')
    .join(':');
}
