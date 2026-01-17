# Аналіз та покращення Skeleton та Кешування

## Проблеми, які були виявлені

### 1. Різна поведінка skeleton на різних сторінках

#### Поточна ситуація:

**Сторінки з `useMinimumLoading`:**
- `FinancePage` - використовує `useMinimumLoading(loading)` + кеш
- `TrainingsListPage` - використовує `useMinimumLoading(loading)`
- `TrainingsAnalyticsPage` - використовує `useMinimumLoading(loading)`
- `TournamentsAdminPage` - використовує `useMinimumLoading(loading)`

**Сторінки з простою перевіркою `loading`:**
- `OverviewPage` - `if (loading) return <PageSkeleton />`
- `MatchesShadcnPage` - `if (loading) return <PageSkeleton />`
- `MatchDetailsPage` - `if (loading) return <PageSkeleton />` + кеш
- `PlayerPage` - `if (loading) return <PageSkeleton />` + кеш
- `TournamentDetailsPage` - `if (loading) return <PageSkeleton />` + кеш з `hasCacheRef`

**Сторінки без skeleton логіки:**
- Деякі сторінки показують skeleton без мінімального часу

#### Проблеми:
- ❌ Немає консистентності - різні підходи на різних сторінках
- ❌ Деякі сторінки мигають при швидкому завантаженні
- ❌ Різна логіка для кешованих даних

### 2. Кешування даних

#### Поточна ситуація:

**Сторінки з кешуванням:**
- `FinancePage` - використовує `usePageCache` + `hasCacheRef`
- `TournamentDetailsPage` - використовує `usePageCache` + `hasCacheRef`
- `MatchDetailsPage` - використовує `usePageCache` + `hasCacheRef`
- `PlayerPage` - використовує `usePageCache` + `hasCacheRef`

**Сторінки без кешування:**
- `OverviewPage` - завжди завантажує дані
- `MatchesShadcnPage` - завжди завантажує дані
- `TrainingsListPage` - завжди завантажує дані

#### Проблеми:
- ❌ Немає stale-while-revalidate стратегії
- ❌ Немає автоматичного background refetch
- ❌ Різна логіка кешування на різних сторінках
- ❌ Немає TTL (time-to-live) для кешу
- ❌ При поверненні на сторінку завжди показується skeleton

## Рішення

### 1. Створено `usePageData` hook

Уніфікований hook який об'єднує:
- ✅ Кешування даних
- ✅ Skeleton логіку з мінімальним часом
- ✅ Stale-while-revalidate стратегію
- ✅ Background refetch
- ✅ TTL для кешу

### 2. Покращено `usePageCache`

Додано:
- ✅ `clearCache()` метод
- ✅ `isStale(ttl)` метод
- ✅ `updatedAt` timestamp
- ✅ Документація про deprecated статус

### 3. Уніфікована skeleton поведінка

Тепер всі сторінки використовують однакову логіку:
- Мінімальний час показу skeleton (400ms)
- Пропуск skeleton при наявності свіжого кешу
- Показ skeleton тільки при першому завантаженні або застарілому кеші

## Стратегія міграції

### Етап 1: Нові сторінки
Використовуйте `usePageData` для всіх нових сторінок.

### Етап 2: Поступова міграція
Мігруйте існуючі сторінки поступово:

1. **Сторінки без кешу** (пріоритет високий):
   - `OverviewPage`
   - `MatchesShadcnPage`
   - `TrainingsListPage`

2. **Сторінки з кешем** (пріоритет середній):
   - `FinancePage`
   - `TournamentDetailsPage`
   - `MatchDetailsPage`
   - `PlayerPage`

### Приклад міграції

#### Було:
```tsx
export function OverviewPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await loadData();
      setData(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <PageSkeleton />;
  return <Content data={data} />;
}
```

#### Стало:
```tsx
export function OverviewPage() {
  const { data, showSkeleton, error } = usePageData({
    cacheKey: 'overview',
    loadFn: async () => {
      return await loadData();
    },
    cacheTTL: 2 * 60 * 1000, // 2 хвилини
    backgroundRefetch: true,
  });

  if (showSkeleton) return <PageSkeleton />;
  if (error) return <ErrorState />;
  return <Content data={data} />;
}
```

## Переваги нового підходу

### 1. Швидке відкриття сторінок
- ✅ При поверненні на сторінку дані показуються одразу з кешу
- ✅ Немає skeleton при наявності свіжого кешу
- ✅ Оновлення даних відбувається в фоні

### 2. Консистентність
- ✅ Однакова поведінка skeleton на всіх сторінках
- ✅ Однакова логіка кешування
- ✅ Уніфікований API

### 3. UX покращення
- ✅ Немає мигання при швидкому завантаженні
- ✅ Миттєве відкриття кешованих сторінок
- ✅ Автоматичне оновлення даних в фоні

### 4. Підтримуваність
- ✅ Централізована логіка
- ✅ Легко змінювати поведінку
- ✅ Документований код

## Наступні кроки

1. ✅ Створено `usePageData` hook
2. ✅ Покращено `usePageCache`
3. ⏳ Міграція сторінок (поступово)
4. ⏳ Додати метрики для моніторингу
5. ⏳ Оптимізувати TTL для різних типів даних
