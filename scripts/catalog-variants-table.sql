-- Варіант товару (колір) стає рядком, а не елементом JSON — REQ-250#p1.
--
-- ЩО БУЛО НЕ ТАК. 440 варіантів лежали в `catalog_models.metadata.variants`, і
-- в кожного вже був свій UUID — вони давно хотіли бути рядками. Наслідок був не
-- косметичний: `quote_items` посилається лише на модель, тож CRM НЕ ЗНАЛА,
-- який колір продали, хоч замовляють у постачальника саме за артикулом кольору.
-- Заразом пошук за артикулом варіанта довелось закривати генерованою колонкою
-- `catalog_models.search_skus` (REQ-248) — обходом відсутньої таблиці.
--
-- ЧОМУ ВАРІАНТ = КОЛІР, А НЕ «КОЛІР + РОЗМІР». Перевірено на живому avanprint
-- 04.09.2026: у товару один перемикач — колір, і він міняє АРТИКУЛ, не ціну
-- (футболка TSRA170: `-WH` → `-NY`, 312,60 в обох). Розмір варіантом не є
-- взагалі — лежить рядком в описі («розміри: XS - 5XL») і свого артикула не
-- має; те саме на взутті, де розмір мав би важити найбільше (чоботи LITMAN —
-- один артикул `L-755-XEB`, одна ціна). Тому полів під розмір тут немає.
--
-- ЧОМУ ТАБЛИЦЮ НАПОВНЮЄ ТРИГЕР, А НЕ ЗАСТОСУНОК. Моделі пишуть три різні місця
-- (сторінка «Каталог», товар за посиланням, фонова розвідка імпорту), і всі
-- вони пишуть `metadata`. Переписати їх усі одним заходом — це велика зміна з
-- вікном, у якому таблиця й JSON розходяться. Тригер знімає це питання: поки
-- JSON лишається джерелом правди, розійтись вони НЕ МОЖУТЬ. Напрямок
-- перевернеться окремим кроком, коли писатимуть уже в таблицю.
--
-- ID БЕРЕМО НАЯВНІ. Усі 440 варіантів мають унікальні UUID (перевірено:
-- 440 значень, 440 різних, жодного не-UUID), тож переїзд безшовний і
-- `quote_items.catalog_variant_id` переживе будь-яку правку моделі.
--
-- ОДИН ШЛЯХ ЗАМІСТЬ П'ЯТИ URL. У JSON кожен варіант ніс `imageUrl` плюс
-- `imageAsset.{path, thumbUrl, previewUrl, originalUrl}` — п'ять майже
-- однакових рядків із того самого префікса. Це 563 кБ із 660 усієї ваги
-- варіантів. Тут лишається `image_bucket` + `image_path`, решта виводиться в
-- коді (`src/lib/catalogVariantImage.ts`).
--
-- Ідемпотентний: повторний прогін нічого не дублює.
--
-- Одна транзакція — від `npm run db:apply` (psql -1); свого `begin` тут немає
-- навмисно: він закривав би її раніше й ламав атомарність усього файлу.

\set ON_ERROR_STOP on

create table if not exists tosho.catalog_variants (
  id           uuid primary key,
  team_id      uuid not null,
  model_id     uuid not null references tosho.catalog_models(id) on delete cascade,
  name         text not null,
  sku          text,
  image_bucket text,
  image_path   text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table tosho.catalog_variants is
  'Варіанти (кольори) моделі каталогу — REQ-250#p1. Наповнюється тригером із '
  'catalog_models.metadata.variants; напрямок перевернеться окремим кроком.';

create unique index if not exists catalog_variants_model_name_key
  on tosho.catalog_variants (model_id, lower(name));
create index if not exists catalog_variants_model_idx on tosho.catalog_variants (model_id);
create index if not exists catalog_variants_team_idx on tosho.catalog_variants (team_id);
-- Пошук за артикулом кольору (REQ-248): те, заради чого все й затівалось.
create index if not exists catalog_variants_sku_trgm
  on tosho.catalog_variants using gin (sku public.gin_trgm_ops);

-- ── RLS: рівно як у catalog_models ───────────────────────────────────────────
alter table tosho.catalog_variants enable row level security;

-- Supabase роздає новим таблицям грант anon за замовчуванням. RLS і так віддала
-- б нуль рядків, але саме пара «грант anon + в'юха без security_invoker» дала
-- витік P0 у липні, тож грант знімаємо: у catalog_models його немає, і тут не
-- має бути. Каталог до логіна нікому не потрібен.
revoke all on tosho.catalog_variants from anon;

drop policy if exists catalog_variants_select on tosho.catalog_variants;
drop policy if exists catalog_variants_insert on tosho.catalog_variants;
drop policy if exists catalog_variants_update on tosho.catalog_variants;
drop policy if exists catalog_variants_delete on tosho.catalog_variants;

create policy catalog_variants_select on tosho.catalog_variants
  for select using (public.is_team_member(team_id));
create policy catalog_variants_insert on tosho.catalog_variants
  for insert with check (public.is_team_member(team_id));
create policy catalog_variants_update on tosho.catalog_variants
  for update using (public.is_team_member(team_id)) with check (public.is_team_member(team_id));
create policy catalog_variants_delete on tosho.catalog_variants
  for delete using (public.is_team_member(team_id));

-- ── Позиція прорахунку нарешті знає колір ────────────────────────────────────
-- `set null`, а не `cascade`: якщо колір прибрали з каталогу, позиція має
-- лишитись — прорахунок уже показали замовнику, і зникнути він не може.
alter table tosho.quote_items
  add column if not exists catalog_variant_id uuid
  references tosho.catalog_variants(id) on delete set null;

create index if not exists quote_items_catalog_variant_idx
  on tosho.quote_items (catalog_variant_id) where catalog_variant_id is not null;

comment on column tosho.quote_items.catalog_variant_id is
  'Який саме колір продали (REQ-250#p1). null — товар без каталогу або колір не вибрали.';

-- ── Синхронізація metadata.variants → catalog_variants ───────────────────────
create or replace function tosho.sync_catalog_variants()
returns trigger
language plpgsql
security definer
set search_path = tosho, pg_catalog
as $fn$
declare
  incoming jsonb := case
    when jsonb_typeof(new.metadata->'variants') = 'array' then new.metadata->'variants'
    else '[]'::jsonb
  end;
begin
  -- Прибираємо ті, яких у JSON більше немає. Позиції прорахунків це переживуть:
  -- у них `on delete set null`.
  delete from tosho.catalog_variants v
   where v.model_id = new.id
     and not exists (
       select 1 from jsonb_array_elements(incoming) e
        where (e.value->>'id')::uuid = v.id
     );

  insert into tosho.catalog_variants
    (id, team_id, model_id, name, sku, image_bucket, image_path, is_active, sort_order, updated_at)
  select (e.value->>'id')::uuid,
         new.team_id,
         new.id,
         coalesce(nullif(trim(e.value->>'name'), ''), 'Без назви'),
         nullif(trim(e.value->>'sku'), ''),
         nullif(trim(e.value->'imageAsset'->>'bucket'), ''),
         nullif(trim(e.value->'imageAsset'->>'path'), ''),
         coalesce((e.value->>'active')::boolean, true),
         (e.ordinality - 1)::int,
         now()
    from jsonb_array_elements(incoming) with ordinality e(value, ordinality)
   where (e.value->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  on conflict (id) do update set
    team_id      = excluded.team_id,
    model_id     = excluded.model_id,
    name         = excluded.name,
    sku          = excluded.sku,
    image_bucket = excluded.image_bucket,
    image_path   = excluded.image_path,
    is_active    = excluded.is_active,
    sort_order   = excluded.sort_order,
    updated_at   = now();

  return new;
end;
$fn$;

comment on function tosho.sync_catalog_variants() is
  'Тримає tosho.catalog_variants у згоді з catalog_models.metadata.variants (REQ-250#p1). '
  'security definer: пише три різні місця застосунку, і жодне з них не має знати про таблицю.';

drop trigger if exists catalog_models_sync_variants on tosho.catalog_models;
create trigger catalog_models_sync_variants
  after insert or update of metadata, team_id on tosho.catalog_models
  for each row execute function tosho.sync_catalog_variants();

-- ── Наповнення наявними даними ───────────────────────────────────────────────
-- `update ... set metadata = metadata` ганяє той самий тригер, тож правило
-- наповнення й правило подальшої синхронізації — буквально один код.
update tosho.catalog_models set metadata = metadata
 where jsonb_typeof(metadata->'variants') = 'array'
   and jsonb_array_length(metadata->'variants') > 0;
