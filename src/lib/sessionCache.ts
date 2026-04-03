const SESSION_CACHE_SCHEMA_KEY = "app_session_cache_schema";
const SESSION_CACHE_SCHEMA_VERSION = "2026-04-03-storage-v3";
const HEAVY_SESSION_CACHE_PREFIXES = [
  "design-task-page-cache:",
  "quote-details-cache:",
  "design-page-cache:",
  "quotes-page-cache:",
  "orders-production-page-cache:",
] as const;
const HEAVY_SESSION_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
const DETAIL_CACHE_LIMITS: Array<{ prefix: string; maxEntries: number }> = [
  { prefix: "design-task-page-cache:", maxEntries: 4 },
  { prefix: "quote-details-cache:", maxEntries: 4 },
];

type SessionCacheEntryMeta = {
  key: string;
  cachedAt: number;
};

function isHeavySessionCacheKey(key: string) {
  return HEAVY_SESSION_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function safeRemoveSessionStorageKey(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ignore storage cleanup failures
  }
}

function readCachedAt(key: string): number | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { cachedAt?: unknown };
    const cachedAt = Number(parsed?.cachedAt);
    return Number.isFinite(cachedAt) ? cachedAt : null;
  } catch {
    return null;
  }
}

function clearLegacyHeavySessionCaches() {
  const keysToDelete: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (!key || !isHeavySessionCacheKey(key)) continue;
    keysToDelete.push(key);
  }
  keysToDelete.forEach((key) => safeRemoveSessionStorageKey(key));
}

function pruneHeavySessionCaches() {
  const now = Date.now();
  const detailEntriesByPrefix = new Map<string, SessionCacheEntryMeta[]>();

  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (!key || !isHeavySessionCacheKey(key)) continue;
    const cachedAt = readCachedAt(key);
    if (!cachedAt || now - cachedAt > HEAVY_SESSION_CACHE_MAX_AGE_MS) {
      safeRemoveSessionStorageKey(key);
      continue;
    }
    const detailPrefix = DETAIL_CACHE_LIMITS.find((entry) => key.startsWith(entry.prefix))?.prefix;
    if (!detailPrefix) continue;
    const entries = detailEntriesByPrefix.get(detailPrefix) ?? [];
    entries.push({ key, cachedAt });
    detailEntriesByPrefix.set(detailPrefix, entries);
  }

  DETAIL_CACHE_LIMITS.forEach(({ prefix, maxEntries }) => {
    const entries = detailEntriesByPrefix.get(prefix);
    if (!entries || entries.length <= maxEntries) return;
    entries
      .sort((a, b) => b.cachedAt - a.cachedAt)
      .slice(maxEntries)
      .forEach((entry) => safeRemoveSessionStorageKey(entry.key));
  });
}

export function migrateAndPruneSessionCaches() {
  if (typeof window === "undefined") return;

  try {
    const currentVersion = window.sessionStorage.getItem(SESSION_CACHE_SCHEMA_KEY);
    if (currentVersion !== SESSION_CACHE_SCHEMA_VERSION) {
      clearLegacyHeavySessionCaches();
      window.sessionStorage.setItem(SESSION_CACHE_SCHEMA_KEY, SESSION_CACHE_SCHEMA_VERSION);
      return;
    }
  } catch {
    return;
  }

  pruneHeavySessionCaches();
}
