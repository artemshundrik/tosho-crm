-- Команда 2.0 — Фаза 1: статуси відсутностей, річні квоти, аудит, баланси.
--
-- Дизайн: docs/TEAM_ABSENCES_DESIGN.md (рішення CEO 2026-08-01).
--   · квоти на рік: відпустка 18 / day-off 6 / лікарняні 10;
--   · списуються ЛИШЕ робочі дні (пн–пт, скориговані ua_workday_exceptions);
--   · залишки приватні: свої бачить кожен, усі — лише owner / SEO;
--   · погодження (Фаза 2) вирішує SEO, owner теж може.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/team-absences-quotas.sql

begin;

-- =====================================================================
-- 1. team_absences: воркфлоу-колонки
--    Легасі-рядки (їх вносили owner/SEO вручну) — одразу 'approved', тож
--    календар і норми дизайнерів не змінюють поведінку після міграції.
-- =====================================================================
alter table tosho.team_absences add column if not exists status text not null default 'approved';
alter table tosho.team_absences add column if not exists requested_by uuid;
alter table tosho.team_absences add column if not exists decided_by uuid;
alter table tosho.team_absences add column if not exists decided_at timestamptz;
alter table tosho.team_absences add column if not exists decision_comment text;

update tosho.team_absences set status = 'approved' where status is null or status = '';

alter table tosho.team_absences drop constraint if exists team_absences_status_chk;
alter table tosho.team_absences
  add constraint team_absences_status_chk
  check (status in ('pending', 'approved', 'declined', 'cancelled'));

-- Заявник за замовчуванням = той, хто створив рядок (для легасі).
update tosho.team_absences set requested_by = created_by where requested_by is null;

comment on column tosho.team_absences.status is
  'pending → approved | declined; cancelled = заявник відкликав. Норми дизайнерів рахують ЛИШЕ approved.';

-- Планер і інбокс завжди питають «цей воркспейс + ці статуси + цей діапазон».
create index if not exists team_absences_workspace_status_idx
  on tosho.team_absences (workspace_id, status, start_date, end_date);

-- =====================================================================
-- 2. Річні квоти на людину
-- =====================================================================
create table if not exists tosho.team_absence_quotas (
  workspace_id  uuid not null,
  user_id       uuid not null,
  year          int  not null,
  vacation_days int  not null default 18,
  day_off_days  int  not null default 6,
  sick_days     int  not null default 10,
  updated_by    uuid,
  updated_at    timestamptz not null default timezone('utc', now()),
  primary key (workspace_id, user_id, year)
);

alter table tosho.team_absence_quotas drop constraint if exists team_absence_quotas_positive_chk;
alter table tosho.team_absence_quotas
  add constraint team_absence_quotas_positive_chk
  check (vacation_days >= 0 and day_off_days >= 0 and sick_days >= 0);

comment on table tosho.team_absence_quotas is
  'Річні ліміти відсутностей у РОБОЧИХ днях. Рядка може не бути — тоді діють дефолти 18/6/10.';

create or replace function tosho.touch_team_absence_quotas_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists team_absence_quotas_touch_updated_at on tosho.team_absence_quotas;
create trigger team_absence_quotas_touch_updated_at
before update on tosho.team_absence_quotas
for each row execute function tosho.touch_team_absence_quotas_updated_at();

alter table tosho.team_absence_quotas enable row level security;

-- Читає: сам про себе АБО owner/SEO про всіх. Це і є приватність залишків.
drop policy if exists "team_absence_quotas_select" on tosho.team_absence_quotas;
create policy "team_absence_quotas_select"
on tosho.team_absence_quotas
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absence_quotas.workspace_id
      and mv.user_id = auth.uid()
      and (
        team_absence_quotas.user_id = auth.uid()
        or lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

-- Пише: лише owner/SEO (ліміти — управлінське рішення).
drop policy if exists "team_absence_quotas_write" on tosho.team_absence_quotas;
create policy "team_absence_quotas_write"
on tosho.team_absence_quotas
for all
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absence_quotas.workspace_id
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
    where mv.workspace_id = team_absence_quotas.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

grant select, insert, update, delete on tosho.team_absence_quotas to authenticated;
grant select, insert, update, delete on tosho.team_absence_quotas to service_role;
revoke all on tosho.team_absence_quotas from anon;

-- =====================================================================
-- 3. Аудит рішень (Фаза 2 пише сюди із service-role функції)
-- =====================================================================
create table if not exists tosho.team_absence_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  absence_id    uuid not null,
  action        text not null,
  actor_user_id uuid,
  payload       jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default timezone('utc', now())
);

create index if not exists team_absence_events_absence_idx
  on tosho.team_absence_events (absence_id, created_at desc);

comment on table tosho.team_absence_events is
  'Слід рішень по відсутностях: requested / approved / declined / cancelled. Пише лише service-role функція.';

alter table tosho.team_absence_events enable row level security;

-- Читають owner/SEO; писати з фронта не можна взагалі (лише service_role).
drop policy if exists "team_absence_events_select" on tosho.team_absence_events;
create policy "team_absence_events_select"
on tosho.team_absence_events
for select
to authenticated
using (
  exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absence_events.workspace_id
      and mv.user_id = auth.uid()
      and (
        lower(coalesce(mv.access_role::text, '')) = 'owner'
        or lower(coalesce(mv.job_role::text, '')) = 'seo'
      )
  )
);

grant select on tosho.team_absence_events to authenticated;
grant select, insert on tosho.team_absence_events to service_role;
revoke all on tosho.team_absence_events from anon;

-- =====================================================================
-- 4. Баланси: квота, використано, залишок — по трьох типах за рік.
--
--    SECURITY DEFINER, бо треба зчитати квоти всієї команди для owner/SEO,
--    але сама функція і є гейтом приватності: не-owner/SEO отримує РІВНО
--    один рядок — свій. Голого select по квотах фронт не робить.
--
--    «Використано» = кількість УНІКАЛЬНИХ робочих днів у approved-записах,
--    що припадають на рік: вихідні всередині відпустки ліміт не їдять
--    (рішення CEO), а перекриття двох записів не рахується двічі.
-- =====================================================================
create or replace function tosho.team_absence_balances(p_year int)
returns table (
  user_id        uuid,
  vacation_quota int,
  vacation_used  int,
  day_off_quota  int,
  day_off_used   int,
  sick_quota     int,
  sick_used      int
)
language plpgsql
stable
security definer
set search_path to 'tosho', 'public'
as $$
declare
  v_workspace uuid;
  v_is_admin  boolean := false;
  v_from      date := make_date(p_year, 1, 1);
  v_to        date := make_date(p_year, 12, 31);
begin
  select mv.workspace_id,
         (
           lower(coalesce(mv.access_role::text, '')) = 'owner'
           or lower(coalesce(mv.job_role::text, '')) = 'seo'
         )
    into v_workspace, v_is_admin
  from tosho.memberships_view mv
  where mv.user_id = auth.uid()
  limit 1;

  if v_workspace is null then
    return; -- не член воркспейсу (або заблокований) — порожньо
  end if;

  return query
  with visible as (
    select mv.user_id as uid
    from tosho.memberships_view mv
    where mv.workspace_id = v_workspace
      and (v_is_admin or mv.user_id = auth.uid())
  ),
  spent as (
    select distinct
      a.user_id as uid,
      a.kind    as kind,
      d::date   as day
    from tosho.team_absences a
    join visible v on v.uid = a.user_id
    cross join lateral generate_series(
      greatest(a.start_date, v_from),
      least(a.end_date, v_to),
      interval '1 day'
    ) as d
    where a.workspace_id = v_workspace
      and a.status = 'approved'
      and a.start_date <= v_to
      and a.end_date >= v_from
  ),
  business as (
    select s.uid, s.kind
    from spent s
    left join tosho.ua_workday_exceptions ex
      on ex.workspace_id = v_workspace
     and ex.day = s.day
    where coalesce(ex.is_workday, extract(isodow from s.day) between 1 and 5)
  ),
  used as (
    select
      b.uid,
      count(*) filter (where b.kind = 'vacation')::int   as vacation_used,
      count(*) filter (where b.kind = 'day_off')::int    as day_off_used,
      count(*) filter (where b.kind = 'sick_leave')::int as sick_used
    from business b
    group by b.uid
  )
  select
    v.uid,
    coalesce(q.vacation_days, 18)::int,
    coalesce(u.vacation_used, 0)::int,
    coalesce(q.day_off_days, 6)::int,
    coalesce(u.day_off_used, 0)::int,
    coalesce(q.sick_days, 10)::int,
    coalesce(u.sick_used, 0)::int
  from visible v
  left join tosho.team_absence_quotas q
    on q.workspace_id = v_workspace
   and q.user_id = v.uid
   and q.year = p_year
  left join used u on u.uid = v.uid;
end;
$$;

comment on function tosho.team_absence_balances(int) is
  'Квоти/використано/залишок за рік у робочих днях. Не-owner/SEO бачить рівно свій рядок — це гейт приватності залишків.';

revoke all on function tosho.team_absence_balances(int) from public;
revoke all on function tosho.team_absence_balances(int) from anon;
grant execute on function tosho.team_absence_balances(int) to authenticated;
grant execute on function tosho.team_absence_balances(int) to service_role;

notify pgrst, 'reload schema';

commit;
