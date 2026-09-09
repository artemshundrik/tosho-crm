# Сторінка «Постачальники» — план реалізації

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Нова сторінка `/suppliers`: пошук по товарах усіх під'єднаних постачальників, картки стану кожного постачальника і сторінка `/suppliers/:id` з паспортом кабінету, контактом і його товарами.

**Architecture:** Паспорт постачальника — реєстр у коді (`src/features/suppliers/suppliersCatalog.ts`), живі числа — три RPC на читання в схемі `tosho`, доступ через React Query. Сторінки побудовані за зразком «Інтеграцій» (реєстр + стан + картки однакової висоти). Товари — наявний рушій пулу: `searchSupplierPool`, `groupSupplierPoolRows`, спільний рядок `SupplierPoolRow`.

**Tech Stack:** React 19, TypeScript 7, Vite, react-router-dom, @tanstack/react-query 5, Supabase (PostgREST RPC під RLS), Postgres SQL-функції, vitest (node для логіки, jsdom + Testing Library для компонентів), oxlint, Tailwind v4.

**Spec:** [docs/superpowers/specs/2026-09-09-suppliers-page-design.md](../specs/2026-09-09-suppliers-page-design.md)

**Картка:** REQ-259 (у роботі). Пункти чекліста p1–p8 закриваються трейлерами комітів.

## Global Constraints

- Схема `tosho`. RPC кличемо лише через `supabase.schema("tosho").rpc("ім'я", { p_... })` — імена аргументів `p_*` мусять збігатися з базою, це звіряє `check:rpc-contracts`.
- **Ніякого `git push`.** Коміти локальні. Тема коміта — людською, що тепер працює інакше для користувача CRM. Технічне — у тіло.
- Трейлер `Закриває: REQ-259#pN` — окремим рядком з початку рядка, без відступу, в кінці повідомлення. Голий `REQ-259` у тексті заборонений гаком; згадка словами — «картка 259».
- Перевірка: `npm run check:fast` після кожної задачі, `npm run check` перед фінальним звітом.
- Тести: `.test.ts` — логіка (середовище node), `.test.tsx` — компоненти (jsdom, `@testing-library/react`, `globals: true`).
- Сторінки НЕ додають власного `max-w`: макет уже дає відступи й `max-w-[1600px]`.
- Лого — лише `EntityAvatar` з `@/components/app/avatar-kit`; голий `<img>` для лого заборонений.
- Назви постачальників латиницею, як у `supplierDisplayName` (`Totobi`, `Bergamo`, `Berrytex`, `Avanprint`, `E-Suvenir`).
- Ціни на картках товарів: одна цифра з підписом «наша» або «роздріб», ціни сайту не показуємо.
- Коментарі в коді українською, про «навіщо», як у решті репозиторію.
- Дата в файлах і повідомленнях: 09.09.2026.
- Ідентифікатор постачальника в адресі — ключ реєстру завантажувача (`totobi`, `bergamo`, `berrytex`, `avanprint`, `e-suvenir`), не домен.

---

## Структура файлів

| Файл | Відповідальність |
|---|---|
| `scripts/supplier-pool-page.sql` (новий) | три RPC на читання: зведення пулу, товари одного постачальника сторінками по назвах, розділи |
| `src/lib/formatAgo.ts` (новий) + тест | «2 години тому» — одна копія замість локальної в `IntegrationCard` |
| `src/lib/brandFavicon.ts` (новий) | `faviconUrl(domain)` — одна адреса фавікона замість двох копій |
| `src/components/app/useIsClamped.ts` (новий) | хук «текст обрізався» — винесений з `IntegrationCard` |
| `src/components/catalog/SupplierPoolRow.tsx` (новий) | картка товару пулу + `PoolPhoto`, винесені з `SupplierPoolSearch.tsx` |
| `src/components/catalog/SupplierPoolFilterBar.tsx` (+ тест, переїзд) | чипи джерел і «лише з ціною» — спільні для візарда й сторінки |
| `src/features/suppliers/suppliersCatalog.ts` + тест | реєстр постачальників: паспорт кабінету, прапорець «у пошуку», заплановані |
| `src/features/suppliers/suppliersStatus.ts` + тест | чиста логіка: стан картки, застарілість, три числа, тони/іконки/підписи |
| `src/features/suppliers/queries.ts` | React Query: зведення, контакти підрядників, товари (нескінченна вибірка), розділи |
| `src/features/suppliers/SupplierCard.tsx` + тест | картка постачальника у списку |
| `src/features/suppliers/SupplierProductSearch.tsx` + тест | пошук по товарах усіх джерел (верх списку) |
| `src/features/suppliers/SupplierPassport.tsx` + тест | блоки паспорта й контакт на сторінці постачальника |
| `src/features/suppliers/SupplierProducts.tsx` + тест | товари одного постачальника: пошук, розділи, «Показати ще» |
| `src/pages/SuppliersPage.tsx` (новий) | список: тулбар, пошук, картки, блок «Плануємо» |
| `src/pages/SupplierPage.tsx` (новий) | сторінка постачальника: шапка, паспорт, товари |
| `src/lib/moduleAccess.ts` (+ тест) | ключ модуля `suppliers` у всіх посад |
| `src/layout/routes.ts`, `src/App.tsx`, `src/layout/AppLayout.tsx`, `src/layout/headerConfig.ts`, `src/layout/pageSurfaces.ts`, `src/lib/releaseHistory.ts`, `src/lib/toshoAi.ts` | підключення маршрутів, меню, шапки, поверхонь, підписів |
| `docs/CODEX_PROJECT_GUIDE.md`, `docs/DB_MAP.md` | документація |

Порядок задач: 1 SQL → 2 спільні помічники → 3 реєстр і стан → 4 підключення → 5 картки й список → 6 пошук на списку → 7 сторінка постачальника → 8 товари постачальника → 9 документація й прев'ю.

---

### Task 1: Три RPC на читання (закриває REQ-259#p1)

**Files:**
- Create: `scripts/supplier-pool-page.sql`

**Interfaces:**
- Produces: `tosho.supplier_pool_summary()` → рядки `(supplier_slug text, contractor_id uuid, rows_active bigint, products bigint, with_price bigint, with_photo bigint, categories bigint, last_observed timestamptz, first_loaded timestamptz)`; `tosho.list_supplier_products(p_slug text, p_terms text[], p_category text, p_limit integer, p_offset integer)` → колонки як у `search_supplier_pool` плюс `total bigint`; `tosho.supplier_pool_categories(p_slug text)` → `(category text, products bigint)`.

- [ ] **Step 1: Створити файл SQL**

```sql
-- Сторінка «Постачальники» — три RPC на читання (картка 259).
--
-- НАВІЩО RPC, А НЕ .select() З БРАУЗЕРА. Зведення — це group by на 26 тисячах
-- рядків, а PostgREST агрегатів не віддає. Товари одного постачальника треба
-- гортати ТОВАРАМИ (різними назвами), а не рядками: інакше кольори однієї
-- футболки діляться між сторінками, і картка приїжджає половиною варіантів
-- із неправильним діапазоном цін — та сама пастка, що й у вікні пошуку.
--
-- ЧОМУ security invoker. На таблиці стоїть RLS supplier_products_select
-- (команда + блок-гейт). Definer зняв би її й віддав чужі команди, а тут
-- немає жодної причини піднімати права: сторінка читає рівно те, що людині
-- і так дозволено.
--
-- ЧОМУ НЕ ПОВЕРТАЄМО attrs. У Аванпринта в attrs лежать описи під документи
-- (5,3 МБ на все джерело); віддаємо лише колонки вікна й attrs->>'color'.
--
-- Одна транзакція — від `npm run db:apply` (psql -1); свого `begin` тут немає
-- навмисно. Ідемпотентний: повторний прогін нічого не дублює.
\set ON_ERROR_STOP on

-- 1. Зведення пулу по постачальниках — числа для карток списку.
create or replace function tosho.supplier_pool_summary()
returns table (
  supplier_slug text,
  contractor_id uuid,
  rows_active   bigint,
  products      bigint,
  with_price    bigint,
  with_photo    bigint,
  categories    bigint,
  last_observed timestamptz,
  first_loaded  timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select
    sp.supplier_slug,
    (array_agg(sp.contractor_id) filter (where sp.contractor_id is not null))[1],
    count(*) filter (where sp.is_active),
    count(distinct sp.name) filter (where sp.is_active),
    -- «З нашою ціною» — лише оптова: роздріб із сайту нашою ціною не є.
    count(*) filter (where sp.is_active and sp.price is not null and sp.price_kind = 'wholesale'),
    count(*) filter (where sp.is_active and sp.image_url is not null),
    count(distinct sp.category) filter (where sp.is_active and sp.category <> ''),
    max(sp.observed_at),
    min(sp.created_at)
  from tosho.supplier_products sp
  group by sp.supplier_slug
$fn$;

revoke all on function tosho.supplier_pool_summary() from public;
grant execute on function tosho.supplier_pool_summary() to authenticated;

-- 2. Товари одного постачальника, сторінками по ТОВАРАХ (різних назвах).
create or replace function tosho.list_supplier_products(
  p_slug     text,
  p_terms    text[]  default null,
  p_category text    default null,
  p_limit    integer default 40,
  p_offset   integer default 0
)
returns table (
  id            uuid,
  supplier_slug text,
  article       text,
  name          text,
  vendor        text,
  category      text,
  price         numeric,
  currency      text,
  price_kind    text,
  url           text,
  image_url     text,
  color         text,
  total         bigint
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  with pat as (
    -- Терміни коротші за два символи відкидаємо тут, як і в search_supplier_pool.
    -- Порожній масив дає arr = null, і тоді умови за словами немає — це
    -- «показати все», режим перегляду сторінки постачальника.
    select array_agg('%' || t || '%') as arr
    from unnest(coalesce(p_terms, '{}'::text[])) as t
    where length(btrim(t)) >= 2
  ),
  hit as (
    select
      sp.id, sp.supplier_slug, sp.article, sp.name, sp.vendor, sp.category,
      sp.price, sp.currency, sp.price_kind, sp.url, sp.image_url,
      sp.attrs->>'color' as color
    from tosho.supplier_products sp
    cross join pat
    where sp.supplier_slug = p_slug
      and sp.is_active
      and (p_category is null or sp.category = p_category)
      and (pat.arr is null or sp.name ilike any (pat.arr) or sp.article ilike any (pat.arr))
  ),
  page as (
    -- Сторінка — це N різних назв; рядки (кольори, розміри) цих назв їдуть усі.
    select hit.name, count(*) over () as total
    from hit
    group by hit.name
    order by hit.name
    limit greatest(p_limit, 1)
    offset greatest(p_offset, 0)
  )
  select
    hit.id, hit.supplier_slug, hit.article, hit.name, hit.vendor, hit.category,
    hit.price, hit.currency, hit.price_kind, hit.url, hit.image_url,
    hit.color, page.total
  from hit
  join page on page.name = hit.name
  order by hit.name, hit.id
$fn$;

revoke all on function tosho.list_supplier_products(text, text[], text, integer, integer) from public;
grant execute on function tosho.list_supplier_products(text, text[], text, integer, integer) to authenticated;

-- 3. Розділи постачальника з кількістю товарів — для селекта над товарами.
create or replace function tosho.supplier_pool_categories(p_slug text)
returns table (category text, products bigint)
language sql
stable
security invoker
set search_path = ''
as $fn$
  select sp.category, count(distinct sp.name)
  from tosho.supplier_products sp
  where sp.supplier_slug = p_slug
    and sp.is_active
    and sp.category is not null
    and sp.category <> ''
  group by sp.category
  order by 2 desc, 1
$fn$;

revoke all on function tosho.supplier_pool_categories(text) from public;
grant execute on function tosho.supplier_pool_categories(text) to authenticated;
```

- [ ] **Step 2: Суха проба і застосування на прод**

```bash
set -a; . ./.env.backup; set +a
npm run db:apply scripts/supplier-pool-page.sql -- --dry
npm run db:apply scripts/supplier-pool-page.sql
```

Очікувано: `--dry` показує три `create or replace function`; справжній прогін пише в журнал `tosho.schema_migrations` і робить `NOTIFY pgrst`.

- [ ] **Step 3: Перевірити відповіді й заміряти час**

```bash
set -a; . ./.env.backup; set +a
PSQL=/opt/homebrew/opt/libpq/bin/psql
"$PSQL" "$BACKUP_DB_URL" -c "select supplier_slug, rows_active, products, with_price, with_photo, categories, last_observed from tosho.supplier_pool_summary() order by 1"
"$PSQL" "$BACKUP_DB_URL" -c "explain (analyze, timing off, summary) select * from tosho.list_supplier_products('avanprint.ua')" | tail -3
"$PSQL" "$BACKUP_DB_URL" -c "explain (analyze, timing off, summary) select * from tosho.list_supplier_products('totobi.com.ua', array['футболка'])" | tail -3
"$PSQL" "$BACKUP_DB_URL" -c "select count(*) as rows, count(distinct name) as names, min(total) as total from tosho.list_supplier_products('bergamo.ua', null, null, 40, 40)"
"$PSQL" "$BACKUP_DB_URL" -c "explain (analyze, timing off, summary) select * from tosho.supplier_pool_categories('totobi.com.ua')" | tail -3
```

Очікувано: п'ять рядків зведення (`totobi.com.ua` ≈ 3 150 рядків, 679 товарів, 3 074 з ціною); у Бергамо на другій сторінці `names = 40`, `total ≈ 1 600`; «Execution Time» кожного запиту менше 100 мс. Замір іде під роллю власника бази, тобто без RLS — це нормально, RLS на цій таблиці некорельована й дешева.

- [ ] **Step 4: Якщо перегляд Avanprint без слів довший за 100 мс — індекс**

Дописати в кінець файлу й застосувати ще раз (вміст змінився, журнал прийме):

```sql
-- Перегляд без слів гортає всі 10 234 рядки Аванпринта: індекс на
-- (постачальник, назва) обслуговує і відбір назв сторінки, і приєднання рядків.
create index if not exists supplier_products_slug_name_idx
  on tosho.supplier_products (supplier_slug, name);
```

```bash
npm run db:apply scripts/supplier-pool-page.sql
```

- [ ] **Step 5: Коміт**

У тілі — три виміряні часи з кроку 3 (наприклад: «avanprint без слів 42 мс, totobi „футболка“ 18 мс, розділи totobi 9 мс»).

```bash
git add scripts/supplier-pool-page.sql
git commit -F - <<'MSG'
Постачальники: база вміє віддати зведення пулу, товари одного постачальника і його розділи

Три RPC на читання для сторінки «Постачальники» (scripts/supplier-pool-page.sql):
supplier_pool_summary — числа для карток, list_supplier_products — товари
сторінками по назвах, щоб кольори одного товару не ділились між сторінками,
supplier_pool_categories — розділи для селекта. Усі security invoker під чинною
RLS. Застосовано через db:apply. Заміри: <три часи з кроку 3>.

Закриває: REQ-259#p1
MSG
```

---

### Task 2: Спільні помічники — формат «тому», фавікон, обрізання, рядок товару, смуга чипів (закриває REQ-259#p5)

**Files:**
- Create: `src/lib/formatAgo.ts`, `src/lib/formatAgo.test.ts`
- Create: `src/lib/brandFavicon.ts`
- Create: `src/components/app/useIsClamped.ts`
- Create: `src/components/catalog/SupplierPoolRow.tsx`
- Modify: `src/features/integrations/IntegrationCard.tsx` (прибрати локальні `useIsClamped`, `formatAgo`)
- Modify: `src/features/integrations/integrationsCatalog.ts:274-275`
- Modify: `src/features/finances/subscriptionBrands.ts:96-97`
- Modify: `src/components/catalog/SupplierPoolSearch.tsx` (лишити лише пошук)
- Move: `src/features/quotes/quote-wizard/SupplierPoolFilterBar.tsx` → `src/components/catalog/SupplierPoolFilterBar.tsx` (і `.test.ts` поруч)
- Modify: `src/features/quotes/quote-wizard/QuoteItemCommandField.tsx:20-26`

**Interfaces:**
- Produces: `formatAgo(iso: string | null | undefined, now?: Date): string | null`; `faviconUrl(domain: string): string`; `useIsClamped(text: string): { ref, clamped }`; компоненти `SupplierPoolRow({ product: SupplierPoolProduct })`, `PoolPhoto({ url: string | null; className: string })`; з нового шляху — `SupplierPoolFilterBar`, `filterSupplierPool`, `POOL_FILTER_ALL`, `supplierSourceOptions`, `SuggestListFooter`, тип `PoolFilter`.

- [ ] **Step 1: Тест для `formatAgo`**

`src/lib/formatAgo.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { formatAgo } from "./formatAgo";

const now = new Date("2026-09-09T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe("formatAgo", () => {
  it("порожнє й зламане — null", () => {
    expect(formatAgo(null, now)).toBeNull();
    expect(formatAgo(undefined, now)).toBeNull();
    expect(formatAgo("не дата", now)).toBeNull();
  });

  it("хвилини, години, дні — з правильним відмінком", () => {
    expect(formatAgo(ago(20_000), now)).toBe("щойно");
    expect(formatAgo(ago(60_000), now)).toBe("1 хвилину тому");
    expect(formatAgo(ago(3 * 60_000), now)).toBe("3 хвилини тому");
    expect(formatAgo(ago(2 * 3_600_000), now)).toBe("2 години тому");
    expect(formatAgo(ago(5 * 86_400_000), now)).toBe("5 днів тому");
    expect(formatAgo(ago(21 * 86_400_000), now)).toBe("21 день тому");
  });

  it("старше за місяць — дата словами", () => {
    expect(formatAgo(ago(40 * 86_400_000), now)).toBe("31 липня");
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npx vitest run src/lib/formatAgo.test.ts`
Expected: FAIL — модуль `./formatAgo` не знайдено.

- [ ] **Step 3: Написати `src/lib/formatAgo.ts`**

```ts
import { pluralWordUk } from "@/lib/lastSeen";

/**
 * «2 години тому», «5 днів тому», «26 червня». Порожньо або не дата — null.
 *
 * Досі жило в IntegrationCard; сторінці «Постачальники» потрібне те саме, і
 * друга копія розійшлась би з першою на першій же правці відмінків.
 * `now` приймається параметром, щоб тести не залежали від годинника.
 */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.round((now.getTime() - then) / 60000));
  if (minutes < 1) return "щойно";
  if (minutes < 60) return `${minutes} ${pluralWordUk(minutes, "хвилину", "хвилини", "хвилин")} тому`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${pluralWordUk(hours, "годину", "години", "годин")} тому`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${pluralWordUk(days, "день", "дні", "днів")} тому`;
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}
```

Run: `npx vitest run src/lib/formatAgo.test.ts` — Expected: PASS.

- [ ] **Step 4: Перевести `IntegrationCard` на спільні помічники**

`src/lib/brandFavicon.ts`:

```ts
/**
 * Лого сервісу чи постачальника за доменом — фавікон через Google.
 * Одна копія на CRM: досі та сама адреса була в «Інтеграціях» і в лого
 * підписок у Фінансах, а третю (для постачальників) заводити не стали.
 */
export const faviconUrl = (domain: string): string =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
```

`src/components/app/useIsClamped.ts` — перенести функцію `useIsClamped` з `IntegrationCard.tsx` дослівно, разом із її doc-коментарем:

```ts
import { useEffect, useRef, useState } from "react";

/**
 * Чи текст справді не вліз у відведені йому рядки.
 *
 * Перевірка потрібна саме в рантаймі: те саме речення влазить у два рядки на
 * широкій колонці й не влазить на вузькій. Підказка, що дослівно повторює вже
 * видимий текст, — це шум, який ще й перекриває сусідні картки.
 */
export function useIsClamped(text: string) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const [clamped, setClamped] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setClamped(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);

  return { ref, clamped };
}
```

У `src/features/integrations/IntegrationCard.tsx`:
1. Видалити локальні `useIsClamped` (разом із doc-коментарем) і `formatAgo` (рядки після `formatActivity`… до `formatActivity`), а також `import { useEffect, useRef, useState } from "react";` і `import { plural } from "./integrationsStatus";` — вони більше не потрібні.
2. Додати імпорти й реекспорт (споживачі — `IntegrationsPage`, `IntegrationSheet` — імпортують `formatAgo` звідси й лишаються без змін):

```ts
import { useIsClamped } from "@/components/app/useIsClamped";
import { formatAgo } from "@/lib/formatAgo";

export { formatAgo };
```

У `src/features/integrations/integrationsCatalog.ts` замінити два рядки визначення `integrationFaviconUrl` на:

```ts
// Одна адреса фавікона на CRM — див. src/lib/brandFavicon.ts.
export { faviconUrl as integrationFaviconUrl } from "@/lib/brandFavicon";
```

У `src/features/finances/subscriptionBrands.ts` видалити локальний `const faviconUrl = …` і додати вгорі `import { faviconUrl } from "@/lib/brandFavicon";`.

Run: `npx vitest run src/features/integrations src/features/finances && npm run typecheck` — Expected: PASS, без помилок типів.

- [ ] **Step 5: Винести рядок товару в `SupplierPoolRow.tsx`**

Створити `src/components/catalog/SupplierPoolRow.tsx`. Вміст — дослівно все з `SupplierPoolSearch.tsx`, починаючи з doc-коментаря «Фото товару або значок «фото немає»» і до кінця файлу (`PoolPhoto`, `money`, `SupplierPoolRow`), з такою шапкою й експортами:

```tsx
/**
 * Картка товару постачальника і фото до неї. Спільні для пошуку прорахунку
 * (SupplierPoolSearch), поля позиції та сторінки «Постачальники»: одна картка
 * товару на всю CRM, щоб ціна, кольори й посилання читались однаково всюди.
 * Винесено з SupplierPoolSearch.tsx без змін поведінки (картка 259).
 */

import * as React from "react";
import { ChevronDown, ExternalLink, Package } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatSupplierPoolPrice, supplierDisplayName, type SupplierPoolProduct } from "@/lib/supplierPool";
```

Далі — перенесений код, де `const PoolPhoto` стає `export const PoolPhoto`, а `const SupplierPoolRow` — `export const SupplierPoolRow`. Тіла функцій не міняти.

У `SupplierPoolSearch.tsx` лишити лише `useDebounced` і `SupplierPoolSearch`; імпорти звести до:

```tsx
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchSupplierPool } from "@/lib/supplierPool";

import { SupplierPoolRow } from "./SupplierPoolRow";
```

- [ ] **Step 6: Перенести смугу чипів у спільні компоненти**

```bash
git mv src/features/quotes/quote-wizard/SupplierPoolFilterBar.tsx src/components/catalog/SupplierPoolFilterBar.tsx
git mv src/features/quotes/quote-wizard/SupplierPoolFilterBar.test.ts src/components/catalog/SupplierPoolFilterBar.test.ts
```

У `src/features/quotes/quote-wizard/QuoteItemCommandField.tsx` замінити джерело імпорту `"./SupplierPoolFilterBar"` на `"@/components/catalog/SupplierPoolFilterBar"` (список імпортованих імен не міняється). У шапці перенесеного файлу дописати абзац:

```
 * ПЕРЕЇХАВ У СПІЛЬНІ КОМПОНЕНТИ (картка 259): ті самі чипи джерел стоять над
 * пошуком по товарах на сторінці «Постачальники». Логіка й вигляд не мінялись.
```

- [ ] **Step 7: Перевірити, що нічого не зламалось**

Run:
```bash
npx vitest run src/lib/formatAgo.test.ts src/components/catalog src/features/quotes/quote-wizard src/features/integrations src/features/finances
npm run check:fast
```
Expected: усі тести зелені, `check:fast` без помилок (ратчет розміру файлів задоволений — файли лише зменшились).

- [ ] **Step 8: Коміт**

```bash
git add src/lib/formatAgo.ts src/lib/formatAgo.test.ts src/lib/brandFavicon.ts src/components/app/useIsClamped.ts \
  src/components/catalog/SupplierPoolRow.tsx src/components/catalog/SupplierPoolSearch.tsx \
  src/components/catalog/SupplierPoolFilterBar.tsx src/components/catalog/SupplierPoolFilterBar.test.ts \
  src/features/integrations/IntegrationCard.tsx src/features/integrations/integrationsCatalog.ts \
  src/features/finances/subscriptionBrands.ts src/features/quotes/quote-wizard/QuoteItemCommandField.tsx
git commit -F - <<'MSG'
Картка товару постачальника й чипи джерел стали спільними для всієї CRM

Підготовка до сторінки «Постачальники» (картка 259): рядок товару пулу з фото
й кольорами винесено з пошуку прорахунку в components/catalog/SupplierPoolRow,
смуга чипів джерел переїхала туди ж; «N годин тому», фавікон за доменом і
хук обрізання тексту стали одними на CRM замість копій в «Інтеграціях» і
«Фінансах». Поведінка не змінилась.

Закриває: REQ-259#p5
MSG
```

---

### Task 3: Реєстр постачальників і логіка стану (закриває REQ-259#p2)

**Files:**
- Create: `src/features/suppliers/suppliersCatalog.ts`, `src/features/suppliers/suppliersCatalog.test.ts`
- Create: `src/features/suppliers/suppliersStatus.ts`, `src/features/suppliers/suppliersStatus.test.ts`

**Interfaces:**
- Consumes: `supplierDisplayName(slug)` з `@/lib/supplierPoolRows`; `formatAgo(iso, now)` з Task 2.
- Produces (реєстр): типи `SupplierId`, `SupplierIntakeKind`, `SupplierSchedule`, `SupplierPriceBasis`, `SupplierDefinition`; константи `SUPPLIER_DEFINITIONS`, `STALE_AFTER_HOURS`, `SUPPLIER_FEEDS_RUNS_URL`, `SUPPLIER_INTAKE_LABEL`, `SUPPLIER_SCHEDULE_LABEL`, `SUPPLIER_PRICE_BASIS_LABEL`; функції `supplierById(id: string): SupplierDefinition | null`, `supplierBySlug(slug: string): SupplierDefinition | null`.
- Produces (стан): типи `SupplierPoolSummaryRow`, `SupplierState`, `SupplierMetric`, `SupplierStatus`; функції `isSupplierStale(definition, lastObserved, now)`, `supplierStatus(definition, summary, now?, opts?)`, `formatInt(n)`, `formatDateShort(iso)`, `formatExactDateTime(iso)`; константи `SUPPLIER_STATE_LABEL`, `SUPPLIER_STATE_TONE`, `SUPPLIER_PLATE_TONE`, `SUPPLIER_STATE_ICON`.

- [ ] **Step 1: Тест реєстру**

`src/features/suppliers/suppliersCatalog.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { supplierDisplayName } from "@/lib/supplierPoolRows";

import { SUPPLIER_DEFINITIONS, supplierById, supplierBySlug } from "./suppliersCatalog";

/**
 * Реєстр живе в коді, а правда про пошук — у SQL, про фіди — у завантажувачі.
 * Три файли, які редагують у різні дні; ці звіряння не дають їм розійтись
 * мовчки: картка не скаже «у пошуку» про джерело, якого в SQL немає.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
const connected = SUPPLIER_DEFINITIONS.filter((s) => !s.planned);

/** Домени з `and sp.supplier_slug in ('a', 'b')` у search_supplier_pool. */
function searchSlugsFromSql(): string[] {
  const sql = read("../../../scripts/supplier-pool-search.sql");
  const match = sql.match(/supplier_slug in \(([^)]+)\)/);
  if (!match) throw new Error("у supplier-pool-search.sql не знайдено списку supplier_slug in (...)");
  return match[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
}

/** `slug: "…"` записів реєстру SUPPLIERS у завантажувачі. */
function loaderSlugs(): string[] {
  const js = read("../../../scripts/load-supplier-feed.mjs");
  return [...js.matchAll(/^\s+slug:\s*"([^"]+)"/gm)].map((m) => m[1]);
}

describe("реєстр постачальників", () => {
  it("«у пошуку прорахунку» збігається зі списком джерел у search_supplier_pool", () => {
    const inSql = new Set(searchSlugsFromSql());
    for (const s of connected) {
      expect(inSql.has(s.slug), `${s.slug}: реєстр каже ${s.inQuoteSearch}, SQL — ${inSql.has(s.slug)}`).toBe(
        s.inQuoteSearch
      );
    }
    for (const slug of inSql) {
      expect(connected.some((s) => s.slug === slug), `${slug} є в SQL, але не в реєстрі`).toBe(true);
    }
  });

  it("кожне під'єднане джерело є в реєстрі завантажувача, і навпаки", () => {
    expect(new Set(connected.map((s) => s.slug))).toEqual(new Set(loaderSlugs()));
  });

  it("назви латиницею й такі самі, як у пошуку прорахунку", () => {
    for (const s of connected) expect(s.name).toBe(supplierDisplayName(s.slug));
  });

  it("ідентифікатори придатні для адреси, «поза пошуком» пояснено, заплановані не в пошуку", () => {
    for (const s of SUPPLIER_DEFINITIONS) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      if (!s.inQuoteSearch) expect(s.searchNote, `${s.id} без searchNote`).toBeTruthy();
      if (s.planned) expect(s.inQuoteSearch).toBe(false);
    }
    expect(new Set(SUPPLIER_DEFINITIONS.map((s) => s.id)).size).toBe(SUPPLIER_DEFINITIONS.length);
    expect(supplierById("totobi")?.slug).toBe("totobi.com.ua");
    expect(supplierBySlug("totobi.com.ua")?.id).toBe("totobi");
    expect(supplierById("немає")).toBeNull();
  });
});
```

- [ ] **Step 2: Запустити — має впасти**

Run: `npx vitest run src/features/suppliers/suppliersCatalog.test.ts`
Expected: FAIL — модуль `./suppliersCatalog` не знайдено.

- [ ] **Step 3: Написати реєстр `src/features/suppliers/suppliersCatalog.ts`**

```ts
/**
 * Реєстр постачальників, чиї товари лежать у пулі tosho.supplier_products.
 *
 * Тут — те, що НЕ змінюється від стану бази: як забираємо товари, яка
 * домовленість про ціну, що дає фід, чим особливий кабінет. Живі числа
 * (скільки рядків, коли оновлювалось) рахує suppliersStatus.ts зі зведення
 * бази — свідомо окремо, бо реєстр читається синхронно при першому кадрі.
 *
 * ДОДАЮЧИ ПОСТАЧАЛЬНИКА: запис сюди йде тим самим рухом, що й запис у
 * реєстр завантажувача (scripts/load-supplier-feed.mjs) і рядок у списку
 * джерел search_supplier_pool (scripts/supplier-pool-search.sql). Тест
 * suppliersCatalog.test.ts не дасть трьом файлам розійтись.
 *
 * `id` — ключ у завантажувачі й в адресі (/suppliers/totobi). Домен в адресу
 * не кладемо: крапка в останньому сегменті шляху для dev-сервера виглядає
 * як розширення файлу. `slug` — домен, ключ пулу (supplier_slug).
 */

export type SupplierId =
  | "totobi"
  | "bergamo"
  | "berrytex"
  | "avanprint"
  | "e-suvenir"
  | "toptime"
  | "papirus"
  | "eney";

/** Як приїжджають товари: файл фіда, обхід сторінок сайту або API під логіном. */
export type SupplierIntakeKind = "feed" | "crawl" | "api";
export type SupplierSchedule = "daily" | "weekly" | "manual";
/**
 * Звідки ціна на картці: `rule` — ціна сайту × множник із домовленості;
 * `account` — постачальник показує нашу ціну сам під логіном; `reference` —
 * лише довідкова, у пулі порожня (наш власний магазин); `retail` — роздріб.
 */
export type SupplierPriceBasis = "rule" | "account" | "reference" | "retail";

export type SupplierDefinition = {
  id: SupplierId;
  /** Домен — ключ пулу (`supplier_slug`); у запланованих — домен сайту. */
  slug: string;
  /** Латиницею, як на сайті постачальника; збігається з supplierDisplayName(slug). */
  name: string;
  siteUrl: string;
  /** Сторінка входу в кабінет. Облікові дані сюди не потрапляють ніколи. */
  cabinetUrl?: string;
  platform: string;
  /** Один рядок для картки: асортимент і бренди. */
  sells: string;
  intake: {
    kind: SupplierIntakeKind;
    summary: string;
    schedule: SupplierSchedule;
    scheduleNote: string;
  };
  price: {
    basis: SupplierPriceBasis;
    summary: string;
    /** ISO-дата домовленості; null — ставка ще не підтверджена або не потрібна. */
    agreedOn: string | null;
    vat?: string;
  };
  gives: string[];
  lacks: string[];
  quirks: string[];
  inQuoteSearch: boolean;
  /** Чому поза пошуком — обов'язково, коли inQuoteSearch === false. */
  searchNote?: string;
  planned?: { since: string; blocker: string };
};

/** Після скількох годин без прогону дані вважаємо застарілими. `manual` не старіє. */
export const STALE_AFTER_HOURS: Record<SupplierSchedule, number | null> = {
  daily: 36,
  weekly: 8 * 24,
  manual: null,
};

export const SUPPLIER_FEEDS_RUNS_URL =
  "https://github.com/artemshundrik/tosho-crm/actions/workflows/supplier-feeds.yml";

export const SUPPLIER_INTAKE_LABEL: Record<SupplierIntakeKind, string> = {
  feed: "фід",
  crawl: "обхід сторінок",
  api: "API",
};

export const SUPPLIER_SCHEDULE_LABEL: Record<SupplierSchedule, string> = {
  daily: "щодня о 06:00",
  weekly: "щотижня, у неділю о 06:30",
  manual: "руками",
};

export const SUPPLIER_PRICE_BASIS_LABEL: Record<SupplierPriceBasis, string> = {
  rule: "наша ціна за правилом",
  account: "постачальник каже нашу ціну сам",
  reference: "лише довідкова, не показуємо",
  retail: "роздріб із сайту",
};

export const SUPPLIER_DEFINITIONS: readonly SupplierDefinition[] = [
  {
    id: "totobi",
    slug: "totobi.com.ua",
    name: "Totobi",
    siteUrl: "https://totobi.com.ua/",
    platform: "CS-Cart",
    sells: "Одяг і сувенірка: Discover, Floyd, Gildan",
    intake: {
      kind: "feed",
      summary:
        "Відкритий YML-фід з їхньої сторінки опису вигрузок; логін не потрібен. У них оновлюється щогодини.",
      schedule: "daily",
      scheduleNote: "Перезалив щодня о 06:00 за Києвом (GitHub Actions, supplier-feeds).",
    },
    price: {
      basis: "rule",
      summary:
        "Ціна сайту × множник: сувенірка −44%, одяг і головні убори −40%, статус «Єдина ціна» −50%.",
      agreedOn: "2026-09-08",
      vat: "Ціни у фіді з ПДВ, тому й наші з ПДВ.",
    },
    gives: [
      "артикул на кожен колір",
      "фото",
      "ціна",
      "колір",
      "група нанесення",
      "розміри з власними артикулами й цінами",
      "розділи",
    ],
    lacks: ["опис для документа (беремо з Avanprint)"],
    quirks: [
      "Картинки й адреси у фіді йдуть по http — підставляємо https, інакше браузер їх не покаже.",
      "У текстилю ціна лежить у розмірах, а не в товарі: це 43% фіда.",
      "Ціна на сайті публічна, не дилерська: без множника з реєстру це роздріб.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "bergamo",
    slug: "bergamo.ua",
    name: "Bergamo",
    siteUrl: "https://bergamo.ua/",
    platform: "OpenCart",
    sells: "Одяг і сувенірка: James Harvest, Printer, Voyager",
    intake: {
      kind: "crawl",
      summary:
        "Фіда немає (перевірено 08.09.2026). Перелік адрес — мапа сайту, дані — з 2 658 сторінок товарів; кольори моделі читаються з тієї самої сторінки.",
      schedule: "weekly",
      scheduleNote: "Обхід щотижня, у неділю о 06:30 за Києвом: пів години роботи й навантаження на чужий сайт.",
    },
    price: {
      basis: "rule",
      summary:
        "Ціна сайту × 0,525 (дилерська −47,5%): сайт сам показує її під нашим логіном поруч із закресленою публічною.",
      agreedOn: null,
    },
    gives: ["артикул", "назва", "бренд", "опис", "наявність", "ціна", "кольори з блоку моделі"],
    lacks: ["розділи", "методи нанесення", "фото в половини кольорів (4 941 із 10 076 рядків)"],
    quirks: [
      "Підтвердження від СЕО, що ставка стала, а не акція, ще немає: змінять цифру — ціни перераховуються одним UPDATE без обходу.",
      "Фото кольору виводиться за артикулом; частина кадрів на сайті названа інакше, і такі рядки лишаються без фото.",
      "Паралельні запити сайт придушує: обхід іде по чотири з паузою.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "berrytex",
    slug: "berrytex.com.ua",
    name: "Berrytex",
    siteUrl: "https://berrytex.com.ua/",
    cabinetUrl: "https://berrytex.com.ua/customer/account/login/",
    platform: "Magento",
    sells: "Текстиль і робочий одяг: JHK, Adler, Reis",
    intake: {
      kind: "feed",
      summary:
        "Публічний фід prom.xml дає товари з роздрібними цінами; далі завантажувач заходить у кабінет і з 74 сторінок товарів бере множник нашої ціни.",
      schedule: "daily",
      scheduleNote: "Перезалив щодня о 06:00 за Києвом (GitHub Actions, supplier-feeds).",
    },
    price: {
      basis: "account",
      summary:
        "Наша ціна з кабінету: множник свій у кожного товару (0,60–0,72), тож єдиного правила немає — ціна фіда множиться на множник його сторінки.",
      agreedOn: null,
    },
    gives: ["артикул", "фото", "ціна", "виробник", "розділи"],
    lacks: ["методи нанесення", "характеристики"],
    quirks: [
      "Логін може відпасти посеред проходу, і сторінки почнуть віддавати роздріб; прогін зупиняє межа частки сторінок зі знижкою.",
      "Усі кольори одного товару ділять один артикул.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "avanprint",
    slug: "avanprint.ua",
    name: "Avanprint",
    siteUrl: "https://avanprint.ua/",
    cabinetUrl: "https://avanprint.ua/edit/",
    platform: "Хорошоп",
    sells: "Наш магазин: сувенірка й одяг, які продаємо самі",
    intake: {
      kind: "feed",
      summary: "Профіль експорту YML в адмінці Хорошопа з автогенерацією; адреса файлу містить хеш профілю.",
      schedule: "daily",
      scheduleNote: "Перезалив щодня о 06:00 за Києвом (GitHub Actions, supplier-feeds).",
    },
    price: {
      basis: "reference",
      summary:
        "Ціна у фіді — наш роздріб, а не закупівля: у пулі порожня й на картках не показується. Закупівельна прийде парою з оптовиком (Totobi, Bergamo).",
      agreedOn: null,
    },
    gives: ["артикул", "кольори", "фото", "опис для документа", "розділи"],
    lacks: ["характеристики (у фіді лише колір і гарантія)", "закупівельна ціна", "методи нанесення"],
    quirks: [
      "Зникне файл — не вигадувати адресу, а взяти готову в адмінці у списку «Всі варіанти експорту».",
      "Колір зашитий у назву модифікації; ріжемо лише коли хвіст дослівно дорівнює параметру кольору.",
      "Роль у злитих картках: назва, опис і фото наші, ціна — оптовика.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "e-suvenir",
    slug: "e-suvenir.com.ua",
    name: "E-Suvenir",
    siteUrl: "https://e-suvenir.com.ua/ua",
    platform: "Magento PWA",
    sells: "Сувенірка й ручки: Sun Line, Mem'O!, Ritter Pen, Fruit of the Loom, Parker",
    intake: {
      kind: "api",
      summary:
        "GraphQL під нашим логіном; заголовок вітрини e_svnr_ukr обов'язковий — без нього акаунт «не існує». Фіда немає й бути не може: сайт віддає оболонку з кодом 200 на будь-яку адресу.",
      schedule: "daily",
      scheduleNote: "Перезалив щодня о 06:00 за Києвом (GitHub Actions, supplier-feeds).",
    },
    price: {
      basis: "account",
      summary:
        "Постачальник віддає нашу ціну сам: типово −41%, записники Mem'O! −50%, розпродаж до −80%.",
      agreedOn: null,
    },
    gives: [
      "методи нанесення",
      "місця друку з розмірами в мм",
      "матеріал",
      "бренд",
      "щільність",
      "країна",
      "розміри й вага упаковки",
      "кольори",
      "розміри з власними кодами",
    ],
    lacks: [],
    quirks: [
      "468 товарів вітрини, не 863: сусідній магазин es.com.ua живе на тому самому Magento.",
      "Категорія «Печать» — прайс на нанесення, у пул не йде.",
      "Логін, що відпав, виглядає як норма: ціни просто стають публічними; прогін стереже частка рядків зі знижкою.",
    ],
    inQuoteSearch: true,
  },
  {
    id: "toptime",
    slug: "toptime.com.ua",
    name: "Toptime",
    siteUrl: "https://toptime.com.ua/",
    platform: "власний рушій",
    sells: "Сувенірка (асортимент ще не розбирали)",
    intake: {
      kind: "crawl",
      summary: "Публічно лише мапа сайту; спосіб отримання цін не з'ясовано.",
      schedule: "manual",
      scheduleNote: "Ще не під'єднано.",
    },
    price: { basis: "retail", summary: "Ціни поки невідомі.", agreedOn: null },
    gives: [],
    lacks: [],
    quirks: [],
    inQuoteSearch: false,
    searchNote: "Ще не під'єднано.",
    planned: {
      since: "2026-09-05",
      blocker: "Потрібно з'ясувати, як віддають ціни: фіда немає, кабінету не бачили.",
    },
  },
  {
    id: "papirus",
    slug: "papirus-opt.com",
    name: "Papirus",
    siteUrl: "https://papirus-opt.com/",
    platform: "B2B-портал",
    sells: "Папір і поліграфічні матеріали",
    intake: {
      kind: "api",
      summary: "Ціни сховані до входу; джерело даних — кабінет.",
      schedule: "manual",
      scheduleNote: "Ще не під'єднано.",
    },
    price: { basis: "retail", summary: "Ціни за логіном, правило ще не знімали.", agreedOn: null },
    gives: [],
    lacks: [],
    quirks: [],
    inQuoteSearch: false,
    searchNote: "Ще не під'єднано.",
    planned: {
      since: "2026-09-05",
      blocker: "Потрібен доступ до кабінету й розбір, що він віддає.",
    },
  },
  {
    id: "eney",
    slug: "eney.com.ua",
    name: "Eney",
    siteUrl: "https://eney.com.ua/",
    platform: "OpenCart",
    sells: "Сувенірна продукція",
    intake: {
      kind: "feed",
      summary:
        "Точка фіда google_base є, але віддає нуль байтів: вивантаження вимкнено в їхній адмінці. Мапа сайту без назв.",
      schedule: "manual",
      scheduleNote: "Ще не під'єднано.",
    },
    price: { basis: "retail", summary: "Ціни поки невідомі.", agreedOn: null },
    gives: [],
    lacks: [],
    quirks: [],
    inQuoteSearch: false,
    searchNote: "Ще не під'єднано.",
    planned: {
      since: "2026-09-05",
      blocker: "Просимо постачальника увімкнути вивантаження; для google_base потрібен свій розбір (Merchant XML, не YML).",
    },
  },
];

const BY_ID = new Map(SUPPLIER_DEFINITIONS.map((s) => [s.id as string, s]));
const BY_SLUG = new Map(SUPPLIER_DEFINITIONS.map((s) => [s.slug, s]));

export function supplierById(id: string): SupplierDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function supplierBySlug(slug: string): SupplierDefinition | null {
  return BY_SLUG.get(slug) ?? null;
}
```

Run: `npx vitest run src/features/suppliers/suppliersCatalog.test.ts` — Expected: PASS (4 тести).

- [ ] **Step 4: Тест логіки стану**

`src/features/suppliers/suppliersStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { supplierById } from "./suppliersCatalog";
import { isSupplierStale, supplierStatus, type SupplierPoolSummaryRow } from "./suppliersStatus";

const now = new Date("2026-09-09T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const totobi = supplierById("totobi")!;
const bergamo = supplierById("bergamo")!;
const avanprint = supplierById("avanprint")!;
const toptime = supplierById("toptime")!;

const row = (over: Partial<SupplierPoolSummaryRow> = {}): SupplierPoolSummaryRow => ({
  supplier_slug: "totobi.com.ua",
  contractor_id: null,
  rows_active: 3150,
  products: 679,
  with_price: 3074,
  with_photo: 3145,
  categories: 72,
  last_observed: hoursAgo(2),
  first_loaded: "2026-09-08T08:06:16Z",
  ...over,
});

describe("застарілість", () => {
  it("щоденне джерело старіє після 36 годин, щотижневе — після 8 днів, ручне — ніколи", () => {
    expect(isSupplierStale(totobi, hoursAgo(35), now)).toBe(false);
    expect(isSupplierStale(totobi, hoursAgo(37), now)).toBe(true);
    expect(isSupplierStale(bergamo, hoursAgo(7 * 24), now)).toBe(false);
    expect(isSupplierStale(bergamo, hoursAgo(8 * 24 + 1), now)).toBe(true);
    expect(isSupplierStale(toptime, hoursAgo(400), now)).toBe(false);
    expect(isSupplierStale(totobi, null, now)).toBe(false);
  });
});

describe("стан картки", () => {
  it("запланований — без чисел, повідомлення про те, що заважає", () => {
    const status = supplierStatus(toptime, null, now);
    expect(status.state).toBe("planned");
    expect(status.message).toBe(toptime.planned!.blocker);
    expect(status.metrics.map((m) => m.value)).toEqual([null, null, null]);
  });

  it("зведення не прочиталось — чесне «не вдалося», а не «немає даних»", () => {
    const status = supplierStatus(totobi, null, now, { unavailable: true });
    expect(status.state).toBe("unknown");
    expect(status.metrics.map((m) => m.value)).toEqual([null, null, null]);
  });

  it("немає рядків у пулі — «немає даних»", () => {
    expect(supplierStatus(totobi, null, now).state).toBe("empty");
    expect(supplierStatus(totobi, row({ rows_active: 0, products: 0 }), now).state).toBe("empty");
  });

  it("свіже й у пошуку — три числа й правило ціни з датою домовленості", () => {
    const status = supplierStatus(totobi, row(), now);
    expect(status.state).toBe("search");
    expect(status.metrics).toEqual([
      { label: "товарів", value: "679" },
      { label: "з нашою ціною", value: "98%" },
      { label: "оновлено", value: "2 години тому" },
    ]);
    expect(status.message).toContain("сувенірка −44%");
    expect(status.message).toContain("Домовлено 08.09.2026");
  });

  it("довідкова ціна — комірка «з нашою ціною» порожня, а не «0%»", () => {
    const status = supplierStatus(avanprint, row({ supplier_slug: "avanprint.ua", with_price: 0 }), now);
    expect(status.metrics[1]).toEqual({ label: "з нашою ціною", value: null });
  });

  it("застаріле б'є «у пошуку» і називає дату прогону й розклад", () => {
    const status = supplierStatus(totobi, row({ last_observed: "2026-09-07T10:00:00Z" }), now);
    expect(status.state).toBe("stale");
    expect(status.message).toContain("Останній прогін 07.09");
    expect(status.message).toContain("щодня о 06:00");
  });

  it("поза пошуком — повідомлення з реєстру", () => {
    const hidden = { ...totobi, inQuoteSearch: false, searchNote: "СЕО ще не вирішив." };
    const status = supplierStatus(hidden, row(), now);
    expect(status.state).toBe("hidden");
    expect(status.message).toBe("СЕО ще не вирішив.");
  });
});
```

- [ ] **Step 5: Запустити — має впасти**

Run: `npx vitest run src/features/suppliers/suppliersStatus.test.ts`
Expected: FAIL — модуль `./suppliersStatus` не знайдено.

- [ ] **Step 6: Написати `src/features/suppliers/suppliersStatus.ts`**

```ts
import { AlertTriangle, CheckCircle2, CircleDashed, CircleHelp, Clock, EyeOff } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { formatAgo } from "@/lib/formatAgo";
import type { Tone } from "@/lib/statusTones";

import {
  STALE_AFTER_HOURS,
  SUPPLIER_SCHEDULE_LABEL,
  type SupplierDefinition,
} from "./suppliersCatalog";

/**
 * Стан картки постачальника з реєстру й зведення бази.
 *
 * Правило файлу — те саме, що в «Інтеграціях»: нічого не вигадувати. Не
 * прочитали зведення — картка каже «не вдалося прочитати», а не малює нуль:
 * нуль читається як «товари зникли», і за ним підуть шукати поломку фіда.
 */

/** Рядок tosho.supplier_pool_summary(); bigint приходить числом. */
export type SupplierPoolSummaryRow = {
  supplier_slug: string;
  contractor_id: string | null;
  rows_active: number;
  products: number;
  with_price: number;
  with_photo: number;
  categories: number;
  last_observed: string | null;
  first_loaded: string | null;
};

export type SupplierState =
  /** У списку джерел search_supplier_pool, дані свіжі. */
  | "search"
  /** Товари в пулі є, але в пошук прорахунку джерело не пускають. */
  | "hidden"
  /** Прогін не відбувся у свій розклад — ціни тихо старіють. */
  | "stale"
  /** Запис у реєстрі є, рядків у пулі нуль. */
  | "empty"
  /** Ще не під'єднано. */
  | "planned"
  /** Зведення не прочиталось — це помилка запиту, а не стан постачальника. */
  | "unknown";

export type SupplierMetric = { label: string; value: string | null };

export type SupplierStatus = {
  state: SupplierState;
  message: string;
  metrics: [SupplierMetric, SupplierMetric, SupplierMetric];
  summary: SupplierPoolSummaryRow | null;
};

type SupplierTone = Extract<Tone, "neutral" | "info" | "success" | "warning" | "danger">;

export const SUPPLIER_STATE_LABEL: Record<SupplierState, string> = {
  search: "У пошуку прорахунку",
  hidden: "Поза пошуком",
  stale: "Дані застаріли",
  empty: "Немає даних",
  planned: "Плануємо",
  unknown: "Не вдалося прочитати",
};

/** Тон бейджа — маленької пілюлі зі станом. */
export const SUPPLIER_STATE_TONE: Record<SupplierState, SupplierTone> = {
  search: "success",
  hidden: "neutral",
  stale: "warning",
  empty: "neutral",
  planned: "neutral",
  unknown: "neutral",
};

/** Тон плашки з текстом: коли все гаразд — нейтральна, колір лише там, де потрібна дія. */
export const SUPPLIER_PLATE_TONE: Record<SupplierState, SupplierTone> = {
  search: "neutral",
  hidden: "neutral",
  stale: "warning",
  empty: "neutral",
  planned: "neutral",
  unknown: "neutral",
};

export const SUPPLIER_STATE_ICON: Record<SupplierState, LucideIcon> = {
  search: CheckCircle2,
  hidden: EyeOff,
  stale: AlertTriangle,
  empty: CircleDashed,
  planned: Clock,
  unknown: CircleHelp,
};

export const formatInt = (value: number): string => value.toLocaleString("uk-UA");

/** «08.09.2026» */
export const formatDateShort = (iso: string): string =>
  new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });

/** «08.09 12:20» — точна мітка прогону поруч із відносною. */
export const formatExactDateTime = (iso: string): string =>
  new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function isSupplierStale(
  definition: SupplierDefinition,
  lastObserved: string | null | undefined,
  now: Date = new Date()
): boolean {
  const hours = STALE_AFTER_HOURS[definition.intake.schedule];
  if (hours === null || !lastObserved) return false;
  const then = new Date(lastObserved).getTime();
  if (!Number.isFinite(then)) return false;
  return now.getTime() - then > hours * 3_600_000;
}

const EMPTY_METRICS: [SupplierMetric, SupplierMetric, SupplierMetric] = [
  { label: "товарів", value: null },
  { label: "з нашою ціною", value: null },
  { label: "оновлено", value: null },
];

const percent = (part: number, total: number): string | null =>
  total > 0 ? `${Math.round((part / total) * 100)}%` : null;

function priceMessage(definition: SupplierDefinition): string {
  const { summary, agreedOn } = definition.price;
  return agreedOn ? `${summary} Домовлено ${formatDateShort(agreedOn)}.` : summary;
}

/**
 * Пріоритет станів: planned → unknown → empty → stale → hidden → search.
 * Застаріле б'є «у пошуку» навмисно: у пошуку джерело є, але ціни в ньому
 * вже не ті, і саме це людина має побачити першим.
 */
export function supplierStatus(
  definition: SupplierDefinition,
  summary: SupplierPoolSummaryRow | null,
  now: Date = new Date(),
  opts: { unavailable?: boolean } = {}
): SupplierStatus {
  if (definition.planned) {
    return { state: "planned", message: definition.planned.blocker, metrics: EMPTY_METRICS, summary: null };
  }
  if (opts.unavailable) {
    return {
      state: "unknown",
      message: "Стан пулу не прочитався. Натисніть «Оновити»; якщо не допоможе — дивись «Здоров'я».",
      metrics: EMPTY_METRICS,
      summary: null,
    };
  }
  if (!summary || summary.rows_active === 0) {
    return {
      state: "empty",
      message: "У пулі ще немає рядків цього постачальника: фід не заливали або прогін не дійшов до запису.",
      metrics: EMPTY_METRICS,
      summary,
    };
  }

  const metrics: [SupplierMetric, SupplierMetric, SupplierMetric] = [
    { label: "товарів", value: formatInt(summary.products) },
    {
      label: "з нашою ціною",
      // У нашого магазину ціна довідкова: «0%» читалось би як «ціни зникли».
      value: definition.price.basis === "reference" ? null : percent(summary.with_price, summary.rows_active),
    },
    { label: "оновлено", value: formatAgo(summary.last_observed, now) },
  ];

  if (isSupplierStale(definition, summary.last_observed, now)) {
    return {
      state: "stale",
      message: `Останній прогін ${formatExactDateTime(summary.last_observed!)}, за розкладом ${
        SUPPLIER_SCHEDULE_LABEL[definition.intake.schedule]
      }. Дивись прогони supplier-feeds.`,
      metrics,
      summary,
    };
  }
  if (!definition.inQuoteSearch) {
    return { state: "hidden", message: definition.searchNote ?? "Поза пошуком прорахунку.", metrics, summary };
  }
  return { state: "search", message: priceMessage(definition), metrics, summary };
}
```

Run: `npx vitest run src/features/suppliers` — Expected: PASS (усі тести обох файлів).

- [ ] **Step 7: Перевірка й коміт**

Run: `npm run check:fast` — Expected: без помилок.

```bash
git add src/features/suppliers/suppliersCatalog.ts src/features/suppliers/suppliersCatalog.test.ts \
  src/features/suppliers/suppliersStatus.ts src/features/suppliers/suppliersStatus.test.ts
git commit -F - <<'MSG'
Паспорти постачальників зібрано в одному реєстрі, який не може розійтись із пошуком і фідами

Реєстр src/features/suppliers/suppliersCatalog.ts: п'ять під'єднаних джерел
і три заплановані — платформа, спосіб забору, розклад, правило ціни з датою
домовленості, що дає фід і чого не дає, особливості кабінету. Тести звіряють
його зі списком джерел у search_supplier_pool і з реєстром завантажувача.
Поруч — чиста логіка стану картки (свіже / застаріле / поза пошуком / немає
даних / плануємо / не прочиталось) із трьома числами.

Закриває: REQ-259#p2
MSG
```

---

### Task 4: Модуль доступу, маршрути, меню, шапка, поверхні (закриває REQ-259#p3)

**Files:**
- Modify: `src/lib/moduleAccess.ts` (тип `ModuleKey`, `MODULE_DEFINITIONS`, набори `ROLE_MENUS`, `FALLBACK_MENU`)
- Modify: `src/lib/moduleAccess.test.ts` (describe «стартове меню посади»)
- Modify: `src/layout/routes.ts`
- Modify: `src/App.tsx` (lazy-імпорти біля рядка 152, `routeMatchers` після `/contractors`, маршрути після `contractors`)
- Modify: `src/layout/AppLayout.tsx` (імпорт `Store` з lucide, пункт меню після «Каталогу»)
- Modify: `src/layout/headerConfig.ts` (після гілки `ROUTES.contractors`)
- Modify: `src/layout/pageSurfaces.ts` (перед записом `contractors`)
- Modify: `src/lib/releaseHistory.ts` (`SCOPE_LABEL`)
- Modify: `src/lib/toshoAi.ts` (перелік маршрутів, після запису `/contractors`)
- Create: `src/pages/SuppliersPage.tsx`, `src/pages/SupplierPage.tsx` (каркаси; наповнюються в задачах 5–8)

**Interfaces:**
- Produces: `ModuleKey` містить `"suppliers"`; `ROUTES.suppliers === "/suppliers"`; сторінки за замовчуванням експортують компоненти `SuppliersPage`, `SupplierPage`.

- [ ] **Step 1: Тест доступу — має впасти**

У `src/lib/moduleAccess.test.ts`, у `describe("стартове меню посади", …)` після тесту «„Огляд“ і „Команда“ — у кожної посади без винятку» додати:

```ts
  it("«Постачальники» — у кожної посади: товари й ціни постачальників видно всім (картка 259)", () => {
    for (const role of [...Object.keys(JOB_ROLE_NAMES), "вписана-руками", ""]) {
      const access = defaultModuleAccess({ accessRole: "member", jobRole: role });
      expect(access.suppliers, `suppliers / ${role}`).toBe(true);
    }
  });

  it("власник може вимкнути «Постачальників» окремій посаді винятком", () => {
    const overrides = new Map([["marketer", { suppliers: false }]]) as never;
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "marketer" }, overrides).suppliers).toBe(false);
    expect(defaultModuleAccess({ accessRole: "member", jobRole: "manager" }, overrides).suppliers).toBe(true);
  });
```

Run: `npx vitest run src/lib/moduleAccess.test.ts`
Expected: FAIL — `access.suppliers` не існує / `undefined` замість `true`.

- [ ] **Step 2: Реєстр модулів**

У `src/lib/moduleAccess.ts`:

1. У `export type ModuleKey` після рядка `| "catalog"` додати `| "suppliers"`.
2. У `MODULE_DEFINITIONS` після `{ key: "catalog", label: "Каталог", group: "operations" },` додати:

```ts
  {
    key: "suppliers",
    label: "Постачальники",
    group: "operations",
    // Товари й закупівельні ціни постачальників — властивість товару, а не
    // чиєсь заповнення (правило REQ-250#p32), тому сторінка за замовчуванням у
    // всіх посад. Власник може прибрати її окремій посаді винятком.
    hint: "Стан під'єднаних кабінетів, умови цін і товари постачальників; за замовчуванням у всіх посад",
  },
```

3. Набори (кожен масив — додати `"suppliers"` одразу після `"catalog"`, а де каталогу немає — в кінець):

```ts
const SALES_MENU: ModuleKey[] = ["overview", "customers", "quotes", "orders", "catalog", "suppliers", "design"];
```
```ts
const ACCOUNTING_MENU: ModuleKey[] = [
  "overview",
  "customers",
  "quotes",
  "orders",
  "shipping",
  "catalog",
  "suppliers",
  "logistics",
  "stock",
  "contractors",
  "vchasno",
];
```
```ts
const MARKETING_MENU: ModuleKey[] = ["overview", "design", "marketing", "suppliers"];
```
```ts
  printer: ["overview", "orders", "catalog", "suppliers", "design", "stock"],
  packer: ["overview", "orders", "shipping", "catalog", "suppliers", "stock"],
```
```ts
  logistics: ["overview", "customers", "quotes", "orders", "shipping", "catalog", "suppliers", "logistics"],
```
```ts
  it_specialist: ["overview", "orders", "catalog", "suppliers", "design", "nova_poshta"],
```
```ts
const FALLBACK_MENU: ModuleKey[] = ["overview", "orders", "design", "suppliers"];
```

Run: `npx vitest run src/lib/moduleAccess.test.ts` — Expected: PASS.

- [ ] **Step 3: Адреса, маршрути, шапка, меню, поверхні, підписи**

`src/layout/routes.ts` — після `contractors: "/contractors",`:

```ts
  suppliers: "/suppliers",
```

`src/App.tsx` — після `const ContractorsPage = lazyWithRetry(…)`:

```ts
const SuppliersPage = lazyWithRetry(() => import("./pages/SuppliersPage"));
const SupplierPage = lazyWithRetry(() => import("./pages/SupplierPage"));
```

у масиві `routeMatchers` після запису `/contractors`:

```ts
    { pattern: "/suppliers", scope: "page", group: "operations", test: (value) => value === "/suppliers" },
    { pattern: "/suppliers/:id", scope: "details", group: "operations", test: (value) => /^\/suppliers\/[^/]+$/.test(value) },
```

після блоку `<Route path="contractors" …/>`:

```tsx
        {/* «Постачальники» — стан під'єднаних кабінетів і пошук по їхніх
            товарах (картка 259). Сторінка одного постачальника — окремою
            адресою: під товари потрібна ширина, у шторку вони не влазять. */}
        <Route
          path="suppliers"
          element={
            <ModuleRouteGate moduleKey="suppliers">
              <RouteSuspense shell>
                <SuppliersPage />
              </RouteSuspense>
            </ModuleRouteGate>
          }
        />
        <Route
          path="suppliers/:id"
          element={
            <ModuleRouteGate moduleKey="suppliers">
              <RouteSuspense shell>
                <SupplierPage />
              </RouteSuspense>
            </ModuleRouteGate>
          }
        />
```

`src/layout/AppLayout.tsx` — додати `Store,` до списку імпорту з `"lucide-react"` (за абеткою) і в `baseSidebarLinks` після пункту «Каталог»:

```ts
  { label: "Постачальники", to: ROUTES.suppliers, group: "operations", icon: Store, moduleKey: "suppliers" },
```

`src/layout/headerConfig.ts` — після гілки `if (pathname.startsWith(ROUTES.contractors)) …`:

```ts
  if (pathname.startsWith(ROUTES.suppliers))
    return {
      title: "Постачальники",
      subtitle: "Під'єднані кабінети, умови цін і товари кожного постачальника.",
      breadcrumbLabel: "Постачальники",
      breadcrumbTo: ROUTES.suppliers,
      showPageHeader: false,
    };
```

`src/layout/pageSurfaces.ts` — перед записом `{ id: "contractors", … }`:

```ts
  // Картка постачальника — перед списком: збіг нежорсткий, як у «/design/:id».
  { id: "supplier", path: "/suppliers/:id", page: "src/pages/SupplierPage.tsx", toolbar: "none", shape: "detail" },
  // Пошук і заголовок малюються в тілі сторінки, як в «Інтеграціях».
  { id: "suppliers", path: "/suppliers", page: "src/pages/SuppliersPage.tsx", toolbar: "none", shape: "grid" },
```

`src/lib/releaseHistory.ts` — у `SCOPE_LABEL` після `contractors: "Підрядники",`:

```ts
  suppliers: "Постачальники",
```

`src/lib/toshoAi.ts` — у перелік маршрутів після запису з `test: (pathname) => pathname.startsWith("/contractors")`:

```ts
  {
    test: (pathname) => pathname.startsWith("/suppliers"),
    title: "Постачальники",
    routeLabel: "Постачальники",
    // Домен «каталог»: товари постачальників — це той самий пул, з якого
    // менеджер бере позиції; окремого домену помічнику не заводимо.
    domainHint: "catalog",
  },
```

- [ ] **Step 4: Каркаси сторінок**

`src/pages/SuppliersPage.tsx`:

```tsx
/**
 * «Постачальники» — список (картка 259). Каркас; пошук, картки й блок
 * «Плануємо» додаються наступними задачами.
 */
export default function SuppliersPage() {
  return (
    <div className="pb-10">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">Постачальники</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Під'єднані кабінети, умови цін і товари кожного постачальника.
      </p>
    </div>
  );
}
```

`src/pages/SupplierPage.tsx`:

```tsx
import { Link, useParams } from "react-router-dom";

import { ROUTES } from "@/layout/routes";
import { supplierById } from "@/features/suppliers/suppliersCatalog";

/** Сторінка одного постачальника (картка 259). Каркас; паспорт і товари — далі. */
export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const definition = id ? supplierById(id) : null;

  if (!definition) {
    return (
      <div className="pb-10">
        <p className="mt-6 text-sm text-muted-foreground">Такого постачальника немає.</p>
        <Link to={ROUTES.suppliers} className="mt-2 inline-block text-sm underline underline-offset-2">
          До списку постачальників
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <h1 className="text-lg font-semibold tracking-tight text-foreground">{definition.name}</h1>
      <p className="mt-1 text-xs text-muted-foreground">{definition.sells}</p>
    </div>
  );
}
```

- [ ] **Step 5: Перевірки**

Run:
```bash
node scripts/check-page-surfaces.mjs
npx vitest run src/lib/moduleAccess.test.ts src/features/suppliers
npm run check:fast
```
Expected: реєстр поверхонь без зауважень (обидва маршрути описані, тулбар не реєструється), тести зелені, `check:fast` чистий.

- [ ] **Step 6: Коміт**

```bash
git add src/lib/moduleAccess.ts src/lib/moduleAccess.test.ts src/layout/routes.ts src/App.tsx \
  src/layout/AppLayout.tsx src/layout/headerConfig.ts src/layout/pageSurfaces.ts \
  src/lib/releaseHistory.ts src/lib/toshoAi.ts src/pages/SuppliersPage.tsx src/pages/SupplierPage.tsx
git commit -F - <<'MSG'
У меню з'явився розділ «Постачальники», відкритий усім посадам

Модуль suppliers у реєстрі доступів (за замовчуванням у всіх, власник може
вимкнути винятком), пункт «Постачальники» в «Операціях» після «Каталогу»,
адреси /suppliers і /suppliers/:id, шапка, поверхні для каркаса
завантаження, підпис розділу в релізах і контекст для помічника. Самі
сторінки поки каркаси — наповнення йде наступними комітами (картка 259).

Закриває: REQ-259#p3
MSG
```

---

### Task 5: Запити, картка постачальника, список із блоком «Плануємо» (без трейлера — пункт p4 закриє Task 6)

**Files:**
- Create: `src/features/suppliers/queries.ts`
- Create: `src/features/suppliers/SupplierCard.tsx`, `src/features/suppliers/SupplierCard.test.tsx`
- Modify: `src/pages/SuppliersPage.tsx` (замінити каркас)

**Interfaces:**
- Consumes: `supplierStatus`, `SupplierPoolSummaryRow`, `SUPPLIER_*` з Task 3; `faviconUrl`, `formatAgo`, `useIsClamped` з Task 2; `db`, `supabase` з `@/lib/supabaseClient`.
- Produces: `supplierKeys`, `fetchSupplierPoolSummary(): Promise<SupplierPoolSummaryRow[]>`, `useSupplierPoolSummary()`, тип `SupplierContractor`, `fetchSupplierContractors()`, `useSupplierContractors()`, `contractorForSupplier(definition, summary, contractors): SupplierContractor | null`; компонент `SupplierCard({ definition, status })`.

- [ ] **Step 1: Тест картки — має впасти**

`src/features/suppliers/SupplierCard.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { SupplierCard } from "./SupplierCard";
import { supplierById, type SupplierDefinition } from "./suppliersCatalog";
import { supplierStatus, type SupplierPoolSummaryRow, type SupplierStatus } from "./suppliersStatus";

const now = new Date("2026-09-09T12:00:00Z");
const totobi = supplierById("totobi")!;
const summary: SupplierPoolSummaryRow = {
  supplier_slug: "totobi.com.ua",
  contractor_id: null,
  rows_active: 3150,
  products: 679,
  with_price: 3074,
  with_photo: 3145,
  categories: 72,
  last_observed: "2026-09-09T10:00:00Z",
  first_loaded: "2026-09-08T08:06:16Z",
};

const renderCard = (definition: SupplierDefinition, status: SupplierStatus) =>
  render(
    <MemoryRouter>
      <SupplierCard definition={definition} status={status} />
    </MemoryRouter>
  );

describe("SupplierCard", () => {
  it("веде на сторінку постачальника й показує три числа", () => {
    renderCard(totobi, supplierStatus(totobi, summary, now));
    expect(screen.getByRole("link", { name: /Totobi/ })).toHaveAttribute("href", "/suppliers/totobi");
    expect(screen.getByText("679")).toBeInTheDocument();
    expect(screen.getByText("98%")).toBeInTheDocument();
    expect(screen.getByText("2 години тому")).toBeInTheDocument();
    expect(screen.getByText("У пошуку прорахунку")).toBeInTheDocument();
  });

  it("застарілі дані — попередження з датою прогону", () => {
    renderCard(totobi, supplierStatus(totobi, { ...summary, last_observed: "2026-09-07T10:00:00Z" }, now));
    expect(screen.getByText("Дані застаріли")).toBeInTheDocument();
    expect(screen.getByText(/Останній прогін 07\.09/)).toBeInTheDocument();
  });

  it("запланований — без чисел, з тим, що заважає", () => {
    const toptime = supplierById("toptime")!;
    renderCard(toptime, supplierStatus(toptime, null, now));
    expect(screen.getByText("Плануємо")).toBeInTheDocument();
    expect(screen.getByText(toptime.planned!.blocker)).toBeInTheDocument();
    expect(screen.queryByText("товарів")).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/features/suppliers/SupplierCard.test.tsx`
Expected: FAIL — модуль `./SupplierCard` не знайдено.

- [ ] **Step 2: Запити `src/features/suppliers/queries.ts`**

```ts
import { useQuery } from "@tanstack/react-query";

import { db, supabase } from "@/lib/supabaseClient";

import type { SupplierDefinition } from "./suppliersCatalog";
import type { SupplierPoolSummaryRow } from "./suppliersStatus";

/**
 * Запити сторінки «Постачальники». Усе — читання; RPC живуть у
 * scripts/supplier-pool-page.sql і працюють під чинною RLS пулу.
 *
 * Через `supabase.schema("tosho")`, а не `db`: типи `db` — перетин схем,
 * і нові RPC він не бачить (так само кличуть search_supplier_pool).
 */

export const supplierKeys = {
  summary: ["suppliers", "summary"] as const,
  contractors: ["suppliers", "contractors"] as const,
  products: (slug: string, terms: readonly string[], category: string | null) =>
    ["suppliers", "products", slug, terms.join(" "), category ?? ""] as const,
  categories: (slug: string) => ["suppliers", "categories", slug] as const,
};

const toNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0));

export async function fetchSupplierPoolSummary(): Promise<SupplierPoolSummaryRow[]> {
  const { data, error } = await supabase.schema("tosho").rpc("supplier_pool_summary");
  if (error) throw error;
  // bigint із PostgREST може приїхати рядком — числа приводимо тут, один раз.
  return ((data ?? []) as unknown as SupplierPoolSummaryRow[]).map((row) => ({
    ...row,
    rows_active: toNumber(row.rows_active),
    products: toNumber(row.products),
    with_price: toNumber(row.with_price),
    with_photo: toNumber(row.with_photo),
    categories: toNumber(row.categories),
  }));
}

/** Стан пулу міняється раз на добу — п'ять хвилин свіжості нікому нічого не забирають. */
export function useSupplierPoolSummary() {
  return useQuery({ queryKey: supplierKeys.summary, queryFn: fetchSupplierPoolSummary, staleTime: 5 * 60_000 });
}

export type SupplierContractor = {
  id: string;
  name: string;
  contact_name: string | null;
  phones: string[] | null;
  emails: string[] | null;
  website: string | null;
  notes: string | null;
};

/** Усі картки постачальників із «Підрядників» — їх два десятки, читаємо разом. */
export async function fetchSupplierContractors(): Promise<SupplierContractor[]> {
  const { data, error } = await db
    .from("contractors")
    .select("id, name, contact_name, phones, emails, website, notes")
    .eq("kind", "supplier");
  if (error) throw error;
  return (data ?? []) as unknown as SupplierContractor[];
}

export function useSupplierContractors() {
  return useQuery({ queryKey: supplierKeys.contractors, queryFn: fetchSupplierContractors, staleTime: 5 * 60_000 });
}

const hostOf = (url: string | null): string | null => {
  if (!url?.trim()) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/**
 * Картка підрядника для постачальника: у під'єднаного — за прив'язкою з пулу
 * (contractor_id), у запланованого — за збігом домену сайту.
 */
export function contractorForSupplier(
  definition: SupplierDefinition,
  summary: SupplierPoolSummaryRow | null | undefined,
  contractors: SupplierContractor[] | undefined
): SupplierContractor | null {
  if (!contractors?.length) return null;
  if (summary?.contractor_id) {
    const byId = contractors.find((c) => c.id === summary.contractor_id);
    if (byId) return byId;
  }
  return contractors.find((c) => hostOf(c.website) === definition.slug) ?? null;
}
```

- [ ] **Step 3: Картка `src/features/suppliers/SupplierCard.tsx`**

```tsx
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { useIsClamped } from "@/components/app/useIsClamped";
import { Badge } from "@/components/ui/badge";
import { ROUTES } from "@/layout/routes";
import { faviconUrl } from "@/lib/brandFavicon";
import { toneSubtleClass, toneTextClass } from "@/lib/statusTones";
import { cn } from "@/lib/utils";

import { SUPPLIER_INTAKE_LABEL, SUPPLIER_SCHEDULE_LABEL, type SupplierDefinition } from "./suppliersCatalog";
import {
  formatDateShort,
  SUPPLIER_PLATE_TONE,
  SUPPLIER_STATE_ICON,
  SUPPLIER_STATE_LABEL,
  SUPPLIER_STATE_TONE,
  type SupplierMetric,
  type SupplierStatus,
} from "./suppliersStatus";

/**
 * Картка постачальника у списку — та сама сітка, що в картці інтеграції:
 * ряди ФІКСОВАНОЇ висоти, щоб лого, числа й плашки сусідніх карток стояли на
 * одних лініях. Довгий текст стану обрізається, повний — у підказці, і лише
 * коли обрізання справді сталось.
 */
const CARD_ROWS = "grid-rows-[36px_18px_46px_65px_32px]";

const hasDigits = (value: string | null): boolean => value != null && /\d/.test(value);

/** Комірка показника. Немає значення — порожньо, без прочерку: прочерк у великому кеглі читається як зламане число. */
function Metric({ metric }: { metric: SupplierMetric }) {
  if (!metric.value) return <div aria-hidden="true" />;
  return (
    <div className="min-w-0">
      <div className="flex h-6 items-end">
        <span
          className={cn(
            "truncate leading-tight text-foreground",
            hasDigits(metric.value) ? "text-lg font-semibold tabular-nums" : "text-sm font-medium"
          )}
        >
          {metric.value}
        </span>
      </div>
      <div className="truncate text-3xs uppercase tracking-caps-tight text-muted-foreground">{metric.label}</div>
    </div>
  );
}

export function SupplierCard({ definition, status }: { definition: SupplierDefinition; status: SupplierStatus }) {
  const tone = SUPPLIER_STATE_TONE[status.state];
  const plateTone = SUPPLIER_PLATE_TONE[status.state];
  const StateIcon = SUPPLIER_STATE_ICON[status.state];
  const muted = status.state === "planned";
  const { ref: messageRef, clamped } = useIsClamped(status.message);

  return (
    <Link
      to={`${ROUTES.suppliers}/${definition.id}`}
      className={cn(
        "grid w-full gap-3 rounded-section border border-border/60 bg-card p-4 text-left",
        CARD_ROWS,
        "transition-[background-color,border-color,box-shadow] duration-base ease-out motion-reduce:transition-none",
        "hover:border-border hover:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      )}
    >
      {/* Ряд 1 — хто це і в якому стані. Незапланований — кольоровий фавікон;
          запланований сірий: колір тут працює як обіцянка «воно живе». */}
      <div className="flex min-w-0 items-center gap-2.5">
        <EntityAvatar
          src={faviconUrl(definition.slug)}
          name={definition.name}
          size={36}
          className={cn("shrink-0 rounded-xl", muted && "grayscale opacity-60")}
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{definition.name}</span>
        <Badge tone={tone} size="sm" className="shrink-0 gap-1">
          <StateIcon className="h-3 w-3" aria-hidden="true" />
          {SUPPLIER_STATE_LABEL[status.state]}
        </Badge>
      </div>

      {/* Ряд 2 — чим торгує і як під'єднаний. Рівно один рядок. */}
      <p className="truncate text-xs text-muted-foreground">
        {definition.sells} · {SUPPLIER_INTAKE_LABEL[definition.intake.kind]}, {definition.platform}
      </p>

      {/* Ряд 3 — три числа. */}
      <div className="grid grid-cols-3 gap-3">
        {status.metrics.map((metric) => (
          <Metric key={metric.label} metric={metric} />
        ))}
      </div>

      {/* Ряд 4 — плашка стану: правило ціни, попередження про застарілість або що заважає. */}
      <div className="-mx-4 border-b border-border/60 px-4 pb-3">
        <div className={cn("flex items-start gap-2 rounded-inner border px-2.5 py-2", toneSubtleClass[plateTone])}>
          <StateIcon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", toneTextClass[plateTone])} aria-hidden="true" />
          <p
            ref={messageRef}
            className="line-clamp-2 text-2xs leading-snug text-foreground"
            title={clamped ? status.message : undefined}
          >
            {status.message}
          </p>
        </div>
      </div>

      {/* Ряд 5 — розклад і куди веде картка. */}
      <div className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
        <span className="min-w-0 truncate">
          {definition.planned
            ? `У черзі з ${formatDateShort(definition.planned.since)}`
            : `Оновлюється ${SUPPLIER_SCHEDULE_LABEL[definition.intake.schedule]}`}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 font-medium text-foreground">
          Відкрити
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
```

Run: `npx vitest run src/features/suppliers/SupplierCard.test.tsx` — Expected: PASS (3 тести).

- [ ] **Step 4: Список `src/pages/SuppliersPage.tsx` (замінити каркас)**

```tsx
import { useMemo } from "react";
import { RefreshCw } from "lucide-react";

import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { UnifiedPageToolbar } from "@/components/app/headers/UnifiedPageToolbar";
import { Button } from "@/components/ui/button";
import { formatAgo } from "@/lib/formatAgo";

import { useSupplierPoolSummary } from "@/features/suppliers/queries";
import { SupplierCard } from "@/features/suppliers/SupplierCard";
import { SUPPLIER_DEFINITIONS } from "@/features/suppliers/suppliersCatalog";
import { supplierStatus } from "@/features/suppliers/suppliersStatus";

/**
 * «Постачальники» — список (картка 259).
 *
 * Зверху — пошук по товарах усіх під'єднаних джерел (Task 6), нижче — картки
 * стану за зразком «Інтеграцій», унизу — черга на під'єднання. Тулбар
 * малюється в тілі, макет смуги дій не резервує (pageSurfaces: toolbar none).
 */
const CONNECTED = SUPPLIER_DEFINITIONS.filter((definition) => !definition.planned);
const PLANNED = SUPPLIER_DEFINITIONS.filter((definition) => definition.planned);

export default function SuppliersPage() {
  const summary = useSupplierPoolSummary();
  const bySlug = useMemo(
    () => new Map((summary.data ?? []).map((row) => [row.supplier_slug, row])),
    [summary.data]
  );
  const refreshedAgo = formatAgo(summary.dataUpdatedAt ? new Date(summary.dataUpdatedAt).toISOString() : null);

  return (
    <div className="pb-10">
      <UnifiedPageToolbar
        topLeft={
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-foreground">Постачальники</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Під'єднані кабінети, умови цін і товари кожного постачальника.
            </p>
          </div>
        }
        topRight={
          <div className="flex items-center gap-3">
            {refreshedAgo ? <span className="text-2xs text-muted-foreground">Оновлено {refreshedAgo}</span> : null}
            <Button variant="outline" size="sm" onClick={() => void summary.refetch()} loading={summary.isFetching}>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              Оновити
            </Button>
          </div>
        }
      />

      {summary.isPending ? <AppSectionLoader label="Читаємо стан пулу…" className="mt-6" /> : null}

      {summary.isError ? (
        <p className="mt-6 text-sm text-destructive">
          Не вдалося прочитати стан пулу — картки нижче без чисел.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => void summary.refetch()}>
            Спробувати ще
          </button>
        </p>
      ) : null}

      {!summary.isPending ? (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="text-xs font-semibold text-foreground">Під'єднані</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Товари лежать у пулі й оновлюються за розкладом; клік по картці — паспорт кабінету й товари.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {CONNECTED.map((definition) => (
              <SupplierCard
                key={definition.id}
                definition={definition}
                status={supplierStatus(definition, bySlug.get(definition.slug) ?? null, new Date(), {
                  unavailable: summary.isError,
                })}
              />
            ))}
          </div>
        </section>
      ) : null}

      {PLANNED.length > 0 ? (
        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-xs font-semibold text-foreground">Плануємо підключити</h2>
            <p className="mt-0.5 text-2xs text-muted-foreground">
              Ще не під'єднано: що відомо про сайт і що заважає.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {PLANNED.map((definition) => (
              <SupplierCard key={definition.id} definition={definition} status={supplierStatus(definition, null)} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Перевірка й коміт**

Run: `npx vitest run src/features/suppliers && npm run check:fast` — Expected: PASS, чисто.

```bash
git add src/features/suppliers/queries.ts src/features/suppliers/SupplierCard.tsx \
  src/features/suppliers/SupplierCard.test.tsx src/pages/SuppliersPage.tsx
git commit -F - <<'MSG'
Список постачальників показує стан кожного кабінету й чергу на під'єднання

Картки за зразком «Інтеграцій»: скільки товарів у пулі, яка частка з нашою
ціною, коли оновлювалось, чи в пошуку прорахунку, чи застаріли дані, яке
правило ціни й коли домовлено. Унизу — «Плануємо підключити» з тим, що
заважає. Числа читаються одним RPC зі зведення пулу (картка 259).
MSG
```

---

### Task 6: Пошук по товарах усіх постачальників на списку (закриває REQ-259#p4)

**Files:**
- Create: `src/features/suppliers/SupplierProductSearch.tsx`, `src/features/suppliers/SupplierProductSearch.test.tsx`
- Modify: `src/pages/SuppliersPage.tsx` (вставити пошук між тулбаром і картками)

**Interfaces:**
- Consumes: `searchSupplierPool(term, { limit })` з `@/lib/supplierPool`; `SupplierPoolRow` і `SupplierPoolFilterBar`/`filterSupplierPool`/`POOL_FILTER_ALL`/`PoolFilter` з `@/components/catalog/*` (Task 2); `pluralUk` з `@/lib/lastSeen`.
- Produces: `SupplierProductSearch({ className?, debounceMs? })`.

- [ ] **Step 1: Тест — має впасти**

`src/features/suppliers/SupplierProductSearch.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierPoolProduct } from "@/lib/supplierPoolRows";

import { SupplierProductSearch } from "./SupplierProductSearch";

// Мокаємо лише пошук: рядок товару бере з того ж модуля формат ціни й назви
// джерел, і вони мають лишитись справжніми.
vi.mock("@/lib/supplierPool", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/supplierPool")>()),
  searchSupplierPool: vi.fn(),
}));

import { searchSupplierPool } from "@/lib/supplierPool";

const mockedSearch = vi.mocked(searchSupplierPool);

const product = (key: string, slug: string, name: string): SupplierPoolProduct => ({
  key,
  supplierSlug: slug,
  article: "812-01",
  name,
  vendor: "Gildan",
  category: null,
  url: `https://${slug}/${key}`,
  imageUrl: null,
  currency: "UAH",
  priceKind: "wholesale",
  priceMin: 100,
  priceMax: 100,
  variantCount: 1,
  variants: [],
  variantsAreColors: true,
  sources: [{ supplierSlug: slug, name, url: `https://${slug}/${key}` }],
  priceRowId: key,
});

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SupplierProductSearch debounceMs={0} />
    </QueryClientProvider>
  );
}

const typeTerm = (value: string) =>
  fireEvent.change(screen.getByRole("searchbox", { name: "Пошук у товарах постачальників" }), {
    target: { value },
  });

beforeEach(() => {
  mockedSearch.mockReset();
});

describe("SupplierProductSearch", () => {
  it("порожнє поле й один символ не шукають", async () => {
    renderSearch();
    typeTerm("ф");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockedSearch).not.toHaveBeenCalled();
    expect(screen.queryByText("Шукаю…")).not.toBeInTheDocument();
  });

  it("показує картки й дає звузити чипом до одного джерела", async () => {
    mockedSearch.mockResolvedValue([
      product("t1", "totobi.com.ua", "Футболка Stage"),
      product("b1", "bergamo.ua", "Футболка Printer"),
    ]);
    renderSearch();
    typeTerm("футболка");

    await waitFor(() => expect(screen.getByText("Футболка Stage")).toBeInTheDocument());
    expect(screen.getByText("Футболка Printer")).toBeInTheDocument();
    expect(screen.getByText("2 товари")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Bergamo/ }));
    expect(screen.queryByText("Футболка Stage")).not.toBeInTheDocument();
    expect(screen.getByText("Футболка Printer")).toBeInTheDocument();
  });

  it("порожній результат і помилка з повтором", async () => {
    mockedSearch.mockResolvedValueOnce([]);
    renderSearch();
    typeTerm("ручка");
    await waitFor(() => expect(screen.getByText("У постачальників такого не знайшлось.")).toBeInTheDocument());

    mockedSearch.mockRejectedValueOnce(new Error("мережа"));
    typeTerm("ручки");
    await waitFor(() => expect(screen.getByText("Не вдалося пошукати.")).toBeInTheDocument());

    mockedSearch.mockResolvedValueOnce([product("e1", "e-suvenir.com.ua", "Ручка Parker")]);
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще" }));
    await waitFor(() => expect(screen.getByText("Ручка Parker")).toBeInTheDocument());
  });
});
```

Run: `npx vitest run src/features/suppliers/SupplierProductSearch.test.tsx`
Expected: FAIL — модуль `./SupplierProductSearch` не знайдено.

- [ ] **Step 2: Компонент `src/features/suppliers/SupplierProductSearch.tsx`**

```tsx
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";

import { SupplierPoolFilterBar, filterSupplierPool, POOL_FILTER_ALL, type PoolFilter } from "@/components/catalog/SupplierPoolFilterBar";
import { SupplierPoolRow } from "@/components/catalog/SupplierPoolRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { pluralUk } from "@/lib/lastSeen";
import { searchSupplierPool } from "@/lib/supplierPool";
import { cn } from "@/lib/utils";

/**
 * Пошук по товарах усіх під'єднаних постачальників — верх сторінки
 * «Постачальники» (картка 259).
 *
 * Рушій той самий, що у вікні прорахунку (search_supplier_pool з чесною
 * часткою на джерело), тож результати тут і там збігаються. Різниця одна:
 * поле відкрите всім і не прив'язане до створення прорахунку.
 *
 * ПІД ЧАС ЗАПИТУ ЛУПА СТАЄ КРУТІЛКОЮ, і ознака враховує дебаунс: поки
 * `debounced` відстає від набраного, жоден прапорець запиту ще не піднятий,
 * а пауза вже йде — без цієї умови крутілка на короткі запити не з'являлась би.
 */
const DEBOUNCE_MS = 300;
const LIMIT = 40;

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SupplierProductSearch({ className, debounceMs = DEBOUNCE_MS }: { className?: string; debounceMs?: number }) {
  const [term, setTerm] = React.useState("");
  const [filter, setFilter] = React.useState<PoolFilter>(POOL_FILTER_ALL);
  const debounced = useDebounced(term, debounceMs);
  const enabled = debounced.trim().length >= 2;

  const query = useQuery({
    queryKey: ["supplier-pool", "page", debounced],
    queryFn: () => searchSupplierPool(debounced, { limit: LIMIT }),
    enabled,
    staleTime: 60_000,
  });

  const products = query.data ?? [];
  const visible = React.useMemo(() => filterSupplierPool(products, filter), [products, filter]);
  const pending = term.trim().length >= 2 && (term !== debounced || query.isFetching);

  return (
    <section className={cn("rounded-section border border-border/60 bg-card", className)} aria-label="Пошук у товарах постачальників">
      <div className="relative p-3">
        {pending ? (
          <Loader2 className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        )}
        <Input
          type="search"
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            // Новий запит — новий склад джерел; старий чип міг би сховати все.
            setFilter(POOL_FILTER_ALL);
          }}
          placeholder="Пошук у товарах постачальників: назва або артикул"
          aria-label="Пошук у товарах постачальників"
          className="h-10 rounded-full pl-9 text-sm"
        />
      </div>

      {enabled ? (
        <>
          <SupplierPoolFilterBar products={products} filter={filter} onChange={setFilter} />
          <div className="px-2 pb-2">
            {query.isError ? (
              <div className="px-3 py-6 text-center text-sm">
                <p className="text-destructive">Не вдалося пошукати.</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>
                  Спробувати ще
                </Button>
              </div>
            ) : null}
            {!query.isError && query.isPending ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Шукаю…</p>
            ) : null}
            {!query.isError && !query.isPending && visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                У постачальників такого не знайшлось.
              </p>
            ) : null}
            {visible.length > 0 ? (
              <p className="px-3 pt-2 text-2xs text-muted-foreground">
                {pluralUk(visible.length, "товар", "товари", "товарів")}
                {products.length >= LIMIT ? " — показано перші, уточніть запит" : ""}
              </p>
            ) : null}
            {visible.map((product) => (
              <SupplierPoolRow key={product.key} product={product} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
```

Run: `npx vitest run src/features/suppliers/SupplierProductSearch.test.tsx` — Expected: PASS (3 тести).

- [ ] **Step 3: Вставити пошук на сторінку**

У `src/pages/SuppliersPage.tsx` додати імпорт

```tsx
import { SupplierProductSearch } from "@/features/suppliers/SupplierProductSearch";
```

і одразу після `</UnifiedPageToolbar>` (перед завантажувачем зведення) вставити:

```tsx
      <SupplierProductSearch className="mt-5" />
```

- [ ] **Step 4: Перевірка й коміт**

Run: `npx vitest run src/features/suppliers && npm run check:fast` — Expected: PASS, чисто.

```bash
git add src/features/suppliers/SupplierProductSearch.tsx src/features/suppliers/SupplierProductSearch.test.tsx src/pages/SuppliersPage.tsx
git commit -F - <<'MSG'
Товари постачальників тепер можна шукати без відкриття прорахунку

На сторінці «Постачальники» зверху стоїть те саме поле, що у вікні прорахунку:
назва або артикул, чипи джерел, картки з фото, нашою ціною, кольорами й
переходом на сайт. Відкрите всім посадам, а не лише тим, хто створює
прорахунки (картка 259).

Закриває: REQ-259#p4
MSG
```

---

### Task 7: Сторінка постачальника — шапка, паспорт, контакт (закриває REQ-259#p6)

**Files:**
- Create: `src/features/suppliers/SupplierPassport.tsx`, `src/features/suppliers/SupplierPassport.test.tsx`
- Modify: `src/pages/SupplierPage.tsx` (замінити каркас)

**Interfaces:**
- Consumes: `useSupplierPoolSummary`, `useSupplierContractors`, `contractorForSupplier`, тип `SupplierContractor` (Task 5); `supplierStatus`, `formatInt`, `formatDateShort`, `formatExactDateTime`, `SUPPLIER_STATE_*` (Task 3); `faviconUrl`, `formatAgo` (Task 2).
- Produces: `SupplierPassport({ definition, status, contractor })`.

- [ ] **Step 1: Тест паспорта — має впасти**

`src/features/suppliers/SupplierPassport.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type { SupplierContractor } from "./queries";
import { SupplierPassport } from "./SupplierPassport";
import { supplierById } from "./suppliersCatalog";
import { supplierStatus, type SupplierPoolSummaryRow } from "./suppliersStatus";

const now = new Date("2026-09-09T12:00:00Z");
const totobi = supplierById("totobi")!;
const summary: SupplierPoolSummaryRow = {
  supplier_slug: "totobi.com.ua",
  contractor_id: "c1",
  rows_active: 3150,
  products: 679,
  with_price: 3074,
  with_photo: 3145,
  categories: 72,
  last_observed: "2026-09-09T10:00:00Z",
  first_loaded: "2026-09-08T08:06:16Z",
};
const contractor: SupplierContractor = {
  id: "c1",
  name: "ТОВ «ТоТобі»",
  contact_name: "Громовий Ярослав",
  phones: ["+380 67 000 00 00"],
  emails: null,
  website: "https://totobi.com.ua/",
  notes: null,
};

const renderPassport = (props: Partial<React.ComponentProps<typeof SupplierPassport>> = {}) =>
  render(
    <MemoryRouter>
      <SupplierPassport definition={totobi} status={supplierStatus(totobi, summary, now)} contractor={contractor} {...props} />
    </MemoryRouter>
  );

describe("SupplierPassport", () => {
  it("паспорт: спосіб забору, правило ціни з датою, що дає фід, контакт", () => {
    renderPassport();
    expect(screen.getByText("CS-Cart")).toBeInTheDocument();
    expect(screen.getByText(/сувенірка −44%/)).toBeInTheDocument();
    expect(screen.getByText("08.09.2026")).toBeInTheDocument();
    expect(screen.getByText("група нанесення")).toBeInTheDocument();
    expect(screen.getByText(/3 150 рядків, 679 товарів/)).toBeInTheDocument();
    expect(screen.getByText("Громовий Ярослав")).toBeInTheDocument();
    expect(screen.getByText("+380 67 000 00 00")).toBeInTheDocument();
  });

  it("без картки підрядника — чесний порожній стан і посилання на «Підрядників»", () => {
    renderPassport({ contractor: null });
    expect(screen.getByText("У картці підрядника контактів ще немає.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Підрядниках" })).toHaveAttribute("href", "/contractors");
  });

  it("запланований — «що заважає» замість ціни й фіда", () => {
    const toptime = supplierById("toptime")!;
    renderPassport({ definition: toptime, status: supplierStatus(toptime, null, now), contractor: null });
    expect(screen.getByText("Що заважає")).toBeInTheDocument();
    expect(screen.getByText(toptime.planned!.blocker)).toBeInTheDocument();
    expect(screen.queryByText("Ціна")).not.toBeInTheDocument();
    expect(screen.queryByText("Що дає фід")).not.toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/features/suppliers/SupplierPassport.test.tsx`
Expected: FAIL — модуль `./SupplierPassport` не знайдено.

- [ ] **Step 2: Компонент `src/features/suppliers/SupplierPassport.tsx`**

```tsx
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ROUTES } from "@/layout/routes";
import { formatAgo } from "@/lib/formatAgo";

import type { SupplierContractor } from "./queries";
import {
  SUPPLIER_INTAKE_LABEL,
  SUPPLIER_PRICE_BASIS_LABEL,
  type SupplierDefinition,
} from "./suppliersCatalog";
import { formatDateShort, formatExactDateTime, formatInt, type SupplierStatus } from "./suppliersStatus";

/**
 * Паспорт постачальника — блоки під шапкою сторінки (картка 259).
 * Текст іде з реєстру, числа — зі зведення пулу, контакт — з картки
 * підрядника (правиться там, тут лише читається).
 */

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-section border border-border/60 bg-card p-4">
      <h2 className="text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">{title}</h2>
      <div className="mt-2 space-y-1.5 text-sm text-foreground">{children}</div>
    </section>
  );
}

/** Рядок «підпис — значення»; без значення не малюється, щоб не плодити прочерків. */
function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-3">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0">{value}</span>
    </div>
  );
}

const hasContact = (contractor: SupplierContractor | null): contractor is SupplierContractor =>
  Boolean(
    contractor &&
      (contractor.contact_name || contractor.phones?.length || contractor.emails?.length || contractor.notes)
  );

export function SupplierPassport({
  definition,
  status,
  contractor,
}: {
  definition: SupplierDefinition;
  status: SupplierStatus;
  contractor: SupplierContractor | null;
}) {
  const planned = definition.planned;
  const summary = status.summary;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Block title={planned ? "Як плануємо забирати товари" : "Як забираємо товари"}>
        <Row label="Платформа" value={definition.platform} />
        <Row label="Спосіб" value={`${SUPPLIER_INTAKE_LABEL[definition.intake.kind]}: ${definition.intake.summary}`} />
        <Row label="Розклад" value={definition.intake.scheduleNote} />
        {summary ? (
          <>
            <Row
              label="Останнє оновлення"
              value={
                summary.last_observed
                  ? `${formatAgo(summary.last_observed)} (${formatExactDateTime(summary.last_observed)})`
                  : "ще не було"
              }
            />
            <Row
              label="У пулі"
              value={`${formatInt(summary.rows_active)} рядків, ${formatInt(summary.products)} товарів, фото у ${formatInt(summary.with_photo)}`}
            />
            <Row label="Перший залив" value={summary.first_loaded ? formatDateShort(summary.first_loaded) : null} />
          </>
        ) : null}
      </Block>

      {planned ? (
        <Block title="Що заважає">
          <p>{planned.blocker}</p>
          <p className="text-muted-foreground">У черзі з {formatDateShort(planned.since)}.</p>
        </Block>
      ) : (
        <Block title="Ціна">
          <Row label="Основа" value={SUPPLIER_PRICE_BASIS_LABEL[definition.price.basis]} />
          <p>{definition.price.summary}</p>
          <Row
            label="Домовлено"
            value={definition.price.agreedOn ? formatDateShort(definition.price.agreedOn) : "домовленість не підтверджена"}
          />
          {definition.price.vat ? <Row label="ПДВ" value={definition.price.vat} /> : null}
          <p className="text-muted-foreground">
            {definition.price.basis === "reference"
              ? "На картках ціни немає: купуємо не в себе."
              : "На картках стоїть ціна, за якою купуємо."}
          </p>
        </Block>
      )}

      {!planned ? (
        <Block title="Що дає фід">
          <div className="flex flex-wrap gap-1.5">
            {definition.gives.map((item) => (
              <span key={item} className="rounded-full border border-border/60 px-2.5 py-1 text-2xs">
                {item}
              </span>
            ))}
          </div>
          {definition.lacks.length > 0 ? (
            <>
              <h3 className="pt-2 text-3xs font-semibold uppercase tracking-caps-tight text-muted-foreground">
                Чого не дає
              </h3>
              <ul className="list-disc pl-4 text-muted-foreground">
                {definition.lacks.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Block>
      ) : null}

      {definition.quirks.length > 0 ? (
        <Block title="Особливості">
          <ul className="list-disc space-y-1 pl-4">
            {definition.quirks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Block>
      ) : null}

      <Block title="Контакт">
        {hasContact(contractor) ? (
          <>
            <Row label="Особа" value={contractor.contact_name} />
            <Row label="Телефони" value={contractor.phones?.length ? contractor.phones.join(", ") : null} />
            <Row label="Пошта" value={contractor.emails?.length ? contractor.emails.join(", ") : null} />
            <Row label="Нотатки" value={contractor.notes} />
          </>
        ) : (
          <p className="text-muted-foreground">У картці підрядника контактів ще немає.</p>
        )}
        <p className="pt-1 text-2xs text-muted-foreground">
          Правиться у{" "}
          <Link to={ROUTES.contractors} className="underline underline-offset-2">
            Підрядниках
          </Link>
          {contractor ? ` — картка «${contractor.name}»` : ""}.
        </p>
      </Block>
    </div>
  );
}
```

Run: `npx vitest run src/features/suppliers/SupplierPassport.test.tsx` — Expected: PASS (3 тести).

- [ ] **Step 3: Сторінка `src/pages/SupplierPage.tsx` (замінити каркас)**

```tsx
import { ChevronLeft, ExternalLink, KeyRound } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { EntityAvatar } from "@/components/app/avatar-kit";
import { AppSectionLoader } from "@/components/app/AppSectionLoader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ROUTES } from "@/layout/routes";
import { faviconUrl } from "@/lib/brandFavicon";

import { contractorForSupplier, useSupplierContractors, useSupplierPoolSummary } from "@/features/suppliers/queries";
import { SupplierPassport } from "@/features/suppliers/SupplierPassport";
import { supplierById } from "@/features/suppliers/suppliersCatalog";
import {
  SUPPLIER_STATE_ICON,
  SUPPLIER_STATE_LABEL,
  SUPPLIER_STATE_TONE,
  supplierStatus,
} from "@/features/suppliers/suppliersStatus";

/**
 * Сторінка одного постачальника (картка 259): шапка, паспорт кабінету,
 * контакт із картки підрядника; товари — у Task 8. Окрема адреса, а не
 * шторка: під список товарів потрібна ширина.
 */
export default function SupplierPage() {
  const { id } = useParams<{ id: string }>();
  const definition = id ? supplierById(id) : null;
  const summary = useSupplierPoolSummary();
  const contractors = useSupplierContractors();

  if (!definition) {
    return (
      <div className="pb-10">
        <p className="mt-6 text-sm text-muted-foreground">Такого постачальника немає.</p>
        <Link to={ROUTES.suppliers} className="mt-2 inline-block text-sm underline underline-offset-2">
          До списку постачальників
        </Link>
      </div>
    );
  }

  const row = summary.data?.find((item) => item.supplier_slug === definition.slug) ?? null;
  const status = supplierStatus(definition, row, new Date(), { unavailable: summary.isError });
  const contractor = contractorForSupplier(definition, row, contractors.data);
  const StateIcon = SUPPLIER_STATE_ICON[status.state];

  return (
    <div className="pb-10">
      <Link
        to={ROUTES.suppliers}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Постачальники
      </Link>

      <header className="mt-3 flex flex-wrap items-start gap-4">
        <EntityAvatar src={faviconUrl(definition.slug)} name={definition.name} size={40} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-foreground">{definition.name}</h1>
            <Badge tone={SUPPLIER_STATE_TONE[status.state]} size="sm" className="gap-1">
              <StateIcon className="h-3 w-3" aria-hidden="true" />
              {SUPPLIER_STATE_LABEL[status.state]}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            <a href={definition.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {definition.slug}
            </a>
            {" · "}
            {definition.sells}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={definition.siteUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              Сайт
            </a>
          </Button>
          {definition.cabinetUrl ? (
            <Button asChild variant="outline" size="sm">
              <a href={definition.cabinetUrl} target="_blank" rel="noopener noreferrer">
                <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Кабінет
              </a>
            </Button>
          ) : null}
        </div>
      </header>

      {summary.isPending ? (
        <AppSectionLoader label="Читаємо стан пулу…" className="mt-6" />
      ) : (
        <div className="mt-6">
          <SupplierPassport definition={definition} status={status} contractor={contractor} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Перевірка й коміт**

Run: `npx vitest run src/features/suppliers && npm run check:fast` — Expected: PASS, чисто.

```bash
git add src/features/suppliers/SupplierPassport.tsx src/features/suppliers/SupplierPassport.test.tsx src/pages/SupplierPage.tsx
git commit -F - <<'MSG'
У кожного постачальника з'явилась сторінка з паспортом кабінету й контактом

Як забираємо товари й за яким розкладом, коли оновлювалось і скільки лежить
у пулі, яке правило ціни й коли домовлено, що дає фід і чого не дає,
особливості кабінету, контакт із картки підрядника. Для запланованих —
що заважає під'єднати (картка 259).

Закриває: REQ-259#p6
MSG
```

---

### Task 8: Товари постачальника — перегляд, пошук, розділи, «Показати ще» (закриває REQ-259#p7)

**Files:**
- Modify: `src/features/suppliers/queries.ts` (додати товари й розділи)
- Create: `src/features/suppliers/SupplierProducts.tsx`, `src/features/suppliers/SupplierProducts.test.tsx`
- Modify: `src/pages/SupplierPage.tsx` (секція «Товари» під паспортом)

**Interfaces:**
- Consumes: RPC `list_supplier_products` і `supplier_pool_categories` (Task 1); `groupSupplierPoolRows`, `sanitizeSearchTerm`, `transliterateSearchTerm`, типи `SupplierPoolRow`, `SupplierPoolProduct` з `@/lib/supplierPoolRows`; `SupplierPoolRow` (компонент) з Task 2.
- Produces: тип `SupplierProductsPage = { rows, names, total, products }`; `searchTermsFor(term: string): string[]`; `fetchSupplierProducts({ slug, terms, category, offset, limit? })`; `useSupplierProducts(slug, terms, category)` (`useInfiniteQuery`); `fetchSupplierCategories(slug)`; `useSupplierCategories(slug)`; компонент `SupplierProducts({ definition, className?, debounceMs? })`.

- [ ] **Step 1: Тест компонента — має впасти**

`src/features/suppliers/SupplierProducts.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupplierPoolProduct } from "@/lib/supplierPoolRows";

import { SupplierProducts } from "./SupplierProducts";
import { supplierById } from "./suppliersCatalog";

// Хуки мокаємо цілком: тут перевіряється поведінка компонента, а не мережа.
vi.mock("./queries", () => ({
  useSupplierCategories: vi.fn(),
  useSupplierProducts: vi.fn(),
}));

import { useSupplierCategories, useSupplierProducts } from "./queries";

const mockedCategories = vi.mocked(useSupplierCategories);
const mockedProducts = vi.mocked(useSupplierProducts);
const totobi = supplierById("totobi")!;

const product = (key: string, name: string): SupplierPoolProduct => ({
  key,
  supplierSlug: "totobi.com.ua",
  article: "812-01",
  name,
  vendor: "Gildan",
  category: "Футболки",
  url: `https://totobi.com.ua/${key}`,
  imageUrl: null,
  currency: "UAH",
  priceKind: "wholesale",
  priceMin: 120,
  priceMax: 120,
  variantCount: 1,
  variants: [],
  variantsAreColors: true,
  sources: [{ supplierSlug: "totobi.com.ua", name, url: `https://totobi.com.ua/${key}` }],
  priceRowId: key,
});

type ProductsResult = ReturnType<typeof useSupplierProducts>;

const productsResult = (over: Partial<ProductsResult>): ProductsResult =>
  ({
    data: undefined,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...over,
  }) as unknown as ProductsResult;

beforeEach(() => {
  mockedCategories.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useSupplierCategories>);
});

describe("SupplierProducts", () => {
  it("«Шукаю…» поки перша сторінка ще не приїхала", () => {
    mockedProducts.mockReturnValue(productsResult({ isPending: true }));
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("Шукаю…")).toBeInTheDocument();
  });

  it("помилка — текст і кнопка повтору, яка кличе refetch", () => {
    const refetch = vi.fn();
    mockedProducts.mockReturnValue(productsResult({ isError: true, refetch }));
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("Не вдалося завантажити товари.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Спробувати ще" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("порожньо — називає постачальника", () => {
    mockedProducts.mockReturnValue(
      productsResult({ data: { pages: [{ rows: [], names: 0, total: 0, products: [] }], pageParams: [0] } })
    );
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("У Totobi такого не знайшлось.")).toBeInTheDocument();
  });

  it("картки, лічильник і «Показати ще», яке дотягує наступну сторінку", () => {
    const fetchNextPage = vi.fn();
    mockedProducts.mockReturnValue(
      productsResult({
        data: {
          pages: [{ rows: [], names: 2, total: 55, products: [product("a", "Футболка Stage"), product("b", "Поло Star")] }],
          pageParams: [0],
        },
        hasNextPage: true,
        fetchNextPage,
      })
    );
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByText("Футболка Stage")).toBeInTheDocument();
    expect(screen.getByText("Знайдено 55 товарів")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Показати ще" }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("селект розділів є лише коли джерело дає розділи", () => {
    mockedProducts.mockReturnValue(productsResult({ data: { pages: [], pageParams: [] } }));
    const { unmount } = render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    unmount();

    mockedCategories.mockReturnValue({
      data: [{ category: "Футболки", products: 120 }],
    } as unknown as ReturnType<typeof useSupplierCategories>);
    render(<SupplierProducts definition={totobi} debounceMs={0} />);
    expect(screen.getByRole("combobox", { name: "Розділ" })).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/features/suppliers/SupplierProducts.test.tsx`
Expected: FAIL — модуль `./SupplierProducts` не знайдено.

- [ ] **Step 2: Дописати запити в `src/features/suppliers/queries.ts`**

Замінити перший імпорт на `import { useInfiniteQuery, useQuery } from "@tanstack/react-query";` і додати

```ts
import {
  groupSupplierPoolRows,
  sanitizeSearchTerm,
  transliterateSearchTerm,
  type SupplierPoolProduct,
  type SupplierPoolRow,
} from "@/lib/supplierPoolRows";
```

У кінець файлу:

```ts
/** Сторінка товарів одного постачальника: сирі рядки, скільки різних назв у ній, скільки товарів усього під запит. */
export type SupplierProductsPage = {
  rows: SupplierPoolRow[];
  names: number;
  total: number;
  products: SupplierPoolProduct[];
};

export const SUPPLIER_PRODUCTS_PAGE_SIZE = 40;

/**
 * Слова запиту для RPC — так само, як у searchSupplierPool: оригінал плюс
 * транслітерація, коротше двох символів — порожньо (перегляд усього).
 */
export function searchTermsFor(term: string): string[] {
  const clean = sanitizeSearchTerm(term);
  if (clean.length < 2) return [];
  const variants = new Set<string>([clean.toLowerCase()]);
  const translit = transliterateSearchTerm(clean);
  if (translit && translit !== clean.toLowerCase()) variants.add(translit);
  return [...variants];
}

export async function fetchSupplierProducts(input: {
  slug: string;
  terms: readonly string[];
  category: string | null;
  offset: number;
  limit?: number;
}): Promise<SupplierProductsPage> {
  const limit = input.limit ?? SUPPLIER_PRODUCTS_PAGE_SIZE;
  const { data, error } = await supabase.schema("tosho").rpc("list_supplier_products", {
    p_slug: input.slug,
    p_terms: input.terms.length ? [...input.terms] : null,
    p_category: input.category,
    p_limit: limit,
    p_offset: input.offset,
  });
  if (error) throw error;
  const raw = (data ?? []) as unknown as Array<SupplierPoolRow & { total: number | string }>;
  const total = raw.length ? toNumber(raw[0].total) : 0;
  const rows: SupplierPoolRow[] = raw.map(({ total: _total, ...row }) => row);
  return {
    rows,
    names: new Set(rows.map((row) => row.name)).size,
    total,
    // Той самий згортач, що в пошуку прорахунку: кольори всередину картки.
    products: groupSupplierPoolRows(rows, limit, input.terms),
  };
}

/**
 * Нескінченна вибірка сторінками по ТОВАРАХ: зсув наступної сторінки — це
 * скільки різних назв уже завантажено, а не скільки рядків.
 */
export function useSupplierProducts(slug: string, terms: readonly string[], category: string | null) {
  return useInfiniteQuery({
    queryKey: supplierKeys.products(slug, terms, category),
    queryFn: ({ pageParam }) => fetchSupplierProducts({ slug, terms, category, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((sum, page) => sum + page.names, 0);
      return lastPage.names > 0 && loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: 60_000,
  });
}

export type SupplierCategory = { category: string; products: number };

export async function fetchSupplierCategories(slug: string): Promise<SupplierCategory[]> {
  const { data, error } = await supabase.schema("tosho").rpc("supplier_pool_categories", { p_slug: slug });
  if (error) throw error;
  return ((data ?? []) as unknown as SupplierCategory[]).map((row) => ({
    category: row.category,
    products: toNumber(row.products),
  }));
}

export function useSupplierCategories(slug: string) {
  return useQuery({
    queryKey: supplierKeys.categories(slug),
    queryFn: () => fetchSupplierCategories(slug),
    staleTime: 5 * 60_000,
  });
}
```

Run: `npm run typecheck` — Expected: без помилок.

- [ ] **Step 3: Компонент `src/features/suppliers/SupplierProducts.tsx`**

```tsx
import * as React from "react";
import { Loader2, Search } from "lucide-react";

import { SupplierPoolRow } from "@/components/catalog/SupplierPoolRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pluralUk } from "@/lib/lastSeen";
import { cn } from "@/lib/utils";

import { searchTermsFor, useSupplierCategories, useSupplierProducts } from "./queries";
import type { SupplierDefinition } from "./suppliersCatalog";

/**
 * Товари одного постачальника на його сторінці (картка 259).
 *
 * На відміну від пошуку по всіх джерелах, тут можна дивитись БЕЗ запиту:
 * порожнє поле — перегляд усього за абеткою, сторінками по 40 товарів.
 * Розділи — лише коли фід їх дає (у Bergamo їх нуль, і селект не малюється).
 */
const DEBOUNCE_MS = 300;
/** Radix Select не приймає порожнє значення, тож «усі» — окремий ключ. */
const ALL_CATEGORIES = "__all__";

function useDebounced(value: string, delay: number) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SupplierProducts({
  definition,
  className,
  debounceMs = DEBOUNCE_MS,
}: {
  definition: SupplierDefinition;
  className?: string;
  debounceMs?: number;
}) {
  const [term, setTerm] = React.useState("");
  const [category, setCategory] = React.useState<string | null>(null);
  const debounced = useDebounced(term, debounceMs);
  const terms = React.useMemo(() => searchTermsFor(debounced), [debounced]);

  const categories = useSupplierCategories(definition.slug);
  const products = useSupplierProducts(definition.slug, terms, category);

  const pages = products.data?.pages ?? [];
  const items = pages.flatMap((page) => page.products);
  const total = pages[0]?.total ?? 0;
  const searching = term !== debounced || (products.isFetching && !products.isFetchingNextPage);

  return (
    <div className={cn("rounded-section border border-border/60 bg-card", className)}>
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          {searching ? (
            <Loader2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden="true" />
          ) : (
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          )}
          <Input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={`Пошук у товарах ${definition.name}: назва або артикул`}
            aria-label={`Пошук у товарах ${definition.name}`}
            className="h-10 rounded-full pl-9 text-sm"
          />
        </div>
        {categories.data && categories.data.length > 0 ? (
          <Select value={category ?? ALL_CATEGORIES} onValueChange={(value) => setCategory(value === ALL_CATEGORIES ? null : value)}>
            <SelectTrigger className="h-10 sm:w-64" aria-label="Розділ">
              <SelectValue placeholder="Усі розділи" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CATEGORIES}>Усі розділи</SelectItem>
              {categories.data.map((item) => (
                <SelectItem key={item.category} value={item.category}>
                  {item.category} · {item.products}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="px-2 pb-2">
        {products.isError ? (
          <div className="px-3 py-6 text-center text-sm">
            <p className="text-destructive">Не вдалося завантажити товари.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void products.refetch()}>
              Спробувати ще
            </Button>
          </div>
        ) : null}
        {!products.isError && products.isPending ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Шукаю…</p>
        ) : null}
        {!products.isError && !products.isPending && items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">У {definition.name} такого не знайшлось.</p>
        ) : null}
        {items.length > 0 ? (
          <p className="px-3 pt-1 text-2xs text-muted-foreground">
            Знайдено {pluralUk(total, "товар", "товари", "товарів")}
          </p>
        ) : null}
        {items.map((product) => (
          <SupplierPoolRow key={product.key} product={product} />
        ))}
        {products.hasNextPage ? (
          <div className="px-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void products.fetchNextPage()}
              loading={products.isFetchingNextPage}
            >
              Показати ще
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

Run: `npx vitest run src/features/suppliers/SupplierProducts.test.tsx` — Expected: PASS (5 тестів).

- [ ] **Step 4: Секція «Товари» на сторінці**

У `src/pages/SupplierPage.tsx` додати імпорт `import { SupplierProducts } from "@/features/suppliers/SupplierProducts";` і після блоку паспорта (перед закриттям кореневого `<div>`):

```tsx
      {!definition.planned ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-foreground">Товари</h2>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            Усе, що лежить у пулі від цього постачальника, — і те, чого немає в пошуку прорахунку.
          </p>
          <SupplierProducts definition={definition} className="mt-3" />
        </section>
      ) : null}
```

- [ ] **Step 5: Перевірка й коміт**

Run:
```bash
npx vitest run src/features/suppliers
npm run check:fast
node scripts/check-rpc-contracts.mjs
```
Expected: тести зелені; `check:fast` чистий; контракти трьох RPC збігаються з базою (Task 1 застосовано).

```bash
git add src/features/suppliers/queries.ts src/features/suppliers/SupplierProducts.tsx \
  src/features/suppliers/SupplierProducts.test.tsx src/pages/SupplierPage.tsx
git commit -F - <<'MSG'
На сторінці постачальника видно всі його товари — з пошуком, розділами й догортанням

Перегляд без запиту за абеткою по 40 товарів, пошук за назвою чи артикулом
у межах цього постачальника, селект розділів там, де фід їх дає. Сторінки
ріжуться по товарах, тож кольори однієї речі ніколи не діляться між
«Показати ще». Видно й товари джерел, яких немає в пошуку прорахунку
(картка 259).

Закриває: REQ-259#p7
MSG
```

---

### Task 9: Документація, прев'ю, повна перевірка (закриває REQ-259#p8)

**Files:**
- Modify: `docs/CODEX_PROJECT_GUIDE.md` (перелік доменів після рядка `  - contractors`; розділ після `### Contractors`; список `## Current Routes` після `- \`/contractors\``)
- Modify: `docs/DB_MAP.md` (розділ `## Catalog / Product Configuration Tables` перед `## Sample Stock`; розділ `## Important Stored Functions And Helpers Seen In Code`)
- Пам'ять проєкту (лише головна сесія, не субагент): `~/.claude/projects/-Users-artem-Projects-tosho-crm/memory/`

- [ ] **Step 1: `docs/CODEX_PROJECT_GUIDE.md`**

У переліку `App domains` після `  - contractors`:

```
  - suppliers (connected supplier cabinets, pool search, per-supplier products)
```

Після розділу `### Contractors` (перед `### Sample Stock`):

```markdown
### Suppliers

- [src/pages/SuppliersPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/SuppliersPage.tsx) — list: pool search on top, supplier state cards, «Плануємо підключити» block
- [src/pages/SupplierPage.tsx](/Users/artem/Projects/tosho-crm/src/pages/SupplierPage.tsx) — one supplier: cabinet passport, contact from `contractors`, products with search / categories / paging by product name
- [src/features/suppliers/suppliersCatalog.ts](/Users/artem/Projects/tosho-crm/src/features/suppliers/suppliersCatalog.ts) — the registry; adding a supplier means a record here **and** in `scripts/load-supplier-feed.mjs` **and** in the source list of `scripts/supplier-pool-search.sql` (a test keeps the three in sync)
- [scripts/supplier-pool-page.sql](/Users/artem/Projects/tosho-crm/scripts/supplier-pool-page.sql) — read-only RPCs: `supplier_pool_summary`, `list_supplier_products`, `supplier_pool_categories`
- Design: [docs/superpowers/specs/2026-09-09-suppliers-page-design.md](/Users/artem/Projects/tosho-crm/docs/superpowers/specs/2026-09-09-suppliers-page-design.md)
- Module key `suppliers` is on by default for every job role (prices from the pool are visible to everyone by decision REQ-250#p32).
```

У `## Current Routes` після `- \`/contractors\``:

```
- `/suppliers`
- `/suppliers/:id` — one supplier; `:id` is the loader registry key (`totobi`, `bergamo`, …), not the domain
```

- [ ] **Step 2: `docs/DB_MAP.md`**

У розділі `## Catalog / Product Configuration Tables` перед заголовком `## Sample Stock / Warehouse Samples` додати:

```markdown
- `supplier_products`
  - the supplier pool: one row per colour/size offer of a supplier, keyed by
    `(supplier_slug, external_key)`; loaded by `scripts/load-supplier-feed.mjs`
    (GitHub Actions `supplier-feeds`, daily 06:00 Kyiv; Bergamo crawled weekly).
    `attrs` carries per-source extras (`color`, `sizes`, `sitePrice`, `methods`,
    `printPlaces`, Avanprint `description` — 5.3 MB in total, never select it whole).
  - the app reads it only through RPCs, all `security invoker` under the
    uncorrelated RLS policy described above:
    `tosho.search_supplier_pool(p_terms, p_per_supplier)` (quote wizard and the
    `/suppliers` search; the list of visible sources lives in the function body),
    `tosho.supplier_pool_summary()`,
    `tosho.list_supplier_products(p_slug, p_terms, p_category, p_limit, p_offset)`
    (pages by distinct `name`, so one product's colours never split across pages),
    `tosho.supplier_pool_categories(p_slug)`.
    ([scripts/catalog-supplier-products.sql](/Users/artem/Projects/tosho-crm/scripts/catalog-supplier-products.sql),
    [scripts/supplier-pool-search.sql](/Users/artem/Projects/tosho-crm/scripts/supplier-pool-search.sql),
    [scripts/supplier-pool-page.sql](/Users/artem/Projects/tosho-crm/scripts/supplier-pool-page.sql))
```

У розділі `## Important Stored Functions And Helpers Seen In Code` після запису про `tosho.get_stack_platform()`:

```markdown
- `tosho.supplier_pool_summary()`, `tosho.list_supplier_products(...)`, `tosho.supplier_pool_categories(p_slug)`
  - read-only RPCs behind `/suppliers`; SECURITY INVOKER on purpose — the pool's
    RLS already answers "which team", so there is nothing to elevate
```

- [ ] **Step 3: Пам'ять проєкту (головна сесія)**

Створити `project_suppliers_page.md` (тип `project`): що сторінка є, де реєстр, які три файли треба правити при додаванні постачальника, шість станів картки, рішення «пошук по товарах зверху списку», «планові» як частина сторінки, стан «unknown» замість нуля. Оновити в `project_supplier_pool.md` пункт 2 плану («Сторінка з усіма товарами всіх джерел»): зроблено частково — сторінка постачальника гортає його товари; спільний робочий стіл усіх джерел лишається відкритим. Додати рядок у `MEMORY.md`.

- [ ] **Step 4: Прев'ю — обов'язкове, живцем**

Підняти дев-сервер `preview_start` з іменем `dev` (порт 5173), увійти під робочим акаунтом, і проклацати:

1. `/suppliers`: п'ять карток «Під'єднані» з числами, три сірі картки «Плануємо підключити»; у Avanprint друга комірка порожня, не «0%».
2. У полі пошуку набрати «ручка»: з'явились чипи джерел, картки з цінами «наша», E-Suvenir серед джерел; клік по чипу «E-Suvenir» лишає лише його картки. Очистити поле — картки постачальників знову видно одразу.
3. Клік по картці Totobi → `/suppliers/totobi`: шапка з кнопкою «Сайт», паспорт з правилом ціни й датою 08.09.2026, контакт із картки «ТОВ «ТоТобі»».
4. У «Товарах» пошук «футболка»: картки, «Знайдено N товарів», розкриття кольорів на картці з кількома, «Показати ще» дотягує наступні 40 без дублів (перевірити, що перша картка другої порції не повторює останню першої).
5. Селект «Розділ» → вибрати один: список звужується, лічильник змінюється.
6. `/suppliers/bergamo`: селекта розділів немає; товари гортаються.
7. `/suppliers/toptime`: блок «Що заважає», секції «Товари» немає.
8. `/suppliers/xyz`: «Такого постачальника немає» з посиланням на список.
9. Ширина 375 px (`resize_window` mobile): паспорт в одну колонку, поле пошуку на всю ширину, картки в один стовпчик.
10. Консоль без помилок (`read_console_messages` onlyErrors); у мережі — три RPC, відповідь `list_supplier_products` на Totobi «футболка» до 100 кБ.

Зробити скріншоти списку, сторінки Totobi з товарами й мобільного вигляду; закрити прев'ю після себе. Будь-яка невідповідність — правити код і повторити крок, а не записувати «відомо».

- [ ] **Step 5: Повна перевірка**

Run: `npm run check` — Expected: усі сімнадцять перевірок зелені, включно з `check:page-surfaces`, `check:rpc-contracts`, `check:sql-journal`, `check:file-growth`. Якщо `check:docs-drift` скаржиться на числа — `npm run docs:sync` і додати змінені файли до коміту.

- [ ] **Step 6: Коміт і звіт**

```bash
git add docs/CODEX_PROJECT_GUIDE.md docs/DB_MAP.md
git commit -F - <<'MSG'
Документація знає про розділ «Постачальники» і три RPC пулу

Маршрути й розділ у CODEX_PROJECT_GUIDE, таблиця пулу з її RPC у DB_MAP;
прев'ю сторінки проклацано живцем: список, пошук, сторінка Totobi з товарами,
Bergamo без розділів, запланований Toptime, мобільна ширина (картка 259).

Закриває: REQ-259#p8
MSG
```

Звіт Артему: «накопичено N комітів, готові до викочування» + перелік тем; скріншоти з кроку 4. **Пуш — лише за командою.**

---

## Самоперевірка плану (виконано 09.09.2026)

- Покриття спеки: список (Task 5+6), сторінка постачальника (Task 7+8), реєстр і стани (Task 3), три RPC (Task 1), доступ усім посадам (Task 4), блок «Плануємо» (Task 5), спільні компоненти (Task 2), документація і прев'ю (Task 9). Стан «unknown» — уточнення спеки: «зведення не завантажилось → картки без чисел» реалізовано окремим станом, а не «empty», щоб не брехати «немає даних».
- Імена наскрізь: `SupplierPoolSummaryRow`, `supplierStatus(definition, summary, now?, { unavailable? })`, `SupplierStatus.metrics` (кортеж із трьох), `supplierKeys`, `fetchSupplierProducts` → `{ rows, names, total, products }`, `useSupplierProducts(slug, terms, category)`, `useSupplierCategories(slug)` → `{ category, products }[]`, `contractorForSupplier(definition, summary, contractors)`, `faviconUrl`, `formatAgo(iso, now?)`, `useIsClamped(text)`, `SupplierPoolRow`, `SupplierPoolFilterBar` з `@/components/catalog/`.
- RPC-аргументи в коді (`p_slug`, `p_terms`, `p_category`, `p_limit`, `p_offset`) збігаються з SQL Task 1.
