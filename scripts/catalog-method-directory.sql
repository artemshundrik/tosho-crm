-- Спільний довідник методів нанесення + чистка дублів (REQ-54)
--
-- Проблема. tosho.catalog_methods тримає метод як РЯДОК, що належить одному
-- виду товару. Унікальність була (kind_id, name) — посимвольна, тож «Уф», «УФ»
-- і «УФ » спокійно жили поруч. За рік це дало 206 рядків на ~25 справжніх
-- методів: «УФ-друк» у 8 написаннях, одруківки («УФ дрк», «т амподрук»,
-- «шоврон»), різнобій регістру в кожному новому виді.
--
-- Рішення. Назва методу переїжджає в довідник на всю компанію
-- (tosho.method_directory), а catalog_methods стає рядком «цей метод доступний
-- цьому виду» з посиланням на довідник. name лишається дзеркалом довідника —
-- це навмисно: усі наявні читачі (QuoteDetailsPage, DesignTaskPage,
-- orderRecords, tosho-ai) далі читають catalog_methods.name і нічого не знають
-- про зміну. Перейменування в довіднику тригер розносить по всіх видах.
--
-- Ключова властивість: захист стоїть у БАЗІ, а не в формі. Тригер прив'язує
-- будь-який вставлений рядок до довідника за нормалізованою назвою, а
-- unique (kind_id, directory_id) не дає завести той самий метод у вид двічі —
-- незалежно від того, який код пише: форма, імпорт із сайту постачальника чи
-- рука в SQL.
--
-- Скрипт ідемпотентний: повторний запуск нічого не ламає.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/catalog-method-directory.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Нормалізатор назви
-- ---------------------------------------------------------------------------
-- Знімає регістр, пробіли, дефіси й дужки: «УФ - друк», «уф друк», «Уф-друк»
-- дають один ключ. ё→е, бо трапляється в назвах з російської розкладки.
-- IMMUTABLE — щоб працювати в індексі й generated-колонці.
-- NB: НЕ використовуємо normalize()/NFKD — вона розкладає українську «й» на
-- «и»+діакритику й ламає кириличні порівняння (той самий баг, що колись з'їв
-- пошук за назвою компанії).
create or replace function tosho.normalize_method_name(p_name text)
returns text
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select nullif(lower(regexp_replace(translate(p_name, 'ёЁ', 'еЕ'), '[^[:alnum:]]+', '', 'g')), '')
$$;

comment on function tosho.normalize_method_name(text) is
  'Ключ порівняння назв методів нанесення: без регістру, пробілів і розділових знаків. Дзеркало normalizeMethodName() у src/lib/catalogMethodName.ts.';

-- ---------------------------------------------------------------------------
-- 2. Довідник методів (один на компанію)
-- ---------------------------------------------------------------------------
create table if not exists tosho.method_directory (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  name text not null,
  normalized_name text generated always as (tosho.normalize_method_name(name)) stored,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint method_directory_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists method_directory_team_norm_key
  on tosho.method_directory (team_id, normalized_name);

comment on table tosho.method_directory is
  'Довідник методів нанесення на всю компанію. catalog_methods посилається сюди; назва живе тут, у catalog_methods.name лежить її дзеркало.';

-- RLS: deny-by-default, читає й пише лише учасник команди. anon не отримує
-- нічого (на відміну від старих catalog_* таблиць, де anon:SELECT лишився
-- історично — це окрема задача).
alter table tosho.method_directory enable row level security;

drop policy if exists method_directory_team_read on tosho.method_directory;
create policy method_directory_team_read on tosho.method_directory
  for select using (is_team_member(team_id));

drop policy if exists method_directory_team_insert on tosho.method_directory;
create policy method_directory_team_insert on tosho.method_directory
  for insert with check (is_team_member(team_id));

drop policy if exists method_directory_team_update on tosho.method_directory;
create policy method_directory_team_update on tosho.method_directory
  for update using (is_team_member(team_id)) with check (is_team_member(team_id));

drop policy if exists method_directory_team_delete on tosho.method_directory;
create policy method_directory_team_delete on tosho.method_directory
  for delete using (is_team_member(team_id));

revoke all on tosho.method_directory from anon;
grant select, insert, update, delete on tosho.method_directory to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Журнал злиттів
-- ---------------------------------------------------------------------------
-- Злиття видаляє рядок методу, тож перед видаленням лишаємо слід: що з чим
-- звели, скільки товарів і позицій прорахунків переїхало.
create table if not exists tosho.catalog_method_merges (
  id uuid primary key default gen_random_uuid(),
  team_id uuid,
  kind_id uuid,
  loser_id uuid not null,
  loser_name text not null,
  winner_id uuid not null,
  winner_name text not null,
  moved_model_links integer not null default 0,
  moved_quote_items integer not null default 0,
  moved_order_items integer not null default 0,
  merged_at timestamptz not null default now()
);

alter table tosho.catalog_method_merges enable row level security;

drop policy if exists catalog_method_merges_team_read on tosho.catalog_method_merges;
create policy catalog_method_merges_team_read on tosho.catalog_method_merges
  for select using (is_team_member(team_id));

revoke all on tosho.catalog_method_merges from anon;
grant select on tosho.catalog_method_merges to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Посилання catalog_methods → довідник
-- ---------------------------------------------------------------------------
alter table tosho.catalog_methods
  add column if not exists directory_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'tosho.catalog_methods'::regclass
      and conname = 'catalog_methods_directory_id_fkey'
  ) then
    alter table tosho.catalog_methods
      add constraint catalog_methods_directory_id_fkey
      foreign key (directory_id) references tosho.method_directory(id) on delete restrict;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Заміна id методу в jsonb-позиціях
-- ---------------------------------------------------------------------------
-- quote_items.methods і order_items.methods тримають масив об'єктів з
-- method_id БЕЗ зовнішнього ключа й без назви. Тому переносити товари на
-- правильний метод можна лише тут, у базі: інтерфейс не дає видалити метод,
-- який згадується в прорахунках (і правильно робить).
create or replace function tosho.swap_method_id(p_methods jsonb, p_from uuid, p_to uuid)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_methods is null or jsonb_typeof(p_methods) <> 'array' then p_methods
    else coalesce((
      select jsonb_agg(
               case when elem->>'method_id' = p_from::text
                    then jsonb_set(elem, '{method_id}', to_jsonb(p_to::text))
                    else elem end
               order by ord)
      from jsonb_array_elements(p_methods) with ordinality as t(elem, ord)
    ), p_methods)
  end
$$;

-- ---------------------------------------------------------------------------
-- 6. Злиття двох методів одного виду
-- ---------------------------------------------------------------------------
create or replace function tosho.merge_catalog_method(p_loser uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = tosho, pg_catalog
as $$
declare
  v_team uuid;
  v_kind uuid;
  v_loser_name text;
  v_winner_name text;
  v_winner_kind uuid;
  v_models integer := 0;
  v_quotes integer := 0;
  v_orders integer := 0;
begin
  if p_loser = p_winner then
    return;
  end if;

  -- Назви беремо з довідника, якщо прив'язка вже є: інакше в журналі осіла б
  -- та сама одруківка, заради якої все й затівалось.
  select m.team_id, m.kind_id, coalesce(d.name, m.name)
    into v_team, v_kind, v_loser_name
  from tosho.catalog_methods m
  left join tosho.method_directory d on d.id = m.directory_id
  where m.id = p_loser;
  if v_loser_name is null then
    return; -- уже злитий попереднім запуском
  end if;

  select m.kind_id, coalesce(d.name, m.name)
    into v_winner_kind, v_winner_name
  from tosho.catalog_methods m
  left join tosho.method_directory d on d.id = m.directory_id
  where m.id = p_winner;
  if v_winner_name is null then
    raise exception 'merge_catalog_method: метод-переможець % не існує', p_winner;
  end if;
  if v_winner_kind is distinct from v_kind then
    raise exception 'merge_catalog_method: % і % належать різним видам товару', p_loser, p_winner;
  end if;

  select count(*) into v_models
  from tosho.catalog_model_methods where method_id = p_loser;

  insert into tosho.catalog_model_methods (model_id, method_id)
  select model_id, p_winner from tosho.catalog_model_methods where method_id = p_loser
  on conflict do nothing;

  delete from tosho.catalog_model_methods where method_id = p_loser;

  update tosho.quote_items
  set methods = tosho.swap_method_id(methods, p_loser, p_winner)
  where jsonb_typeof(methods) = 'array'
    and methods @> jsonb_build_array(jsonb_build_object('method_id', p_loser::text));
  get diagnostics v_quotes = row_count;

  update tosho.order_items
  set methods = tosho.swap_method_id(methods, p_loser, p_winner)
  where jsonb_typeof(methods) = 'array'
    and methods @> jsonb_build_array(jsonb_build_object('method_id', p_loser::text));
  get diagnostics v_orders = row_count;

  insert into tosho.catalog_method_merges
    (team_id, kind_id, loser_id, loser_name, winner_id, winner_name,
     moved_model_links, moved_quote_items, moved_order_items)
  values (v_team, v_kind, p_loser, v_loser_name, p_winner, v_winner_name,
          v_models, v_quotes, v_orders);

  delete from tosho.catalog_methods where id = p_loser;
end;
$$;

revoke all on function tosho.merge_catalog_method(uuid, uuid) from public, anon, authenticated;

comment on function tosho.merge_catalog_method(uuid, uuid) is
  'Зводить метод-дубль до канонічного всередині одного виду: переносить товари, позиції прорахунків і замовлень, пише в catalog_method_merges, видаляє дубль.';

-- ---------------------------------------------------------------------------
-- 7. Канонічні написання
-- ---------------------------------------------------------------------------
-- Ліворуч — нормалізований ключ того, що вже лежить у базі, праворуч — як це
-- має називатись. Чотири рядки (уфдрк, шоврон, шиврон, термотранфер) — це
-- одруківки: вони зводяться до сусіда з іншим ключем, тобто зникають як
-- окремий метод. Решта — вибір одного написання з кількох однакових.
--
-- Свідомо НЕ зведені (потребують рішення людини, а не скрипта): ДТФ vs DTF,
-- Шовкодрук vs Шовкотрафарет vs Трафаретний друк, Тампо vs Тамподрук,
-- УФ vs УФ-друк, Гравіювання vs Лазерне гравіювання, Смоляна наліпка vs
-- Смоляна шильда vs Шильда смоляна, ДТФ-друк vs ДТФ, УФ-ДТФ друк vs УФ-ДТФ.
create temporary table tmp_method_canon (norm text primary key, canonical text not null) on commit drop;

insert into tmp_method_canon (norm, canonical) values
  ('уфдрук',                                     'УФ-друк'),
  ('уфдрк',                                      'УФ-друк'),
  ('уф',                                         'УФ'),
  ('уфдтф',                                      'УФ-ДТФ'),
  ('уфдтфдрук',                                  'УФ-ДТФ друк'),
  ('уфdtf',                                      'УФ-DTF'),
  ('дтф',                                        'ДТФ'),
  ('дтфдрук',                                    'ДТФ-друк'),
  ('dtf',                                        'DTF'),
  ('тамподрук',                                  'Тамподрук'),
  ('тампо',                                      'Тампо'),
  ('вишивка',                                    'Вишивка'),
  ('3dвишивка',                                  '3D-вишивка'),
  ('шовкодрук',                                  'Шовкодрук'),
  ('шовкотрафарет',                              'Шовкотрафарет'),
  ('трафаретнийдрук',                            'Трафаретний друк'),
  ('гравіювання',                                'Гравіювання'),
  ('лазернегравіювання',                         'Лазерне гравіювання'),
  ('кольороведзеркальнегравіювання',             'Кольорове дзеркальне гравіювання'),
  ('сублімація',                                 'Сублімація'),
  ('сублімація44',                               'Сублімація 4+4'),
  ('сублімація40',                               'Сублімація 4+0'),
  ('шеврон',                                     'Шеврон'),
  ('шоврон',                                     'Шеврон'),
  ('шиврон',                                     'Шеврон'),
  ('наліпка',                                    'Наліпка'),
  ('смолянаналіпка',                             'Смоляна наліпка'),
  ('смолянашильда',                              'Смоляна шильда'),
  ('шильдасмоляна',                              'Шильда смоляна'),
  ('термотрансфер',                              'Термотрансфер'),
  ('термотранфер',                               'Термотрансфер'),
  ('термотрансферdtf',                           'Термотрансфер (DTF)'),
  ('термодрук',                                  'Термодрук'),
  ('цифровийдрук',                               'Цифровий друк'),
  ('офсетнийдрук',                               'Офсетний друк'),
  ('флекс',                                      'Флекс'),
  ('flexплівка',                                 'FLEX (плівка)'),
  ('флексодрук',                                 'Флексодрук'),
  ('флок',                                       'Флок'),
  ('деколь',                                     'Деколь'),
  ('тиснення',                                   'Тиснення'),
  ('конгревтиснення',                            'Конгрев (тиснення)'),
  ('тисненнязфольгою',                           'Тиснення з фольгою'),
  ('етикеткабрендована',                         'Етикетка брендована'),
  ('можливістьнанесеннядзеркальногогравіювання', 'Можливість нанесення дзеркального гравіювання')
on conflict (norm) do nothing;

-- Усе, чого немає в списку вище (з'явилось після написання скрипта), бере
-- найпоширеніше написання зі своєї ж групи.
insert into tmp_method_canon (norm, canonical)
select distinct on (tosho.normalize_method_name(m.name))
       tosho.normalize_method_name(m.name),
       m.name
from tosho.catalog_methods m
where tosho.normalize_method_name(m.name) is not null
  and not exists (select 1 from tmp_method_canon c where c.norm = tosho.normalize_method_name(m.name))
order by tosho.normalize_method_name(m.name), count(*) over (partition by m.name) desc, m.name
on conflict (norm) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Наповнення довідника і прив'язка
-- ---------------------------------------------------------------------------
-- Тригер знімаємо на час переливання: він забороняє міняти назву в окремому
-- виді, а кроки 8–10 роблять саме це. Ставимо назад у кроці 12 (усе в одній
-- транзакції, тож для інших сесій вікна без захисту не існує).
drop trigger if exists catalog_methods_bind_directory on tosho.catalog_methods;

insert into tosho.method_directory (team_id, name)
select distinct m.team_id, c.canonical
from tosho.catalog_methods m
join tmp_method_canon c on c.norm = tosho.normalize_method_name(m.name)
on conflict (team_id, normalized_name) do nothing;

update tosho.catalog_methods m
set directory_id = d.id
from tmp_method_canon c
join tosho.method_directory d
  on d.normalized_name = tosho.normalize_method_name(c.canonical)
where c.norm = tosho.normalize_method_name(m.name)
  and d.team_id = m.team_id
  and m.directory_id is distinct from d.id;

-- ---------------------------------------------------------------------------
-- 9. Злиття дублів усередині виду
-- ---------------------------------------------------------------------------
-- Переможець — той, кого більше використовують (товари + позиції прорахунків),
-- за рівності — старіший рядок. Так менше рядків доводиться переписувати.
do $$
declare
  r record;
begin
  for r in
    with usage as (
      select m.id, m.kind_id, m.directory_id, m.created_at,
             (select count(*) from tosho.catalog_model_methods cm where cm.method_id = m.id)
             + (select count(*) from tosho.quote_items qi
                where jsonb_typeof(qi.methods) = 'array'
                  and qi.methods @> jsonb_build_array(jsonb_build_object('method_id', m.id::text))) as weight
      from tosho.catalog_methods m
      where m.directory_id is not null
    ),
    ranked as (
      select id, kind_id, directory_id,
             first_value(id) over (partition by kind_id, directory_id order by weight desc, created_at asc, id asc) as winner_id
      from usage
    )
    select id as loser_id, winner_id from ranked where id <> winner_id
  loop
    perform tosho.merge_catalog_method(r.loser_id, r.winner_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Назва = дзеркало довідника
-- ---------------------------------------------------------------------------
update tosho.catalog_methods m
set name = d.name, updated_at = now()
from tosho.method_directory d
where d.id = m.directory_id and m.name is distinct from d.name;

-- ---------------------------------------------------------------------------
-- 11. Замок: один метод на вид, і лише через довідник
-- ---------------------------------------------------------------------------
alter table tosho.catalog_methods alter column directory_id set not null;

create unique index if not exists catalog_methods_kind_directory_key
  on tosho.catalog_methods (kind_id, directory_id);

create index if not exists catalog_methods_directory_idx
  on tosho.catalog_methods (directory_id);

-- Стару посимвольну унікальність (kind_id, name) лишаємо: вона тепер зайва,
-- але й не заважає — назва однаково приходить з довідника.

-- ---------------------------------------------------------------------------
-- 12. Тригери: прив'язка при вставці та розсилка перейменування
-- ---------------------------------------------------------------------------
-- Найважливіша частина. Будь-який код, що вставляє метод за назвою (форма
-- каталогу, імпорт із сайту постачальника, ручний SQL), отримує прив'язку до
-- довідника автоматично, а назву — канонічну. Забути новий шлях запису
-- неможливо: правило стоїть під ним усім.
--
-- Наслідок, про який треба пам'ятати: update catalog_methods set name = '…'
-- більше нічого не міняє — назву поверне довідник. Перейменування робиться
-- через method_directory.name, і воно свідомо глобальне (одна назва на всю
-- CRM). Форма каталогу перероблена саме так.
create or replace function tosho.catalog_methods_bind_directory()
returns trigger
language plpgsql
set search_path = tosho, pg_catalog
as $$
declare
  v_norm text;
  v_id uuid;
  v_canonical text;
begin
  if new.directory_id is null then
    v_norm := tosho.normalize_method_name(new.name);
    if v_norm is null then
      raise exception 'Назва методу не може бути порожньою';
    end if;

    select id into v_id from tosho.method_directory
    where team_id = new.team_id and normalized_name = v_norm;

    if v_id is null then
      insert into tosho.method_directory (team_id, name)
      values (new.team_id, btrim(regexp_replace(new.name, '\s+', ' ', 'g')))
      on conflict (team_id, normalized_name) do update set updated_at = now()
      returning id into v_id;
    end if;

    new.directory_id := v_id;
  end if;

  select name into v_canonical from tosho.method_directory where id = new.directory_id;

  -- Спроба перейменувати метод «на місці» більше не має сенсу: назва спільна.
  -- Мовчки ігнорувати таке — найгірший варіант (форма показала б успіх, а в базі
  -- нічого), тож падаємо з поясненням. Нова форма каталогу перейменовує довідник.
  --
  -- Звірка саме з назвою довідника, а не просто «name змінився»: інакше під цей
  -- виняток потрапляє і власне розсилання нової назви тригером
  -- method_directory_sync_name, і перейменування в довіднику стає неможливим.
  -- Саме на цьому воно й зламалось при першій перевірці.
  if tg_op = 'UPDATE'
     and new.directory_id = old.directory_id
     and new.name is distinct from old.name
     and new.name is distinct from v_canonical then
    raise exception 'Назва методу нанесення тепер спільна для всієї CRM: перейменування робиться в довіднику методів (tosho.method_directory), а не в окремому виді товару.'
      using errcode = 'check_violation';
  end if;

  new.name := v_canonical;
  return new;
end;
$$;

drop trigger if exists catalog_methods_bind_directory on tosho.catalog_methods;
create trigger catalog_methods_bind_directory
  before insert or update on tosho.catalog_methods
  for each row execute function tosho.catalog_methods_bind_directory();

create or replace function tosho.method_directory_touch()
returns trigger
language plpgsql
set search_path = tosho, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists method_directory_touch on tosho.method_directory;
create trigger method_directory_touch
  before update on tosho.method_directory
  for each row execute function tosho.method_directory_touch();

-- Саме AFTER, а не BEFORE: у BEFORE-тригері рядок довідника ще не оновлений, і
-- дзеркалення в catalog_methods підтягнуло б стару назву назад.
create or replace function tosho.method_directory_sync_name()
returns trigger
language plpgsql
set search_path = tosho, pg_catalog
as $$
begin
  if new.name is distinct from old.name then
    update tosho.catalog_methods
    set name = new.name, updated_at = now()
    where directory_id = new.id and name is distinct from new.name;
  end if;
  return null;
end;
$$;

drop trigger if exists method_directory_sync_name on tosho.method_directory;
create trigger method_directory_sync_name
  after update on tosho.method_directory
  for each row execute function tosho.method_directory_sync_name();

commit;
