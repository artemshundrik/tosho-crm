import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";

type PageCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

/**
 * Простий hook для кешування даних сторінки.
 * Для більш розширених можливостей (stale-while-revalidate, background refetch) 
 * використовуйте usePageData.
 * 
 * @deprecated Рекомендується використовувати usePageData для нових сторінок
 */
export function usePageCache<T>(key: string) {
  const queryClient = useQueryClient();
  const cacheKey = useMemo(() => ["page-cache", key], [key]);
  const cached = queryClient.getQueryData<PageCacheEntry<T>>(cacheKey);

  const setCache = useCallback((data: T) => {
    queryClient.setQueryData<PageCacheEntry<T>>(cacheKey, {
      data,
      updatedAt: Date.now(),
    });
  }, [cacheKey, queryClient]);

  const clearCache = useCallback(() => {
    queryClient.removeQueries({ queryKey: cacheKey });
  }, [cacheKey, queryClient]);

  const isStale = useCallback((ttl: number) => {
    if (!cached) return true;
    return Date.now() - cached.updatedAt > ttl;
  }, [cached]);

  return { 
    cached: cached?.data ?? null, 
    setCache,
    clearCache,
    isStale,
    updatedAt: cached?.updatedAt ?? null,
  };
}
