# Сторінка «Постачальники»

Дата: 2026-09-09
Статус: погоджено (Артем, 09.09.2026, розділами в розмові), готово до плану
Картка: REQ-259 «Сторінка «Постачальники»: стан підключень і пошук по товарах», у роботі

## Контекст

У CRM уже п'ять постачальників, чиї товари лежать у пулі
`tosho.supplier_products`, і в кожного свій спосіб забору й свої правила
ціни. На черзі ще п'ять-шість. Знання про кабінети живе в одному місці — у
коментарях реєстру завантажувача [scripts/load-supplier-feed.mjs](../../../scripts/load-supplier-feed.mjs),
і з інтерфейсу його не видно нікому.

### Що є зараз (заміряно 09.09.2026)

| Домен | Рядків | Карток | З нашою ціною | З фото | Розділів | Останній залив |
|---|---|---|---|---|---|---|
| totobi.com.ua | 3 150 | 679 | 3 074 | 3 145 | 72 | 09.09 07:40 |
| bergamo.ua | 10 076 | ≈2 658 | 10 076 | 4 941 | 0 | 08.09 12:20 |
| berrytex.com.ua | 2 071 | 74 | 2 071 | 2 071 | 11 | 09.09 09:05 |
| avanprint.ua | 10 234 | ≈2 051 | 0 (довідкова) | 10 231 | 107 | 09.09 07:40 |
| e-suvenir.com.ua | 1 229 | 424 | 1 223 | 1 229 | 44 | 09.09 07:41 |

Усі п'ять — у списку джерел `tosho.search_supplier_pool` (Беррітекс доданий
09.09.2026, коміт `eb27e9bc`). Кожен пов'язаний із карткою в `tosho.contractors`
через `supplier_products.contractor_id`.

У «Підрядниках» є вкладка «Постачальники»: 20 записів `kind = 'supplier'`,
серед них ті самі п'ять, черга на під'єднання (Toptime, Папірус Гурт, Еней) і
паперово-пакувальні контрагенти. Вкладку не бачать менеджери й дизайнери:
модуля `contractors` у їхніх стартових наборах немає (`SALES_MENU` у
[src/lib/moduleAccess.ts](../../../src/lib/moduleAccess.ts)).

Зразок для будови — розділ «Інтеграції»
([src/features/integrations](../../../src/features/integrations)): реєстр у
коді, живий стан із бази, картки однакової висоти, деталі окремо.

## Рішення, ухвалені в розмові

1. На сторінці живуть **лише постачальники, чиї товари є в пулі**, плюс блок
   «Плануємо підключити». Паперові й пакувальні лишаються в «Підрядниках».
2. **Товари показуються зі сторінки постачальника**: пошук у межах одного
   джерела, картки як у пошуку прорахунку. Бачать усі.
3. **Паспорт постачальника — реєстр у коді** (варіант A). Живі числа — з бази.
   Контакт — з картки підрядника, редагується там.
4. **Доступ усім посадам** за замовчуванням, власник може вимкнути окремій.
   Наслідок проговорено: закупівельні ціни бачать і ті, хто не бачить цін у
   прорахунках, — це відповідає правилу «ціна з пулу видна всім» (REQ-250#p32).
5. Сторінка постачальника — **окрема адреса, не шторка**: під товари потрібна
   ширина.
6. **Пошук по товарах усіх під'єднаних постачальників живе на списку**, над
   картками: той самий рушій, що у вікні прорахунку, але відкритий усім і не
   прив'язаний до створення прорахунку. Пошуку за назвою постачальника немає.

## Поза обсягом

- Редагування паспорта з інтерфейсу.
- Підтвердження пар «це той самий товар» і кнопка «це різні товари».
- Робочий стіл усіх товарів усіх джерел (пункт 2 плану в
  [CATALOG_DESIGN.md](../../CATALOG_DESIGN.md)).
- Будь-які зміни в «Підрядниках» і в `search_supplier_pool`.
- Журнал прогонів завантажувача: застарілість рахується з `observed_at`.

## Сторінки

### `/suppliers` — список

**Зверху — пошук по товарах.** Поле «Пошук у товарах постачальників» на всю
ширину. Рушій той самий, що у вікні прорахунку: `searchSupplierPool` →
`tosho.search_supplier_pool`, дебаунс 300 мс, від двох символів, оригінал
плюс транслітерація. Під полем — смуга чипів джерел `SupplierPoolFilterBar`
(лише ті, де щось знайшлось, і «лише з ціною») і до 40 карток
`SupplierPoolRow`: фото, назва, артикул, виробник, ціна з підписом «наша»
або «роздріб», кольори з розкриттям, перехід на сайт. Стани: «Шукаю…»,
«У постачальників такого не знайшлось», помилка з кнопкою «Спробувати ще».
Порожнє поле — результатів немає, картки постачальників видно одразу.
Джерела, яких немає в списку `search_supplier_pool`, сюди не потрапляють,
так само як у прорахунок; їхні товари відкриваються зі сторінки
постачальника.

**Нижче — картки постачальників** за зразком «Інтеграцій», однакової
висоти, п'ять рядів:

1. Лого (фавікон домену через `EntityAvatar`), назва латиницею, плашка стану.
2. Один рядок: чим торгує і як під'єднаний («Одяг і сувенірка: Discover,
   Floyd, Gildan · відкритий фід CS-Cart»).
3. Три числа: **товарів** (різних назв), **з нашою ціною** (частка рядків з
   `price_kind = 'wholesale'`), **оновлено** («2 год тому»). У Avanprint
   ціна довідкова, тож друга комірка лишається порожньою, а не «0%»: нуль
   читався б як «ціни зникли».
4. Плашка з повідомленням: правило ціни й дата домовленості.
5. «Оновлюється щодня о 06:00» і «Відкрити ›».

Стани картки (`suppliersStatus.ts`):

| Стан | Коли | Тон |
|---|---|---|
| `search` — «У пошуку прорахунку» | у реєстрі `inQuoteSearch: true`, дані свіжі | success |
| `hidden` — «Поза пошуком» | `inQuoteSearch: false`; повідомлення — `searchNote` з реєстру | neutral |
| `stale` — «Дані застаріли» | щоденне джерело без прогону понад 36 год, щотижневе — понад 8 днів | warning |
| `empty` — «Немає даних» | запис у реєстрі є, рядків у пулі нуль | neutral |
| `planned` — «Плануємо» | `planned` у реєстрі; чисел немає, повідомлення — що заважає | muted |

Фільтрів і пошуку за назвою постачальника немає: карток до десятка. Блок
«Плануємо підключити» стоїть окремо внизу, як у «Інтеграціях».

Повідомлення застарілого стану: «Останній прогін 08.09 12:20, за розкладом
мав бути в неділю. Дивись прогони supplier-feeds» з посиланням на
`https://github.com/artemshundrik/tosho-crm/actions/workflows/supplier-feeds.yml`.

### `/suppliers/:id` — сторінка постачальника

Ідентифікатор в адресі — ключ реєстру завантажувача: `totobi`, `bergamo`,
`berrytex`, `avanprint`, `e-suvenir`. Домен у адресу не кладемо: крапка в
останньому сегменті шляху для dev-сервера виглядає як розширення файлу.

Шапка: лого 40 px, назва, домен посиланням на сайт, плашка стану, кнопки
«Сайт» і «Кабінет» (друга — лише коли в реєстрі є адреса сторінки входу;
облікові дані ніде не показуються).

Паспорт — блоки у дві колонки на десктопі, в одну на телефоні:

1. **Як забираємо товари.** Платформа, спосіб (фід, обхід, API), розклад
   словами, останнє оновлення (відносно й точною датою), рядків і товарів у
   пулі, дата першого заливу.
2. **Ціна.** Основа: правило з множниками й датою домовленості; «постачальник
   каже нашу ціну сам»; «лише довідкова, не показуємо»; «роздріб із сайту».
   Позначка ПДВ, якщо відома. Речення «на картках стоїть ціна, за якою купуємо».
3. **Що дає фід** — чипи з `gives`. **Чого не дає** — приглушений список `lacks`.
4. **Особливості** — `quirks` списком.
5. **Контакт** — з картки підрядника: контактна особа, телефони, пошти,
   нотатки. Підпис «правиться у Підрядниках». Немає картки або вона порожня —
   «У картці підрядника контактів ще немає».

Нижче — **Товари**:

- поле пошуку (дебаунс 300 мс; порожнє поле означає «показати все»,
  один символ ще не шукає);
- вибір розділу з кількістю товарів — лише коли джерело дає розділи
  (Bergamo не дає, у нього селекта немає);
- рядок «Знайдено N товарів»;
- список карток `SupplierPoolRow`: фото, назва, артикул, виробник, ціна з
  підписом «наша» або «роздріб», кольори згорнуті з розкриттям, перехід на
  сайт;
- «Показати ще» по 40 товарів.

Порожній результат: «У Totobi такого не знайшлось». Помилка: «Не вдалося
завантажити товари» з кнопкою «Спробувати ще».

Для запланованих постачальників сторінка теж відкривається: шапка, блоки
«Як плануємо забирати» і «Що заважає», контакт із картки підрядника, без
секції товарів.

## Дані

### Реєстр `src/features/suppliers/suppliersCatalog.ts`

```ts
export type SupplierId =
  | "totobi" | "bergamo" | "berrytex" | "avanprint" | "e-suvenir"
  | "toptime" | "papirus" | "eney";

export type SupplierIntake = "feed" | "crawl" | "api";
export type SupplierSchedule = "daily" | "weekly" | "manual";
export type SupplierPriceBasis = "rule" | "account" | "reference" | "retail";

export type SupplierDefinition = {
  id: SupplierId;
  /** Домен — ключ пулу (`supplier_slug`); у запланованих — домен сайту. */
  slug: string;
  /** Латиницею, як на сайті постачальника; збігається з supplierDisplayName(slug). */
  name: string;
  siteUrl: string;
  /** Сторінка входу в кабінет. Без облікових даних. */
  cabinetUrl?: string;
  platform: string;
  /** Один рядок для картки: асортимент і бренди. */
  sells: string;
  intake: {
    kind: SupplierIntake;
    summary: string;
    schedule: SupplierSchedule;
    scheduleNote: string;
  };
  price: {
    basis: SupplierPriceBasis;
    summary: string;
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
```

Помічники: `SUPPLIER_DEFINITIONS`, `supplierById(id)`, `supplierBySlug(slug)`,
`STALE_AFTER_HOURS = { daily: 36, weekly: 8 * 24 }`.

Зміст записів переноситься з коментарів завантажувача і пам'яті проєкту.
Опорні факти, які мають бути в реєстрі дослівно:

- **Totobi.** CS-Cart. Відкритий YML-фід (адреса на сторінці опису вигрузок,
  оновлюється в них щогодини), наш прогін щодня о 06:00. Ціна: сувенірка −44%,
  одяг і головні убори −40%, статус «Єдина ціна» −50%; домовлено 08.09.2026;
  ціни з ПДВ. Дає артикул на колір, фото, ціну, колір, групу нанесення,
  розміри з власними артикулами й цінами. Не дає опису для документа.
  Особливості: картинки у фіді по http, підставляємо https.
- **Bergamo.** OpenCart. Фіда немає (перевірено 08.09.2026); обхід 2 658
  сторінок із мапи сайту, щотижня в неділю о 06:30. Ціна: сайт × 0,525
  (дилерська −47,5%), показана під нашим логіном; підтвердження ставки від
  СЕО ще немає. Дає артикул, назву, бренд, опис, наявність, ціну, кольори з
  блоку моделі. Не дає розділів і методів нанесення; фото є лише у 4 941
  рядку з 10 076 — решта кадрів на сайті названа інакше.
- **Berrytex.** Magento. Публічний фід `prom.xml` з роздрібними цінами плюс
  74 сторінки товарів під логіном, звідки береться множник; щодня о 06:00.
  Ціна: наша, з кабінету; множник різний по товарах (0,60–0,72), тому єдиного
  правила немає. Дає артикул, фото, ціну, виробника, розділи. У пошуку з
  09.09.2026.
- **Avanprint.** Наш магазин, Хорошоп. Профіль експорту YML з автогенерацією,
  щодня о 06:00. Ціна довідкова: це наш роздріб, у пулі порожня, на картках
  не показується. Роль: назви, описи й фото для злитих карток. Не дає
  характеристик (у фіді лише колір і гарантія) і закупівельної ціни.
  Особливість: адреса фіду містить хеш профілю, нову не вигадувати — брати
  в адмінці.
- **E-Suvenir.** Magento PWA. GraphQL API під логіном із заголовком вітрини;
  щодня о 06:00. Ціна: постачальник віддає нашу сам (типово −41%, є −50% і
  розпродажі). Дає методи нанесення, місця друку з розмірами в мм, матеріал,
  бренд, щільність, країну, розміри й вагу упаковки, кольори. 468 товарів
  вітрини, не 863 сусідньої. Категорія «Печать» (прайс на нанесення) у пул
  не заливається.
- **Заплановані** (з нотаток карток підрядників 05.09.2026): Toptime —
  власний рушій, публічно лише мапа сайту, спосіб отримання цін не з'ясовано;
  Папірус Гурт — B2B-портал, ціни за логіном, джерело даних — кабінет; Еней —
  OpenCart, фід `google_base` віддає нуль байтів, потрібно, щоб увімкнули
  вивантаження в себе.

### Три RPC, файл `scripts/supplier-pool-page.sql`

Усі три — `language sql stable security invoker set search_path = ''`,
`revoke all from public`, `grant execute to authenticated`. Читають під
чинною RLS `supplier_products_select`; нічого не пишуть.

```sql
create or replace function tosho.supplier_pool_summary()
returns table (
  supplier_slug text, contractor_id uuid,
  rows_active bigint, products bigint, with_price bigint, with_photo bigint,
  categories bigint, last_observed timestamptz, first_loaded timestamptz
) language sql stable security invoker set search_path = '' as $fn$
  select sp.supplier_slug,
         (array_agg(sp.contractor_id) filter (where sp.contractor_id is not null))[1],
         count(*) filter (where sp.is_active),
         count(distinct sp.name) filter (where sp.is_active),
         count(*) filter (where sp.is_active and sp.price is not null and sp.price_kind = 'wholesale'),
         count(*) filter (where sp.is_active and sp.image_url is not null),
         count(distinct sp.category) filter (where sp.is_active and sp.category <> ''),
         max(sp.observed_at), min(sp.created_at)
  from tosho.supplier_products sp
  group by sp.supplier_slug
$fn$;
```

```sql
create or replace function tosho.list_supplier_products(
  p_slug text, p_terms text[] default null, p_category text default null,
  p_limit integer default 40, p_offset integer default 0
) returns table (
  id uuid, supplier_slug text, article text, name text, vendor text, category text,
  price numeric, currency text, price_kind text, url text, image_url text,
  color text, total bigint
) language sql stable security invoker set search_path = '' as $fn$
  with pat as (
    select array_agg('%' || t || '%') as arr
    from unnest(coalesce(p_terms, '{}'::text[])) as t
    where length(btrim(t)) >= 2
  ),
  hit as (
    -- Лише колонки вікна: `attrs` Аванпринта важить 5,3 МБ описів, і
    -- матеріалізувати його заради одного поля «колір» не можна.
    select sp.id, sp.supplier_slug, sp.article, sp.name, sp.vendor, sp.category,
           sp.price, sp.currency, sp.price_kind, sp.url, sp.image_url,
           sp.attrs->>'color' as color
    from tosho.supplier_products sp cross join pat
    where sp.supplier_slug = p_slug and sp.is_active
      and (p_category is null or sp.category = p_category)
      and (pat.arr is null or sp.name ilike any (pat.arr) or sp.article ilike any (pat.arr))
  ),
  page as (
    select name, count(*) over () as total
    from hit group by name
    order by name limit greatest(p_limit, 1) offset greatest(p_offset, 0)
  )
  select hit.id, hit.supplier_slug, hit.article, hit.name, hit.vendor, hit.category,
         hit.price, hit.currency, hit.price_kind, hit.url, hit.image_url,
         hit.color, page.total
  from hit join page using (name)
  order by hit.name, hit.id
$fn$;
```

Сторінка гортається за **товарами** (різними назвами), а не за рядками:
кольори одного товару ніколи не діляться між сторінками. `total` — скільки
товарів усього під цей запит. Порожні `p_terms` означають «показати все».
Терміни готує клієнт так само, як для пошуку прорахунку: оригінал плюс
транслітерація (`transliterateSearchTerm`).

```sql
create or replace function tosho.supplier_pool_categories(p_slug text)
returns table (category text, products bigint) language sql stable security invoker set search_path = '' as $fn$
  select sp.category, count(distinct sp.name)
  from tosho.supplier_products sp
  where sp.supplier_slug = p_slug and sp.is_active
    and sp.category is not null and sp.category <> ''
  group by sp.category
  order by 2 desc, 1
$fn$;
```

Індекси спершу не додаємо: рівність за `supplier_slug` бере унікальний
індекс `supplier_products_uniq (supplier_slug, external_key)`, пошук за
словами — наявні trgm-індекси на `name` і `article`. Після застосування
заміряти `explain analyze` на «футболка» в totobi та на порожньому запиті в
avanprint (10 234 рядки) і записати час у картку. Якщо порожній перегляд
Avanprint довший за 100 мс — додати `supplier_products_slug_name_idx
(supplier_slug, name)` у тому самому SQL-файлі: він обслуговує і відбір
назв сторінки, і приєднання рядків.

### Запити в браузері, `src/features/suppliers/queries.ts`

React Query через `supabase.schema("tosho").rpc(...)`, як
`searchSupplierPool`:

| Хук | Ключ | Свіжість |
|---|---|---|
| `useSupplierPoolSummary()` | `["suppliers", "summary"]` | 5 хв |
| `useSupplierContractors()` | `["suppliers", "contractors"]` — `contractors` де `kind = 'supplier'`, поля `id, name, contact_name, phones, emails, website, notes` | 5 хв |
| `useSupplierProducts(slug, terms, category)` | `["suppliers", "products", slug, terms, category]`, `useInfiniteQuery`, сторінка 40 | 1 хв |
| `useSupplierCategories(slug)` | `["suppliers", "categories", slug]` | 5 хв |

Картка підрядника для постачальника з пулу береться за `contractor_id` зі
зведення, для запланованого — за збігом домену з `website`.

Рядки з `list_supplier_products` згортає наявний `groupSupplierPoolRows`
(той самий, що в пошуку прорахунку): у межах сторінки він ставить спершу
товари з ціною, далі за доречністю до запиту, далі за абеткою. На одному
постачальнику ціна є майже в усіх, тож порядок практично абетковий.

### Звіряння реєстрів, `suppliersCatalog.test.ts`

1. Домени записів без `planned` дорівнюють переліку в
   `and sp.supplier_slug in (...)` файлу `scripts/supplier-pool-search.sql`
   для тих, у кого `inQuoteSearch: true`, і не входять у нього для решти.
2. Кожен домен записів без `planned` є серед `slug: "..."` у
   `scripts/load-supplier-feed.mjs`, і навпаки.
3. `name` кожного запису дорівнює `supplierDisplayName(slug)`.
4. `id` збігається з `^[a-z0-9-]+$`; у записів з `inQuoteSearch: false` є
   `searchNote`; у `planned` немає `inQuoteSearch: true`.

Тести читають файли через `readFileSync` — так уже робить
`catalogMethodName.test.ts`, середовище `node`.

## Підключення до застосунку

| Де | Що |
|---|---|
| `src/layout/routes.ts` | `suppliers: "/suppliers"` |
| `src/App.tsx` | два маршрути під `ModuleRouteGate moduleKey="suppliers"` з `RouteSuspense shell`; у `routeMatchers` — `/suppliers` (page, operations) і `/suppliers/:id` (details, operations) |
| `src/layout/AppLayout.tsx` | пункт «Постачальники» після «Каталогу», іконка `Store` з lucide, `moduleKey: "suppliers"` |
| `src/layout/headerConfig.ts` | гілка `/suppliers`: заголовок «Постачальники», підзаголовок «Під'єднані кабінети, умови цін і товари кожного постачальника.», `showPageHeader: false` |
| `src/layout/pageSurfaces.ts` | `/suppliers/:id` (`toolbar: "none"`, `shape: "detail"`) перед `/suppliers` (`toolbar: "none"`, `shape: "grid"`); смуга дій не реєструється, пошук малюється в тілі, як в «Інтеграціях» |
| `src/lib/moduleAccess.ts` | ключ `suppliers`, визначення в групі `operations` з підказкою «Товари й умови постачальників із під'єднаними кабінетами; за замовчуванням у всіх посад»; додати в `SALES_MENU`, `ACCOUNTING_MENU`, `MARKETING_MENU`, `printer`, `packer`, `logistics`, `it_specialist`, `FALLBACK_MENU` |
| `src/lib/moduleAccess.test.ts` | кожна посада з `JOB_ROLE_NAMES` має `suppliers` у стартовому наборі |
| `src/lib/releaseHistory.ts` | `suppliers: "Постачальники"` у `SCOPE_LABEL` |
| `src/lib/brandFavicon.ts` | `faviconUrl(domain)` — одна копія замість двох (`integrationsCatalog.ts`, `subscriptionBrands.ts`); обидва місця переводяться на неї |
| `src/components/catalog/SupplierPoolRow.tsx` | рядок товару і `PoolPhoto` виносяться з `SupplierPoolSearch.tsx` без змін поведінки; пошук прорахунку імпортує їх звідти |
| `src/components/catalog/SupplierPoolFilterBar.tsx` | смуга чипів джерел переїжджає з `features/quotes/quote-wizard/` разом із тестом; `QuoteItemCommandField.tsx` імпортує з нового місця |

Сторінки: `src/pages/SuppliersPage.tsx`, `src/pages/SupplierPage.tsx`.
Компоненти: `src/features/suppliers/SupplierProductSearch.tsx` (пошук по
всіх джерелах на списку), `SupplierCard.tsx`, `SupplierPassport.tsx`,
`SupplierProducts.tsx` (товари одного постачальника), чиста логіка стану —
`suppliersStatus.ts`.

Каркас завантаження — `AppSectionLoader`, як в «Інтеграціях». Макет уже дає
відступи й `max-w-[1600px]`, власного `max-w` сторінки не додають.

## Помилки й порожні стани

- Зведення не завантажилось — список показує картки реєстру без чисел і
  рядок «Не вдалося прочитати стан пулу» з кнопкою «Оновити».
- Постачальника з таким `id` у реєстрі немає — сторінка каже «Такого
  постачальника немає» і веде на список.
- Картки підрядника немає — блок «Контакт» із чесним порожнім станом.
- Мертва адреса фото виглядає як відсутнє фото (`PoolPhoto` уже так робить).
- Товари: порожньо, помилка з повтором, «Шукаю…» під час запиту.

## Тести

- `suppliersCatalog.test.ts` — чотири звіряння вище.
- `suppliersStatus.test.ts` — правило застарілості на межах 36 год і 8 днів,
  вибір стану за пріоритетом (`planned` > `empty` > `stale` > `hidden` >
  `search`), формат трьох чисел, повідомлення застарілого стану.
- `moduleAccess.test.ts` — `suppliers` у всіх посад; власник бачить завжди.
- `SupplierCard.test.tsx` — п'ять станів, обрізання довгого повідомлення.
- `SupplierProductSearch.test.tsx` — порожнє поле й один символ не шукають,
  результати з чипами джерел, порожньо, помилка з повтором.
- `SupplierProducts.test.tsx` — порожньо, «Шукаю…», помилка з повтором,
  «Показати ще» дотягує другу сторінку, селект розділів не малюється без
  розділів.
- `SupplierPoolSearch` після винесення рядка — наявні тести лишаються
  зеленими.

## Перевірка

- `npm run check:fast` після кожного коміту, `npm run check` перед словами
  «готово до викочування».
- SQL застосовується через `npm run db:apply` (журналюється, перевірка
  `check:sql-journal`); `check:rpc-contracts` звіряє імена й аргументи трьох
  RPC із базою.
- Прев'ю обов'язкове: відкрити `/suppliers`, пошукати «ручка» й звузити
  чипом до E-Suvenir, зайти в Totobi, пошукати «футболка», розкрити кольори,
  натиснути «Показати ще», перевірити Bergamo без селекта розділів,
  перевірити ширину 375 px. Скріншоти — у звіт.
- Заміри трьох RPC — у картку.

## Порядок роботи

Картка «Сторінка постачальників» із чеклістом:

1. SQL: три RPC застосовано, час заміряно.
2. Реєстр постачальників і тести звіряння.
3. Модуль доступу, меню, маршрути, поверхні, підписи.
4. Список: пошук по товарах усіх під'єднаних постачальників, картки стану
   й блок «Плануємо».
5. Спільні компоненти: рядок товару і смуга чипів джерел винесені з пошуку
   прорахунку; фавікон-хелпер один.
6. Сторінка постачальника: шапка, паспорт, контакт.
7. Товари постачальника: пошук, розділи, «Показати ще».
8. Документація: маршрути й розділ у `CODEX_PROJECT_GUIDE.md`, RPC у
   `DB_MAP.md`, пам'ять проєкту.

Чотири коміти: (1) пункти 1–2, (2) 3–4, (3) 5–7, (4) 8. Кожен закриває свої
пункти трейлером `Закриває: REQ-N#pM`. Пуш — лише за командою.
