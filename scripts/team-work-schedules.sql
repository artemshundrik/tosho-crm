-- REQ-166 · Постійний тижневий графік людини: які дні в офісі, які з дому.
--
-- ЩО ЛІКУЄ. «З дому» дотепер існувало лише як разовий рядок журналу
-- (tosho.team_absences): один запис = один діапазон дат. Щоб описати «вівторок
-- і п'ятниця — вдома, і так завжди», керівникові довелось би заводити по два
-- рядки щотижня без кінця. Запит прийшов від бухгалтерки, яка живе за Києвом.
--
-- ЗБЕРІГАЄМО ПАТЕРН, А НЕ РОЗГОРНУТІ ДНІ. Матеріалізація дала б ~100 рядків на
-- людину на рік, питання «до якої дати генеруємо» і біль зі зміною графіка
-- заднім числом. Один рядок = один період дії графіка; розгортає його клієнт
-- (src/lib/teamWorkSchedule.ts), віддаючи звичайні записи «з дому».
--
-- ЗОНА ДОСТУПУ ТА САМА, ЩО В ЖУРНАЛУ ВІДСУТНОСТЕЙ: читає будь-який учасник
-- воркспейсу (де хто працює — корисно всім), пише owner або СЕО. Графік
-- ставить керівник, тому статусу погодження тут немає взагалі.
--
-- Безпечно застосовувати повторно.

create table if not exists tosho.team_work_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  -- {"1":"office","2":"remote",...} — ключ це ISO-день тижня (1 = понеділок).
  -- jsonb, а не сім колонок: графік читається й пишеться цілком, а окремий
  -- «вівторок» ніколи не питають.
  days jsonb not null default '{}'::jsonb,
  effective_from date not null default current_date,
  -- null = діє до скасування. Графік міняють, а не накопичують: попередній
  -- закривають цією датою.
  effective_to date,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table tosho.team_work_schedules drop constraint if exists team_work_schedules_range_chk;
alter table tosho.team_work_schedules
  add constraint team_work_schedules_range_chk
  check (effective_to is null or effective_to >= effective_from);

-- Значення днів звіряємо в БАЗІ теж. Той самий урок, що з видами відсутностей:
-- значення, якого не знає жоден бік, мовчки перетворюється на сміття.
--
-- Через функцію, а не прямим підзапитом: check-констрейнт підзапитів не
-- приймає взагалі («cannot use subquery in check constraint»), а обійтись
-- самими операторами jsonb не вийшло — ключі відсіює `-`, а от значення без
-- обходу пар не перевірити.
create or replace function tosho.is_valid_work_schedule_days(days jsonb)
returns boolean
language sql
immutable
as $$
  select days is null
    or (
      -- жодного ключа поза днями тижня…
      days - array['1', '2', '3', '4', '5', '6', '7'] = '{}'::jsonb
      -- …і жодного значення поза двома режимами
      and not exists (
        select 1 from jsonb_each_text(days) as entry(key, value)
        where entry.value not in ('office', 'remote')
      )
    );
$$;

alter table tosho.team_work_schedules drop constraint if exists team_work_schedules_days_chk;
alter table tosho.team_work_schedules
  add constraint team_work_schedules_days_chk
  check (tosho.is_valid_work_schedule_days(days));

create index if not exists team_work_schedules_workspace_user_idx
  on tosho.team_work_schedules (workspace_id, user_id, effective_from desc);

create or replace function tosho.touch_team_work_schedules_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists team_work_schedules_touch_updated_at on tosho.team_work_schedules;
create trigger team_work_schedules_touch_updated_at
before update on tosho.team_work_schedules
for each row execute function tosho.touch_team_work_schedules_updated_at();

alter table tosho.team_work_schedules enable row level security;

drop policy if exists "team_work_schedules_select" on tosho.team_work_schedules;
create policy "team_work_schedules_select"
on tosho.team_work_schedules
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_work_schedules.workspace_id
      and mv.user_id = auth.uid()
  )
);

drop policy if exists "team_work_schedules_insert" on tosho.team_work_schedules;
create policy "team_work_schedules_insert"
on tosho.team_work_schedules
for insert
to authenticated
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_work_schedules.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_work_schedules_update" on tosho.team_work_schedules;
create policy "team_work_schedules_update"
on tosho.team_work_schedules
for update
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_work_schedules.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
)
with check (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_work_schedules.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

drop policy if exists "team_work_schedules_delete" on tosho.team_work_schedules;
create policy "team_work_schedules_delete"
on tosho.team_work_schedules
for delete
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_work_schedules.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

-- anon не дає нічого: графік — це персональні дані про режим роботи людини.
revoke all on tosho.team_work_schedules from anon;
grant select, insert, update, delete on tosho.team_work_schedules to authenticated;

notify pgrst, 'reload schema';
