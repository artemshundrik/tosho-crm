-- =====================================================================
-- Свята України + перехід відпустки на КАЛЕНДАРНІ дні (рішення CEO 2026-08-03)
--
-- 1. Календар свят у tosho.ua_workday_exceptions.
--    Вносимо ЛИШЕ ті свята, що припадають на робочі дні (пн–пт) — субота й
--    неділя і так неробочі, зайвий рядок нічого не змінює.
--
--    ВАЖЛИВО ПРО ГЛИБИНУ: цей же календар рахує норми дизайнерів
--    (src/lib/designerPayroll.ts), а виплати за січень–червень 2026 уже
--    зафіксовані. Тому свята першої половини 2026 (01.01, 01.05, 08.05,
--    15.07) СВІДОМО НЕ ВНОСИМО — інакше норми за закриті місяці
--    перерахувались би й дашборд розійшовся б із виплаченим.
--
--    Юридична примітка: під час воєнного стану ст. 73 КЗпП не застосовується,
--    тобто державних свят офіційно немає. Ці дні — рішення роботодавця дати
--    команді відпочинок, і саме тому вони живуть у таблиці винятків, а не
--    зашиті в код.
--
-- 2. Відпустка переходить на КАЛЕНДАРНІ дні, квота 24 (ст. 75 КЗпП).
--    Day-off і лікарняний лишаються в РОБОЧИХ днях — це відгул і хвороба в
--    робочий день, календарна арифметика там не має сенсу.
--    Свята всередині відпустки до неї НЕ входять (ст. 78 КЗпП) — тому
--    рахунок «календарні мінус явні неробочі винятки».
--
-- 3. Квоти: 24 / 5 / 10. Для 2026 day-off = 3 — практику запровадили в
--    серпні, тож на залишок року дається пропорційна частина.
--
-- Застосування: psql "$BACKUP_DB_URL" -v ON_ERROR_STOP=1 -f scripts/ua-holidays-and-calendar-quotas.sql
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Свята
-- ---------------------------------------------------------------------
insert into tosho.ua_workday_exceptions (workspace_id, day, is_workday, note)
select w.workspace_id, h.day, false, h.note
from (values
  -- 2026 — лише те, що попереду (див. примітку про закриті виплати)
  (date '2026-08-24', 'День Незалежності'),
  (date '2026-10-01', 'День захисників і захисниць'),
  (date '2026-12-25', 'Різдво Христове'),
  -- 2027 — повний рік; вихідні свята (01.05, 02.05 Великдень, 08.05,
  -- 20.06 Трійця, 25.12) не вносимо, вони й так неробочі
  (date '2027-01-01', 'Новий рік'),
  (date '2027-03-08', 'Міжнародний жіночий день'),
  (date '2027-06-28', 'День Конституції України'),
  (date '2027-07-15', 'День Української Державності'),
  (date '2027-08-24', 'День Незалежності'),
  (date '2027-10-01', 'День захисників і захисниць')
) as h(day, note)
cross join (select distinct workspace_id from tosho.memberships_view) as w
on conflict (workspace_id, day) do update
  set is_workday = excluded.is_workday,
      note = excluded.note;

-- ---------------------------------------------------------------------
-- 2. Робочі дні діапазону — БЕЗ ЗМІН (day-off, лікарняний, норми)
--    Лишається як було: пн–пт, скориговані винятками.
-- ---------------------------------------------------------------------

-- Календарні дні відпустки: рахуємо КОЖЕН день діапазону, окрім тих, що
-- явно позначені неробочими (свята). Вихідні всередині відпустки квоту
-- ЇДЯТЬ — у цьому й різниця з робочою моделлю.
create or replace function tosho.count_absence_calendar_days(_workspace uuid, _from date, _to date)
returns int
language sql
stable
security definer
set search_path to 'tosho', 'public'
as $$
  select coalesce(count(*), 0)::int
  from generate_series(_from, _to, interval '1 day') as d
  left join tosho.ua_workday_exceptions ex
    on ex.workspace_id = _workspace
   and ex.day = d::date
  where _to >= _from
    -- Свято у відпустку не входить (ст. 78 КЗпП). Звичайний вихідний —
    -- входить, бо його ніхто винятком не позначав.
    and coalesce(ex.is_workday, true);
$$;

revoke all on function tosho.count_absence_calendar_days(uuid, date, date) from public;
revoke all on function tosho.count_absence_calendar_days(uuid, date, date) from anon;
grant execute on function tosho.count_absence_calendar_days(uuid, date, date) to authenticated, service_role;

-- Одна точка правди «скільки днів з'їсть ця відсутність»: одиниця залежить
-- від типу, і саме тут це рішення живе для всієї БД.
create or replace function tosho.count_absence_quota_days(_workspace uuid, _kind text, _from date, _to date)
returns int
language sql
stable
security definer
set search_path to 'tosho', 'public'
as $$
  select case
    when _kind = 'vacation' then tosho.count_absence_calendar_days(_workspace, _from, _to)
    else tosho.count_absence_business_days(_workspace, _from, _to)
  end;
$$;

revoke all on function tosho.count_absence_quota_days(uuid, text, date, date) from public;
revoke all on function tosho.count_absence_quota_days(uuid, text, date, date) from anon;
grant execute on function tosho.count_absence_quota_days(uuid, text, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Баланси: відпустка в календарних, решта в робочих
--
--    Змінилась одна CTE — `business` стала `counted`: для vacation день
--    рахується, якщо він НЕ позначений святом; для решти — якщо це робочий
--    день. Дефолти квот тут же: 24 / 5 / 10.
-- ---------------------------------------------------------------------
create or replace function tosho.team_absence_balances(p_year int)
returns table (
  user_id uuid,
  vacation_quota int, vacation_used int,
  day_off_quota int,  day_off_used int,
  sick_quota int,     sick_used int
)
language plpgsql
stable
security definer
set search_path to 'tosho', 'public'
as $fn$
declare
  v_workspace uuid;
  v_is_admin  boolean;
  v_from date := make_date(p_year, 1, 1);
  v_to   date := make_date(p_year, 12, 31);
begin
  select mv.workspace_id, (lower(coalesce(mv.access_role::text,'')) = 'owner'
         or lower(coalesce(mv.job_role::text,'')) = 'seo')
    into v_workspace, v_is_admin
  from tosho.memberships_view mv
  where mv.user_id = auth.uid()
  order by mv.created_at asc, mv.workspace_id asc
  limit 1;

  if v_workspace is null then
    return;
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
  counted as (
    select s.uid, s.kind
    from spent s
    left join tosho.ua_workday_exceptions ex
      on ex.workspace_id = v_workspace
     and ex.day = s.day
    where case
      -- Відпустка: календарні дні. Вихідні всередині ЇДЯТЬ квоту, свята —
      -- ні (ст. 78 КЗпП: святкові дні до відпустки не включаються).
      when s.kind = 'vacation' then coalesce(ex.is_workday, true)
      -- Day-off і лікарняний: як і раніше, лише робочі дні.
      else coalesce(ex.is_workday, extract(isodow from s.day) between 1 and 5)
    end
  ),
  used as (
    select
      c.uid,
      count(*) filter (where c.kind = 'vacation')::int   as vacation_used,
      count(*) filter (where c.kind = 'day_off')::int    as day_off_used,
      count(*) filter (where c.kind = 'sick_leave')::int as sick_used
    from counted c
    group by c.uid
  )
  select
    v.uid,
    coalesce(q.vacation_days, 24)::int,
    coalesce(u.vacation_used, 0)::int,
    coalesce(q.day_off_days, 5)::int,
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
$fn$;

comment on function tosho.team_absence_balances(int) is
  'Квоти/використано за рік. Відпустка — КАЛЕНДАРНІ дні (мінус свята, ст.78 КЗпП), day-off і лікарняний — робочі. Не-owner/SEO бачить рівно свій рядок — це гейт приватності залишків.';

-- ---------------------------------------------------------------------
-- 4. Квоти на 2026: day-off лише 3, бо практику запровадили в серпні.
--    Рядок ставимо всім, хто зараз у команді; з 2027 діють дефолти 24/5/10.
-- ---------------------------------------------------------------------
insert into tosho.team_absence_quotas (workspace_id, user_id, year, vacation_days, day_off_days, sick_days)
select mv.workspace_id, mv.user_id, 2026, 24, 3, 10
from tosho.memberships_view mv
left join tosho.team_member_profiles p
  on p.workspace_id = mv.workspace_id and p.user_id = mv.user_id
where coalesce(p.employment_status, 'active') not in ('inactive', 'rejected')
on conflict (workspace_id, user_id, year) do update
  set vacation_days = excluded.vacation_days,
      day_off_days  = excluded.day_off_days,
      sick_days     = excluded.sick_days;

commit;
