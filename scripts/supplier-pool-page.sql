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
--
-- ⚠️ ЗВЕДЕННЯ ТЕПЕР ЗБЕРІГАЄТЬСЯ, А НЕ РАХУЄТЬСЯ НА КОЖНЕ ВІДКРИТТЯ, і це не
-- передчасна оптимізація, а лікування 500-ї відповіді. Заміряно на проді
-- 16.09.2026 при 49 474 рядках пулу:
--
--   поточний план (GroupAggregate над Incremental Sort)   6,9 с
--   примусовий сік-скан (enable_indexscan = off)          5,29 с, external merge 10,5 МБ
--
-- Стеля ролі `authenticated` — 8 с, тож функція стабільно стояла на межі й час
-- від часу її перетинала: панель «стан пулу» на картці постачальника лишалась
-- на «ЧИТАЄМО СТАН ПУЛУ…», а в мережі висів 500.
--
-- ПЕРЕПИСАТИ ЗАПИТ БУЛО НЕ МОЖНА, і це головне, що тут варто знати. Справа не
-- в плані й не в двох `count(distinct)`: `width=207` — рядок пулу широкий через
-- `attrs` і `images` (JSONB), тож 49 474 рядки просто довго ЧИТАЮТЬСЯ. Будь-який
-- варіант, що читає таблицю цілком, упреться в ті самі п'ять секунд, і з ростом
-- пулу буде гіршати. Тому числа рахуються один раз — тоді, коли пул міняється.
--
-- ХТО ОНОВЛЮЄ. Завантажувач (scripts/load-supplier-feed.mjs) кличе
-- `refresh_supplier_pool_stats(slug)` В ТІЙ САМІЙ транзакції, що й залив. Тобто
-- числа міняються рівно тоді, коли міняється пул, і розійтися з ним не можуть:
-- або доїхало і те, і те, або не доїхало нічого.
create table if not exists tosho.supplier_pool_stats (
  -- Ключ саме ПАРОЮ з `team_id`: пул командний, і зведення теж. Без team_id
  -- одна команда бачила б числа іншої — те саме, від чого боронить RLS на
  -- самому пулі.
  team_id       uuid not null,
  supplier_slug text not null,
  contractor_id uuid,
  rows_active   bigint not null default 0,
  products      bigint not null default 0,
  with_price    bigint not null default 0,
  with_photo    bigint not null default 0,
  categories    bigint not null default 0,
  last_observed timestamptz,
  first_loaded  timestamptz,
  -- Коли числа знято. Не для показу, а щоб було видно, чи не відстало зведення
  -- від пулу (наприклад, після правки рядків руками повз завантажувач).
  computed_at   timestamptz not null default now(),
  primary key (team_id, supplier_slug)
);

-- RLS дзеркалить політику самого пулу: команда плюс блок-гейт. Пише лише
-- завантажувач прямим підключенням, тож write-політики немає навмисно.
alter table tosho.supplier_pool_stats enable row level security;
drop policy if exists supplier_pool_stats_select on tosho.supplier_pool_stats;
create policy supplier_pool_stats_select on tosho.supplier_pool_stats
  for select using (
    -- Схеми проставлені явно: `get_my_team_ids` живе в public, `is_user_blocked`
    -- у tosho. Політика зберігається розібраною, тож некваліфіковане ім'я
    -- прив'язалось би до search_path тієї сесії, що застосовує файл.
    team_id in (select public.get_my_team_ids())
    and not (select tosho.is_user_blocked((select auth.uid())))
  );
-- ⚠️ ГРАНТИ ЗНІМАЄМО З ІМЕННИХ РОЛЕЙ, А НЕ ЛИШЕ З `public` — інакше вони
-- лишаються. На схемі `tosho` стоїть DEFAULT ACL
-- (`anon=r`, `authenticated=arwd`, `service_role=arwd`), тож нова таблиця
-- отримує ці права В МОМЕНТ `create table`, ще до наших рядків. А
-- `revoke … from public` знімає права лише в псевдоролі `public` і до
-- іменованих ролей не доходить.
--
-- Без цього рядка `anon` міг би виконати `select` на зведенні (нуль рядків — їх
-- ріже RLS, — але сам виклик проходив би), а `authenticated` мав би ще й
-- insert/update/delete. Запис однаково впирався б у відсутність write-політики,
-- проте тоді захист тримався б на ОДНОМУ шарі замість двох, і з тексту файлу
-- цього не було б видно. Знайдено рецензією ролей 16.09.2026, до застосування.
revoke all on table tosho.supplier_pool_stats from public, anon, authenticated;
grant select on table tosho.supplier_pool_stats to authenticated;

-- 1б. Перерахунок зведення. `p_slug` = null — усі джерела (разовий засів).
--
-- ⚠️ SECURITY DEFINER І БЕЗ GRANT НА authenticated — обидва рішення свідомі.
-- Definer тому, що рахувати треба ПО ВСІХ командах одразу, а не по тій, чия
-- сесія кличе; завантажувач ходить сервісним ключем, але засів із psql і
-- майбутній виклик із крона не мусять залежати від того, хто саме підключився.
-- А `grant` немає тому, що це повний скан пулу на п'ять секунд: дай його
-- браузеру — і будь-хто зможе покласти базу, просто натискаючи кнопку.
create or replace function tosho.refresh_supplier_pool_stats(p_slug text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  touched integer;
begin
  -- Спершу прибираємо зведення джерел, від яких у пулі не лишилось ні рядка.
  delete from tosho.supplier_pool_stats st
  where (p_slug is null or st.supplier_slug = p_slug)
    and not exists (
      select 1 from tosho.supplier_products sp
      where sp.supplier_slug = st.supplier_slug and sp.team_id = st.team_id
    );

  insert into tosho.supplier_pool_stats as st (
    team_id, supplier_slug, contractor_id, rows_active, products,
    with_price, with_photo, categories, last_observed, first_loaded, computed_at
  )
  select
    sp.team_id,
    sp.supplier_slug,
    (array_agg(sp.contractor_id) filter (where sp.contractor_id is not null))[1],
    count(*) filter (where sp.is_active),
    count(distinct sp.name) filter (where sp.is_active),
    -- «З нашою ціною» — лише оптова: роздріб із сайту нашою ціною не є.
    count(*) filter (where sp.is_active and sp.price is not null and sp.price_kind = 'wholesale'),
    count(*) filter (where sp.is_active and sp.image_url is not null),
    count(distinct sp.category) filter (where sp.is_active and sp.category <> ''),
    max(sp.observed_at),
    min(sp.created_at),
    now()
  from tosho.supplier_products sp
  where p_slug is null or sp.supplier_slug = p_slug
  group by sp.team_id, sp.supplier_slug
  on conflict (team_id, supplier_slug) do update set
    contractor_id = excluded.contractor_id,
    rows_active   = excluded.rows_active,
    products      = excluded.products,
    with_price    = excluded.with_price,
    with_photo    = excluded.with_photo,
    categories    = excluded.categories,
    last_observed = excluded.last_observed,
    first_loaded  = excluded.first_loaded,
    computed_at   = excluded.computed_at;

  get diagnostics touched = row_count;
  return touched;
end
$fn$;

revoke all on function tosho.refresh_supplier_pool_stats(text) from public;
-- Завантажувач ходить прямим підключенням (BACKUP_DB_URL), тобто власником
-- функції, і грант йому не потрібен. `service_role` додано на випадок, коли
-- перерахунок колись покличе функція Netlify чи крон Supabase — щоб це не
-- вимагало правити права окремою міграцією в аварійному режимі.
grant execute on function tosho.refresh_supplier_pool_stats(text) to service_role;

-- Зведення для сторінки — тепер просто читання десяти рядків.
--
-- `security invoker` лишається: RLS на `supplier_pool_stats` та сама, що на
-- пулі, тож команда бачить свої числа й лише свої.
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
    st.supplier_slug, st.contractor_id, st.rows_active, st.products,
    st.with_price, st.with_photo, st.categories, st.last_observed, st.first_loaded
  from tosho.supplier_pool_stats st
$fn$;

revoke all on function tosho.supplier_pool_summary() from public;
grant execute on function tosho.supplier_pool_summary() to authenticated;

-- Засів: рахуємо все один раз просто тут. На 49 474 рядках це близько семи
-- секунд — у міграції прийнятно, бо стеля ролі сюди не діє.
select tosho.refresh_supplier_pool_stats() as zvedeno_dzherel;

-- 2. Товари одного постачальника, сторінками по ТОВАРАХ (різних назвах).
-- Стару знімаємо: `create or replace` не вміє міняти перелік колонок
-- результату, а `size` тут з'явився пізніше за саму функцію (10.09.2026).
drop function if exists tosho.list_supplier_products(text, text[], text, integer, integer);

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
  size          text,
  total         bigint
)
language sql
stable
security invoker
set search_path = ''
as $fn$
  -- `MATERIALIZED` і поріг у три символи — з тієї самої причини, що в
  -- search_supplier_pool, і рівно тими самими словами пояснено там. Коротко:
  -- без `materialized` шаблони перераховуються на кожен рядок (замір дав
  -- різницю в 38 разів), а двосимвольний шаблон тригрaмний покажчик обслужити
  -- не може за побудовою й вироджується в повний скан.
  with pat as materialized (
    -- Порожній масив дає arr = null, і тоді умови за словами немає — це
    -- «показати все», режим перегляду сторінки постачальника.
    select array_agg('%' || t || '%') as arr
    from unnest(coalesce(p_terms, '{}'::text[])) as t
    where length(btrim(t)) >= 3
  ),
  hit as (
    -- ЛИШЕ id І name, НАВМИСНО. Це CTE читається двічі, тож Postgres його
    -- матеріалізує; з усіма колонками й attrs->>'color' матеріалізувались
    -- усі 10 234 рядки Аванпринта разом із розтоастованими описами (9,5 МБ),
    -- вилітали в темп-файли й перегляд тривав 1–3 с. Із двома вузькими
    -- колонками — 16 мс (заміряно 09.09.2026); решту колонок і колір
    -- дочитуємо за первинним ключем лише для рядків самої сторінки.
    select sp.id, sp.name
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
    sp.id, sp.supplier_slug, sp.article, sp.name, sp.vendor, sp.category,
    sp.price, sp.currency, sp.price_kind, sp.url, sp.image_url,
    -- Розмір поруч із кольором: у Trele рядок — це пара «колір + розмір», і
    -- без нього варіанти одного кольору стають однаковими підписами. Тим самим
    -- рухом, що в search_supplier_pool.
    sp.attrs->>'color' as color, sp.attrs->>'size' as size, page.total
  from page
  join hit on hit.name = page.name
  join tosho.supplier_products sp on sp.id = hit.id
  order by sp.name, sp.id
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
