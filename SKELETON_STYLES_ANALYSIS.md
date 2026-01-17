# Аналіз та уніфікація стилів Skeleton

## Виявлені проблеми

### 1. Різні висоти skeleton на різних сторінках

**TrainingsListPage (було):**
- KPI: `h-28` ❌
- Картки: `h-[220px]` ❌
- Рядки: `h-12` ❌

**PageSkeleton (стандарт):**
- KPI: `h-24` ✅
- Картки: `h-[240px]` ✅
- Рядки: `h-14` ✅

**TrainingsAnalyticsPage (було):**
- KPI: `h-28` ❌
- Рядки: `h-12` ❌

**TournamentsAdminPage (було):**
- KPI: `h-28` ❌

### 2. Різні rounded значення

- `rounded-[var(--radius-inner)]` - для KPI та рядків
- `rounded-[var(--radius-section)]` - для великих карток
- `rounded-[var(--radius-md)]` - для базових елементів

### 3. Відсутність skeleton на MatchesShadcnPage

Сторінка матчів взагалі не показувала skeleton при завантаженні.

## Виправлення

### 1. Створено константи для skeleton розмірів

Файл: `src/lib/skeletonConstants.ts`

```typescript
export const SKELETON_SIZES = {
  HEADER_HEIGHT: "h-6",
  SUBHEADER_HEIGHT: "h-4",
  KPI_HEIGHT: "h-24",           // ✅ Уніфіковано
  CARD_HEIGHT: "h-[240px]",     // ✅ Уніфіковано
  ROW_HEIGHT: "h-14",           // ✅ Уніфіковано
  ROW_SMALL_HEIGHT: "h-12",
  CARD_LARGE_HEIGHT: "h-[220px]",
} as const;

export const SKELETON_RADIUS = {
  INNER: "rounded-[var(--radius-inner)]",
  SECTION: "rounded-[var(--radius-section)]",
  BASE: "rounded-[var(--radius-md)]",
} as const;
```

### 2. Покращено PageSkeleton

- Додано підтримку `cardVariant` для різних висот карток
- Використовує константи замість жорстко закодованих значень
- Уніфіковані стилі для всіх елементів

### 3. Виправлено сторінки

**MatchesShadcnPage:**
- ✅ Додано `PageSkeleton` при завантаженні

**TrainingsListPage:**
- ✅ Замінено кастомні skeleton на `PageSkeleton` з `cardVariant="large"`
- ✅ Виправлено skeleton для "upcoming" та "past" тренувань

**TrainingsAnalyticsPage:**
- ✅ Виправлено висоту KPI: `h-28` → `h-24`
- ✅ Виправлено висоту рядків: `h-12` → `h-14`

**TournamentsAdminPage:**
- ✅ Виправлено висоту KPI: `h-28` → `h-24`

## Результат

### Уніфіковані розміри

| Елемент | Висота | Rounded |
|---------|--------|---------|
| Заголовок | `h-6` | `rounded-[var(--radius-md)]` |
| Підзаголовок | `h-4` | `rounded-[var(--radius-md)]` |
| KPI картки | `h-24` | `rounded-[var(--radius-inner)]` |
| Контент картки | `h-[240px]` | `rounded-[var(--radius-section)]` |
| Рядки списку | `h-14` | `rounded-[var(--radius-inner)]` |

### Консистентність

Тепер всі сторінки використовують:
- ✅ Однакові висоти для однакових типів елементів
- ✅ Однакові rounded значення
- ✅ Уніфікований базовий стиль через CSS змінні
- ✅ Константи для легкого змінення в майбутньому

## Рекомендації

1. **Використовуйте `PageSkeleton`** для стандартних сторінок
2. **Використовуйте константи** з `SKELETON_SIZES` та `SKELETON_RADIUS` для кастомних skeleton
3. **Дотримуйтесь стандартних розмірів** при створенні нових skeleton
