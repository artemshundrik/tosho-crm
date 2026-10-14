import { useCallback, useEffect, useState } from "react";

import { loadDerivedOrders, type DerivedOrderRecord } from "@/features/orders/orderRecords";

/**
 * Замовлення й затверджені прорахунки — один запит на список і чергу
 * (REQ-322#p12). Кеш у sessionStorage той самий, що мала сторінка списку: перехід
 * між двома екранами не вантажить усе наново.
 */
type CachePayload = { records: DerivedOrderRecord[]; cachedAt: number };

const cacheKey = (teamId: string) => `orders-production-page-cache:${teamId}`;

function readCache(teamId: string | null | undefined): DerivedOrderRecord[] | null {
  if (typeof window === "undefined" || !teamId) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(teamId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    return Array.isArray(parsed.records) ? parsed.records : null;
  } catch {
    return null;
  }
}

export function useOrderRecords(teamId: string | null | undefined, userId: string | null | undefined) {
  const [records, setRecords] = useState<DerivedOrderRecord[]>(() => readCache(teamId) ?? []);
  const [loading, setLoading] = useState(() => !(readCache(teamId)?.length));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!teamId) return;
    const hasCached = (readCache(teamId)?.length ?? 0) > 0;
    if (hasCached) setRefreshing(true);
    else setLoading(true);
    try {
      setError(null);
      const next = await loadDerivedOrders(teamId, userId);
      setRecords(next);
      try {
        sessionStorage.setItem(cacheKey(teamId), JSON.stringify({ records: next, cachedAt: Date.now() } satisfies CachePayload));
      } catch {
        // Переповнене сховище не повинне ламати список.
      }
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Не вдалося завантажити замовлення.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [teamId, userId]);

  useEffect(() => {
    const cached = readCache(teamId);
    if (cached?.length) {
      setRecords(cached);
      setLoading(false);
    }
    void reload();
  }, [teamId, reload]);

  return { records, setRecords, loading, refreshing, error, reload };
}
