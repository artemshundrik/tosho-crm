import { useQueryClient } from "@tanstack/react-query";

type PageCacheEntry<T> = {
  data: T;
  updatedAt: number;
};

export function usePageCache<T>(key: string) {
  const queryClient = useQueryClient();
  const cacheKey = ["page-cache", key];
  const cached = queryClient.getQueryData<PageCacheEntry<T>>(cacheKey);

  const setCache = (data: T) => {
    queryClient.setQueryData<PageCacheEntry<T>>(cacheKey, {
      data,
      updatedAt: Date.now(),
    });
  };

  return { cached: cached?.data ?? null, setCache };
}
