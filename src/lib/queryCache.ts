type CacheEntry<T> = { data: T; expiresAt: number };

const store = new Map<string, CacheEntry<unknown>>();

export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { store.delete(key); return undefined; }
  return entry.data;
}

export function cacheSet<T>(key: string, data: T, ttlMs = 60_000): void {
  store.set(key, { data, expiresAt: Date.now() + ttlMs });
}

export async function withCache<T>(key: string, fetcher: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const cached = cacheGet<T>(key);
  if (cached !== undefined) return cached;
  const data = await fetcher();
  cacheSet(key, data, ttlMs);
  return data;
}

export function cacheInvalidate(keyPrefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(keyPrefix)) store.delete(key);
  }
}
