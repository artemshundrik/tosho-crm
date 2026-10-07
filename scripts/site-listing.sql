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
-- Моделі постачальника без жодного артикула на сайті + рішення за перетином
-- артикулів. `attrs` цілком не віддаємо (DB_MAP: 9,5 МБ на пул) — лише ключі,
-- які малює рядок. security invoker: пул і так читає вся команда, а рішення
-- закриває RLS — у кого доступу немає, той бачить чергу без рішень.
create or replace function tosho.site_listing_candidates(p_supplier text)
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
  item_updated_at    timestamptz
)
language sql
stable
security invoker
set search_path = tosho, public
as $$
  with site as (
    select distinct upper(btrim(s.article)) as a
    from tosho.supplier_products s
    where s.supplier_slug = 'avanprint.ua'
      and s.is_active
      and nullif(btrim(s.article), '') is not null
  ),
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
           (p.attrs->>'sitePrice')::numeric as site_price
    from tosho.supplier_products p
    where p.supplier_slug = p_supplier
      and p.is_active
      and nullif(btrim(p.article), '') is not null
  ),
  -- Через з'єднання, а не `a in (select … from site)` усередині bool_or: так
  -- планувальник робив підзапит на КОЖЕН рядок (3150 × 10 тис.), і черга
  -- відкривалась 4,5 с. Хеш-з'єднання дає те саме за долі секунди (07.10.2026).
  on_site as (
    select distinct r.name
    from supplier_rows r
    join site on site.a = r.a
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
           min(r.created_at) as first_seen_at
    from supplier_rows r
    where r.name not in (select on_site.name from on_site)
    group by r.name
  )
  select m.name, m.articles, m.colors, m.priced_colors, m.price_min, m.price_max,
         m.image_url, m.url, m.is_new, m.section, m.category, m.vendor, m.first_seen_at,
         i.id, i.decision, i.draft_status, i.draft_error, i.draft, i.category_override,
         i.batch_id, b.created_at, i.updated_at
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
-- опис сайту» і перелік розділів сайту. Один виклик замість п'яти — і без
-- переліків артикулів у адресі запиту (стеля PostgREST ~24 кБ).
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
  site as (
    select upper(btrim(s.article)) as a,
           nullif(btrim(s.attrs->>'color'), '') as color,
           coalesce(nullif(s.attrs->>'categoryPath', ''), s.category) as path,
           s.name,
           nullif(btrim(s.attrs->>'description'), '') as description
    from tosho.supplier_products s
    where s.supplier_slug = 'avanprint.ua'
      and s.is_active
      and nullif(btrim(s.article), '') is not null
  ),
  sup as (
    select p.name,
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
  pairs as (
    select distinct sup.name as model, sup.vendor, sup.category, sup.color,
           site.color as site_color, site.path
    from sup
    join site on site.a = sup.a
    where sup.name not in (select name from model_rows)
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
    select distinct on (sup.name)
           sup.name as supplier_name,
           sup.description as supplier_description,
           sup.params,
           site.name as site_name,
           site.description as site_description,
           sup.category = (select category from head) as same_category,
           site.description ilike '%Тип нанесення%' as styled
    from sup
    join site on site.a = sup.a
    where sup.name not in (select name from model_rows)
      and length(site.description) > 80
      and (sup.category = (select category from head) or sup.section = (select section from head))
    order by sup.name, site.name
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
               'siteDescription', e.site_description))
      from examples e
    ), '[]'::jsonb),
    'siteCategories', coalesce((
      select jsonb_agg(distinct site.path) from site where site.path is not null
    ), '[]'::jsonb)
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


-- Перевірка після застосування:
--   select count(*), count(*) filter (where is_new) from tosho.site_listing_candidates('totobi.com.ua');
--   select id, public, file_size_limit from storage.buckets where id = 'site-listing-exports';
