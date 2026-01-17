import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMinimumLoading } from "./useMinimumLoading";

type PageCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

type UsePageDataOptions<T> = {
  /** Унікальний ключ для кешу */
  cacheKey: string;
  /** Функція завантаження даних */
  loadFn: () => Promise<T>;
  /** Час життя кешу в мілісекундах (за замовчуванням 5 хвилин) */
  cacheTTL?: number;
  /** Чи показувати skeleton при наявності кешу (stale-while-revalidate) */
  showSkeletonOnStale?: boolean;
  /** Чи автоматично оновлювати дані в фоні */
  backgroundRefetch?: boolean;
  /** Інтервал для background refetch (мс) */
  refetchInterval?: number;
};

/**
 * Уніфікований hook для завантаження даних сторінки з кешуванням та skeleton логікою.
 * 
 * Стратегія stale-while-revalidate:
 * - Якщо є свіжий кеш (< TTL) → показуємо одразу, без skeleton
 * - Якщо кеш застарів → показуємо кеш + skeleton, оновлюємо в фоні
 * - Якщо немає кешу → показуємо skeleton, завантажуємо дані
 * 
 * @example
 * ```tsx
 * const { data, loading, showSkeleton, error } = usePageData({
 *   cacheKey: `player:${playerId}`,
 *   loadFn: async () => {
 *     const { data } = await supabase.from('players').select('*').eq('id', playerId).single();
 *     return data;
 *   },
 *   cacheTTL: 5 * 60 * 1000, // 5 хвилин
 *   backgroundRefetch: true,
 * });
 * ```
 */
export function usePageData<T>({
  cacheKey,
  loadFn,
  cacheTTL = 5 * 60 * 1000, // 5 хвилин за замовчуванням
  showSkeletonOnStale = false,
  backgroundRefetch = true,
  refetchInterval,
}: UsePageDataOptions<T>) {
  const queryClient = useQueryClient();
  const fullCacheKey = ["page-cache", cacheKey];
  const cached = queryClient.getQueryData<PageCacheEntry<T>>(fullCacheKey);
  
  // Перевіряємо чи кеш застарів
  const isStale = cached ? Date.now() - cached.updatedAt > cacheTTL : true;
  
  const [data, setData] = useState<T | null>(cached?.data ?? null);
  // loading = true тільки якщо немає кешу або кеш застарів і треба оновити
  const [loading, setLoading] = useState(!cached || (isStale && !showSkeletonOnStale));
  const [error, setError] = useState<Error | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(!cached);
  
  const hasCacheRef = useRef(Boolean(cached));
  const isStaleRef = useRef(isStale);
  const loadPromiseRef = useRef<Promise<T> | null>(null);
  const loadFnRef = useRef(loadFn);

  // Оновлюємо ref при зміні функції
  useEffect(() => {
    loadFnRef.current = loadFn;
  }, [loadFn]);

  // Оновлюємо isStale ref
  useEffect(() => {
    isStaleRef.current = isStale;
  }, [isStale]);

  // Skeleton логіка: показуємо якщо:
  // 1. Немає кешу (перше завантаження) - завжди показуємо skeleton
  // 2. Кеш застарів і showSkeletonOnStale = true - показуємо skeleton
  // НЕ показуємо skeleton якщо є свіжий кеш
  const shouldShowSkeleton = (!cached && loading) || (isStale && showSkeletonOnStale && loading);
  const showSkeleton = useMinimumLoading(shouldShowSkeleton);

  // Функція завантаження даних
  const loadData = async (isBackground = false) => {
    // Якщо вже завантажуємо, не запускаємо повторно
    if (loadPromiseRef.current) {
      return loadPromiseRef.current;
    }

    if (!isBackground) {
      setLoading(true);
      setError(null);
    }

    const promise = loadFnRef.current()
      .then((newData) => {
        setData(newData);
        setError(null);
        
        // Зберігаємо в кеш
        queryClient.setQueryData<PageCacheEntry<T>>(fullCacheKey, {
          data: newData,
          updatedAt: Date.now(),
        });
        
        return newData;
      })
      .catch((err) => {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error(`[usePageData] Error loading data for ${cacheKey}:`, error);
        throw error;
      })
      .finally(() => {
        if (!isBackground) {
          setLoading(false);
        }
        loadPromiseRef.current = null;
        setIsInitialLoad(false);
      });

    loadPromiseRef.current = promise;
    return promise;
  };

  // Початкове завантаження
  useEffect(() => {
    if (!cached) {
      // Немає кешу - завантажуємо з skeleton
      loadData(false);
    } else if (isStale) {
      // Кеш застарів
      if (showSkeletonOnStale) {
        // Показуємо skeleton і завантажуємо
        loadData(false);
      } else if (backgroundRefetch) {
        // Показуємо кеш, оновлюємо в фоні
        loadData(true);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Background refetch
  useEffect(() => {
    if (!backgroundRefetch || !refetchInterval) return;
    if (!cached) return; // Не запускаємо якщо немає кешу

    const interval = setInterval(() => {
      // Оновлюємо тільки якщо кеш застарів
      if (isStaleRef.current) {
        loadData(true);
      }
    }, refetchInterval);

    return () => clearInterval(interval);
  }, [backgroundRefetch, refetchInterval, cached, cacheKey]);

  // Функція для ручного оновлення
  const refetch = async () => {
    return loadData(false);
  };

  // Функція для очищення кешу
  const clearCache = () => {
    queryClient.removeQueries({ queryKey: fullCacheKey });
    setData(null);
    hasCacheRef.current = false;
  };

  return {
    /** Дані з кешу або завантажені */
    data,
    /** Чи зараз відбувається завантаження */
    loading,
    /** Чи потрібно показувати skeleton (з урахуванням мінімального часу) */
    showSkeleton,
    /** Помилка завантаження */
    error,
    /** Чи є кешовані дані */
    hasCache: Boolean(cached),
    /** Чи кеш застарів */
    isStale,
    /** Чи це перше завантаження (немає кешу) */
    isInitialLoad,
    /** Ручне оновлення даних */
    refetch,
    /** Очищення кешу */
    clearCache,
  };
}
