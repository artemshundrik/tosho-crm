-- Нові моделі постачальників — на avanprint.ua (REQ-311#p4, #p7).
-- Спека: docs/superpowers/specs/2026-10-01-site-autolisting-design.md, розділ 3.
-- Safe to run multiple times.
--
-- ЧЕРГА НЕ ЗБЕРІГАЄТЬСЯ — ВОНА РАХУЄТЬСЯ. «Нова модель» — це модель
-- постачальника (назва в межах постачальника, як картка пулу), жоден артикул
-- якої не збігся з активним рядком avanprint.ua. Тому самоочищення (p7) не має
-- власного коду: щойно товар увімкнуть на сайті, його артикул приїде у фід
-- avanprint, і модель випаде з `site_listing_candidates` сама. Прихований товар
-- у фід не потрапляє (перевірено 06.10.2026), тож до того модель стоїть у «У
-- файлі».
--
-- РЯДОК РІШЕННЯ З'ЯВЛЯЄТЬСЯ ЛИШЕ ТОДІ, КОЛИ МОДЕЛЬ ХТОСЬ ЧІПНУВ, і
-- прив'язаний до АРТИКУЛІВ, а не до назви: постачальник може перейменувати
-- модель або додати колір. Рядок належить моделі, якщо його знімок артикулів
-- перетинається з її артикулами хоч одним (`&&`).
--
-- ДОСТУП — ТОЙ САМИЙ КРУГ, ЩО БАЧИТЬ «ІНТЕГРАЦІЇ»: власник, СЕО, IT. Окремого
-- модуля в «Ролях і доступах» не заводимо (рішення 01.10.2026). Дзеркало в
-- інтерфейсі — `hasSiteListingAccess` у src/lib/moduleAccess.ts: розійдуться —
-- людина побачить блок, у якому кожен запис падає.
--
-- Застосування: npm run db:apply scripts/site-listing.sql — він сам загортає
-- файл в одну транзакцію й просить PostgREST перечитати схему.

-- ── доступ ──────────────────────────────────────────────────────────────────
-- За зразком has_finance_access (scripts/finances-access-rls.sql): член
-- команди, посада з переліку, не заблокований. Гейт заблокованих — усередині,
-- тож політики нижче не мусять його повторювати (див. check:db-guards).
create or replace function tosho.has_site_listing_access(_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'tosho', 'auth'
as $$
  select
    exists (
      select 1 from public.team_members tm
      where tm.team_id = _team_id and tm.user_id = auth.uid()
    )
    and exists (
      select 1 from tosho.memberships m
      where m.user_id = auth.uid()
        and (
          lower(coalesce(m.role::text, '')) = 'owner'
          or lower(coalesce(m.job_role::text, '')) in ('seo', 'it_specialist')
        )
    )
    and not tosho.is_user_blocked(auth.uid());
$$;

revoke all on function tosho.has_site_listing_access(uuid) from public, anon;
grant execute on function tosho.has_site_listing_access(uuid) to authenticated;

-- ── таблиці ─────────────────────────────────────────────────────────────────
create table if not exists tosho.site_listing_batches (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid not null,
  -- Шлях у кошику site-listing-exports: teams/<team_id>/site-listing/<файл>.xlsx
  file_path   text not null,
  item_count  integer not null default 0,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists tosho.site_listing_items (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null,
  supplier_slug     text not null,
  -- Назва в момент рішення — лише для показу; модель шукається за артикулами.
  model_name        text not null,
  -- Знімок артикулів моделі, нормалізованих як normalizeArticle: btrim + upper.
  articles          text[] not null,
  -- null — «Нові» (рішення скасоване), 'take' — беремо, 'skip' — не беремо.
  decision          text,
  -- Чернетка (спека, розділ 4). Порожня до генерації.
  draft             jsonb,
  draft_status      text not null default 'none',
  draft_error       text,
  -- Розділ сайту, вибраний у CRM руками, коли ні код, ні модель його не визначили.
  category_override text,
  batch_id          uuid references tosho.site_listing_batches(id) on delete set null,
  decided_by        uuid,
  decided_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint site_listing_items_decision_check
    check (decision is null or decision in ('take', 'skip')),
  constraint site_listing_items_draft_status_check
    check (draft_status in ('none', 'pending', 'running', 'ready', 'failed')),
  constraint site_listing_items_articles_check check (cardinality(articles) > 0)
);

-- «running» — функція вже взяла чернетку в роботу й платить за модель.
-- Окремий стан, а не «pending» до кінця: інакше подвійний клік чи повторний
-- виклик бачили б «pending» обидва й платили двічі (рецензія 07.10.2026).
-- Таблиця вже могла існувати без нього — переставляємо перевірку явно.
alter table tosho.site_listing_items drop constraint if exists site_listing_items_draft_status_check;
alter table tosho.site_listing_items add constraint site_listing_items_draft_status_check
  check (draft_status in ('none', 'pending', 'running', 'ready', 'failed'));

create index if not exists site_listing_items_team_supplier_idx
  on tosho.site_listing_items (team_id, supplier_slug);
-- Пошук рядка рішення за перетином артикулів (`articles && …`).
create index if not exists site_listing_items_articles_idx
  on tosho.site_listing_items using gin (articles);

-- updated_at ставить тригер, а не кожен запис окремо: рядок пишуть і RPC, і
-- фронт напряму (розділ, «спробувати ще»), і фонова функція. «Готується» без
-- руху понад 10 хвилин інтерфейс вважає зависанням — тож час мусить бути
-- чесним у кожному з трьох шляхів.
create or replace function tosho.touch_site_listing_items_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists site_listing_items_touch on tosho.site_listing_items;
create trigger site_listing_items_touch
  before update on tosho.site_listing_items
  for each row execute function tosho.touch_site_listing_items_updated_at();

-- ── RLS: усі чотири дії — has_site_listing_access(team_id) ─────────────────
alter table tosho.site_listing_items enable row level security;
alter table tosho.site_listing_batches enable row level security;

drop policy if exists site_listing_items_select on tosho.site_listing_items;
drop policy if exists site_listing_items_insert on tosho.site_listing_items;
drop policy if exists site_listing_items_update on tosho.site_listing_items;
drop policy if exists site_listing_items_delete on tosho.site_listing_items;
create policy site_listing_items_select on tosho.site_listing_items
  for select using (tosho.has_site_listing_access(team_id));
create policy site_listing_items_insert on tosho.site_listing_items
  for insert with check (tosho.has_site_listing_access(team_id));
create policy site_listing_items_update on tosho.site_listing_items
  for update using (tosho.has_site_listing_access(team_id))
  with check (tosho.has_site_listing_access(team_id));
create policy site_listing_items_delete on tosho.site_listing_items
  for delete using (tosho.has_site_listing_access(team_id));

drop policy if exists site_listing_batches_select on tosho.site_listing_batches;
drop policy if exists site_listing_batches_insert on tosho.site_listing_batches;
drop policy if exists site_listing_batches_update on tosho.site_listing_batches;
drop policy if exists site_listing_batches_delete on tosho.site_listing_batches;
create policy site_listing_batches_select on tosho.site_listing_batches
  for select using (tosho.has_site_listing_access(team_id));
create policy site_listing_batches_insert on tosho.site_listing_batches
  for insert with check (tosho.has_site_listing_access(team_id));
create policy site_listing_batches_update on tosho.site_listing_batches
  for update using (tosho.has_site_listing_access(team_id))
  with check (tosho.has_site_listing_access(team_id));
create policy site_listing_batches_delete on tosho.site_listing_batches
  for delete using (tosho.has_site_listing_access(team_id));

-- DEFAULT ACL схеми tosho роздає нові таблиці й anon, і authenticated ще до
-- рядків нижче, а `revoke … from public` до іменних ролей не доходить
-- (знайдено на supplier_pool_stats 16.09.2026). Тому знімаємо явно з усіх
-- трьох і вертаємо authenticated рівно те, що треба.
revoke all on table tosho.site_listing_items, tosho.site_listing_batches from public, anon, authenticated;
grant select, insert, update, delete on table tosho.site_listing_items, tosho.site_listing_batches to authenticated;

-- ── черга ───────────────────────────────────────────────────────────────────
-- Покривний покажчик пулу: артикул, назва, марка, підрозділ і все, що треба
-- RLS (team_id) і фільтру (is_active), — без читання самих рядків.
--
-- НАВІЩО. Рядок пулу широкий (у avanprint ~1,5 кБ: опис сайту в attrs), а
-- черзі з десяти тисяч рядків сайту потрібні лише артикули. Перша, холодна
-- відповідь черги на проді 07.10.2026 була 8,3 с — це понад стелю ролі
-- застосунку (8 с), тобто 500 замість черги; тепла — 0,13 с. Читання з диска,
-- а не обчислення: дані ті самі, просто з покажчика їх у десятки разів менше.
create index if not exists supplier_products_listing_idx
  on tosho.supplier_products (supplier_slug, article)
  include (name, is_active, team_id, vendor, category)
  where article is not null;

-- Моделі постачальника без жодного артикула на сайті + рішення за перетином
-- артикулів. `attrs` цілком не віддаємо (DB_MAP: 9,5 МБ на пул) — лише ключі,
-- які малює рядок, і лише для нових моделей. security invoker: пул і так читає
-- вся команда, а рішення закриває RLS — у кого доступу немає, той бачить
-- чергу без рішень.
--
-- `awaited_qty` / `awaited_at` (09.10.2026, REQ-311#p16) — очікуване
-- надходження з фіду: новинку не на складі Тотобі віддає без ціни, і замість
-- «немає ціни» черга каже «очікується 15.11». Нові колонки змінюють тип
-- результату, а `create or replace` цього не вміє — звідси drop; гранти
-- повертає блок наприкінці файлу.
drop function if exists tosho.site_listing_candidates(text);
create function tosho.site_listing_candidates(p_supplier text)
returns table (
  model_name         text,
  articles           text[],
  colors             integer,
  priced_colors      integer,
  supplier_price_min numeric,
  supplier_price_max numeric,
  image_url          text,
  supplier_url       text,
  is_new             boolean,
  section            text,
  category           text,
  vendor             text,
  first_seen_at      timestamptz,
  item_id            uuid,
  decision           text,
  draft_status       text,
  draft_error        text,
  draft              jsonb,
  category_override  text,
  batch_id           uuid,
  batch_created_at   timestamptz,
  item_updated_at    timestamptz,
  awaited_qty        integer,
  awaited_at         date
)
language sql
stable
security invoker
set search_path = tosho, public
as $$
  -- `article is not null` дослівно — інакше планувальник не візьме частковий
  -- покажчик supplier_products_listing_idx.
  with site as (
    select distinct upper(btrim(s.article)) as a
    from tosho.supplier_products s
    where s.supplier_slug = 'avanprint.ua'
      and s.article is not null
      and s.is_active
      and btrim(s.article) <> ''
  ),
  supplier_keys as (
    select p.name, upper(btrim(p.article)) as a
    from tosho.supplier_products p
    where p.supplier_slug = p_supplier
      and p.article is not null
      and p.is_active
      and btrim(p.article) <> ''
  ),
  -- Через з'єднання, а не `a in (select … from site)` усередині bool_or: так
  -- планувальник робив підзапит на КОЖЕН рядок (3150 × 10 тис.), і черга
  -- відкривалась 4,5 с. Хеш-з'єднання дає те саме за долі секунди (07.10.2026).
  on_site as (
    select distinct k.name
    from supplier_keys k
    join site on site.a = k.a
  ),
  -- Широкі рядки (attrs, фото) — лише нових моделей: ~500 рядків із 3150.
  supplier_rows as (
    select p.name,
           upper(btrim(p.article)) as a,
           p.image_url,
           p.url,
           p.created_at,
           p.vendor,
           p.category,
           p.attrs->>'section' as section,
           coalesce((p.attrs->>'isNew')::boolean, false) as is_new,
           (p.attrs->>'sitePrice')::numeric as site_price,
           -- Перевірка форми перед приведенням: криве значення в attrs дало б
           -- помилку на всю чергу, а не порожню клітинку в одному рядку.
           case when jsonb_typeof(p.attrs->'awaited') = 'number'
                then (p.attrs->>'awaited')::numeric::integer end as awaited,
           case when p.attrs->>'awaitedAt' ~ '^\d{4}-\d{2}-\d{2}$'
                then (p.attrs->>'awaitedAt')::date end as awaited_at
    from tosho.supplier_products p
    where p.supplier_slug = p_supplier
      and p.article is not null
      and p.is_active
      and btrim(p.article) <> ''
      and p.name not in (select on_site.name from on_site)
  ),
  models as (
    select r.name,
           array_agg(distinct r.a order by r.a) as articles,
           count(distinct r.a)::int as colors,
           count(distinct r.a) filter (where r.site_price is not null)::int as priced_colors,
           min(r.site_price) as price_min,
           max(r.site_price) as price_max,
           (array_agg(r.image_url order by r.a) filter (where r.image_url is not null))[1] as image_url,
           (array_agg(r.url order by r.a) filter (where r.url is not null))[1] as url,
           bool_or(r.is_new) as is_new,
           min(r.section) as section,
           min(r.category) as category,
           min(r.vendor) as vendor,
           min(r.created_at) as first_seen_at,
           sum(r.awaited)::int as awaited_qty,
           min(r.awaited_at) as awaited_at
    from supplier_rows r
    group by r.name
  )
  select m.name, m.articles, m.colors, m.priced_colors, m.price_min, m.price_max,
         m.image_url, m.url, m.is_new, m.section, m.category, m.vendor, m.first_seen_at,
         i.id, i.decision, i.draft_status, i.draft_error, i.draft, i.category_override,
         i.batch_id, b.created_at, i.updated_at, m.awaited_qty, m.awaited_at
  from models m
  left join lateral (
    select si.id, si.decision, si.draft_status, si.draft_error, si.draft,
           si.category_override, si.batch_id, si.updated_at
    from tosho.site_listing_items si
    where si.supplier_slug = p_supplier
      and si.articles && m.articles
    order by si.updated_at desc
    limit 1
  ) i on true
  left join tosho.site_listing_batches b on b.id = i.batch_id
  order by m.is_new desc, m.first_seen_at desc, m.name;
$$;

-- ── рішення ─────────────────────────────────────────────────────────────────
-- Один вхід на «Беремо», «Не беремо» й «Повернути в нові» (p_decision = null).
-- Знаходить рядок за перетином артикулів або заводить новий; знімок артикулів
-- ОБ'ЄДНУЄ старі й нові, щоб доданий постачальником колір не відірвав рядок.
-- На «Беремо» без готової чернетки ставить draft_status = 'pending' — фронт
-- одразу кличе фонову функцію, і людина бачить «готується», а не порожнечу.
--
-- security invoker: RLS вирішує все сама. Без доступу select нічого не
-- знайде, а insert упаде на with check.
create or replace function tosho.site_listing_decide(
  p_team_id    uuid,
  p_supplier   text,
  p_model_name text,
  p_articles   text[],
  p_decision   text
)
returns tosho.site_listing_items
language plpgsql
security invoker
set search_path = tosho, public
as $$
declare
  v_articles text[];
  v_row      tosho.site_listing_items;
begin
  if p_decision is not null and p_decision not in ('take', 'skip') then
    raise exception 'site_listing_decide: невідоме рішення %', p_decision;
  end if;

  select array_agg(distinct upper(btrim(a)) order by upper(btrim(a)))
    into v_articles
    from unnest(p_articles) as a
   where nullif(btrim(a), '') is not null;
  if coalesce(cardinality(v_articles), 0) = 0 then
    raise exception 'site_listing_decide: у моделі немає артикулів';
  end if;

  -- Два швидкі кліки по одній моделі не мають завести два рядки.
  perform pg_advisory_xact_lock(hashtext('site_listing:' || p_supplier));

  select * into v_row
    from tosho.site_listing_items
   where team_id = p_team_id
     and supplier_slug = p_supplier
     and articles && v_articles
   order by updated_at desc
   limit 1
   for update;

  if found then
    update tosho.site_listing_items
       set decision     = p_decision,
           model_name   = p_model_name,
           articles     = (select array_agg(distinct x order by x) from unnest(v_row.articles || v_articles) as x),
           draft_status = case
                            when p_decision = 'take' and v_row.draft_status in ('none', 'failed') then 'pending'
                            else v_row.draft_status
                          end,
           draft_error  = case
                            when p_decision = 'take' and v_row.draft_status in ('none', 'failed') then null
                            else v_row.draft_error
                          end,
           -- Рішення змінилось — модель більше не «у файлі».
           batch_id     = case when p_decision = 'take' then v_row.batch_id else null end,
           decided_by   = auth.uid(),
           decided_at   = now()
     where id = v_row.id
     returning * into v_row;
  else
    insert into tosho.site_listing_items
      (team_id, supplier_slug, model_name, articles, decision, draft_status, decided_by, decided_at)
    values
      (p_team_id, p_supplier, p_model_name, v_articles, p_decision,
       case when p_decision = 'take' then 'pending' else 'none' end,
       auth.uid(), now())
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- ── партія ──────────────────────────────────────────────────────────────────
-- Файл уже лежить у кошику (фронт кладе його ПЕРШИМ). Тут — одна транзакція:
-- запис партії й batch_id моделям. Якщо хоч одна модель за цей час змінила стан
-- (хтось відклав її в сусідній вкладці), падаємо цілком: інакше у файлі
-- лишилась би модель, якої немає в партії.
create or replace function tosho.site_listing_commit_batch(
  p_team_id   uuid,
  p_file_path text,
  p_item_ids  uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = tosho, public
as $$
declare
  v_batch uuid;
  v_count integer;
  v_wanted integer := coalesce(cardinality(p_item_ids), 0);
begin
  if v_wanted = 0 then
    raise exception 'site_listing_commit_batch: порожня партія';
  end if;
  if p_file_path !~ ('^teams/' || p_team_id::text || '/site-listing/[A-Za-z0-9._-]+\.xlsx$') then
    raise exception 'site_listing_commit_batch: чужий шлях файлу %', p_file_path;
  end if;

  insert into tosho.site_listing_batches (team_id, file_path, item_count)
  values (p_team_id, p_file_path, v_wanted)
  returning id into v_batch;

  update tosho.site_listing_items
     set batch_id = v_batch
   where team_id = p_team_id
     and id = any(p_item_ids)
     and decision = 'take'
     and batch_id is null
     and draft_status = 'ready';
  get diagnostics v_count = row_count;

  if v_count <> v_wanted then
    raise exception 'site_listing_commit_batch: у партію лягло % моделей із %', v_count, v_wanted;
  end if;
  return v_batch;
end;
$$;

-- ── розділи сайту ───────────────────────────────────────────────────────────
-- Перелік для вибору руками. Повний шлях «Батьківський/Дочірній» кладе у
-- `attrs.categoryPath` завантажувач фіду avanprint (REQ-311#p3); до першого
-- прогону з ним лишається назва листка.
create or replace function tosho.site_listing_site_categories()
returns table (path text, products integer)
language sql
stable
security invoker
set search_path = tosho, public
as $$
  select coalesce(nullif(s.attrs->>'categoryPath', ''), s.category) as path,
         count(distinct s.name)::int as products
  from tosho.supplier_products s
  where s.supplier_slug = 'avanprint.ua'
    and s.is_active
    and coalesce(nullif(s.attrs->>'categoryPath', ''), s.category) is not null
  group by 1
  order by 1;
$$;

-- ── дані для чернетки ───────────────────────────────────────────────────────
-- Усе, що фоновій функції треба знати про модель, одним запитом: рядки моделі,
-- пари «колір постачальника → колір сайту» тієї самої марки, голоси розділів
-- від моделей того самого підрозділу, 3–5 прикладів «опис постачальника →
-- опис сайту» і, коли голосів немає зовсім, перелік розділів сайту. Один
-- виклик замість п'яти — і без переліків артикулів у адресі запиту (стеля
-- PostgREST ~24 кБ).
--
-- ШИРОКІ РЯДКИ САЙТУ ЧИТАЄМО ЛИШЕ ДЛЯ ПОТРІБНИХ ПАР. Артикули сайту — з
-- покажчика; опис, колір і шлях розділу (усе в attrs, ~1,5 кБ на рядок) — лише
-- для моделей тієї ж марки, підрозділу чи розділу, що вже є на сайті. Функцію
-- кличе PostgREST під стелею ролі 8 с, і холодне читання всіх 10 тис. рядків
-- сайту в неї не вкладалось би.
--
-- Рядок рішення читається під RLS: без доступу функція поверне null.
create or replace function tosho.site_listing_draft_context(p_item_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = tosho, public
as $$
  with item as (
    select i.supplier_slug, i.articles
    from tosho.site_listing_items i
    where i.id = p_item_id
  ),
  site_keys as (
    select s.id, upper(btrim(s.article)) as a
    from tosho.supplier_products s
    where s.supplier_slug = 'avanprint.ua'
      and s.article is not null
      and s.is_active
      and btrim(s.article) <> ''
  ),
  sup as (
    select p.id,
           p.name,
           upper(btrim(p.article)) as a,
           btrim(p.article) as article,
           p.vendor,
           p.category,
           p.url,
           p.image_url,
           p.images,
           p.attrs->>'section' as section,
           nullif(btrim(p.attrs->>'color'), '') as color,
           coalesce(p.attrs->'params', '{}'::jsonb) as params,
           nullif(btrim(p.attrs->>'description'), '') as description,
           (p.attrs->>'sitePrice')::numeric as site_price,
           p.attrs->>'methods' as methods,
           coalesce((p.attrs->>'textile')::boolean, false) as textile,
           p.attrs->'sizes' as sizes
    from tosho.supplier_products p
    where p.supplier_slug = (select supplier_slug from item)
      and p.is_active
      and nullif(btrim(p.article), '') is not null
  ),
  model_rows as (
    select sup.*
    from sup
    where sup.name in (select s2.name from sup s2 where s2.a in (select unnest(item.articles) from item))
  ),
  head as (
    select * from model_rows order by a limit 1
  ),
  related as (
    select sup.*, sk.id as site_id
    from sup
    join site_keys sk on sk.a = sup.a
    where sup.name not in (select name from model_rows)
      and (sup.vendor is not distinct from (select vendor from head)
           or sup.category = (select category from head)
           or sup.section = (select section from head))
  ),
  site_rows as (
    select s.id,
           nullif(btrim(s.attrs->>'color'), '') as color,
           coalesce(nullif(s.attrs->>'categoryPath', ''), s.category) as path,
           s.name,
           nullif(btrim(s.attrs->>'description'), '') as description
    from tosho.supplier_products s
    where s.id in (select site_id from related)
  ),
  pairs as (
    select distinct r.name as model, r.vendor, r.category, r.color,
           st.color as site_color, st.path
    from related r
    join site_rows st on st.id = r.site_id
  ),
  model_votes as (
    select distinct on (x.model) x.model, x.path
    from (
      select model, path, count(*) as n
      from pairs
      where category = (select category from head) and path is not null
      group by model, path
    ) x
    order by x.model, x.n desc, x.path
  ),
  votes as (
    select path, count(*)::int as votes from model_votes group by path
  ),
  brand as (
    select distinct model, color, site_color
    from pairs
    where vendor is not distinct from (select vendor from head)
      and color is not null
      and site_color is not null
  ),
  example_pairs as (
    select distinct on (r.name)
           r.name as supplier_name,
           r.description as supplier_description,
           r.params,
           st.name as site_name,
           st.description as site_description,
           r.category = (select category from head) as same_category,
           st.description ilike '%Тип нанесення%' as styled
    from related r
    join site_rows st on st.id = r.site_id
    where length(st.description) > 80
      and (r.category = (select category from head) or r.section = (select section from head))
    order by r.name, st.name
  ),
  examples as (
    select * from example_pairs
    order by same_category desc, styled desc, supplier_name
    limit 5
  )
  select jsonb_build_object(
    'model', (
      select jsonb_build_object(
        'name', h.name, 'vendor', h.vendor, 'category', h.category, 'section', h.section,
        'url', h.url, 'description', h.description, 'params', h.params, 'methods', h.methods,
        'textile', h.textile,
        'sizes', coalesce((
          select jsonb_agg(sz->>'size')
          from jsonb_array_elements(case when jsonb_typeof(h.sizes) = 'array' then h.sizes else '[]'::jsonb end) as sz
        ), '[]'::jsonb))
      from head h
    ),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'article', r.article,
               'color', r.color,
               'exactColor', r.params->>'Колір',
               'group', r.params->>'Група Кольорів',
               'sitePrice', r.site_price,
               'images', case
                           when jsonb_typeof(r.images) = 'array' and jsonb_array_length(r.images) > 0 then r.images
                           when r.image_url is not null then jsonb_build_array(r.image_url)
                           else '[]'::jsonb
                         end)
             order by r.a)
      from model_rows r
    ), '[]'::jsonb),
    'brandColors', coalesce((
      select jsonb_agg(jsonb_build_object('model', b.model, 'color', b.color, 'siteColor', b.site_color)
             order by b.model, b.color)
      from brand b
    ), '[]'::jsonb),
    'categoryVotes', coalesce((
      select jsonb_agg(jsonb_build_object('path', v.path, 'votes', v.votes) order by v.votes desc, v.path)
      from votes v
    ), '[]'::jsonb),
    'examples', coalesce((
      select jsonb_agg(jsonb_build_object(
               'supplierName', e.supplier_name,
               'supplierDescription', e.supplier_description,
               'params', e.params,
               'siteName', e.site_name,
               'siteDescription', e.site_description)
             order by e.same_category desc, e.styled desc, e.supplier_name)
      from examples e
    ), '[]'::jsonb),
    -- Повний перелік розділів потрібен моделі, лише коли голосів немає зовсім
    -- (prepareDraft бере його тільки тоді), а коштує він читання всіх рядків
    -- сайту. CASE не виконує підзапит, коли гілка не потрібна.
    'siteCategories', case
      when exists (select 1 from votes) then '[]'::jsonb
      else coalesce((
        select jsonb_agg(distinct coalesce(nullif(s.attrs->>'categoryPath', ''), s.category))
        from tosho.supplier_products s
        where s.supplier_slug = 'avanprint.ua'
          and s.is_active
          and coalesce(nullif(s.attrs->>'categoryPath', ''), s.category) is not null
      ), '[]'::jsonb)
    end
  )
  where exists (select 1 from item);
$$;

revoke all on function tosho.site_listing_candidates(text) from public, anon;
revoke all on function tosho.site_listing_decide(uuid, text, text, text[], text) from public, anon;
revoke all on function tosho.site_listing_commit_batch(uuid, text, uuid[]) from public, anon;
revoke all on function tosho.site_listing_site_categories() from public, anon;
revoke all on function tosho.site_listing_draft_context(uuid) from public, anon;
grant execute on function tosho.site_listing_candidates(text) to authenticated;
grant execute on function tosho.site_listing_decide(uuid, text, text, text[], text) to authenticated;
grant execute on function tosho.site_listing_commit_batch(uuid, text, uuid[]) to authenticated;
grant execute on function tosho.site_listing_site_categories() to authenticated;
grant execute on function tosho.site_listing_draft_context(uuid) to authenticated;

-- ── сховище ─────────────────────────────────────────────────────────────────
-- Приватний кошик для файлів імпорту. Шлях — teams/<team_id>/site-listing/…
-- (docs/SECURITY.md §2): політика дістає команду зі шляху й питає той самий
-- has_site_listing_access. Хорошоп забирає файл за ПІДПИСАНИМ посиланням на 7
-- днів, яке робить фронт тим самим токеном.
create or replace function tosho.site_listing_path_team(p_name text)
returns uuid
language sql
immutable
set search_path = pg_catalog
as $$
  -- CASE, а не AND: порядок обчислення умов у політиці не гарантований, і
  -- приведення сміття до uuid упало б помилкою замість «доступу немає».
  select case
           when p_name ~ '^teams/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/site-listing/[^/]+$'
           then split_part(p_name, '/', 2)::uuid
         end;
$$;

revoke all on function tosho.site_listing_path_team(text) from public, anon;
grant execute on function tosho.site_listing_path_team(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'site-listing-exports', 'site-listing-exports', false, 10485760,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists site_listing_exports_select on storage.objects;
drop policy if exists site_listing_exports_insert on storage.objects;
create policy site_listing_exports_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'site-listing-exports'
    and tosho.has_site_listing_access(tosho.site_listing_path_team(name))
  );
create policy site_listing_exports_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'site-listing-exports'
    and tosho.has_site_listing_access(tosho.site_listing_path_team(name))
  );

-- ── сповіщення про нові моделі (REQ-311#p17) ────────────────────────────────
-- Пам'ять сповіщень: про яку модель і в якому стані вже сказали. Пише й читає
-- лише функція site-listing-reminders сервісним ключем — людям ця таблиця ні
-- до чого, тож RLS увімкнено без жодної політики, а гранти знято з усіх.
--
-- ЧОМУ ТАБЛИЦЯ, А НЕ ДАТА СТВОРЕННЯ РЯДКА ПУЛУ. Сповіщень два: «з'явилась нова
-- модель» і «в очікуваної моделі з'явилась ціна — можна брати». Друге не має
-- жодної мітки часу в пулі (ціна просто стає не порожньою), тож без пам'яті
-- його не відрізнити від ціни, що була завжди.
--
-- `takeable` — стан, про який сповістили: false — «нова, ціни ще немає», true —
-- «можна брати». Ключ — назва моделі, як і картка пулу: перейменування
-- постачальником сповістить ще раз, і це чесно — для черги це інша модель.
create table if not exists tosho.site_listing_announcements (
  supplier_slug text not null,
  model_name    text not null,
  articles      text[] not null,
  takeable      boolean not null,
  announced_at  timestamptz not null default now(),
  primary key (supplier_slug, model_name)
);

alter table tosho.site_listing_announcements enable row level security;
revoke all on table tosho.site_listing_announcements from public, anon, authenticated;
grant select, insert, update on table tosho.site_listing_announcements to service_role;
-- Сервісний ключ кличе чергу сам (security invoker, RLS для нього не діє).
grant execute on function tosho.site_listing_candidates(text) to service_role;

-- Точка відліку: усе, що в черзі вже зараз (116 моделей 09.10.2026), відоме й
-- сповіщенням не стане — інакше перший тік розіслав би весь беклог. Лише коли
-- таблиця порожня: повторне застосування файлу не має тихо «відмічати»
-- моделі, що з'явились після першого.
insert into tosho.site_listing_announcements (supplier_slug, model_name, articles, takeable)
select 'totobi.com.ua', c.model_name, c.articles, c.colors > 0 and c.priced_colors = c.colors
from tosho.site_listing_candidates('totobi.com.ua') c
where not exists (
  select 1 from tosho.site_listing_announcements a where a.supplier_slug = 'totobi.com.ua'
)
on conflict do nothing;

-- ── хто отримує сповіщення (REQ-311#p18) ────────────────────────────────────
-- Вибір людей у шапці блоку «На сайт», рядок на команду. Рядка немає — лише
-- власник (src/lib/siteListing/recipients.ts), а не всі з доступом: інакше
-- перший же пуш пішов би обом СЕО, які цього не просили. Порожній масив — уже
-- вибір «нікому».
--
-- Вибрати можна будь-кого з команди, не лише круг блоку (рішення власника
-- 09.10.2026). site-listing-reminders перетинає список із членами команди, що
-- досі працюють, тож звільнений випадає без чистки масиву. Міняти вибір може
-- кожен, хто бачить блок.
create table if not exists tosho.site_listing_settings (
  team_id         uuid primary key,
  notify_user_ids uuid[] not null default '{}',
  updated_by      uuid,
  updated_at      timestamptz not null default now(),
  constraint site_listing_settings_notify_size check (cardinality(notify_user_ids) <= 50)
);

-- Хто й коли змінив — ставить тригер: фронт пише рядок напряму upsert-ом, і
-- довіряти тілу запиту, хто автор, не можна.
create or replace function tosho.stamp_site_listing_settings()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists site_listing_settings_stamp on tosho.site_listing_settings;
create trigger site_listing_settings_stamp
  before insert or update on tosho.site_listing_settings
  for each row execute function tosho.stamp_site_listing_settings();

alter table tosho.site_listing_settings enable row level security;
drop policy if exists site_listing_settings_select on tosho.site_listing_settings;
drop policy if exists site_listing_settings_insert on tosho.site_listing_settings;
drop policy if exists site_listing_settings_update on tosho.site_listing_settings;
create policy site_listing_settings_select on tosho.site_listing_settings
  for select using (tosho.has_site_listing_access(team_id));
create policy site_listing_settings_insert on tosho.site_listing_settings
  for insert with check (tosho.has_site_listing_access(team_id));
create policy site_listing_settings_update on tosho.site_listing_settings
  for update using (tosho.has_site_listing_access(team_id))
  with check (tosho.has_site_listing_access(team_id));

-- Видаляти рядок нема чого: «нікому» — порожній масив, а не відсутній рядок.
revoke all on table tosho.site_listing_settings from public, anon, authenticated;
grant select, insert, update on table tosho.site_listing_settings to authenticated;
grant select on table tosho.site_listing_settings to service_role;

-- Перевірка після застосування:
--   select count(*), count(*) filter (where is_new) from tosho.site_listing_candidates('totobi.com.ua');
--   select takeable, count(*) from tosho.site_listing_announcements group by 1;
--   select team_id, notify_user_ids, updated_by, updated_at from tosho.site_listing_settings;
--   select id, public, file_size_limit from storage.buckets where id = 'site-listing-exports';
