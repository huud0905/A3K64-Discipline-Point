export type CacheEntry<T> = {
  value: T;
  updatedAt: number;
  ttlMs: number;
};

export function createMemoryCache<T>() {
  let entry: CacheEntry<T> | null = null;

  return {
    get() {
      if (!entry) return null;
      if (entry.ttlMs > 0 && Date.now() - entry.updatedAt > entry.ttlMs) {
        entry = null;
        return null;
      }
      return entry.value;
    },
    set(value: T, ttlMs = 0) {
      entry = { value, updatedAt: Date.now(), ttlMs };
      return value;
    },
    clear() {
      entry = null;
    },
    getEntry() {
      return entry;
    },
  };
}
