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
    sp.attrs->>'color' as color, page.total
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
