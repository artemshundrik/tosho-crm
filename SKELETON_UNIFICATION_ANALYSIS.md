# Аналіз та виправлення неконсистентної поведінки skeleton

## Проблема

Користувач повідомив, що skeleton працює по-різному на різних сторінках:
- Десь показується skeleton
- Десь показується сторінка з текстом "Завантаження…"
- Десь показується порожній контент
- Десь skeleton завжди з'являється, навіть при повторних відвідуваннях

## Знайдені проблеми

### 1. OverviewPage
**Проблема:** Не показує skeleton взагалі, показує контент з текстом "Завантаження…" всередині компонентів.

**Виправлення:**
- Додано імпорти `PageSkeleton` та `useMinimumLoading`
- Додано перевірку `if (showSkeleton) return <PageSkeleton />` перед рендером контенту
- Видалено текст "Завантаження…" з компонента "Наступне тренування"

### 2. ActivityPage
**Проблема:** `loading` починається з `false`, тому skeleton не показується при першому завантаженні.

**Виправлення:**
- Змінено `useState(false)` на `useState(true)` для `loading`
- Додано імпорти `PageSkeleton` та `useMinimumLoading`
- Додано перевірку `if (showSkeleton) return <PageSkeleton />` перед рендером контенту
- Видалено внутрішній skeleton з умовою `{loading ? ...}`

### 3. NotificationsPage
**Проблема:** `loading` починається з `false`, тому skeleton не показується при першому завантаженні.

**Виправлення:**
- Змінено `useState(false)` на `useState(true)` для `loading`
- Додано імпорти `PageSkeleton` та `useMinimumLoading`
- Додано перевірку `if (showSkeleton) return <PageSkeleton />` перед рендером контенту
- Видалено внутрішній skeleton з умовою `{loading ? ...}`

### 4. PlayersAdminPage
**Проблема:** Показує внутрішній skeleton замість повноцінного `PageSkeleton`.

**Виправлення:**
- Додано імпорти `PageSkeleton` та `useMinimumLoading`
- Додано `const showSkeleton = useMinimumLoading(loading)`
- Замінено внутрішній skeleton на `PageSkeleton` з умовою `{showSkeleton ? <PageSkeleton /> : ...}`

### 5. StatsPage
**Проблема:** Показує внутрішній skeleton замість повноцінного `PageSkeleton`.

**Виправлення:**
- Додано імпорти `PageSkeleton` та `useMinimumLoading`
- Додано `const showSkeleton = useMinimumLoading(loading)`
- Додано перевірку `if (showSkeleton) return <PageSkeleton />` перед рендером контенту

## Результат

Тепер всі сторінки:
1. Показують **однаковий** `PageSkeleton` при завантаженні
2. Використовують `useMinimumLoading` для консистентної тривалості показу skeleton
3. Не показують текст "Завантаження…" всередині контенту
4. Мають правильну початкову `loading` state (`true` для сторінок без кешу)

## Уніфікована логіка

Всі сторінки тепер використовують однаковий підхід:

```typescript
const [loading, setLoading] = useState(true); // або !hasCache для сторінок з кешем
const showSkeleton = useMinimumLoading(loading);

if (showSkeleton) {
  return <PageSkeleton cards={...} rows={...} />;
}

return (
  // ... actual content
);
```

## Файли, які були змінені

1. `src/pages/OverviewPage.tsx`
2. `src/pages/ActivityPage.tsx`
3. `src/pages/NotificationsPage.tsx`
4. `src/pages/PlayersAdminPage.tsx`
5. `src/pages/StatsPage.tsx`
