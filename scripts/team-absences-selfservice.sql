-- Команда 2.0 — Фаза 2: самостійні заявки на відсутність.
--
-- Дизайн: docs/TEAM_ABSENCES_DESIGN.md.
--   · співробітник створює заявку сам → status='pending';
--   · вирішує SEO (owner теж може), заявку SEO вирішує owner — рішення йде
--     ЛИШЕ через netlify/functions/team-absence-request.ts (service role);
--   · лікарняний погодження не потребує — фіксується фактом одразу approved;
--   · свою заявку можна скасувати, поки вона на погодженні.
--
-- Ідемпотентна, безпечна до повторного запуску.
-- Застосування: psql "$BACKUP_DB_URL" -f scripts/team-absences-selfservice.sql

begin;


-- =====================================================================
-- 0. Робочі дні діапазону — спільний хелпер для гардів квоти.
--    Той самий календар, що в team_absence_balances: пн–пт, скориговані
--    ua_workday_exceptions.
-- =====================================================================
-- Робочий день у Києві, а не в UTC: сесія PostgREST живе в UTC, тож із 21:00
-- київського вечора `current_date` уже «завтра», і вікно ±днів з'їжджало.
create or replace function tosho.absence_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Europe/Kyiv')::date $$;

revoke all on function tosho.absence_today() from public;
grant execute on function tosho.absence_today() to authenticated, anon, service_role;

create or replace function tosho.count_absence_business_days(_workspace uuid, _from date, _to date)
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
    and coalesce(ex.is_workday, extract(isodow from d) between 1 and 5);
$$;

revoke all on function tosho.count_absence_business_days(uuid, date, date) from public;
revoke all on function tosho.count_absence_business_days(uuid, date, date) from anon;
grant execute on function tosho.count_absence_business_days(uuid, date, date) to authenticated, service_role;

-- =====================================================================
-- 1. Insert самому за себе
--
--    Політики permissive і OR-яться з team_absences_insert (owner/SEO),
--    тож адміни своїх прав не втрачають.
--
--    ЧОМУ ЛІКАРНЯНИЙ ОБМЕЖЕНИЙ ЗАДНІМ ЧИСЛОМ: відсутність зменшує норму
--    дизайнера, а менша норма означає БІЛЬШИЙ бонус за перевиконання. Без
--    межі дизайнер міг би наприкінці місяця «захворіти» минулими днями і
--    підняти собі виплату. Сім днів покривають реальний сценарій «вніс, коли
--    очуняв», але не дають переписати закритий місяць. Owner/SEO лишаються
--    без обмеження — їхній запис і так проходить через окрему політику.
-- =====================================================================
drop policy if exists "team_absences_insert_self" on tosho.team_absences;
create policy "team_absences_insert_self"
on tosho.team_absences
for insert
to authenticated
with check (
  team_absences.user_id = auth.uid()
  and team_absences.requested_by = auth.uid()
  and exists (
    select 1
    from tosho.memberships_view mv
    where mv.workspace_id = team_absences.workspace_id
      and mv.user_id = auth.uid()
  )
  and (
    -- Заявка на погодженні норму не чіпає, але без меж у планер лізе
    -- «відпустка 2026–2030». Рік уперед і місяць назад покривають усе живе.
    (
      team_absences.kind in ('vacation', 'day_off')
      and team_absences.status = 'pending'
      and team_absences.start_date >= tosho.absence_today() - 31
      and team_absences.end_date <= tosho.absence_today() + 366
    )
    or (
      team_absences.kind = 'sick_leave'
      and team_absences.status = 'approved'
      -- Обидва кінці діапазону, а не лише початок. Обмежити тільки початок
      -- мало: «хворію з сьогодні до кінця наступного місяця» так само
      -- обнуляє норму — просто вперед, а не назад. Довший лікарняний вносить
      -- керівництво (окрема політика, без обмежень).
      and team_absences.start_date >= tosho.absence_today() - 7
      and team_absences.end_date <= tosho.absence_today() + 14
      and team_absences.end_date - team_absences.start_date <= 14
    )
  )
);

-- =====================================================================
-- 2. Скасування власної заявки
--
--    USING бере лише свої pending-рядки, WITH CHECK дозволяє записати лише
--    'cancelled'. Але політика бачить NEW-рядок цілком і не може порівняти
--    його зі старим, тож «скасувати, заодно посунувши дати» вона не спіймає —
--    для цього нижче стоїть тригер-гард.
-- =====================================================================
drop policy if exists "team_absences_cancel_own" on tosho.team_absences;
create policy "team_absences_cancel_own"
on tosho.team_absences
for update
to authenticated
using (
  team_absences.user_id = auth.uid()
  and team_absences.status = 'pending'
)
with check (
  team_absences.user_id = auth.uid()
  and team_absences.status = 'cancelled'
);

-- =====================================================================
-- 3. Тригер-гард: не-адмін може змінити ЛИШЕ статус pending → cancelled
--
--    RLS не вміє порівнювати OLD і NEW, тому цілісність решти полів тримає
--    тригер. Без нього «скасування» було б універсальним редактором: можна
--    було б підмінити дати чи тип у момент cancel.
-- =====================================================================
create or replace function tosho.guard_team_absence_self_update()
returns trigger
language plpgsql
security definer
set search_path to 'tosho', 'public'
as $$
declare
  v_is_admin boolean := false;
begin
  -- Серверний шлях (service role у netlify-функції) і внутрішні задачі
  -- гардом не обмежуємо: там авторизація вже відпрацювала у коді функції.
  if auth.uid() is null then
    return new;
  end if;

  select (
      lower(coalesce(mv.access_role::text, '')) = 'owner'
      or lower(coalesce(mv.job_role::text, '')) = 'seo'
    )
    into v_is_admin
  from tosho.memberships_view mv
  where mv.user_id = auth.uid()
    and mv.workspace_id = old.workspace_id
  limit 1;

  if coalesce(v_is_admin, false) then
    return new;
  end if;

  if old.status <> 'pending' or new.status <> 'cancelled' then
    raise exception 'Свою заявку можна лише скасувати, поки вона на погодженні'
      using errcode = '42501';
  end if;

  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.workspace_id is distinct from old.workspace_id
     or new.comment is distinct from old.comment
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at
     or new.start_date is distinct from old.start_date
     or new.end_date is distinct from old.end_date
     or new.kind is distinct from old.kind
     or new.decided_by is distinct from old.decided_by
     or new.decided_at is distinct from old.decided_at
     or new.decision_comment is distinct from old.decision_comment
     or new.requested_by is distinct from old.requested_by then
    raise exception 'Під час скасування можна змінити лише статус'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists team_absences_guard_self_update on tosho.team_absences;
create trigger team_absences_guard_self_update
before update on tosho.team_absences
for each row execute function tosho.guard_team_absence_self_update();


-- =====================================================================
-- 3b. Гард річної квоти на самостійний лікарняний
--
--     Політика обмежує ОДИН запис (не глибше 7 днів назад, не далі 14 вперед,
--     не довше 14 днів). Але записи можна котити: щодня додавати новий на два
--     тижні вперед і так закрити місяць. Тому річна квота теж має бути
--     стіною, а не лише цифрою на картці.
--
--     Понад квоту лікарняний вносить керівництво — там і рішення, і аудит.
-- =====================================================================
create or replace function tosho.guard_team_absence_self_insert()
returns trigger
language plpgsql
security definer
set search_path to 'tosho', 'public'
as $$
declare
  v_is_admin boolean := false;
  v_quota    int;
  v_used     int;
  v_adding   int;
  v_year     int := extract(year from new.start_date)::int;
begin
  if auth.uid() is null then
    return new;
  end if;

  select (
      lower(coalesce(mv.access_role::text, '')) = 'owner'
      or lower(coalesce(mv.job_role::text, '')) = 'seo'
    )
    into v_is_admin
  from tosho.memberships_view mv
  where mv.user_id = auth.uid()
    and mv.workspace_id = new.workspace_id
  limit 1;

  if coalesce(v_is_admin, false) then
    return new;
  end if;

  -- Квоту стережемо лише там, де запис одразу стає чинним без людини в циклі.
  -- Відпустка й day-off ідуть через погодження, там ліміт бачить approver.
  if new.kind <> 'sick_leave' or new.status <> 'approved' then
    return new;
  end if;

  -- Без блокування квота ловить лише послідовні вставки: два паралельні
  -- запити читають однакове «використано» і обидва проходять. Лок на пару
  -- (воркспейс, людина) серіалізує саме тих, хто конкурує за одну квоту.
  perform pg_advisory_xact_lock(
    hashtextextended(new.workspace_id::text || ':' || new.user_id::text, 0)
  );

  select coalesce(q.sick_days, 10)
    into v_quota
  from (select 1) dummy
  left join tosho.team_absence_quotas q
    on q.workspace_id = new.workspace_id
   and q.user_id = new.user_id
   and q.year = v_year;

  -- Рахуємо УНІКАЛЬНІ робочі дні «наявні + новий» — так само, як
  -- team_absence_balances. Інакше два записи, що перетинаються, рахувались
  -- би двічі, і картка показувала б одне, а тригер відмовляв за іншим.
  with spent as (
    select distinct d::date as day
    from tosho.team_absences a
    cross join lateral generate_series(
      greatest(a.start_date, make_date(v_year, 1, 1)),
      least(a.end_date, make_date(v_year, 12, 31)),
      interval '1 day'
    ) as d
    where a.workspace_id = new.workspace_id
      and a.user_id = new.user_id
      and a.kind = 'sick_leave'
      and a.status = 'approved'
      and a.id is distinct from new.id
      and a.start_date <= make_date(v_year, 12, 31)
      and a.end_date >= make_date(v_year, 1, 1)
    union
    select distinct d::date
    from generate_series(
      greatest(new.start_date, make_date(v_year, 1, 1)),
      least(new.end_date, make_date(v_year, 12, 31)),
      interval '1 day'
    ) as d
  )
  select count(*)
    into v_used
  from spent s
  left join tosho.ua_workday_exceptions ex
    on ex.workspace_id = new.workspace_id
   and ex.day = s.day
  where coalesce(ex.is_workday, extract(isodow from s.day) between 1 and 5);

  v_adding := 0; -- v_used уже враховує новий запис

  if v_used > coalesce(v_quota, 10) then
    raise exception 'Лікарняних на рік лишилось % — довший вносить керівництво',
      greatest(0, coalesce(v_quota, 10) - (v_used - tosho.count_absence_business_days(
        new.workspace_id,
        greatest(new.start_date, make_date(v_year, 1, 1)),
        least(new.end_date, make_date(v_year, 12, 31))
      )))
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists team_absences_guard_self_insert on tosho.team_absences;
create trigger team_absences_guard_self_insert
before insert on tosho.team_absences
for each row execute function tosho.guard_team_absence_self_insert();

-- =====================================================================
-- 4. Приватність причини відмови
--
--    Політика team_absences_select віддає ВСІ рядки будь-якому учаснику
--    воркспейсу — це свідомо, бо «хто коли відсутній» потрібно всім. Але
--    коментар до рішення («відмовив, бо ти вже брав три тижні») такої
--    публічності не витримує. Колонку прибираємо з табличного select узагалі
--    й віддаємо окремим RPC: свою причину бачить заявник, усі — owner/SEO.
--
--    ЧОМУ НЕ ПРОСТО `revoke select (decision_comment)`: у Postgres колонковий
--    revoke не віднімає нічого від ТАБЛИЧНОГО grant — привілеї підсумовуються.
--    Поки діє `grant select on tosho.team_absences`, колонка читається попри
--    revoke (перевірено: читалась). Єдиний робочий спосіб — зняти табличний
--    select і видати його поколонково.
--
--    Список колонок будуємо динамічно, тож повторний запуск цього скрипта
--    підхопить нові колонки сам. ГОЧА: після додавання колонки в
--    team_absences (або повторного запуску scripts/team-absences.sql, який
--    видає табличний grant) цей скрипт треба перезапустити.
-- =====================================================================
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into v_columns
  from information_schema.columns
  where table_schema = 'tosho'
    and table_name = 'team_absences'
    and column_name <> 'decision_comment';

  execute 'revoke select on tosho.team_absences from authenticated';
  execute format('grant select (%s) on tosho.team_absences to authenticated', v_columns);
end
$$;

create or replace function tosho.team_absence_decisions(p_year int)
returns table (
  absence_id       uuid,
  decision_comment text
)
language plpgsql
stable
security definer
set search_path to 'tosho', 'public'
as $$
declare
  v_workspace uuid;
  v_is_admin  boolean := false;
begin
  select mv.workspace_id,
         (
           lower(coalesce(mv.access_role::text, '')) = 'owner'
           or lower(coalesce(mv.job_role::text, '')) = 'seo'
         )
    into v_workspace, v_is_admin
  from tosho.memberships_view mv
  where mv.user_id = auth.uid()
  order by mv.created_at asc, mv.workspace_id asc
  limit 1;

  if v_workspace is null then
    return;
  end if;

  return query
  select a.id, a.decision_comment
  from tosho.team_absences a
  where a.workspace_id = v_workspace
    and a.decision_comment is not null
    and a.start_date < make_date(p_year + 1, 1, 1)
    and a.end_date >= make_date(p_year, 1, 1)
    and (v_is_admin or a.user_id = auth.uid());
end;
$$;

comment on function tosho.team_absence_decisions(int) is
  'Причини рішень по відсутностях. Заявник бачить лише свої, owner/SEO — усі. Колонку decision_comment у табличному select відкликано.';

revoke all on function tosho.team_absence_decisions(int) from public;
revoke all on function tosho.team_absence_decisions(int) from anon;
grant execute on function tosho.team_absence_decisions(int) to authenticated;
grant execute on function tosho.team_absence_decisions(int) to service_role;

notify pgrst, 'reload schema';

commit;
