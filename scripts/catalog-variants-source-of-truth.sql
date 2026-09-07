-- Варіанти живуть у таблиці, а не в JSON — REQ-178#p9 (переворот напрямку).
--
-- ЩО БУЛО. REQ-250#p1 завів `tosho.catalog_variants` і наповнив її тригером із
-- `catalog_models.metadata.variants`, свідомо лишивши JSON джерелом правди: три
-- місця застосунку писали metadata, і переписати їх усі одним заходом означало
-- вікно, у якому таблиця й JSON розходяться. Тригер те вікно закривав.
--
-- ЩО ЗМІНИЛОСЬ. Усі три писарі переведені на таблицю (редактор каталогу, клон
-- моделі, створення товару з вікна прорахунку), і жоден читач до JSON більше не
-- ходить. Отже 662 кБ у `metadata` — уже не джерело, а друга копія тих самих
-- 440 рядків. Копія, яку ніхто не оновлює, гниє: саме так і зникають дані.
--
-- ЧОМУ ТРИГЕР ЛИШАЄТЬСЯ, А НЕ ЗНИКАЄ РАЗОМ ІЗ JSON. Код і схема їдуть різними
-- дорогами: цей файл застосовується руками, код — пушем, і між ними завжди є
-- проміжок. Якби тригер просто прибрали, у тому проміжку старий код писав би
-- `metadata.variants` уже без дзеркала — і правки кольорів тихо не доїжджали б
-- до таблиці. Тому тригер лишається, але з новою умовою: він мовчить, коли в
-- metadata ключа `variants` НЕМАЄ взагалі.
--
-- Ця умова робить порядок застосування неважливим:
--   • новий код пише рядки й metadata БЕЗ ключа → тригер спить, рядки цілі;
--   • старий код пише metadata З ключем        → тригер дзеркалить, як раніше.
-- Без неї відсутній ключ читався б як «кольорів немає» і тригер ВИДАЛИВ БИ всі
-- рядки моделі — а разом з ними, через `on delete set null`, і пам'ять
-- прорахунків про проданий колір.
--
-- ЗВІРЕНО ПЕРЕД ЗНЯТТЯМ КОПІЇ (прод, 07.09.2026): 440 варіантів у JSON, 440
-- рядків у таблиці, нуль відсутніх, нуль розбіжностей у name/sku, нуль — у
-- шляху картинки. Єдина розбіжність — один варіант, у якого в JSON є imageUrl,
-- але немає imageAsset; його шлях відновлюється з самої адреси (нижче), інакше
-- він утратив би картинку.
--
-- Тригер прибереться окремим файлом, коли новий код відстоїть на проді.
--
-- Ідемпотентний: повторний прогін нічого не дублює.
--
-- Одна транзакція — від `npm run db:apply` (psql -1); свого `begin` тут немає
-- навмисно: він закривав би її раніше й ламав атомарність усього файлу.

\set ON_ERROR_STOP on

-- ── 1. Тригер мовчить, коли ключа `variants` немає ───────────────────────────
create or replace function tosho.sync_catalog_variants()
returns trigger
language plpgsql
security definer
set search_path = tosho, pg_catalog
as $fn$
declare
  incoming jsonb;
begin
  -- Ключа немає — писав НОВИЙ код, який уже поклав рядки сам. Мовчимо.
  -- Порожній масив — це інша річ: так старий код каже «кольорів більше немає».
  if new.metadata is null or not (new.metadata ? 'variants') then
    return new;
  end if;

  incoming := case
    when jsonb_typeof(new.metadata->'variants') = 'array' then new.metadata->'variants'
    else '[]'::jsonb
  end;

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
  'Сумісність зі старим кодом (REQ-178#p9): дзеркалить metadata.variants у catalog_variants, '
  'але ТІЛЬКИ коли ключ variants у metadata є. Джерело правди — таблиця; прибрати, '
  'коли новий код відстоїть на проді.';

-- ── 2. Один варіант має адресу картинки без asset — відновлюємо шлях ─────────
-- Без цього крок 3 забрав би в нього єдине посилання на файл. Адреса виду
-- .../object/public/<bucket>/<path>, де <path> може бути похідною __preview /
-- __thumb — знімаємо суфікс, бо в таблиці лежить шлях ОРИГІНАЛУ.
update tosho.catalog_variants v
   set image_bucket = split_part(src.rest, '/', 1),
       image_path   = regexp_replace(
                        substring(src.rest from position('/' in src.rest) + 1),
                        '(__preview|__thumb)\.webp$', '.webp'),
       updated_at   = now()
  from (
    select (e.value->>'id')::uuid as id,
           substring(e.value->>'imageUrl' from '/object/public/(.*)$') as rest
      from tosho.catalog_models m,
           lateral jsonb_array_elements(coalesce(m.metadata->'variants', '[]'::jsonb)) e
     where nullif(trim(e.value->'imageAsset'->>'path'), '') is null
       and e.value->>'imageUrl' like '%/object/public/%'
  ) src
 where v.id = src.id
   and src.rest is not null
   and v.image_path is null;

-- ── 3. Друга копія знімається ────────────────────────────────────────────────
-- Тригер із кроку 1 на цей update не спрацює на видалення: після `- 'variants'`
-- ключа в metadata немає, тобто спрацьовує рання відмова. Саме тому крок 1 має
-- стояти ПЕРЕД кроком 3 — інакше цей рядок стер би всі 440 рядків таблиці.
update tosho.catalog_models
   set metadata = metadata - 'variants'
 where metadata ? 'variants';
