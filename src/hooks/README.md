# Page Data Hooks

## usePageData

Уніфікований hook для завантаження даних сторінки з кешуванням та skeleton логікою.

### Особливості

- ✅ **Stale-while-revalidate**: Показує кеш одразу, оновлює в фоні
- ✅ **Уніфікована skeleton логіка**: Однакова поведінка на всіх сторінках
- ✅ **Background refetch**: Автоматичне оновлення застарілих даних
- ✅ **Мінімальний час skeleton**: Запобігає миганню при швидкому завантаженні

### Приклад використання

```tsx
import { usePageData } from "@/hooks/usePageData";

export function PlayerPage() {
  const { playerId } = useParams();
  
  const { data: player, showSkeleton, error } = usePageData({
    cacheKey: `player:${playerId}`,
    loadFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('id', playerId)
        .single();
      
      if (error) throw error;
      return data;
    },
    cacheTTL: 5 * 60 * 1000, // 5 хвилин
    backgroundRefetch: true,
  });

  if (showSkeleton) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;
  if (!player) return <EmptyState />;

  return <PlayerContent player={player} />;
}
```

### Параметри

- `cacheKey` (string) - Унікальний ключ для кешу
- `loadFn` (() => Promise<T>) - Функція завантаження даних
- `cacheTTL` (number, optional) - Час життя кешу в мс (за замовчуванням 5 хв)
- `showSkeletonOnStale` (boolean, optional) - Показувати skeleton при застарілому кеші
- `backgroundRefetch` (boolean, optional) - Автоматичне оновлення в фоні
- `refetchInterval` (number, optional) - Інтервал для background refetch

### Повертає

- `data` - Дані з кешу або завантажені
- `loading` - Чи зараз відбувається завантаження
- `showSkeleton` - Чи потрібно показувати skeleton
- `error` - Помилка завантаження
- `hasCache` - Чи є кешовані дані
- `isStale` - Чи кеш застарів
- `isInitialLoad` - Чи це перше завантаження
- `refetch()` - Ручне оновлення даних
- `clearCache()` - Очищення кешу

## usePageCache (Legacy)

Простий hook для кешування даних. Рекомендується використовувати `usePageData` для нових сторінок.

## Міграція з usePageCache

### Було:
```tsx
const { cached, setCache } = usePageCache(`player:${playerId}`);
const [loading, setLoading] = useState(!cached);
const [player, setPlayer] = useState(cached?.player ?? null);

useEffect(() => {
  if (cached) return;
  setLoading(true);
  loadPlayer().then(data => {
    setPlayer(data);
    setCache({ player: data });
    setLoading(false);
  });
}, []);

const showSkeleton = useMinimumLoading(loading);
```

### Стало:
```tsx
const { data: player, showSkeleton } = usePageData({
  cacheKey: `player:${playerId}`,
  loadFn: () => loadPlayer(),
});
```
